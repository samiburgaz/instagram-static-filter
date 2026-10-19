const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture, tile } = require('./helpers.cjs');

for (const columns of [3, 4, 6]) {
  test(`filters a native ${columns}-column grid and restores its original styling`, () => {
    const { dom, document, grid, api } = fixture('/studio/', columns);
    const before = grid.outerHTML;
    const result = api.refresh(document, true);
    assert.equal(result.state, 'ready');
    assert.equal(result.hidden, 2);
    assert.equal(grid.style.getPropertyValue('--isf-columns'), String(columns));
    api.refresh(document, false);
    assert.equal(grid.outerHTML, before);
    dom.window.close();
  });
}

test('preserves an existing value and priority for the extension column variable', () => {
  const { dom, document, grid, api } = fixture('/studio/', 4);
  grid.style.setProperty('--isf-columns', '9', 'important');
  const before = grid.outerHTML;
  api.refresh(document, true);
  assert.equal(grid.style.getPropertyValue('--isf-columns'), '4');
  api.refresh(document, false);
  assert.equal(grid.outerHTML, before);
  dom.window.close();
});

test('keeps one source row of scroll runway instead of retaining the whole unfiltered height', () => {
  const { dom, document, grid, api } = fixture();
  grid.getBoundingClientRect = () => ({ height: grid.hasAttribute('data-isf-grid') ? 600 : 2468 });
  for (const cell of grid.querySelectorAll(':scope > div > div')) {
    cell.getBoundingClientRect = () => ({ height: 388 });
  }
  const before = grid.outerHTML;
  const result = api.refresh(document, true, 'carousels');
  assert.equal(result.kept, 2);
  assert.equal(grid.style.getPropertyValue('--isf-grid-height'), '988px');
  assert.ok(988 < 2468, 'the filter must leave most removed rows collapsed');
  api.refresh(document, false);
  assert.equal(grid.outerHTML, before);
  dom.window.close();
});

test('filters only videos and marks rows for cross-row compaction without reparenting', () => {
  const { dom, document, grid, api, anchors } = fixture();
  const parents = anchors.map(a => a.parentElement);
  const sentinel = document.querySelector('#sentinel');
  const result = api.refresh?.(document, true);
  assert.equal(result?.state, 'ready');
  assert.equal(result.hidden, 2);
  assert.equal(result.kept, 4);
  assert.equal(result.unknown, 1);
  assert.equal(grid.hasAttribute('data-isf-grid'), true);
  assert.equal(grid.querySelectorAll('[data-isf-row]').length, 2);
  assert.deepEqual(anchors.map(a => a.parentElement.hasAttribute('data-isf-hidden')), [true, false, false, true, false, false]);
  assert.deepEqual(Array.from(grid.querySelectorAll('a')), anchors);
  assert.deepEqual(anchors.map(a => a.parentElement), parents);
  assert.equal(sentinel.previousElementSibling, grid);
  dom.window.close();
});

for (const [mode, expectedKept, expectedHidden, expectedKinds] of [
  ['posts-and-carousels', 4, 2, ['image', 'carousel', 'unknown', 'image']],
  ['posts', 3, 3, ['image', 'unknown', 'image']],
  ['carousels', 2, 4, ['carousel', 'unknown']],
]) {
  test(`the ${mode} filter shows the selected content types and retains unknowns`, () => {
    const { dom, document, api } = fixture();
    const result = api.refresh(document, true, mode);
    assert.equal(result.kept, expectedKept);
    assert.equal(result.hidden, expectedHidden);
    assert.deepEqual(Array.from(document.querySelectorAll('[data-isf-cell]:not([data-isf-hidden]) a'))
      .map(anchor => api.classifyTile(anchor)), expectedKinds);
    assert.equal(result.unknown, 1);
    dom.window.close();
  });
}

test('turning off restores exact original markup', () => {
  const { dom, document, grid, api } = fixture();
  const before = grid.outerHTML;
  api.refresh?.(document, true);
  assert.equal(grid.hasAttribute('data-isf-grid'), true);
  api.refresh(document, false);
  assert.equal(grid.outerHTML, before);
  dom.window.close();
});

test('does not hide Reel links inside a post dialog or unrelated section', () => {
  const { dom, document, api } = fixture();
  const aside = document.createElement('aside');
  aside.append(tile(document, '/reel/OUTSIDE/'));
  const dialog = document.createElement('div');
  dialog.setAttribute('role', 'dialog');
  dialog.append(tile(document, '/reel/DIALOG/'));
  document.querySelector('main').append(aside, dialog);
  assert.equal(api.refresh?.(document, true)?.hidden, 2);
  assert.equal(aside.querySelector('[data-isf-hidden]'), null);
  assert.equal(dialog.querySelector('[data-isf-hidden]'), null);
  dom.window.close();
});

for (const path of ['/', '/studio/reels/', '/studio/tagged/', '/p/OPEN/', '/direct/inbox/']) {
  test(`does not filter ${path}`, () => {
    const { dom, document, grid, api } = fixture(path);
    assert.equal(api.refresh?.(document, true)?.state, 'inactive');
    assert.equal(grid.querySelector('[data-isf-hidden]'), null);
    dom.window.close();
  });
}

test('unsupported layout is left intact instead of hiding the wrong container', () => {
  const { dom, document, grid, api } = fixture();
  grid.firstElementChild.append(document.createElement('button'));
  const before = grid.outerHTML;
  assert.equal(api.refresh?.(document, true)?.state, 'unsupported');
  assert.equal(grid.outerHTML, before);
  dom.window.close();
});

test('recycled tiles are reclassified instead of staying hidden', () => {
  const { dom, document, grid, api, anchors } = fixture();
  assert.equal(api.refresh?.(document, true)?.hidden, 2);
  anchors[0].href = '/studio/p/RECYCLED/';
  anchors[0].querySelector('svg').remove();
  anchors[1].append(tile(document, '/reel/IGNORED/').querySelector('img'));
  assert.equal(api.refresh(document, true).hidden, 1);
  assert.equal(grid.firstElementChild.firstElementChild.hasAttribute('data-isf-hidden'), false);
  dom.window.close();
});

test('virtualized grids are left untouched', () => {
  const { dom, document, grid, api } = fixture();
  grid.style.paddingTop = '1000px';
  assert.equal(api.refresh?.(document, true)?.state, 'unsupported');
  assert.equal(grid.hasAttribute('data-isf-grid'), false);
  dom.window.close();
});

test('video-only grids keep the loading sentinel outside the collapsed grid', () => {
  const { dom, document, grid, api, anchors } = fixture();
  anchors.forEach((a, i) => { a.href = `/studio/reel/ONLY${i}/`; });
  const result = api.refresh(document, true);
  assert.equal(result.kept, 0);
  assert.equal(result.hidden, 6);
  assert.equal(document.querySelector('#sentinel').previousElementSibling, grid);
  assert.equal(document.querySelector('#sentinel').closest('[data-isf-hidden]'), null);
  dom.window.close();
});
