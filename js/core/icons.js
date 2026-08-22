/* FoodBang — icon set. 24x24 grid. Stroke icons inherit currentColor. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  // stroke paths
  var S = {
    home: 'M3 10.6 12 3l9 7.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    grocery: 'M4 7h16l-1.3 11.2a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8zM8.5 7a3.5 3.5 0 0 1 7 0M9.5 11v5M14.5 11v5',
    retail: 'M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM3 8l1.6-4h14.8L21 8M9 12h6',
    orders: 'M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM14 3v5h5M8.5 13h7M8.5 16.5h4.5',
    account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.2a7.7 7.7 0 0 1 15 0',
    search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
    back: 'M15.5 4.5 8 12l7.5 7.5',
    fwd: 'M8.5 4.5 16 12l-7.5 7.5',
    up: 'M4.5 15.5 12 8l7.5 7.5',
    down: 'M4.5 8.5 12 16l7.5-7.5',
    x: 'M6 6l12 12M18 6 6 18',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
    clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.2V12l3.2 2',
    pin: 'M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11ZM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
    cart: 'M3 4h2.2l2.3 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.55L21 8H6M10 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2ZM17.5 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
    bag: 'M5.5 8h13l-1 12.1a1 1 0 0 1-1 .9H7.5a1 1 0 0 1-1-.9zM9 8V6a3 3 0 0 1 6 0v2',
    filter: 'M4 6h16M7 12h10M10 18h4',
    sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M15 4.5v5M8 14.5v5',
    card: 'M3 6.5h18v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 10.5h18M6.5 15h3',
    tag: 'M11.5 3H20a1 1 0 0 1 1 1v8.5L12 21.5 2.5 12 11.5 3ZM16.6 8.2h.01',
    info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5M12 7.8h.01',
    alert: 'M12 3.5 22 20H2zM12 10v4M12 17.2h.01',
    bell: 'M18 8.5a6 6 0 1 0-12 0c0 5-2.5 6.5-2.5 6.5h17S18 13.5 18 8.5ZM13.7 19a2 2 0 0 1-3.4 0',
    moon: 'M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a7 7 0 0 0 10.8 10.8Z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1.8v2.4M12 19.8v2.4M4.2 12H1.8M22.2 12h-2.4M6.5 6.5 4.8 4.8M19.2 19.2l-1.7-1.7M17.5 6.5l1.7-1.7M4.8 19.2l1.7-1.7',
    trash: 'M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1l1-13.5M10 10.5v6M14 10.5v6',
    edit: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3ZM14.5 6.5l3 3',
    share: 'M12 3.5v12M8 7.5 12 3.5l4 4M5 13.5v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
    phone: 'M20.5 16.9v2.6a1.6 1.6 0 0 1-1.8 1.6 17.5 17.5 0 0 1-15.8-15.8A1.6 1.6 0 0 1 4.5 3.5h2.6a1.6 1.6 0 0 1 1.6 1.4 9.6 9.6 0 0 0 .6 2.4 1.6 1.6 0 0 1-.4 1.7L7.8 10.2a14 14 0 0 0 6 6l1.2-1.1a1.6 1.6 0 0 1 1.7-.4 9.6 9.6 0 0 0 2.4.6 1.6 1.6 0 0 1 1.4 1.6Z',
    receipt: 'M5 3.5h14v18l-2.3-1.6-2.4 1.6-2.3-1.6-2.4 1.6L7.3 20 5 21.5zM9 8.5h6M9 12.5h6',
    gift: 'M3.5 11.5h17V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1zM2.5 7.5h19v4h-19zM12 7.5v13.5M12 7.5S10.8 3 8.6 3a2.2 2.2 0 0 0 0 4.5H12ZM12 7.5s1.2-4.5 3.4-4.5a2.2 2.2 0 0 1 0 4.5H12Z',
    shield: 'M12 3 20 6v6c0 5-3.4 8-8 9.5C7.4 20 4 17 4 12V6ZM9 12.2l2 2 4-4',
    zap: 'M13.5 2.5 4.5 13.7h6.2l-1.2 7.8 9-11.2h-6.2z',
    flame: 'M12 21.5c3.6 0 6.2-2.4 6.2-5.8 0-4.4-4.6-5.7-3.6-11.2-3 1-6 4.4-6 8 0 1.4.5 2.4 1 3-1.3 0-2.4-1-2.8-2.3-.7 1.1-1 2.4-1 3.6 0 3.2 2.6 4.7 6.2 4.7Z',
    star: 'M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6L3.4 9.9l6-.9z',
    heart: 'M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.5 2.6c0 5.8-8.5 10.9-8.5 10.9Z',
    bike: 'M6 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 20a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM6 16.5h5l4-9M13 5h3.5l1.5 4M9 7.5h5',
    camera: 'M3 8.5A1.5 1.5 0 0 1 4.5 7h2.6l1.2-2h7.4l1.2 2h2.6A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5ZM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    truck: 'M2.5 6.5h11v10h-11zM13.5 10h4l3 3v3.5h-7zM7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM17.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    activity: 'M3 12.5h4l2.5-7 4 14 2.5-7h5',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20.2a7.7 7.7 0 0 1 15 0',
    settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4ZM19.4 15a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-2.5 1v.3a1.8 1.8 0 1 1-3.6 0v-.2a1.5 1.5 0 0 0-2.6-1l-.1.1A1.8 1.8 0 1 1 5.7 16.8l.1-.1a1.5 1.5 0 0 0-1-2.5h-.3a1.8 1.8 0 1 1 0-3.6h.2a1.5 1.5 0 0 0 1-2.6l-.1-.1A1.8 1.8 0 1 1 8.2 5.3l.1.1a1.5 1.5 0 0 0 1.7.3h.1a1.5 1.5 0 0 0 .9-1.4v-.3a1.8 1.8 0 1 1 3.6 0v.2a1.5 1.5 0 0 0 2.6 1l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0 1 2.5h.3a1.8 1.8 0 1 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9Z',
    help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.6-2.5 2.6M12 17.2h.01',
    logout: 'M9.5 20.5H5a1 1 0 0 1-1-1v-15a1 1 0 0 1 1-1h4.5M16 16.5l4.5-4.5L16 7.5M20 12H9',
    camera: 'M3.5 8h3.2l1.5-2.5h7.6L17.3 8h3.2v11.5h-17zM12 17a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Z',
    dots: 'M12 6.2h.01M12 12h.01M12 17.8h.01',
    refresh: 'M20.5 12a8.5 8.5 0 1 1-2.6-6.1M20.5 4v5h-5',
    lock: 'M5.5 10.5h13V21h-13zM8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5',
    scale: 'M12 3.5v17M6 8.5h12M4.5 8.5 2 15h5zM19.5 8.5 17 15h5zM8 20.5h8',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.2 9.5h17.6M3.2 14.5h17.6M12 3a14 14 0 0 1 0 18A14 14 0 0 1 12 3Z',
    droplet: 'M12 21.5c3.6 0 6.5-2.8 6.5-6.3S12 2.5 12 2.5 5.5 11.7 5.5 15.2 8.4 21.5 12 21.5Z',
    pizza: 'M12 3 21 20a26 26 0 0 1-18 0zM9.5 11h.01M13.5 13.5h.01M11 16.5h.01',
    utensils: 'M6 3v7a2.5 2.5 0 0 0 5 0V3M8.5 10v11M17 3c-1.4 1.6-2 3.6-2 6 0 1.6.6 2.6 2 3v9',
    trophy: 'M7 4h10v5a5 5 0 0 1-10 0zM7 5.5H4.5A2.5 2.5 0 0 0 7 10M17 5.5h2.5A2.5 2.5 0 0 1 17 10M9.5 20.5h5M12 14v6.5',
    eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
    scan: 'M4 8.5V5a1 1 0 0 1 1-1h3.5M15.5 4H19a1 1 0 0 1 1 1v3.5M20 15.5V19a1 1 0 0 1-1 1h-3.5M8.5 20H5a1 1 0 0 1-1-1v-3.5M3 12h18',
    calendar: 'M4 6h16v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 10h16M8 3.5V7M16 3.5V7',
    sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
    volume: 'M11 5 6.5 8.8H3v6.4h3.5L11 19zM15.5 9.5a3.5 3.5 0 0 1 0 5M18.2 6.8a7.3 7.3 0 0 1 0 10.4',
    coffee: 'M4 8h13v7a5 5 0 0 1-10 0zM17 9.5h1.8a2.5 2.5 0 0 1 0 5H17M3.5 21h14M8 2.5v2.2M12 2.5v2.2',
  };
  // filled paths
  var F = {
    starFill: 'M12 3.2 14.7 8.8l6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z',
    heartFill: 'M12 20.8S3 15.4 3 9.4A4.9 4.9 0 0 1 12 6.7a4.9 4.9 0 0 1 9 2.7c0 6-9 11.4-9 11.4Z',
    checkFill: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm-1.2-5.3L6.3 12.2l1.6-1.6 2.9 2.9 5.4-5.4 1.6 1.6z',
    dot: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    plusFill: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20Zm1.1 5h-2.2v3.9H7v2.2h3.9V17h2.2v-3.9H17v-2.2h-3.9z',
  };

  FB.icon = function (name, size, cls) {
    var sw = 1.75, d = S[name], fill = false;
    if (!d) { d = F[name]; fill = true; }
    if (!d) d = S.info;
    var sz = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + sz + '" height="' + sz + '" class="' + (cls || '') + '" aria-hidden="true" ' +
      (fill ? 'fill="currentColor">' : 'fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round">') +
      '<path d="' + d + '"/></svg>';
  };
  FB.hasIcon = function (n) { return !!(S[n] || F[n]); };

  /* rating stars widget */
  FB.starRow = function (n) {
    var out = '';
    for (var i = 1; i <= 5; i++) {
      out += '<span style="color:' + (i <= Math.round(n) ? 'var(--fb)' : 'var(--line-strong)') + '">' + FB.icon('starFill', 13) + '</span>';
    }
    return '<span class="starrow" style="display:inline-flex;gap:1px;align-items:center">' + out + '</span>';
  };

  /* ===================== the brand mark =====================
     Drawn, not photographed. A logo asset would make renaming the app an image
     job again; this way `tools/rebrand.cjs` moves the wordmark, the accent token
     recolours the tile, and nothing needs regenerating.

     The mark is a bag and a handle. The handle does not touch the bag, because
     on this platform it is a separate object, licensed separately, and billed
     separately. Nobody at FoodBang™ finds this funny. */
  var MARK =
    '<path d="M18 44h64a3 3 0 0 1 3 3.2l-4.6 40a7 7 0 0 1-7 6.3H26.6a7 7 0 0 1-7-6.3l-4.6-40A3 3 0 0 1 18 44Z"/>' +
    '<path d="M34 28a16 16 0 0 1 32 0" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round"/>' +
    '<rect x="18" y="44" width="64" height="7" opacity=".34"/>';

  /** the glyph alone, in currentColor */
  FB.mark = function (size, extra) {
    size = size || 24;
    return '<svg class="fb-mark" width="' + size + '" height="' + size + '" viewBox="0 0 100 100" ' +
      'fill="currentColor" aria-hidden="true" focusable="false"' + (extra ? ' ' + extra : '') + '>' + MARK + '</svg>';
  };

  /** the glyph on its tile — the app icon */
  FB.markTile = function (size, cls) {
    size = size || 40;
    return '<span class="fb-tile' + (cls ? ' ' + cls : '') + '" style="--tile:' + size + 'px" aria-hidden="true">' +
      FB.mark(Math.round(size * 0.58)) + '</span>';
  };

  FB.wordmark = function () { return '<span class="fb-word">FoodBang<sup>™</sup></span>'; };

  /** tile + wordmark + optional tagline, for letterheads and splashes */
  FB.lockup = function (opts) {
    opts = opts || {};
    return '<span class="fb-lock' + (opts.stack ? ' fb-lock--stack' : '') + '">' +
      FB.markTile(opts.size || 34) +
      '<span class="fb-lock-t">' + FB.wordmark() +
      (opts.tagline === false ? '' : '<span class="fb-lock-sub">Impact Is Part Of Delivery</span>') +
      '</span></span>';
  };

  /** fills any [data-fb-mark="32"] / [data-fb-lockup] in static markup, so index.html stays plain */
  FB.paintMarks = function (root) {
    root = root || document;
    FB.qsa('[data-fb-mark]', root).forEach(function (el) {
      if (el.dataset.fbPainted) return;
      el.dataset.fbPainted = '1';
      el.innerHTML = FB.mark(parseInt(el.dataset.fbMark, 10) || 24);
    });
    FB.qsa('[data-fb-lockup]', root).forEach(function (el) {
      if (el.dataset.fbPainted) return;
      el.dataset.fbPainted = '1';
      el.innerHTML = FB.lockup({ size: parseInt(el.dataset.fbLockup, 10) || 64, stack: true });
    });
  };

  /* The tab icon is the same geometry as everything else, tinted with the live
     accent token — so it survives a rebrand, and it survives being inlined into
     the single-file build, where a linked .svg would not. */
  FB.installFavicon = function () {
    var accent = '#FF2D14';
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue('--fb').trim();
      if (v) accent = v;
    } catch (e) {}
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="color:#fff">' +
      '<rect width="100" height="100" rx="23" fill="' + accent + '"/>' + MARK + '</svg>';
    var href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    ['icon', 'shortcut icon'].forEach(function (rel) {
      var link = document.querySelector('link[rel="' + rel + '"]') || document.createElement('link');
      link.rel = rel; link.type = 'image/svg+xml'; link.href = href;
      if (!link.parentNode) document.head.appendChild(link);
    });
  };

  /** the photographic category tile; the emoji below stays as its fallback */
  FB.CAT_IMG = function (slug) { return 'assets/app/cat/' + slug + '.webp'; };

  /* category emoji glyphs — the fallback under the tiles, and what search rows
     use when an item has no photo of its own */
  FB.CAT_ICONS = {
    'fast-food': '🍟', burgers: '🍔', mexican: '🌮', chicken: '🍗', pizza: '🍕',
    coffee: '☕️', asian: '🥡', sandwiches: '🥪', grocery: '🛒', drinks: '🥤',
    sweets: '🍩', italian: '🍝', 'casual-dining': '🍽', healthy: '🥗',
  };
  FB.CAT_LABELS = {
    'fast-food': 'Fast Food', burgers: 'Burgers', mexican: 'Mexican', chicken: 'Chicken',
    pizza: 'Pizza', coffee: 'Coffee', asian: 'Asian', sandwiches: 'Sandwich',
    grocery: 'Grocery', drinks: 'Drinks', sweets: 'Sweets', italian: 'Italian',
    'casual-dining': 'Sit-Down', healthy: 'Wellness',
  };
})(window.FB);
