/* FoodBang — cart */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var expanded = false;

  FB.screens.register('cart', {
    tab: 'home',
    hideCartBar: true,
    appbar: function (p) {
      var s = FB.catalog.get(p.slug);
      return '<div class="bar bar--border">' +
        '<button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
        '<h1 class="trunc1">' + FB.esc(s ? s.name : 'Cart') + '</h1>' +
        '<button class="iconbtn" data-clear aria-label="Clear cart">' + FB.icon('trash', 18) + '</button>' +
      '</div>';
    },
    render: function (p) {
      var s = FB.catalog.get(p.slug);
      var lines = FB.cart.lines(p.slug);
      if (!s || !lines.length) {
        return FB.C.empty({ title: 'This cart is empty', body: 'An empty cart still incurs no fees. This is the only configuration that does.', cta: 'Browse stores', go: 'home' });
      }

      var others = FB.cart.activeSlugs().filter(function (x) { return x !== p.slug; });
      var sub = FB.cart.subtotal(p.slug);
      /* the same per-cart checkout state checkout.js reads — this preview used to
         hardcode delivery, so a cart switched to Pickup on the store page quoted a
         total several dollars off from the one checkout would charge */
      var co = FB.cart.co(p.slug);
      var promoCode = co.promoCode ? FB.fees.checkPromo(co.promoCode, sub) : null;
      var calc = FB.fees.compute({
        subtotal: sub, lineCount: lines.length, store: s, mode: co.mode,
        express: co.express, scheduled: !!co.scheduled,
        tipPct: co.tipCustom != null ? null : co.tipPct, tipCustom: co.tipCustom,
        promo: promoCode,
        plus: FB.store.isPlus(), settings: FB.S().settings, distanceMi: s.distanceMi,
      });

      var h = '';
      if (others.length) {
        h += '<div class="cartswitch">' +
          '<span class="chip is-on">' + FB.esc(s.shortName || s.name) + ' · ' + FB.cart.count(p.slug) + '</span>' +
          others.map(function (o) {
            var os = FB.catalog.get(o);
            return '<button class="chip chip--outline" data-go="cart" data-params=\'{"slug":"' + o + '"}\'>' +
              FB.esc(os ? (os.shortName || os.name) : o) + ' · ' + FB.cart.count(o) + '</button>';
          }).join('') + '</div>';
      }

      h += '<div style="padding:12px 16px 4px;display:flex;align-items:center;gap:10px">' +
        '<img src="' + s.logoSrc + '" style="width:34px;height:34px;border-radius:9px" alt="" onerror="this.remove()">' +
        '<div style="flex:1"><b style="font:var(--t-body-m)">' + FB.esc(s.name) + '</b>' +
        '<div style="font:var(--t-cap);color:var(--ink-3)">' + FB.mins(s.deliveryMin, s.deliveryMax) + ' · ' + s.distanceMi.toFixed(1) + ' mi</div></div>' +
        '<button class="linkbtn" data-go="store" data-params=\'{"slug":"' + s.slug + '"}\'>Add items</button></div>';

      h += lines.map(function (l) {
        var opts = FB.cart.describe(p.slug, l);
        return '<div class="cartline" data-lid="' + l.lid + '">' +
          '<div class="cl-b"><b>' + FB.esc(l.name) + '</b>' +
            (opts ? '<span class="cl-o">' + FB.esc(opts) + '</span>' : '') +
            (l.note ? '<span class="cl-n">“' + FB.esc(l.note) + '”</span>' : '') +
            '<div class="cl-acts"><button data-edit="' + l.lid + '">Edit</button>' +
            '<button data-rm="' + l.lid + '" style="color:var(--bad)">Remove</button></div>' +
          '</div>' +
          '<div class="cl-r"><b>' + FB.money(l.unit * l.qty) + '</b>' +
            '<span class="stepper"><button data-dq="' + l.lid + '" data-d="-1" aria-label="One fewer ' + FB.attr(l.name) + '">' + FB.icon('minus', 14) + '</button>' +
            '<b style="min-width:24px">' + l.qty + '</b>' +
            '<button data-dq="' + l.lid + '" data-d="1" aria-label="One more ' + FB.attr(l.name) + '">' + FB.icon('plus', 14) + '</button></span></div>' +
        '</div>';
      }).join('');

      /* upsell — aggressiveness scales with the Hunger Level setting */
      var hunger = FB.S().settings.hungerLevel;
      var picks = FB.catalog.photoItems(6, s.slug);
      if (picks.length && !FB.S().settings.reduceUpsells) {
        h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
          FB.C.sectionHead(hunger >= 8 ? 'You are not finished' : 'People also added',
            hunger >= 8 ? 'Your Hunger Level is set to ' + hunger + '. We are acting accordingly.' : null) +
          '<div class="upsell">' + picks.map(function (r) {
            return '<button class="upcard pressable" data-item="' + r.item.id + '" data-slug="' + r.store.slug + '">' +
              '<img src="' + r.item.photoSrc + '" alt="" loading="lazy">' +
              '<b class="trunc2">' + FB.esc(r.item.name) + '</b>' +
              '<span>' + FB.money(r.item.price) + '</span></button>';
          }).join('') + '</div></div>';
      }

      h += '<div style="border-top:8px solid var(--surface-2);padding-top:10px">' +
        FB.C.sectionHead('Order total') +
        FB.C.receipt(calc, { collapsed: !expanded }) + '</div>';

      h += '<div class="fineprint">Totals are estimates until they are charged, at which point they are final. ' +
        'Fees are assessed at the time of order and re-assessed at the time of delivery. Differences are resolved in favour of the platform.</div>';

      h += '<div style="padding:0 16px 20px"><button class="btn btn--primary btn--lg btn--block btn--split" data-checkout>' +
        '<span>Go to checkout</span><span>' + FB.money(calc.total) + '</span></button></div>';

      return h;
    },

    mount: function (root, p) {
      FB.C.wireWhy(root);
      FB.on(root, 'click', '[data-expand-fees]', function () { expanded = !expanded; FB.nav.refresh(); });
      FB.on(root, 'click', '[data-dq]', function (e, t) {
        var l = FB.cart.lines(p.slug).filter(function (x) { return x.lid === t.dataset.dq; })[0];
        if (!l) return;
        FB.cart.update(p.slug, l.lid, { qty: l.qty + Number(t.dataset.d) });
        if (!FB.cart.lines(p.slug).length) FB.nav.back(); else FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-rm]', function (e, t) {
        FB.cart.remove(p.slug, t.dataset.rm);
        FB.toast('Removed. The Menu Digitization Surcharge for this item is non-refundable.');
        if (!FB.cart.lines(p.slug).length) FB.nav.back(); else FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-edit]', function (e, t) {
        var l = FB.cart.lines(p.slug).filter(function (x) { return x.lid === t.dataset.edit; })[0];
        if (l) FB.openItem(p.slug, l.itemId, l);
      });
      FB.on(root, 'click', '[data-checkout]', function () { FB.nav.go('checkout', { slug: p.slug }); });
      FB.on(document.getElementById('appbar'), 'click', '[data-clear]', function () {
        FB.confirm({
          title: 'Empty this cart?', danger: true, yes: 'Empty it', no: 'Keep it',
          body: 'Emptying a cart is free. Re-adding the same items later may be priced differently.',
        }).then(function (ok) { if (ok) { FB.cart.clear(p.slug); FB.nav.back(); } });
      });
    },
  });
})(window.FB);
