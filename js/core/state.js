/* FoodBang — application state, persisted to localStorage */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var KEY = 'foodbang.state.v1';
  var VERSION = 1;

  function defaults() {
    var now = Date.now();
    return {
      v: VERSION,
      user: {
        name: 'Dana Whitfield',
        handle: '@dana',
        email: 'dana@example.invalid',
        phone: '(555) 018-4402',
        avatar: 'assets/app/user-avatar.webp',
        joined: now - 1000 * 60 * 60 * 24 * 613,
      },
      settings: {
        theme: 'system',
        motion: 'system',
        textsize: 'm',
        units: 'imperial',
        language: 'en-US',
        hungerLevel: 7,
        feeTransparency: true,   /* turning this OFF costs money. see fees.js */
        reduceUpsells: false,    /* so does this */
        dataSharing: true,       /* turning this off costs money too */
        soundEffects: true,
        instantInterface: false,   /* suppressing the wait costs money. see fees.js */
        autoTipPct: 42,
        notifications: {
          orderUpdates: true, promos: true, slingerMessages: true,
          biometric: true, nightly: true, reengagement: true,
        },
      },
      addresses: [
        { id: 'a1', label: 'Home', line1: '4417 Cul-De-Sac Terrace Loop', line2: 'Unit 12-B',
          city: 'Sprawl Heights, CA 90210', instructions: 'Leave it. Do not knock. Do not speak.',
          dropoff: 'leave', isDefault: true },
        { id: 'a2', label: 'Work', line1: '9000 Corporate Campus Dr, Bldg 7', line2: 'Pod 4412',
          city: 'Sprawl Heights, CA 90211', instructions: 'Security will confiscate one item. This is expected.',
          dropoff: 'hand', isDefault: false },
      ],
      selectedAddress: 'a1',
      payments: [
        { id: 'p1', brand: 'BangCard', last4: '9931', exp: '11/29', nickname: 'BANG+ Linked', isDefault: true },
        { id: 'p2', brand: 'Visa', last4: '4417', exp: '03/28', nickname: 'Personal', isDefault: false },
        { id: 'p3', brand: 'EBT-Adjacent', last4: '0002', exp: '—', nickname: 'Provisional', isDefault: false },
      ],
      selectedPayment: 'p1',
      plus: { active: false, since: null, cancelAttempts: 0, trialUsed: false, renewsOn: null,
              saved: 0, paid: 0, retentionUsed: 0 },
      scrip: [],            /* BangBux™ grants, each with an issue time. see js/core/scrip.js */
      cart: {},          /* slug -> { lines: [], updated } */
      orders: [],
      activeOrderId: null,
      favorites: [],
      recentSearches: [],
      standing: { points: 0, tier: 0, lastOrderAt: null, decayedThrough: null, seenTier: 0 },
      notifs: [],           /* the notification centre. see js/core/notifs.js */
      notifsThrough: 0,     /* how far the boot backlog has synthesised */
      promo: { applied: null, used: [] },
      seen: {},
      bodymax: { history: [], badges: [], firstTs: null, dismissed: [] },
      meta: { installedAt: now, orderCount: 0, lifetimeSpend: 0, lifetimeFees: 0, lifetimeTips: 0, lifetimeCalories: 0 },
    };
  }

  var state = null;
  var subs = [];
  var saveTimer = null;

  function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  /* Backfill every key the defaults have and the save does not, AT ANY DEPTH.
     The old version walked the top level plus two hardcoded sub-objects, which is
     why plus.saved and plus.retentionUsed are undefined on every existing save —
     and why `st.meta.lifetimeCalories += load.calories` on a save written before
     that field existed poisons a lifetime total to NaN permanently. Adding depth
     means adding fields, so this is the thing that has to be right first.

     Plain objects only. An array in a saved value is the user's data: merging the
     defaults into a saved addresses list would resurrect an address they deleted,
     and a defaults array is only ever a starting point, never a floor. A value the
     user already has is never overwritten. */
  function fillDefaults(saved, d) {
    Object.keys(d).forEach(function (k) {
      var dv = d[k];
      if (saved[k] === undefined) {
        saved[k] = (dv !== null && typeof dv === 'object') ? FB.deep(dv) : dv;
      } else if (isPlain(dv) && isPlain(saved[k])) {
        fillDefaults(saved[k], dv);
      }
    });
    return saved;
  }

  /* A VERSION bump used to mean `return defaults()` — erasing every order, badge
     and lifetime total in an app whose central conceit is a record that "cannot be
     reversed within this application". Each rung transforms a save one step, in
     order, and the save before a breaking step is kept in a backup slot.
     Adding a FIELD needs no rung: fillDefaults above handles that, which is the
     whole point. Add a rung only for a genuinely breaking RESHAPE, and then only
     with its own key, e.g.  2: function (s) { …; return s; }  */
  var MIGRATIONS = {};

  function backup(s) {
    try { localStorage.setItem(KEY + '.bak', JSON.stringify(s)); } catch (e) { /* full, or blocked */ }
  }

  /* Two ledgers grow without bound — one entry per order, forever. At some point a
     save stops fitting in the quota and every write starts failing silently. */
  var HISTORY_CAP = 200;

  function migrate(s) {
    var d = defaults();
    if (!s || typeof s !== 'object') return d;

    var from = Number(s.v) || 0;
    if (from > VERSION) return d;              /* written by a newer build */
    if (from < VERSION) {
      backup(s);
      for (var v = from + 1; v <= VERSION; v++) {
        var step = MIGRATIONS[v];
        if (typeof step !== 'function') return d;   /* no rung: the old behaviour */
        try { s = step(s) || s; } catch (e) { return d; }
      }
      s.v = VERSION;
    }

    fillDefaults(s, d);

    if (Array.isArray(s.orders) && s.orders.length > HISTORY_CAP) s.orders.length = HISTORY_CAP;
    if (s.bodymax && Array.isArray(s.bodymax.history) && s.bodymax.history.length > HISTORY_CAP) {
      s.bodymax.history.length = HISTORY_CAP;
    }
    /* A cart bucket can exist with no lines: the store page's Delivery/Pickup toggle
       writes to st.cart[slug].co before anything is added. That is right for the
       session you are shopping in and wrong a week later — a Pickup chosen once on an
       empty cart would silently still be in force. Drop the empties on load. */
    Object.keys(s.cart || {}).forEach(function (k) {
      var b = s.cart[k];
      if (!b || !b.lines || !b.lines.length) delete s.cart[k];
    });

    /* The house card carries the app's own name, so it moves when the app is
       renamed. Matched by id rather than by the old string: naming the retired
       brand here would put it right back into the source npm test greps. */
    var house = d.payments[0];
    (s.payments || []).forEach(function (p) {
      if (p.id === house.id && p.brand !== house.brand) p.brand = house.brand;
    });
    return s;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!raw) return defaults();
    try { return migrate(JSON.parse(raw)); } catch (e) { return defaults(); }
  }

  var storageWarned = false;

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) {
        /* Quota, private mode, or storage blocked outright. Say so ONCE: writes are
           debounced at 90ms and retry on the next change, so a per-failure message
           would stack one toast per keystroke. Reported through a hook rather than
           FB.toast directly, because nothing in js/core may touch the DOM — the
           boot file owns how the app speaks. */
        if (storageWarned) return;
        storageWarned = true;
        if (typeof store.onStorageError === 'function') {
          try { store.onStorageError(e); } catch (e2) {}
        }
      }
    }, 90);
  }

  var store = {
    get state() { return state; },
    /* exported so a test can seed a save without spelling the brand into a file
       that tools/rebrand.cjs does not rewrite */
    KEY: KEY,
    onStorageError: null,
    /** mutate state through a function, then persist + notify */
    set: function (fn, opts) {
      var r = fn(state);
      if (r && typeof r === 'object') state = r;
      persist();
      if (!(opts && opts.silent)) store.emit();
      return state;
    },
    emit: function () {
      for (var i = 0; i < subs.length; i++) { try { subs[i](state); } catch (e) { console.error(e); } }
    },
    sub: function (fn) {
      subs.push(fn);
      return function () { var i = subs.indexOf(fn); if (i > -1) subs.splice(i, 1); };
    },
    reset: function () {
      state = defaults();
      try { localStorage.removeItem(KEY); } catch (e) {}
      persist(); store.emit();
    },
    /* --- convenience selectors --- */
    address: function () {
      return state.addresses.find(function (a) { return a.id === state.selectedAddress; }) || state.addresses[0];
    },
    payment: function () {
      return state.payments.find(function (p) { return p.id === state.selectedPayment; }) || state.payments[0];
    },
    isPlus: function () { return !!state.plus.active; },
    isFav: function (slug) { return state.favorites.indexOf(slug) > -1; },
    order: function (id) { return state.orders.find(function (o) { return o.id === id; }); },
    activeOrder: function () {
      var o = store.order(state.activeOrderId);
      return o && o.status !== 'delivered' && o.status !== 'cancelled' ? o : null;
    },
  };

  state = load();
  FB.store = store;
  FB.S = function () { return state; };

  /* Whatever data-theme the host page arrived with is the "system" answer.
     Standalone that is nothing (so prefers-color-scheme decides); embedded in a
     host that stamps a theme, it is that stamp — which we must not clobber. */
  var HOST_THEME = (typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme')) || null;

  /* apply persisted appearance settings to <html> immediately */
  FB.applyAppearance = function () {
    var r = document.documentElement, s = state.settings;
    if (s.theme === 'system') {
      if (HOST_THEME) r.setAttribute('data-theme', HOST_THEME); else r.removeAttribute('data-theme');
    } else r.dataset.theme = s.theme;
    if (s.motion === 'system') r.removeAttribute('data-motion'); else r.dataset.motion = s.motion;
    if (s.textsize === 'm') r.removeAttribute('data-textsize'); else r.dataset.textsize = s.textsize;
  };
})(window.FB);
