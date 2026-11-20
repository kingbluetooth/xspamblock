// ==UserScript==
// @name         xspamblock
// @namespace    https://github.com/kingbluetooth/xspamblock
// @version      1.0.6
// @description  Hide posts, replies and profiles of X accounts on shared AI-reply blocklists.
// @author       kingbluetooth
// @license      MIT
// @homepageURL  https://github.com/kingbluetooth/xspamblock
// @icon         https://raw.githubusercontent.com/kingbluetooth/xspamblock/main/assets/icon.png
// @updateURL    https://raw.githubusercontent.com/kingbluetooth/xspamblock/main/xspamblock.user.js
// @downloadURL  https://raw.githubusercontent.com/kingbluetooth/xspamblock/main/xspamblock.user.js
// @supportURL   https://github.com/kingbluetooth/xspamblock
// @match        https://x.com/*
// @run-at       document-start
// @noframes
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      blockedforaireply.levels.io
// @connect      clankwall.vogel.dev
// ==/UserScript==

(() => {
  'use strict';

  // Plain-text lists: one handle per line, '#' starts a comment.
  const LISTS = [
    'https://blockedforaireply.levels.io/api/usernames.txt',
    'https://clankwall.vogel.dev/api/usernames.txt',
  ];
  const HANDLE = /^[A-Za-z0-9_]{1,15}$/;
  const PROFILE = /^\/([A-Za-z0-9_]{1,15})(?:\/|$)/;
  // First path segments that are X pages, never profiles.
  const ROUTES = new Set(['home', 'explore', 'notifications', 'messages', 'search', 'settings', 'compose',
    'i', 'bookmarks', 'lists', 'communities', 'premium', 'jobs', 'login', 'logout', 'signup', 'tos',
    'privacy', 'about', 'help', 'intent', 'share', 'hashtag', 'topics', 'account']);
  const CELL = '[data-testid="cellInnerDiv"]';
  const ITEMS = 'article[data-testid="tweet"], [data-testid="UserCell"]';

  // ── state ──────────────────────────────────────────────────────────────
  const mine = () => GM_getValue('mine', []);     // handles I flagged
  const allow = () => GM_getValue('allow', []);   // handles I un-hid; beats every list
  const cache = () => GM_getValue('cache', {});   // url → { names, etag }

  let names = new Set();

  function rebuild() {
    const c = cache();
    names = new Set([...LISTS.flatMap(u => c[u]?.names ?? []), ...mine()]);
    for (const h of allow()) names.delete(h);
    scan();
  }

  // ── fetching ───────────────────────────────────────────────────────────
  const parse = text =>
    text.split('\n')
      .map(l => l.replace(/#.*/, '').trim().replace(/^@/, '').toLowerCase())
      .filter(h => HANDLE.test(h));

  // GM_xmlhttpRequest, not fetch(): x.com's CSP blocks cross-origin fetches.
  const download = (url, etag) => new Promise(done => GM_xmlhttpRequest({
    url, timeout: 20e3, anonymous: true, headers: etag ? { 'If-None-Match': etag } : {},
    onload: done, onerror: () => done(null), ontimeout: () => done(null),
  }));

  // Runs on every page load. A 304 (unchanged) or any failure keeps the cached copy.
  async function refresh() {
    const c = cache();
    let changed = false;
    for (const url of LISTS) {
      try {
        const r = await download(url, c[url]?.etag);      // null when offline
        if (r?.status !== 200) continue;
        const n = parse(r.responseText);
        if (!n.length) continue;                          // an error page is not a list
        const etag = /^etag:\s*(.+)$/im.exec(r.responseHeaders || '')?.[1].trim();
        c[url] = { names: n, etag };
        changed = true;
      } catch { /* bad URL or odd response: keep the cached copy, try the next list */ }
    }
    if (changed) GM_setValue('cache', c);
    rebuild();
  }

  // ── hiding ─────────────────────────────────────────────────────────────
  const handleIn = (root, sel) => {
    for (const a of root.querySelectorAll(sel)) {
      const m = PROFILE.exec(a.getAttribute('href') || '');
      if (m) return m[1].toLowerCase();
    }
  };
  const listed = h => !!h && names.has(h);
  const authorOf = tweet => handleIn(tweet, '[data-testid="User-Name"] a');
  const pathHandle = () => {
    const h = PROFILE.exec(location.pathname)?.[1].toLowerCase();
    return ROUTES.has(h) ? undefined : h;
  };

  function scan() {
    for (const el of document.querySelectorAll(ITEMS)) {
      const hit = el.matches('article')
        ? listed(authorOf(el)) || listed(handleIn(el, '[data-testid="socialContext"] a')) // reposted by
        : listed(handleIn(el, 'a'));
      // Hide the whole timeline cell, unless it holds several items (e.g. "Who to follow").
      const cell = el.closest(CELL);
      const box = cell && cell.querySelectorAll(ITEMS).length === 1 ? cell : el;
      box.toggleAttribute('data-xsb', hit);
    }

    // A listed profile (or one of its post pages): replace the column with a note
    // (CSS text, so it shows even if the button below fails) and a "Show" button.
    const col = document.querySelector('[data-testid="primaryColumn"]');
    if (col) {
      const me = pathHandle();
      const btn = document.getElementById('xsb-show');
      if (listed(me)) {
        col.setAttribute('data-xsb-note', `@${me} is hidden by xspamblock.`);
        if (btn?.textContent !== `Show @${me}`) {
          btn?.remove();
          const b = Object.assign(document.createElement('button'), { id: 'xsb-show', textContent: `Show @${me}` });
          b.addEventListener('click', () => flip(me));
          col.append(b);
        }
      } else {
        col.removeAttribute('data-xsb-note');
        btn?.remove();
      }
    }
  }

  // Flip a handle between hidden and shown (via `allow`), and say which way it went.
  function flip(h) {
    const set = shown => {
      GM_setValue('allow', [...allow().filter(x => x !== h), ...(shown ? [h] : [])]);
      rebuild();
    };
    const shown = !allow().includes(h);
    set(shown);
    toast(`${listed(h) ? 'Hiding' : 'Showing'} @${h}`, 'Undo', () => set(!shown));
  }

  // ── flag from the ··· menu ─────────────────────────────────────────────
  // X renders its dropdown in a separate layer, so remember which post or
  // profile the last ··· click belonged to, then add an item when a menu opens.
  let target = null;

  document.addEventListener('click', e => {
    const btn = e.target.closest?.('[data-testid="caret"], [data-testid="userActions"]');
    if (!btn) return;
    const post = btn.closest('article[data-testid="tweet"]');
    // A post's ··· belongs to its author; the profile's ··· belongs to the profile in the URL.
    const handle = post ? authorOf(post) : btn.matches('[data-testid="userActions"]') ? pathHandle() : undefined;
    target = handle && { handle, at: Date.now() };
  }, true);

  function addMenuItem() {
    if (!target || Date.now() - target.at > 2000) return;
    const menu = document.querySelector('[role="menu"]:not([data-xsb-menu])');
    const proto = menu?.querySelector('[role="menuitem"]');
    if (!proto) return;
    const { handle } = target;
    target = null;
    menu.setAttribute('data-xsb-menu', '');

    const item = proto.cloneNode(true);          // copies X's own look, none of its handlers
    item.querySelectorAll('svg').forEach(s => s.remove());
    item.removeAttribute('data-testid');
    [item, ...item.querySelectorAll('[href]')].forEach(a => a.removeAttribute('href'));   // the copy must never be a link
    const label = [...item.querySelectorAll('span')].find(s => !s.firstElementChild && s.textContent.trim());
    if (!label) return;
    label.textContent = `Flag @${handle} as spam`;
    item.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      flag(handle);
      (document.activeElement || document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, true);
    proto.parentElement.appendChild(item);
  }

  function flag(handle) {
    GM_setValue('mine', [...new Set([...mine(), handle])]);
    GM_setValue('allow', allow().filter(h => h !== handle));
    rebuild();
    toast(`Hid @${handle}`, 'Undo', () => { GM_setValue('mine', mine().filter(h => h !== handle)); rebuild(); });
  }

  function toast(text, action, onAction) {
    document.getElementById('xsb-toast')?.remove();
    const t = Object.assign(document.createElement('div'), { id: 'xsb-toast', textContent: text });
    const b = Object.assign(document.createElement('button'), { textContent: action });
    b.addEventListener('click', () => { onAction(); t.remove(); });
    t.append(b);
    document.body.append(t);
    setTimeout(() => t.remove(), 6000);
  }

  // ── menu commands (the userscript manager's icon menu) ─────────────────
  GM_registerMenuCommand('Toggle hide for a handle…', () => {
    const h = (prompt('Handle to toggle between hidden and shown:') || '').trim().replace(/^@/, '').toLowerCase();
    if (HANDLE.test(h)) flip(h);
  });

  // ── go ─────────────────────────────────────────────────────────────────
  GM_addStyle(`
    [data-xsb]{display:none!important}
    [data-xsb-note]>:not(#xsb-show){display:none!important}
    [data-xsb-note]::before{content:attr(data-xsb-note);display:block;padding:32px 16px 16px;color:#71767b;font:15px/1.4 system-ui,sans-serif}
    #xsb-show{display:block;align-self:flex-start;margin:0 16px;padding:8px 16px;border:1px solid #1d9bf0;border-radius:9999px;background:none;color:#1d9bf0;font:700 14px system-ui,sans-serif;cursor:pointer}
    #xsb-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;padding:10px 16px;border-radius:8px;background:#1d9bf0;color:#fff;font:14px system-ui,sans-serif}
    #xsb-toast button{margin-left:12px;padding:0;border:0;background:none;color:inherit;font:inherit;font-weight:700;text-decoration:underline;cursor:pointer}
  `);

  // One scan per frame, before paint, so nothing flashes on screen.
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); addMenuItem(); });
  }).observe(document, { childList: true, subtree: true });   // `document`: documentElement may not exist yet

  rebuild();                       // instantly, from the cached lists
  refresh();                       // then check the lists for changes
})();
