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

  /* ---------- scheduling ----------
     The times a store will actually take an order for. Generated HERE rather than
     in the schedule sheet, because the sheet built them from wall-clock arithmetic
     alone — FB.clockIn(deliveryMax + 45n) — and never asked whether the store was
     open at the moment it was offering. Swept over a day, 38% of the rows it put up
     were at times the store was shut, and picking one CLEARED the forced hold the
     app had just computed for that store being closed.

     Absolute timestamps, never clock strings. A clock string cannot say which day
     it is on, which is how every row came to be labelled "Today" including the ones
     that landed tomorrow. The strings survive only as the stored `co.scheduled`
     value and as display. */
  var SLOT_GAP_MIN = 45;        /* the spacing the sheet has always offered */
  var SLOT_COUNT = 8;           /* how many beyond the opening row */
  var SLOT_HORIZON_MS = 48 * 3600000;

  function genSlots(s, now) {
    var out = [];
    if (!s) return out;
    var t;
    if (FB.catalog.isOpen(s, now)) {
      /* Floored to the whole minute, which is the grid FB.nextAtMinute answers on.
         Walked from a raw `now` the generated slots carried the current seconds, so
         the in-force slot — always :00 — could never be found among them, was
         spliced in as an extra, and the sheet drew the picked time TWICE: one row
         checked, one inert, with the same label and the same data-slot. */
      t = Math.floor((now + s.deliveryMax * 60000) / 60000) * 60000;
    } else {
      /* a shut store's first offer is its own opening time — the one the checkout
         row forces onto it — and the rest are walked forward from there */
      var opens = FB.nextAtMinute(FB.minsOfDay(s.opensAt), now);
      if (opens == null) return out;
      out.push(opens);
      t = opens;
    }
    /* Walk rather than map: skipping a closed hour has to be able to step OVER a
       fourteen-hour overnight closure and keep counting, or a store closing in
       twenty minutes has nothing to offer at all. Bounded by the horizon, so the
       loop is at most 48h / 45min iterations. */
    var want = out.length + SLOT_COUNT;
    var end = now + SLOT_HORIZON_MS;
    while (out.length < want && t <= end) {
      t += SLOT_GAP_MIN * 60000;
      if (FB.catalog.isOpen(s, t)) out.push(t);
    }
    return out;
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
        /* Merge, exactly as `add` does. Editing a line onto a configuration another
           line already held left two lines sharing one key: two visually identical
           rows with independent steppers, a doubled per-line surcharge, and a later
           `add` of that configuration merging into whichever matched first and so
           splitting the quantity across them. `add` merges because a cart is a set of
           configurations; how a line REACHED one cannot change that. */
        if (l.qty > 0 && l.key) {
          var twin = b.lines.filter(function (x) { return x.lid !== lid && x.key === l.key; })[0];
          if (twin) {
            twin.qty += l.qty;
            b.lines = b.lines.filter(function (x) { return x.lid !== lid; });
            l = twin;
          }
        }
        if (l.qty <= 0) b.lines = b.lines.filter(function (x) { return x.lid !== l.lid; });
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
    /* The slot an order will actually be scheduled for: the one you chose, or the
       store's opening time if it is shut. DERIVED, never written — co.scheduled is
       a clock STRING that renders as 'Scheduled · ' + itself.

       It lives here, in core, because BOTH compute call sites need it and putting
       it in either screen is how it diverged: checkout forced a slot for a closed
       store and the cart preview did not, so a cart quoted $60.00 and the checkout
       one tap later said $65.00. The comment above CO_DEFAULTS records the same
       drift happening once before, with `mode`. */
    slot: function (slug, at) {
      var now = at || Date.now();
      var s = FB.catalog.get(slug);
      if (!s) return null;
      var co = FB.cart.co(slug);
      if (co.scheduled) {
        /* Re-checked against the clock on every read, exactly as the promo code is.
           Stored unchecked, a cart parked overnight quoted "Scheduled · 11:30 AM" at
           noon the next day, charged the coordination fee for a time that had already
           gone, resolved thirty-five hours forward in the tracker, and showed no row
           selected in the sheet — a state with no way back out of it. */
        var t = FB.nextAtMinute(FB.minsOfDay(co.scheduled), now);
        var gen = genSlots(s, now);
        var horizon = gen.length ? gen[gen.length - 1] : 0;
        if (t != null && t <= horizon && FB.catalog.isOpen(s, t)) return co.scheduled;
        /* fall through: the clock walked past it, so it is not a slot any more */
      }
      return FB.catalog.isOpen(s, now) ? null : s.opensAt;
    },

    /* The lines this cart can no longer sell. Scarcity is keyed on the item and the
       DAY, so a cart carried across midnight can hold food the store page is already
       striking through — and the sold-out gate only ever covered the item sheet and
       reorder, never the cart or checkout. Both screens read THIS, for the same
       reason `slot` lives here: two screens deciding it separately is how they come
       to disagree.

       A line whose item has left the catalog entirely counts as unsellable too —
       unitPrice and describe cannot resolve it either. */
    unsellable: function (slug, at) {
      return FB.cart.lines(slug).filter(function (l) {
        var it = FB.catalog.item(slug, l.itemId);
        return !it || !FB.catalog.available(it, at);
      });
    },

    /** the absolute moment the slot in force lands on, or null for Standard */
    slotAt: function (slug, at) {
      var now = at || Date.now();
      var cur = FB.cart.slot(slug, now);
      return cur ? FB.nextAtMinute(FB.minsOfDay(cur), now) : null;
    },

    /** every slot the store will take, as { at, label }, the one in force included */
    slotOptions: function (slug, at) {
      var now = at || Date.now();
      var s = FB.catalog.get(slug);
      if (!s) return [];
      var out = genSlots(s, now);
      /* The generated set is recomputed from the clock on every open, so a slot
         picked sixty seconds ago is no longer among them and the radio group came up
         with nothing checked at all — not even Standard, because a slot was in force.
         Splice it back into chronological position. */
      var cur = FB.cart.slotAt(slug, now);
      if (cur != null && out.indexOf(cur) < 0) {
        var i = 0;
        while (i < out.length && out[i] < cur) i++;
        out.splice(i, 0, cur);
      }
      /* No dedupe here on purpose. The generated walk is minute-aligned and spans at
         most 20.3 hours across all twenty stores, so two rows cannot carry the same
         clock label — and smoke.cjs asserts exactly that on every sheet it sweeps.
         A silent filter here would turn a future SLOT_COUNT or hours change into a
         quietly dropped row instead of a red test. */
      return out.map(function (t) { return { at: t, label: FB.clock(new Date(t)) }; });
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
