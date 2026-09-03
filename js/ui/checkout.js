/* FoodBang — checkout */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* Small number words: the voice spells these out. "7 codes are currently active"
     reads as a different app. */
  var WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  function count(n) { return WORDS[n] || String(n); }

  var GUILT = {
    0:  'Your Slinger will be shown this decision before accepting the order.',
    18: 'Below our suggested floor. Delivery may be assigned to a Slinger with a lower rating.',
    25: 'Adequate. Your order will be handled with ordinary care.',
    42: 'Standard. Thank you for meeting expectations.',
    60: 'Correct. Your name has been added to the Preferred Household register.',
  };

  /* The code is re-checked against the CURRENT subtotal on every paint. Removing an
     item can put the order back under a code's own minimum, and the code has to fall
     off with it rather than ride along on the validation it passed a basket ago. */
  function promoFor(p, sub) {
    var code = FB.cart.co(p.slug).promoCode;
    /* re-checked on every paint, never cached — which means placing an order flips
       the code to spent in any other open cart still holding it. Deliberate. */
    return code ? FB.fees.checkPromo(code, sub, FB.S().promo.used) : null;
  }

  /* An order from a shut store is not refused — it is scheduled, at the Temporal
     Coordination Fee this app already charges for the privilege of the future.
     The rule itself lives in js/core/cart.js so the cart preview reads the same
     one; duplicating it here is exactly how the two screens came to disagree. */
  function slotFor(p) { return FB.cart.slot(p.slug); }

  /* The schedule sheet hardcoded "Today," on every row it drew. Sixteen percent of
     them resolved to the next day — including the opening-time row the app itself
     forces a closed store onto, which at 11 PM read "Today, 11:30 AM" for an order
     arriving twelve and a half hours later. Anchored at local midnight and ROUNDED,
     so the hour a daylight-saving change adds or removes cannot shift the answer. */
  function dayWord(ts, from) {
    var a = new Date(from || Date.now()), b = new Date(ts);
    var days = Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) -
                           new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
    if (days <= 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][b.getDay()];
  }

  function calc(p) {
    var s = FB.catalog.get(p.slug);
    var lines = FB.cart.lines(p.slug);
    var co = FB.cart.co(p.slug);
    var sub = FB.cart.subtotal(p.slug);
    return FB.fees.compute({
      subtotal: sub, lineCount: lines.length, store: s,
      mode: co.mode, express: co.express, scheduled: !!slotFor(p),
      tipPct: co.tipCustom != null ? null : (co.tipPct != null ? co.tipPct : FB.S().settings.autoTipPct),
      tipCustom: co.tipCustom, promo: promoFor(p, sub), plus: FB.store.isPlus(),
      settings: FB.S().settings, distanceMi: s ? s.distanceMi : 2.4,
      standingTier: FB.S().standing.tier,
      scrip: FB.scrip.redeemable(),
      tosVersion: FB.tos.version(),
      storePromo: FB.catalog.storeOffer(s, sub, FB.store.isPlus()),
      /* only what is still OUT — monitoring for an item already back in stock has
         been discharged and must stop billing. Identical in js/ui/cart-screen.js:
         a ctx field that differs between the two call sites is a cart preview
         quoting a total checkout will not charge. */
      restockAlerts: FB.notifs.monitored().length,
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

      /* The cart screen blocks its own button, but it is not the only way in — a
         back-forward, a deep link, or a day rolling over while this screen sits open
         all land here with food the restaurant has stopped serving. */
      var dead = FB.cart.unsellable(p.slug);
      if (dead.length) {
        return FB.C.empty({
          title: FB.plural(dead.length, 'item') + ' no longer available',
          /* Pronoun-free: the subject was branched and the pronoun after it was not,
             so a single dead line read "one item … They must be removed". The cart
             screen states the same refusal flatly; match it. */
          body: 'The restaurant has stopped serving ' + (dead.length === 1 ? 'one item' : 'items') +
            ' in this order today: ' + dead.map(function (l) { return l.name; }).join(', ') +
            '. Removal is required before the order can proceed.',
          cta: 'Back to cart', go: 'cart', params: { slug: p.slug },
        });
      }

      var c = calc(p);
      var addr = FB.store.address();
      var pay = FB.store.payment();
      var st = FB.S();
      var sub = FB.cart.subtotal(p.slug);
      var co = FB.cart.co(p.slug);
      var promo = promoFor(p, sub);
      var tiers = FB.fees.tipTiers(sub);
      var curTip = co.tipCustom != null ? null : (co.tipPct != null ? co.tipPct : st.settings.autoTipPct);
      /* The Default tip slider runs 0..80 in steps of 1, and the canonical tiers are
         five values — so for 76 of its 81 positions the receipt charged "Slinger Tip
         (37%)" while every control on the screen rendered aria-pressed="false" and
         the guilt copy fell through to "Recorded." No control corresponded to the
         charge, and tapping any of them destroyed the setting with no way back.
         Injected at the call site: FB.fees.tipTiers stays the canonical five, because
         smoke.cjs requires fees.js with only util.js loaded and a UI concern must not
         move into it. */
      if (curTip != null && !tiers.some(function (t) { return t.pct === curTip; })) {
        tiers = tiers.concat([{ pct: curTip, label: curTip + '%', sub: 'Your default. Set in Settings.' }])
          .sort(function (a, b) { return a.pct - b.pct; });
      }
      var nCodes = Object.keys(FB.fees.PROMOS).length;

      var h = '';

      /* mode */
      h += '<div class="cblock"><div class="st-modes" style="margin:12px 16px 4px">' +
        '<button data-cmode="delivery" aria-pressed="' + (co.mode === 'delivery') + '">Delivery</button>' +
        '<button data-cmode="pickup" aria-pressed="' + (co.mode === 'pickup') + '">Pickup</button></div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);padding:8px 16px 4px;line-height:1.45">' +
        (co.mode === 'pickup'
          ? 'Pickup removes the Delivery Fee and adds the Retrieval Facilitation Fee and the Vehicle Deployment Fee.'
          : 'Delivery includes the Delivery Fee, which does not include delivery of the bag, which is billed separately.') +
        '</p></div>';

      /* address / timing */
      h += '<div class="cblock"><h2>' + (co.mode === 'pickup' ? 'Pickup from' : 'Deliver to') + '</h2>';
      if (co.mode === 'pickup') {
        h += '<div class="crow">' + FB.icon('pin', 19) + '<span class="crow-b"><b>' + FB.esc(s.name) + '</b><span>' + FB.esc(s.address) + '</span></span></div>';
      } else {
        h += '<button class="crow" data-addr>' + FB.icon('pin', 19) +
          '<span class="crow-b"><b>' + FB.esc(addr.label) + ' · ' + FB.esc(addr.line1) + '</b><span>' + FB.esc(addr.city) + '</span></span>' +
          '<span class="crow-r">Change' + FB.icon('fwd', 14) + '</span></button>';
        h += '<button class="crow" data-instructions>' + FB.icon('edit', 19) +
          '<span class="crow-b"><b>Dropoff instructions</b><span>' + FB.esc(addr.instructions || 'None provided') + '</span></span>' +
          '<span class="crow-r">' + FB.icon('fwd', 14) + '</span></button>';
      }
      var slot = slotFor(p);
      var slotAt = FB.cart.slotAt(p.slug);
      /* `forced` means the APP chose this slot, not you — which is also true when a
         slot you chose has gone stale and cart.slot() has fallen back to opensAt. */
      var forced = !!slot && slot !== co.scheduled;
      var slotDay = slotAt && dayWord(slotAt) !== 'Today' ? dayWord(slotAt) + ', ' : '';
      h += '<button class="crow" data-schedule>' + FB.icon('clock', 19) +
        '<span class="crow-b"><b>' + (slot ? 'Scheduled · ' + FB.esc(slotDay + slot) : 'Standard · ' + FB.mins(s.deliveryMin, s.deliveryMax)) + '</b>' +
        '<span>' + (forced ? FB.esc(s.name) + ' is closed. The order is held until it opens, which must be reserved.'
          : slot ? 'Temporal Coordination Fee applies' : 'Arrives around ' + FB.clockIn(s.deliveryMax)) + '</span></span>' +
        '<span class="crow-r">' + FB.icon('fwd', 14) + '</span></button>';
      h += '<button class="switchrow" data-express role="switch" aria-checked="' + co.express + '">' +
        '<span class="sr-b"><b>Express Bang™ · ' + FB.money(5.99) + '</b><span>Places your order ahead of other orders, which are then placed ahead of yours. Reduces arrival by up to 1 minute.</span></span>' +
        '<span class="switch" aria-checked="' + co.express + '" aria-hidden="true"></span></button>';
      h += '</div>';

      /* payment + promo */
      h += '<div class="cblock"><h2>Payment</h2>' +
        '<button class="crow" data-pay>' + FB.icon('card', 19) +
        '<span class="crow-b"><b>' + FB.esc(pay.brand) + ' ····' + FB.esc(pay.last4) + '</b><span>' + FB.esc(pay.nickname) + '</span></span>' +
        '<span class="crow-r">Change' + FB.icon('fwd', 14) + '</span></button>' +
        '<button class="crow" data-promo>' + FB.icon('tag', 19) +
        '<span class="crow-b"><b>' + (promo ? 'Promo ' + FB.esc(promo.code) + (promo.valid ? ' applied' : ' no longer applies') : 'Add a promo code') + '</b>' +
        '<span>' + (promo ? FB.esc(promo.valid ? promo.blurb : promo.error)
          : FB.titleCase(count(nCodes)) + ' codes are currently active. All ' + count(nCodes) + ' have conditions.') + '</span></span>' +
        '<span class="crow-r">' + FB.icon('fwd', 14) + '</span></button>' +
        (FB.scrip.balance() > 0 ? '<div class="crow">' + FB.icon('gift', 19) +
          '<span class="crow-b"><b>BangBux™ balance ' + FB.money(FB.scrip.balance()) + '</b><span>Redeemable against fees, not food. ' +
          'A maximum of ' + FB.money(FB.fees.SCRIP_MAX_PER_ORDER) + ' may be redeemed per order.</span></span></div>' : '') +
        '</div>';

      /* bang+ inline pitch. Located by id, never by position: feeLines[0] on a
         PICKUP order is the Retrieval Facilitation Fee, which BANG+ does not touch —
         the pitch offered to save $3.75 off a fee joining would not have reduced,
         while joining would only have added the $1.99 Benefit Realization Fee.
         Pickup gets no pitch at all, because there is no pickup saving to pitch. */
      var dline = null;
      if (co.mode === 'delivery') {
        dline = c.feeLines.filter(function (l) { return l.id === 'delivery'; })[0] || null;
      }
      if (!st.plus.active && dline) {
        var saves = FB.money(Math.min(FB.round2(dline.amount * 0.3), 4.99));
        h += '<div class="cblock"><button class="callout callout--plus" data-go="plus" style="width:calc(100% - 32px);text-align:left">' +
          FB.icon('zap', 17) + '<span><b style="display:block;margin-bottom:3px">Join BANG+ and save ' + saves + ' on this order</b>' +
          '<span style="opacity:.72">$19.99/month. This order would save ' + saves + '.</span></span></button></div>';
      }

      /* tip */
      h += '<div class="cblock"><h2>Slinger tip</h2>' +
        '<div class="tiprow">' + tiers.map(function (t) {
          return '<button class="tipbtn" data-tip="' + t.pct + '" aria-pressed="' + (curTip === t.pct) + '">' +
            '<b>' + (t.pct === 0 ? 'None' : t.pct + '%') + '</b><span>' + FB.money(t.amount) + '</span></button>';
        }).join('') + '</div>' +
        '<div class="tiprow" style="padding-top:0"><button class="tipbtn" data-tipcustom aria-pressed="' + (co.tipCustom != null) + '" style="flex:1">' +
          '<b>' + (co.tipCustom != null ? FB.money(co.tipCustom) : 'Custom') + '</b><span>Reviewed manually</span></button></div>' +
        '<p class="tipguilt">' + FB.esc(curTip != null ? (GUILT[curTip] || 'Recorded.') : 'A custom amount is recorded and compared against the household average.') + '</p>' +
        '</div>';

      /* receipt */
      h += '<div class="cblock"><h2>Order summary</h2>' +
        '<div style="padding:0 16px 8px">' + lines.map(function (l) {
          return '<div style="display:flex;gap:10px;padding:5px 0;font:var(--t-sub)"><span style="color:var(--ink-3);min-width:20px">' + l.qty + '×</span>' +
            '<span style="flex:1;color:var(--ink-2)">' + FB.esc(l.name) + '</span>' +
            '<span class="tabnums">' + FB.money(l.unit * l.qty) + '</span></div>';
        }).join('') + '</div>' +
        FB.C.receipt(c, { collapsed: false }) + '</div>';

      h += '<div class="fineprint">By placing this order you authorize FoodBang™ to charge the total shown, the total not shown, and any total that emerges. ' +
        'Cancellation is available for 3 seconds after placement, during which the button is disabled.</div>';

      /* `placing` has to survive a repaint: the order sits in a 3-second cancellation
         window, and any refresh during it (a tip tap, a sheet closing) would otherwise
         rebuild an enabled "Place order" button over an order already in flight. */
      h += '<div style="padding:4px 16px 24px"><button class="btn btn--primary btn--lg btn--block btn--split" data-place' +
        ' data-quote="' + c.total + '"' + (placing ? ' disabled' : '') + '>' +
        /* read from the module, not hardcoded: a repaint mid-window — a tip tap, a
           sheet closing — would otherwise reset the sequence to its first stage */
        (placing ? '<span>' + FB.esc(placingStage) + '</span>' : '<span>Place order</span><span>' + FB.money(c.total) + '</span>') + '</button>' +
        '<p style="text-align:center;font:var(--t-cap);color:var(--ink-3);margin:10px 0 0">' +
        /* foodPaid, not subtotal: nonFood is already post-discount, so pairing it
           with the pre-discount figure made the two overshoot the button by exactly
           the promotion. These two must add up to the total. */
        FB.money(c.foodPaid) + ' of food · ' + FB.money(c.nonFood) + ' of everything else</p></div>';

      return h;
    },

    mount: function (root, p) {
      FB.C.wireWhy(root);
      var s = FB.catalog.get(p.slug);

      FB.on(root, 'click', '[data-cmode]', function (e, t) { FB.cart.setCo(p.slug, { mode: t.dataset.cmode }); FB.nav.refresh(); });
      FB.on(root, 'click', '[data-express]', function () {
        var on = !FB.cart.co(p.slug).express;
        FB.cart.setCo(p.slug, { express: on }); FB.nav.refresh();
        if (on) FB.toast('Express Bang™ enabled. Estimated arrival reduced by 1 minute.');
      });
      FB.on(root, 'click', '[data-tip]', function (e, t) {
        FB.cart.setCo(p.slug, { tipPct: Number(t.dataset.tip), tipCustom: null }); FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-tipcustom]', openCustomTip);
      FB.on(root, 'click', '[data-addr]', function () { FB.openAddressSheet(function () { FB.nav.refresh(); }); });
      FB.on(root, 'click', '[data-pay]', function () { FB.openPaymentSheet(function () { FB.nav.refresh(); }); });
      FB.on(root, 'click', '[data-instructions]', openInstructions);
      FB.on(root, 'click', '[data-schedule]', openSchedule);
      FB.on(root, 'click', '[data-promo]', function () { openPromo(p); });
      /* Gated BEFORE place(), not after. Opening it from inside place()'s setTimeout
         would put a modal up eleven lines before FB.nav.go('track') runs
         overlay.closeAll(true) and removes it before a frame paints — and gating
         first is the honest reading of "you must accept this to continue" anyway. */
      FB.on(root, 'click', '[data-place]', function (e, t) {
        /* Availability first, and ahead of the price check: scarcity turns over at
           the local day boundary and this screen does not repaint on a clock tick,
           so an enabled button can be sitting over a basket the restaurant has since
           dropped. Telling someone their total moved, when the real problem is that
           the food is gone, answers a question they did not ask. */
        if (FB.cart.unsellable(p.slug).length) {
          stopStages();
          FB.nav.refresh();
          FB.toast('An item in this order is no longer available and has to be removed.', { kind: 'bad' });
          return;
        }
        /* The figure on this button was computed at the last paint, and nothing here
           re-renders on a clock tick. A store that closes while the screen sits open
           moves the total by five dollars — the coordination fee, times the Peak
           Demand multiplier, rounded up — and silently converts a forty-minute
           delivery into a next-day scheduled order. Same rule as the terms gate
           below: a screen may not quote a total it will not charge. */
        var quoted = parseFloat(t.dataset.quote);
        var live = calc(p).total;
        if (isFinite(quoted) && Math.abs(live - quoted) > 0.005) {
          FB.nav.refresh();
          FB.toast('The total has been reassessed while this screen was open. ' +
            FB.money(live) + ' is now in force.');
          return;
        }
        var due = FB.tos.due();
        if (!due) { place(p, t); return; }
        /* Accepting adds §14's Reconciliation Fee, which calc() reads — so placing
           straight through would charge a total five dollars above the one the
           button had just quoted, on the one modal you are not allowed to escape.
           The app's rule is that a screen may not quote a total it will not charge.
           Repaint and make the next tap be against the revised figure. `t` is the
           old button node and is discarded by paint(); it must not be reused. */
        openTerms(due, function () {
          FB.nav.refresh();
          FB.toast('Terms accepted. Your total has been reassessed under the terms now in force.');
        });
      });

      function openCustomTip() {
        var cur = FB.cart.co(p.slug).tipCustom;
        FB.sheet.open({
          title: 'Custom tip', sub: 'Custom amounts are reviewed.',
          html: '<div class="field"><label class="lbl" for="f-tip">Amount</label>' +
            '<input class="input" id="f-tip" type="number" min="0" step="0.25" max="' + FB.fees.TIP_MAX + '" value="' + (cur != null ? cur : '') + '" data-ct placeholder="0.00">' +
            '<div class="field-hint">The suggested amount is ' + FB.money(FB.cart.subtotal(p.slug) * 0.42) + '.</div></div>',
          footer: '<button class="btn btn--primary btn--block" data-save>Set tip</button>',
          onMount: function (body, h) {
            FB.on(h.el, 'click', '[data-save]', function () {
              var raw = String(body.querySelector('[data-ct]').value).trim();
              var v = parseFloat(raw);
              /* A blank or unparseable field is not a choice. Writing tipPct:null here
                 erased an explicit "None" and dropped the order back onto
                 settings.autoTipPct (fees.js:244), putting ten dollars of tip back on
                 a total — from a button labelled "Set tip". */
              if (raw === '' || isNaN(v)) { h.close(); return; }
              /* Clamped, which the old Math.max(0, v) was not. parseFloat("1e999")
                 is Infinity and isNaN(Infinity) is false, so it sailed through and
                 rendered as "$Infinity" across cart and checkout — then reached
                 localStorage, where JSON.stringify writes Infinity as null, and
                 fillDefaults only backfills undefined, so every lifetime ledger read
                 $0.00 after the next reload.
                 Clamping before rounding rather than after is presentation, not
                 safety: FB.clamp answers TIP_MAX for Infinity either way. */
              var tip = FB.round2(FB.clamp(v, 0, FB.fees.TIP_MAX));
              FB.cart.setCo(p.slug, { tipCustom: tip, tipPct: null });
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
          html: '<div role="radiogroup" aria-label="Dropoff">' + OPTS.map(function (o) {
            return '<button class="opt" role="radio" aria-checked="' + (a.dropoff === o.id) + '" data-drop="' + o.id + '">' +
              '<span class="mark"></span><span class="opt-b"><b>' + FB.esc(o.name) + '</b><span>' + FB.esc(o.note) + '</span></span></button>';
          }).join('') + '</div>' +
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
        /* Read through the same derivation the FEE uses. Reading co.scheduled here
           showed a closed store a pre-selected "Standard · no coordination fee" row
           while it was being charged the coordination fee, with no way to reach the
           state that row described. */
        var picked = FB.cart.slot(p.slug);
        var pickedAt = FB.cart.slotAt(p.slug);
        var shut = !FB.catalog.isOpen(s);
        /* Generated in core, where the store's own hours are consulted and the slot
           already in force is spliced back in. Built here, the sheet offered times
           the store was shut for and could not mark its own selection. */
        var slots = FB.cart.slotOptions(p.slug);
        FB.sheet.open({
          title: 'Schedule delivery',
          /* raw, not FB.esc: mkOverlay escapes cfg.sub itself (shell.js), so
             pre-escaping renders "Colonel Cluckingham&#39;s" as literal text */
          sub: shut ? s.name + ' is closed. A time must be reserved.'
                    : 'Scheduling requires the future, which must be reserved.',
          html: (shut ? '' :
            '<button class="opt" role="radio" aria-checked="' + (!picked) + '" data-slot="">' +
            '<span class="mark"></span><span class="opt-b"><b>Standard</b><span>' + FB.mins(s.deliveryMin, s.deliveryMax) + ' · no coordination fee</span></span></button>') +
            slots.map(function (o) {
              return '<button class="opt" role="radio" aria-checked="' + (pickedAt === o.at) + '" data-slot="' + o.label + '">' +
                '<span class="mark"></span><span class="opt-b"><b>' + dayWord(o.at) + ', ' + o.label + '</b>' +
                '<span>Window: ' + o.label + ' – indefinite</span></span>' +
                '<span class="opt-p">+' + FB.money(2.60) + '</span></button>';
            }).join(''),
          onMount: function (body, h) {
            FB.on(body, 'click', '[data-slot]', function (e, t) {
              FB.cart.setCo(p.slug, { scheduled: t.dataset.slot || null }); h.close(); FB.nav.refresh();
            });
          },
        });
      }

      function openPromo(pp) {
        FB.sheet.open({
          title: 'Promo code',
          html: '<div class="field"><input class="input" data-code placeholder="Enter code" autocapitalize="characters" value="' + FB.attr(FB.cart.co(pp.slug).promoCode || '') + '">' +
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
            FB.on(h.el, 'click', '[data-apply]', function (e, t) {
              var typed = input.value;
              msg.className = 'field-hint';
              msg.textContent = 'Checking the code against the conditions attached to it…';
              FB.busy(t, 'promo', function () {
                var r = FB.fees.checkPromo(typed, FB.cart.subtotal(pp.slug), FB.S().promo.used);
                if (!r) { h.close(); return; }
                if (!r.valid) { msg.className = 'field-err'; msg.textContent = r.error; return; }
                FB.cart.setCo(pp.slug, { promoCode: r.code }); h.close(); FB.nav.refresh();
                FB.toast('Promo ' + r.code + ' applied.', { icon: 'checkFill' });
              });
            });
          },
        });
      }
    },
  });

  /* One button, and it means it: dismissible:false now also blocks Escape, which
     until this landed only skipped wiring the scrim. */
  function openTerms(version, onAccept) {
    var v = FB.tos.entry(version);
    FB.modal.open({
      dismissible: false,
      html: '<h2>Terms of Service, version ' + FB.esc(v.label) + '</h2>' +
        '<p>These terms have been updated. Continued use constitutes acceptance. ' +
        'Discontinued use also constitutes acceptance.</p>' +
        '<div class="tosdiff">' + v.diff.map(function (d) {
          return '<div class="tosdiff-row">' + FB.icon('edit', 15) + '<span>' + FB.esc(d) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="modal-acts"><button class="btn btn--dark btn--block" data-accept>Accept</button></div>',
      onMount: function (b, h) {
        FB.on(b, 'click', '[data-accept]', function () {
          FB.tos.accept(version);
          FB.notifs.push({
            id: 'tos:' + version, kind: 'account', icon: 'shield',
            title: 'Terms accepted · version ' + v.label,
            body: v.diff[0] || 'The updated terms have been accepted.',
            go: 'account',
          });
          h.close();
          setTimeout(onAccept, 220);
        });
      },
    });
  }

  /* A TOAST, never a sheet: place() ends with FB.nav.go, whose overlay.closeAll(true)
     destroys anything opened in the same tick. */
  function announceStanding() {
    var st = FB.S();
    var seen = st.standing.seenTier || 0;
    if (st.standing.tier === seen) return;
    var up = st.standing.tier > seen;
    var t = FB.standing.tier(st.standing.tier);
    FB.store.set(function (s) { s.standing.seenTier = s.standing.tier; return s; }, { silent: true });
    if (!up) return;   /* a demotion is announced by the decay pass, not by an order */
    FB.toast('You have been advanced to ' + t.name + '. Advancement is recognised on your receipt and nowhere else.',
      { kind: 'plus', ms: 4200 });
    FB.notifs.push({ id: 'standing:' + t.name, kind: 'account', icon: 'trophy',
      title: 'Standing: ' + t.name, body: t.benefit, go: 'account' });
  }

  /* One order per tap, whatever the DOM does. The 3-second "cancellation window"
     means the button stays on screen while the order is in flight. */
  var placing = false;

  /* The three seconds place() already spends, said out loud. A single frozen
     "Placing…" is the one moment in the app where the longest wait says the least,
     and the stages are the platform narrating its own bureaucracy at you.
     [fraction of the window, what it claims to be doing] */
  var PLACE_MS = 3000;
  function fillStage(str, store) {
    return String(str).replace(/\{store\}/g, (store && (store.shortName || store.name)) || 'the restaurant');
  }
  var PLACE_STAGES = [
    [0.00, 'Authorizing…'],
    [0.30, 'Notifying {store}…'],
    [0.62, 'Entering the dispatch queue…'],
    [0.88, 'Cancellation window closing…'],
  ];
  var placingStage = PLACE_STAGES[0][1];
  var stageTimer = null;

  function stopStages() {
    if (stageTimer) { clearInterval(stageTimer); stageTimer = null; }
    placingStage = PLACE_STAGES[0][1];
  }

  function place(p, btn) {
    if (placing) return;
    /* Backstop. The [data-place] handler refuses first and with better copy; this is
       here so no future caller of place() can bypass the check by not knowing it
       exists. render() is not the last word either — none of the three repaint on a
       clock tick. */
    if (FB.cart.unsellable(p.slug).length) return;
    placing = true;
    var s = FB.catalog.get(p.slug);
    var lines = FB.cart.lines(p.slug).map(function (l) {
      return { name: l.name, qty: l.qty, unit: l.unit, itemId: l.itemId, sel: l.sel, note: l.note,
               opts: FB.cart.describe(p.slug, l) };
    });
    var c = calc(p);
    var co = FB.cart.co(p.slug);
    /* Read ONCE, with the price. calc() above priced the order on this answer, and
       cart.slot() is clock-sensitive now that a stale slot expires — re-deriving it
       three seconds later inside the cancellation window let the clock walk past the
       slot between the two reads, and the order was stamped with a schedule its own
       receipt had not been priced for, in either direction. */
    var scheduled = slotFor(p);
    var promo = promoFor(p, FB.cart.subtotal(p.slug));
    btn.disabled = true;
    placingStage = fillStage(PLACE_STAGES[0][1], s);
    btn.innerHTML = '<span>' + FB.esc(placingStage) + '</span>';
    /* ONE interval, re-querying the button every tick because paint() replaces the
       node — holding a reference here writes the stage into a node that is no longer
       in the document. */
    stopStages();
    var startedAt = Date.now();
    stageTimer = setInterval(function () {
      var t = FB.clamp((Date.now() - startedAt) / PLACE_MS, 0, 1);
      var next = PLACE_STAGES[0][1];
      for (var i = 0; i < PLACE_STAGES.length; i++) if (t >= PLACE_STAGES[i][0]) next = PLACE_STAGES[i][1];
      next = fillStage(next, s);
      if (next === placingStage) return;
      placingStage = next;
      var live = document.querySelector('[data-place]');
      if (live) live.innerHTML = '<span>' + FB.esc(next) + '</span>';
    }, Math.round(PLACE_MS / (PLACE_STAGES.length * 2)));

    /* Snapshotted with the price and the lines, NOT recomputed inside the window
       below. The app bar's Back button stays live for those three seconds, so a cart
       emptied during them wrote a nutrition ledger of zero against a receipt for
       three items — and derived from `lines` rather than the cart, so the receipt and
       the BODYMAX row can never describe different baskets. */
    var load = lines.reduce(function (acc, l) {
      var it = FB.catalog.item(p.slug, l.itemId);
      if (!it) return acc;
      var n = FB.catalog.itemLoad(it, l.sel, l.qty);
      acc.calories += n.calories; acc.sodium += n.sodium; acc.grease += n.grease; acc.ranch += n.ranch;
      return acc;
    }, { calories: 0, sodium: 0, grease: 0, ranch: 0 });

    /* the 3-second cancellation window the fine print promises, during which the button is disabled */
    setTimeout(function () {
      /* FIRST, before anything can throw: a test that fires this callback
         synchronously would otherwise leave an interval ticking in a realm that is
         about to be disposed, and the suite would simply never exit. */
      stopStages();
      var id = FB.uid('o');
      /* Drawn from the roster, so the same nine people recur and their tenure with
         you counts up. The SNAPSHOT is still written to the order — historical
         orders must keep rendering exactly as they were delivered, even after the
         person's rating with you moves. */
      var person = FB.slingers.assign(id, Date.now());
      /* tenure is DAYS EMPLOYED, which is what the Slinger card's label says. The
         count of deliveries they have made for you is timesWithYou, and it is
         rendered by FB.slingers.tenureLine() above the chat. */
      var g = { name: person.name, rating: person.rating, deliveries: person.deliveries,
                vehicle: person.vehicle, photo: person.photo, tenure: person.tenure,
                timesWithYou: person.timesWithYou };
      var order = {
        id: id, slug: s.slug, storeName: s.name, logo: s.logoSrc,
        placedAt: Date.now(), mode: co.mode, express: co.express, scheduled: scheduled,
        address: FB.deep(FB.store.address()), payment: FB.deep(FB.store.payment()),
        lines: lines, calc: { subtotal: c.subtotal, feesTotal: c.feesTotal, tax: c.taxLine.amount,
          tip: c.tipLine.amount, total: c.total, nonFood: c.nonFood, multiple: c.multiple,
          feeLines: c.feeLines.map(function (l) { return { label: l.label, amount: l.amount, id: l.id, free: l.free }; }),
          roundUp: c.roundLine ? c.roundLine.amount : 0, promo: c.promoAmount,
          /* the rows, not just the scalar: store promotions now apply automatically,
             so an order receipt without them prints lines that sum above its own total */
          discounts: c.discounts.map(function (d) { return { label: d.label, amount: d.amount }; }) },
        status: 'placed', slinger: g, personId: person.id,
        etaMin: s.deliveryMax + (co.express ? -1 : 0), etaDrift: 0,
        events: [], rated: null, load: load, step: 0,
      };
      /* The tracker gives it an absolute timetable — every beat at a real moment,
         and a deliverAt. A scheduled order's clock starts at its slot, not now. */
      FB.tracker.build(order);

      FB.store.set(function (st) {
        st.orders.unshift(order);
        st.activeOrderId = order.id;
        delete st.cart[s.slug];
        st.meta.orderCount++;
        st.meta.lifetimeSpend = FB.round2(st.meta.lifetimeSpend + c.total);
        st.meta.lifetimeFees = FB.round2(st.meta.lifetimeFees + c.feesTotal + c.taxLine.amount + (c.roundLine ? c.roundLine.amount : 0));
        st.meta.lifetimeTips = FB.round2(st.meta.lifetimeTips + c.tipLine.amount);
        st.meta.lifetimeCalories += load.calories;
        if (promo && promo.valid) st.promo.used.push(promo.code);
        /* Standing is earned here and decayed at boot — never in a render path,
           which would re-persist state on every paint. */
        st.standing.points = Math.min(FB.standing.MAX_POINTS, st.standing.points + FB.standing.earn(c.total));
        st.standing.tier = FB.standing.tierFor(st.standing.points);
        st.standing.lastOrderAt = order.placedAt;
        st.standing.decayedThrough = order.placedAt;
        /* the member ledger: gross saved, dues-adjacent fees paid. NET is what the
           BANG+ panel shows growing fastest, and it grows in red. */
        if (st.plus.active) {
          st.plus.saved = FB.round2((st.plus.saved || 0) + c.plusSaved);
          st.plus.paid = FB.round2((st.plus.paid || 0) + c.plusPaid);
        }
        return st;
      });
      /* spend before granting, so a dollar redeemed on this order cannot be the
         dollar this order earns */
      if (c.scripUsed > 0) FB.scrip.spend(c.scripUsed);
      if (c.scripEarned > 0) {
        FB.scrip.grant(c.scripEarned, order.placedAt);
        FB.toast(FB.money(c.scripEarned) + ' in BangBux™ issued. BangBux™ expire seventy-two hours after issue ' +
          'and cannot be reissued within that window.', { icon: 'gift', ms: 4200 });
      }
      announceStanding();
      FB.bodymax.ingest(order);
      /* the cart bucket carried the promo, tip, mode and schedule, and deleting the
         cart above is what clears them — no screen-level state is left to reset */
      placing = false;
      stopStages();
      FB.tracker.start(order.id);
      /* One real added wait, AFTER the commit. The order, the cart deletion and all
         three ledgers are already written — this delays only the navigation, so a
         reload during it finds a finished order rather than half of one. Scaled by
         surge, because how long it takes to find somebody to carry your food is the
         one thing that genuinely depends on how many other people are ordering.
         Routed through FB.latency, so Instant Interface buys it off like everything
         else — and paying to skip the queue is the joke working as designed. */
      var hold = FB.latency.ms('dispatch');
      if (hold) hold = Math.round(hold * (0.7 + ((FB.world && FB.world.at(Date.now()).surge) || 0) * 0.7));
      if (hold > 0) setTimeout(function () { FB.nav.go('track', { id: order.id }); }, hold);
      else FB.nav.go('track', { id: order.id });
    }, PLACE_MS);
  }
})(window.FB);
