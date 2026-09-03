/* FoodBang — shared render components */
window.FB = window.FB || {};
(function (FB) {
  'use strict';
  var C = FB.C = {};

  C.dollars = function (tier) { return '$'.repeat(Math.max(1, tier || 1)); };

  C.storeBadges = function (s) {
    var out = [];
    if (s.bangPlus) out.push('<span class="badge badge--plus">' + FB.icon('zap', 11) + 'BANG+</span>');
    if (s.local) out.push('<span class="badge badge--glass">LOCAL</span>');
    /* a shut kitchen is not a busy one, and "closing in 18 min" is the only badge
       here that is worth interrupting someone mid-scroll for */
    var closing = FB.catalog.closesIn(s);
    if (closing !== null && closing <= 30) out.push('<span class="badge badge--warn">Closing in ' + closing + ' min</span>');
    else if (FB.catalog.isOpen(s) && FB.world.isBusy(s.slug)) out.push('<span class="badge badge--warn">Busy</span>');
    return out.join('');
  };

  C.opensLabel = function (s) {
    return FB.catalog.opensIn(s) === null ? '' : 'opens ' + FB.esc(s.opensAt || '');
  };

  C.storeMeta = function (s) {
    return '<span class="stars">' + FB.icon('starFill', 13) + s.rating.toFixed(1) + '</span>' +
      '<span style="color:var(--ink-3)">(' + FB.compact(s.ratingCount) + ')</span>' +
      '<i class="dot-sep"></i><span>' + C.dollars(s.priceTier) + '</span>' +
      '<i class="dot-sep"></i><span>' + FB.esc(s.cuisine) + '</span>' +
      '<i class="dot-sep"></i><span>' + s.distanceMi.toFixed(1) + ' mi</span>';
  };

  C.storeCard = function (s) {
    var fee = s.deliveryFee === 0 ? '$0 delivery fee' : FB.moneyShort(s.deliveryFee) + ' delivery fee';
    var shut = !FB.catalog.isOpen(s);
    return '<button class="storecard pressable' + (shut ? ' is-shut' : '') + '" data-go="store" data-params=\'{"slug":"' + s.slug + '"}\'>' +
      '<div class="sc-media">' +
        '<img src="' + s.heroSrc + '" alt="" loading="lazy" onerror="this.style.opacity=0">' +
        '<span class="sc-tags">' + C.storeBadges(s) + '</span>' +
        '<img class="sc-logo" src="' + s.logoSrc + '" alt="" loading="lazy">' +
        (shut ? '<span class="sc-shut">Closed · ' + C.opensLabel(s) + '</span>'
              : '<span class="sc-eta">' + FB.mins(s.deliveryMin, s.deliveryMax) + '</span>') +
      '</div>' +
      '<div class="sc-body">' +
        /* h2: a card list sits directly under the screen's h1 on Category and
            Saved stores, and h3 there is a skipped level */
        '<div class="sc-title"><h2>' + FB.esc(s.name) + '</h2></div>' +
        '<div class="sc-meta sc-meta--1">' +
          '<span class="stars">' + FB.icon('starFill', 13) + s.rating.toFixed(1) + '</span>' +
          '<span style="color:var(--ink-3)">(' + FB.compact(s.ratingCount) + ')</span>' +
          '<i class="dot-sep"></i><span>' + C.dollars(s.priceTier) + '</span>' +
          '<i class="dot-sep"></i><span class="trunc1">' + FB.esc(s.cuisine) + '</span>' +
          '<i class="dot-sep"></i><span style="flex:none">' + s.distanceMi.toFixed(1) + ' mi</span>' +
        '</div>' +
        '<div class="sc-meta"><span style="color:' + (s.deliveryFee === 0 ? 'var(--good)' : 'var(--ink-2)') + '">' + fee + '</span>' +
          (s.local ? '<i class="dot-sep"></i><span>Independent</span>' : '') + '</div>' +
        (s.promos && s.promos.length ? '<div class="sc-promo">' + FB.icon('tag', 13) + '<span class="trunc1">' + FB.esc(s.promos[0].text) + '</span></div>' : '') +
      '</div></button>';
  };

  C.storeRow = function (s) {
    return '<button class="row" data-go="store" data-params=\'{"slug":"' + s.slug + '"}\'>' +
      '<img class="row-img" src="' + s.logoSrc + '" alt="" loading="lazy">' +
      '<span class="row-b"><b>' + FB.esc(s.name) + '</b>' +
        '<span>' + s.rating.toFixed(1) + ' ★ · ' + FB.esc(s.cuisine) + ' · ' + FB.mins(s.deliveryMin, s.deliveryMax) + '</span></span>' +
      '<span class="row-r">' + FB.icon('fwd', 16) + '</span></button>';
  };

  /* merchandising tile for a single photographed dish */
  C.dishTile = function (rec) {
    var it = rec.item, s = rec.store;
    /* Home's rail and Search render items too. An item struck through on the store
       page but purchasable from Home reads as a bug, not as scarcity. */
    var out = !FB.catalog.available(it);
    return '<button class="dishtile pressable' + (out ? ' is-out' : '') + '" data-item="' + it.id + '" data-slug="' + s.slug + '">' +
      '<img src="' + it.photoSrc + '" alt="" loading="lazy">' +
      '<b class="trunc1">' + FB.esc(it.name) + '</b>' +
      '<span class="trunc1">' + FB.esc(s.shortName || s.name) + '</span>' +
      '<span class="dt-p">' + (out ? 'Unavailable' : FB.money(it.price)) + '</span></button>';
  };

  C.menuItem = function (it, store) {
    var badge = (it.badges || [])[0];
    var out = !FB.catalog.available(it);
    return '<button class="mitem' + (out ? ' is-out' : '') + '" data-item="' + it.id + '" data-slug="' + store.slug + '">' +
      '<span class="mi-b">' +
        (out ? '<span class="badge badge--warn" style="margin-bottom:5px">Unavailable today</span>'
             : badge ? '<span class="badge badge--promo" style="margin-bottom:5px">' + FB.esc(badge) + '</span>' : '') +
        '<b>' + FB.esc(it.name) + '</b>' +
        '<span class="mi-d trunc2">' + FB.esc(out ? it.scarce : it.desc) + '</span>' +
        '<span class="mi-p">' + FB.money(it.price) +
          '<i class="mi-cal">' + FB.int(it.calories) + ' Cal</i></span>' +
      '</span>' +
      (it.photoSrc
        ? '<span class="mi-img"><img src="' + it.photoSrc + '" alt="" loading="lazy"><i class="mi-add">' + FB.icon('plus', 15) + '</i></span>'
        : '<span class="mi-img mi-img--none"><i class="mi-add">' + FB.icon('plus', 15) + '</i></span>') +
      '</button>';
  };

  C.sectionHead = function (title, sub, more) {
    return '<div class="sec-head"><h2>' + FB.esc(title) + '</h2>' +
      (more ? '<span class="sh-more">' + FB.esc(more) + FB.icon('fwd', 13) + '</span>' : '') + '</div>' +
      (sub ? '<div class="sec-sub">' + FB.esc(sub) + '</div>' : '');
  };

  C.empty = function (cfg) {
    return '<div class="empty">' +
      '<img src="' + (cfg.img || 'assets/app/empty-state.webp') + '" alt="" onerror="this.remove()">' +
      '<h2>' + FB.esc(cfg.title) + '</h2><p>' + FB.esc(cfg.body) + '</p>' +
      /* params too: an empty state that sends you to a screen needing a slug used to
         emit a bare data-go and land there with nothing. FB.esc escapes both quote
         characters, so the JSON is safe inside a double-quoted attribute. */
      (cfg.cta ? '<button class="btn btn--primary" data-go="' + cfg.go + '"' +
        (cfg.params ? ' data-params="' + FB.esc(JSON.stringify(cfg.params)) + '"' : '') +
        '>' + FB.esc(cfg.cta) + '</button>' : '') +
      '</div>';
  };

  /* ---------- receipt ---------- */
  C.receipt = function (calc, opts) {
    opts = opts || {};
    var h = '<div class="receipt">';
    h += '<div class="rl"><span class="rl-l">Subtotal</span><span class="rl-r">' + FB.money(calc.subtotal) + '</span></div>';
    calc.discounts.forEach(function (d) {
      h += '<div class="rl rl--free"><span class="rl-l">' + FB.esc(d.label) + '</span><span class="rl-r">' + FB.money(d.amount) + '</span></div>';
      if (d.note) h += '<div class="rl-note">' + FB.esc(d.note) + '</div>';
    });

    if (opts.collapsed) {
      h += '<button class="rl" data-expand-fees style="width:100%;text-align:left">' +
        '<span class="rl-l">Fees &amp; Estimated Tax ' + FB.icon('down', 14) + '</span>' +
        '<span class="rl-r">' + FB.money(calc.feesTotal + calc.taxLine.amount) + '</span></button>';
    } else {
      calc.feeLines.forEach(function (l) {
        h += '<div class="rl' + (l.free ? ' rl--free' : '') + '">' +
          '<span class="rl-l">' + FB.esc(l.label) +
            (FB.FEE_WHY[l.id] ? '<button class="why" data-why="' + l.id + '" data-whylabel="' + FB.attr(l.label) + '" aria-label="Why this fee?">?</button>' : '') +
          '</span>' +
          '<span class="rl-r">' + (l.free ? 'Free' : FB.money(l.amount)) +
            (l.was ? ' <s style="color:var(--ink-3);font-weight:400">' + FB.money(l.was) + '</s>' : '') + '</span></div>';
        if (l.note) h += '<div class="rl-note">' + FB.esc(l.note) + '</div>';
      });
      h += '<div class="rl"><span class="rl-l">' + FB.esc(calc.taxLine.label) +
        '<button class="why" data-why="taxes" data-whylabel="Taxes &amp; Other Fees" aria-label="Why this fee?">?</button></span>' +
        '<span class="rl-r">' + FB.money(calc.taxLine.amount) + '</span></div>';
      if (calc.taxLine.note) h += '<div class="rl-note">' + FB.esc(calc.taxLine.note) + '</div>';
    }

    h += '<div class="rl"><span class="rl-l">' + FB.esc(calc.tipLine.label) +
      '<button class="why" data-why="tip" data-whylabel="Slinger Tip" aria-label="Why this fee?">?</button></span>' +
      '<span class="rl-r">' + FB.money(calc.tipLine.amount) + '</span></div>';
    if (calc.roundLine) {
      h += '<div class="rl"><span class="rl-l">' + FB.esc(calc.roundLine.label) +
        '<button class="why" data-why="rounding" data-whylabel="Convenience Rounding" aria-label="Why this fee?">?</button></span>' +
        '<span class="rl-r">' + FB.money(calc.roundLine.amount) + '</span></div>';
    }
    h += '<div class="rl rl--total"><span class="rl-l">Total</span><span class="rl-r">' + FB.money(calc.total) + '</span></div>';
    /* Gated on the denominator the ratio is actually measured against. It used to
       gate on `subtotal` while `multiple` divided by it too, so the divide-by-zero
       fallback could only fire on an empty cart and was unreachable. Once `multiple`
       moved to foodPaid, a flat promo code worth more than the food — BANG10 against
       a $2.50 soda — left foodPaid at exactly zero and printed "0.0× the price of the
       food" over a button charging $50.00.

       There is no finite multiple when the food cost nothing, so say that instead of
       printing a false one. `foodPaid` may be absent on a receipt built from a saved
       order's frozen calc, hence the fallback to subtotal. */
    var food = calc.foodPaid != null ? calc.foodPaid : calc.subtotal;
    if (food > 0) {
      h += '<div class="rl-note" style="padding-top:8px">You are paying <b>' + calc.multiple.toFixed(1) + '×</b> the price of the food. ' +
        FB.money(calc.nonFood) + ' of this order is not food.</div>';
    } else if (calc.subtotal > 0) {
      h += '<div class="rl-note" style="padding-top:8px">The food has been covered in full. ' +
        FB.money(calc.nonFood) + ' of this order is not food, and is not covered.</div>';
    }
    h += '</div>';
    return h;
  };

  /* ---------- the pay statement ----------
     The same .rl rows as C.receipt, carrying the same data-why pair, so C.wireWhy
     opens the identical paragraph on both documents. The minus signs are drawn
     here: line() writes a `kind` but NOTHING in this app reads it — no renderer
     and no check — so a row cannot be trusted to know which direction it points. */
  C.statement = function (p) {
    var runRows = FB.fees.RUN_DEDUCTIONS.length;
    var row = function (l, neg) {
      return '<div class="rl"><span class="rl-l">' + FB.esc(l.label) +
        (FB.FEE_WHY[l.id] ? '<button class="why" data-why="' + l.id + '" data-whylabel="' + FB.attr(l.label) + '" aria-label="Why this deduction?">?</button>' : '') +
        '</span><span class="rl-r">' + (neg ? '−' : '') + FB.money(Math.abs(l.amount)) + '</span></div>' +
        (l.note ? '<div class="rl-note">' + FB.esc(l.note) + '</div>' : '');
    };

    var h = '<div class="receipt stmt">';
    h += row(p.incomeLine, false);
    h += '<div class="stmt-hd">Deductions</div>';
    p.lines.forEach(function (l, i) {
      /* The access block gets a header, because a statement of fifteen rows followed
         by statements of five with no stated reason reads as a bug rather than as a
         condition of access. */
      if (p.access && i === runRows) h += '<div class="stmt-hd">Conditions of access</div>';
      h += row(l, true);
    });
    if (p.settlement) {
      h += '<div class="stmt-hd">Settlement</div>' + row(p.settlement, false);
    }
    h += '<div class="rl rl--total"><span class="rl-l">Net Pay</span><span class="rl-r">' + FB.money(p.net) + '</span></div>';

    /* the receipt's own line, pointed the other way */
    if (p.gross > 0) {
      h += '<div class="rl-note" style="padding-top:8px">You have been assessed <b>' +
        p.multiple.toFixed(1) + '×</b> the pay. A statement pays out above ' +
        FB.money(p.breakEven) + '.</div>';
    }
    h += '</div>';
    return h;
  };

  /* wire the (?) buttons inside any container */
  C.wireWhy = function (root) {
    FB.on(root, 'click', '[data-why]', function (e, t) {
      /* NO stopPropagation: app.js delegates on document to award the "Read The
         Fees" achievement from any [data-why] tap, and stopping the bubble here
         made one of BODYMAX's twelve badges permanently unobtainable. Nothing in
         the ancestor chain of a .rl row handles clicks, so there was nothing to
         shield from in the first place. */
      FB.why(t.dataset.whylabel || 'About this fee', FB.FEE_WHY[t.dataset.why] || 'No explanation is available at this time.');
    });
  };

  /* ---------- slinger (courier) identity, stable per order ---------- */
  var FIRST = ['BRAYDEN', 'KAYLEE', 'DEVONTAE', 'MADYSYN', 'HUNTER', 'JAXSYN', 'RAELYNN', 'COLTYN', 'NEVAEH', 'BRYSON', 'DESTINEE', 'KHRYS'];
  var LAST = ['_7', '_44', '_XVII', ' (PROV.)', '_2', ' JR.', '_ALT', '_9000', ' II', '_TEMP'];
  /* One portrait per member of the roster. It was three for a long time, which meant
     nine named couriers shared three faces and five of them were the same man — in a
     mode whose whole premise is that the same nine people keep turning up. */
  var FACES = 9;
  var VEHICLES = ['2009 Sedan (Partially)', 'E-Bike, Unlicensed', 'Scooter (Shared)', 'Hatchback, Loud', 'Van, Unmarked', 'On Foot, Confident', 'Sedan, Idling'];
  C.slinger = function (seed) {
    var r = FB.seeded('slinger' + seed);
    var i = Math.floor(r() * FIRST.length);
    return {
      name: FIRST[i] + FB.pick(LAST, r),
      rating: FB.round2(3.1 + r() * 1.85),
      deliveries: Math.floor(r() * 240) + 3,
      vehicle: FB.pick(VEHICLES, r),
      photo: 'assets/app/slinger-' + (1 + Math.floor(r() * FACES)) + '.webp',
      tenure: Math.floor(r() * 40) + 1,
    };
  };
})(window.FB);
