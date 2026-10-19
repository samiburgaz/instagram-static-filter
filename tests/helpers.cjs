const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const extension = path.join(__dirname, '..', 'extension');

function load(window, name) {
  const file = path.join(extension, name);
  // Missing implementation produces assertion failures, not module-loader errors.
  if (fs.existsSync(file)) window.eval(fs.readFileSync(file, 'utf8'));
  return window.InstagramStaticFilter || {};
}

function page(body = '', pathname = '/studio/') {
  return new JSDOM(body, {
    url: `https://www.instagram.com${pathname}`,
    runScripts: 'outside-only', pretendToBeVisual: true,
  });
}

function tile(document, href, label = '', media = 'img') {
  const a = document.createElement('a');
  a.href = href;
  a.innerHTML = `<${media} alt="Client design"></${media}>`;
  if (label) {
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('aria-label', label);
    a.append(icon);
  }
  return a;
}

function fixture(pathname = '/studio/', columns = 3) {
  const dom = page(`<main><header>Studio</header><div role="tablist"><a href="/studio/">Posts</a><a href="/studio/reels/">Reels</a></div><section id="posts"><div id="grid" style="display:flex;flex-direction:column"></div><div id="sentinel" role="progressbar"></div></section></main>`, pathname);
  const { document } = dom.window;
  const grid = document.querySelector('#grid');
  const entries = [
    ['/studio/reel/R1/', 'Clip', 'img'], ['/studio/p/I1/', '', 'img'], ['/studio/p/C1/', 'Carousel', 'img'],
    ['/studio/p/V1/', 'Video', 'img'], ['/studio/p/U1/', '', 'span'], ['/studio/p/I2/', 'Pinned post', 'img'],
  ];
  for (let i = 0; i < entries.length; i += columns) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:row;margin-bottom:1px';
    for (const args of entries.slice(i, i + columns)) {
      const cell = document.createElement('div');
      cell.style.flex = '1 0 0%';
      cell.append(tile(document, ...args));
      row.append(cell);
    }
    grid.append(row);
  }
  load(dom.window, 'classifier.js');
  const api = load(dom.window, 'content.js');
  return { dom, document, grid, api, anchors: Array.from(grid.querySelectorAll('a')) };
}

module.exports = { load, page, tile, fixture, extension };
