/* FoodBang — app shell: router, tab bar, sheets, modals, toasts */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* ===================== screen registry ===================== */
  var screens = {};
  FB.screens = {
    register: function (name, def) { screens[name] = def; },
    get: function (name) { return screens[name]; },
    list: function () { return Object.keys(screens); },
  };

  /* ===================== router ===================== */
  var stack = [];          /* [{name, params, scroll}] */
  var current = null;
  var viewEl, barEl, tabEl, cartEl;

  function el(id) { return document.getElementById(id); }

  var TABS = [
    { id: 'home',    icon: 'home',    label: 'Home' },
    { id: 'grocery', icon: 'grocery', label: 'Grocery' },
    { id: 'search',  icon: 'search',  label: 'Search' },
    { id: 'orders',  icon: 'orders',  label: 'Orders' },
    { id: 'account', icon: 'account', label: 'Account' },
  ];

  function renderTabs() {
    var cur = current ? (screens[current.name] || {}).tab : null;
    var pending = FB.store.activeOrder() ? 1 : 0;
    tabEl.innerHTML = TABS.map(function (t) {
      var badge = '';
      if (t.id === 'orders' && pending) badge = '<i class="dot">' + pending + '</i>';
      return '<button class="tab" data-tab="' + t.id + '"' + (cur === t.id ? ' aria-current="page"' : '') + '>' +
        FB.icon(t.icon, 23) + '<span>' + t.label + '</span>' + badge + '</button>';
    }).join('');
  }

  function renderCartBar() {
    var scr = screens[current && current.name] || {};
    if (scr.hideCartBar) { cartEl.innerHTML = ''; return; }
    var slugs = FB.cart.activeSlugs();
    if (!slugs.length) { cartEl.innerHTML = ''; return; }
    /* on a store page, show that store's cart; otherwise the most recent */
    var slug = (current.name === 'store' && FB.cart.count(current.params.slug)) ? current.params.slug : slugs[0];
    var store = FB.catalog.get(slug);
    if (!store) { cartEl.innerHTML = ''; return; }
    var n = FB.cart.count(slug);
    var others = slugs.length - 1;
    cartEl.innerHTML =
      '<button class="cartpill" data-cartgo="' + slug + '">' +
        '<span class="cp-n">' + n + '</span>' +
        '<span class="cp-t">' + FB.esc(store.shortName || store.name) +
          (others > 0 ? ' <span style="opacity:.72">+' + others + ' more ' + (others === 1 ? 'cart' : 'carts') + '</span>' : '') +
        '</span>' +
        '<span class="cp-p">' + FB.money(FB.cart.subtotal(slug)) + '</span>' +
      '</button>';
  }

  /* The screen whose mount() actually ran, with the listeners it bound. Tracking
     this rather than current.prev is what makes a re-render safe: nav.refresh()
     repaints the screen you are already on, so "the previous screen" is usually
     this one. */
  var mounted = null;

  function unmountCurrent() {
    if (!mounted) return;
    mounted.binds.forEach(function (off) { try { off(); } catch (e) {} });
    var def = screens[mounted.name];
    if (def && def.unmount) { try { def.unmount(); } catch (e) { console.error('unmount ' + mounted.name, e); } }
    mounted = null;
  }

  function paint() {
    var def = screens[current.name];
    if (!def) { console.warn('no screen', current.name); return; }

    unmountCurrent();

    barEl.innerHTML = def.appbar ? def.appbar(current.params) : '';
    viewEl.innerHTML = def.render ? def.render(current.params) : '';
    viewEl.className = def.viewClass || '';
    var dev = document.getElementById('device');
    el('statusbar').classList.toggle('on-media', !!def.immersive);
    dev.classList.toggle('immersive', !!def.immersive);
    dev.classList.remove('scrolled');
    dev.dataset.screen = current.name;

    renderTabs(); renderCartBar();
    viewEl.scrollTop = current.scroll || 0;
    if (def.mount) {
      var binds = FB._binds = [];
      try { def.mount(viewEl, current.params); } catch (e) { console.error('mount ' + current.name, e); }
      FB._binds = null;
      mounted = { name: current.name, binds: binds };
    }
  }

  var nav = {
    go: function (name, params, opts) {
      opts = opts || {};
      if (current) {
        current.scroll = viewEl.scrollTop;
        var prev = current;
        if (!opts.replace) stack.push(current);
        current = { name: name, params: params || {}, scroll: 0, prev: prev };
      } else {
        current = { name: name, params: params || {}, scroll: 0 };
      }
      FB.overlay.closeAll(true);
      paint();
      if (!opts.silent) { try { history.pushState({ n: name }, '', '#' + name); } catch (e) {} }
    },
    replace: function (name, params) { nav.go(name, params, { replace: true }); },
    back: function () {
      if (FB.overlay.any()) { FB.overlay.close(); return true; }
      if (!stack.length) { if (current && current.name !== 'home') { nav.go('home', {}, { replace: true }); return true; } return false; }
      var prev = stack.pop();
      current = { name: prev.name, params: prev.params, scroll: prev.scroll, prev: current };
      paint();
      return true;
    },
    /* switch a bottom tab: reset the stack to that root */
    tab: function (id) {
      if (current && current.name === id) { FB.scrollTop(true); return; }
      stack = []; current = { name: id, params: {}, scroll: 0, prev: current };
      FB.overlay.closeAll(true);
      paint();
    },
    current: function () { return current; },
    depth: function () { return stack.length; },
    refresh: function () { if (current) { current.scroll = viewEl.scrollTop; paint(); } },
  };
  FB.nav = nav;

  /* ===================== overlays (sheets + modals) ===================== */
  var overlays = [];

  function mkOverlay(kind, cfg) {
    var root = el('overlay-root');
    var ov = document.createElement('div');
    ov.className = 'ov';
    var inner;

    if (kind === 'sheet') {
      inner =
        '<div class="sheet' + (cfg.full ? ' sheet--full' : '') + '" role="dialog" aria-modal="true" tabindex="-1"' +
        (cfg.title ? ' aria-label="' + FB.attr(cfg.title) + '"' : '') + '>' +
          (cfg.noGrab ? '' : '<div class="sheet-grab"></div>') +
          (cfg.title || cfg.close !== false
            ? '<div class="sheet-head">' +
                (cfg.back ? '<button class="iconbtn" data-sheet-back aria-label="Back">' + FB.icon('back', 20) + '</button>' : '') +
                '<h2>' + FB.esc(cfg.title || '') + (cfg.sub ? '<span class="sh-sub">' + FB.esc(cfg.sub) + '</span>' : '') + '</h2>' +
                (cfg.close === false ? '' : '<button class="iconbtn" data-sheet-close aria-label="Close">' + FB.icon('x', 19) + '</button>') +
              '</div>'
            : '') +
          '<div class="sheet-body">' + (cfg.html || '') + '</div>' +
          (cfg.footer ? '<div class="sheet-foot">' + cfg.footer + '</div>' : '') +
        '</div>';
    } else {
      inner = '<div class="modal" role="dialog" aria-modal="true" tabindex="-1"' +
        (cfg.title ? ' aria-label="' + FB.attr(cfg.title) + '"' : '') + '>' + (cfg.html || '') + '</div>';
    }
    ov.innerHTML = '<div class="ov-scrim" data-scrim></div>' + inner;
    root.appendChild(ov);

    var handle = {
      el: ov,
      body: ov.querySelector('.sheet-body') || ov.querySelector('.modal'),
      cfg: cfg,
      returnFocus: document.activeElement,
      close: function (v) { closeOverlay(handle, v); },
      setFooter: function (html) {
        var f = ov.querySelector('.sheet-foot');
        if (f) f.innerHTML = html;
      },
    };
    overlays.push(handle);

    if (cfg.dismissible !== false) {
      ov.querySelector('[data-scrim]').addEventListener('click', function () { handle.close(); });
    }
    FB.on(ov, 'click', '[data-sheet-close]', function () { handle.close(); });
    if (cfg.back) FB.on(ov, 'click', '[data-sheet-back]', function () { handle.close(); cfg.back(); });
    if (cfg.onMount) { try { cfg.onMount(handle.body, handle); } catch (e) { console.error(e); } }

    /* A dialog you cannot reach with the keyboard is a dialog that traps the
       keyboard behind it: move focus in, keep Tab inside, hand it back on close. */
    var dlg = ov.querySelector('.sheet, .modal');
    var TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
    function tabbables() {
      return FB.qsa(TABBABLE, dlg).filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
    }
    var first = tabbables().filter(function (el) { return !el.hasAttribute('data-sheet-close'); })[0];
    try { (first || dlg).focus({ preventScroll: true }); } catch (e) {}
    FB.on(ov, 'keydown', function (e) {
      if (e.key !== 'Tab') return;
      var list = tabbables();
      if (!list.length) { e.preventDefault(); dlg.focus({ preventScroll: true }); return; }
      var i = list.indexOf(document.activeElement);
      if (e.shiftKey && (i <= 0)) { e.preventDefault(); list[list.length - 1].focus(); }
      else if (!e.shiftKey && i === list.length - 1) { e.preventDefault(); list[0].focus(); }
      else if (i === -1) { e.preventDefault(); list[0].focus(); }
    });
    return handle;
  }

  function closeOverlay(h, value) {
    var i = overlays.indexOf(h); if (i < 0) return;
    overlays.splice(i, 1);
    h.el.classList.add('closing');
    var done = false;
    function fin() {
      if (done) return; done = true;
      if (h.el.parentNode) h.el.parentNode.removeChild(h.el);
      var back = h.returnFocus;
      if (back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) {} }
      if (h.cfg.onClose) { try { h.cfg.onClose(value); } catch (e) {} }
    }
    setTimeout(fin, 260);
  }

  FB.overlay = {
    any: function () { return overlays.length > 0; },
    close: function (v) { if (overlays.length) closeOverlay(overlays[overlays.length - 1], v); },
    closeAll: function (instant) {
      overlays.slice().forEach(function (h) {
        overlays.splice(overlays.indexOf(h), 1);
        if (instant) { if (h.el.parentNode) h.el.parentNode.removeChild(h.el); }
        else closeOverlay(h, undefined);
      });
    },
    top: function () { return overlays[overlays.length - 1]; },
  };

  FB.sheet = {
    open: function (cfg) { return mkOverlay('sheet', cfg || {}); },
    close: function (v) { FB.overlay.close(v); },
  };
  FB.modal = {
    open: function (cfg) { return mkOverlay('modal', cfg || {}); },
    close: function (v) { FB.overlay.close(v); },
  };

  /* an explanatory sheet for any fee line */
  FB.why = function (title, body, extra) {
    FB.sheet.open({
      title: title,
      html: '<div style="padding:0 16px 20px"><p style="font:var(--t-body);color:var(--ink-2);line-height:1.6;margin:0 0 14px">' +
        FB.esc(body) + '</p>' + (extra || '') +
        '<p style="font:var(--t-cap);color:var(--ink-3);margin:16px 0 0;line-height:1.5">This fee is non-negotiable, non-refundable, and non-optional. ' +
        'You may dispute it by writing to an address that will be provided upon request, in writing.</p></div>',
      footer: '<button class="btn btn--dark btn--block" data-sheet-close>Understood</button>',
    });
  };

  FB.confirm = function (cfg) {
    return new Promise(function (resolve) {
      FB.modal.open({
        html: '<h2>' + FB.esc(cfg.title) + '</h2><p>' + FB.esc(cfg.body || '') + '</p>' +
          '<div class="modal-acts">' +
            '<button class="btn ' + (cfg.danger ? 'btn--danger' : 'btn--primary') + ' btn--block" data-yes>' + FB.esc(cfg.yes || 'Confirm') + '</button>' +
            '<button class="btn btn--ghost btn--block" data-no>' + FB.esc(cfg.no || 'Cancel') + '</button>' +
          '</div>',
        onMount: function (body, h) {
          body.querySelector('[data-yes]').addEventListener('click', function () { h.close(); resolve(true); });
          body.querySelector('[data-no]').addEventListener('click', function () { h.close(); resolve(false); });
        },
        onClose: function () { resolve(false); },
      });
    });
  };

  /* ===================== toasts ===================== */
  FB.toast = function (msg, opts) {
    opts = opts || {};
    var root = el('toast-root');
    /* never stack more than two — a queue of identical toasts reads as a bug */
    while (root.children.length >= 2) root.removeChild(root.firstElementChild);
    var t = document.createElement('div');
    t.className = 'toast' + (opts.kind ? ' toast--' + opts.kind : '');
    t.innerHTML = (opts.icon ? FB.icon(opts.icon, 17) : '') + '<span>' + FB.esc(msg) + '</span>' +
      (opts.action ? '<button class="linkbtn" style="color:inherit;text-decoration:underline;margin-left:4px" data-act>' + FB.esc(opts.action) + '</button>' : '');
    root.appendChild(t);
    if (opts.action && opts.onAction) t.querySelector('[data-act]').addEventListener('click', function () { opts.onAction(); kill(); });
    var to = setTimeout(kill, opts.ms || 2800);
    function kill() {
      clearTimeout(to);
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 260);
    }
    return kill;
  };

  /* ===================== boot ===================== */
  FB.shell = {
    init: function () {
      viewEl = el('view'); barEl = el('appbar'); tabEl = el('tabbar'); cartEl = el('cartbar');

      FB.on(tabEl, 'click', '[data-tab]', function (e, t) { FB.tap(t); nav.tab(t.dataset.tab); });
      FB.on(cartEl, 'click', '[data-cartgo]', function (e, t) { nav.go('cart', { slug: t.dataset.cartgo }); });

      /* global delegated actions available on every screen */
      FB.on(document, 'click', '[data-go]', function (e, t) {
        e.preventDefault();
        var p = {};
        try { p = t.dataset.params ? JSON.parse(t.dataset.params) : {}; } catch (err) {}
        nav.go(t.dataset.go, p);
      });
      FB.on(document, 'click', '[data-back]', function (e) { e.preventDefault(); nav.back(); });

      window.addEventListener('popstate', function () { nav.back(); });
      document.addEventListener('keydown', function (e) {
        if (e.target.matches && e.target.matches('input,textarea')) {
          if (e.key === 'Escape') e.target.blur();
          return;
        }
        if (e.key === 'Escape') { nav.back(); }
        else if (e.key === '/') { e.preventDefault(); nav.tab('search'); }
        else if (e.key.toLowerCase() === 'd') { FB.cycleTheme(); }
        else if (e.key.toLowerCase() === 'r' && (e.metaKey || e.ctrlKey) === false) { FB.hardReset(); }
      });

      FB.store.sub(function () { renderTabs(); renderCartBar(); FB.updateDeskStats(); });
    },
    repaintChrome: function () { renderTabs(); renderCartBar(); },
  };
})(window.FB);
