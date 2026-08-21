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
        '<div class="sc-title"><h3>' + FB.esc(s.name) + '</h3></div>' +
        '<div class="sc-meta sc-meta--1">' +
          '<span class="stars">' + FB.icon('starFill', 13) + s.rating.toFixed(1) + '</span>' +
          '<span style="color:var(--ink-3)">(' + FB.compact(s.ratingCount) + ')</span>' +
          '<i class="dot-sep"></i><span>' + C.dollars(s.priceTier) + '</span>' +
          '<i class="dot-sep"></i><span class="trunc1">' + FB.esc(s.cuisine) + '</span>' +
          '<i class="dot-sep"></i><span style="flex:none">' + s.distanceMi.toFixed(1) + ' mi</span>' +
        '</div>' +
        '<div class="sc-meta"><span style="color:' + (s.deliveryFee === 0 ? 'var(--good)' : 'var(--ink-2)') + '">' + fee + '</span>' +
          (s.local ? '<i class="dot-sep"></i><span>Independent</span>' : '') + '</div>' +
        (s.promos && s.promos.length ? '<div class="sc-promo">' + FB.icon('tag', 13) + '<span class="trunc1">' + FB.esc(s.promos[0]) + '</span></div>' : '') +
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
    return '<button class="dishtile pressable" data-item="' + it.id + '" data-slug="' + s.slug + '">' +
      '<img src="' + it.photoSrc + '" alt="" loading="lazy">' +
      '<b class="trunc1">' + FB.esc(it.name) + '</b>' +
      '<span class="trunc1">' + FB.esc(s.shortName || s.name) + '</span>' +
      '<span class="dt-p">' + FB.money(it.price) + '</span></button>';
  };

  C.menuItem = function (it, store) {
    var badge = (it.badges || [])[0];
    return '<button class="mitem" data-item="' + it.id + '" data-slug="' + store.slug + '">' +
      '<span class="mi-b">' +
        (badge ? '<span class="badge badge--promo" style="margin-bottom:5px">' + FB.esc(badge) + '</span>' : '') +
        '<b>' + FB.esc(it.name) + '</b>' +
        '<span class="mi-d trunc2">' + FB.esc(it.desc) + '</span>' +
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
      '<h3>' + FB.esc(cfg.title) + '</h3><p>' + FB.esc(cfg.body) + '</p>' +
      (cfg.cta ? '<button class="btn btn--primary" data-go="' + cfg.go + '">' + FB.esc(cfg.cta) + '</button>' : '') +
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
        '<button class="why" data-why="taxes" data-whylabel="Taxes &amp; Other Fees">?</button></span>' +
        '<span class="rl-r">' + FB.money(calc.taxLine.amount) + '</span></div>';
      if (calc.taxLine.note) h += '<div class="rl-note">' + FB.esc(calc.taxLine.note) + '</div>';
    }

    h += '<div class="rl"><span class="rl-l">' + FB.esc(calc.tipLine.label) +
      '<button class="why" data-why="tip" data-whylabel="Slinger Tip">?</button></span>' +
      '<span class="rl-r">' + FB.money(calc.tipLine.amount) + '</span></div>';
    if (calc.roundLine) {
      h += '<div class="rl"><span class="rl-l">' + FB.esc(calc.roundLine.label) +
        '<button class="why" data-why="rounding" data-whylabel="Convenience Rounding">?</button></span>' +
        '<span class="rl-r">' + FB.money(calc.roundLine.amount) + '</span></div>';
    }
    h += '<div class="rl rl--total"><span class="rl-l">Total</span><span class="rl-r">' + FB.money(calc.total) + '</span></div>';
    if (calc.subtotal > 0) {
      h += '<div class="rl-note" style="padding-top:8px">You are paying <b>' + calc.multiple.toFixed(1) + '×</b> the price of the food. ' +
        FB.money(calc.nonFood) + ' of this order is not food.</div>';
    }
    h += '</div>';
    return h;
  };

  /* wire the (?) buttons inside any container */
  C.wireWhy = function (root) {
    FB.on(root, 'click', '[data-why]', function (e, t) {
      e.stopPropagation();
      FB.why(t.dataset.whylabel || 'About this fee', FB.FEE_WHY[t.dataset.why] || 'No explanation is available at this time.');
    });
  };

  /* ---------- slinger (courier) identity, stable per order ---------- */
  var FIRST = ['BRAYDEN', 'KAYLEE', 'DEVONTAE', 'MADYSYN', 'HUNTER', 'JAXSYN', 'RAELYNN', 'COLTYN', 'NEVAEH', 'BRYSON', 'DESTINEE', 'KHRYS'];
  var LAST = ['_7', '_44', '_XVII', ' (PROV.)', '_2', ' JR.', '_ALT', '_9000', ' II', '_TEMP'];
  var VEHICLES = ['2009 Sedan (Partially)', 'E-Bike, Unlicensed', 'Scooter (Shared)', 'Hatchback, Loud', 'Van, Unmarked', 'On Foot, Confident', 'Sedan, Idling'];
  C.slinger = function (seed) {
    var r = FB.seeded('slinger' + seed);
    var i = Math.floor(r() * FIRST.length);
    return {
      name: FIRST[i] + FB.pick(LAST, r),
      rating: FB.round2(3.1 + r() * 1.85),
      deliveries: Math.floor(r() * 240) + 3,
      vehicle: FB.pick(VEHICLES, r),
      photo: 'assets/app/slinger-' + (1 + Math.floor(r() * 3)) + '.webp',
      tenure: Math.floor(r() * 40) + 1,
    };
  };
})(window.FB);
