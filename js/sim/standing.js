/* FoodBang — Standing.

   A loyalty ladder that demotes you. Every order raises it; every day without one
   lowers it. Nothing outside BODYMAX changed as you used this app — order forty was
   byte-identical to order one — and a platform of this disposition should get worse
   the longer you stay and should notice when you stop.

   The table and the decay curve are pure: numbers in, numbers out, no DOM and no
   state, so they are testable headlessly the way js/core/fees.js is. Everything
   that reads or writes st.standing lives in the callers. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* Each tier's benefit is a waiver on a fee you would not have paid anyway. */
  var TIERS = [
    { key: 0, name: 'PROVISIONAL', at: 0,
      benefit: 'No benefits are conferred at this tier. The tier itself is the benefit.' },
    { key: 1, name: 'RESIDENT', at: 3,
      benefit: 'Your Small Order Fee is waived on orders that would not have incurred one.' },
    { key: 2, name: 'SUSTAINING', at: 8,
      benefit: 'Priority routing during hours in which routing is not performed.' },
    { key: 3, name: 'PREFERRED HOUSEHOLD', at: 16,
      benefit: 'Your name is printed on the receipt, which is not issued.' },
    { key: 4, name: 'CORNERSTONE', at: 30,
      benefit: 'A dedicated line, staffed during the window in which you are asleep.' },
  ];

  /* The upkeep amounts live in js/core/fees.js — it is the file under direct test
     and it must stay require-able with nothing but util.js loaded, so it cannot
     look anything up in here. Read back so there is still exactly one table. */
  function UPKEEP() { return (FB.fees && FB.fees.STANDING_UPKEEP) || [0]; }

  var DECAY_PER_DAY = 1;

  function tierFor(points) {
    var t = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (points >= TIERS[i].at) t = TIERS[i];
    return t.key;
  }

  FB.standing = {
    TIERS: TIERS,
    DECAY_PER_DAY: DECAY_PER_DAY,
    MAX_POINTS: TIERS[TIERS.length - 1].at + 20,

    tierFor: tierFor,
    tier: function (key) { return TIERS[FB.clamp(key || 0, 0, TIERS.length - 1)]; },
    name: function (key) { return FB.standing.tier(key).name; },
    upkeep: function (key) { var u = UPKEEP(); return u[FB.clamp(key || 0, 0, u.length - 1)] || 0; },

    /** points needed for the next tier, or null at the top */
    toNext: function (points) {
      var t = tierFor(points);
      if (t >= TIERS.length - 1) return null;
      return TIERS[t + 1].at - points;
    },

    /** an order is worth more when it is larger, but never by much */
    earn: function (orderTotal) {
      return 1 + Math.min(2, Math.floor((orderTotal || 0) / 60));
    },

    /** points lost over a span. Day-granular, so a page reload cannot decay you. */
    decay: function (points, days) {
      if (!(days > 0)) return points;
      return Math.max(0, points - days * DECAY_PER_DAY);
    },

    /** whole days between two stamps, floored — the unit decay is charged in */
    daysBetween: function (from, to) {
      if (!from) return 0;
      return Math.max(0, Math.floor((to - from) / 86400000));
    },

    /* Run ONCE at boot, never in a render path. Day-granular against
       decayedThrough, so a page reload cannot decay you and cannot re-persist
       state on every paint — and cannot fire a second demotion for the same day.
       Returns the tier lost, or null. */
    settle: function () {
      var st = FB.S();
      var sd = st.standing;
      if (!sd.lastOrderAt) return null;              /* nothing to decay from */
      var from = sd.decayedThrough || sd.lastOrderAt;
      var days = FB.standing.daysBetween(from, Date.now());
      if (days <= 0) return null;
      var before = sd.tier;
      var points = FB.standing.decay(sd.points, days);
      var tier = FB.standing.tierFor(points);
      FB.store.set(function (s) {
        s.standing.points = points;
        s.standing.tier = tier;
        s.standing.decayedThrough = from + days * 86400000;
        s.standing.seenTier = tier;
        return s;
      }, { silent: true });
      return tier < before ? { from: before, to: tier, days: days } : null;
    },
  };
})(window.FB);
