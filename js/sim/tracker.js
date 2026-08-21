/* DoorGorge — TRACKR™ live order simulation.
   Runs on a global ticker so an order keeps progressing while you shop. */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  var STEPS = [
    { key: 'placed',    label: 'Order placed',        ms: 5000 },
    { key: 'confirmed', label: 'Restaurant notified', ms: 9000 },
    { key: 'preparing', label: 'Preparing',           ms: 15000 },
    { key: 'pickup',    label: 'Gorger en route',     ms: 14000 },
    { key: 'enroute',   label: 'Arriving',            ms: 17000 },
    { key: 'delivered', label: 'Delivered',           ms: 0 },
  ];

  /* each entry: [message, subtext|null, etaDriftMinutes] */
  var SCRIPT = {
    placed: [
      ['Order received by DoorGorge™', 'Your order has entered the system.', 0],
      ['Payment authorised', 'A hold has been placed for the total, plus a margin for the total.', 0],
    ],
    confirmed: [
      ['{store} has acknowledged your existence', null, 0],
      ['Order accepted', 'The restaurant has 90 seconds to reject this. It has not.', 0],
      ['Gorger {gorger} assigned', '{rating}★ · {deliveries} lifetime deliveries · {vehicle}', 0],
    ],
    preparing: [
      ['Food is being assembled', null, 0],
      ['Item entering thermal chamber', 'Temperature Maintenance Fee is now active.', 1],
      ['{gorger} has accepted a second order', 'Yours is now #2 of 2.', 4],
      ['Bag sealed', 'Handles attached separately, as licensed.', 0],
    ],
    pickup: [
      ['{gorger} has arrived at {store}', null, 0],
      ['{gorger} is waiting', 'Standard wait. Waiting is included.', 2],
      ['Order collected', null, 0],
      ['{gorger} has taken one (1) fry as tribute', 'This is permitted under the Gorger Agreement, §4.2.', 0],
    ],
    enroute: [
      ['{gorger} is 2.1 mi away', null, 0],
      ['{gorger} is 3.4 mi away', 'Route recalculated.', 3],
      ['{gorger} is stationary', 'Reason: not provided.', 5],
      ['{gorger} is moving again', 'No explanation will be offered.', 0],
      ['{gorger} is 0.3 mi away', 'Approaching. Please prepare to receive.', 0],
    ],
    delivered: [
      ['Delivered', 'Photo attached. The photo is of a door.', 0],
    ],
  };

  var timer = null;
  var listeners = [];

  function fill(str, o) {
    return str.replace(/\{store\}/g, o.storeName)
      .replace(/\{gorger\}/g, o.gorger.name)
      .replace(/\{rating\}/g, o.gorger.rating.toFixed(1))
      .replace(/\{deliveries\}/g, o.gorger.deliveries)
      .replace(/\{vehicle\}/g, o.gorger.vehicle);
  }

  function advance(o) {
    var step = STEPS[o.step];
    var queue = SCRIPT[step.key] || [];
    var idx = o.events.filter(function (e) { return e.step === step.key; }).length;

    if (idx < queue.length) {
      var ev = queue[idx];
      o.events.unshift({ step: step.key, text: fill(ev[0], o), sub: ev[1] ? fill(ev[1], o) : null, ts: Date.now() });
      if (ev[2]) o.etaDrift += ev[2];
      return true;
    }
    /* step exhausted → move on */
    if (o.step < STEPS.length - 1) {
      o.step++;
      o.status = STEPS[o.step].key;
      if (o.status === 'delivered') {
        o.deliveredAt = Date.now();
        o.events.unshift({ step: 'delivered', text: 'Delivered', sub: 'Photo attached. The photo is of a door.', ts: Date.now() });
        return 'done';
      }
      return true;
    }
    return false;
  }

  function tick() {
    var st = DG.S();
    var live = st.orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
    if (!live.length) { stop(); return; }
    var changed = false;
    live.forEach(function (o) {
      var now = Date.now();
      var step = STEPS[o.step];
      var gap = Math.max(2600, step.ms / ((SCRIPT[step.key] || []).length || 1));
      if (!o._next) o._next = now + 1400;
      if (now >= o._next) {
        var r = advance(o);
        o._next = now + gap * (0.75 + Math.random() * 0.6);
        changed = true;
        if (r === 'done') {
          DG.store.set(function (s) { s.activeOrderId = o.id; return s; }, { silent: true });
          DG.toast('Your order has been delivered.', { icon: 'checkFill', action: 'Rate it', onAction: function () { DG.nav.go('track', { id: o.id }); } });
        }
      }
    });
    if (changed) {
      DG.store.set(function (s) { return s; }, { silent: true });
      listeners.forEach(function (f) { try { f(); } catch (e) {} });
      DG.shell.repaintChrome();
    }
  }

  function start() { if (!timer) timer = setInterval(tick, 900); }
  function stop() { clearInterval(timer); timer = null; }

  DG.tracker = {
    STEPS: STEPS,
    start: function () { start(); },
    stop: stop,
    resume: function () {
      var live = DG.S().orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
      if (live.length) start();
    },
    onTick: function (fn) { listeners.push(fn); return function () { var i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); }; },
    eta: function (o) {
      var elapsed = (Date.now() - o.placedAt) / 60000;
      return Math.max(1, Math.round(o.etaMin + o.etaDrift - elapsed));
    },
    progress: function (o) { return DG.clamp(o.step / (STEPS.length - 1), 0, 1); },
  };

  /* ---------------- the map ---------------- */
  function mapSvg(o) {
    var rnd = DG.seeded(o.id);
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
        '.rt{stroke:var(--gorge);stroke-width:4.5;fill:none;stroke-linecap:round;' +
          'filter:drop-shadow(0 0 5px rgba(255,45,20,.55))}' +
        '.rtbg{stroke:var(--map-roadcase);stroke-width:5;fill:none;stroke-linecap:round;stroke-dasharray:2 8}' +
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
        '<path d="M-5,0 L0,-5 L5,0 v5 h-10 z" fill="var(--gorge)"/>' +
        '<rect x="-17" y="15" width="34" height="13" rx="6.5" fill="var(--bg)" stroke="var(--line)" stroke-width="1"/>' +
        '<text class="pinlab" y="24" text-anchor="middle">YOU</text></g>' +
      /* courier — positioned by JS along the route path */
      '<g id="crx-' + o.id + '">' +
        '<circle r="15" fill="var(--gorge)" opacity=".24"><animate attributeName="r" values="12;23;12" dur="2.6s" repeatCount="indefinite"/></circle>' +
        '<circle r="10.5" fill="var(--gorge)" stroke="#fff" stroke-width="2.5"/>' +
        '<path d="M-3.4,1.6 a1.9,1.9 0 1 0 0,-.1 M3.4,1.6 a1.9,1.9 0 1 0 0,-.1 M-3.4,1.6 h2.6 l2-4 M1.6,-2.4 h2" ' +
          'stroke="#fff" stroke-width="1.15" fill="none" stroke-linecap="round"/>' +
      '</g></svg>';
  }

  /* place the courier marker at fraction t along the drawn route */
  DG.tracker.placeCourier = function (root, o, t) {
    var path = root.querySelector('#rt-' + o.id);
    var marker = root.querySelector('#crx-' + o.id);
    if (!path || !marker || !path.getTotalLength) return;
    var L = path.getTotalLength();
    /* the route is drawn restaurant->home, so progress runs backwards along it */
    var pt = path.getPointAtLength(L * (1 - DG.clamp(t, 0, 1)));
    marker.setAttribute('transform', 'translate(' + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ')');
  };

  DG.tracker.mapSvg = mapSvg;
})(window.DG);
