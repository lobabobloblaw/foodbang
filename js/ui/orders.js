/* FoodBang — orders list + TRACKR live screen */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* ---------------- orders list ---------------- */
  FB.screens.register('orders', {
    tab: 'orders',
    appbar: function () { return '<div class="bar bar--border"><h1>Orders</h1>' +
      '<button class="iconbtn" data-go="bodymax" aria-label="BODYMAX">' + FB.icon('activity', 19) + '</button></div>'; },
    render: function () {
      var st = FB.S();
      if (!st.orders.length) {
        return FB.C.empty({ title: 'No orders yet', body: 'Once you order, this screen becomes permanent.', cta: 'Find something', go: 'home' });
      }
      var live = st.orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
      var past = st.orders.filter(function (o) { return o.status === 'delivered' || o.status === 'cancelled'; });
      var h = '';

      if (live.length) {
        h += FB.C.sectionHead('In progress');
        h += live.map(function (o) {
          var step = FB.tracker.STEPS[o.step];
          return '<button class="orderrow" data-go="track" data-params=\'{"id":"' + o.id + '"}\'>' +
            '<img src="' + o.logo + '" alt="" onerror="this.remove()">' +
            '<span class="or-b"><b>' + FB.esc(o.storeName) + '</b>' +
            '<span style="color:var(--fb);font-weight:600">' + FB.esc(step.label) + ' · ' + FB.tracker.eta(o) + ' min</span>' +
            '<span class="or-items">' + FB.esc(o.lines.map(function (l) { return l.qty + '× ' + l.name; }).join(', ')) + '</span></span>' +
            '<span class="or-r"><b>' + FB.money(o.calc.total) + '</b>' + FB.icon('fwd', 15) + '</span></button>';
        }).join('');
      }

      if (past.length) {
        h += FB.C.sectionHead('Past orders', FB.plural(past.length, 'order') + ' · ' + FB.money(FB.sum(past, function (o) { return o.calc.total; })) + ' lifetime');
        h += past.map(function (o) {
          return '<button class="orderrow" data-go="track" data-params=\'{"id":"' + o.id + '"}\'>' +
            '<img src="' + o.logo + '" alt="" onerror="this.remove()">' +
            '<span class="or-b"><b>' + FB.esc(o.storeName) + '</b>' +
            '<span>' + FB.dayLabel(o.placedAt) + ' · ' + FB.clock(new Date(o.placedAt)) +
              (o.rated ? ' · you rated ' + o.rated + '★' : '') + '</span>' +
            '<span class="or-items">' + FB.esc(o.lines.map(function (l) { return l.qty + '× ' + l.name; }).join(', ')) + '</span></span>' +
            '<span class="or-r"><b>' + FB.money(o.calc.total) + '</b>' +
            '<span style="font:var(--t-cap);color:var(--ink-3)">' + FB.money(o.calc.nonFood) + ' fees</span></span></button>';
        }).join('');
      }

      h += '<div class="fineprint">Order history is retained indefinitely and is used to improve your experience, ' +
        'the experience of others, and the experience of FoodBang™.</div>';
      return h;
    },
  });

  /* ---------------- tracker ---------------- */
  var off = null, offTick = null;

  FB.screens.register('track', {
    tab: 'orders',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar bar--border"><button class="iconbtn" data-back>' + FB.icon('back', 20) + '</button>' +
        '<h1>TRACKR™</h1><button class="iconbtn" data-help>' + FB.icon('help', 19) + '</button></div>';
    },
    render: function (p) {
      var o = FB.store.order(p.id);
      if (!o) return FB.C.empty({ title: 'Order not found', body: 'This order may have been reassigned.', cta: 'Orders', go: 'orders' });
      return body(o);
    },
    mount: function (root, p) {
      var o = FB.store.order(p.id);
      if (!o) return;
      wire(root, o);
      FB.tracker.placeCourier(root, o, FB.tracker.progress(o));
      offTick = FB.tracker.onTick(function () {
        var cur = FB.store.order(p.id);
        if (!cur) return;
        var sc = root.scrollTop;
        root.innerHTML = body(cur);
        root.scrollTop = sc;
        wire(root, cur);
        FB.tracker.placeCourier(root, cur, FB.tracker.progress(cur));
      });
      FB.on(document.getElementById('appbar'), 'click', '[data-help]', function () {
        FB.why('About TRACKR™', 'Estimated arrival is recalculated continuously and only ever revised in one direction. ' +
          'Location data is approximate, delayed, and occasionally aspirational.');
      });
    },
    unmount: function () { if (offTick) { offTick(); offTick = null; } },
  });

  function body(o) {
    var done = o.status === 'delivered';
    var eta = FB.tracker.eta(o);
    var step = FB.tracker.STEPS[o.step];
    var g = o.slinger;
    var h = '';

    /* map */
    h += '<div class="trk-map">' + FB.tracker.mapSvg(o, FB.tracker.progress(o)) + '</div>';

    /* eta */
    h += '<div class="trk-eta"><div class="te-k">' + (done ? 'DELIVERED' : 'ESTIMATED ARRIVAL') + '</div>' +
      '<h2>' + (done ? FB.clock(new Date(o.deliveredAt)) : eta + ' min') + '</h2>' +
      '<div class="te-s">' + FB.esc(step.label) + ' · ' + FB.esc(o.storeName) + '</div>' +
      (!done && o.etaDrift > 0 ? '<div class="te-drift">' + FB.icon('alert', 13) + 'Arrival revised later by ' + o.etaDrift + ' min since you ordered</div>' : '') +
      '</div>';

    /* progress */
    h += '<div class="trk-bar">' + FB.tracker.STEPS.slice(0, 5).map(function (s, i) {
      return '<i class="' + (i < o.step ? 'on' : i === o.step ? 'cur' : '') + '"></i>';
    }).join('') + '</div>';

    if (!done) {
      h += '<div style="padding:10px 16px 4px"><button class="btn btn--ghost btn--sm btn--block" data-boost>' +
        FB.icon('zap', 15) + 'Increase tip to reduce arrival by 4 min</button>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);margin:8px 0 0;line-height:1.45">' +
        'Arrival is not affected by tip. Tip is not affected by arrival. These facts are unrelated and are presented together.</p></div>';
    }

    /* slinger */
    h += '<div class="slingercard"><img src="' + g.photo + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="gc-b"><b>' + FB.esc(g.name) + '</b>' +
      '<span>' + g.rating.toFixed(1) + '★ · ' + FB.plural(g.deliveries, 'delivery', 'deliveries') + ' · ' + FB.esc(g.vehicle) + '</span>' +
      '<span style="font:var(--t-cap);color:var(--ink-3);margin-top:3px;display:block">Employed ' + FB.plural(g.tenure, 'day') + '</span></span>' +
      '<span class="gc-a"><button class="iconbtn" data-msg aria-label="Message">' + FB.icon('phone', 18) + '</button></span></div>';

    /* feed */
    h += '<div class="trk-feed">' + o.events.map(function (e, i) {
      return '<div class="tf ' + (i === 0 && !done ? 'is-now' : i > 3 ? 'is-past' : '') + '">' +
        '<span class="tf-dot"></span><span class="tf-b"><b>' + FB.esc(e.text) + '</b>' +
        (e.sub ? '<span>' + FB.esc(e.sub) + '</span>' : '') +
        '<span>' + FB.clock(new Date(e.ts)) + '</span></span></div>';
    }).join('') + '</div>';

    /* delivered extras */
    if (done) {
      h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
        FB.C.sectionHead('Proof of delivery', 'Photographed by ' + g.name + '.') +
        '<div style="padding:0 16px 8px"><img src="assets/app/proof-delivery.webp" alt="Proof of delivery photo" ' +
        'style="width:100%;border-radius:14px;background:var(--surface-2)" onerror="this.remove()"></div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);padding:0 16px 14px;line-height:1.45">' +
        'Photograph taken at the delivery address, or at an address near it, or at an address.</p></div>';

      if (!o.rated) {
        h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
          FB.C.sectionHead('How was it?', 'Ratings are shared with the restaurant, the Slinger, and eleven partners.') +
          '<div style="display:flex;gap:8px;padding:4px 16px 14px;justify-content:center">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<button class="iconbtn" data-rate="' + n + '" style="width:46px;height:46px;color:var(--ink-3)">' + FB.icon('starFill', 26) + '</button>';
          }).join('') + '</div></div>';
      } else {
        h += '<div class="callout" style="margin-top:14px">' + FB.icon('checkFill', 17) +
          '<span>You rated this order ' + o.rated + '★. Your rating has been recorded and forwarded.</span></div>';
      }

      h += '<div style="padding:12px 16px 4px"><button class="btn btn--ghost btn--block" data-reorder>' +
        FB.icon('refresh', 17) + 'Reorder — prices may differ</button></div>';
    }

    /* receipt */
    h += '<div style="border-top:8px solid var(--surface-2);margin-top:14px;padding-top:6px">' +
      FB.C.sectionHead('Receipt', FB.dayLabel(o.placedAt) + ' · ' + FB.clock(new Date(o.placedAt))) +
      '<div style="padding:0 16px 8px">' + o.lines.map(function (l) {
        return '<div style="padding:6px 0;font:var(--t-sub);display:flex;gap:10px">' +
          '<span style="color:var(--ink-3);min-width:20px">' + l.qty + '×</span>' +
          '<span style="flex:1"><b style="font-weight:500">' + FB.esc(l.name) + '</b>' +
          (l.opts ? '<span style="display:block;color:var(--ink-3);font:var(--t-cap);margin-top:2px">' + FB.esc(l.opts) + '</span>' : '') + '</span>' +
          '<span class="tabnums">' + FB.money(l.unit * l.qty) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="receipt">' +
        '<div class="rl"><span class="rl-l">Subtotal</span><span class="rl-r">' + FB.money(o.calc.subtotal) + '</span></div>' +
        o.calc.feeLines.map(function (l) {
          return '<div class="rl"><span class="rl-l">' + FB.esc(l.label) + '</span><span class="rl-r">' + (l.free ? 'Free' : FB.money(l.amount)) + '</span></div>';
        }).join('') +
        '<div class="rl"><span class="rl-l">Taxes &amp; Other Fees</span><span class="rl-r">' + FB.money(o.calc.tax) + '</span></div>' +
        '<div class="rl"><span class="rl-l">Slinger Tip</span><span class="rl-r">' + FB.money(o.calc.tip) + '</span></div>' +
        (o.calc.roundUp ? '<div class="rl"><span class="rl-l">Convenience Rounding™</span><span class="rl-r">' + FB.money(o.calc.roundUp) + '</span></div>' : '') +
        '<div class="rl rl--total"><span class="rl-l">Charged to ' + FB.esc(o.payment.brand) + ' ····' + FB.esc(o.payment.last4) + '</span>' +
        '<span class="rl-r">' + FB.money(o.calc.total) + '</span></div>' +
        '<div class="rl-note" style="padding-top:8px">' + FB.money(o.calc.nonFood) + ' of this order was not food (' +
        (o.calc.total > 0 ? FB.pct(o.calc.nonFood / o.calc.total * 100) : '0%') + ').</div>' +
      '</div></div>';

    h += '<div style="padding:14px 16px 8px"><button class="btn btn--ghost btn--sm btn--block" data-support>' +
      FB.icon('help', 15) + 'Get help with this order</button></div>';
    h += '<div class="fineprint">Order ' + FB.esc(o.id) + '. Retained indefinitely.</div>';
    return h;
  }

  function wire(root, o) {
    FB.on(root, 'click', '[data-boost]', function () {
      FB.sheet.open({
        title: 'Increase your tip',
        sub: 'This will not reduce arrival time.',
        html: '<div style="padding:0 16px 16px"><p style="font:var(--t-body);color:var(--ink-2);line-height:1.55">' +
          'Adding ' + FB.money(6) + ' to your tip displays a shorter estimate. The estimate is displayed to you. ' +
          'It is not transmitted to your Slinger, who is already driving.</p></div>' +
          '<div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:8px">' +
          [3, 6, 12].map(function (n) {
            return '<button class="btn btn--ghost btn--block btn--split" data-tipup="' + n + '"><span>Add ' + FB.money(n) + '</span>' +
              '<span style="color:var(--fb)">−' + Math.round(n / 1.5) + ' min displayed</span></button>';
          }).join('') + '</div>',
        onMount: function (b, h) {
          FB.on(b, 'click', '[data-tipup]', function (e, t) {
            var n = Number(t.dataset.tipup);
            FB.store.set(function (st) {
              var oo = st.orders.filter(function (x) { return x.id === o.id; })[0];
              if (oo) { oo.calc.tip = FB.round2(oo.calc.tip + n); oo.calc.total = FB.round2(oo.calc.total + n); oo.etaDrift += 1; }
              st.meta.lifetimeTips = FB.round2(st.meta.lifetimeTips + n);
              st.meta.lifetimeSpend = FB.round2(st.meta.lifetimeSpend + n);
              return st;
            });
            h.close();
            FB.toast('Tip increased by ' + FB.money(n) + '. Estimate updated. Arrival unchanged.');
            FB.nav.refresh();
          });
        },
      });
    });

    FB.on(root, 'click', '[data-msg]', function () { openChat(o); });

    FB.on(root, 'click', '[data-rate]', function (e, t) {
      var n = Number(t.dataset.rate);
      FB.store.set(function (st) {
        var oo = st.orders.filter(function (x) { return x.id === o.id; })[0];
        if (oo) oo.rated = n;
        return st;
      });
      FB.toast(n >= 4 ? 'Thank you. Your rating has been forwarded.' : 'Received. Your rating has been forwarded to the Slinger with your name attached.');
      FB.nav.refresh();
    });

    FB.on(root, 'click', '[data-reorder]', function () {
      var store = FB.catalog.get(o.slug);
      if (!store) { FB.toast('This store is no longer available in your region.'); return; }
      var added = 0;
      o.lines.forEach(function (l) {
        var it = FB.catalog.item(o.slug, l.itemId);
        if (it) { FB.cart.add(o.slug, it, l.sel, l.qty, l.note); added++; }
      });
      FB.toast(added ? 'Re-added ' + FB.plural(added, 'item') + '. Prices have been refreshed.' : 'Those items are no longer offered.');
      if (added) FB.nav.go('cart', { slug: o.slug });
    });

    FB.on(root, 'click', '[data-support]', function () {
      FB.sheet.open({
        title: 'Get help', sub: 'Support is available.',
        html: [
          ['Order is late', 'Late is measured against the current estimate, which is current.'],
          ['Item missing', 'Missing items are credited at base price, excluding required selections.'],
          ['Wrong order', 'You may keep the wrong order. You will be charged for both.'],
          ['Food quality', 'Quality complaints are forwarded to the restaurant and to no one else.'],
          ['Something else', 'Describe the issue in up to 40 characters.'],
        ].map(function (r) {
          return '<button class="mrow" data-sup><span class="mr-b"><b>' + r[0] + '</b><span>' + r[1] + '</span></span>' +
            '<span class="mr-r">' + FB.icon('fwd', 15) + '</span></button>';
        }).join(''),
        onMount: function (b, h) {
          FB.on(b, 'click', '[data-sup]', function () {
            h.close();
            FB.toast('A support case has been opened and closed.', { icon: 'checkFill' });
          });
        },
      });
    });
  }

  var CHAT = [
    ['them', 'on my way'],
    ['them', 'is it the blue house'],
    ['you', 'no'],
    ['them', 'ok'],
    ['them', 'i am at a blue house'],
  ];
  function openChat(o) {
    FB.sheet.open({
      title: o.slinger.name, sub: 'Messages are monitored for quality.',
      html: '<div style="padding:8px 16px 16px;display:flex;flex-direction:column;gap:8px">' +
        CHAT.map(function (c) {
          var mine = c[0] === 'you';
          return '<div style="align-self:' + (mine ? 'flex-end' : 'flex-start') + ';max-width:78%;' +
            'background:' + (mine ? 'var(--fb)' : 'var(--surface-2)') + ';color:' + (mine ? '#fff' : 'var(--ink)') + ';' +
            'padding:9px 13px;border-radius:16px;font:var(--t-body)">' + FB.esc(c[1]) + '</div>';
        }).join('') + '</div>',
      footer: '<input class="input" placeholder="Message…" data-chatin style="flex:1">' +
        '<button class="btn btn--primary" data-send style="width:56px;padding:0">' + FB.icon('fwd', 18) + '</button>',
      onMount: function (b, h) {
        FB.on(h.el, 'click', '[data-send]', function () {
          h.close();
          FB.toast('Message sent. Your Slinger is driving and cannot read it.');
        });
      },
    });
  }
})(window.FB);
