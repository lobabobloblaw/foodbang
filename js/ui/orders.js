/* DoorGorge — orders list + TRACKR live screen */
window.DG = window.DG || {};
(function (DG) {
  'use strict';

  /* ---------------- orders list ---------------- */
  DG.screens.register('orders', {
    tab: 'orders',
    appbar: function () { return '<div class="bar bar--border"><h1>Orders</h1>' +
      '<button class="iconbtn" data-go="bodymax" aria-label="BODYMAX">' + DG.icon('activity', 19) + '</button></div>'; },
    render: function () {
      var st = DG.S();
      if (!st.orders.length) {
        return DG.C.empty({ title: 'No orders yet', body: 'Once you order, this screen becomes permanent.', cta: 'Find something', go: 'home' });
      }
      var live = st.orders.filter(function (o) { return o.status !== 'delivered' && o.status !== 'cancelled'; });
      var past = st.orders.filter(function (o) { return o.status === 'delivered' || o.status === 'cancelled'; });
      var h = '';

      if (live.length) {
        h += DG.C.sectionHead('In progress');
        h += live.map(function (o) {
          var step = DG.tracker.STEPS[o.step];
          return '<button class="orderrow" data-go="track" data-params=\'{"id":"' + o.id + '"}\'>' +
            '<img src="' + o.logo + '" alt="" onerror="this.remove()">' +
            '<span class="or-b"><b>' + DG.esc(o.storeName) + '</b>' +
            '<span style="color:var(--gorge);font-weight:600">' + DG.esc(step.label) + ' · ' + DG.tracker.eta(o) + ' min</span>' +
            '<span class="or-items">' + DG.esc(o.lines.map(function (l) { return l.qty + '× ' + l.name; }).join(', ')) + '</span></span>' +
            '<span class="or-r"><b>' + DG.money(o.calc.total) + '</b>' + DG.icon('fwd', 15) + '</span></button>';
        }).join('');
      }

      if (past.length) {
        h += DG.C.sectionHead('Past orders', DG.plural(past.length, 'order') + ' · ' + DG.money(DG.sum(past, function (o) { return o.calc.total; })) + ' lifetime');
        h += past.map(function (o) {
          return '<button class="orderrow" data-go="track" data-params=\'{"id":"' + o.id + '"}\'>' +
            '<img src="' + o.logo + '" alt="" onerror="this.remove()">' +
            '<span class="or-b"><b>' + DG.esc(o.storeName) + '</b>' +
            '<span>' + DG.dayLabel(o.placedAt) + ' · ' + DG.clock(new Date(o.placedAt)) +
              (o.rated ? ' · you rated ' + o.rated + '★' : '') + '</span>' +
            '<span class="or-items">' + DG.esc(o.lines.map(function (l) { return l.qty + '× ' + l.name; }).join(', ')) + '</span></span>' +
            '<span class="or-r"><b>' + DG.money(o.calc.total) + '</b>' +
            '<span style="font:var(--t-cap);color:var(--ink-3)">' + DG.money(o.calc.nonFood) + ' fees</span></span></button>';
        }).join('');
      }

      h += '<div class="fineprint">Order history is retained indefinitely and is used to improve your experience, ' +
        'the experience of others, and the experience of DoorGorge™.</div>';
      return h;
    },
  });

  /* ---------------- tracker ---------------- */
  var off = null, offTick = null;

  DG.screens.register('track', {
    tab: 'orders',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar bar--border"><button class="iconbtn" data-back>' + DG.icon('back', 20) + '</button>' +
        '<h1>TRACKR™</h1><button class="iconbtn" data-help>' + DG.icon('help', 19) + '</button></div>';
    },
    render: function (p) {
      var o = DG.store.order(p.id);
      if (!o) return DG.C.empty({ title: 'Order not found', body: 'This order may have been reassigned.', cta: 'Orders', go: 'orders' });
      return body(o);
    },
    mount: function (root, p) {
      var o = DG.store.order(p.id);
      if (!o) return;
      wire(root, o);
      DG.tracker.placeCourier(root, o, DG.tracker.progress(o));
      offTick = DG.tracker.onTick(function () {
        var cur = DG.store.order(p.id);
        if (!cur) return;
        var sc = root.scrollTop;
        root.innerHTML = body(cur);
        root.scrollTop = sc;
        wire(root, cur);
        DG.tracker.placeCourier(root, cur, DG.tracker.progress(cur));
      });
      DG.on(document.getElementById('appbar'), 'click', '[data-help]', function () {
        DG.why('About TRACKR™', 'Estimated arrival is recalculated continuously and only ever revised in one direction. ' +
          'Location data is approximate, delayed, and occasionally aspirational.');
      });
    },
    unmount: function () { if (offTick) { offTick(); offTick = null; } },
  });

  function body(o) {
    var done = o.status === 'delivered';
    var eta = DG.tracker.eta(o);
    var step = DG.tracker.STEPS[o.step];
    var g = o.gorger;
    var h = '';

    /* map */
    h += '<div class="trk-map">' + DG.tracker.mapSvg(o, DG.tracker.progress(o)) + '</div>';

    /* eta */
    h += '<div class="trk-eta"><div class="te-k">' + (done ? 'DELIVERED' : 'ESTIMATED ARRIVAL') + '</div>' +
      '<h2>' + (done ? DG.clock(new Date(o.deliveredAt)) : eta + ' min') + '</h2>' +
      '<div class="te-s">' + DG.esc(step.label) + ' · ' + DG.esc(o.storeName) + '</div>' +
      (!done && o.etaDrift > 0 ? '<div class="te-drift">' + DG.icon('alert', 13) + 'Arrival revised later by ' + o.etaDrift + ' min since you ordered</div>' : '') +
      '</div>';

    /* progress */
    h += '<div class="trk-bar">' + DG.tracker.STEPS.slice(0, 5).map(function (s, i) {
      return '<i class="' + (i < o.step ? 'on' : i === o.step ? 'cur' : '') + '"></i>';
    }).join('') + '</div>';

    if (!done) {
      h += '<div style="padding:10px 16px 4px"><button class="btn btn--ghost btn--sm btn--block" data-boost>' +
        DG.icon('zap', 15) + 'Increase tip to reduce arrival by 4 min</button>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);margin:8px 0 0;line-height:1.45">' +
        'Arrival is not affected by tip. Tip is not affected by arrival. These facts are unrelated and are presented together.</p></div>';
    }

    /* gorger */
    h += '<div class="gorgercard"><img src="' + g.photo + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
      '<span class="gc-b"><b>' + DG.esc(g.name) + '</b>' +
      '<span>' + g.rating.toFixed(1) + '★ · ' + DG.plural(g.deliveries, 'delivery', 'deliveries') + ' · ' + DG.esc(g.vehicle) + '</span>' +
      '<span style="font:var(--t-cap);color:var(--ink-3);margin-top:3px;display:block">Employed ' + DG.plural(g.tenure, 'day') + '</span></span>' +
      '<span class="gc-a"><button class="iconbtn" data-msg aria-label="Message">' + DG.icon('phone', 18) + '</button></span></div>';

    /* feed */
    h += '<div class="trk-feed">' + o.events.map(function (e, i) {
      return '<div class="tf ' + (i === 0 && !done ? 'is-now' : i > 3 ? 'is-past' : '') + '">' +
        '<span class="tf-dot"></span><span class="tf-b"><b>' + DG.esc(e.text) + '</b>' +
        (e.sub ? '<span>' + DG.esc(e.sub) + '</span>' : '') +
        '<span>' + DG.clock(new Date(e.ts)) + '</span></span></div>';
    }).join('') + '</div>';

    /* delivered extras */
    if (done) {
      h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
        DG.C.sectionHead('Proof of delivery', 'Photographed by ' + g.name + '.') +
        '<div style="padding:0 16px 8px"><img src="assets/app/proof-delivery.webp" alt="Proof of delivery photo" ' +
        'style="width:100%;border-radius:14px;background:var(--surface-2)" onerror="this.remove()"></div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);padding:0 16px 14px;line-height:1.45">' +
        'Photograph taken at the delivery address, or at an address near it, or at an address.</p></div>';

      if (!o.rated) {
        h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
          DG.C.sectionHead('How was it?', 'Ratings are shared with the restaurant, the Gorger, and eleven partners.') +
          '<div style="display:flex;gap:8px;padding:4px 16px 14px;justify-content:center">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<button class="iconbtn" data-rate="' + n + '" style="width:46px;height:46px;color:var(--ink-3)">' + DG.icon('starFill', 26) + '</button>';
          }).join('') + '</div></div>';
      } else {
        h += '<div class="callout" style="margin-top:14px">' + DG.icon('checkFill', 17) +
          '<span>You rated this order ' + o.rated + '★. Your rating has been recorded and forwarded.</span></div>';
      }

      h += '<div style="padding:12px 16px 4px"><button class="btn btn--ghost btn--block" data-reorder>' +
        DG.icon('refresh', 17) + 'Reorder — prices may differ</button></div>';
    }

    /* receipt */
    h += '<div style="border-top:8px solid var(--surface-2);margin-top:14px;padding-top:6px">' +
      DG.C.sectionHead('Receipt', DG.dayLabel(o.placedAt) + ' · ' + DG.clock(new Date(o.placedAt))) +
      '<div style="padding:0 16px 8px">' + o.lines.map(function (l) {
        return '<div style="padding:6px 0;font:var(--t-sub);display:flex;gap:10px">' +
          '<span style="color:var(--ink-3);min-width:20px">' + l.qty + '×</span>' +
          '<span style="flex:1"><b style="font-weight:500">' + DG.esc(l.name) + '</b>' +
          (l.opts ? '<span style="display:block;color:var(--ink-3);font:var(--t-cap);margin-top:2px">' + DG.esc(l.opts) + '</span>' : '') + '</span>' +
          '<span class="tabnums">' + DG.money(l.unit * l.qty) + '</span></div>';
      }).join('') + '</div>' +
      '<div class="receipt">' +
        '<div class="rl"><span class="rl-l">Subtotal</span><span class="rl-r">' + DG.money(o.calc.subtotal) + '</span></div>' +
        o.calc.feeLines.map(function (l) {
          return '<div class="rl"><span class="rl-l">' + DG.esc(l.label) + '</span><span class="rl-r">' + (l.free ? 'Free' : DG.money(l.amount)) + '</span></div>';
        }).join('') +
        '<div class="rl"><span class="rl-l">Taxes &amp; Other Fees</span><span class="rl-r">' + DG.money(o.calc.tax) + '</span></div>' +
        '<div class="rl"><span class="rl-l">Gorger Tip</span><span class="rl-r">' + DG.money(o.calc.tip) + '</span></div>' +
        (o.calc.roundUp ? '<div class="rl"><span class="rl-l">Convenience Rounding™</span><span class="rl-r">' + DG.money(o.calc.roundUp) + '</span></div>' : '') +
        '<div class="rl rl--total"><span class="rl-l">Charged to ' + DG.esc(o.payment.brand) + ' ····' + DG.esc(o.payment.last4) + '</span>' +
        '<span class="rl-r">' + DG.money(o.calc.total) + '</span></div>' +
        '<div class="rl-note" style="padding-top:8px">' + DG.money(o.calc.nonFood) + ' of this order was not food (' +
        (o.calc.total > 0 ? DG.pct(o.calc.nonFood / o.calc.total * 100) : '0%') + ').</div>' +
      '</div></div>';

    h += '<div style="padding:14px 16px 8px"><button class="btn btn--ghost btn--sm btn--block" data-support>' +
      DG.icon('help', 15) + 'Get help with this order</button></div>';
    h += '<div class="fineprint">Order ' + DG.esc(o.id) + '. Retained indefinitely.</div>';
    return h;
  }

  function wire(root, o) {
    DG.on(root, 'click', '[data-boost]', function () {
      DG.sheet.open({
        title: 'Increase your tip',
        sub: 'This will not reduce arrival time.',
        html: '<div style="padding:0 16px 16px"><p style="font:var(--t-body);color:var(--ink-2);line-height:1.55">' +
          'Adding ' + DG.money(6) + ' to your tip displays a shorter estimate. The estimate is displayed to you. ' +
          'It is not transmitted to your Gorger, who is already driving.</p></div>' +
          '<div style="padding:0 16px 20px;display:flex;flex-direction:column;gap:8px">' +
          [3, 6, 12].map(function (n) {
            return '<button class="btn btn--ghost btn--block btn--split" data-tipup="' + n + '"><span>Add ' + DG.money(n) + '</span>' +
              '<span style="color:var(--gorge)">−' + Math.round(n / 1.5) + ' min displayed</span></button>';
          }).join('') + '</div>',
        onMount: function (b, h) {
          DG.on(b, 'click', '[data-tipup]', function (e, t) {
            var n = Number(t.dataset.tipup);
            DG.store.set(function (st) {
              var oo = st.orders.filter(function (x) { return x.id === o.id; })[0];
              if (oo) { oo.calc.tip = DG.round2(oo.calc.tip + n); oo.calc.total = DG.round2(oo.calc.total + n); oo.etaDrift += 1; }
              st.meta.lifetimeTips = DG.round2(st.meta.lifetimeTips + n);
              st.meta.lifetimeSpend = DG.round2(st.meta.lifetimeSpend + n);
              return st;
            });
            h.close();
            DG.toast('Tip increased by ' + DG.money(n) + '. Estimate updated. Arrival unchanged.');
            DG.nav.refresh();
          });
        },
      });
    });

    DG.on(root, 'click', '[data-msg]', function () { openChat(o); });

    DG.on(root, 'click', '[data-rate]', function (e, t) {
      var n = Number(t.dataset.rate);
      DG.store.set(function (st) {
        var oo = st.orders.filter(function (x) { return x.id === o.id; })[0];
        if (oo) oo.rated = n;
        return st;
      });
      DG.toast(n >= 4 ? 'Thank you. Your rating has been forwarded.' : 'Received. Your rating has been forwarded to the Gorger with your name attached.');
      DG.nav.refresh();
    });

    DG.on(root, 'click', '[data-reorder]', function () {
      var store = DG.catalog.get(o.slug);
      if (!store) { DG.toast('This store is no longer available in your region.'); return; }
      var added = 0;
      o.lines.forEach(function (l) {
        var it = DG.catalog.item(o.slug, l.itemId);
        if (it) { DG.cart.add(o.slug, it, l.sel, l.qty, l.note); added++; }
      });
      DG.toast(added ? 'Re-added ' + DG.plural(added, 'item') + '. Prices have been refreshed.' : 'Those items are no longer offered.');
      if (added) DG.nav.go('cart', { slug: o.slug });
    });

    DG.on(root, 'click', '[data-support]', function () {
      DG.sheet.open({
        title: 'Get help', sub: 'Support is available.',
        html: [
          ['Order is late', 'Late is measured against the current estimate, which is current.'],
          ['Item missing', 'Missing items are credited at base price, excluding required selections.'],
          ['Wrong order', 'You may keep the wrong order. You will be charged for both.'],
          ['Food quality', 'Quality complaints are forwarded to the restaurant and to no one else.'],
          ['Something else', 'Describe the issue in up to 40 characters.'],
        ].map(function (r) {
          return '<button class="mrow" data-sup><span class="mr-b"><b>' + r[0] + '</b><span>' + r[1] + '</span></span>' +
            '<span class="mr-r">' + DG.icon('fwd', 15) + '</span></button>';
        }).join(''),
        onMount: function (b, h) {
          DG.on(b, 'click', '[data-sup]', function () {
            h.close();
            DG.toast('A support case has been opened and closed.', { icon: 'checkFill' });
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
    DG.sheet.open({
      title: o.gorger.name, sub: 'Messages are monitored for quality.',
      html: '<div style="padding:8px 16px 16px;display:flex;flex-direction:column;gap:8px">' +
        CHAT.map(function (c) {
          var mine = c[0] === 'you';
          return '<div style="align-self:' + (mine ? 'flex-end' : 'flex-start') + ';max-width:78%;' +
            'background:' + (mine ? 'var(--gorge)' : 'var(--surface-2)') + ';color:' + (mine ? '#fff' : 'var(--ink)') + ';' +
            'padding:9px 13px;border-radius:16px;font:var(--t-body)">' + DG.esc(c[1]) + '</div>';
        }).join('') + '</div>',
      footer: '<input class="input" placeholder="Message…" data-chatin style="flex:1">' +
        '<button class="btn btn--primary" data-send style="width:56px;padding:0">' + DG.icon('fwd', 18) + '</button>',
      onMount: function (b, h) {
        DG.on(h.el, 'click', '[data-send]', function () {
          h.close();
          DG.toast('Message sent. Your Gorger is driving and cannot read it.');
        });
      },
    });
  }
})(window.DG);
