(() => {
  'use strict';
  const api = globalThis.InstagramStaticFilter;
  const attributes = ['data-isf-grid', 'data-isf-row', 'data-isf-cell', 'data-isf-hidden'];
  const modes = ['posts-and-carousels', 'posts', 'carousels'];
  const gridStyles = new WeakMap();

  function restore(document) {
    for (const grid of document.querySelectorAll('[data-isf-grid]')) {
      const previous = gridStyles.get(grid);
      if (!previous) continue;
      if (grid.getAttribute('style') === previous.applied) {
        if (previous.text === null) grid.removeAttribute('style');
        else grid.setAttribute('style', previous.text);
      } else {
        for (const [name, value, priority] of [
          ['--isf-columns', previous.value, previous.priority],
          ['--isf-grid-height', previous.height, previous.heightPriority],
        ]) {
          if (value) grid.style.setProperty(name, value, priority);
          else grid.style.removeProperty(name);
        }
      }
      gridStyles.delete(grid);
    }
    for (const attr of attributes) {
      for (const node of document.querySelectorAll(`[${attr}]`)) node.removeAttribute(attr);
    }
  }

  function discover(document) {
    if (!api.profileName(document.location.pathname)) return { state: 'inactive' };
    const main = document.querySelector('main');
    const tabs = main?.querySelector('[role="tablist"]');
    if (!tabs) return { state: 'waiting' };
    const anchors = Array.from(main.querySelectorAll('a[href]')).filter(a =>
      api.postType(a.getAttribute('href'), document.URL) && !a.closest('[role="dialog"], dialog'));
    if (!anchors.length) return { state: 'waiting', mount: tabs };
    const roots = new Set(anchors.map(a => a.parentElement?.parentElement?.parentElement));
    const view = document.defaultView;
    for (const grid of roots) {
      if (!grid || !main.contains(grid) || grid.contains(tabs)) continue;
      const rows = Array.from(grid.children);
      const style = view.getComputedStyle(grid);
      if (style.display !== 'flex' || style.flexDirection !== 'column' ||
          parseFloat(style.paddingTop) > 0 || parseFloat(style.paddingBottom) > 0) continue;
      const cells = [];
      const valid = rows.length > 0 && rows.every(row => {
        const rowStyle = view.getComputedStyle(row);
        if (rowStyle.display !== 'flex' || rowStyle.flexDirection === 'column' ||
            rowStyle.position === 'absolute' || row.children.length < 1) return false;
        return Array.from(row.children).every(cell => {
          const a = cell.firstElementChild;
          if (cell.children.length !== 1 || a?.tagName !== 'A' ||
              !api.postType(a.getAttribute('href'), document.URL) || a.closest('[role="dialog"], dialog')) return false;
          cells.push({ cell, anchor: a });
          return true;
        });
      });
      // Partial matching must never filter one part of an unrecognized layout.
      if (valid && cells.length === anchors.filter(a => grid.contains(a)).length) {
        const columns = rows.reduce((max, row) => Math.max(max, row.children.length), 0);
        return { state: 'ready', grid, rows, cells, columns, mount: grid };
      }
    }
    return { state: 'unsupported', mount: tabs };
  }

  function refresh(document, enabled, mode = 'posts-and-carousels') {
    restore(document);
    const layout = discover(document);
    if (layout.state !== 'ready') return layout;
    if (!modes.includes(mode)) mode = 'posts-and-carousels';
    let hidden = 0;
    let unknown = 0;
    const sourceRowHeight = layout.cells.reduce((height, { cell }) =>
      Math.max(height, cell.getBoundingClientRect().height), 0);
    for (const { cell, anchor } of layout.cells) {
      const type = api.classifyTile(anchor);
      if (type === 'unknown') unknown++;
      if (enabled) {
        cell.setAttribute('data-isf-cell', '');
        if (type === 'video' || (type === 'carousel' && mode === 'posts') ||
            (type === 'image' && mode === 'carousels')) {
          cell.setAttribute('data-isf-hidden', '');
          hidden++;
        }
      }
    }
    if (enabled) {
      const previous = {
        text: layout.grid.getAttribute('style'),
        value: layout.grid.style.getPropertyValue('--isf-columns'),
        priority: layout.grid.style.getPropertyPriority('--isf-columns'),
        height: layout.grid.style.getPropertyValue('--isf-grid-height'),
        heightPriority: layout.grid.style.getPropertyPriority('--isf-grid-height'),
      };
      layout.grid.style.setProperty('--isf-columns', String(layout.columns));
      layout.grid.setAttribute('data-isf-grid', '');
      layout.rows.forEach(row => row.setAttribute('data-isf-row', ''));
      const compactHeight = layout.grid.getBoundingClientRect().height;
      const scrollRunway = sourceRowHeight || Math.min(document.defaultView.innerHeight * 0.35, 480);
      const minimumHeight = compactHeight + scrollRunway;
      if (minimumHeight > 0) layout.grid.style.setProperty('--isf-grid-height', `${minimumHeight}px`);
      previous.applied = layout.grid.getAttribute('style');
      gridStyles.set(layout.grid, previous);
    }
    return { ...layout, hidden, kept: layout.cells.length - hidden, unknown };
  }

  const sessions = new WeakMap();

  function start(window, storage) {
    if (sessions.has(window)) return sessions.get(window);
    const { document } = window;
    let enabled = false;
    let stopped = false;
    let revision = 0;
    let mode = 'posts-and-carousels';
    let notice = '';
    let timer = null;
    let pathname = window.location.pathname;
    let saved = Promise.resolve();
    const host = document.createElement('div');
    host.setAttribute('data-isf-control', '');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Static only';
    button.setAttribute('data-isf-toggle', '');
    const fieldset = document.createElement('fieldset');
    fieldset.setAttribute('data-isf-modes', '');
    fieldset.setAttribute('aria-label', 'Choose which static posts to show');
    const legend = document.createElement('legend');
    legend.textContent = 'Show';
    fieldset.append(legend);
    for (const [value, label] of [
      ['posts-and-carousels', 'Posts + Carousels'],
      ['posts', 'Just Posts'],
      ['carousels', 'Just Carousels'],
    ]) {
      const option = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'static-mode';
      input.value = value;
      option.append(input, document.createTextNode(label));
      fieldset.append(option);
      input.addEventListener('change', () => {
        if (!input.checked || mode === input.value) return;
        mode = input.value;
        revision++;
        notice = '';
        render();
        savePreference();
      });
    }
    const status = document.createElement('span');
    status.setAttribute('data-isf-status', '');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    host.append(button, fieldset, status);

    const observer = new window.MutationObserver(() => schedule());
    const observation = {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['href', 'aria-label', 'src', 'class', 'style'],
    };

    function render() {
      if (stopped) return;
      observer.disconnect();
      try {
        const result = refresh(document, enabled, mode);
        if (result.state === 'inactive' || !result.mount) {
          host.remove();
          return;
        }
        if (result.mount === result.grid) {
          if (result.grid.previousElementSibling !== host) result.grid.before(host);
        } else if (result.mount.nextElementSibling !== host) {
          result.mount.after(host);
        }
        button.setAttribute('aria-pressed', String(enabled));
        for (const input of fieldset.querySelectorAll('input')) input.checked = input.value === mode;
        let message;
        if (result.state === 'unsupported') message = 'This grid layout is not supported. All posts remain visible.';
        else if (result.state === 'waiting') message = 'Waiting for posts. Scroll to load more.';
        else if (!enabled) message = 'Showing all posts';
        else message = `${result.kept} shown · ${result.hidden} hidden` +
          (result.unknown ? ` · ${result.unknown} unclassified kept` : '') +
          (result.kept === 0 ? ' · Scroll to load more, or turn off to continue loading.' : '');
        status.textContent = message + (notice ? ` · ${notice}` : '');
      } finally {
        if (!stopped) observer.observe(document.documentElement, observation);
      }
    }

    function schedule() {
      if (stopped || timer !== null) return;
      timer = window.setTimeout(() => { timer = null; render(); }, 40);
    }

    function savePreference() {
      const value = { staticOnly: enabled, staticMode: mode };
      saved = saved.then(() => storage.set(value)).catch(() => {
        notice = 'Preference could not be saved';
        render();
      });
    }

    button.addEventListener('click', () => {
      enabled = !enabled;
      revision++;
      notice = '';
      render();
      savePreference();
    });

    function routeChanged() {
      pathname = window.location.pathname;
      schedule();
    }
    window.addEventListener('popstate', routeChanged);
    window.addEventListener('pageshow', routeChanged);
    window.addEventListener('resize', schedule);
    // pushState emits no event. Check only the pathname; do no DOM work if unchanged.
    const routeTimer = window.setInterval(() => {
      if (pathname !== window.location.pathname) routeChanged();
    }, 500);

    const controller = {
      get saved() { return saved; },
      stop() {
        stopped = true;
        observer.disconnect();
        window.clearTimeout(timer);
        window.clearInterval(routeTimer);
        window.removeEventListener('popstate', routeChanged);
        window.removeEventListener('pageshow', routeChanged);
        window.removeEventListener('resize', schedule);
        host.remove();
        restore(document);
        sessions.delete(window);
      },
    };
    sessions.set(window, controller);
    render();
    controller.ready = (async () => {
      const initialRevision = revision;
      try {
        const settings = await storage.get({ staticOnly: false, staticMode: 'posts-and-carousels' });
        if (!stopped && revision === initialRevision) {
          enabled = settings.staticOnly === true;
          mode = modes.includes(settings.staticMode) ? settings.staticMode : 'posts-and-carousels';
        }
      } catch {
        notice = 'Preference unavailable; changes apply to this tab';
      }
      render();
    })();
    return controller;
  }

  Object.assign(api, { refresh, start });
})();
