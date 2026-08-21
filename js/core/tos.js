/* FoodBang — the Terms, and the fact that they change.

   The only mechanism in this app that can retroactively worsen a rule you have
   already learned. Everything else escalates what happens NEXT; this reaches back
   and edits something you thought you understood — including §4.2, which is why
   the tracker's best line gets worse over time instead of repeating.

   Pure and DOM-free: the version table and the gate arithmetic live here, and
   js/ui/checkout.js owns the modal that presents them. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* The labels continue the app version already printed on the Account screen —
     v9.4.1 (build 40118) — rather than starting a second, contradictory scheme. */
  var VERSIONS = [
    { n: 1, label: '9.4.1', fries: 'one (1) fry', diff: [] },
    {
      n: 2, label: '9.4.2', fries: 'one (1) fry',
      diff: [
        '§2 — "Estimated arrival" is defined as an estimate of an arrival, and not as an estimate of your arrival or of any arrival.',
        '§7 — Fees quoted at the time of order are quoted at the time of order.',
        '§11 — The Fee Transparency Fee is now itself transparent, and is billed.',
      ],
    },
    {
      n: 3, label: '9.4.3', fries: 'two (2) fries',
      diff: [
        '§4.2 — Slinger tribute increased from one (1) fry to two (2).',
        '§9 — Arbitration venue moved to a jurisdiction to be selected at the time of the dispute.',
        '§14 — Order-time and delivery-time assessments are reconciled. Where they are equal, reconciliation is still performed.',
      ],
    },
    {
      /* `fries` is substituted into "{fries} fry as tribute", so it has to stay a
         bare quantity. The clause lives in friesNote and is appended to the beat's
         subtext instead. */
      n: 4, label: '9.4.4', fries: 'two (2) fries',
      friesNote: 'A third fry is held in reserve. Reserve fries are not consumed and are not returned.',
      diff: [
        '§4.2 — A third fry may be held in reserve. Reserve fries are not consumed and are not returned.',
        '§9 — The jurisdiction selected at the time of the dispute may be selected again.',
        '§18 — Continued use constitutes acceptance. Discontinued use constitutes acceptance.',
      ],
    },
  ];

  /* Presented on the third order, and every fifth after it. */
  var FIRST_AT = 3;
  var EVERY = 5;

  function clampIdx(n) { return FB.clamp((n || 1) - 1, 0, VERSIONS.length - 1); }

  FB.tos = {
    VERSIONS: VERSIONS,
    FIRST_AT: FIRST_AT,
    EVERY: EVERY,
    LATEST: VERSIONS[VERSIONS.length - 1].n,

    /** the version this account has accepted */
    version: function () { return (FB.S().tos && FB.S().tos.version) || 1; },
    entry: function (n) { return VERSIONS[clampIdx(n)]; },
    label: function (n) { return FB.tos.entry(n === undefined ? FB.tos.version() : n).label; },
    /** how many fries the Slinger is entitled to under the terms in force */
    fries: function (n) { return FB.tos.entry(n === undefined ? FB.tos.version() : n).fries; },
    friesNote: function (n) { return FB.tos.entry(n === undefined ? FB.tos.version() : n).friesNote || null; },

    /** does placing order number `ordinal` require accepting a new version first? */
    dueAt: function (ordinal) {
      if (ordinal < FIRST_AT) return null;
      if ((ordinal - FIRST_AT) % EVERY !== 0) return null;
      var want = Math.min(VERSIONS.length, 2 + Math.floor((ordinal - FIRST_AT) / EVERY));
      return want > FB.tos.version() ? want : null;
    },

    /** the version an order about to be placed would have to accept, or null */
    due: function () {
      return FB.tos.dueAt(((FB.S().meta && FB.S().meta.orderCount) || 0) + 1);
    },

    accept: function (n) {
      FB.store.set(function (st) {
        st.tos = st.tos || { version: 1, acceptedAt: null, accepted: [] };
        st.tos.version = n;
        st.tos.acceptedAt = Date.now();
        if (st.tos.accepted.indexOf(n) < 0) st.tos.accepted.push(n);
        return st;
      }, { silent: true });
    },
  };
})(window.FB);
