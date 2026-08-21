/* FoodBang — catalog index built over the generated menu bundle */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var stores = [];
  var bySlug = {};
  var itemIndex = [];   /* { store, section, item } */

  function assetBase(slug) { return 'assets/brands/' + slug + '/'; }

  function decorate(m) {
    m.logoSrc = assetBase(m.slug) + 'logo.webp';
    m.heroSrc = assetBase(m.slug) + 'hero.webp';
    m.itemCount = 0;
    m.priceFrom = Infinity;
    (m.menu || []).forEach(function (sec) {
      sec.storeSlug = m.slug;
      (sec.items || []).forEach(function (it) {
        it.storeSlug = m.slug;
        it.sectionId = sec.id;
        it.sectionName = sec.name;
        it.photoSrc = it.photo ? assetBase(m.slug) + it.photo : null;
        it.groups = it.groups || [];
        m.itemCount++;
        if (it.price < m.priceFrom) m.priceFrom = it.price;
        itemIndex.push({ store: m, section: sec, item: it });
      });
    });
    if (m.priceFrom === Infinity) m.priceFrom = 0;
    /* Deterministic per-store flavor the data files don't carry. `busy` used to be
       decided here and never revisited — decorate() runs once inside catalog.init()
       at boot, so a tab left open across dinner still showed the afternoon's badges.
       It lives in FB.world now and is read at render. recentOrders deliberately
       stays here: it feeds the Desperation sort, and a sort order that changes
       under the user's thumb at a bucket boundary is a bug, not a living world. */
    var rnd = FB.seeded(m.slug);
    m.recentOrders = 40 + Math.floor(rnd() * 1800);
    return m;
  }

  /* Settings promises that a raised Hunger Level raises portion defaults one tier,
     and until now nothing here read the number.

     Rank by PRICE, never by index: across the 1,019 required groups the last option
     is the highest-priced one in only 445 of them, and in 118 it costs LESS than the
     first — mcronalds mcr-002/g2 ends in "No Sheet" — so "select the largest" would
     sometimes lower the price. Price is the ordering the data actually encodes, and
     bundle.cjs already validates it as numeric.

     Declines are excluded. 57 required groups price a refusal highest, so a pure
     price rule opens Hunger 10 on "No Rice", "No Vessel" and "Decline to Declare":
     less food for more money, which reads as a broken app rather than as a joke.
     Matched by name, the way itemLoad() below already matches sauces. */
  var DECLINE = /^\s*(no\b|no-|none\b|without\b|decline|omit|skip|hold the\b|do not\b|zero\b|bucketless|refuse|opt.out)/i;
  function optPrice(o) { return o.price || 0; }

  function hungerPick(g, hunger) {
    var first = g.options[0];
    if (!(hunger >= 8)) return first;
    var eligible = g.options.filter(function (o) { return !DECLINE.test(o.name); });
    if (!eligible.length) return first;
    var pick;
    if (hunger >= 10) {
      pick = eligible.reduce(function (a, b) { return optPrice(b) > optPrice(a) ? b : a; }, eligible[0]);
    } else {
      /* one tier up: the cheapest option that still costs more than the default */
      var up = eligible.filter(function (o) { return optPrice(o) > optPrice(first); });
      if (!up.length) return first;
      pick = up.reduce(function (a, b) { return optPrice(b) < optPrice(a) ? b : a; }, up[0]);
    }
    /* the floor, whatever the data does: Hunger must never lower a price */
    return optPrice(pick) >= optPrice(first) ? pick : first;
  }

  FB.catalog = {
    init: function (bundle) {
      stores = []; bySlug = {}; itemIndex = [];
      var src = bundle || window.FB_MENUS || {};
      Object.keys(src).forEach(function (k) {
        var m = src[k];
        if (!m || !m.slug) return;
        decorate(m);
        stores.push(m);
        bySlug[m.slug] = m;
      });
      /* stable feed order, but not alphabetical — it should feel merchandised */
      stores.sort(function (a, b) { return FB.hash(b.slug + 'feed') - FB.hash(a.slug + 'feed'); });
      return stores.length;
    },

    all: function () { return stores; },
    count: function () { return stores.length; },
    itemCount: function () { return itemIndex.length; },
    get: function (slug) { return bySlug[slug] || null; },
    item: function (slug, itemId) {
      var s = bySlug[slug]; if (!s) return null;
      for (var i = 0; i < s.menu.length; i++) {
        var f = s.menu[i].items.filter(function (x) { return x.id === itemId; })[0];
        if (f) return f;
      }
      return null;
    },
    section: function (slug, secId) {
      var s = bySlug[slug]; if (!s) return null;
      return s.menu.filter(function (x) { return x.id === secId; })[0] || null;
    },

    categories: function () {
      var counts = {};
      stores.forEach(function (s) { (s.categories || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; }); });
      return Object.keys(FB.CAT_LABELS).filter(function (c) { return counts[c]; })
        .map(function (c) {
          return { slug: c, label: FB.CAT_LABELS[c], icon: FB.CAT_ICONS[c], img: FB.CAT_IMG(c), count: counts[c] };
        });
    },
    byCategory: function (cat) {
      if (!cat) return stores;
      return stores.filter(function (s) { return (s.categories || []).indexOf(cat) > -1; });
    },

    /* Photographed items make the best merchandising tiles. Pass a slug to stay
       inside one store — the cart's upsell rail used to take the first 20 of the
       global shuffle and filter, which is deterministically EMPTY for six of the
       twenty stores and fell through to advertising six other restaurants. */
    photoItems: function (limit, slug) {
      var out = itemIndex.filter(function (r) {
        return r.item.photoSrc && (!slug || r.store.slug === slug);
      });
      out = FB.shuffle(out, FB.seeded('photofeed' + (slug || '')));
      return limit ? out.slice(0, limit) : out;
    },

    search: function (q) {
      q = String(q || '').trim().toLowerCase();
      if (!q) return { stores: [], items: [], q: q };
      var st = stores.filter(function (s) {
        return (s.name + ' ' + s.cuisine + ' ' + (s.categories || []).join(' ') + ' ' + s.tagline).toLowerCase().indexOf(q) > -1;
      });
      /* rank: name hit > description hit > modifier-option hit. People search for
         "ranch" and mean the modifier, not a dish called Ranch. */
      var scored = [];
      itemIndex.forEach(function (r) {
        var name = r.item.name.toLowerCase();
        var desc = (r.item.desc || '').toLowerCase();
        var score = 0, via = null;
        if (name.indexOf(q) > -1) { score = 3; }
        else if (desc.indexOf(q) > -1) { score = 2; }
        else {
          var hit = null;
          (r.item.groups || []).some(function (g) {
            if (g.name.toLowerCase().indexOf(q) > -1) { hit = g.name; return true; }
            return g.options.some(function (o) {
              if (o.name.toLowerCase().indexOf(q) > -1) { hit = g.name + ': ' + o.name; return true; }
              return false;
            });
          });
          if (hit) { score = 1; via = hit; }
        }
        if (score) scored.push({ store: r.store, section: r.section, item: r.item, score: score, via: via });
      });
      scored.sort(function (a, b) { return b.score - a.score || a.item.price - b.item.price; });
      return { stores: st, items: scored.slice(0, 60), q: q };
    },

    sort: function (list, mode) {
      var a = list.slice();
      if (mode === 'rating') a.sort(function (x, y) { return y.rating - x.rating; });
      else if (mode === 'fast') a.sort(function (x, y) { return x.deliveryMin - y.deliveryMin; });
      else if (mode === 'cheap') a.sort(function (x, y) { return x.priceTier - y.priceTier || x.priceFrom - y.priceFrom; });
      else if (mode === 'near') a.sort(function (x, y) { return x.distanceMi - y.distanceMi; });
      else if (mode === 'desperation') a.sort(function (x, y) { return (y.recentOrders / (y.rating || 1)) - (x.recentOrders / (x.rating || 1)); });
      return a;
    },

    /* ---------- item pricing ---------- */
    /** sel = { groupId: [optionId, ...] } */
    optionsFor: function (item, sel) {
      var out = [];
      (item.groups || []).forEach(function (g) {
        (sel[g.id] || []).forEach(function (oid) {
          var o = g.options.filter(function (x) { return x.id === oid; })[0];
          if (o) out.push({ group: g, option: o });
        });
      });
      return out;
    },
    unitPrice: function (item, sel) {
      return FB.round2(item.price + FB.sum(FB.catalog.optionsFor(item, sel), function (r) { return r.option.price || 0; }));
    },
    /** default selection: first option of every required group, raised by Hunger */
    defaultSel: function (item, hunger) {
      var sel = {};
      (item.groups || []).forEach(function (g) {
        if (g.required) sel[g.id] = [hungerPick(g, hunger).id];
        else sel[g.id] = [];
      });
      return sel;
    },
    validate: function (item, sel) {
      var missing = [];
      (item.groups || []).forEach(function (g) {
        var n = (sel[g.id] || []).length;
        if (g.required && n < (g.min || 1)) missing.push(g);
      });
      return missing;
    },
    /* rough nutrition for the BODYMAX telemetry */
    itemLoad: function (item, sel, qty) {
      var opts = FB.catalog.optionsFor(item, sel);
      var extra = FB.sum(opts, function (r) { return (r.option.price || 0) * 26; });
      var cal = (item.calories || 800) + extra;
      var rnd = FB.seeded(item.id);
      return {
        calories: Math.round(cal * qty),
        sodium: Math.round(cal * (0.9 + rnd() * 1.4) * qty),          /* mg */
        grease: FB.round2(cal / 1000 * (0.6 + rnd() * 0.9) * qty),    /* "grease units" */
        ranch: FB.round2(FB.sum(opts, function (r) {
          return /ranch|sauce|dip|dressing|aioli|gravy|queso|drizzle/i.test(r.option.name) ? (r.option.price || 0) * 3.4 : 0;
        }) * qty),
      };
    },
  };
})(window.FB);
