/* DoorGorge — BODYMAX™ Intake Telemetry.
   A wellness feature that measures you, reports on you, and then sells to you. */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  var RDI = 9400;          /* "Recommended Daily Intake", per DoorGorge™ */
  var SODIUM_CEIL = 24000; /* mg */

  var TRAJECTORY = ['STABLE', 'EXPANDING', 'SUBSTANTIAL', 'MUNICIPAL', 'REGIONAL', 'WATERSHED'];

  var BADGES = [
    { id: 'first',   icon: '🥇', name: 'First Contact',      hint: 'Place one order.',                     test: function (m) { return m.orders >= 1; } },
    { id: 'repeat',  icon: '🔁', name: 'Repeat Offender',    hint: 'Place five orders.',                   test: function (m) { return m.orders >= 5; } },
    { id: 'loyal',   icon: '👑', name: 'Corporate Loyalty',  hint: 'Order from six different brands.',     test: function (m) { return m.brands >= 6; } },
    { id: 'trough',  icon: '🪣', name: 'Trough Certified',   hint: 'Select any Trough-class portion.',     test: function (m) { return m.flags.trough; } },
    { id: 'pipe',    icon: '🚰', name: 'Standpipe Household',hint: 'Order a standpipe hookup.',            test: function (m) { return m.flags.standpipe; } },
    { id: 'ambient', icon: '🧊', name: 'Ambient Diner',      hint: 'Accept food at ambient temperature.',  test: function (m) { return m.flags.ambient; } },
    { id: 'ranch',   icon: '🫗', name: 'Blood Ranch Positive',hint: 'Reach a Blood Ranch Level over 20.',  test: function (m) { return m.ranch > 20; } },
    { id: 'muni',    icon: '🏛', name: 'Municipal Portion',  hint: 'One order over 8,000 units.',          test: function (m) { return m.maxOrderCal >= 8000; } },
    { id: 'fees100', icon: '💸', name: 'Fee Connoisseur',    hint: 'Pay $100 in fees, lifetime.',          test: function (m) { return m.fees >= 100; } },
    { id: 'fees500', icon: '🧾', name: 'Fee Baron',          hint: 'Pay $500 in fees, lifetime.',          test: function (m) { return m.fees >= 500; } },
    { id: 'night',   icon: '🌙', name: 'Fourth Meal',        hint: 'Order between 1:00 and 4:00 AM.',      test: function (m) { return m.flags.night; } },
    { id: 'read',    icon: '🧠', name: 'Read The Fees',      hint: 'Open a fee explanation.',              test: function (m) { return m.flags.readFees; } },
  ];

  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  DG.bodymax = {
    RDI: RDI,
    BADGES: BADGES,
    TRAJECTORY: TRAJECTORY,

    ingest: function (order) {
      DG.store.set(function (st) {
        var flags = {};
        var text = order.lines.map(function (l) { return l.opts + ' ' + l.name; }).join(' ').toLowerCase();
        if (/trough/.test(text)) flags.trough = true;
        if (/standpipe/.test(text)) flags.standpipe = true;
        if (/ambient/.test(text)) flags.ambient = true;
        var hr = new Date(order.placedAt).getHours();
        if (hr >= 1 && hr < 4) flags.night = true;

        st.bodymax.history.unshift({
          ts: order.placedAt, orderId: order.id, slug: order.slug, store: order.storeName,
          cal: order.load.calories, sodium: order.load.sodium, grease: order.load.grease,
          ranch: order.load.ranch, spend: order.calc.total, fees: order.calc.feesTotal + order.calc.tax,
          flags: flags,
        });
        if (!st.bodymax.firstTs) st.bodymax.firstTs = order.placedAt;
        return st;
      });
      DG.bodymax.checkBadges();
    },

    flag: function (name) {
      DG.store.set(function (st) {
        st.bodymax.flags = st.bodymax.flags || {};
        st.bodymax.flags[name] = true;
        return st;
      }, { silent: true });
      DG.bodymax.checkBadges();
    },

    metrics: function () {
      var st = DG.S();
      var h = st.bodymax.history;
      var flags = Object.assign({}, st.bodymax.flags || {});
      h.forEach(function (e) { Object.assign(flags, e.flags || {}); });

      var today = dayKey(Date.now());
      var todayEntries = h.filter(function (e) { return dayKey(e.ts) === today; });
      var brands = {};
      h.forEach(function (e) { brands[e.slug] = 1; });

      var totalCal = DG.sum(h, function (e) { return e.cal; });
      var days = Math.max(1, Math.ceil((Date.now() - (st.bodymax.firstTs || Date.now())) / 86400000) || 1);

      return {
        orders: h.length,
        brands: Object.keys(brands).length,
        todayCal: DG.sum(todayEntries, function (e) { return e.cal; }),
        todaySodium: DG.sum(todayEntries, function (e) { return e.sodium; }),
        todayGrease: DG.round2(DG.sum(todayEntries, function (e) { return e.grease; })),
        totalCal: totalCal,
        avgCal: Math.round(totalCal / days),
        ranch: DG.round2(DG.sum(h, function (e) { return e.ranch; })),
        grease: DG.round2(DG.sum(h, function (e) { return e.grease; })),
        spend: DG.round2(st.meta.lifetimeSpend),
        fees: DG.round2(st.meta.lifetimeFees),
        tips: DG.round2(st.meta.lifetimeTips),
        maxOrderCal: h.length ? Math.max.apply(null, h.map(function (e) { return e.cal; })) : 0,
        flags: flags,
        /* derived indices — all invented, all authoritative */
        loyalty: DG.clamp(Math.round(h.length * 6 + Object.keys(brands).length * 4), 0, 100),
        integrity: DG.clamp(100 - Math.round(totalCal / 900) - h.length * 2, 4, 100),
        chewDebt: Math.round(totalCal / 62),
        trajectory: TRAJECTORY[DG.clamp(Math.floor(totalCal / 14000), 0, TRAJECTORY.length - 1)],
        trajectoryIdx: DG.clamp(Math.floor(totalCal / 14000), 0, TRAJECTORY.length - 1),
      };
    },

    days: function (n) {
      var st = DG.S(), out = [];
      for (var i = n - 1; i >= 0; i--) {
        var d = new Date(Date.now() - i * 86400000);
        var k = dayKey(d.getTime());
        var cal = DG.sum(st.bodymax.history.filter(function (e) { return dayKey(e.ts) === k; }), function (e) { return e.cal; });
        out.push({ label: ['S', 'M', 'T', 'W', 'T', 'F', 'S'][d.getDay()], date: d.getDate(), cal: cal });
      }
      return out;
    },

    badges: function () {
      var m = DG.bodymax.metrics();
      return BADGES.map(function (b) { return { id: b.id, icon: b.icon, name: b.name, hint: b.hint, earned: !!b.test(m) }; });
    },

    checkBadges: function () {
      var earned = DG.bodymax.badges().filter(function (b) { return b.earned; });
      var st = DG.S();
      var fresh = earned.filter(function (b) { return st.bodymax.badges.indexOf(b.id) < 0; });
      if (!fresh.length) return;
      DG.store.set(function (s) {
        fresh.forEach(function (b) { s.bodymax.badges.push(b.id); });
        return s;
      });
      fresh.forEach(function (b, i) {
        setTimeout(function () { DG.toast(b.icon + '  Achievement: ' + b.name, { kind: 'plus', ms: 3600 }); }, 700 + i * 900);
      });
    },
  };

  /* ---------------- screen ---------------- */
  function gauge(cfg) {
    var pct = DG.clamp(cfg.value / cfg.max * 100, 0, 100);
    var color = pct > 88 ? 'var(--bad)' : pct > 62 ? 'var(--warn)' : 'var(--good)';
    if (cfg.invert) color = pct < 30 ? 'var(--bad)' : pct < 62 ? 'var(--warn)' : 'var(--good)';
    return '<div class="gauge"><div class="gauge-h"><b>' + DG.esc(cfg.label) + '</b>' +
      '<span class="g-v" style="color:' + color + '">' + cfg.display + '</span>' +
      '<span class="g-u">' + DG.esc(cfg.unit || '') + '</span></div>' +
      '<div class="gtrack"><div class="gfill" style="width:' + pct.toFixed(1) + '%;background:' + color + '"></div></div>' +
      (cfg.note ? '<div class="g-note">' + DG.esc(cfg.note) + '</div>' : '') + '</div>';
  }

  function spark(days) {
    var max = Math.max(RDI, Math.max.apply(null, days.map(function (d) { return d.cal; })) || 1);
    var w = 100 / days.length;
    var bars = days.map(function (d, i) {
      var hpct = d.cal / max * 100;
      var col = d.cal > RDI ? 'var(--bad)' : d.cal > 0 ? 'var(--gorge)' : 'var(--surface-3)';
      return '<rect x="' + (i * w + w * 0.16).toFixed(2) + '" y="' + (100 - Math.max(hpct, 1.5)).toFixed(2) + '" ' +
        'width="' + (w * 0.68).toFixed(2) + '" height="' + Math.max(hpct, 1.5).toFixed(2) + '" rx="1" fill="' + col + '"/>';
    }).join('');
    var rdiY = 100 - (RDI / max * 100);
    return '<svg viewBox="0 0 100 100" preserveAspectRatio="none">' + bars +
      '<line x1="0" y1="' + rdiY.toFixed(2) + '" x2="100" y2="' + rdiY.toFixed(2) + '" stroke="var(--ink)" stroke-width=".6" stroke-dasharray="2 2" opacity=".55"/></svg>';
  }

  DG.screens.register('bodymax', {
    tab: 'account',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar"><button class="iconbtn" data-back>' + DG.icon('back', 20) + '</button>' +
        '<h1>BODYMAX™</h1><button class="iconbtn" data-bmhelp>' + DG.icon('help', 19) + '</button></div>';
    },
    render: function () {
      var m = DG.bodymax.metrics();
      var days = DG.bodymax.days(14);
      var badges = DG.bodymax.badges();
      var st = DG.S();

      if (!m.orders) {
        return '<div class="bmhero"><img src="assets/app/bodymax-hero.webp" alt="" onerror="this.remove()">' +
          '<div class="bm-k"><i>INTAKE TELEMETRY</i><b>No signal</b></div></div>' +
          DG.C.empty({ title: 'BODYMAX™ is listening', body: 'Place an order and your telemetry will begin. It cannot be stopped once begun.', cta: 'Find something', go: 'home' });
      }

      var h = '<div class="bmhero"><img src="assets/app/bodymax-hero.webp" alt="" onerror="this.remove()">' +
        '<div class="bm-k"><i>INTAKE TELEMETRY · SUBJECT ' + DG.esc(st.user.name.toUpperCase()) + '</i><b>' + DG.int(m.totalCal) + ' units logged</b></div></div>';

      /* trajectory */
      h += '<div class="trajectory"><div style="display:flex;align-items:baseline;gap:8px">' +
        '<b style="font:var(--t-micro);letter-spacing:.14em;color:var(--ink-3)">BODY TRAJECTORY</b>' +
        '<span style="margin-left:auto;font:800 17px var(--display);color:var(--gorge)">' + m.trajectory + '</span></div>' +
        '<div class="traj-steps">' + TRAJECTORY.map(function (t, i) {
          return (i ? '<i class="' + (i <= m.trajectoryIdx ? 'on' : '') + '"></i>' : '') +
            '<b class="' + (i <= m.trajectoryIdx ? 'on' : '') + (i === m.trajectoryIdx ? ' now' : '') + '"></b>';
        }).join('') + '</div>' +
        '<div class="traj-labels">' + TRAJECTORY.map(function (t, i) {
          return '<span class="' + (i === m.trajectoryIdx ? 'on' : '') + '">' + t.slice(0, 4) + '</span>';
        }).join('') + '</div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);margin:12px 0 0;line-height:1.45">Trajectory is computed from lifetime intake and cannot be reversed within this application.</p></div>';

      /* today */
      h += '<div style="padding:16px 16px 4px"><b style="font:var(--t-micro);letter-spacing:.14em;color:var(--ink-3)">TODAY</b></div>';
      h += gauge({ label: 'Units Consumed', value: m.todayCal, max: RDI, display: DG.int(m.todayCal),
        unit: '/ ' + DG.int(RDI) + ' RDI', note: 'DoorGorge™ Recommended Daily Intake is ' + DG.int(RDI) + ' units. This figure is not endorsed by any medical body.' });
      h += gauge({ label: 'Sodium Saturation', value: m.todaySodium, max: SODIUM_CEIL, display: DG.pct(m.todaySodium / SODIUM_CEIL * 100),
        unit: DG.int(m.todaySodium) + ' mg', note: 'Saturation above 100% is permitted and is not tracked further.' });
      h += gauge({ label: 'Grease Index', value: m.todayGrease, max: 40, display: m.todayGrease.toFixed(1), unit: 'GI' });

      /* lifetime */
      h += '<div style="padding:20px 16px 4px;border-top:8px solid var(--surface-2);margin-top:10px">' +
        '<b style="font:var(--t-micro);letter-spacing:.14em;color:var(--ink-3)">LIFETIME</b></div>';
      h += gauge({ label: 'Blood Ranch Level', value: m.ranch, max: 60, display: m.ranch.toFixed(1), unit: 'mg/dL',
        note: 'Measured indirectly from sauce-class modifier selections.' });
      h += gauge({ label: 'Structural Integrity', value: m.integrity, max: 100, display: m.integrity + '%', invert: true,
        note: 'Declines with cumulative intake. Restoration is not offered at this tier.' });
      h += gauge({ label: 'Corporate Loyalty', value: m.loyalty, max: 100, display: m.loyalty + '/100', invert: true,
        note: 'Higher is better for us.' });
      h += gauge({ label: 'Chew Debt', value: m.chewDebt, max: Math.max(600, m.chewDebt), display: DG.int(m.chewDebt), unit: 'min owed',
        note: 'Chewing not performed at the time of consumption accrues and is owed to the jaw.' });

      /* chart */
      h += '<div style="border-top:8px solid var(--surface-2);margin-top:10px">' +
        DG.C.sectionHead('14-day intake', 'Dashed line is the Recommended Daily Intake.') +
        '<div class="sparkwrap">' + spark(days) + '</div>' +
        '<div class="sparklab">' + days.map(function (d, i) { return i % 2 === 0 ? '<span>' + d.label + '</span>' : '<span></span>'; }).join('') + '</div></div>';

      /* spend */
      h += '<div class="statgrid" style="margin-top:18px">' +
        '<div><b>' + DG.money(m.spend) + '</b><span>SPENT</span></div>' +
        '<div><b style="color:var(--gorge)">' + DG.money(m.fees) + '</b><span>IN FEES</span></div>' +
        '<div><b>' + DG.money(m.tips) + '</b><span>TIPPED</span></div></div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);padding:10px 16px;line-height:1.5">' +
        (m.spend > 0 ? DG.pct(m.fees / m.spend * 100, 1) + ' of your lifetime spend was not food.' : '') + '</p>';

      /* badges */
      h += '<div style="border-top:8px solid var(--surface-2);margin-top:6px">' +
        DG.C.sectionHead('Achievements', badges.filter(function (b) { return b.earned; }).length + ' of ' + badges.length + ' unlocked') +
        '<div class="badgegrid">' + badges.map(function (b) {
          return '<div class="bdg' + (b.earned ? '' : ' locked') + '" title="' + DG.attr(b.hint) + '">' +
            '<span class="bi">' + b.icon + '</span><b>' + DG.esc(b.name) + '</b><span>' + DG.esc(b.earned ? 'Unlocked' : b.hint) + '</span></div>';
        }).join('') + '</div></div>';

      /* recommendations — all of them are upsells */
      h += '<div style="border-top:8px solid var(--surface-2);margin-top:14px">' +
        DG.C.sectionHead('Wellness recommendations', 'Personalised from your telemetry.') +
        rec('droplet', 'Increase electrolyte intake', 'BRAWNDO™ Hydration Depot is 12 minutes away.', 'brawndo') +
        rec('scale', 'Reduce portion volume', 'Try a Municipal instead of a Regional. Municipal is 41% smaller and 12% more expensive.', null) +
        rec('activity', 'Offset today\'s intake', 'Walking to the door counts. It is the only thing that counts.', null) +
        rec('sparkle', 'Consider a lighter option', 'Entire Foods Market has 14 items under 1,200 units.', 'entirefoods') +
        '</div>';

      h += '<div class="fineprint">BODYMAX™ is a wellness feature, not a medical device, not a scale, and not an opinion. ' +
        'Figures are generated by DoorGorge™ from your own ordering behaviour and are not reviewed by a clinician. ' +
        'Telemetry cannot be disabled. It can be renamed.</div>';

      return h;
    },
    mount: function (root) {
      DG.on(root, 'click', '[data-rec]', function (e, t) {
        if (t.dataset.rec) DG.nav.go('store', { slug: t.dataset.rec });
        else DG.toast('Recommendation acknowledged. It will be shown again.');
      });
      DG.on(document.getElementById('appbar'), 'click', '[data-bmhelp]', function () {
        DG.why('About BODYMAX™',
          'BODYMAX™ converts your ordering history into physiological estimates. No measurement is taken from your body. ' +
          'All figures are inferred from what you bought, which DoorGorge™ considers more reliable.');
      });
      DG.qsa('.gfill', root).forEach(function (el) {
        var w = el.style.width; el.style.width = '0';
        setTimeout(function () { el.style.width = w; }, 60);
      });
    },
  });

  function rec(icon, title, body, slug) {
    return '<button class="mrow" data-rec="' + (slug || '') + '">' + DG.icon(icon, 19) +
      '<span class="mr-b"><b>' + DG.esc(title) + '</b><span>' + DG.esc(body) + '</span></span>' +
      '<span class="mr-r">' + DG.icon('fwd', 15) + '</span></button>';
  }
})(window.DG);
