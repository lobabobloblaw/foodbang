/* FoodBang — interaction latency.

   An interface that answers in zero milliseconds reads as a diagram of an app
   rather than an app: a real request leaves the building, crosses a network and
   comes back. Every number below is small — the point is believability, not
   sluggishness — and every one of them is spent showing the user that something
   is happening rather than hiding a frozen control.

   The spread is deliberately ASYMMETRIC, and that asymmetry is the joke. This
   platform is quick to accept money and slow to reconsider it: adding to a cart
   clears in under a quarter of a second, taking something back out takes half a
   second, and asking it to honour a promo code takes the better part of one.
   Nothing in the copy says so; it is only ever in the timing. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* [floor, ceiling] in milliseconds */
  var KINDS = {
    /* the platform, accepting money */
    cartAdd:    [140, 250],
    tipBoost:   [240, 400],
    plusJoin:   [380, 600],
    reorder:    [520, 780],
    /* the platform, doing something for you */
    save:       [340, 520],
    rate:       [360, 540],
    /* the platform, finding somebody to carry it. Scaled by surge at the call site,
       because the one thing a dispatch queue genuinely depends on is how many other
       people are ordering right now. */
    dispatch:   [900, 1450],
    /* the platform, reconsidering */
    cartRemove: [420, 640],
    promo:      [700, 1150],
    plusCancel: [860, 1350],
    generic:    [200, 340],
  };

  /* A counter, so the same action twice running does not take exactly the same
     time — which is the tell that gives an artificial delay away. Seeded rather
     than Math.random(): randomness in this app is reproducible by doctrine, and a
     bug that only shows at one particular delay should be reachable twice. */
  var calls = 0;

  FB.latency = {
    KINDS: KINDS,

    /** milliseconds one interaction of this kind should take */
    ms: function (kind) {
      var st = typeof FB.S === 'function' ? FB.S() : null;
      if (st && st.settings && st.settings.instantInterface) return 0;
      var r = KINDS[kind] || KINDS.generic;
      var rnd = FB.seeded(kind + ':' + (calls++))();
      return Math.round(r[0] + (r[1] - r[0]) * rnd);
    },

    /** run fn after a plausible delay. Returns a cancel function. */
    run: function (kind, fn) {
      var ms = FB.latency.ms(kind);
      if (!ms) { fn(); return function () {}; }
      var t = setTimeout(fn, ms);
      return function () { clearTimeout(t); };
    },
  };
})(window.FB);
