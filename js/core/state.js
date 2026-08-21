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
        { id: 'p1', brand: 'GorgeCard', last4: '9931', exp: '11/29', nickname: 'BANG+ Linked', isDefault: true },
        { id: 'p2', brand: 'Visa', last4: '4417', exp: '03/28', nickname: 'Personal', isDefault: false },
        { id: 'p3', brand: 'EBT-Adjacent', last4: '0002', exp: '—', nickname: 'Provisional', isDefault: false },
      ],
      selectedPayment: 'p1',
      plus: { active: false, since: null, cancelAttempts: 0, trialUsed: false, renewsOn: null },
      credits: 0,
      cart: {},          /* slug -> { lines: [], updated } */
      orders: [],
      activeOrderId: null,
      favorites: [],
      recentSearches: [],
      promo: { applied: null, used: [] },
      seen: {},
      bodymax: { history: [], badges: [], firstTs: null, dismissed: [] },
      meta: { installedAt: now, orderCount: 0, lifetimeSpend: 0, lifetimeFees: 0, lifetimeTips: 0, lifetimeCalories: 0 },
    };
  }

  var state = null;
  var subs = [];
  var saveTimer = null;

  function migrate(s) {
    var d = defaults();
    if (!s || s.v !== VERSION) return d;
    /* shallow-merge any keys added since the save was written */
    Object.keys(d).forEach(function (k) {
      if (s[k] === undefined) s[k] = d[k];
    });
    Object.keys(d.settings).forEach(function (k) {
      if (s.settings[k] === undefined) s.settings[k] = d.settings[k];
    });
    Object.keys(d.settings.notifications).forEach(function (k) {
      if (s.settings.notifications[k] === undefined) s.settings.notifications[k] = d.settings.notifications[k];
    });
    return s;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    if (!raw) return defaults();
    try { return migrate(JSON.parse(raw)); } catch (e) { return defaults(); }
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota / blocked */ }
    }, 90);
  }

  var store = {
    get state() { return state; },
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
