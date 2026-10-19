const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, tile } = require('./helpers.cjs');
const settle = () => new Promise(resolve => setTimeout(resolve, 80));

function storage(initial = false, mode = 'posts-and-carousels') {
  let saved = { staticOnly: initial, staticMode: mode };
  return {
    get: async () => ({ ...saved }),
    set: async value => { saved = { ...saved, ...value }; },
  };
}

async function started(t, store = storage(), path) {
  const f = fixture(path);
  const controller = f.api.start?.(f.dom.window, store);
  t.after(() => { controller?.stop(); f.dom.window.close(); });
  await controller?.ready;
  return { ...f, controller, store };
}

test('default-off control enables filtering and saves preference', async t => {
  const { document, store, controller } = await started(t);
  const button = document.querySelector('button[data-isf-toggle]');
  assert.ok(button, 'Static only control should exist');
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  assert.equal(button.type, 'button');
  assert.equal(document.querySelector('[data-isf-grid]'), null);
  button.click();
  await controller.saved;
  assert.equal(button.getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
  assert.equal((await store.get()).staticOnly, true);
  button.click();
  assert.equal(document.querySelector('[data-isf-grid]'), null);
});

test('saved preference is applied on startup', async t => {
  const { document } = await started(t, storage(true));
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
  assert.equal(document.querySelector('[data-isf-toggle]')?.getAttribute('aria-pressed'), 'true');
});

test('three accessible filters apply immediately, persist, and retain the switch state', async t => {
  const { document, store, controller } = await started(t, storage(true));
  const filters = Array.from(document.querySelectorAll('input[name="static-mode"]'));
  assert.equal(filters.length, 3);
  assert.deepEqual(filters.map(input => input.value), ['posts-and-carousels', 'posts', 'carousels']);
  assert.equal(filters[0].checked, true);

  filters[1].click();
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 3);
  await controller.saved;
  assert.equal((await store.get()).staticMode, 'posts');
  assert.equal(document.querySelector('[data-isf-toggle]').getAttribute('aria-pressed'), 'true');

  filters[2].click();
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 4);
  await controller.saved;
  assert.equal((await store.get()).staticMode, 'carousels');

  document.querySelector('[data-isf-toggle]').click();
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 0);
  await controller.saved;
  filters[0].click();
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 0);
  assert.equal(filters[0].checked, true);
  assert.equal((await store.get()).staticOnly, false);
});

test('saved filter mode is restored while a legacy enabled setting defaults to both', async t => {
  const carouselOnly = await started(t, storage(true, 'carousels'));
  assert.equal(carouselOnly.document.querySelectorAll('[data-isf-hidden]').length, 4);
  assert.equal(carouselOnly.document.querySelector('input[name="static-mode"][value="carousels"]').checked, true);

  const legacy = await started(t, {
    get: async () => ({ staticOnly: true }),
    set: async () => {},
  });
  assert.equal(legacy.document.querySelectorAll('[data-isf-hidden]').length, 2);
  assert.equal(legacy.document.querySelector('input[name="static-mode"][value="posts-and-carousels"]').checked, true);
});

test('unrecognized saved modes safely fall back to Posts + Carousels', async t => {
  const { document } = await started(t, storage(true, 'other'));
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
  assert.equal(document.querySelector('input[name="static-mode"][value="posts-and-carousels"]').checked, true);
});

test('new rows and delayed video badges are filtered automatically', async t => {
  const { document, grid } = await started(t, storage(true));
  assert.ok(document.querySelector('[data-isf-toggle]'));
  const row = grid.firstElementChild.cloneNode(true);
  grid.append(row);
  await settle();
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 3);
  const image = grid.querySelector('a[href*="I1"]');
  image.append(tile(document, '/p/X/', 'Video').querySelector('svg'));
  await settle();
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 4);
});

test('leaving a profile restores grid and removes control; returning creates only one', async t => {
  const { dom, document } = await started(t, storage(true));
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
  dom.window.history.pushState({}, '', '/studio/reels/');
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  await settle();
  assert.equal(document.querySelector('[data-isf-grid]'), null);
  assert.equal(document.querySelector('[data-isf-toggle]'), null);
  dom.window.history.pushState({}, '', '/studio/');
  dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
  await settle();
  assert.equal(document.querySelectorAll('[data-isf-toggle]').length, 1);
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
});

test('replacement grids receive the existing control without duplicate initialization', async t => {
  const { dom, document, grid, api, controller } = await started(t, storage(true));
  assert.ok(controller);
  assert.equal(api.start(dom.window, storage()), controller);
  grid.replaceWith(grid.cloneNode(true));
  await settle();
  assert.equal(document.querySelectorAll('[data-isf-toggle]').length, 1);
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
});

test('failed storage reads default off and writes fail visibly without breaking filtering', async t => {
  const { document, controller } = await started(t, {
    get: async () => { throw Error('unavailable'); },
    set: async () => { throw Error('unavailable'); },
  });
  const button = document.querySelector('[data-isf-toggle]');
  assert.ok(button);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
  button.click();
  await controller.saved;
  assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
  assert.match(document.querySelector('[data-isf-status]').textContent, /could not be saved/i);
});

test('rapid toggles persist in order even when storage writes are asynchronous', async t => {
  let saved = false;
  const writes = [];
  const { document, controller } = await started(t, {
    get: async () => ({ staticOnly: saved }),
    set: value => new Promise(resolve => writes.push(() => { saved = value.staticOnly; resolve(); })),
  });
  const button = document.querySelector('[data-isf-toggle]');
  assert.ok(button);
  button.click();
  button.click();
  await Promise.resolve();
  assert.equal(writes.length, 1, 'writes must be serialized');
  writes.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(writes.length, 1);
  writes.shift()();
  await controller.saved;
  assert.equal(saved, false);
  assert.equal(button.getAttribute('aria-pressed'), 'false');
});

test('observer does not continually react to its own rendering', async t => {
  const { dom, document } = await started(t, storage(true));
  assert.ok(document.querySelector('[data-isf-toggle]'));
  let writes = 0;
  const observer = new dom.window.MutationObserver(records => { writes += records.length; });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  await settle();
  assert.equal(writes, 0);
  observer.disconnect();
});

test('unsupported layout has an explanation and no hidden tiles', async t => {
  const f = fixture();
  f.grid.firstElementChild.append(f.document.createElement('button'));
  const controller = f.api.start?.(f.dom.window, storage(true));
  t.after(() => { controller?.stop(); f.dom.window.close(); });
  await controller?.ready;
  assert.match(f.document.querySelector('[data-isf-status]')?.textContent || '', /not supported/i);
  assert.equal(f.document.querySelector('[data-isf-hidden]'), null);
});

test('a delayed preference read cannot undo a user toggle', async t => {
  const f = fixture();
  let finishRead;
  const controller = f.api.start(f.dom.window, {
    get: () => new Promise(resolve => { finishRead = resolve; }),
    set: async () => {},
  });
  t.after(() => { controller.stop(); f.dom.window.close(); });
  f.document.querySelector('[data-isf-toggle]').click();
  finishRead({ staticOnly: false });
  await controller.ready;
  assert.equal(f.document.querySelector('[data-isf-toggle]').getAttribute('aria-pressed'), 'true');
  assert.equal(f.document.querySelectorAll('[data-isf-hidden]').length, 2);
});

test('pushState without any DOM mutation still restores a non-profile page', async t => {
  const { dom, document } = await started(t, storage(true));
  dom.window.history.pushState({}, '', '/explore/');
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(document.querySelector('[data-isf-grid]'), null);
  assert.equal(document.querySelector('[data-isf-control]'), null);
});

test('resizing from three to six columns and back keeps filtering enabled', async t => {
  const { dom, document, grid } = await started(t, storage(true));
  const cells = Array.from(grid.querySelectorAll('a'), a => a.parentElement);
  function regroup(columns) {
    grid.replaceChildren();
    for (let i = 0; i < cells.length; i += columns) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:row';
      row.append(...cells.slice(i, i + columns));
      grid.append(row);
    }
    dom.window.dispatchEvent(new dom.window.Event('resize'));
  }
  for (const columns of [6, 3, 4, 3]) {
    regroup(columns);
    await settle();
    assert.equal(grid.style.getPropertyValue('--isf-columns'), String(columns));
    assert.equal(document.querySelectorAll('[data-isf-hidden]').length, 2);
    assert.equal(document.querySelector('[data-isf-toggle]').getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(document.querySelector('[data-isf-status]').textContent, /not supported/);
  }
});
