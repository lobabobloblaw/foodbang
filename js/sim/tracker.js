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

  /* each entry: [message, subtext|null, etaDriftMinutes] */
  var SCRIPT = {
    placed: [
      ['Order received by FoodBang™', 'Your order has entered the system.', 0],
      ['Payment authorized', 'A hold has been placed for the total, plus a margin for the total.', 0],
    ],
    confirmed: [
      ['{store} has acknowledged your existence', null, 0],
      ['Order accepted', 'The restaurant has 90 seconds to reject this. It has not.', 0],
      ['Slinger {slinger} assigned', '{rating}★ · {deliveries} lifetime deliveries · {vehicle}', 0],
    ],
    preparing: [
      ['Food is being assembled', null, 0],
      ['Item entering thermal chamber', 'Temperature Maintenance Fee is now active.', 1],
      ['{slinger} has accepted a second order', 'Yours is now #2 of 2.', 4],
      ['Bag sealed', 'Handles attached separately, as licensed.', 0],
    ],
    pickup: [
      ['{slinger} has arrived at {store}', null, 0],
      ['{slinger} is waiting', 'Standard wait. Waiting is included.', 2],
      ['Order collected', null, 0],
      ['{slinger} has taken one (1) fry as tribute', 'This is permitted under the Slinger Agreement, §4.2.', 0],
    ],
    enroute: [
      ['{slinger} is 2.1 mi away', null, 0],
      ['{slinger} is 3.4 mi away', 'Route recalculated.', 3],
      ['{slinger} is stationary', 'Reason: not provided.', 5],
      ['{slinger} is moving again', 'No explanation will be offered.', 0],
      ['{slinger} is 0.3 mi away', 'Approaching. Please prepare to receive.', 0],
    ],
    delivered: [
      ['Delivered', 'Photo attached. The photo is of a door.', 0],
    ],
  };

  /* A pickup order used to be tracked as a delivery: it assigned a Slinger, drove
     them to your house and ended "Photo attached. The photo is of a door." `mode`
     was written onto the order and read by nothing. */
  var PICKUP_SCRIPT = {
    placed: [
      ['Order received by FoodBang™', 'Your order has entered the system.', 0],
      ['Payment authorized', 'A hold has been placed for the total, plus a margin for the total.', 0],
    ],
    confirmed: [
      ['{store} has acknowledged your existence', null, 0],
      ['Order accepted for collection', 'No Slinger has been assigned. You are the Slinger.', 0],
    ],
    preparing: [
      ['Food is being assembled', null, 0],
      ['Item entering thermal chamber', 'Temperature Maintenance Fee is now active.', 1],
      ['Bag sealed', 'Handles attached separately, as licensed.', 0],
    ],
    pickup: [
      ['Order placed on the collection shelf', 'The shelf is unattended and unmonitored.', 0],
      ['Order remains on the collection shelf', 'Ambient temperature is being maintained by the room.', 2],
    ],
    enroute: [
      ['Ready for collection', 'Please present the order number to a member of staff, who will not ask for it.', 0],
      ['Still ready for collection', 'The Retrieval Facilitation Fee has been charged and the retrieval has not been facilitated.', 3],
    ],
    delivered: [
      ['Collected', 'Collection is recorded at the moment the shelf is emptied, by whoever empties it.', 0],
    ],
  };

  var timer = null;
  var listeners = [];

  function scriptFor(o) { return o.mode === 'pickup' ? PICKUP_SCRIPT : SCRIPT; }

  FB.tracker = FB.tracker || {};

  function fill(str, o) {
    return str.replace(/\{store\}/g, o.storeName)
      .replace(/\{slinger\}/g, o.slinger.name)
      .replace(/\{rating\}/g, o.slinger.rating.toFixed(1))
      .replace(/\{deliveries\}/g, o.slinger.deliveries)
      .replace(/\{vehicle\}/g, o.slinger.vehicle);
  }

  /* ---------------- the timetable ----------------
     Built once, at placement, and stored on the order. Every beat carries the
     absolute moment it happens, so replaying it after any absence produces the same
     timeline with the same timestamps rather than twenty beats stamped "now". */
  function build(o) {
    var script = scriptFor(o);
    var rnd = FB.seeded(o.id + 'pace');

    /* A scheduled order does not start cooking when you place it. `scheduled` is a
       clock string the checkout sheet wrote; it was captured and read by nothing,
       so a 9 PM slot began preparing at 2 PM. */
    var slot = o.scheduled ? FB.nextAtMinute(FB.minsOfDay(o.scheduled), o.placedAt) : null;
    o.startAt = slot || o.placedAt;

    /* Drift is known up front — it is in the script — so the beats can be laid out
       across the window the order will ACTUALLY take, while the headline still
       starts at the number the store advertised and is revised later, on air. */
    var totalDrift = 0;
    Object.keys(script).forEach(function (k) {
      script[k].forEach(function (ev) { totalDrift += ev[2] || 0; });
    });
    var span = Math.max(1, (o.etaMin + totalDrift)) * SIM_MS_PER_MIN;

    var sched = [];
    var cursor = 0;
    STEPS.forEach(function (step) {
      if (step.key === 'delivered') return;
      var beats = script[step.key] || [];
      var slice = span * (WEIGHTS[step.key] || 0);
      beats.forEach(function (ev, i) {
        /* spread inside the step, with a little jitter so beats do not land on a grid */
        var frac = (i + 0.55 + (rnd() - 0.5) * 0.5) / beats.length;
        sched.push({
          step: step.key,
          text: fill(ev[0], o),
          sub: ev[1] ? fill(ev[1], o) : null,
          drift: ev[2] || 0,
          at: Math.round(o.startAt + cursor + slice * FB.clamp(frac, 0.05, 0.95)),
        });
      });
      cursor += slice;
    });
    sched.sort(function (a, b) { return a.at - b.at; });

    var last = script.delivered[0];
    o.schedule = sched;
    o.finalBeat = { step: 'delivered', text: fill(last[0], o), sub: last[1] ? fill(last[1], o) : null, drift: 0 };
    /* starts at what the store advertised; every drift beat pushes it out */
    o.deliverAt = o.startAt + o.etaMin * SIM_MS_PER_MIN;
    o.status = 'placed';
    o.step = 0;
    o.events = [];
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
    var seen = o.events.length;
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
      if (b.step !== o.status && FB.notifs) {
        FB.notifs.push({
          id: 'ord:' + o.id + ':' + b.step, kind: 'order', icon: 'bike',
          title: labelFor(o, b.step), body: b.text, ts: b.at,
          go: 'track', params: { id: o.id },
        });
      }
      o.step = stepIndex(b.step);
      o.status = b.step;
      changed = true;
    }
    if (now >= o.deliverAt && o.events.length >= o.schedule.length) {
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
    live.forEach(function (o) {
      var r = replay(o, now);
      if (r) changed = true;
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
      listeners.forEach(function (f) { try { f(); } catch (e) {} });
      if (FB.shell && FB.shell.repaintChrome) FB.shell.repaintChrome();
    }
  }

  function start() { if (!timer) timer = setInterval(tick, 900); }
  function stop() { clearInterval(timer); timer = null; }

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
  function mapSvg(o) {
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
        '<text class="pinlab" y="24" text-anchor="middle">STORE</text></g>' +
      /* home */
      '<g transform="translate(46,216)">' +
        '<circle r="13" fill="var(--bg)" stroke="var(--line-strong)" stroke-width="1.5"/>' +
        '<path d="M-5,0 L0,-5 L5,0 v5 h-10 z" fill="var(--fb)"/>' +
        '<rect x="-17" y="15" width="34" height="13" rx="6.5" fill="var(--bg)" stroke="var(--line)" stroke-width="1"/>' +
        '<text class="pinlab" y="24" text-anchor="middle">YOU</text></g>' +
      /* courier — positioned by JS along the route path */
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
    /* the route is drawn restaurant->home, so progress runs backwards along it */
    var pt = path.getPointAtLength(L * (1 - FB.clamp(t, 0, 1)));
    marker.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
  };

  FB.tracker.mapSvg = mapSvg;
})(window.FB);
