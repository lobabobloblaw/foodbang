/* DoorGorge — cart */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  var expanded = false;

  DG.screens.register('cart', {
    tab: 'home',
    hideCartBar: true,
    appbar: function (p) {
      var s = DG.catalog.get(p.slug);
      return '<div class="bar bar--border">' +
        '<button class="iconbtn" data-back aria-label="Back">' + DG.icon('back', 20) + '</button>' +
        '<h1 class="trunc1">' + DG.esc(s ? s.name : 'Cart') + '</h1>' +
        '<button class="iconbtn" data-clear aria-label="Clear cart">' + DG.icon('trash', 18) + '</button>' +
      '</div>';
    },
    render: function (p) {
      var s = DG.catalog.get(p.slug);
      var lines = DG.cart.lines(p.slug);
      if (!s || !lines.length) {
        return DG.C.empty({ title: 'This cart is empty', body: 'An empty cart still incurs no fees. This is the only configuration that does.', cta: 'Browse stores', go: 'home' });
      }

      var others = DG.cart.activeSlugs().filter(function (x) { return x !== p.slug; });
      var sub = DG.cart.subtotal(p.slug);
      var calc = DG.fees.compute({
        subtotal: sub, lineCount: lines.length, store: s, mode: 'delivery',
        plus: DG.store.isPlus(), settings: DG.S().settings, distanceMi: s.distanceMi,
      });

      var h = '';
      if (others.length) {
        h += '<div class="cartswitch">' +
          '<span class="chip is-on">' + DG.esc(s.shortName || s.name) + ' · ' + DG.cart.count(p.slug) + '</span>' +
          others.map(function (o) {
            var os = DG.catalog.get(o);
            return '<button class="chip chip--outline" data-go="cart" data-params=\'{"slug":"' + o + '"}\'>' +
              DG.esc(os ? (os.shortName || os.name) : o) + ' · ' + DG.cart.count(o) + '</button>';
          }).join('') + '</div>';
      }

      h += '<div style="padding:12px 16px 4px;display:flex;align-items:center;gap:10px">' +
        '<img src="' + s.logoSrc + '" style="width:34px;height:34px;border-radius:9px" alt="" onerror="this.remove()">' +
        '<div style="flex:1"><b style="font:var(--t-body-m)">' + DG.esc(s.name) + '</b>' +
        '<div style="font:var(--t-cap);color:var(--ink-3)">' + DG.mins(s.deliveryMin, s.deliveryMax) + ' · ' + s.distanceMi.toFixed(1) + ' mi</div></div>' +
        '<button class="linkbtn" data-go="store" data-params=\'{"slug":"' + s.slug + '"}\'>Add items</button></div>';

      h += lines.map(function (l) {
        var opts = DG.cart.describe(p.slug, l);
        return '<div class="cartline" data-lid="' + l.lid + '">' +
          '<div class="cl-b"><b>' + DG.esc(l.name) + '</b>' +
            (opts ? '<span class="cl-o">' + DG.esc(opts) + '</span>' : '') +
            (l.note ? '<span class="cl-n">“' + DG.esc(l.note) + '”</span>' : '') +
            '<div class="cl-acts"><button data-edit="' + l.lid + '">Edit</button>' +
            '<button data-rm="' + l.lid + '" style="color:var(--bad)">Remove</button></div>' +
          '</div>' +
          '<div class="cl-r"><b>' + DG.money(l.unit * l.qty) + '</b>' +
            '<span class="stepper"><button data-dq="' + l.lid + '" data-d="-1">' + DG.icon('minus', 14) + '</button>' +
            '<b style="min-width:24px">' + l.qty + '</b>' +
            '<button data-dq="' + l.lid + '" data-d="1">' + DG.icon('plus', 14) + '</button></span></div>' +
        '</div>';
      }).join('');

      /* upsell — aggressiveness scales with the Hunger Level setting */
      var hunger = DG.S().settings.hungerLevel;
      var picks = DG.catalog.photoItems(20).filter(function (r) { return r.store.slug === s.slug; }).slice(0, 6);
      if (!picks.length) picks = DG.catalog.photoItems(6);
      if (!DG.S().settings.reduceUpsells) {
        h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
          DG.C.sectionHead(hunger >= 8 ? 'You are not finished' : 'People also added',
            hunger >= 8 ? 'Your Hunger Level is set to ' + hunger + '. We are acting accordingly.' : null) +
          '<div class="upsell">' + picks.map(function (r) {
            return '<button class="upcard pressable" data-item="' + r.item.id + '" data-slug="' + r.store.slug + '">' +
              '<img src="' + r.item.photoSrc + '" alt="" loading="lazy">' +
              '<b class="trunc2">' + DG.esc(r.item.name) + '</b>' +
              '<span>' + DG.money(r.item.price) + '</span></button>';
          }).join('') + '</div></div>';
      }

      h += '<div style="border-top:8px solid var(--surface-2);padding-top:10px">' +
        DG.C.sectionHead('Order total') +
        DG.C.receipt(calc, { collapsed: !expanded }) + '</div>';

      h += '<div class="fineprint">Totals are estimates until they are charged, at which point they are final. ' +
        'Fees are assessed at the time of order and re-assessed at the time of delivery. Differences are resolved in favour of the platform.</div>';

      h += '<div style="padding:0 16px 20px"><button class="btn btn--primary btn--lg btn--block btn--split" data-checkout>' +
        '<span>Go to checkout</span><span>' + DG.money(calc.total) + '</span></button></div>';

      return h;
    },

    mount: function (root, p) {
      DG.C.wireWhy(root);
      DG.on(root, 'click', '[data-expand-fees]', function () { expanded = !expanded; DG.nav.refresh(); });
      DG.on(root, 'click', '[data-dq]', function (e, t) {
        var l = DG.cart.lines(p.slug).filter(function (x) { return x.lid === t.dataset.dq; })[0];
        if (!l) return;
        DG.cart.update(p.slug, l.lid, { qty: l.qty + Number(t.dataset.d) });
        if (!DG.cart.lines(p.slug).length) DG.nav.back(); else DG.nav.refresh();
      });
      DG.on(root, 'click', '[data-rm]', function (e, t) {
        DG.cart.remove(p.slug, t.dataset.rm);
        DG.toast('Removed. The Menu Digitization Surcharge for this item is non-refundable.');
        if (!DG.cart.lines(p.slug).length) DG.nav.back(); else DG.nav.refresh();
      });
      DG.on(root, 'click', '[data-edit]', function (e, t) {
        var l = DG.cart.lines(p.slug).filter(function (x) { return x.lid === t.dataset.edit; })[0];
        if (l) DG.openItem(p.slug, l.itemId, l);
      });
      DG.on(root, 'click', '[data-checkout]', function () { DG.nav.go('checkout', { slug: p.slug }); });
      DG.on(document.getElementById('appbar'), 'click', '[data-clear]', function () {
        DG.confirm({
          title: 'Empty this cart?', danger: true, yes: 'Empty it', no: 'Keep it',
          body: 'Emptying a cart is free. Re-adding the same items later may be priced differently.',
        }).then(function (ok) { if (ok) { DG.cart.clear(p.slug); DG.nav.back(); } });
      });
    },
  });
})(window.DG);
