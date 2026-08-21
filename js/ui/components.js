/* DoorGorge — shared render components */
window.DG = window.DG || {};
(function (DG) {
  'use strict';
  var C = DG.C = {};

  C.dollars = function (tier) { return '$'.repeat(Math.max(1, tier || 1)); };

  C.storeBadges = function (s) {
    var out = [];
    if (s.gorgePlus) out.push('<span class="badge badge--plus">' + DG.icon('zap', 11) + 'GORGE+</span>');
    if (s.local) out.push('<span class="badge badge--glass">LOCAL</span>');
    if (s.busy) out.push('<span class="badge badge--warn">Busy</span>');
    return out.join('');
  };

  C.storeMeta = function (s) {
    return '<span class="stars">' + DG.icon('starFill', 13) + s.rating.toFixed(1) + '</span>' +
      '<span style="color:var(--ink-3)">(' + DG.compact(s.ratingCount) + ')</span>' +
      '<i class="dot-sep"></i><span>' + C.dollars(s.priceTier) + '</span>' +
      '<i class="dot-sep"></i><span>' + DG.esc(s.cuisine) + '</span>' +
      '<i class="dot-sep"></i><span>' + s.distanceMi.toFixed(1) + ' mi</span>';
  };

  C.storeCard = function (s) {
    var fee = s.deliveryFee === 0 ? '$0 delivery fee' : DG.moneyShort(s.deliveryFee) + ' delivery fee';
    return '<button class="storecard pressable" data-go="store" data-params=\'{"slug":"' + s.slug + '"}\'>' +
      '<div class="sc-media">' +
        '<img src="' + s.heroSrc + '" alt="" loading="lazy" onerror="this.style.opacity=0">' +
        '<span class="sc-tags">' + C.storeBadges(s) + '</span>' +
        '<img class="sc-logo" src="' + s.logoSrc + '" alt="" loading="lazy">' +
        '<span class="sc-eta">' + DG.mins(s.deliveryMin, s.deliveryMax) + '</span>' +
      '</div>' +
      '<div class="sc-body">' +
        '<div class="sc-title"><h3>' + DG.esc(s.name) + '</h3></div>' +
        '<div class="sc-meta sc-meta--1">' +
          '<span class="stars">' + DG.icon('starFill', 13) + s.rating.toFixed(1) + '</span>' +
          '<span style="color:var(--ink-3)">(' + DG.compact(s.ratingCount) + ')</span>' +
          '<i class="dot-sep"></i><span>' + C.dollars(s.priceTier) + '</span>' +
          '<i class="dot-sep"></i><span class="trunc1">' + DG.esc(s.cuisine) + '</span>' +
          '<i class="dot-sep"></i><span style="flex:none">' + s.distanceMi.toFixed(1) + ' mi</span>' +
        '</div>' +
        '<div class="sc-meta"><span style="color:' + (s.deliveryFee === 0 ? 'var(--good)' : 'var(--ink-2)') + '">' + fee + '</span>' +
          (s.local ? '<i class="dot-sep"></i><span>Independent</span>' : '') + '</div>' +
        (s.promos && s.promos.length ? '<div class="sc-promo">' + DG.icon('tag', 13) + '<span class="trunc1">' + DG.esc(s.promos[0]) + '</span></div>' : '') +
      '</div></button>';
  };

  C.storeRow = function (s) {
    return '<button class="row" data-go="store" data-params=\'{"slug":"' + s.slug + '"}\'>' +
      '<img class="row-img" src="' + s.logoSrc + '" alt="" loading="lazy">' +
      '<span class="row-b"><b>' + DG.esc(s.name) + '</b>' +
        '<span>' + s.rating.toFixed(1) + ' ★ · ' + DG.esc(s.cuisine) + ' · ' + DG.mins(s.deliveryMin, s.deliveryMax) + '</span></span>' +
      '<span class="row-r">' + DG.icon('fwd', 16) + '</span></button>';
  };

  /* merchandising tile for a single photographed dish */
  C.dishTile = function (rec) {
    var it = rec.item, s = rec.store;
    return '<button class="dishtile pressable" data-item="' + it.id + '" data-slug="' + s.slug + '">' +
      '<img src="' + it.photoSrc + '" alt="" loading="lazy">' +
      '<b class="trunc1">' + DG.esc(it.name) + '</b>' +
      '<span class="trunc1">' + DG.esc(s.shortName || s.name) + '</span>' +
      '<span class="dt-p">' + DG.money(it.price) + '</span></button>';
  };

  C.menuItem = function (it, store) {
    var badge = (it.badges || [])[0];
    return '<button class="mitem" data-item="' + it.id + '" data-slug="' + store.slug + '">' +
      '<span class="mi-b">' +
        (badge ? '<span class="badge badge--promo" style="margin-bottom:5px">' + DG.esc(badge) + '</span>' : '') +
        '<b>' + DG.esc(it.name) + '</b>' +
        '<span class="mi-d trunc2">' + DG.esc(it.desc) + '</span>' +
        '<span class="mi-p">' + DG.money(it.price) +
          '<i class="mi-cal">' + DG.int(it.calories) + ' Cal</i></span>' +
      '</span>' +
      (it.photoSrc
        ? '<span class="mi-img"><img src="' + it.photoSrc + '" alt="" loading="lazy"><i class="mi-add">' + DG.icon('plus', 15) + '</i></span>'
        : '<span class="mi-img mi-img--none"><i class="mi-add">' + DG.icon('plus', 15) + '</i></span>') +
      '</button>';
  };

  C.sectionHead = function (title, sub, more) {
    return '<div class="sec-head"><h2>' + DG.esc(title) + '</h2>' +
      (more ? '<span class="sh-more">' + DG.esc(more) + DG.icon('fwd', 13) + '</span>' : '') + '</div>' +
      (sub ? '<div class="sec-sub">' + DG.esc(sub) + '</div>' : '');
  };

  C.empty = function (cfg) {
    return '<div class="empty">' +
      '<img src="' + (cfg.img || 'assets/app/empty-state.webp') + '" alt="" onerror="this.remove()">' +
      '<h3>' + DG.esc(cfg.title) + '</h3><p>' + DG.esc(cfg.body) + '</p>' +
      (cfg.cta ? '<button class="btn btn--primary" data-go="' + cfg.go + '">' + DG.esc(cfg.cta) + '</button>' : '') +
      '</div>';
  };

  /* ---------- receipt ---------- */
  C.receipt = function (calc, opts) {
    opts = opts || {};
    var h = '<div class="receipt">';
    h += '<div class="rl"><span class="rl-l">Subtotal</span><span class="rl-r">' + DG.money(calc.subtotal) + '</span></div>';
    calc.discounts.forEach(function (d) {
      h += '<div class="rl rl--free"><span class="rl-l">' + DG.esc(d.label) + '</span><span class="rl-r">' + DG.money(d.amount) + '</span></div>';
      if (d.note) h += '<div class="rl-note">' + DG.esc(d.note) + '</div>';
    });

    if (opts.collapsed) {
      h += '<button class="rl" data-expand-fees style="width:100%;text-align:left">' +
        '<span class="rl-l">Fees &amp; Estimated Tax ' + DG.icon('down', 14) + '</span>' +
        '<span class="rl-r">' + DG.money(calc.feesTotal + calc.taxLine.amount) + '</span></button>';
    } else {
      calc.feeLines.forEach(function (l) {
        h += '<div class="rl' + (l.free ? ' rl--free' : '') + '">' +
          '<span class="rl-l">' + DG.esc(l.label) +
            (DG.FEE_WHY[l.id] ? '<button class="why" data-why="' + l.id + '" data-whylabel="' + DG.attr(l.label) + '" aria-label="Why this fee?">?</button>' : '') +
          '</span>' +
          '<span class="rl-r">' + (l.free ? 'Free' : DG.money(l.amount)) +
            (l.was ? ' <s style="color:var(--ink-3);font-weight:400">' + DG.money(l.was) + '</s>' : '') + '</span></div>';
        if (l.note) h += '<div class="rl-note">' + DG.esc(l.note) + '</div>';
      });
      h += '<div class="rl"><span class="rl-l">' + DG.esc(calc.taxLine.label) +
        '<button class="why" data-why="taxes" data-whylabel="Taxes &amp; Other Fees">?</button></span>' +
        '<span class="rl-r">' + DG.money(calc.taxLine.amount) + '</span></div>';
      if (calc.taxLine.note) h += '<div class="rl-note">' + DG.esc(calc.taxLine.note) + '</div>';
    }

    h += '<div class="rl"><span class="rl-l">' + DG.esc(calc.tipLine.label) +
      '<button class="why" data-why="tip" data-whylabel="Gorger Tip">?</button></span>' +
      '<span class="rl-r">' + DG.money(calc.tipLine.amount) + '</span></div>';
    if (calc.roundLine) {
      h += '<div class="rl"><span class="rl-l">' + DG.esc(calc.roundLine.label) +
        '<button class="why" data-why="rounding" data-whylabel="Convenience Rounding">?</button></span>' +
        '<span class="rl-r">' + DG.money(calc.roundLine.amount) + '</span></div>';
    }
    h += '<div class="rl rl--total"><span class="rl-l">Total</span><span class="rl-r">' + DG.money(calc.total) + '</span></div>';
    if (calc.subtotal > 0) {
      h += '<div class="rl-note" style="padding-top:8px">You are paying <b>' + calc.multiple.toFixed(1) + '×</b> the price of the food. ' +
        DG.money(calc.nonFood) + ' of this order is not food.</div>';
    }
    h += '</div>';
    return h;
  };

  /* wire the (?) buttons inside any container */
  C.wireWhy = function (root) {
    DG.on(root, 'click', '[data-why]', function (e, t) {
      e.stopPropagation();
      DG.why(t.dataset.whylabel || 'About this fee', DG.FEE_WHY[t.dataset.why] || 'No explanation is available at this time.');
    });
  };

  /* ---------- gorger (courier) identity, stable per order ---------- */
  var FIRST = ['BRAYDEN', 'KAYLEE', 'DEVONTAE', 'MADYSYN', 'HUNTER', 'JAXSYN', 'RAELYNN', 'COLTYN', 'NEVAEH', 'BRYSON', 'DESTINEE', 'KHRYS'];
  var LAST = ['_7', '_44', '_XVII', ' (PROV.)', '_2', ' JR.', '_ALT', '_9000', ' II', '_TEMP'];
  var VEHICLES = ['2009 Sedan (Partially)', 'E-Bike, Unlicensed', 'Scooter (Shared)', 'Hatchback, Loud', 'Van, Unmarked', 'On Foot, Confident', 'Sedan, Idling'];
  C.gorger = function (seed) {
    var r = DG.seeded('gorger' + seed);
    var i = Math.floor(r() * FIRST.length);
    return {
      name: FIRST[i] + DG.pick(LAST, r),
      rating: DG.round2(3.1 + r() * 1.85),
      deliveries: Math.floor(r() * 240) + 3,
      vehicle: DG.pick(VEHICLES, r),
      photo: 'assets/app/gorger-' + (1 + Math.floor(r() * 3)) + '.webp',
      tenure: Math.floor(r() * 40) + 1,
    };
  };
})(window.DG);
