/* FoodBang — which photograph the courier took.
   The app has said "Photo attached" since the day it shipped and then shown one of
   three pictures chosen by hashing the order id, blind to everything it already knew
   about the delivery. The pool is now tagged and the tags are read off the order, so
   a 3 AM drop at a dark door and a lunchtime hand-off at an office desk can never
   draw the same frame. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* Every photograph, with the facets it is valid for.

     `odd` is descriptive and nothing branches on it. It is here so a check can
     assert the pool has not quietly drifted into being entirely ordinary — the
     strange ones are the point, and they are the ones an editor trims first. */
  /* THE VESSEL RULE. A courier keeps the insulated thermal bag — it is their own kit
     and it goes back on the bike. What is left at the door is the customer's own
     takeout bag, and it is paper or plastic, never the thermal one. Eleven of the
     first thirty-six got this wrong and were reshot; `assets/app/proof-delivery-2.webp`
     gets it wrong too and is deliberately NOT in this pool, though the file is left
     on disk rather than deleted. */
  var POOL = [
    { file: 'assets/app/proof/hand-day-01.webp', drop: 'hand', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/hand-day-04.webp', drop: 'hand', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/hand-day-07.webp', drop: 'hand', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/routine-06-reception-counter-succul.webp', drop: 'hand', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/routine-12-corridor-windowsill.webp', drop: 'hand', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/hand-dusk-01.webp', drop: 'hand', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/hand-dusk-04.webp', drop: 'hand', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/hand-dusk-07.webp', drop: 'hand', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/routine-07-desk-keyboard-mug.webp', drop: 'hand', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/routine-09-lobby-bench-wastebasket.webp', drop: 'hand', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/hand-night-01.webp', drop: 'hand', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/hand-night-05.webp', drop: 'hand', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/hand-night-07.webp', drop: 'hand', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/routine-08-break-room-cups.webp', drop: 'hand', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/routine-13-service-window-ledge.webp', drop: 'hand', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/leave-day-02.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/leave-day-04.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/leave-day-07.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/leave-day-08.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/routine-01-porch-step-terracotta.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/routine-04-back-step-recycling.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof/routine-11-porch-empty-pots.webp', drop: 'leave', light: 'day', tier: 'routine' },
    { file: 'assets/app/proof-delivery-3.webp', drop: 'leave', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/leave-dusk-04.webp', drop: 'leave', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/routine-02-wooden-stoop-umbrella.webp', drop: 'leave', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/routine-10-walkway-brick-planter.webp', drop: 'leave', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof/routine-15-garden-wall-gate.webp', drop: 'leave', light: 'dusk', tier: 'routine' },
    { file: 'assets/app/proof-delivery.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/leave-night-04.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/leave-night-07.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/routine-03-landing-bicycle-wheel.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/routine-05-side-door-wreath.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/routine-14-doormat-screen-door.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/routine-16-corridor-floor-umbrella-.webp', drop: 'leave', light: 'night', tier: 'routine' },
    { file: 'assets/app/proof/hand-day-06.webp', drop: 'hand', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/noted-04-toppled-pen-cup.webp', drop: 'hand', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/noted-09-fallen-blind-slat.webp', drop: 'hand', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/hand-dusk-03.webp', drop: 'hand', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/noted-07-bin-lid-on-the-floor.webp', drop: 'hand', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/noted-14-luggage-cart-lost-castor.webp', drop: 'hand', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/hand-night-02.webp', drop: 'hand', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/hand-night-04.webp', drop: 'hand', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/hand-night-06.webp', drop: 'hand', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/noted-05-coffee-under-the-bag.webp', drop: 'hand', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/noted-12-dislodged-ceiling-tile.webp', drop: 'hand', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/fauna-noted-cat.webp', drop: 'leave', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/fauna-noted-crow.webp', drop: 'leave', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/leave-day-03.webp', drop: 'leave', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/noted-01-tipped-watering-can.webp', drop: 'leave', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/noted-06-split-bottom-seam.webp', drop: 'leave', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/noted-11-umbrella-across-decking.webp', drop: 'leave', light: 'day', tier: 'noted' },
    { file: 'assets/app/proof/fauna-noted-snail.webp', drop: 'leave', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/leave-dusk-02.webp', drop: 'leave', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/noted-03-blown-over-terracotta-po.webp', drop: 'leave', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/noted-10-upended-ice-crate.webp', drop: 'leave', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/pigeon-b.webp', drop: 'leave', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/unbound-noted-doorhand.webp', drop: 'leave', light: 'dusk', tier: 'noted' },
    { file: 'assets/app/proof/leave-night-06.webp', drop: 'leave', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/noted-02-sauce-trail-down-steps.webp', drop: 'leave', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/noted-08-under-the-downpipe.webp', drop: 'leave', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/noted-13-collapsed-shake-cup.webp', drop: 'leave', light: 'night', tier: 'noted' },
    { file: 'assets/app/proof/flagged-09-desk-contents-below.webp', drop: 'hand', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-12-wiped-dust-rectangle.webp', drop: 'hand', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/hand-day-02.webp', drop: 'hand', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-10-graded-sill-stones.webp', drop: 'hand', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-13-stepladder-on-towels.webp', drop: 'hand', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/hand-dusk-02.webp', drop: 'hand', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/hand-dusk-05.webp', drop: 'hand', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/hand-dusk-06.webp', drop: 'hand', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-11-string-across-corridor.webp', drop: 'hand', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/fauna-flagged-gull.webp', drop: 'leave', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-01-four-leaf-cones.webp', drop: 'leave', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-04-gravel-lined-path.webp', drop: 'leave', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-07-squared-wool-blanket.webp', drop: 'leave', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/pigeon-a.webp', drop: 'leave', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/unbound-flagged-childhand.webp', drop: 'leave', light: 'day', tier: 'flagged' },
    { file: 'assets/app/proof/fauna-flagged-catbag.webp', drop: 'leave', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-02-brick-plinth.webp', drop: 'leave', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-05-film-wound-bag.webp', drop: 'leave', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/leave-dusk-03.webp', drop: 'leave', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/leave-dusk-05.webp', drop: 'leave', light: 'dusk', tier: 'flagged' },
    { file: 'assets/app/proof/fauna-flagged-raccoon.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-03-staked-string-square.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-06-four-upturned-glasses.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/flagged-08-straw-lined-crate.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/leave-night-01.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/leave-night-02.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/leave-night-03.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/leave-night-05.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/unbound-flagged-reflection.webp', drop: 'leave', light: 'night', tier: 'flagged' },
    { file: 'assets/app/proof/escalated-07-porch-inside-corridor.webp', drop: 'hand', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/hand-day-03.webp', drop: 'hand', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/hand-day-05.webp', drop: 'hand', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-03-counter-through-the-wall.webp', drop: 'hand', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-09-ceiling-underfoot-break-.webp', drop: 'hand', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-05-stairs-into-ceiling.webp', drop: 'hand', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-11-door-hinged-into-floor.webp', drop: 'hand', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/hand-night-03.webp', drop: 'hand', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-01-upside-down-front-door.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-06-kerbside-kitchen-counter.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-10-knee-high-front-door.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/fauna-escalated-flock.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/leave-day-01.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/leave-day-05.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/leave-day-06.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/unbound-escalated-flood.webp', drop: 'leave', light: 'day', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-04-door-one-storey-up.webp', drop: 'leave', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-12-mirrored-upside-down-por.webp', drop: 'leave', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/fauna-escalated-dog.webp', drop: 'leave', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/leave-dusk-01.webp', drop: 'leave', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/leave-dusk-06.webp', drop: 'leave', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/unbound-escalated-window.webp', drop: 'leave', light: 'dusk', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-02-freestanding-door-frame-.webp', drop: 'leave', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/escalated-08-path-up-the-wall.webp', drop: 'leave', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/unbound-escalated-crouch.webp', drop: 'leave', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/unbound-escalated-fire.webp', drop: 'leave', light: 'night', tier: 'escalated' },
    { file: 'assets/app/proof/unfiled-05-carpet-up-the-wall.webp', drop: 'hand', light: 'day', tier: 'unfiled' },
    { file: 'assets/app/proof/hand-dusk-08.webp', drop: 'hand', light: 'dusk', tier: 'unfiled' },
    { file: 'assets/app/proof/unfiled-06-corridor-window.webp', drop: 'hand', light: 'dusk', tier: 'unfiled' },
    { file: 'assets/app/proof/hand-night-08.webp', drop: 'hand', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/unfiled-07-shrinking-chairs.webp', drop: 'hand', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/leave-day-09.webp', drop: 'leave', light: 'day', tier: 'unfiled' },
    { file: 'assets/app/proof/unbound-unfiled-beekeeper.webp', drop: 'leave', light: 'day', tier: 'unfiled' },
    { file: 'assets/app/proof/unfiled-02-unbroken-snow.webp', drop: 'leave', light: 'day', tier: 'unfiled' },
    { file: 'assets/app/proof/unfiled-04-puddle-skin.webp', drop: 'leave', light: 'day', tier: 'unfiled' },
    { file: 'assets/app/proof/leave-dusk-07.webp', drop: 'leave', light: 'dusk', tier: 'unfiled' },
    { file: 'assets/app/proof/unbound-unfiled-crowd.webp', drop: 'leave', light: 'dusk', tier: 'unfiled' },
    { file: 'assets/app/proof/unbound-unfiled-mirror.webp', drop: 'leave', light: 'dusk', tier: 'unfiled' },
    { file: 'assets/app/proof/unfiled-01-dry-ring-in-rain.webp', drop: 'leave', light: 'dusk', tier: 'unfiled' },
    { file: 'assets/app/proof/fauna-unfiled-cats.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/fauna-unfiled-horse.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/leave-night-08.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/leave-night-09.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/unbound-unfiled-doorway.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/unbound-unfiled-row.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
    { file: 'assets/app/proof/unfiled-03-leaves-held-midair.webp', drop: 'leave', light: 'night', tier: 'unfiled' },
  ];

  /* Read off the HOUR, not off FB.world's daypart table. `dinner` spans 17:00-21:00,
     which is broad daylight in June and full dark in December, and a photograph of a
     doorstep is about the sky rather than about the meal. This also keeps proof.js
     free of a world lookup, so it can be required with only util.js loaded. */
  function lightAt(ts) {
    var h = new Date(ts).getHours();
    if (h >= 7 && h < 17) return 'day';
    if ((h >= 17 && h < 20) || (h >= 5 && h < 7)) return 'dusk';
    return 'night';
  }

  /* ---------------- rarity ----------------
     On the courier side a delivery photograph is loot. The tiers are ordinary loot
     tiers and the app never says so: what the player reads is the platform's filing
     category for the incident, and the platform is not impressed by any of it.

     Weights are TIER-level and sum to 100, so a tier's odds are exactly its number
     no matter how many photographs sit in it — add six more legendaries tomorrow and
     UNFILED is still 1.5%. Weighting per-photograph instead couples the curve to the
     contents, and every photograph added quietly re-tunes the game. */
  var TIERS = [
    { key: 'routine',   label: 'ROUTINE',   weight: 55,
      note: 'Nothing was recorded.' },
    { key: 'noted',     label: 'NOTED',     weight: 25,
      note: 'Recorded. No action follows.' },
    { key: 'flagged',   label: 'FLAGGED',   weight: 13,
      note: 'Retained for review. Review is not scheduled.' },
    { key: 'escalated', label: 'ESCALATED', weight: 5.5,
      note: 'Referred. The referral has no recipient.' },
    { key: 'unfiled',   label: 'UNFILED',   weight: 1.5,
      note: 'This photograph has no category. It has been kept.' },
  ];
  var TIER_TOTAL = TIERS.reduce(function (t, x) { return t + x.weight; }, 0);

  FB.proof = {
    POOL: POOL,
    TIERS: TIERS,
    lightAt: lightAt,

    tier: function (key) {
      return TIERS.filter(function (t) { return t.key === key; })[0] || TIERS[0];
    },

    /** every photograph in a tier, in pool order */
    inTier: function (key) {
      return POOL.filter(function (p) { return p.tier === key; });
    },

    /** THE ROLL. Seeded on the run id, so the photograph a run yields was decided the
        moment the run existed: pressing the button REVEALS it, it does not decide it,
        and reloading cannot re-roll it. Two draws off one stream — the tier, then the
        photograph within it — so a tier's odds do not drift with its population.
        Falls back down the tiers rather than returning nothing, because an empty tier
        must not hand a screen `undefined`. */
    roll: function (seed) {
      var r = FB.seeded('proofroll:' + String(seed || ''));
      var x = r() * TIER_TOTAL;
      var i = 0, acc = 0;
      for (; i < TIERS.length; i++) { acc += TIERS[i].weight; if (x < acc) break; }
      if (i >= TIERS.length) i = TIERS.length - 1;
      var pick = r();
      for (var k = i; k >= 0; k--) {
        var rows = FB.proof.inTier(TIERS[k].key);
        if (rows.length) {
          return { file: rows[Math.floor(pick * rows.length) % rows.length].file, tier: TIERS[k].key };
        }
      }
      return { file: POOL[0].file, tier: POOL[0].tier || 'routine' };
    },


    /** what this order asks of a photograph */
    facets: function (o) {
      var at = (o && (o.deliveredAt || o.deliverAt)) || Date.now();
      return {
        /* Anything that is not an explicit hand-off is a doorstep. A missing address
           on a legacy order therefore reads as 'leave', which is what the three
           original photographs already were. */
        drop: (o && o.address && o.address.dropoff === 'hand') ? 'hand' : 'leave',
        light: lightAt(at),
      };
    },

    /** Widening, and never empty: a facet pair with nothing in it must still return
        a photograph rather than a broken image. Exact bucket, then anything for the
        same drop, then the whole pool. */
    candidates: function (drop, light) {
      var exact = POOL.filter(function (p) { return p.drop === drop && p.light === light; });
      if (exact.length) return exact;
      var byDrop = POOL.filter(function (p) { return p.drop === drop; });
      if (byDrop.length) return byDrop;
      return POOL;
    },

    /** Seeded on the order id, so the photograph attached to an order is the same
        photograph forever — including after a reload, and including on the receipt
        a year later. Never Math.random(). */
    pick: function (o) {
      var f = FB.proof.facets(o);
      var c = FB.proof.candidates(f.drop, f.light);
      /* FB.seeded, not FB.hash. Both are deterministic and either is correct; seeded
         simply COVERS the pool far faster — every photograph is reachable inside a
         couple of thousand orders, where hashing modulo the bucket length leaves a
         few indices almost never visited and needs tens of thousands. The original
         code hashed modulo THREE, where that could not show.

         Note what this does NOT fix, because it is not a defect: photographs are not
         equally likely across the whole pool, and cannot be. `day` covers ten hours
         and `dusk` only five, and the buckets are different sizes, so the structural
         spread is about 3x end to end. That is fine here — a customer is shown one
         photograph per order and is not collecting them. Evenness is the ROLL's job,
         and roll() is uniform inside a tier because the tier table, not the bucket,
         is what decides rarity. */
      return c[Math.floor(FB.seeded('proofpick:' + String((o && o.id) || ''))() * c.length) % c.length].file;
    },
  };
})(window.FB);
