/* FoodBang — application state, persisted to localStorage */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var KEY = 'foodbang.state.v1';
  var VERSION = 1;

  /* WHO YOU ARE THIS TIME. The account used to be one hardcoded person, so every
     save that has ever existed belonged to Dana Whitfield. The roster is a mix of
     people and the sort of entity that also orders lunch.

     Picked ONCE, seeded on the save's own creation time, and then STORED — which is
     what keeps it inside the no-unseeded-randomness rule. A render reads the stored
     value and can never reshuffle it; only a fresh save draws again. Do not move this
     into a render path, and do not re-derive it from `now` on read: a save opened
     tomorrow must still be the same person. */
  var USERS = [
    { name: 'Dana Whitfield',        handle: '@dana',      entity: false },
    { name: 'Roy Pankhurst',         handle: '@roy_p',     entity: false },
    { name: 'Marisol Ade-Fenwick',   handle: '@mfenwick',  entity: false },
    { name: 'K. Obuya',              handle: '@kobuya',    entity: false },
    { name: 'Terrence Vaal Jr.',     handle: '@tvaaljr',   entity: false },
    { name: 'Priya Raghunathan',     handle: '@praghu',    entity: false },
    { name: 'Wendell Sharp-Coombes', handle: '@wsharpc',   entity: false },
    { name: 'Nadia Ferreiro',        handle: '@nferreiro', entity: false },
    { name: 'Bo Lindqvist',          handle: '@bolind',    entity: false },
    { name: 'Cassiopeia Nwankwo',    handle: '@cnwankwo',  entity: false },
    /* Not people. They order lunch anyway, and the app treats them identically —
       which is the joke, so nothing anywhere comments on it. */
    { name: 'MERIDIAN HOLDINGS LLC', handle: '@meridian',  entity: true },
    { name: 'The Pemberton Trust',   handle: '@pembtrust', entity: true },
    { name: 'Unit 12-B (Household)', handle: '@unit12b',   entity: true },
    { name: 'Estate of A. Doyle',    handle: '@adoyle_es', entity: true },
    { name: 'NIGHT SHIFT — FLOOR 4', handle: '@floor4',    entity: true },
  ];

  function pickUser(now) {
    var r = FB.seeded('user:' + now);
    var i = Math.floor(r() * USERS.length) % USERS.length;
    var u = USERS[i];
    var digits = 1000 + Math.floor(r() * 8999);
    return {
      name: u.name,
      handle: u.handle,
      email: u.handle.replace('@', '') + '@example.invalid',
      phone: '(555) 0' + String(10 + (i * 7) % 89) + '-' + digits,
      avatar: 'assets/app/user/' + String((i % USERS.length) + 1).padStart(2, '0') + '.webp',
      entity: !!u.entity,
      joined: now - 1000 * 60 * 60 * 24 * (180 + Math.floor(r() * 900)),
    };
  }

  function defaults() {
    var now = Date.now();
    return {
      v: VERSION,
      /* Write counter. Two tabs each hold their own copy of the save and each writes
         the WHOLE document over one key, so the second tab to write silently
         discarded whatever the first had recorded — an order, its Standing points,
         its BangBux grant and its BODYMAX row, all at once, while the tab that
         placed it went on displaying them. This is how a tab knows another one has
         moved ahead of it. Adding a field needs no VERSION bump: fillDefaults
         backfills it on every existing save. */
      w: 0,
      user: pickUser(now),
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
      plus: { active: false, since: null, cancelAttempts: 0, cancelEntries: 0, trialUsed: false,
              renewsOn: null, saved: 0, paid: 0, retentionUsed: 0 },
      scrip: [],            /* BangBux™ grants, each with an issue time. see js/core/scrip.js */
      cart: {},          /* slug -> { lines: [], updated } */
      orders: [],
      activeOrderId: null,
      favorites: [],
      recentSearches: [],
      standing: { points: 0, tier: 0, lastOrderAt: null, decayedThrough: null, seenTier: 0 },
      tos: { version: 1, acceptedAt: null, accepted: [] },
      restock: [],          /* item ids you have paid to be told about */
      slingers: [],         /* the nine people in your area. see js/sim/slingers.js */
      notifs: [],           /* the notification centre. see js/core/notifs.js */
      notifsThrough: 0,     /* how far the boot backlog has synthesised */
      promo: { applied: null, used: [] },
      seen: {},
      /* Which side of the switch you are on. 'order' is the app this has always
         been; 'sling' is the same app from the other end of the transaction. A
         string rather than a boolean because a third mode is a plausible future and
         `mode === 'sling'` reads at the call site, where `!!slinging` does not. */
      mode: 'order',
      /* The courier side. `run` is the live run or null — one object carrying its
         whole timetable, written once when the mission is accepted and only ever
         answered into, so the ticker is a pure replay and two tabs converge.
         `standing` is what each of the twenty thinks of you, keyed by slug. */
      slinging: {
        since: null,
        run: null,
        completed: 0,
        kept: 0,
        broken: 0,
        /* `earned` is NET of the statement, because that is what was paid. `deducted`
           is the running total the statement took back, and it is the only figure in
           this mode that climbs on every run — net is $0.00 on any run below the
           break-even and on the first statement of every day. `accessAt` stamps the
           last day the access block was charged. */
        earned: 0,
        deducted: 0,
        scrip: 0,
        accessAt: null,
        /* Photographs the courier has taken and kept. An ARRAY, so fillDefaults never
           merges into it — it is the player's collection and only ever grows here. */
        gallery: [],
        shots: 0,
        standing: {},
        /* WHAT YOU HAVE CARRIED. slug -> the stamp of the first run there whose rule
           you kept. Deliberately NOT `standing`: standing is an opinion and it moves
           both ways, and a room you have stood in cannot be un-stood-in by a later
           bad night. Write-once and monotone. A plain object, so fillDefaults gives
           every existing save {} — which reads correctly as "nothing carried yet". */
        learned: {},
        platform: 0,      /* what the platform makes of the company you keep */
        log: [],          /* finished runs, newest first, capped in migrate() */
      },
      /* `flags` and `maxCal` are durable because HISTORY_CAP truncates `history`,
         and metrics() folds over it — so an achievement earned on order 3 was
         RETRACTED on order 201 while its id still sat in `badges`. New fields need
         nothing but a line here: fillDefaults backfills every save at any depth. */
      bodymax: { history: [], badges: [], firstTs: null, dismissed: [], flags: {}, maxCal: 0 },
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
      var wantObj = dv !== null && typeof dv === 'object';
      var sv = saved[k];
      var haveObj = sv !== null && typeof sv === 'object';
      if (sv === undefined) {
        saved[k] = wantObj ? FB.deep(dv) : dv;
      } else if (wantObj && (!haveObj || Array.isArray(dv) !== Array.isArray(sv))) {
        /* Present, but the wrong SHAPE: `orders: {}` or `meta: null`. Nothing here
           repaired it, and the array guards in migrate() all no-op on a non-array —
           so a save like that reached FB.tracker.resume() at boot, threw on
           `.filter`, and left the splash up forever. A wrong-shaped value cannot be
           the user's data in any form the app could read, so the default replaces
           it. Arrays of the right shape are still never merged into. */
        saved[k] = FB.deep(dv);
      } else if (isPlain(dv) && isPlain(sv)) {
        fillDefaults(sv, dv);
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
    if (s.slinging && Array.isArray(s.slinging.log) && s.slinging.log.length > 40) {
      s.slinging.log.length = 40;
    }
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
      state.w = (state.w || 0) + 1;
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
    /* Take on a save another tab wrote. Runs it back through migrate(), so an
       incoming document is treated exactly like one read at boot, and emits so every
       subscriber repaints. Deliberately does NOT persist: adopting is not a change,
       and writing here would bounce the counter back and forth between two tabs
       forever. Returns false when the incoming copy is not actually newer.

       js/core may not touch the DOM, so nothing here listens for the `storage`
       event — js/app.js owns that and calls this. */
    adopt: function (raw) {
      var next;
      try { next = migrate(JSON.parse(raw)); } catch (e) { return false; }
      if (!next || typeof next !== 'object') return false;
      if ((next.w || 0) <= (state.w || 0)) return false;
      state = next;
      store.emit();
      return true;
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
