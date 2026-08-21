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

      /* Read at render, never stamped: an item goes out at the local day boundary,
         and a cart left open across midnight was still selling it. Derived HERE,
         above the fee context, because the total below must price the basket the
         screen is telling you to arrive at — pricing the dead line too quoted a
         figure nothing could ever charge, which is the one thing this app's own
         rule says a screen may not do. */
      var dead = {};
      FB.cart.unsellable(p.slug).forEach(function (l) {
        var it = FB.catalog.item(p.slug, l.itemId);
        dead[l.lid] = it && it.scarce ? it.scarce : 'no longer on the menu';
      });
      var deadCount = Object.keys(dead).length;
      var sellable = lines.filter(function (l) { return !dead[l.lid]; });
      var sub = FB.round2(FB.sum(sellable, function (l) { return l.unit * l.qty; }));
      /* the same per-cart checkout state checkout.js reads — this preview used to
         hardcode delivery, so a cart switched to Pickup on the store page quoted a
         total several dollars off from the one checkout would charge */
      var co = FB.cart.co(p.slug);
      var promoCode = co.promoCode ? FB.fees.checkPromo(co.promoCode, sub, FB.S().promo.used) : null;
      var calc = FB.fees.compute({
        subtotal: sub, lineCount: sellable.length, store: s, mode: co.mode,
        /* FB.cart.slot, not co.scheduled: a closed store is scheduled whether or
           not you picked a time, and checkout charges for it either way */
        express: co.express, scheduled: !!FB.cart.slot(p.slug),
        tipPct: co.tipCustom != null ? null : co.tipPct, tipCustom: co.tipCustom,
        promo: promoCode,
        plus: FB.store.isPlus(), settings: FB.S().settings, distanceMi: s.distanceMi,
        /* threaded here too — a preview that omits a fee checkout charges is the
           exact regression the comment above this block records */
        standingTier: FB.S().standing.tier,
        scrip: FB.scrip.redeemable(),
        tosVersion: FB.tos.version(),
        storePromo: FB.catalog.storeOffer(s, sub, FB.store.isPlus()),
        /* identical to js/ui/checkout.js — see the note there */
        restockAlerts: FB.notifs.monitored().length,
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
        var out = dead[l.lid];
        return '<div class="cartline' + (out ? ' is-out' : '') + '" data-lid="' + l.lid + '">' +
          '<div class="cl-b"><b>' + FB.esc(l.name) + '</b>' +
            (out ? '<span class="cl-x">Unavailable today · ' + FB.esc(out) + '</span>' : '') +
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
            /* the same treatment dishTile gives Home's rail: an item struck through
               on the store page but sold at full price here reads as a bug */
            var out = !FB.catalog.available(r.item);
            return '<button class="upcard pressable' + (out ? ' is-out' : '') + '" data-item="' + r.item.id + '" data-slug="' + r.store.slug + '">' +
              '<img src="' + r.item.photoSrc + '" alt="" loading="lazy">' +
              '<b class="trunc2">' + FB.esc(r.item.name) + '</b>' +
              '<span>' + (out ? 'Unavailable' : FB.money(r.item.price)) + '</span></button>';
          }).join('') + '</div></div>';
      }

      h += '<div style="border-top:8px solid var(--surface-2);padding-top:10px">' +
        FB.C.sectionHead('Order total',
          deadCount ? 'Priced without the ' + FB.plural(deadCount, 'item') + ' the restaurant has stopped serving.' : null) +
        FB.C.receipt(calc, { collapsed: !expanded }) + '</div>';

      h += '<div class="fineprint">Totals are estimates until they are charged, at which point they are final. ' +
        'Fees are assessed at the time of order and re-assessed at the time of delivery. Differences are resolved in favour of the platform.</div>';

      h += '<div style="padding:0 16px 20px">' +
        (deadCount
          ? '<button class="btn btn--primary btn--lg btn--block" disabled>' +
              FB.plural(deadCount, 'item') + ' must be removed</button>' +
            '<p style="text-align:center;font:var(--t-cap);color:var(--ink-3);margin:10px 0 0">' +
            'The restaurant has stopped serving ' + (deadCount === 1 ? 'it' : 'them') + ' today. ' +
            'Removal is not compensated.</p>'
          : '<button class="btn btn--primary btn--lg btn--block btn--split" data-checkout>' +
              '<span>Go to checkout</span><span>' + FB.money(calc.total) + '</span></button>') +
        '</div>';

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
      /* The stepper next to this is deliberately instant — you tap + three times in
         a row and a real app answers optimistically. Removal is the one that asks. */
      FB.on(root, 'click', '[data-rm]', function (e, t) {
        var lid = t.dataset.rm;
        FB.busy(t.closest('.cartline') || t, 'cartRemove', function () {
          /* The write is unconditional — cancelling it would silently drop a removal
             the user tapped — but the NAVIGATION only happens if we are still on the
             screen that scheduled it, or a half-second delay pops a screen out from
             under whatever you moved to. */
          FB.cart.remove(p.slug, lid);
          var here = FB.nav.current();
          if (!here) return;
          if (here.name === 'cart' && here.params.slug === p.slug) {
            FB.toast('Removed. The Menu Digitization Surcharge for this item is non-refundable.');
            if (!FB.cart.lines(p.slug).length) FB.nav.back(); else FB.nav.refresh();
            return;
          }
          /* The write is unconditional — cancelling it would silently drop a removal
             the user tapped — but it must not navigate a screen the user has since
             left. It must still RESYNC one: a checkout that came from this cart is
             now quoting, and would place, an order the cart no longer holds.
             Only CHECKOUT is ejected, and only when the cart is empty. A store page
             renders perfectly well with no cart — that is the state you are in the
             moment you open one — so throwing the user to Home from it was the
             half-second delay popping a screen out from under them all over again,
             and nav.tab() cleared the stack so Back could not undo it. */
          if (here.params && here.params.slug === p.slug &&
              (here.name === 'checkout' || here.name === 'store')) {
            if (here.name === 'checkout' && !FB.cart.lines(p.slug).length) {
              FB.toast('That was the last item. The checkout has been withdrawn.');
              FB.nav.back();
            } else {
              FB.nav.refresh();
            }
          }
        });
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
