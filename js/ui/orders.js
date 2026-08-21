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
          var step = FB.tracker.steps(o)[o.step];
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
      return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
        '<h1>TRACKR™</h1><button class="iconbtn" data-help aria-label="About TRACKR">' + FB.icon('help', 19) + '</button></div>';
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
      if (offTick) { offTick(); offTick = null; }
      var wasDone = o.status === 'delivered';
      /* aria-live fires on every write, not on every change. Rewriting the ETA block
         on all ~20 ticks made a screen reader interrupt and re-read the whole arrival
         summary every few seconds; only write when the markup actually differs. */
      var lastEta = etaBlock(o), lastBar = barBlock(o), lastFeed = feedBlock(o);
      var lastStatus = o.status;
      offTick = FB.tracker.onTick(function () {
        var cur = FB.store.order(p.id);
        if (!cur) return;
        /* the ticker is global and outlives this screen; never repaint #view
           for an order the user has navigated away from */
        var now = FB.nav.current();
        if (!now || now.name !== 'track' || now.params.id !== p.id) return;

        var done = cur.status === 'delivered';
        if (done !== wasDone) {
          /* delivery changes the SHAPE of the screen — proof photo, rating stars and
             reorder appear, the tip-boost button goes — so this one tick rebuilds */
          wasDone = done;
          var sc = root.scrollTop;
          root.innerHTML = body(cur);
          root.scrollTop = sc;
          /* deliberately NOT re-wiring: wire() delegates on `root` itself, which is
             untouched by the innerHTML above, and every handler re-reads the order
             from state. Calling it again bound a second copy of each listener, so
             one tap on Reorder added the whole order to the cart twice. */
        } else {
          /* Patch the three fragments that moved. Rebuilding #view every 2-5s
             re-parsed the whole map, re-bound every listener and blew away keyboard
             focus; a screen reader got no announcement out of any of it. */
          var nextEta = etaBlock(cur), nextBar = barBlock(cur), nextFeed = feedBlock(cur);
          var eta = root.querySelector('.trk-eta');
          if (eta && nextEta !== lastEta) { eta.innerHTML = nextEta; lastEta = nextEta; }
          var bar = root.querySelector('.trk-bar');
          if (bar && nextBar !== lastBar) { bar.innerHTML = nextBar; lastBar = nextBar; }
          var feed = root.querySelector('.trk-feed');
          if (feed && nextFeed !== lastFeed) { feed.innerHTML = nextFeed; lastFeed = nextFeed; }
        }
        /* one announcement per step, not one per second */
        if (cur.status !== lastStatus) {
          lastStatus = cur.status;
          var say = root.querySelector('[data-trk-say]');
          if (say) say.textContent = sayStep(cur);
        }
        FB.tracker.placeCourier(root, cur, FB.tracker.progress(cur));
      });
      FB.on(document.getElementById('appbar'), 'click', '[data-help]', function () {
        FB.why('About TRACKR™', 'Estimated arrival is recalculated continuously and only ever revised in one direction. ' +
          'Location data is approximate, delayed, and occasionally aspirational.');
      });
    },
    unmount: function () { if (offTick) { offTick(); offTick = null; } },
  });

  /* Three doorsteps, picked by order id, so one order always shows the same
     photograph and the next order does not show that one. */
  var PROOFS = ['assets/app/proof-delivery.webp', 'assets/app/proof-delivery-2.webp', 'assets/app/proof-delivery-3.webp'];
  function proofPhoto(id) { return PROOFS[FB.hash(String(id) + 'proof') % PROOFS.length]; }

  /* The three fragments a tick actually changes. body() builds them too, so there
     is one source for each piece of markup and the tick can patch in place instead
     of tearing the whole screen down under the reader every few seconds. */
  function etaBlock(o) {
    var done = o.status === 'delivered';
    var step = FB.tracker.steps(o)[o.step];
    var pending = FB.tracker.isPending(o);
    var kicker = done ? (o.mode === 'pickup' ? 'COLLECTED' : 'DELIVERED')
      : pending ? 'SCHEDULED FOR' : 'ESTIMATED ARRIVAL';
    var headline = done ? FB.clock(new Date(o.deliveredAt))
      : pending ? FB.esc(o.scheduled || FB.clock(new Date(o.startAt))) : FB.tracker.eta(o) + ' min';
    return '<div class="te-k">' + kicker + '</div>' +
      '<h2>' + headline + '</h2>' +
      '<div class="te-s">' + (pending ? 'Reserved · preparation has not begun' : FB.esc(step.label)) +
        ' · ' + FB.esc(o.storeName) + '</div>' +
      (!done && o.etaDrift > 0 ? '<div class="te-drift">' + FB.icon('alert', 13) + 'Arrival revised later by ' + o.etaDrift + ' min since you ordered</div>' : '');
  }
  function barBlock(o) {
    return FB.tracker.steps(o).slice(0, 5).map(function (s, i) {
      return '<i class="' + (i < o.step ? 'on' : i === o.step ? 'cur' : '') + '"></i>';
    }).join('');
  }
  /* what a screen reader hears when the order moves on */
  function sayStep(o) {
    if (FB.tracker.isPending(o)) return 'Scheduled for ' + (o.scheduled || FB.clock(new Date(o.startAt))) + '. Preparation has not begun.';
    var step = FB.tracker.steps(o)[o.step];
    if (o.status === 'delivered') return step.label + ' at ' + FB.clock(new Date(o.deliveredAt)) + '.';
    return step.label + '. Estimated arrival in ' + FB.tracker.eta(o) + ' minutes.';
  }

  function feedBlock(o) {
    var done = o.status === 'delivered';
    return o.events.map(function (e, i) {
      return '<div class="tf ' + (i === 0 && !done ? 'is-now' : i > 3 ? 'is-past' : '') + '">' +
        '<span class="tf-dot"></span><span class="tf-b"><b>' + FB.esc(e.text) + '</b>' +
        (e.sub ? '<span>' + FB.esc(e.sub) + '</span>' : '') +
        '<span>' + FB.clock(new Date(e.ts)) + '</span></span></div>';
    }).join('');
  }

  function body(o) {
    var done = o.status === 'delivered';
    var eta = FB.tracker.eta(o);
    var step = FB.tracker.steps(o)[o.step];
    var g = o.slinger;
    var h = '';

    /* map */
    h += '<div class="trk-map">' + FB.tracker.mapSvg(o, FB.tracker.progress(o)) + '</div>';

    /* eta — the live region. aria-atomic so a status change is read as one
       sentence rather than as three disconnected fragments. */
    /* NOT a live region. On the wall clock the headline changes every couple of
       seconds as the estimate counts down, and a polite aria-atomic region there
       made a screen reader interrupt and re-read the whole arrival summary that
       often. What is worth announcing is the five step changes, so they get their
       own region and the countdown gets none. */
    h += '<div class="trk-eta">' + etaBlock(o) + '</div>';
    h += '<p class="sr-only" role="status" aria-live="polite" data-trk-say>' + FB.esc(sayStep(o)) + '</p>';

    /* progress */
    h += '<div class="trk-bar">' + barBlock(o) + '</div>';

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
    h += '<div class="trk-feed">' + feedBlock(o) + '</div>';

    /* delivered extras */
    if (done) {
      h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
        FB.C.sectionHead('Proof of delivery', 'Photographed by ' + g.name + '.') +
        '<div style="padding:0 16px 8px"><img src="' + proofPhoto(o.id) + '" alt="Proof of delivery photo" ' +
        'style="width:100%;border-radius:14px;background:var(--surface-2)" onerror="this.remove()"></div>' +
        '<p style="font:var(--t-cap);color:var(--ink-3);padding:0 16px 14px;line-height:1.45">' +
        'Photograph taken at the delivery address, or at an address near it, or at an address.</p></div>';

      if (!o.rated) {
        h += '<div style="border-top:8px solid var(--surface-2);padding-top:6px">' +
          FB.C.sectionHead('How was it?', 'Ratings are shared with the restaurant, the Slinger, and eleven partners.') +
          '<div style="display:flex;gap:8px;padding:4px 16px 14px;justify-content:center">' +
          [1, 2, 3, 4, 5].map(function (n) {
            return '<button class="iconbtn" data-rate="' + n + '" aria-label="Rate ' + n + ' out of 5" style="width:46px;height:46px;color:var(--ink-3)">' + FB.icon('starFill', 26) + '</button>';
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
      '<div style="padding:14px 16px 0">' + FB.lockup({ size: 26, tagline: false }) + '</div>' +
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
            FB.busy(t, 'tipBoost', function () {
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
          });
        },
      });
    });

    FB.on(root, 'click', '[data-msg]', function () { openChat(o); });

    FB.on(root, 'click', '[data-rate]', function (e, t) {
      var n = Number(t.dataset.rate);
      FB.busy(t.parentNode || t, 'rate', function () {
        FB.store.set(function (st) {
          var oo = st.orders.filter(function (x) { return x.id === o.id; })[0];
          if (oo) oo.rated = n;
          return st;
        });
        FB.toast(n >= 4 ? 'Thank you. Your rating has been forwarded.' : 'Received. Your rating has been forwarded to the Slinger with your name attached.');
        FB.nav.refresh();
      });
    });

    FB.on(root, 'click', '[data-reorder]', function (e, t) {
      var store = FB.catalog.get(o.slug);
      if (!store) { FB.toast('This store is no longer available in your region.'); return; }
      FB.busy(t, 'reorder', function () {
      var added = 0;
      o.lines.forEach(function (l) {
        var it = FB.catalog.item(o.slug, l.itemId);
        if (it) { FB.cart.add(o.slug, it, l.sel, l.qty, l.note); added++; }
      });
      FB.toast(added ? 'Re-added ' + FB.plural(added, 'item') + '. Prices have been refreshed.' : 'Those items are no longer offered.');
      if (added) FB.nav.go('cart', { slug: o.slug });
      });
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

  /* Exchanges, not lines: each one reads as a small conversation on its own, and
     one is drawn per order, seeded on the order id — so a reload replays the same
     conversation and the next delivery is a different one. */
  var CHATS = [
    [['them', 'on my way'], ['them', 'is it the blue house'], ['you', 'no'], ['them', 'ok'], ['them', 'i am at a blue house']],
    [['them', 'hey is there a gate'], ['you', 'no gate'], ['them', 'ok im at the gate'], ['them', 'ill leave it here']],
    [['them', 'the app says apt 12'], ['you', 'yes'], ['them', 'ok'], ['them', 'there is no 12'], ['them', 'leaving at 11']],
    [['them', 'running behind, one more stop'], ['you', 'how long'], ['them', 'not long'], ['them', 'two more stops']],
    [['them', 'do you want the receipt'], ['you', 'sure'], ['them', 'ok'], ['them', 'i dont have it']],
    [['them', 'im outside'], ['you', 'coming down'], ['them', 'no rush'], ['them', 'im leaving in 40 seconds']],
  ];
  function chatFor(o) { return CHATS[FB.hash(String(o.id) + 'chat') % CHATS.length]; }

  function openChat(o) {
    FB.sheet.open({
      title: o.slinger.name, sub: 'Messages are monitored for quality.',
      html: '<div style="padding:8px 16px 16px;display:flex;flex-direction:column;gap:8px">' +
        chatFor(o).map(function (c) {
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
