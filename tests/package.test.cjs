const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { page, fixture, load, extension } = require('./helpers.cjs');

test('manifest entry points start a functioning control and restore saved settings after reload', async t => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'manifest.json'), 'utf8'));
  const original = fixture();
  const html = original.document.body.innerHTML;
  original.dom.window.close();
  let saved = { staticOnly: false, staticMode: 'posts-and-carousels' };
  async function boot() {
    const dom = page(html);
    // Only the external Chrome storage boundary is substituted. Scripts and DOM are real.
    dom.window.chrome = { storage: { local: {
      get: async () => ({ ...saved }),
      set: async value => { saved = { ...saved, ...value }; },
    } } };
    for (const content of manifest.content_scripts) {
      for (const css of content.css || []) assert.ok(fs.readFileSync(path.join(extension, css), 'utf8').length);
      for (const script of content.js) load(dom.window, script);
    }
    const controller = dom.window.InstagramStaticFilter.start(dom.window, dom.window.chrome.storage.local);
    t.after(() => { controller.stop(); dom.window.close(); });
    await controller.ready;
    return { document: dom.window.document, controller };
  }
  const first = await boot();
  first.document.querySelector('[data-isf-toggle]').click();
  await first.controller.saved;
  assert.equal(first.document.querySelectorAll('[data-isf-hidden]').length, 2);
  first.document.querySelector('input[name="static-mode"][value="carousels"]').click();
  await first.controller.saved;
  assert.equal(first.document.querySelectorAll('[data-isf-hidden]').length, 4);
  const reloaded = await boot();
  assert.equal(reloaded.document.querySelectorAll('[data-isf-hidden]').length, 4);
  assert.equal(reloaded.document.querySelector('[data-isf-toggle]').getAttribute('aria-pressed'), 'true');
  assert.equal(reloaded.document.querySelector('input[name="static-mode"][value="carousels"]').checked, true);
});
