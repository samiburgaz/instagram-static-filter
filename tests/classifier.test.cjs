const { test } = require('node:test');
const assert = require('node:assert/strict');
const { page, load, tile } = require('./helpers.cjs');

// Catches route leakage into non-profile surfaces and rejects deceptive post URLs.
for (const [pathname, want] of [
  ['/studio/', 'studio'], ['/a.b_c42', 'a.b_c42'], ['/studio/?hl=en', 'studio'],
  ['/', null], ['/explore/', null], ['/reels/', null], ['/direct/', null],
  ['/accounts/', null], ['/stories/', null], ['/p/abc/', null], ['/reel/abc/', null],
  ['/studio/reels/', null], ['/studio/tagged/', null], ['/studio/p/abc/', null],
]) {
  test(`profile route ${pathname} -> ${want}`, () => {
    const dom = page();
    const api = load(dom.window, 'classifier.js');
    assert.equal(api.profileName?.(pathname), want);
    dom.window.close();
  });
}

for (const [name, href, label, media, want] of [
  ['image post', '/p/ABC_123/', '', 'img', 'image'],
  ['profile image post', '/studio/p/ABC-123/', '', 'img', 'image'],
  ['Reel', '/reel/ABC/', '', 'img', 'video'],
  ['profile Reel', '/studio/reel/ABC/', '', 'img', 'video'],
  ['old video', '/p/ABC/', 'Video', 'img', 'video'],
  ['Clip indicator', '/p/ABC/', 'Clip', 'img', 'video'],
  ['Reels indicator', '/p/ABC/', 'Reels', 'img', 'video'],
  ['video element', '/p/ABC/', '', 'video', 'video'],
  ['carousel', '/p/ABC/', 'Carousel', 'img', 'carousel'],
  ['mixed carousel', '/p/ABC/', 'Carousel', 'video', 'carousel'],
  ['no media yet', '/p/ABC/', '', 'span', 'unknown'],
  ['external URL', 'https://example.com/p/ABC/', '', 'img', 'unknown'],
  ['deceptive origin', 'https://www.instagram.com.example.com/reel/ABC/', '', 'img', 'unknown'],
  ['unexpected path', '/explore/p/ABC/extra', '', 'img', 'unknown'],
]) {
  test(`classifies ${name}`, () => {
    const dom = page();
    const api = load(dom.window, 'classifier.js');
    assert.equal(api.classifyTile?.(tile(dom.window.document, href, label, media)), want);
    dom.window.close();
  });
}

test('pin and caption text do not turn an image into a Reel', () => {
  const dom = page();
  const api = load(dom.window, 'classifier.js');
  const a = tile(dom.window.document, '/p/ABC/', 'Pinned post');
  a.querySelector('img').alt = 'New Reel! A video about our carousel designs';
  assert.equal(api.classifyTile?.(a), 'image');
  dom.window.close();
});
