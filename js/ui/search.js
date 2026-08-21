/* DoorGorge — search + grocery tabs */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  var q = '';
  var TRENDING = ['ranch', 'bucket', 'boneless', 'electrolytes', 'endless', 'trough', 'municipal', 'breakfast'];

  DG.screens.register('search', {
    tab: 'search',
    appbar: function () {
      return '<div class="bar" style="padding-bottom:2px"><h1>Search</h1></div>' +
        '<div class="searchbox">' + DG.icon('search', 18) +
        '<input id="q" placeholder="Stores, dishes, regrets" value="' + DG.attr(q) + '" autocomplete="off">' +
        (q ? '<button class="sb-clear" data-clearq aria-label="Clear">' + DG.icon('x', 11) + '</button>' : '') + '</div>';
    },
    render: function () {
      var st = DG.S();
      if (!q.trim()) {
        var h = '';
        if (st.recentSearches.length) {
          h += DG.C.sectionHead('Recent');
          h += st.recentSearches.slice(0, 6).map(function (r) {
            return '<button class="recentrow" data-q="' + DG.attr(r) + '">' + DG.icon('clock', 17) +
              '<b>' + DG.esc(r) + '</b>' + DG.icon('up', 15) + '</button>';
          }).join('');
        }
        h += DG.C.sectionHead('Trending near you', 'Trending is determined by us.');
        h += '<div class="rail" style="padding-bottom:14px">' + TRENDING.map(function (t) {
          return '<button class="chip chip--outline" data-q="' + DG.attr(t) + '">' + DG.esc(t) + '</button>';
        }).join('') + '</div>';

        h += DG.C.sectionHead('Browse by category');
        h += '<div style="padding:0 16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
          DG.catalog.categories().map(function (c) {
            return '<button class="chip chip--outline" data-cat="' + c.slug + '" style="height:52px;justify-content:flex-start;padding:0 14px;font-size:14.5px">' +
              '<span style="font-size:20px;margin-right:8px">' + c.icon + '</span>' + DG.esc(c.label) +
              '<span style="margin-left:auto;color:var(--ink-3);font-size:12px">' + c.count + '</span></button>';
          }).join('') + '</div>';

        h += DG.C.sectionHead('All stores', DG.catalog.count() + ' near ' + DG.esc(DG.store.address().city.split(',')[0]));
        h += DG.catalog.all().map(DG.C.storeRow).join('');
        return h;
      }

      var r = DG.catalog.search(q);
      if (!r.stores.length && !r.items.length) {
        return DG.C.empty({ title: 'No results for “' + q + '”', body: 'Try a broader term, or accept what is available.' });
      }
      var h2 = '';
      if (r.stores.length) {
        h2 += DG.C.sectionHead(DG.plural(r.stores.length, 'store'));
        h2 += r.stores.map(DG.C.storeRow).join('');
      }
      if (r.items.length) {
        h2 += DG.C.sectionHead(DG.plural(r.items.length, 'dish', 'dishes'),
          r.items.some(function (x) { return x.via; }) ? 'Including matches inside modifier options.' : null);
        h2 += r.items.map(function (rec) {
          return '<button class="row" data-item="' + rec.item.id + '" data-slug="' + rec.store.slug + '">' +
            (rec.item.photoSrc ? '<img class="row-img" src="' + rec.item.photoSrc + '" alt="" loading="lazy">'
              : '<span class="row-img" style="display:grid;place-items:center;font-size:22px">' + (DG.CAT_ICONS[(rec.store.categories || [])[0]] || '🍽') + '</span>') +
            '<span class="row-b"><b>' + DG.esc(rec.item.name) + '</b>' +
            '<span>' + DG.esc(rec.store.name) + (rec.via ? ' · ' + DG.esc(rec.via) : ' · ' + DG.esc(rec.item.sectionName)) + '</span></span>' +
            '<span class="row-r"><b style="color:var(--ink);font:700 14px var(--font)">' + DG.money(rec.item.price) + '</b></span></button>';
        }).join('');
      }
      return h2;
    },
    mount: function (root) {
      var bar = document.getElementById('appbar');
      var input = document.getElementById('q');
      if (input && !q) setTimeout(function () { input.focus(); }, 120);

      DG.on(bar, 'input', '#q', DG.debounce(function (e, t) {
        q = t.value;
        var sc = root.scrollTop;
        root.innerHTML = DG.screens.get('search').render();
        root.scrollTop = 0;
        if (q.trim().length > 2) {
          DG.store.set(function (st) {
            st.recentSearches = [q.trim()].concat(st.recentSearches.filter(function (x) { return x !== q.trim(); })).slice(0, 10);
            return st;
          }, { silent: true });
        }
      }, 200));
      DG.on(bar, 'click', '[data-clearq]', function () { q = ''; DG.nav.refresh(); });
      DG.on(root, 'click', '[data-q]', function (e, t) { q = t.dataset.q; DG.nav.refresh(); });
      DG.on(root, 'click', '[data-cat]', function (e, t) {
        q = ''; DG.nav.go('category', { cat: t.dataset.cat });
      });
    },
  });

  /* ---------------- category browse ---------------- */
  DG.screens.register('category', {
    tab: 'search',
    appbar: function (p) {
      return '<div class="bar bar--border"><button class="iconbtn" data-back>' + DG.icon('back', 20) + '</button>' +
        '<h1>' + DG.esc(DG.CAT_LABELS[p.cat] || 'Browse') + '</h1></div>';
    },
    render: function (p) {
      var list = DG.catalog.byCategory(p.cat);
      return '<div class="sec-sub" style="padding-top:12px">' + DG.plural(list.length, 'store') + ' in this category.</div>' +
        '<div class="grid1" style="padding-top:8px">' + list.map(DG.C.storeCard).join('') + '</div><div style="height:24px"></div>';
    },
  });

  /* ---------------- grocery tab ---------------- */
  DG.screens.register('grocery', {
    tab: 'grocery',
    appbar: function () {
      return '<div class="bar" style="padding-bottom:2px"><h1>Grocery &amp; Retail</h1>' +
        '<button class="iconbtn" data-go="search">' + DG.icon('search', 19) + '</button></div>';
    },
    render: function () {
      var g = DG.catalog.byCategory('grocery').concat(
        DG.catalog.byCategory('drinks').filter(function (s) { return (s.categories || []).indexOf('grocery') < 0; }));
      var everything = DG.catalog.all().filter(function (s) { return g.indexOf(s) < 0; });
      var h = '';
      h += '<div class="callout" style="margin-top:8px">' + DG.icon('info', 17) +
        '<span>Grocery orders are delivered by the same Gorgers, in the same bags, on the same routes, at a different fee schedule.</span></div>';
      h += DG.C.sectionHead('Shop by aisle', 'Aisles are conceptual.');
      h += '<div class="grid1">' + g.map(DG.C.storeCard).join('') + '</div>';
      h += DG.C.sectionHead('Convenience', 'Everything else, at convenience pricing.');
      h += '<div class="hcards">' + everything.slice(0, 8).map(DG.C.storeCard).join('') + '</div>';
      h += '<div class="fineprint">Retail availability is simulated. Nothing on this screen exists, which is the only thing keeping it in stock.</div>';
      return h;
    },
  });
})(window.DG);
