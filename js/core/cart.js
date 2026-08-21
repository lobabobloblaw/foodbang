/* DoorGorge — cart. Carts are per-store; the app never merges them, which is
   also how the real thing works, and is also how you end up with four carts. */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  function bucket(slug, create) {
    var st = DG.S();
    if (!st.cart[slug] && create) st.cart[slug] = { lines: [], updated: Date.now() };
    return st.cart[slug];
  }

  DG.cart = {
    lines: function (slug) { var b = bucket(slug); return b ? b.lines : []; },
    count: function (slug) {
      var st = DG.S();
      if (slug) return DG.sum(DG.cart.lines(slug), function (l) { return l.qty; });
      return DG.sum(Object.keys(st.cart), function (k) {
        return DG.sum(st.cart[k].lines, function (l) { return l.qty; });
      });
    },
    storeCount: function () {
      var st = DG.S();
      return Object.keys(st.cart).filter(function (k) { return st.cart[k].lines.length; }).length;
    },
    activeSlugs: function () {
      var st = DG.S();
      return Object.keys(st.cart).filter(function (k) { return st.cart[k].lines.length; })
        .sort(function (a, b) { return st.cart[b].updated - st.cart[a].updated; });
    },
    subtotal: function (slug) {
      return DG.round2(DG.sum(DG.cart.lines(slug), function (l) { return l.unit * l.qty; }));
    },

    add: function (slug, item, sel, qty, note) {
      qty = qty || 1;
      var unit = DG.catalog.unitPrice(item, sel);
      DG.store.set(function (st) {
        var b = bucket(slug, true);
        /* merge identical configurations, like a real cart */
        var key = JSON.stringify([item.id, sel, note || '']);
        var hit = b.lines.filter(function (l) { return l.key === key; })[0];
        if (hit) hit.qty += qty;
        else b.lines.push({ lid: DG.uid('l'), key: key, itemId: item.id, name: item.name, sel: DG.deep(sel), qty: qty, unit: unit, note: note || '' });
        b.updated = Date.now();
        return st;
      });
      return unit * qty;
    },
    update: function (slug, lid, patch) {
      DG.store.set(function (st) {
        var b = bucket(slug); if (!b) return st;
        var l = b.lines.filter(function (x) { return x.lid === lid; })[0];
        if (!l) return st;
        Object.keys(patch).forEach(function (k) { l[k] = patch[k]; });
        if (patch.sel) { var it = DG.catalog.item(slug, l.itemId); if (it) l.unit = DG.catalog.unitPrice(it, patch.sel); }
        if (l.qty <= 0) b.lines = b.lines.filter(function (x) { return x.lid !== lid; });
        b.updated = Date.now();
        if (!b.lines.length) delete st.cart[slug];
        return st;
      });
    },
    remove: function (slug, lid) { DG.cart.update(slug, lid, { qty: 0 }); },
    clear: function (slug) {
      DG.store.set(function (st) { delete st.cart[slug]; return st; });
    },
    clearAll: function () { DG.store.set(function (st) { st.cart = {}; return st; }); },

    /* human-readable modifier summary for a line */
    describe: function (slug, l) {
      var it = DG.catalog.item(slug, l.itemId);
      if (!it) return '';
      return DG.catalog.optionsFor(it, l.sel).map(function (r) { return r.option.name; }).join(' · ');
    },
    lineCount: function (slug) { return DG.cart.lines(slug).length; },
  };
})(window.DG);
