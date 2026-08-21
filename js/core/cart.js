/* FoodBang — cart. Carts are per-store; the app never merges them, which is
   also how the real thing works, and is also how you end up with four carts. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  function bucket(slug, create) {
    var st = FB.S();
    if (!st.cart[slug] && create) st.cart[slug] = { lines: [], updated: Date.now() };
    return st.cart[slug];
  }

  FB.cart = {
    lines: function (slug) { var b = bucket(slug); return b ? b.lines : []; },
    count: function (slug) {
      var st = FB.S();
      if (slug) return FB.sum(FB.cart.lines(slug), function (l) { return l.qty; });
      return FB.sum(Object.keys(st.cart), function (k) {
        return FB.sum(st.cart[k].lines, function (l) { return l.qty; });
      });
    },
    storeCount: function () {
      var st = FB.S();
      return Object.keys(st.cart).filter(function (k) { return st.cart[k].lines.length; }).length;
    },
    activeSlugs: function () {
      var st = FB.S();
      return Object.keys(st.cart).filter(function (k) { return st.cart[k].lines.length; })
        .sort(function (a, b) { return st.cart[b].updated - st.cart[a].updated; });
    },
    subtotal: function (slug) {
      return FB.round2(FB.sum(FB.cart.lines(slug), function (l) { return l.unit * l.qty; }));
    },

    add: function (slug, item, sel, qty, note) {
      qty = qty || 1;
      var unit = FB.catalog.unitPrice(item, sel);
      FB.store.set(function (st) {
        var b = bucket(slug, true);
        /* merge identical configurations, like a real cart */
        var key = JSON.stringify([item.id, sel, note || '']);
        var hit = b.lines.filter(function (l) { return l.key === key; })[0];
        if (hit) hit.qty += qty;
        else b.lines.push({ lid: FB.uid('l'), key: key, itemId: item.id, name: item.name, sel: FB.deep(sel), qty: qty, unit: unit, note: note || '' });
        b.updated = Date.now();
        return st;
      });
      return unit * qty;
    },
    update: function (slug, lid, patch) {
      FB.store.set(function (st) {
        var b = bucket(slug); if (!b) return st;
        var l = b.lines.filter(function (x) { return x.lid === lid; })[0];
        if (!l) return st;
        Object.keys(patch).forEach(function (k) { l[k] = patch[k]; });
        if (patch.sel) { var it = FB.catalog.item(slug, l.itemId); if (it) l.unit = FB.catalog.unitPrice(it, patch.sel); }
        if (l.qty <= 0) b.lines = b.lines.filter(function (x) { return x.lid !== lid; });
        b.updated = Date.now();
        if (!b.lines.length) delete st.cart[slug];
        return st;
      });
    },
    remove: function (slug, lid) { FB.cart.update(slug, lid, { qty: 0 }); },
    clear: function (slug) {
      FB.store.set(function (st) { delete st.cart[slug]; return st; });
    },
    clearAll: function () { FB.store.set(function (st) { st.cart = {}; return st; }); },

    /* Checkout state belongs to the CART, not to the checkout screen. The app keeps
       one cart per store and never merges them, so a delivery mode, a tip and a promo
       chosen against one store's basket must not follow you into another's. Living on
       the bucket, it also dies with the cart it was chosen for.
       The promo is stored as a CODE, never as a validated result: a code is only ever
       as valid as the current subtotal, and the subtotal moves. */
    CO_DEFAULTS: { mode: 'delivery', express: false, scheduled: null, tipPct: null, tipCustom: null, promoCode: null },
    co: function (slug) {
      var b = bucket(slug);
      var saved = (b && b.co) || {};
      var out = {};
      Object.keys(FB.cart.CO_DEFAULTS).forEach(function (k) {
        out[k] = saved[k] !== undefined ? saved[k] : FB.cart.CO_DEFAULTS[k];
      });
      return out;
    },
    setCo: function (slug, patch) {
      FB.store.set(function (st) {
        var b = bucket(slug, true);
        if (!b.co) b.co = {};
        Object.keys(patch).forEach(function (k) { b.co[k] = patch[k]; });
        return st;
      });
    },

    /* human-readable modifier summary for a line */
    describe: function (slug, l) {
      var it = FB.catalog.item(slug, l.itemId);
      if (!it) return '';
      return FB.catalog.optionsFor(it, l.sel).map(function (r) { return r.option.name; }).join(' · ');
    },
    lineCount: function (slug) { return FB.cart.lines(slug).length; },
  };
})(window.FB);
