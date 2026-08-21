/* FoodBang — TRACKR™ live order simulation.

   The order runs on the WALL CLOCK, not on a tick counter. At placement it is given
   an absolute timetable — every beat with a real timestamp, and a deliverAt — and
   tick() simply replays whatever is now in the past. That is what makes leaving
   mean something: close the tab during "Preparing", come back tomorrow, and the
   order is delivered with a timeline stamped at the times things happened, rather
   than frozen where you left it and resuming at normal pace.

   One simulated minute is SIM_MS_PER_MIN of real time, so a 29-minute delivery
   takes about a minute to watch and the headline estimate genuinely counts down to
   zero: 29, 24, 18, 9, 2. It only ever revises LATER, and a revision moves
   deliverAt with it, so the countdown can jump up but can never rebound through
   zero on its way down. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* one simulated minute, in real milliseconds */
  var SIM_MS_PER_MIN = 2000;

  /* How long you get to answer when the restaurant runs out. Real seconds, not
     simulated ones: a ninety-second deadline inside a delivery that takes ninety
     seconds to watch is not a deadline, it is the whole order. While it is running
     the order genuinely WAITS — deliverAt moves forward with the clock — which is
     what makes "Hold the order. The order waits. The food does not." true. */
  var INCIDENT_MS = 40000;

  /* The deadline has to expire while the food is still in the kitchen, or answering
     it changes nothing that has not already happened. The check asserting exactly
     that passed by 167 MILLISECONDS on the order id it happened to pick, and 7 of the
     16 candidate ids in its own search would have failed it — so the bound below is
     not a new rule, it is the existing one finally being enforced instead of being
     true by luck. INCIDENT_MIN_MS is the floor worth offering someone: shorter than
     this and the sheet takes longer to read than to answer. */
  var INCIDENT_MIN_MS = 22000;
  var RESOLVE_MARGIN_MS = 6000;

  var STEPS = [
    { key: 'placed',    label: 'Order placed',        pickup: 'Order placed' },
    { key: 'confirmed', label: 'Restaurant notified', pickup: 'Restaurant notified' },
    { key: 'preparing', label: 'Preparing',           pickup: 'Preparing' },
    { key: 'pickup',    label: 'Slinger en route',    pickup: 'Awaiting collection' },
    { key: 'enroute',   label: 'Arriving',            pickup: 'Ready for collection' },
    { key: 'delivered', label: 'Delivered',           pickup: 'Collected' },
  ];

  /* Share of the delivery window each step occupies. The courier does not leave the
     restaurant until the food exists, which is why the map pin used to be 40% of the
     way to your house while the feed still said the bag was being sealed. */
  var WEIGHTS = { placed: 0.06, confirmed: 0.10, preparing: 0.38, pickup: 0.16, enroute: 0.30 };

  /* Each beat is [message, subtext|null, etaDriftMinutes].

     `beats` is the SPINE and always plays in order — "{slinger} has arrived at
     {store}" cannot follow "Order collected" and still make sense, so shuffling the
     whole step was never an option. `extra` is flavour, unlocked by tenure and
     inserted at seeded positions among the spine, so your fortieth delivery goes
     wrong in ways your first could not while the order of events still reads.

     Seeded on the order id, so a reload replays the identical story. */
  var SCRIPT = {
    placed: {
      beats: [
        ['Order received by FoodBang™', 'Your order has entered the system.', 0],
        ['Payment authorized', 'A hold has been placed for the total, plus a margin for the total.', 0],
      ],
      extra: {
        2: [['Order assigned to a fulfilment region', 'The region is not disclosed and is subject to change.', 0]],
        3: [['Order flagged for routine review', 'Review is routine. The flag is not.', 1]],
      },
    },
    confirmed: {
      beats: [
        ['{store} has acknowledged your existence', null, 0],
        ['Order accepted', 'The restaurant has 90 seconds to reject this. It has not.', 0],
        /* TAGGED. Everything about this order already knows who is carrying it — the
           roster draw is seeded on the order id and runs at placement — but this is
           the moment the app is allowed to SAY so. The screen used to draw the
           courier's photo, name and a Message button from the first frame, while the
           feed above it had not mentioned anyone: a median of nine seconds, and up to
           thirty-four, of claiming a person who had not been introduced. */
        ['Slinger {slinger} assigned', '{rating}★ · {deliveries} lifetime deliveries · {vehicle}', 0, 'assign'],
      ],
      extra: {
        2: [['{slinger} was reassigned and then assigned back', 'No explanation will be offered.', 0]],
        3: [['{store} has acknowledged your existence again', 'The second acknowledgement supersedes the first.', 0],
            ['Your household has been recognised', 'Recognition is not a benefit and confers none.', 0]],
      },
    },
    preparing: {
      beats: [
        ['Food is being assembled', null, 0],
        ['Item entering thermal chamber', 'Temperature Maintenance Fee is now active.', 1],
        ['{slinger} has accepted a second order', 'Yours is now #2 of 2.', 4],
        ['Bag sealed', 'Handles attached separately, as licensed.', 0],
      ],
      extra: {
        2: [['{slinger} has accepted a third order', 'Yours is now #3 of 3.', 3],
            ['A substitution was considered', 'It was not made. It was considered, and that has been logged.', 0]],
        3: [['{slinger} has re-entered the restaurant', 'No explanation will be offered.', 2],
            ['Bag re-sealed', 'The first seal has been retained for our records.', 1]],
      },
    },
    pickup: {
      beats: [
        ['{slinger} has arrived at {store}', null, 0],
        ['{slinger} is waiting', 'Standard wait. Waiting is included.', 2],
        ['Order collected', null, 0],
        ['{slinger} has taken {fries} as tribute', 'This is permitted under the Slinger Agreement, §4.2.{note}', 0],
      ],
      extra: {
        2: [['{slinger} is waiting behind someone who is also waiting', 'Both waits are included.', 2]],
        3: [['{slinger} has taken one more fry than §4.2 permits', 'This has been noted in your file, not theirs.', 0],
            ['The order was set down and picked up again', 'By the same person, at the same counter.', 1]],
      },
    },
    enroute: {
      beats: [
        ['{slinger} is 2.1 mi away', null, 0],
        ['{slinger} is 3.4 mi away', 'Route recalculated.', 3],
        ['{slinger} is stationary', 'Reason: not provided.', 5],
        ['{slinger} is moving again', 'No explanation will be offered.', 0],
        ['{slinger} is 0.3 mi away', 'Approaching. Please prepare to receive.', 0],
      ],
      extra: {
        2: [['Route recalculated to avoid a road that is open', null, 2],
            ['{slinger} is 4.0 mi away', 'This is further than when you started reading this.', 3]],
        3: [['{slinger} has stopped at an address that is not yours', 'The stop was brief and is not itemised.', 4],
            ['{slinger} is 0.1 mi away', 'Has been 0.1 mi away for some time.', 2]],
      },
    },
    delivered: {
      beats: [['Delivered', 'Photo attached. The photo is of a door.', 0]],
      extra: {
        3: [['Delivered', 'Photo attached. The photo is of a door, and a bag, and a different bag.', 0]],
      },
    },
  };

  /* A pickup order used to be tracked as a delivery: it assigned a Slinger, drove
     them to your house and ended "Photo attached. The photo is of a door." `mode`
     was written onto the order and read by nothing. */
  var PICKUP_SCRIPT = {
    placed: {
      beats: [
        ['Order received by FoodBang™', 'Your order has entered the system.', 0],
        ['Payment authorized', 'A hold has been placed for the total, plus a margin for the total.', 0],
      ],
      extra: { 3: [['Collection window opened', 'The window is notional and is not enforced at either end.', 0]] },
    },
    confirmed: {
      beats: [
        ['{store} has acknowledged your existence', null, 0],
        ['Order accepted for collection', 'No Slinger has been assigned. You are the Slinger.', 0],
      ],
      extra: { 2: [['You have been assigned a rating', 'It is not shown to you.', 0]] },
    },
    preparing: {
      beats: [
        ['Food is being assembled', null, 0],
        ['Item entering thermal chamber', 'Temperature Maintenance Fee is now active.', 1],
        ['Bag sealed', 'Handles attached separately, as licensed.', 0],
      ],
      extra: { 2: [['A member of staff has looked at the order', 'No action followed.', 1]] },
    },
    pickup: {
      beats: [
        ['Order placed on the collection shelf', 'The shelf is unattended and unmonitored.', 0],
        ['Order remains on the collection shelf', 'Ambient temperature is being maintained by the room.', 2],
      ],
      extra: {
        2: [['Another customer has looked at your order', 'They did not take it. This has been recorded as a non-event.', 2]],
        3: [['Your order has been moved further along the shelf', 'To make room for an order placed after yours.', 3]],
      },
    },
    enroute: {
      beats: [
        ['Ready for collection', 'Please present the order number to a member of staff, who will not ask for it.', 0],
        ['Still ready for collection', 'The Retrieval Facilitation Fee has been charged and the retrieval has not been facilitated.', 3],
      ],
      extra: { 3: [['Still ready for collection', 'This notice will continue at this interval.', 2]] },
    },
    delivered: {
      beats: [['Collected', 'Collection is recorded at the moment the shelf is emptied, by whoever empties it.', 0]],
      extra: { 3: [['Collected', 'Collection is recorded at the moment the shelf is emptied. The shelf was empty on arrival.', 0]] },
    },
  };

  /* Tenure. Read from the order count BEFORE this order — place() increments it
     inside the same store.set — and stored on the order, so a replayed order keeps
     the story it had. Every read is (o.tier || 1): orders in a save written before
     tiers existed have none, and resume() replays them at boot. */
  function tierFor(orderCount) { return orderCount >= 15 ? 3 : orderCount >= 5 ? 2 : 1; }

  var timer = null;
  var listeners = [];

  function scriptFor(o) { return o.mode === 'pickup' ? PICKUP_SCRIPT : SCRIPT; }

  /* The spine, plus whatever tenure has unlocked, inserted among it. ONE function,
     used by both the schedule builder and anything that needs to know how long a
     step runs — two callers deriving the beat list separately is how a wider pool
     silently makes a late order run long. */
  var NAMES_COURIER = /\{slinger\}|\{rating\}|\{deliveries\}|\{vehicle\}/;

  function beatsFor(o, stepKey) {
    var def = scriptFor(o)[stepKey] || { beats: [] };
    var out = def.beats.slice();
    var tier = o.tier || 1;
    var pool = [];
    for (var t = 2; t <= tier; t++) pool = pool.concat((def.extra && def.extra[t]) || []);
    /* NOT an early return on an empty pool any more: a tier-1 order has no extras at
       all, and returning here skipped the courier's quirk with them — so the first
       order a new player places would be the one delivery with no personality in it. */
    var rnd = FB.seeded(o.id + ':' + stepKey);
    var take = FB.shuffle(pool, rnd).slice(0, Math.min(2, pool.length));
    /* The courier's own oddity. Appended to `take` rather than added to the pool, so
       it ALWAYS plays rather than competing for one of two slots — the point is that
       the same person does the same thing every time you get them, and a quirk that
       showed up half the time would read as noise. Keyed on personId, which
       checkout.js writes before build() and which test fixtures do not have, so it is
       simply absent there. Not on a pickup: there is nobody to have a habit. */
    if (o.mode !== 'pickup' && FB.slingers && FB.slingers.quirk) {
      var qk = FB.slingers.quirk(o.personId);
      if (qk && qk[0] === stepKey) take = take.concat([[qk[1], qk[2], 0]]);
    }
    take.forEach(function (ev) {
      /* A one-beat step is not a spine with a headline, it is a single line — and
         appending to it meant the tier-3 "Delivered" variant sat at index 1 while
         build() read index 0, so it could never once play. Replace it instead. */
      if (out.length === 1) { out[0] = ev; return; }
      /* otherwise never at the front: the first beat of a step is its headline */
      var at = 1 + Math.floor(rnd() * out.length);
      /* THE BARRIER. An extra that names the courier cannot be spliced in above the
         beat that introduces them — "{slinger} was reassigned and then assigned back"
         landing before "Slinger {slinger} assigned" reads as a bug, not as flavour.
         Measured before this clamp: the name leaked above its own introduction in a
         third of tier-2 and tier-3 orders. Matched on the TAG rather than on the
         beat's text, so rewording the line cannot silently unhook it. */
      if (NAMES_COURIER.test(ev[0]) || (ev[1] && NAMES_COURIER.test(ev[1]))) {
        var anchor = -1;
        for (var k = 0; k < out.length; k++) if (out[k][3] === 'assign') { anchor = k; break; }
        if (anchor > -1) at = Math.max(at, anchor + 1);
      }
      out.splice(Math.min(at, out.length), 0, ev);
    });
    return out;
  }

  FB.tracker = FB.tracker || {};

  function fill(str, o) {
    return str.replace(/\{store\}/g, o.storeName)
      .replace(/\{slinger\}/g, o.slinger.name)
      .replace(/\{rating\}/g, o.slinger.rating.toFixed(1))
      .replace(/\{deliveries\}/g, o.slinger.deliveries)
      .replace(/\{vehicle\}/g, o.slinger.vehicle)
      /* filled at BUILD time, so an order keeps the terms it was placed under —
         and so §4.2 getting worse actually changes what the Slinger does */
      .replace(/\{fries\}/g, (FB.tos && FB.tos.fries()) || 'one (1) fry')
      .replace(/\{note\}/g, (FB.tos && FB.tos.friesNote()) ? ' ' + FB.tos.friesNote() : '');
  }

  /* ---------------- the timetable ----------------
     Built once, at placement, and stored on the order. Every beat carries the
     absolute moment it happens, so replaying it after any absence produces the same
     timeline with the same timestamps rather than twenty beats stamped "now". */
  function build(o) {
    var rnd = FB.seeded(o.id + 'pace');
    if (!o.tier) o.tier = tierFor((FB.S().meta && FB.S().meta.orderCount) || 0);

    /* A scheduled order does not start cooking when you place it. `scheduled` is a
       clock string the checkout sheet wrote; it was captured and read by nothing,
       so a 9 PM slot began preparing at 2 PM. */
    var slot = o.scheduled ? FB.nextAtMinute(FB.minsOfDay(o.scheduled), o.placedAt) : null;
    o.startAt = slot || o.placedAt;

    /* Drift is known up front — it is in the script — so the beats can be laid out
       across the window the order will ACTUALLY take, while the headline still
       starts at the number the store advertised and is revised later, on air. */
    var chosen = {};
    var totalDrift = 0;
    STEPS.forEach(function (step) {
      chosen[step.key] = beatsFor(o, step.key);
      chosen[step.key].forEach(function (ev) { totalDrift += ev[2] || 0; });
    });
    var span = Math.max(1, (o.etaMin + totalDrift)) * SIM_MS_PER_MIN;

    var sched = [];
    var cursor = 0;
    STEPS.forEach(function (step) {
      if (step.key === 'delivered') return;
      var beats = chosen[step.key] || [];
      var slice = span * (WEIGHTS[step.key] || 0);
      beats.forEach(function (ev, i) {
        /* spread inside the step, with a little jitter so beats do not land on a grid */
        var frac = (i + 0.55 + (rnd() - 0.5) * 0.5) / beats.length;
        sched.push({
          step: step.key,
          text: fill(ev[0], o),
          sub: ev[1] ? fill(ev[1], o) : null,
          drift: ev[2] || 0,
          tag: ev[3] || null,
          at: Math.round(o.startAt + cursor + slice * FB.clamp(frac, 0.05, 0.95)),
        });
      });
      cursor += slice;
    });
    sched.sort(function (a, b) { return a.at - b.at; });

    /* Starts at what the store advertised; every drift beat pushes it out. Computed
       HERE, above the incident, because the incident is bounded by it — read a line
       too late it is undefined, the bound comes out NaN, every comparison against NaN
       is false, and the clamp looks like it is working while doing nothing at all. */
    o.deliverAt = o.startAt + o.etaMin * SIM_MS_PER_MIN;

    /* The restaurant runs out of something, sometimes. Needs at least two lines:
       "remove and be credited" on a single-line order empties an order whose fee
       stack has already been multiplied, which is not a resolution. */
    var lines = o.lines || [];
    if (lines.length >= 2 && FB.seeded('incident:' + o.id)() < incidentChance(o)) {
      var pickRnd = FB.seeded('incident-line:' + o.id);
      var idx = Math.floor(pickRnd() * lines.length);
      /* fires inside preparing, with room left for the deadline before delivery */
      /* the FIRST preparing beat, so the whole deadline fits inside the window
         before the order was due to arrive — a deadline that expires after the food
         has landed is not a deadline */
      var prep = sched.filter(function (b) { return b.step === 'preparing'; });
      var at = prep.length ? prep[0].at : o.startAt + span * 0.2;
      /* Bounded by whichever comes first: the courier taking the bag, or the arrival
         the store advertised. Past either one there is nothing left to decide. */
      var pick = sched.filter(function (b) { return b.step === 'pickup'; });
      var bound = Math.min(pick.length ? pick[0].at : o.deliverAt, o.deliverAt) - RESOLVE_MARGIN_MS;
      /* pull the question EARLIER rather than delete it — a short-ETA store should
         still be able to run out of something */
      if (bound - at < INCIDENT_MIN_MS) at = bound - INCIDENT_MIN_MS;
      var prepStart = o.startAt + span * (WEIGHTS.placed + WEIGHTS.confirmed);
      var ms = FB.clamp(bound - at, INCIDENT_MIN_MS, INCIDENT_MS);
      /* and drop it only when the window genuinely cannot hold a deadline anyone
         could answer — not silently, but by there being nowhere to put it */
      if (at >= prepStart - 1) {
        o.incident = {
          lineIdx: idx,
          name: lines[idx].name,
          at: at,
          ms: ms,
          deadline: at + ms,
          resolution: null,
          elected: false,
        };
      }
    }

    /* SCRIPT.delivered used to be dead code: the done branch unshifted a hardcoded
       event and returned, so any new delivered beat silently never appeared. */
    var last = (chosen.delivered && chosen.delivered[0]) || scriptFor(o).delivered.beats[0];
    o.schedule = sched;
    o.finalBeat = { step: 'delivered', text: fill(last[0], o), sub: last[1] ? fill(last[1], o) : null, drift: 0 };
    o.status = 'placed';
    o.step = 0;
    o.events = [];
    o.replayed = 0;
    return o;
  }

  /* An order in a save written before schedules existed carries a step and no
     timetable, and resume() replays it at boot. Rebuild from what it does have —
     placedAt is long past, so the catch-up below simply settles it. */
  function ensureSchedule(o) {
    if (o.schedule && o.finalBeat && o.deliverAt) return;
    var keptEvents = o.events || [];
    build(o);
    o.events = keptEvents;
    o.replayed = 0;
  }

  /* Weighted by how hard the kitchen is being hit, so it happens at dinner and
     almost never at three in the afternoon. */
  function incidentChance(o) {
    var load = FB.world ? FB.world.kitchenLoad(o.slug, o.placedAt) : 0.5;
    return 0.10 + load * 0.30;
  }

  /* The hold moves arrival but leaves the beats where they are, so every beat
     stamped inside the hold window is already in the past when the gate lifts and
     replays in one burst — forty seconds of hold is twenty simulated minutes, up to
     two thirds of the whole narrative, dumped at once. Move the remaining beats
     with it. */
  function shiftAfterHold(o, heldMs) {
    if (!(heldMs > 0)) return;
    var from = o.incident ? o.incident.at : 0;
    (o.schedule || []).forEach(function (b) { if (b.at >= from) b.at += heldMs; });
    var base = (o.incident && o.incident.baseDeliverAt != null) ? o.incident.baseDeliverAt : o.deliverAt;
    o.deliverAt = base + heldMs;
  }

  function stepIndex(key) {
    for (var i = 0; i < STEPS.length; i++) if (STEPS[i].key === key) return i;
    return 0;
  }
  function labelFor(o, key) {
    var steps = FB.tracker.steps(o);
    for (var i = 0; i < steps.length; i++) if (steps[i].key === key) return steps[i].label;
    return key;
  }

  /* Replay every beat that is now in the past. Returns 'done' if this pass
     delivered the order, true if anything changed, false otherwise. */
  function replay(o, now) {
    ensureSchedule(o);
    var changed = false;

    /* An unresolved incident HOLDS the order. Nothing after it replays, and
       deliverAt moves with the clock, so the arrival estimate does not quietly run
       down while the restaurant waits for an answer. */
    var inc = o.incident;
    if (inc && !inc.resolution && now >= inc.at) {
      if (!inc.announced) {
        inc.announced = true;
        o.events.unshift({
          step: o.status, ts: inc.at,
          text: 'The restaurant is out of ' + inc.name,
          sub: 'A resolution is required. If none is selected, one will be elected on your behalf.',
        });
        changed = true;
      }
      /* Anchored ONCE. Re-deriving the remaining span from the already-updated
         deliverAt on every tick added the whole elapsed hold again each pass, so
         the padding grew quadratically: forty seconds of not answering pushed
         arrival out by nearly fifteen real minutes. Set outside the announce guard
         so an order saved mid-hold before this fix is anchored on its next tick. */
      if (inc.baseDeliverAt == null) inc.baseDeliverAt = o.deliverAt;
      if (now < inc.deadline) {
        /* the order waits. The food does not. */
        o.deliverAt = inc.baseDeliverAt + (now - inc.at);
        return changed;
      }
      /* the deadline passed — possibly while the browser was closed. Elect once,
         quietly, and let the rest of this pass carry on from there. */
      if (!inc.elected) {
        inc.elected = true;
        inc.resolution = 'substitute';
        inc.resolvedAt = inc.deadline;
        o.events.unshift({
          step: o.status, ts: inc.deadline,
          text: 'No resolution was selected',
          sub: 'Substitution has been elected on your behalf. Substitution was the most expensive available resolution.',
        });
        /* the hold this order ACTUALLY offered, not the ceiling: a deadline clamped
           to fit inside the kitchen window, then shifted by the full 40 s, pushes
           arrival out by the difference for a wait that never happened */
        shiftAfterHold(o, o.incident.deadline - o.incident.at);
        /* Charged the same as choosing it. The election used to bypass the only
           path that patches the three ledgers, so ignoring the block was FREE while
           picking the identical outcome cost $2.40 — the countdown was pressuring
           you toward the more expensive action, which inverts every other price in
           this app. Applied here rather than through resolveIncident(), which would
           shift the schedule a second time on top of the shift above. */
        inc.fee = FB.fees.INCIDENT_FEES.substitution;
        changed = true;
      }
    }

    /* A COUNT of replayed beats, not o.events.length. The feed also carries events
       that are not scheduled beats — an incident announcement, an election — and
       once one of those is in it, indexing the schedule by feed length silently
       skips real beats. */
    var seen = o.replayed || 0;
    for (var i = 0; i < o.schedule.length; i++) {
      var b = o.schedule[i];
      if (b.at > now) break;
      if (i < seen) continue;
      /* stamped from the TIMETABLE, never from Date.now(): a catch-up pass after a
         day away would otherwise collapse twenty beats onto one second, which is
         the exact thing the wall clock exists to prevent */
      o.events.unshift({ step: b.step, text: b.text, sub: b.sub, ts: b.at });
      if (b.drift) { o.etaDrift += b.drift; o.deliverAt += b.drift * SIM_MS_PER_MIN; }
      /* one notification per STEP, not per beat — eighteen beats an order would be
         a notification centre nobody reads twice. Stamped from the timetable, and
         keyed by order and step so a catch-up cannot produce duplicates. */
      /* The moment the courier is disclosed. NOT inside the step-change guard below:
         the tagged beat is the third of `confirmed`, and the step changed on the
         first — so gated on the step it could never fire at all. Gated on the TAG,
         which is the thing that actually means "a person has been attached to this
         order". Stamped from the timetable, pushed from inside the beat loop, and
         deduped on id, so a week-long catch-up announces it at the second it
         happened rather than the second it was noticed, exactly once. */
      if (b.tag === 'assign' && o.slinger && FB.notifs) {
        FB.notifs.push({
          id: 'asg:' + o.id, kind: 'order', icon: 'bike',
          title: 'Slinger assigned',
          body: o.slinger.name + ' · ' + o.slinger.vehicle + '. ' +
            'Assignment is final and is not a commitment.',
          ts: b.at, go: 'track', params: { id: o.id },
        });
      }
      if (b.step !== o.status && FB.notifs) {
        FB.notifs.push({
          id: 'ord:' + o.id + ':' + b.step, kind: 'order', icon: 'bike',
          title: labelFor(o, b.step), body: b.text, ts: b.at,
          go: 'track', params: { id: o.id },
        });
        /* The Slinger says something when they pick the order up, and it goes out on
           its OWN kind. Settings offers a "Slinger messages" switch that gated a kind
           nothing ever emitted, while the messages themselves rode on 'order' — so
           the switch that named them did nothing and the one that did not name them
           silenced them. Delivery only: on a pickup there is no Slinger, which is the
           whole of finding 18. Stamped from the timetable like every other beat, so a
           catch-up cannot fire it late or twice. */
        if (b.step === 'pickup' && o.mode !== 'pickup' && o.slinger) {
          FB.notifs.push({
            id: 'slg:' + o.id, kind: 'slinger', icon: 'phone',
            title: o.slinger.name + ' has your order',
            body: FB.slingers && FB.slingers.greeting
              ? (FB.slingers.greeting(o.slinger, (o.tipHistory || []).some(function (t) { return t.delta < 0; })) ||
                 'On my way. Messages are monitored for quality.')
              : 'On my way. Messages are monitored for quality.',
            ts: b.at, go: 'track', params: { id: o.id },
          });
        }
      }
      o.step = stepIndex(b.step);
      o.status = b.step;
      o.replayed = i + 1;
      changed = true;
    }
    /* The feed is newest-first, and a pass can add events out of order: a catch-up
       announces an incident stamped mid-preparation before it replays the beats
       that came before it. Sort by the timestamp each event actually carries. */
    if (changed) o.events.sort(function (a, b) { return b.ts - a.ts; });

    if (now >= o.deliverAt && (o.replayed || 0) >= o.schedule.length) {
      o.step = STEPS.length - 1;
      o.status = 'delivered';
      o.deliveredAt = o.deliverAt;   /* when it happened, not when we noticed */
      o.events.unshift({ step: 'delivered', text: o.finalBeat.text, sub: o.finalBeat.sub, ts: o.deliverAt });
      if (FB.notifs) {
        FB.notifs.push({
          id: 'ord:' + o.id + ':delivered', kind: 'order', icon: 'checkFill',
          title: labelFor(o, 'delivered'), body: o.finalBeat.sub || o.finalBeat.text, ts: o.deliverAt,
          go: 'track', params: { id: o.id },
        });
      }
      return 'done';
    }
    return changed;
  }

  function tick(opts) {
    var st = FB.S();
    var live = st.orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
    if (!live.length) { stop(); return; }
    var now = Date.now();
    var changed = false;
    /* A live countdown is a reason to REPAINT but not a reason to WRITE. During a
       hold, replay() adds nothing and returns false, so gating the listeners on
       `changed` alone froze the incident's own clock at the second it appeared. */
    var repaint = false;
    live.forEach(function (o) {
      var r = replay(o, now);
      if (r) changed = true;
      var inc = o.incident;
      if (inc && !inc.resolution && now >= inc.at && now < inc.deadline) repaint = true;
      /* charged outside replay(), which must stay a pure timetable walk */
      if (o.incident && o.incident.fee && !o.incident.charged) {
        o.incident.charged = true;
        if (FB.adjustOrder) {
          FB.adjustOrder(o.id, {
            spend: o.incident.fee, fees: o.incident.fee,
            line: { id: 'substitution', label: 'Substitution Fee (elected)', amount: o.incident.fee },
          });
        }
      }
      if (r === 'done') {
        FB.store.set(function (s) { s.activeOrderId = o.id; return s; }, { silent: true });
        /* An order abandoned last week settles at boot. Announcing it — with a "Rate
           it" action, and by claiming it as the active order — would be the app
           shouting about something that finished while nobody was here. */
        if (!(opts && opts.catchUp)) {
          FB.toast('Your order has been delivered.', { icon: 'checkFill', action: 'Rate it', onAction: function () { FB.nav.go('track', { id: o.id }); } });
        }
        if (FB.bodymax && FB.bodymax.checkBadges) FB.bodymax.checkBadges();
      }
    });
    if (changed) {
      FB.store.set(function (s) { return s; }, { silent: true });
      if (FB.shell && FB.shell.repaintChrome) FB.shell.repaintChrome();
    }
    if (changed || repaint) {
      listeners.forEach(function (f) { try { f(); } catch (e) {} });
    }
  }

  function start() { if (!timer) timer = setInterval(tick, 900); }
  function stop() { clearInterval(timer); timer = null; }

  /* Resolving an incident. The two fee ids and their amounts come from fees.js, so
     the FEE_WHY walk — which only reads what compute returns — covers them, and the
     receipt gets a real line rather than a total that silently moved. */
  /* ---------- dispatch ----------
     Who is carrying the order has been decided since placement — the roster draw is
     seeded on the order id — but the app is not entitled to SAY so until the tagged
     beat plays. These three are PURE: they take `now`, they store nothing, and they
     are safe to call from a render path. Nothing here moves a write onto the replay
     path, which is the whole reason this shape was chosen. */
  function assignIdx(o) {
    var sched = o && o.schedule;
    if (!sched) return -1;
    for (var i = 0; i < sched.length; i++) if (sched[i].tag === 'assign') return i;
    return -1;
  }

  /** the moment the courier is disclosed, or placement for anything without one */
  FB.tracker.assignedAt = function (o) {
    var i = assignIdx(o);
    return i > -1 ? o.schedule[i].at : (o && (o.startAt || o.placedAt)) || 0;
  };

  /** has the app introduced the courier yet? */
  FB.tracker.assigned = function (o, now) {
    if (!o) return true;
    /* a pickup has no courier to wait for, and a finished order has nothing left to
       disclose */
    if (o.mode === 'pickup' || o.status === 'delivered' || o.status === 'cancelled') return true;
    var i = assignIdx(o);
    /* No tagged beat at all means a legacy save or a test fixture, neither of which
       ever ran build(). Absence reads as ALREADY ASSIGNED, so this branch can only
       ever withdraw a claim the app was making too early — no migration, no fixture
       churn, and an old order keeps rendering exactly as it was delivered. */
    if (i < 0) return true;
    /* Monotonic, and consulted BEFORE the clock: replayed only ever counts up, so a
       corrected system clock or a save carried to another device cannot un-introduce
       someone the feed has already named. */
    if ((o.replayed || 0) > i) return true;
    return (now || Date.now()) >= o.schedule[i].at;
  };

  /** the queue card's contents while nobody is assigned, or null once someone is */
  FB.tracker.dispatch = function (o, now) {
    if (FB.tracker.assigned(o, now)) return null;
    now = now || Date.now();
    var start = o.startAt || o.placedAt;
    var at = FB.tracker.assignedAt(o);
    var of = 3 + FB.hash(o.id + 'queue') % 5;                 /* 3..7 ahead of you */
    var span = Math.max(1, at - start);
    var t = FB.clamp((now - start) / span, 0, 1);
    var position = Math.max(1, Math.ceil(of * (1 - t)));
    /* The queue recalculates upward exactly ONCE per order, at a seeded moment, and
       never again — it is a bureaucracy admitting an error, not a tic. */
    var revisedAt = 0.25 + (FB.seeded('queue:' + o.id)() * 0.4);
    var revised = t >= revisedAt && t < revisedAt + 0.18;
    return { position: revised ? of + 1 : position, of: of, revised: revised };
  };

  FB.tracker.INCIDENT_MS = INCIDENT_MS;
  FB.tracker.INCIDENT_MIN_MS = INCIDENT_MIN_MS;
  FB.tracker.RESOLVE_MARGIN_MS = RESOLVE_MARGIN_MS;
  FB.tracker.resolveIncident = function (orderId, choice) {
    var o = FB.store.order(orderId);
    if (!o || !o.incident || o.incident.resolution) return null;
    var line = o.lines[o.incident.lineIdx];
    var result = { choice: choice, credit: 0, fee: 0 };
    if (choice === 'remove') {
      /* the base price, excluding required selections — which is what the copy on
         the track screen promises, and is NOT the unit price that was charged */
      var it = FB.catalog.item(o.slug, line.itemId);
      result.credit = FB.round2((it ? it.price : line.unit) * line.qty);
    } else if (choice === 'substitute') {
      result.fee = FB.fees.INCIDENT_FEES.substitution;
      result.line = { id: 'substitution', label: 'Substitution Fee', amount: result.fee };
    } else if (choice === 'hold') {
      result.fee = FB.fees.INCIDENT_FEES.hold;
      result.line = { id: 'hold', label: 'Order Hold Fee', amount: result.fee };
    }
    FB.store.set(function (st) {
      var oo = st.orders.filter(function (x) { return x.id === orderId; })[0];
      if (!oo) return st;
      oo.incident.resolution = choice;
      oo.incident.resolvedAt = Date.now();
      /* however long you actually took, the beats move with arrival */
      shiftAfterHold(oo, Math.max(0, oo.incident.resolvedAt - oo.incident.at));
      oo.events.unshift({
        step: oo.status, ts: Date.now(),
        text: RESOLUTION_TEXT[choice] || 'Resolution recorded',
        sub: RESOLUTION_SUB[choice] || null,
      });
      /* The row STAYS. Splicing it out left calc.subtotal untouched, so the receipt
         printed item rows that no longer summed to the Subtotal directly beneath
         them — a hole with nothing explaining it, and the credit below is at the
         BASE price, so it never covered the gap either. The whole post-placement
         model here is charge-then-credit: FB.adjustOrder appends a fee line and
         never rewrites calc.subtotal, so the priced row has to remain for the credit
         to be a credit against something. Marked instead, so the receipt shows what
         happened rather than hiding it. */
      if (choice === 'remove') {
        var gone = oo.lines[oo.incident.lineIdx];
        if (gone) gone.removed = true;
      }
      return st;
    }, { silent: true });
    /* one place patches the three ledgers, for tips and for this alike */
    if (FB.adjustOrder) {
      FB.adjustOrder(orderId, {
        spend: FB.round2(result.fee - result.credit),
        fees: result.fee,
        line: result.line || (result.credit > 0
          ? { id: 'removal', label: 'Item removed · credited at base price', amount: FB.round2(-result.credit) }
          : null),
      });
    }
    if (choice === 'hold') {
      FB.store.set(function (st) {
        var oo = st.orders.filter(function (x) { return x.id === orderId; })[0];
        if (oo) {
          (oo.schedule || []).forEach(function (b) { if (b.at >= oo.incident.at) b.at += INCIDENT_MS; });
          oo.deliverAt += INCIDENT_MS;
        }
        return st;
      }, { silent: true });
    }
    return result;
  };
  var RESOLUTION_TEXT = {
    substitute: 'Substitution accepted',
    remove: 'Item removed from the order',
    hold: 'Order held at your request',
  };
  var RESOLUTION_SUB = {
    substitute: 'The substitute is selected by the restaurant and is not described here.',
    remove: 'You have been credited the base price, excluding required selections.',
    hold: 'The order waits. The food does not.',
  };

  FB.tracker.STEPS = STEPS;
  FB.tracker.SIM_MS_PER_MIN = SIM_MS_PER_MIN;
  FB.tracker.SCRIPT = SCRIPT;
  FB.tracker.PICKUP_SCRIPT = PICKUP_SCRIPT;
  FB.tracker.build = build;
  FB.tracker.start = function () { start(); };
  FB.tracker.stop = stop;
  FB.tracker.tick = tick;

  /* the step labels for THIS order — a pickup is not "Slinger en route" */
  FB.tracker.steps = function (o) {
    if (o && o.mode === 'pickup') {
      return STEPS.map(function (s) { return { key: s.key, label: s.pickup }; });
    }
    return STEPS;
  };

  FB.tracker.resume = function () {
    var live = FB.S().orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
    if (!live.length) return;
    /* catch every live order up to now in one pass, quietly, before starting */
    tick({ catchUp: true });
    var stillLive = FB.S().orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
    if (stillLive.length) start();
  };

  FB.tracker.onTick = function (fn) {
    listeners.push(fn);
    return function () { var i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); };
  };

  /* Minutes until deliverAt, which only ever moves later. Never negative, and
     never rebounds through zero on the way down. */
  FB.tracker.eta = function (o) {
    if (!o.deliverAt) return Math.max(1, o.etaMin + (o.etaDrift || 0));
    var left = (o.deliverAt - Date.now()) / SIM_MS_PER_MIN;
    return Math.max(0, Math.ceil(left));
  };

  /* An order waiting for its scheduled slot has not started. */
  FB.tracker.isPending = function (o) {
    return !!(o.startAt && Date.now() < o.startAt && o.status !== 'delivered');
  };

  /* Where the courier is on the drawn route. Zero until they actually have the food:
     progress used to be step/5, so the pin was already 40% of the way to your house
     while the feed still said the bag was being sealed. */
  FB.tracker.progress = function (o) {
    if (o.status === 'delivered') return 1;
    if (!o.schedule) return 0;
    var leg = null;
    for (var i = 0; i < o.schedule.length; i++) {
      if (o.schedule[i].step === 'pickup') { leg = o.schedule[i].at; break; }
    }
    if (leg == null) return 0;
    var now = Date.now();
    if (now <= leg) return 0;
    return FB.clamp((now - leg) / Math.max(1, o.deliverAt - leg), 0, 1);
  };

  /* ---------------- the map ---------------- */
  function mapSvg(o, t, opts) {
    opts = opts || {};
    var rnd = FB.seeded(o.id);
    var blocks = '', roads = '', casing = '';
    /* city blocks first, so roads read as gaps between them */
    for (var b = 0; b < 26; b++) {
      var bx = rnd() * 392, by = rnd() * 260;
      var bw = 20 + rnd() * 52, bh = 16 + rnd() * 40;
      var kind = rnd();
      var fill = kind > 0.86 ? 'var(--map-park)' : kind > 0.78 ? 'var(--map-water)' : 'var(--map-block)';
      blocks += '<rect x="' + bx.toFixed(0) + '" y="' + by.toFixed(0) + '" width="' + bw.toFixed(0) +
        '" height="' + bh.toFixed(0) + '" rx="3" fill="' + fill + '"/>';
    }
    for (var i = 1; i < 7; i++) {
      var y = 14 + i * 39 + rnd() * 8, y2 = y + (rnd() - .5) * 12;
      casing += '<line x1="-10" y1="' + y.toFixed(1) + '" x2="410" y2="' + y2.toFixed(1) + '" class="rdc"/>';
      roads  += '<line x1="-10" y1="' + y.toFixed(1) + '" x2="410" y2="' + y2.toFixed(1) + '" class="rd"/>';
    }
    for (var j = 1; j < 6; j++) {
      var x = 8 + j * 68 + rnd() * 12, x2 = x + (rnd() - .5) * 16;
      casing += '<line x1="' + x.toFixed(1) + '" y1="-10" x2="' + x2.toFixed(1) + '" y2="280" class="rdc"/>';
      roads  += '<line x1="' + x.toFixed(1) + '" y1="-10" x2="' + x2.toFixed(1) + '" y2="280" class="rd"/>';
    }
    var path = 'M46,216 C122,198 98,124 178,118 C260,114 238,60 328,56';

    return '<svg viewBox="0 0 400 268" preserveAspectRatio="xMidYMid slice">' +
      '<style>' +
        '.rdc{stroke:var(--map-roadcase);stroke-width:11;stroke-linecap:round}' +
        '.rd{stroke:var(--map-road);stroke-width:7;stroke-linecap:round}' +
        '.rt{stroke:var(--fb);stroke-width:4.5;fill:none;stroke-linecap:round;' +
          'filter:drop-shadow(0 0 5px rgba(255,45,20,.55))}' +
        '.rtbg{stroke:var(--map-roadcase);stroke-width:5;fill:none;stroke-linecap:round;stroke-dasharray:2 8}' +
        /* SVG user units inside a viewBox — the map already scales as a whole, so this
           one must NOT take --fs as well or the pin labels scale twice */
        '.pinlab{font:700 8px var(--font);fill:var(--ink);letter-spacing:.06em}' +
      '</style>' +
      '<rect width="400" height="268" fill="var(--map-bg)"/>' + blocks + casing + roads +
      '<path d="' + path + '" class="rtbg"/>' +
      '<path d="' + path + '" class="rt" id="rt-' + o.id + '"/>' +
      /* restaurant */
      '<g transform="translate(328,56)">' +
        '<circle r="13" fill="var(--bg)" stroke="var(--line-strong)" stroke-width="1.5"/>' +
        '<path d="M-4,-5 v5 a4,4 0 0 0 8,0 v-5 M0,0 v6" stroke="var(--ink)" stroke-width="1.7" fill="none" stroke-linecap="round"/>' +
        '<rect x="-19" y="15" width="38" height="13" rx="6.5" fill="var(--bg)" stroke="var(--line)" stroke-width="1"/>' +
        '<text class="pinlab" y="24" text-anchor="middle">' + (opts.fromLabel || 'STORE') + '</text></g>' +
      /* home */
      '<g transform="translate(46,216)">' +
        '<circle r="13" fill="var(--bg)" stroke="var(--line-strong)" stroke-width="1.5"/>' +
        '<path d="M-5,0 L0,-5 L5,0 v5 h-10 z" fill="var(--fb)"/>' +
        '<rect x="-17" y="15" width="34" height="13" rx="6.5" fill="var(--bg)" stroke="var(--line)" stroke-width="1"/>' +
        '<text class="pinlab" y="24" text-anchor="middle">' + (opts.toLabel || (o.mode === 'pickup' ? 'HOME' : 'YOU')) + '</text></g>' +
      /* The travelling dot. On a PICKUP nobody is driving to you — the feed says so
         and the screen used to animate a courier to your door anyway — so it is drawn
         as the route YOU take, and the ends are labelled accordingly. */
      '<g id="crx-' + o.id + '">' +
        '<circle r="15" fill="var(--fb)" opacity=".24"><animate attributeName="r" values="12;23;12" dur="2.6s" repeatCount="indefinite"/></circle>' +
        '<circle r="10.5" fill="var(--fb)" stroke="#fff" stroke-width="2.5"/>' +
        '<path d="M-3.4,1.6 a1.9,1.9 0 1 0 0,-.1 M3.4,1.6 a1.9,1.9 0 1 0 0,-.1 M-3.4,1.6 h2.6 l2-4 M1.6,-2.4 h2" ' +
          'stroke="#fff" stroke-width="1.15" fill="none" stroke-linecap="round"/>' +
      '</g></svg>';
  }

  /* place the courier marker at fraction t along the drawn route */
  FB.tracker.placeCourier = function (root, o, t) {
    var path = root.querySelector('#rt-' + o.id);
    var marker = root.querySelector('#crx-' + o.id);
    if (!path || !marker || !path.getTotalLength) return;
    var L = path.getTotalLength();
    /* Nobody has been assigned yet, so nobody is on the route. The dot used to set
       off toward your house during `confirmed`, which is a courier travelling before
       one exists — it is parked at the restaurant and hidden until the beat that
       introduces them plays. Driven from here rather than from mapSvg because the map
       is rendered once and only this runs on the ticker. */
    var waiting = !FB.tracker.assigned(o);
    marker.style.display = waiting ? 'none' : '';
    var pt = path.getPointAtLength(L * (1 - FB.clamp(waiting ? 0 : t, 0, 1)));
    marker.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
  };

  FB.tracker.mapSvg = mapSvg;
})(window.FB);
