/* FoodBang — Home feed */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* The marquee used to be seven lines that were true at every hour, which is
     another way of saying it was true at none of them. Drawn per daypart now, and
     seeded on the world bucket, so it is stable for twenty minutes and different
     after that — and at 3 AM it says something only 3 AM could say. */
  var TICKER_ANY = [
    'PEAK DEMAND IN EFFECT', 'PEAK DEMAND HAS BEEN IN EFFECT SINCE MARCH 2019',
    'FEES ARE FINAL', 'BANG+ PAYS FOR ITSELF AT $312',
  ];
  var TICKER_BY_DAYPART = {
    earlyam:   ['THE OVENS ARE COMING UP TO TEMPERATURE', 'FOUR RESTAURANTS ARE OPEN. THEY ARE AWARE OF EACH OTHER'],
    breakfast: ['BREAKFAST IS SERVED UNTIL IT IS NOT', 'COFFEE IS A DELIVERY CATEGORY'],
    lunch:     ['YOUR SLINGER IS ALREADY MOVING', 'LUNCH VOLUME IS NOMINAL AND IS BEING BILLED AS EXCEPTIONAL'],
    slump:     ['DEMAND IS LOW. PEAK DEMAND REMAINS IN EFFECT', 'THE AFTERNOON IS A RECOGNISED MEAL'],
    dinner:    ['EVERY KITCHEN IN YOUR AREA IS AT CAPACITY', 'DO NOT ANSWER THE DOOR EMPTY-HANDED'],
    evening:   ['ELECTROLYTES AVAILABLE NOW', 'THE EVENING SURCHARGE IS NOT AN EVENING SURCHARGE'],
    deadzone:  ['FOUR RESTAURANTS ARE OPEN. THEY ARE AWARE OF EACH OTHER', 'NOBODY WILL ASK YOU ANYTHING'],
  };
  function tickerLines() {
    var w = FB.world.at();
    var pool = TICKER_ANY.concat(TICKER_BY_DAYPART[w.daypart] || []);
    return FB.shuffle(pool, FB.seeded('ticker' + w.bucket))
      .map(function (t) { return FB.clock() + ' · ' + t; });
  }

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
      '<button class="iconbtn" data-notifs aria-label="Notifications">' + FB.icon('bell', 19) +
        (FB.notifs.unreadCount() ? '<i class="belldot"></i>' : '') + '</button>' +
    '</div>';
  }

  FB.screens.register('home', {
    tab: 'home',
    appbar: function () {
      /* A button, not a readonly <input>. As an input it answered only to click:
         Enter and Space did nothing, and once focus was inside it the global keydown
         handler early-returned for anything in an input, so the / shortcut could not
         rescue you either. The app's primary entry point was a keyboard dead end. */
      return addressBar() +
        '<div class="searchbox">' + FB.icon('search', 18) +
        '<button class="sbproxy" data-gosearch>Search FoodBang™</button></div>';
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
        return '<button class="cat" data-cat="' + c.slug + '" aria-pressed="' + (state.cat === c.slug) + '">' +
          '<i>' + c.icon + '<img src="' + c.img + '" alt="" loading="lazy" onerror="this.remove()"></i>' +
          '<span>' + FB.esc(c.label) + '</span></button>';
      }).join('') + '</div>';

      /* ticker */
      var ticker = tickerLines();
      h += '<div class="marquee"><div>' + ticker.concat(ticker).map(function (t) { return '<span>' + FB.esc(t) + '</span>'; }).join('') + '</div></div>';

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
        '<button class="chip chip--outline" data-filter="plus" aria-pressed="' + !!state.filters.plus + '">BANG+</button>' +
        '<button class="chip chip--outline" data-filter="fast" aria-pressed="' + !!state.filters.fast + '">Under 30 min</button>' +
        '<button class="chip chip--outline" data-filter="rated" aria-pressed="' + !!state.filters.rated + '">4.0+</button>' +
        '<button class="chip chip--outline" data-filter="cheap" aria-pressed="' + !!state.filters.cheap + '">$ &amp; $$</button>' +
        '<button class="chip chip--outline" data-filter="open" aria-pressed="' + !!state.filters.open + '">Open now</button>' +
        '<button class="chip chip--outline" data-filter="local" aria-pressed="' + !!state.filters.local + '">Independent</button>' +
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
      FB.on(document.getElementById('appbar'), 'click', '[data-addrpick]', function () {
        FB.openAddressSheet(function () { FB.nav.refresh(); });
      });
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
      if (f.open && !FB.catalog.isOpen(s)) return false;
      return true;
    });
  }

  function openSort() {
    FB.sheet.open({
      title: 'Sort',
      sub: 'One of these is honest.',
      html: '<div role="radiogroup" aria-label="Sort">' + Object.keys(SORTS).map(function (k) {
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
