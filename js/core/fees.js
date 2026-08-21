/* FoodBang — the fee engine.
   Everything here is invented. The mechanism being parodied is real: a low
   advertised price, then a stack of separately-named charges, a multiplier
   applied to the stack, tax applied to the multiplied stack, and a default
   tip computed before you have read any of it. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var TAX_RATE = 0.0975;
  var SERVICE_PCT = 0.185;
  var SERVICE_MIN = 3.99;
  var PEAK_MULT = 1.40;

  /* Every fee's public justification. Tapping the (?) shows these verbatim. */
  var WHY = {
    delivery: 'The Delivery Fee begins at the amount advertised for this restaurant and increases with distance, which is not advertised. It covers delivery. It does not cover the Slinger, who is covered by the Tip, which is optional in the same way that breathing is optional.',
    range: 'Your residence is farther from the restaurant than the restaurant is from itself. This differential is billed to you.',
    service: 'The Service Fee funds the service of assessing fees. It scales with your order because larger orders require more assessment.',
    small: 'Small orders are inefficient. The Small Order Fee restores efficiency by making the order larger.',
    large: 'Large orders introduce logistics strain. The Large Order Fee relieves the strain by adding to it.',
    regulatory: 'A regulation was passed. We have responded. This is the response.',
    digitization: 'Each menu item was, at some point, typed. Typing is billed per item, in perpetuity.',
    bag: 'The bag.',
    handle: 'The handles are structurally separate from the bag and are licensed separately.',
    thermal: 'Food is held at a temperature. Temperature is a service and is billed as one. Ambient food is also held at a temperature.',
    labor: 'Your Slinger will experience your order emotionally. This fee compensates FoodBang™ for that experience.',
    peak: 'Peak demand is currently in effect. Peak demand has been currently in effect since March 2019.',
    offpeak: 'Applied when demand is not peaking. Applied concurrently with Peak Demand, as demand may stop peaking at any time.',
    fx: 'Your payment is denominated in United States Dollars. Your order is denominated in United States Dollars. Conversion between the two is not free.',
    transparency: 'This is the fee for displaying the fees. It is displayed.',
    opacity: 'You have elected not to see the fees. Concealment requires active maintenance and is priced accordingly.',
    upsell: 'Suppressing recommendations removes a revenue stream. The stream is restored here.',
    restraint: 'A reduced Hunger Level reduces recommended volume. The shortfall is billed.',
    standing: 'Maintaining a Standing requires maintenance. The fee is assessed at the tier you hold, not the tier you use.',
    reconciliation: 'Where the order-time and delivery-time assessments are equal, reconciliation is still performed, and is billed.',
    scrip: 'BangBux™ are a benefit. Benefits are denominated in BangBux™. BangBux™ are redeemable against fees, which are denominated in dollars, at a rate we publish here.',
    accel: 'Requests take the time they take. Acceleration is applied to the display of the request, which is the part you are present for.',
    data: 'Your behavioral data was subsidizing your food. You have withdrawn the subsidy.',
    pickupA: 'You are retrieving the order yourself. Facilitating your retrieval is a service.',
    pickupB: 'A vehicle was deployed and then stood down. Deployment is billed at deployment.',
    schedule: 'Scheduling requires the future, which must be reserved.',
    express: 'Express Bang places your order ahead of other orders, which are then placed ahead of yours.',
    plusbenefit: 'Realizing a BANG+ benefit requires a benefit realization process.',
    other: 'Other.',
    rounding: 'Totals are rounded up to the nearest $5.00 for your convenience. The convenience is ours to define.',
    taxes: 'Taxes are collected on the subtotal and on the fees, including the fee for displaying the fees.',
    tip: '100% of your tip goes to your Slinger, less the Tip Processing Fee, which is included in the Service Fee, which is not part of the tip.',
  };
  FB.FEE_WHY = WHY;

  /* The upkeep table lives HERE, not in js/sim/standing.js, for the same reason
     fees.js must never reach for FB.world: tools/smoke.cjs requires this file with
     only util.js loaded, so a lookup into another module would throw at require
     time and take the one thing under direct test with it. standing.js reads it
     back off FB.fees, so there is still one table. */
  var STANDING_UPKEEP = [0, 0.60, 1.25, 2.10, 3.40];

  /* BangBux™: 2% of the fee stack back, in whole BangBux™, one per order. Rounded
     rather than floored — at 2% of a typical stack, flooring would mean the balance
     never moved and the whole benefit would be invisible. */
  var SCRIP_RATE = 0.02;
  var SCRIP_MAX_PER_ORDER = 1;
  var SCRIP_TTL_MS = 72 * 3600 * 1000;
  function upkeep(tier) {
    var i = Math.max(0, Math.min(STANDING_UPKEEP.length - 1, Math.round(tier) || 0));
    return STANDING_UPKEEP[i];
  }

  function line(id, label, amount, note, kind) {
    return { id: id, label: label, amount: FB.round2(amount), note: note || null, kind: kind || 'fee' };
  }

  /**
   * ctx = { subtotal, lineCount, itemCount, store, mode, tipPct, tipCustom,
   *         express, scheduled, promo, plus, settings, distanceMi }
   */
  FB.fees = {
    STANDING_UPKEEP: STANDING_UPKEEP,
    SCRIP_RATE: SCRIP_RATE, SCRIP_MAX_PER_ORDER: SCRIP_MAX_PER_ORDER, SCRIP_TTL_MS: SCRIP_TTL_MS,
    TAX_RATE: TAX_RATE, PEAK_MULT: PEAK_MULT,

    compute: function (ctx) {
      var s = ctx.settings || FB.S().settings;
      var sub = FB.round2(ctx.subtotal || 0);
      var mode = ctx.mode || 'delivery';
      var plus = !!ctx.plus;
      var dist = ctx.distanceMi || (ctx.store && ctx.store.distanceMi) || 2.4;
      var lines = [];
      var discounts = [];
      /* what membership actually did on THIS order, so the panel can keep books */
      var plusSaved = 0, plusPaid = 0;

      /* ---------- discounts (applied to subtotal) ---------- */
      var promoAmt = 0;
      if (ctx.promo && ctx.promo.valid) {
        promoAmt = ctx.promo.kind === 'pct' ? sub * ctx.promo.value : Math.min(ctx.promo.value, sub);
        discounts.push(line('promo', 'Promotion · ' + ctx.promo.code, -promoAmt, ctx.promo.blurb, 'discount'));
      }

      /* ---------- delivery ---------- */
      if (mode === 'delivery') {
        /* The fee the store advertises in the feed is the FLOOR, not the price —
           distance is added on top of it. Before this the engine invented its own
           base, so the number on the store card and the number on the receipt were
           unrelated. 4.99 is the fallback for a context with no store (the fee tests
           run headless and pass none), which keeps the $12 → $60.00 case exact. */
        var advertised = (ctx.store && typeof ctx.store.deliveryFee === 'number') ? ctx.store.deliveryFee : 4.99;
        var surcharge = FB.round2(Math.max(0, dist - 1.5) * 0.62);
        var base = FB.round2(advertised + surcharge);
        var advNote = surcharge > 0
          ? 'Advertised at ' + FB.money(advertised) + '. Distance is additional and is not advertised.'
          : null;
        if (plus) {
          if (sub >= 312) {
            lines.push({ id: 'delivery', label: 'Delivery Fee', amount: 0, was: base, kind: 'fee', free: true,
              note: 'BANG+ waives this on orders over $312.00.' });
            plusSaved = FB.round2(base);
          } else {
            lines.push(line('delivery', 'Delivery Fee (BANG+ Reduced)', base * 0.7,
              'A 30% reduction on ' + FB.money(base) + '. Full waiver applies at $312.00. You are ' + FB.money(312 - sub) + ' away.'));
            plusSaved = FB.round2(base * 0.3);
          }
          lines.push(line('plusbenefit', 'BANG+ Benefit Realization Fee', 1.99, null));
          plusPaid = 1.99;
        } else {
          lines.push(line('delivery', 'Delivery Fee', base, advNote));
        }
        if (dist > 3.4) lines.push(line('range', 'Expanded Range Fee', 2.99, FB.round2(dist) + ' mi from the restaurant.'));
      } else {
        lines.push(line('pickupA', 'Retrieval Facilitation Fee', 3.75, null));
        lines.push(line('pickupB', 'Vehicle Deployment Fee', 2.20, 'A vehicle was deployed and then stood down.'));
      }

      /* ---------- the stack ---------- */
      lines.push(line('service', 'Service Fee', Math.max(SERVICE_MIN, sub * SERVICE_PCT), '18.5% of subtotal, minimum ' + FB.money(SERVICE_MIN) + '.'));
      if (sub < 25) lines.push(line('small', 'Small Order Fee', 4.50, 'Orders under $25.00.'));
      if (sub > 60) lines.push(line('large', 'Large Order Fee', 6.75, 'Orders over $60.00.'));
      lines.push(line('regulatory', 'Regulatory Response Fee', 2.10, null));
      /* Holding a Standing costs money whether or not you use it. Gated on a ctx
         field the headless $12 -> $60.00 context does not pass, so that case is
         untouched — every new fee in this engine has to be. */
      if (ctx.standingTier) {
        lines.push(line('standing', 'Standing Maintenance Fee', upkeep(ctx.standingTier),
          'Assessed at the tier you hold.'));
      }
      if (ctx.lineCount) lines.push(line('digitization', 'Menu Digitization Surcharge', 0.39 * ctx.lineCount, FB.plural(ctx.lineCount, 'line item') + ' × $0.39.'));
      if (mode === 'delivery') {
        lines.push(line('bag', 'Bag Fee', 0.35, null));
        lines.push(line('handle', 'Bag Handle Fee', 0.60, 'Licensed separately from the bag.'));
        lines.push(line('thermal', 'Temperature Maintenance Fee', 1.60, null));
        lines.push(line('labor', 'Courier Emotional Labor Fee', 2.25, null));
      }
      lines.push(line('offpeak', 'Off-Peak Underutilization Fee', 1.75, 'Applied concurrently with Peak Demand.'));
      lines.push(line('fx', 'Currency Conversion (USD → USD)', sub * 0.025, '2.5%'));

      if (s.feeTransparency) lines.push(line('transparency', 'Fee Transparency Fee', 0.85, 'The fee for displaying the fees.'));
      else lines.push(line('opacity', 'Fee Opacity Fee', 2.85, 'Concealment requires active maintenance.'));
      if (s.reduceUpsells) lines.push(line('upsell', 'Upsell Suppression Fee', 3.25, null));
      /* both ends of the Hunger Level cost you. undefined <= 2 is false, so a
         context that passes no hungerLevel — the headless $12 → $60.00 case — is
         untouched by this branch. */
      if (s.hungerLevel <= 2) lines.push(line('restraint', 'Restraint Accommodation Fee', 2.40, 'A reduced Hunger Level reduces recommended volume.'));
      if (s.instantInterface) lines.push(line('accel', 'Interface Acceleration Fee', 1.95, 'Waiting is removed from the interface, not from the process.'));
      if (!s.dataSharing) lines.push(line('data', 'Data Sovereignty Fee', 4.10, 'You have withdrawn the subsidy.'));
      /* §14, added in Terms 9.4.3 and billed from the moment you accept it — the
         only fee in this engine you agreed to in writing. */
      if (ctx.tosVersion >= 3) lines.push(line('reconciliation', 'Reconciliation Fee', 1.20, null));
      if (ctx.scheduled) lines.push(line('schedule', 'Temporal Coordination Fee', 2.60, null));
      if (ctx.express) lines.push(line('express', 'Express Bang™', 5.99, 'Reduces estimated arrival by up to 1 minute.'));

      /* ---------- peak multiplier on the whole stack ---------- */
      var stack = FB.sum(lines, function (l) { return l.amount; });
      var peak = FB.round2(stack * (PEAK_MULT - 1));
      lines.push(line('peak', 'Peak Demand Multiplier ×' + PEAK_MULT.toFixed(1), peak, 'Applied to all fees above.'));

      /* Redemption is a negative FEE, not a discount. `discounts` below is
         DISPLAY-ONLY — the arithmetic runs on the promoAmt scalar and discounts is
         only iterated by the receipt renderer — so a line pushed there would render
         a row that changes no number at all. And it lands AFTER the multiplier, so
         redeeming a dollar does not also shrink the ×1.4 that dollar was multiplied
         into. In whole BangBux™, capped per order, never below zero. */
      var scripUsed = 0;
      if (ctx.scrip > 0) {
        scripUsed = Math.min(SCRIP_MAX_PER_ORDER, Math.floor(ctx.scrip));
        if (scripUsed > 0) {
          lines.push(line('scrip', 'BangBux™ Redemption', -scripUsed,
            'Redeemable against fees. ' + FB.money(SCRIP_MAX_PER_ORDER) + ' maximum per order.'));
        }
      }

      var feesTotal = FB.round2(stack + peak - scripUsed);

      /* ---------- taxes ---------- */
      var taxable = FB.round2(sub - promoAmt + feesTotal);
      var tax = FB.round2(taxable * TAX_RATE);
      var otherFees = 1.15;
      var taxLine = line('taxes', 'Taxes & Other Fees', tax + otherFees, 'Includes ' + FB.money(otherFees) + ' in Other Fees.', 'tax');

      /* ---------- tip (on the subtotal, before you have read any of this) ---------- */
      var tipPct = ctx.tipCustom != null ? null : (ctx.tipPct != null ? ctx.tipPct : s.autoTipPct);
      var tip = ctx.tipCustom != null ? FB.round2(ctx.tipCustom) : FB.round2(sub * (tipPct / 100));
      var tipLine = line('tip', 'Slinger Tip' + (tipPct != null ? ' (' + tipPct + '%)' : ' (custom)'), tip, null, 'tip');

      /* ---------- total + Convenience Rounding™ ---------- */
      var pre = FB.round2(sub - promoAmt + feesTotal + taxLine.amount + tip);
      var rounded = Math.ceil(pre / 5) * 5;
      var roundUp = FB.round2(rounded - pre);
      var roundLine = roundUp > 0.004 ? line('rounding', 'Convenience Rounding™', roundUp, 'Rounded up to the nearest $5.00.', 'fee') : null;
      var total = FB.round2(pre + (roundLine ? roundLine.amount : 0));

      return {
        subtotal: sub,
        discounts: discounts,
        promoAmount: FB.round2(promoAmt),
        feeLines: lines,
        stack: FB.round2(stack),
        peak: peak,
        feesTotal: feesTotal,
        taxLine: taxLine,
        tipLine: tipLine,
        tipPct: tipPct,
        roundLine: roundLine,
        total: total,
        /* how many times the food cost you paid */
        multiple: sub > 0 ? total / sub : 0,
        nonFood: FB.round2(total - sub + promoAmt),
        /* the member ledger, and the scrip. plus.saved was written as 0 on join and
           never incremented while five places rendered it. */
        plusSaved: plusSaved,
        plusPaid: plusPaid,
        scripUsed: scripUsed,
        scripEarned: Math.min(SCRIP_MAX_PER_ORDER, Math.round(FB.round2(stack + peak) * SCRIP_RATE)),
      };
    },

    /* tip tiers, with the judgement made explicit */
    tipTiers: function (sub) {
      return [
        { pct: 0,  label: 'No Tip',  sub: 'Your Slinger will be informed.' },
        { pct: 18, label: '18%',     sub: 'Below the suggested floor.' },
        { pct: 25, label: '25%',     sub: 'Adequate.' },
        { pct: 42, label: '42%',     sub: 'Standard.', dflt: true },
        { pct: 60, label: '60%',     sub: 'Correct.' },
      ].map(function (t) { t.amount = FB.round2(sub * t.pct / 100); return t; });
    },

    /* Working promo codes. Every one of them is a trap, and every one of them works
       exactly once — `spent` is what the code says the second time. WELCOME's blurb
       has always asserted "you are not new"; now the app can prove it. */
    PROMOS: {
      BANG10:    { kind: 'flat', value: 10, blurb: 'Applies to the subtotal, not the total.',
                   spent: 'BANG10 has been redeemed on this account. Codes are single-use. The code remains valid; your relationship to it does not.' },
      FREEDELIV: { kind: 'flat', value: 4.99, blurb: 'Equal to the Delivery Fee, which is still charged.',
                   spent: 'Redeemed. The Delivery Fee it was equal to is still charged.' },
      HALFOFF:   { kind: 'pct',  value: 0.5, min: 180, blurb: 'Valid on subtotals over $180.00.',
                   spent: 'Redeemed at a subtotal you have not reached since.' },
      WELCOME:   { kind: 'flat', value: 3, blurb: 'New customers. You are not new.',
                   spent: 'This code is for new customers. You used it, which is what stopped you being new.' },
      ELECTROLYTES: { kind: 'flat', value: 7.5, blurb: 'It has what plants crave.',
                   spent: 'Redeemed. What plants crave has been supplied and will not be supplied again.' },
      IDIOCRACY: { kind: 'pct', value: 0.15, blurb: 'Thank you for your patronage, valued customer.',
                   spent: 'Thank you for your patronage, valued customer. Your patronage has been recorded as complete.' },
    },

    /* `used` is st.promo.used, which has been written on every order since the app
       shipped and read by nothing. The function stays pure — the caller passes it.
       The spent branch sits AFTER "not recognized" and BEFORE the minimum, so a
       burned HALFOFF says redeemed rather than "you are $155 short". */
    checkPromo: function (code, sub, used) {
      code = String(code || '').trim().toUpperCase();
      if (!code) return null;
      var p = FB.fees.PROMOS[code];
      if (!p) return { code: code, valid: false, error: 'Code not recognized. It may have expired, or may never have existed.' };
      if (used && used.indexOf(code) > -1) return { code: code, valid: false, spent: true, error: p.spent };
      if (p.min && sub < p.min) return { code: code, valid: false, error: 'Requires a subtotal of ' + FB.money(p.min) + '. You are ' + FB.money(p.min - sub) + ' short.' };
      return { code: code, valid: true, kind: p.kind, value: p.value, blurb: p.blurb };
    },
  };
})(window.FB);
