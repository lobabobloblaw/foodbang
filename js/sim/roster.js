/* FoodBang — the Slinger roster.

   The FILE is roster.js and the order field is personId, and neither name is an
   accident. tools/rebrand.cjs rewrites the courier noun wherever it appears as a
   word — including inside a script path in index.html, which would then have
   pointed at a file that no longer had that name — and its word boundary misses a
   camelCase suffix, so an id built out of that noun would have carried the
   outgoing brand through every future rename. --selfcheck found both, which is
   what it is for.

   Identity was FB.C.slinger(seed), seeded on the ORDER id, so a given Slinger
   structurally could never recur: every delivery in the app's life was made by a
   stranger. There are nine people in your area now, their tenure counts up across
   your whole save, and the one you rated two stars opens the chat differently.

   FB.C.slinger remains the generator — the name, vehicle and photo tables live
   there and are not duplicated here — so this file decides WHO, not what they are
   called. Assignment is seeded and weighted, never Math.random(). */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var SIZE = 9;

  /* Built once from a fixed seed, so the same nine people exist in every save. */
  function build() {
    var out = [];
    for (var i = 0; i < SIZE; i++) {
      var g = FB.C.slinger('roster:' + i);
      out.push({
        id: 'sl' + i,
        name: g.name, rating: g.rating, vehicle: g.vehicle, photo: g.photo,
        deliveries: g.deliveries,
        timesWithYou: 0,
        yourRatings: [],
        lastSeenTs: null,
      });
    }
    return out;
  }

  function roster() {
    var st = FB.S();
    if (!st.slingers || !st.slingers.length) {
      FB.store.set(function (s) { s.slingers = build(); return s; }, { silent: true });
    }
    return FB.S().slingers;
  }

  function avgRating(s) {
    if (!s.yourRatings || !s.yourRatings.length) return null;
    return FB.round2(FB.sum(s.yourRatings, function (n) { return n; }) / s.yourRatings.length);
  }

  FB.slingers = {
    SIZE: SIZE,
    all: roster,
    get: function (id) {
      return roster().filter(function (s) { return s.id === id; })[0] || null;
    },
    avgRating: avgRating,

    /* Weighted toward anyone you have rated 4+, because a platform that has your
       ratings would use them, and away from anyone you rated 2 or less — who still
       turns up, because they have to work somewhere. Seeded on the order id. */
    assign: function (orderId, at) {
      var list = roster();
      var rnd = FB.seeded('assign:' + orderId);
      var pool = [];
      list.forEach(function (s) {
        var avg = avgRating(s);
        var weight = 3;
        if (avg !== null) weight = avg >= 4 ? 6 : avg <= 2.5 ? 1 : 3;
        for (var i = 0; i < weight; i++) pool.push(s);
      });
      var picked = pool[Math.floor(rnd() * pool.length)] || list[0];
      FB.store.set(function (st) {
        var s = (st.slingers || []).filter(function (x) { return x.id === picked.id; })[0];
        if (s) { s.timesWithYou = (s.timesWithYou || 0) + 1; s.lastSeenTs = at || Date.now(); }
        return st;
      }, { silent: true });
      return FB.slingers.get(picked.id);
    },

    rate: function (id, stars) {
      FB.store.set(function (st) {
        var s = (st.slingers || []).filter(function (x) { return x.id === id; })[0];
        if (s) { s.yourRatings = (s.yourRatings || []).concat([stars]).slice(-20); }
        return st;
      }, { silent: true });
    },

    /** how this person greets you, given what has passed between you */
    greeting: function (s, reduced) {
      if (!s) return null;
      var avg = avgRating(s);
      if (reduced) return 'you’re the one who changed it';
      if ((s.timesWithYou || 0) <= 1) return null;
      if (avg !== null && avg <= 2.5) return 'oh. you again';
      if (avg !== null && avg >= 4.5) return 'hey, it’s you. same door?';
      return 'back again';
    },

    /** the line the track screen shows above the chat */
    tenureLine: function (s) {
      if (!s || (s.timesWithYou || 0) <= 1) return null;
      var avg = avgRating(s);
      return 'Your ' + FB.ordinal(s.timesWithYou) + ' delivery from ' + s.name + '.' +
        (avg !== null ? ' You have rated them ' + avg.toFixed(1) + '★ on average. They have not rated you.' : '');
    },
  };
})(window.FB);
