/* FoodBang — Home feed */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var TICKER = [
    'PEAK DEMAND IN EFFECT', 'PEAK DEMAND HAS BEEN IN EFFECT SINCE MARCH 2019',
    'YOUR SLINGER IS ALREADY MOVING', 'FEES ARE FINAL', 'ELECTROLYTES AVAILABLE NOW',
    'DO NOT ANSWER THE DOOR EMPTY-HANDED', 'BANG+ PAYS FOR ITSELF AT $312',
  ];

  var PROMOS = [
    { img: 'assets/app/promo-1.webp', kicker: 'LIMITED TIME', title: 'Free Fries With Any $85 Order',
      sub: 'Fries valued at $0.90. Order minimum valued at $85.00.', go: 'search' },
    { img: 'assets/app/promo-2.webp', kicker: 'NEW', title: 'The Structural Sundae',
      sub: 'Now available at eleven locations and one former location.', go: 'search' },
    { img: 'assets/app/promo-3.webp', kicker: 'SAUCE EVENT', title: '40 Sauces. One Decision.',
      sub: 'Each sauce is $2.40. The decision is free.', go: 'search' },
  ];

  var state = { cat: null, sort: 'default', filters: {} };

  function addressBar() {
    var a = FB.store.address();
    var st = FB.S();
    return '<div class="addrbar">' +
      FB.markTile(30, 'fb-tile--flat') +
      '<button class="addrpick" data-addrpick>' +
        '<span style="min-width:0">' +
          '<span class="ap-line"><span class="ap-mode">Delivery</span>' + FB.icon('down', 15) + '</span>' +
          '<span class="ap-addr">' + FB.esc(a.line1) + '</span>' +
        '</span>' +
      '</button>' +
      (st.plus.active ? '<span class="badge badge--plus" style="height:26px;padding:0 9px">' + FB.icon('zap', 11) + 'BANG+</span>'
        : '<button class="btn btn--sm btn--dark" data-go="plus">Try BANG+</button>') +
      '<button class="iconbtn" data-notifs aria-label="Notifications">' + FB.icon('bell', 19) + '</button>' +
    '</div>';
  }

  FB.screens.register('home', {
    tab: 'home',
    appbar: function () {
      return addressBar() +
        '<div class="searchbox">' + FB.icon('search', 18) +
        '<input readonly placeholder="Search FoodBang™" data-gosearch></div>';
    },
    render: function () {
      var stores = FB.catalog.all();
      var shown = FB.catalog.sort(FB.catalog.byCategory(state.cat), state.sort);
      var fast = FB.catalog.sort(stores, 'fast').slice(0, 6);
      var deals = stores.filter(function (s) { return s.promos && s.promos.length; }).slice(0, 6);
      var dishes = FB.catalog.photoItems(14);
      var cats = FB.catalog.categories();
      var st = FB.S();

      var h = '';

      /* category rail */
      h += '<div class="cats">' + cats.map(function (c) {
        return '<button class="cat" data-cat="' + c.slug + '"' + (state.cat === c.slug ? ' aria-pressed="true"' : '') + '>' +
          '<i>' + c.icon + '<img src="' + c.img + '" alt="" loading="lazy" onerror="this.remove()"></i>' +
          '<span>' + FB.esc(c.label) + '</span></button>';
      }).join('') + '</div>';

      /* ticker */
      h += '<div class="marquee"><div>' + TICKER.concat(TICKER).map(function (t) { return '<span>' + t + '</span>'; }).join('') + '</div></div>';

      /* promo carousel */
      h += '<div class="promorail">' + PROMOS.map(function (p) {
        return '<button class="promo" data-go="' + p.go + '">' +
          '<img src="' + p.img + '" alt="" loading="lazy" onerror="this.remove()">' +
          '<span class="promo-b"><i>' + p.kicker + '</i><b>' + FB.esc(p.title) + '</b><span>' + FB.esc(p.sub) + '</span></span></button>';
      }).join('') + '</div>';

      /* BANG+ pitch */
      if (!st.plus.active) {
        h += '<button class="plusbanner" data-go="plus">' +
          '<img src="assets/app/bangplus-hero.webp" alt="" loading="lazy" onerror="this.remove()">' +
          '<span class="pb-k">BANG+ INFINITY PRIME ELITE</span>' +
          '<span class="pb-t">$0 delivery fees on orders over $312</span>' +
          '<span class="pb-s">$19.99/mo. Cancel anytime, in person, during business hours.</span>' +
          '<span class="pb-c">Start free trial</span></button>';
      }

      /* filters */
      h += '<div class="filterbar">' +
        '<button class="chip chip--outline" data-sortsheet>' + FB.icon('sliders', 15) + 'Sort' +
          (state.sort !== 'default' ? ' · ' + FB.esc(SORTS[state.sort]) : '') + '</button>' +
        '<button class="chip chip--outline" data-filter="plus"' + (state.filters.plus ? ' aria-pressed="true"' : '') + '>BANG+</button>' +
        '<button class="chip chip--outline" data-filter="fast"' + (state.filters.fast ? ' aria-pressed="true"' : '') + '>Under 30 min</button>' +
        '<button class="chip chip--outline" data-filter="rated"' + (state.filters.rated ? ' aria-pressed="true"' : '') + '>4.0+</button>' +
        '<button class="chip chip--outline" data-filter="cheap"' + (state.filters.cheap ? ' aria-pressed="true"' : '') + '>$ &amp; $$</button>' +
        '<button class="chip chip--outline" data-filter="local"' + (state.filters.local ? ' aria-pressed="true"' : '') + '>Independent</button>' +
        (state.cat ? '<button class="chip is-on" data-cat="">' + FB.esc(FB.CAT_LABELS[state.cat]) + ' ✕</button>' : '') +
      '</div>';

      if (!state.cat && !Object.keys(state.filters).length) {
        h += '<section class="sec">' + FB.C.sectionHead('Fastest near you', 'Speed is estimated. Estimates are not commitments.') +
          '<div class="hcards">' + fast.map(FB.C.storeCard).join('') + '</div></section>';

        h += '<section class="sec">' + FB.C.sectionHead('In your mouth again?', 'Based on things you have not eaten yet.') +
          '<div class="dishrail">' + dishes.slice(0, 10).map(FB.C.dishTile).join('') + '</div></section>';

        var locals = stores.filter(function (s) { return s.local; });
        if (locals.length) {
          h += '<section class="sec">' + FB.C.sectionHead('Right here, actually',
            FB.plural(locals.length, 'independent') + ' near you. Longer waits, higher delivery fees, better food.') +
            '<div class="hcards">' + locals.map(FB.C.storeCard).join('') + '</div></section>';
        }

        h += '<section class="sec">' + FB.C.sectionHead('Deals you cannot decline', 'Declining is available for a fee.') +
          '<div class="hcards">' + deals.map(FB.C.storeCard).join('') + '</div></section>';
      }

      /* full list */
      var list = applyFilters(shown);
      h += '<section class="sec">' +
        FB.C.sectionHead(state.cat ? FB.CAT_LABELS[state.cat] : 'All ' + list.length + ' stores near you',
          state.cat ? null : 'Ranked by an algorithm that is not disclosed and is not appealable.') +
        '<div class="grid1">' + (list.length ? list.map(FB.C.storeCard).join('')
          : '<p style="color:var(--ink-2);font:var(--t-body);padding:20px 0">Nothing matches. Loosen a filter, or lower a standard.</p>') +
        '</div></section>';

      h += '<div class="fineprint"><b>FoodBang™ Nutrition Logistics, Inc.</b> — Every restaurant, item, price, fee and modifier in this application is fictional and exists for satirical purposes. ' +
        'Delivery estimates are aspirational. Fees are structural. Prices shown do not include fees, and fees do not include fees. ' +
        'By scrolling this far you have agreed to the Terms, which are longer than this menu.</div>';

      return h;
    },

    mount: function (root) {
      FB.on(root, 'click', '[data-cat]', function (e, t) {
        state.cat = t.dataset.cat || null; FB.nav.refresh(); FB.scrollTop();
      });
      FB.on(root, 'click', '[data-filter]', function (e, t) {
        var k = t.dataset.filter;
        if (state.filters[k]) delete state.filters[k]; else state.filters[k] = true;
        FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-sortsheet]', openSort);
      FB.on(document.getElementById('appbar'), 'click', '[data-gosearch]', function () { FB.nav.tab('search'); });
      FB.on(document.getElementById('appbar'), 'click', '[data-addrpick]', FB.openAddressSheet);
      FB.on(document.getElementById('appbar'), 'click', '[data-notifs]', FB.openNotifications);
    },
  });

  var SORTS = { default: 'Recommended', rating: 'Rating', fast: 'Delivery time', cheap: 'Price', near: 'Distance', desperation: 'Desperation' };

  function applyFilters(list) {
    var f = state.filters;
    return list.filter(function (s) {
      if (f.plus && !s.bangPlus) return false;
      if (f.fast && s.deliveryMax > 30) return false;
      if (f.rated && s.rating < 4) return false;
      if (f.cheap && s.priceTier > 2) return false;
      if (f.local && !s.local) return false;
      return true;
    });
  }

  function openSort() {
    FB.sheet.open({
      title: 'Sort',
      sub: 'One of these is honest.',
      html: '<div>' + Object.keys(SORTS).map(function (k) {
        return '<button class="opt" role="radio" aria-checked="' + (state.sort === k) + '" data-sort="' + k + '">' +
          '<span class="mark"></span><span class="opt-b"><b>' + SORTS[k] + '</b>' +
          (k === 'desperation' ? '<span>Orders per point of rating. The stores people go to anyway.</span>' : '') +
          '</span></button>';
      }).join('') + '</div>',
      onMount: function (body, h) {
        FB.on(body, 'click', '[data-sort]', function (e, t) {
          state.sort = t.dataset.sort; h.close(); FB.nav.refresh();
        });
      },
    });
  }
})(window.FB);
