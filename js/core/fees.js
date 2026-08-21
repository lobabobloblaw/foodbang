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
    delivery: 'The Delivery Fee covers delivery. It does not cover the Slinger, who is covered by the Tip, which is optional in the same way that breathing is optional.',
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
    data: 'Your behavioural data was subsidising your food. You have withdrawn the subsidy.',
    pickupA: 'You are retrieving the order yourself. Facilitating your retrieval is a service.',
    pickupB: 'A vehicle was deployed and then stood down. Deployment is billed at deployment.',
    schedule: 'Scheduling requires the future, which must be reserved.',
    express: 'Express Bang places your order ahead of other orders, which are then placed ahead of yours.',
    plusbenefit: 'Realising a BANG+ benefit requires a benefit realisation process.',
    other: 'Other.',
    rounding: 'Totals are rounded up to the nearest $5.00 for your convenience. The convenience is ours to define.',
    taxes: 'Taxes are collected on the subtotal and on the fees, including the fee for displaying the fees.',
    tip: '100% of your tip goes to your Slinger, less the Tip Processing Fee, which is included in the Service Fee, which is not part of the tip.',
  };
  FB.FEE_WHY = WHY;

  function line(id, label, amount, note, kind) {
    return { id: id, label: label, amount: FB.round2(amount), note: note || null, kind: kind || 'fee' };
  }

  /**
   * ctx = { subtotal, lineCount, itemCount, store, mode, tipPct, tipCustom,
   *         express, scheduled, promo, plus, settings, distanceMi }
   */
  FB.fees = {
    TAX_RATE: TAX_RATE, PEAK_MULT: PEAK_MULT,

    compute: function (ctx) {
      var s = ctx.settings || FB.S().settings;
      var sub = FB.round2(ctx.subtotal || 0);
      var mode = ctx.mode || 'delivery';
      var plus = !!ctx.plus;
      var dist = ctx.distanceMi || (ctx.store && ctx.store.distanceMi) || 2.4;
      var lines = [];
      var discounts = [];

      /* ---------- discounts (applied to subtotal) ---------- */
      var promoAmt = 0;
      if (ctx.promo && ctx.promo.valid) {
        promoAmt = ctx.promo.kind === 'pct' ? sub * ctx.promo.value : Math.min(ctx.promo.value, sub);
        discounts.push(line('promo', 'Promotion · ' + ctx.promo.code, -promoAmt, ctx.promo.blurb, 'discount'));
      }

      /* ---------- delivery ---------- */
      if (mode === 'delivery') {
        var base = FB.round2(4.99 + Math.max(0, dist - 1.5) * 0.62);
        if (plus) {
          if (sub >= 312) {
            lines.push({ id: 'delivery', label: 'Delivery Fee', amount: 0, was: base, kind: 'fee', free: true,
              note: 'BANG+ waives this on orders over $312.00.' });
          } else {
            lines.push(line('delivery', 'Delivery Fee (BANG+ Reduced)', base * 0.7,
              'Full waiver applies at $312.00. You are ' + FB.money(312 - sub) + ' away.'));
          }
          lines.push(line('plusbenefit', 'BANG+ Benefit Realization Fee', 1.99, null));
        } else {
          lines.push(line('delivery', 'Delivery Fee', base, null));
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
      if (!s.dataSharing) lines.push(line('data', 'Data Sovereignty Fee', 4.10, 'You have withdrawn the subsidy.'));
      if (ctx.scheduled) lines.push(line('schedule', 'Temporal Coordination Fee', 2.60, null));
      if (ctx.express) lines.push(line('express', 'Express Bang™', 5.99, 'Reduces estimated arrival by up to 1 minute.'));

      /* ---------- peak multiplier on the whole stack ---------- */
      var stack = FB.sum(lines, function (l) { return l.amount; });
      var peak = FB.round2(stack * (PEAK_MULT - 1));
      lines.push(line('peak', 'Peak Demand Multiplier ×' + PEAK_MULT.toFixed(1), peak, 'Applied to all fees above.'));

      var feesTotal = FB.round2(stack + peak);

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

    /* working promo codes. every one of them is a trap. */
    PROMOS: {
      BANG10:    { kind: 'flat', value: 10, blurb: 'Applies to the subtotal, not the total.' },
      FREEDELIV: { kind: 'flat', value: 4.99, blurb: 'Equal to the Delivery Fee, which is still charged.' },
      HALFOFF:   { kind: 'pct',  value: 0.5, min: 180, blurb: 'Valid on subtotals over $180.00.' },
      WELCOME:   { kind: 'flat', value: 3, blurb: 'New customers. You are not new.' },
      ELECTROLYTES: { kind: 'flat', value: 7.5, blurb: 'It has what plants crave.' },
      IDIOCRACY: { kind: 'pct', value: 0.15, blurb: 'Thank you for your patronage, valued customer.' },
    },

    checkPromo: function (code, sub) {
      code = String(code || '').trim().toUpperCase();
      if (!code) return null;
      var p = FB.fees.PROMOS[code];
      if (!p) return { code: code, valid: false, error: 'Code not recognised. It may have expired, or may never have existed.' };
      if (p.min && sub < p.min) return { code: code, valid: false, error: 'Requires a subtotal of ' + FB.money(p.min) + '. You are ' + FB.money(p.min - sub) + ' short.' };
      return { code: code, valid: true, kind: p.kind, value: p.value, blurb: p.blurb };
    },
  };
})(window.FB);
