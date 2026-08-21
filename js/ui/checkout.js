/* FoodBang — checkout */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var ui = { mode: 'delivery', express: false, scheduled: null, tipPct: null, tipCustom: null, promo: null, expanded: true };

  var GUILT = {
    0:  'Your Slinger will be shown this decision before accepting the order.',
    18: 'Below our suggested floor. Delivery may be assigned to a Slinger with a lower rating.',
    25: 'Adequate. Your order will be handled with ordinary care.',
    42: 'Standard. Thank you for meeting expectations.',
    60: 'Correct. Your name has been added to the Preferred Household register.',
  };

  function calc(p) {
    var s = FB.catalog.get(p.slug);
    var lines = FB.cart.lines(p.slug);
    return FB.fees.compute({
      subtotal: FB.cart.subtotal(p.slug), lineCount: lines.length, store: s,
      mode: ui.mode, express: ui.express, scheduled: !!ui.scheduled,
      tipPct: ui.tipCustom != null ? null : (ui.tipPct != null ? ui.tipPct : FB.S().settings.autoTipPct),
      tipCustom: ui.tipCustom, promo: ui.promo, plus: FB.store.isPlus(),
      settings: FB.S().settings, distanceMi: s ? s.distanceMi : 2.4,
    });
  }

  FB.screens.register('checkout', {
    tab: 'home',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
        '<h1>Checkout</h1><span class="badge">' + FB.icon('lock', 11) + 'Secure</span></div>';
    },
    render: function (p) {
      var s = FB.catalog.get(p.slug);
      var lines = FB.cart.lines(p.slug);
      if (!s || !lines.length) return FB.C.empty({ title: 'Nothing to check out', body: 'The cart emptied itself. This is rare and is being investigated.', cta: 'Home', go: 'home' });

      var c = calc(p);
      var addr = FB.store.address();
      var pay = FB.store.payment();
      var st = FB.S();
      var sub = FB.cart.subtotal(p.slug);
      var tiers = FB.fees.tipTiers(sub);
      var curTip = ui.tipCustom != null ? null : (ui.tipPct != null ? ui.tipPct : st.settings.autoTipPct);

      var h = '';

      /* mode */
      h += '<div class="cblock"><div class="st-modes" style="margin:12px 16px 4px">' +
        '<button data-cmode="delivery" aria-pressed="' + (ui.mode === 'delivery') + '">Delivery</button>' +
        '<button data-cmode="pickup" aria-pressed="' + (ui.mode === 'pickup') + '">Pickup</button></div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);padding:8px 16px 4px;line-height:1.45">' +
        (ui.mode === 'pickup'
          ? 'Pickup removes the Delivery Fee and adds the Retrieval Facilitation Fee and the Vehicle Deployment Fee.'
          : 'Delivery includes the Delivery Fee, which does not include delivery of the bag, which is billed separately.') +
        '</p></div>';

      /* address / timing */
      h += '<div class="cblock"><h3>' + (ui.mode === 'pickup' ? 'Pickup from' : 'Deliver to') + '</h3>';
      if (ui.mode === 'pickup') {
        h += '<div class="crow">' + FB.icon('pin', 19) + '<span class="crow-b"><b>' + FB.esc(s.name) + '</b><span>' + FB.esc(s.address) + '</span></span></div>';
      } else {
        h += '<button class="crow" data-addr>' + FB.icon('pin', 19) +
          '<span class="crow-b"><b>' + FB.esc(addr.label) + ' · ' + FB.esc(addr.line1) + '</b><span>' + FB.esc(addr.city) + '</span></span>' +
          '<span class="crow-r">Change' + FB.icon('fwd', 14) + '</span></button>';
        h += '<button class="crow" data-instructions>' + FB.icon('edit', 19) +
          '<span class="crow-b"><b>Dropoff instructions</b><span>' + FB.esc(addr.instructions || 'None provided') + '</span></span>' +
          '<span class="crow-r">' + FB.icon('fwd', 14) + '</span></button>';
      }
      h += '<button class="crow" data-schedule>' + FB.icon('clock', 19) +
        '<span class="crow-b"><b>' + (ui.scheduled ? 'Scheduled · ' + FB.esc(ui.scheduled) : 'Standard · ' + FB.mins(s.deliveryMin, s.deliveryMax)) + '</b>' +
        '<span>' + (ui.scheduled ? 'Temporal Coordination Fee applies' : 'Arrives around ' + FB.clockIn(s.deliveryMax)) + '</span></span>' +
        '<span class="crow-r">' + FB.icon('fwd', 14) + '</span></button>';
      h += '<button class="switchrow" data-express role="switch" aria-checked="' + ui.express + '">' +
        '<span class="sr-b"><b>Express Bang™ · ' + FB.money(5.99) + '</b><span>Places your order ahead of other orders, which are then placed ahead of yours. Reduces arrival by up to 1 minute.</span></span>' +
        '<span class="switch" aria-checked="' + ui.express + '"></span></button>';
      h += '</div>';

      /* payment + promo */
      h += '<div class="cblock"><h3>Payment</h3>' +
        '<button class="crow" data-pay>' + FB.icon('card', 19) +
        '<span class="crow-b"><b>' + FB.esc(pay.brand) + ' ····' + FB.esc(pay.last4) + '</b><span>' + FB.esc(pay.nickname) + '</span></span>' +
        '<span class="crow-r">Change' + FB.icon('fwd', 14) + '</span></button>' +
        '<button class="crow" data-promo>' + FB.icon('tag', 19) +
        '<span class="crow-b"><b>' + (ui.promo && ui.promo.valid ? 'Promo ' + FB.esc(ui.promo.code) + ' applied' : 'Add a promo code') + '</b>' +
        '<span>' + (ui.promo && ui.promo.valid ? FB.esc(ui.promo.blurb) : 'Six codes are currently active. All six have conditions.') + '</span></span>' +
        '<span class="crow-r">' + FB.icon('fwd', 14) + '</span></button>' +
        (st.credits > 0 ? '<div class="crow">' + FB.icon('gift', 19) + '<span class="crow-b"><b>BangBux™ balance</b><span>' + FB.money(st.credits) + ' — redeemable against fees, not food</span></span></div>' : '') +
        '</div>';

      /* bang+ inline pitch */
      if (!st.plus.active) {
        h += '<div class="cblock"><button class="callout callout--plus" data-go="plus" style="width:calc(100% - 32px);text-align:left">' +
          FB.icon('zap', 17) + '<span><b style="display:block;margin-bottom:3px">Join BANG+ and save ' + FB.money(Math.min(c.feeLines[0].amount, 4.99)) + ' on this order</b>' +
          '<span style="opacity:.72">$19.99/month. This order would save ' + FB.money(Math.min(c.feeLines[0].amount, 4.99)) + '.</span></span></button></div>';
      }

      /* tip */
      h += '<div class="cblock"><h3>Slinger tip</h3>' +
        '<div class="tiprow">' + tiers.map(function (t) {
          return '<button class="tipbtn" data-tip="' + t.pct + '" aria-pressed="' + (curTip === t.pct) + '">' +
            '<b>' + (t.pct === 0 ? 'None' : t.pct + '%') + '</b><span>' + FB.money(t.amount) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="tiprow" style="padding-top:0"><button class="tipbtn" data-tipcustom aria-pressed="' + (ui.tipCustom != null) + '" style="flex:1">' +
          '<b>' + (ui.tipCustom != null ? FB.money(ui.tipCustom) : 'Custom') + '</b><span>Reviewed manually</span></button></div>' +
        '<p class="tipguilt">' + FB.esc(curTip != null ? (GUILT[curTip] || 'Recorded.') : 'A custom amount is recorded and compared against the household average.') + '</p>' +
        '</div>';

      /* receipt */
      h += '<div class="cblock"><h3>Order summary</h3>' +
        '<div style="padding:0 16px 8px">' + lines.map(function (l) {
          return '<div style="display:flex;gap:10px;padding:5px 0;font:var(--t-sub)"><span style="color:var(--ink-3);min-width:20px">' + l.qty + '×</span>' +
            '<span style="flex:1;color:var(--ink-2)">' + FB.esc(l.name) + '</span>' +
            '<span class="tabnums">' + FB.money(l.unit * l.qty) + '</span></div>';
        }).join('') + '</div>' +
        FB.C.receipt(c, { collapsed: false }) + '</div>';

      h += '<div class="fineprint">By placing this order you authorise FoodBang™ to charge the total shown, the total not shown, and any total that emerges. ' +
        'Cancellation is available for 3 seconds after placement, during which the button is disabled.</div>';

      h += '<div style="padding:4px 16px 24px"><button class="btn btn--primary btn--lg btn--block btn--split" data-place>' +
        '<span>Place order</span><span>' + FB.money(c.total) + '</span></button>' +
        '<p style="text-align:center;font:var(--t-cap);color:var(--ink-3);margin:10px 0 0">' +
        FB.money(c.subtotal) + ' of food · ' + FB.money(c.nonFood) + ' of everything else</p></div>';

      return h;
    },

    mount: function (root, p) {
      FB.C.wireWhy(root);
      var s = FB.catalog.get(p.slug);

      FB.on(root, 'click', '[data-cmode]', function (e, t) { ui.mode = t.dataset.cmode; FB.nav.refresh(); });
      FB.on(root, 'click', '[data-express]', function () {
        ui.express = !ui.express; FB.nav.refresh();
        if (ui.express) FB.toast('Express Bang™ enabled. Estimated arrival reduced by 1 minute.');
      });
      FB.on(root, 'click', '[data-tip]', function (e, t) { ui.tipPct = Number(t.dataset.tip); ui.tipCustom = null; FB.nav.refresh(); });
      FB.on(root, 'click', '[data-tipcustom]', openCustomTip);
      FB.on(root, 'click', '[data-addr]', function () { FB.openAddressSheet(function () { FB.nav.refresh(); }); });
      FB.on(root, 'click', '[data-pay]', function () { FB.openPaymentSheet(function () { FB.nav.refresh(); }); });
      FB.on(root, 'click', '[data-instructions]', openInstructions);
      FB.on(root, 'click', '[data-schedule]', openSchedule);
      FB.on(root, 'click', '[data-promo]', function () { openPromo(p); });
      FB.on(root, 'click', '[data-place]', function (e, t) { place(p, t); });

      function openCustomTip() {
        FB.sheet.open({
          title: 'Custom tip', sub: 'Custom amounts are reviewed.',
          html: '<div class="field"><label class="lbl" for="f-tip">Amount</label>' +
            '<input class="input" id="f-tip" type="number" min="0" step="0.25" value="' + (ui.tipCustom != null ? ui.tipCustom : '') + '" data-ct placeholder="0.00">' +
            '<div class="field-hint">The suggested amount is ' + FB.money(FB.cart.subtotal(p.slug) * 0.42) + '.</div></div>',
          footer: '<button class="btn btn--primary btn--block" data-save>Set tip</button>',
          onMount: function (body, h) {
            FB.on(h.el, 'click', '[data-save]', function () {
              var v = parseFloat(body.querySelector('[data-ct]').value);
              ui.tipCustom = isNaN(v) ? null : Math.max(0, v); ui.tipPct = null;
              h.close(); FB.nav.refresh();
            });
          },
        });
      }

      function openInstructions() {
        var a = FB.store.address();
        var OPTS = [
          { id: 'leave', name: 'Leave at door', note: 'A photograph will be taken. It will not be of your door.' },
          { id: 'hand', name: 'Hand it to me', note: 'Requires you to be present, awake, and clothed.' },
          { id: 'meet', name: 'Meet outside', note: 'Outside is not defined and is not disputable.' },
          { id: 'lobby', name: 'Leave in lobby', note: 'The lobby is a shared resource. Your order will be shared.' },
        ];
        FB.sheet.open({
          title: 'Dropoff instructions',
          html: OPTS.map(function (o) {
            return '<button class="opt" role="radio" aria-checked="' + (a.dropoff === o.id) + '" data-drop="' + o.id + '">' +
              '<span class="mark"></span><span class="opt-b"><b>' + o.name + '</b><span>' + o.note + '</span></span></button>';
          }).join('') +
          '<div class="field" style="padding-top:14px"><label class="lbl" for="f-note">Note for your Slinger</label>' +
          '<textarea class="textarea" id="f-note" data-ins placeholder="Gate code, floor, warnings…">' + FB.esc(a.instructions || '') + '</textarea></div>',
          footer: '<button class="btn btn--primary btn--block" data-save>Save</button>',
          onMount: function (body, h) {
            var pick = a.dropoff;
            FB.on(body, 'click', '[data-drop]', function (e, t) {
              pick = t.dataset.drop;
              FB.qsa('[data-drop]', body).forEach(function (b) { b.setAttribute('aria-checked', b.dataset.drop === pick); });
            });
            FB.on(h.el, 'click', '[data-save]', function () {
              var txt = body.querySelector('[data-ins]').value;
              FB.store.set(function (st) {
                var ad = st.addresses.filter(function (x) { return x.id === a.id; })[0];
                if (ad) { ad.dropoff = pick; ad.instructions = txt; }
                return st;
              });
              h.close(); FB.nav.refresh(); FB.toast('Instructions saved and forwarded to a queue.');
            });
          },
        });
      }

      function openSchedule() {
        var slots = [];
        for (var i = 1; i <= 8; i++) slots.push(FB.clockIn(s.deliveryMax + i * 45));
        FB.sheet.open({
          title: 'Schedule delivery', sub: 'Scheduling requires the future, which must be reserved.',
          html: '<button class="opt" role="radio" aria-checked="' + (!ui.scheduled) + '" data-slot="">' +
            '<span class="mark"></span><span class="opt-b"><b>Standard</b><span>' + FB.mins(s.deliveryMin, s.deliveryMax) + ' · no coordination fee</span></span></button>' +
            slots.map(function (t) {
              return '<button class="opt" role="radio" aria-checked="' + (ui.scheduled === t) + '" data-slot="' + t + '">' +
                '<span class="mark"></span><span class="opt-b"><b>Today, ' + t + '</b><span>Window: ' + t + ' – indefinite</span></span>' +
                '<span class="opt-p">+' + FB.money(2.60) + '</span></button>';
            }).join(''),
          onMount: function (body, h) {
            FB.on(body, 'click', '[data-slot]', function (e, t) {
              ui.scheduled = t.dataset.slot || null; h.close(); FB.nav.refresh();
            });
          },
        });
      }

      function openPromo(pp) {
        FB.sheet.open({
          title: 'Promo code',
          html: '<div class="field"><input class="input" data-code placeholder="Enter code" autocapitalize="characters" value="' + FB.esc(ui.promo ? ui.promo.code : '') + '">' +
            '<div class="field-hint" data-msg>Codes are case-insensitive and condition-heavy.</div></div>' +
            '<div style="padding:0 16px 16px"><div style="font:var(--t-cap);color:var(--ink-3);margin-bottom:8px">CURRENTLY CIRCULATING</div>' +
            '<div style="display:flex;flex-wrap:wrap;gap:7px">' + Object.keys(FB.fees.PROMOS).map(function (k) {
              return '<button class="chip chip--outline" data-try="' + k + '">' + k + '</button>';
            }).join('') + '</div></div>',
          footer: '<button class="btn btn--primary btn--block" data-apply>Apply</button>',
          onMount: function (body, h) {
            var input = body.querySelector('[data-code]');
            var msg = body.querySelector('[data-msg]');
            FB.on(body, 'click', '[data-try]', function (e, t) { input.value = t.dataset.try; });
            FB.on(h.el, 'click', '[data-apply]', function () {
              var r = FB.fees.checkPromo(input.value, FB.cart.subtotal(pp.slug));
              if (!r) { h.close(); return; }
              if (!r.valid) { msg.className = 'field-err'; msg.textContent = r.error; return; }
              ui.promo = r; h.close(); FB.nav.refresh();
              FB.toast('Promo ' + r.code + ' applied.', { icon: 'checkFill' });
            });
          },
        });
      }
    },
  });

  /* One order per tap, whatever the DOM does. The 3-second "cancellation window"
     means the button stays on screen while the order is in flight. */
  var placing = false;

  function place(p, btn) {
    if (placing) return;
    placing = true;
    var s = FB.catalog.get(p.slug);
    var lines = FB.cart.lines(p.slug).map(function (l) {
      return { name: l.name, qty: l.qty, unit: l.unit, itemId: l.itemId, sel: l.sel, note: l.note,
               opts: FB.cart.describe(p.slug, l) };
    });
    var c = calc(p);
    btn.disabled = true;
    btn.innerHTML = '<span>Placing…</span>';

    /* the 3-second cancellation window the fine print promises, during which the button is disabled */
    setTimeout(function () {
      var load = FB.cart.lines(p.slug).reduce(function (acc, l) {
        var it = FB.catalog.item(p.slug, l.itemId);
        if (!it) return acc;
        var n = FB.catalog.itemLoad(it, l.sel, l.qty);
        acc.calories += n.calories; acc.sodium += n.sodium; acc.grease += n.grease; acc.ranch += n.ranch;
        return acc;
      }, { calories: 0, sodium: 0, grease: 0, ranch: 0 });

      var id = FB.uid('o');
      var g = FB.C.slinger(id);
      var order = {
        id: id, slug: s.slug, storeName: s.name, logo: s.logoSrc,
        placedAt: Date.now(), mode: ui.mode, express: ui.express, scheduled: ui.scheduled,
        address: FB.deep(FB.store.address()), payment: FB.deep(FB.store.payment()),
        lines: lines, calc: { subtotal: c.subtotal, feesTotal: c.feesTotal, tax: c.taxLine.amount,
          tip: c.tipLine.amount, total: c.total, nonFood: c.nonFood, multiple: c.multiple,
          feeLines: c.feeLines.map(function (l) { return { label: l.label, amount: l.amount, id: l.id, free: l.free }; }),
          roundUp: c.roundLine ? c.roundLine.amount : 0, promo: c.promoAmount },
        status: 'placed', slinger: g, etaMin: s.deliveryMax + (ui.express ? -1 : 0), etaDrift: 0,
        events: [], rated: null, load: load, step: 0,
      };

      FB.store.set(function (st) {
        st.orders.unshift(order);
        st.activeOrderId = order.id;
        delete st.cart[s.slug];
        st.meta.orderCount++;
        st.meta.lifetimeSpend = FB.round2(st.meta.lifetimeSpend + c.total);
        st.meta.lifetimeFees = FB.round2(st.meta.lifetimeFees + c.feesTotal + c.taxLine.amount + (c.roundLine ? c.roundLine.amount : 0));
        st.meta.lifetimeTips = FB.round2(st.meta.lifetimeTips + c.tipLine.amount);
        st.meta.lifetimeCalories += load.calories;
        if (ui.promo && ui.promo.valid) st.promo.used.push(ui.promo.code);
        return st;
      });
      FB.bodymax.ingest(order);
      ui.promo = null; ui.express = false; ui.scheduled = null; ui.tipCustom = null; ui.tipPct = null;
      placing = false;
      FB.tracker.start(order.id);
      FB.nav.go('track', { id: order.id });
    }, 3000);
  }
})(window.FB);
