(() => {
  'use strict';

  const reserved = new Set([
    'accounts', 'about', 'api', 'challenge', 'developer', 'developers', 'direct',
    'directory', 'emails', 'explore', 'legal', 'oauth', 'p', 'privacy', 'push',
    'reel', 'reels', 'session', 'stories', 'terms', 'web', 'your_activity',
  ]);

  function profileName(pathname) {
    const path = pathname.split(/[?#]/, 1)[0];
    const match = /^\/([A-Za-z0-9_.]{1,30})\/?$/.exec(path);
    return match && !reserved.has(match[1].toLowerCase()) ? match[1] : null;
  }

  function postType(href, base = 'https://www.instagram.com/') {
    try {
      const url = new URL(href, base);
      if (url.protocol !== 'https:' || !['www.instagram.com', 'instagram.com'].includes(url.hostname)) return null;
      const match = /^\/(?:[A-Za-z0-9_.]{1,30}\/)?(p|reel|reels)\/[A-Za-z0-9_-]+\/?$/.exec(url.pathname);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  function classifyTile(anchor) {
    const type = postType(anchor.getAttribute('href'), anchor.ownerDocument.URL);
    if (!type) return 'unknown';
    if (type !== 'p') return 'video';
    // Only read media badges, never captions or thumbnail alt text.
    const labels = Array.from(anchor.querySelectorAll('svg[aria-label]'),
      icon => icon.getAttribute('aria-label').trim().toLowerCase());
    if (labels.includes('carousel')) return 'carousel';
    if (labels.some(label => ['clip', 'reel', 'reels', 'video'].includes(label)) || anchor.querySelector('video')) return 'video';
    return anchor.querySelector('img') ? 'image' : 'unknown';
  }

  globalThis.InstagramStaticFilter = { profileName, postType, classifyTile };
})();
