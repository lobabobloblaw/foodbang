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

  /* Two tab bars, because there are two apps. Every id must name a registered
     screen: nav.tab(id) sets current.name to it directly. */
  var TABS_ORDER = [
    { id: 'home',    icon: 'home',    label: 'Home' },
    { id: 'grocery', icon: 'grocery', label: 'Grocery' },
    { id: 'search',  icon: 'search',  label: 'Search' },
    { id: 'orders',  icon: 'orders',  label: 'Orders' },
    { id: 'account', icon: 'account', label: 'Account' },
  ];
  var TABS_SLING = [
    { id: 'dispatch', icon: 'pin',     label: 'Dispatch' },
    { id: 'run',      icon: 'bike',    label: 'Run' },
    { id: 'records',  icon: 'camera',  label: 'Records' },
    { id: 'account',  icon: 'account', label: 'Account' },
  ];
  function tabs() { return FB.S().mode === 'sling' ? TABS_SLING : TABS_ORDER; }

  function renderTabs() {
    if (!tabEl) return;
    var cur = current ? (screens[current.name] || {}).tab : null;
    /* Counted, not dereferenced. activeOrderId is ONE slot and the app happily runs
       several live orders, so tick() pointing it at whichever finished first made the
       badge go dark while another was still en route. Same predicate js/ui/orders.js
       and js/sim/tracker.js use, so the badge and the "In progress" list cannot
       disagree — and two live orders now correctly read 2. */
    var pending = FB.S().orders.filter(function (o) {
      return o.status !== 'delivered' && o.status !== 'cancelled';
    }).length;
    var live = FB.S().mode === 'sling' && FB.S().slinging.run ? 1 : 0;
    var html = tabs().map(function (t) {
      var badge = '';
      if (t.id === 'orders' && pending) badge = '<i class="dot">' + pending + '</i>';
      if (t.id === 'run' && live) badge = '<i class="dot">' + live + '</i>';
      return '<button class="tab" data-tab="' + t.id + '"' + (cur === t.id ? ' aria-current="page"' : '') + '>' +
        FB.icon(t.icon, 23) + '<span>' + t.label + '</span>' + badge + '</button>';
    }).join('');
    /* Only touch the DOM when the markup has actually moved. This runs on every
       store write and on every tracker beat, and replacing five identical buttons
       threw away whatever was focused inside the bar — a keyboard user resting on a
       tab lost it a few seconds into every live order. Compared against the string
       last painted, not against tabEl.innerHTML: the browser re-serialises what it
       parsed, and the two never compare equal. */
    if (html === tabsHtml) return;
    tabsHtml = html;
    tabEl.innerHTML = html;
  }
  var tabsHtml = null;

  function renderCartBar() {
    if (!cartEl || !current) return;
    var scr = screens[current && current.name] || {};
    if (scr.hideCartBar) { setCartBar(''); return; }
    var slugs = FB.cart.activeSlugs();
    if (!slugs.length) { setCartBar(''); return; }
    /* on a store page, show that store's cart; otherwise the most recent */
    var slug = (current.name === 'store' && FB.cart.count(current.params.slug)) ? current.params.slug : slugs[0];
    var store = FB.catalog.get(slug);
    if (!store) { setCartBar(''); return; }
    var n = FB.cart.count(slug);
    var others = slugs.length - 1;
    setCartBar(
      '<button class="cartpill" data-cartgo="' + slug + '">' +
        '<span class="cp-n">' + n + '</span>' +
        '<span class="cp-t">' + FB.esc(store.shortName || store.name) +
          (others > 0 ? ' <span style="opacity:.72">+' + others + ' more ' + (others === 1 ? 'cart' : 'carts') + '</span>' : '') +
        '</span>' +
        '<span class="cp-p">' + FB.money(FB.cart.subtotal(slug)) + '</span>' +
      '</button>');
  }
  /* same guard as the tab bar, for the same reason: the pill is focusable */
  var cartHtml = null;
  function setCartBar(html) {
    if (html === cartHtml) return;
    cartHtml = html;
    cartEl.innerHTML = html;
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

  /* Screens re-render wholesale — 37 nav.refresh() call sites throw away #view and
     build it again — so every toggle, filter and tip button used to drop keyboard
     focus back to <body>. There is no component identity to hold on to, so a control
     is identified by the data-* attribute it already carries.
     Anything NOT on this list has no stable identity across a repaint, and focus is
     dropped rather than handed to whatever happens to sit at the same index: a cart
     list shifts when a line is removed, and "the button now where yours used to be"
     is the next item's Remove. */
  var FOCUS_ATTRS = ['data-tab', 'data-filter', 'data-cat', 'data-tip', 'data-cmode', 'data-mode',
    'data-sort', 'data-slot', 'data-pick', 'data-pickp', 'data-why', 'data-set', 'data-lid',
    'data-drop', 'data-try', 'data-q', 'data-rm', 'data-edit', 'data-dq', 'data-seg', 'data-sw',
    'data-rate', 'data-use', 'data-del', 'data-usep', 'data-delp', 'data-item', 'data-slug',
    'data-jump', 'data-cartgo', 'data-go', 'data-fav', 'data-express', 'data-expand-fees',
    'data-take', 'data-answer', 'data-accept'];

  function focusKey(elm) {
    if (!elm || elm === document.body) return null;
    var inView = viewEl.contains(elm), inBar = barEl.contains(elm);
    if (!inView && !inBar) return null;
    for (var i = 0; i < FOCUS_ATTRS.length; i++) {
      if (elm.hasAttribute(FOCUS_ATTRS[i])) {
        /* the +/- steppers share a data-dq (the line id) and differ only by data-d,
           and every store card shares data-go="store" and differs only by data-params */
        var tie = elm.hasAttribute('data-d') ? 'data-d' : (elm.hasAttribute('data-params') ? 'data-params' : null);
        return { root: inView ? 'view' : 'bar', name: FOCUS_ATTRS[i], value: elm.getAttribute(FOCUS_ATTRS[i]),
                 tie: tie, tieValue: tie ? elm.getAttribute(tie) : null };
      }
    }
    if (elm.id) return { root: inView ? 'view' : 'bar', id: elm.id };
    return null;
  }

  function restoreFocus(key) {
    if (!key) return;
    /* only ever look in the root the control came from: falling back to the other one
       moves focus across regions, e.g. from a rating star to the app bar's help button */
    var root = key.root === 'bar' ? barEl : viewEl;
    var target = null;
    if (key.id) {
      var byId = document.getElementById(key.id);
      if (byId && root.contains(byId)) target = byId;
    } else {
      /* matched by VALUE, never by a selector built from data — data-q holds whatever
         was typed into the search box, and a double quote in it would turn
         querySelector into a SyntaxError thrown straight out of paint() */
      var candidates = FB.qsa('[' + key.name + ']', root);
      for (var i = 0; i < candidates.length; i++) {
        if (candidates[i].getAttribute(key.name) !== key.value) continue;
        if (key.tie && candidates[i].getAttribute(key.tie) !== key.tieValue) continue;
        target = candidates[i]; break;
      }
    }
    if (target && target.focus) { try { target.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* Disposable render roots. #view and #appbar used to outlive every screen, so a
     listener that escaped the bookkeeping below stayed attached and fired again on
     the next render, and the one after that — the mechanism behind both of the
     confirmed criticals in this app. Swapping the node itself makes that physically
     impossible: the old element, and everything bound to it, is garbage.
     The node is REPLACED rather than wrapped so #view stays the scroll container —
     screens read root.scrollTop and bind root 'scroll', and a non-scrolling wrapper
     would silently break both. */
  function freshRoot(el) {
    var next = document.createElement(el.tagName);
    next.id = el.id;
    if (el.hasAttribute('tabindex')) next.setAttribute('tabindex', el.getAttribute('tabindex'));
    el.parentNode.replaceChild(next, el);
    return next;
  }

  /* The world's state, on the device, for CSS to read. Called from paint() and
     again on the boot clock's interval, so a tab left open through a weather change
     catches up without anyone navigating. */
  /* The bell lives in the app bar, which this subscriber does NOT repaint — only
     #view and #tabbar are its business — so the dot is patched directly or it
     simply never appears until you navigate. */
  function renderBell() {
    if (!barEl) return;
    var btn = barEl.querySelector('[data-notifs]');
    if (!btn) return;
    var dot = btn.querySelector('.belldot');
    var want = FB.notifs && FB.notifs.unreadCount() > 0;
    if (want && !dot) btn.insertAdjacentHTML('beforeend', '<i class="belldot"></i>');
    else if (!want && dot && dot.parentNode) dot.parentNode.removeChild(dot);
  }

  function stampWorld() {
    var dev = document.getElementById('device');
    if (!dev) return;
    var w = FB.world.at();
    dev.dataset.weather = w.weather;
    dev.dataset.daypart = w.daypart;
  }

  /* Everything under the phone's chrome is inert while a dialog is up. The trap
     below only sees Tab once focus is INSIDE the overlay; from <body> — which is
     where a repaint of the sheet's own body lands it — Tab walked straight into
     the app bar, the view and the tab bar behind the scrim, non-dismissible Terms
     gate included. */
  function setInert(on) {
    var s = el('screen');
    if (!s) return;
    try { s.inert = !!on; } catch (e) {}
  }

  function paint(opts) {
    var def = screens[current.name];
    if (!def) { console.warn('no screen', current.name); return; }

    /* only worth restoring if the keyboard was driving — a mouse user who clicks a
       chip does not want focus chasing the rebuilt DOM */
    var refocus = document.body.classList.contains('kb') ? focusKey(document.activeElement) : null;

    unmountCurrent();

    barEl = freshRoot(barEl);
    viewEl = freshRoot(viewEl);
    barEl.innerHTML = def.appbar ? def.appbar(current.params) : '';
    viewEl.innerHTML = def.render ? def.render(current.params) : '';
    viewEl.className = def.viewClass || '';
    var dev = document.getElementById('device');
    el('statusbar').classList.toggle('on-media', !!def.immersive);
    dev.classList.toggle('immersive', !!def.immersive);
    dev.classList.remove('scrolled');
    dev.dataset.screen = current.name;
    /* the whole accent hangs off this one attribute — see css/tokens.css */
    dev.dataset.mode = FB.S().mode || 'order';
    stampWorld();

    renderTabs(); renderCartBar();
    viewEl.scrollTop = current.scroll || 0;
    if (def.mount) {
      var binds = FB._binds = [];
      try { def.mount(viewEl, current.params); } catch (e) { console.error('mount ' + current.name, e); }
      FB._binds = null;
      mounted = { name: current.name, binds: binds };
    }
    if (refocus) restoreFocus(refocus);
    /* A navigation replaces the whole view, and focus was left on <body> — a
       screen-reader user tapping a store card heard nothing and had to walk the
       document from the top to learn the page had changed. #view is the scroll
       container and carries tabindex="-1" for exactly this. A refresh() is the same
       screen repainted, and its focus is handled above. */
    else if (opts && opts.navigate) { try { viewEl.focus({ preventScroll: true }); } catch (e) {} }
  }

  /* ---------- the router owns the session history ----------
     It used to write to history one-way: pushState on every go(), and a popstate
     handler that called back() unconditionally. Four things fell out of that.

     Browser FORWARD fired popstate, so the app navigated BACKWARD while the URL went
     forward, and the two disagreed from then on. `replace` meant "do not push onto
     the router stack" and said nothing about the browser, so back()'s empty-stack
     fallback pushed a NEW entry from inside the popstate handler — Back after a tab
     switch made no net progress and destroyed the forward entry. And an overlay,
     which never pushes an entry of its own, SPENT one when Back closed it: the URL
     desynced, and with a dismissible:false modal up (the checkout Terms gate) Back
     did nothing visible while silently eating every remaining entry, until the next
     one unloaded the app from the middle of checkout.

     So: every entry carries a monotonic serial, popstate compares it against the one
     we think we are on to learn the DIRECTION, an entry spent by an overlay is put
     back, and nothing writes history while reacting to history. */
  var serial = 0;
  var forward = [];
  var reacting = false;

  function writeHistory(name, replace) {
    /* Never while reacting: the browser has already moved, and writing here is what
       made Back grow the history instead of shrinking it. Defensive now rather than
       load-bearing — the only navigation a pop can trigger is back()'s root fallback,
       which is a replace and therefore harmless — but a future redirect-on-mount
       would reach this from inside a pop, and that is the case that ate the history. */
    if (reacting) return;
    try {
      if (replace) history.replaceState({ n: name, s: serial }, '', '#' + name);
      else history.pushState({ n: name, s: ++serial }, '', '#' + name);
    } catch (e) {}
  }

  /* Put back an entry an overlay spent. Overlays are not history entries — mkOverlay
     never pushes one — so a Back that closed a sheet has to hand its entry back or
     the app runs out of them and leaves the page. */
  function restoreEntry(s) {
    try {
      var n = current ? current.name : 'home';
      history.pushState({ n: n, s: s }, '', '#' + n);
      serial = s;
    } catch (e) {}
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
      /* a new navigation invalidates anything that was ahead of us */
      forward = [];
      FB.overlay.closeAll(true);
      paint({ navigate: true });
      if (!opts.silent) writeHistory(name, !!opts.replace);
    },
    replace: function (name, params) { nav.go(name, params, { replace: true }); },
    /* Reports WHICH branch it took, because the popstate handler has to know: an
       overlay close and a refused modal both consumed a history entry they did not
       own. Every return is truthy except the one that already was. */
    back: function () {
      if (FB.overlay.any()) {
        var top = FB.overlay.top();
        /* dismissible:false used to mean only "do not wire the scrim", so Escape
           still closed a modal that had exactly one button by design. It means it
           now — for the welcome modal too. */
        if (top && top.cfg && top.cfg.dismissible === false) return 'blocked';
        FB.overlay.close();
        return 'overlay';
      }
      if (!stack.length) {
        if (current && current.name !== 'home') { nav.go('home', {}, { replace: true }); return 'root'; }
        return false;
      }
      var prev = stack.pop();
      forward.push(current);
      current = { name: prev.name, params: prev.params, scroll: prev.scroll, prev: current };
      paint({ navigate: true });
      return 'screen';
    },
    /* What a popstate MEANS, separated from the listener that receives it: the
       harness never runs shell.init(), so anything left inside that listener cannot
       be checked at all. `to` is the serial of the entry the browser moved to. */
    pop: function (to) {
      if (typeof to !== 'number') to = 0;
      var spent = serial;
      var goingBack = to < serial;
      serial = to;
      reacting = true;
      try {
        if (!goingBack) return nav.fwd();
        var did = nav.back();
        /* An overlay is not a history entry. Whether we closed one or refused to,
           the browser has already spent an entry that was never ours — hand it back,
           or the app runs out and unloads itself from the middle of checkout. */
        if (did === 'overlay' || did === 'blocked') restoreEntry(spent);
        /* did === false: the router is at its root with nothing left to pop, so the
           browser is welcome to leave. */
        return did;
      } finally { reacting = false; }
    },

    /** the serial of the history entry the router believes it is on */
    serial: function () { return serial; },

    /** the other direction, which the router had no notion of at all */
    fwd: function () {
      if (!forward.length) return false;
      var next = forward.pop();
      if (current) { current.scroll = viewEl.scrollTop; stack.push(current); }
      current = { name: next.name, params: next.params, scroll: next.scroll, prev: current };
      FB.overlay.closeAll(true);
      paint({ navigate: true });
      return 'screen';
    },
    /* switch a bottom tab: reset the stack to that root */
    tab: function (id) {
      if (current && current.name === id) { FB.scrollTop(true); return; }
      stack = []; forward = [];
      current = { name: id, params: {}, scroll: 0, prev: current };
      FB.overlay.closeAll(true);
      paint({ navigate: true });
      /* replace, not push: a tab switch is a new root, and leaving the URL saying
         '#store' while the screen shows Orders is the desync this whole block is about */
      writeHistory(id, true);
    },
    current: function () { return current; },
    depth: function () { return stack.length; },
    refresh: function () { if (current) { current.scroll = viewEl.scrollTop; paint(); } },
  };
  FB.nav = nav;

  /* ===================== overlays (sheets + modals) ===================== */
  var overlays = [];
  var dlgSeq = 0;

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
    setInert(true);
    /* A dialog with no title had no accessible name at all — the item sheet, every
       confirm, the Terms gate — while each rendered a heading it never pointed at. */
    if (!cfg.title) {
      var named = ov.querySelector('.sheet, .modal');
      var hd = named && named.querySelector('h1, h2, h3');
      if (hd) {
        if (!hd.id) hd.id = 'dlg-' + (++dlgSeq);
        named.setAttribute('aria-labelledby', hd.id);
      }
    }

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

  /* `instant` skips the exit animation AND the focus hand-back — it is only used by
     nav.go/nav.tab, which are about to repaint and would have the restored focus
     replaced out from under them a moment later. What it must NOT skip is onClose:
     FB.confirm resolves its promise there, so tearing the node out directly (which
     is what this did) left an awaited confirm pending forever. Reachable today: a
     toast sits above #overlay-root and its action button calls nav.go. */
  function closeOverlay(h, value, instant) {
    var i = overlays.indexOf(h); if (i < 0) return;
    overlays.splice(i, 1);
    h.el.classList.add('closing');
    var done = false;
    function fin(skipFocus) {
      if (done) return; done = true;
      if (h.el.parentNode) h.el.parentNode.removeChild(h.el);
      /* before the focus hand-back below, or the element it returns to is inert */
      if (!overlays.length) setInert(false);
      if (!skipFocus) {
        var back = h.returnFocus;
        if (back && back.isConnected && back.focus) { try { back.focus({ preventScroll: true }); } catch (e) {} }
      }
      if (h.cfg.onClose) { try { h.cfg.onClose(value); } catch (e) {} }
    }
    if (instant) fin(true); else setTimeout(fin, 260);
  }

  FB.overlay = {
    any: function () { return overlays.length > 0; },
    close: function (v) { if (overlays.length) closeOverlay(overlays[overlays.length - 1], v); },
    closeAll: function (instant) {
      overlays.slice().forEach(function (h) { closeOverlay(h, undefined, instant); });
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
          /* .modal-acts is a column, so DOM order and visual order can differ. On a
             destructive confirm Cancel comes FIRST in the DOM — mkOverlay focuses the
             first tabbable, and a dialog must never arm the button that erases your
             data — while order:-1 keeps Erase where the eye expects it, on top. */
          '<div class="modal-acts">' + (cfg.danger
            ? '<button class="btn btn--ghost btn--block" data-no>' + FB.esc(cfg.no || 'Cancel') + '</button>' +
              '<button class="btn btn--danger btn--block" style="order:-1" data-yes>' + FB.esc(cfg.yes || 'Confirm') + '</button>'
            : '<button class="btn btn--primary btn--block" data-yes>' + FB.esc(cfg.yes || 'Confirm') + '</button>' +
              '<button class="btn btn--ghost btn--block" data-no>' + FB.esc(cfg.no || 'Cancel') + '</button>') +
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
  /* The visible half of js/core/latency.js. A control that goes quiet for half a
     second with no response reads as broken, which is the opposite of the point —
     so anything that waits says that it is waiting, and cannot be fired twice
     while it does. The element is usually thrown away by the nav.refresh() that
     follows, so this restores nothing: it only has to hold until then. */
  FB.busy = function (el, kind, fn) {
    if (!el) return FB.latency.run(kind, fn);
    if (el.dataset.busy === '1') return function () {};   /* already in flight */
    el.dataset.busy = '1';
    el.classList.add('is-busy');
    return FB.latency.run(kind, function () {
      el.dataset.busy = '';
      el.classList.remove('is-busy');
      fn();
    });
  };

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
    stampWorld: stampWorld,
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

      /* `kb` marks a session that is being driven from the keyboard; paint() only
         restores focus for those, so a mouse click never yanks focus around. */
      window.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') document.body.classList.add('kb');
      }, true);
      window.addEventListener('mousedown', function () { document.body.classList.remove('kb'); }, true);

      /* Sync to whatever entry we were restored onto, so a reload mid-session does
         not make every subsequent Back look like a Forward. */
      try { if (history.state && typeof history.state.s === 'number') serial = history.state.s; } catch (e) {}

      window.addEventListener('popstate', function (e) {
        nav.pop(e && e.state && typeof e.state.s === 'number' ? e.state.s : 0);
      });
      document.addEventListener('keydown', function (e) {
        /* closest(), not matches() — a keystroke can land on a child of an editable */
        var t = e.target;
        if (t && t.closest && t.closest('input,textarea,[contenteditable]')) {
          if (e.key === 'Escape' && t.blur) t.blur();
          return;
        }
        if (e.key === 'Escape') { nav.back(); return; }
        /* a dialog owns the keyboard while it is up: no recolouring the app underneath
           it, and no stacking a second modal on top of the first */
        if (FB.overlay.any()) return;
        if (e.key === '/') { e.preventDefault(); nav.tab('search'); }
        else if (e.key === 'd' || e.key === 'D') { FB.cycleTheme(); }
        /* the only shortcut that destroys data asks for Shift as well, so that a
           stray 'r' typed at an unfocused search box cannot reach it */
        else if (e.key === 'R' && e.shiftKey && (e.metaKey || e.ctrlKey) === false) { FB.hardReset(); }
      });

      FB.store.sub(function () { renderTabs(); renderCartBar(); renderBell(); FB.updateDeskStats(); });
    },
    repaintChrome: function () { renderTabs(); renderCartBar(); renderBell(); },
  };
})(window.FB);
