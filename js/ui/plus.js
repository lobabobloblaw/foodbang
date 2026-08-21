/* FoodBang — BANG+ subscription, and the cancellation flow */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var FEATURES = [
    ['zap',    '$0 delivery fees', 'On orders over $312.00. Below that threshold the fee is reduced by 30%.'],
    ['bike',   'Priority Slinger assignment', 'Your order is assigned to a Slinger first, and then reassigned.'],
    ['tag',    'Member pricing', 'Applies to 4 items across the catalogue. The items rotate weekly and are not listed.'],
    ['gift',   'BangBux™ back', '2% back on fees, redeemable against fees.'],
    ['shield', 'Fee Protection™', 'Protects you from fee increases above 40% in a single month.'],
    ['clock',  'Extended support hours', 'Support is available 24 hours a day, in a window we select.'],
  ];

  FB.screens.register('plus', {
    tab: 'account',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
        '<h1 style="font:var(--t-head)">BANG+</h1></div>';
    },
    render: function () {
      var st = FB.S();
      var active = st.plus.active;
      var months = Math.max(1, Math.round((Date.now() - (st.plus.since || Date.now())) / 2592000000) || 1);
      var h = '';

      h += '<div class="plushero">' +
        (active ? '' : '<img src="assets/app/bangplus-hero.webp" alt="" onerror="this.remove()">') +
        '<div class="ph-k">' + (active ? 'MEMBERSHIP ACTIVE' : 'INFINITY PRIME ELITE') + '</div>' +
        '<h1>' + (active ? 'You are a member' : 'Pay a fee to reduce your fees') + '</h1>' +
        '<p>' + (active
          ? 'Member since ' + FB.dayLabel(st.plus.since) + '. ' + FB.plural(months, 'month') + ' billed. ' + FB.money(st.plus.saved || 0) + ' saved.'
          + (FB.scrip.balance() > 0 ? ' ' + FB.money(FB.scrip.balance()) + ' in BangBux™ expiring shortly.' : '')
          : '$19.99 per month. Waives the delivery fee on orders over $312.00, which is more than you have ever spent in one order.') +
        '</p></div>';

      if (active) {
        /* Real books at last. saved is the gross delivery reduction membership
           actually applied; paid is the Benefit Realization Fee it charged to apply
           it; dues are the dues. NET is saved minus both, and it is the number that
           grows fastest. */
        var dues = FB.round2(19.99 * months);
        var saved = FB.round2(st.plus.saved || 0);
        var benefitFees = FB.round2(st.plus.paid || 0);
        var net = FB.round2(saved - dues - benefitFees);
        h += '<div class="statgrid">' +
          '<div><b>' + FB.money(FB.round2(dues + benefitFees)) + '</b><span>PAID</span></div>' +
          '<div><b style="color:var(--good)">' + FB.money(saved) + '</b><span>SAVED</span></div>' +
          '<div><b style="color:var(--bad)">' + (net < 0 ? '−' : '') + FB.money(Math.abs(net)) + '</b><span>NET</span></div></div>' +
          '<p style="font:var(--t-cap);color:var(--ink-3);padding:12px 16px;line-height:1.5">' +
          FB.money(dues) + ' in dues and ' + FB.money(benefitFees) + ' in Benefit Realization Fees, against ' +
          FB.money(saved) + ' in reduced delivery. The net figure is shown for transparency and is subject to ' +
          'the Fee Transparency Fee.</p>';
      }

      h += '<div style="border-top:8px solid var(--surface-2);margin-top:' + (active ? '8px' : '0') + '">' +
        FB.C.sectionHead('What is included') +
        FEATURES.map(function (f) {
          return '<div class="plusfeat">' + FB.icon(f[0], 19) +
            '<span><b>' + FB.esc(f[1]) + '</b><span>' + FB.esc(f[2]) + '</span></span></div>';
        }).join('') + '</div>';

      h += '<div style="border-top:8px solid var(--surface-2);margin-top:10px">' +
        FB.C.sectionHead('What is not included') +
        ['The Service Fee', 'The Regulatory Response Fee', 'The Bag Fee', 'The Bag Handle Fee',
         'The Peak Demand Multiplier', 'Convenience Rounding™', 'The BANG+ Benefit Realization Fee ($1.99, members only)']
          .map(function (t) {
            return '<div class="plusfeat" style="opacity:.72">' + FB.icon('x', 19) + '<span><b style="font-weight:400">' + FB.esc(t) + '</b></span></div>';
          }).join('') + '</div>';

      if (active) {
        h += '<div style="padding:20px 16px 8px"><button class="btn btn--ghost btn--block" data-cancel>Manage membership</button></div>';
      } else {
        h += '<div style="padding:20px 16px 8px">' +
          '<button class="btn btn--dark btn--lg btn--block" data-join>Start 30-day free trial</button>' +
          '<p style="text-align:center;font:var(--t-cap);color:var(--ink-3);margin:10px 0 0;line-height:1.5">' +
          'Then $19.99/month. Cancel anytime. Cancellation takes effect after the following billing cycle.</p></div>';
      }

      h += '<div class="fineprint">BANG+ INFINITY PRIME ELITE™ is a subscription. Subscriptions renew. Renewal is automatic and is ' +
        'the only automatic part of this service.</div>';
      return h;
    },
    mount: function (root) {
      FB.on(root, 'click', '[data-join]', function (e, t) {
        FB.busy(t, 'plusJoin', function () {
        FB.store.set(function (st) {
          st.plus.active = true; st.plus.since = Date.now(); st.plus.trialUsed = true;
          st.plus.renewsOn = FB.dayLabel(Date.now() + 30 * 86400000) + ', automatically';
          st.plus.saved = 0;
          return st;
        });
        FB.toast('BANG+ activated. Your first billing occurs in 30 days, or sooner.', { kind: 'plus', ms: 3800 });
        FB.nav.refresh();
        });
      });
      /* and every step of leaving is the slowest interaction in the app */
      FB.on(root, 'click', '[data-cancel]', function (e, t) {
        FB.busy(t, 'plusCancel', function () { cancelStep(1); });
      });
    },
  });

  /* ---------- the cancellation flow ---------- */
  function cancelStep(n) {
    var st = FB.S();
    if (n === 1) {
      FB.sheet.open({
        title: 'Manage membership',
        html: '<div class="mrow">' + FB.icon('card', 19) + '<span class="mr-b"><b>Billing</b><span>$19.99 monthly · ' + FB.esc(st.plus.renewsOn || 'renews automatically') + '</span></span></div>' +
          '<div class="mrow">' + FB.icon('gift', 19) + '<span class="mr-b"><b>BangBux™</b><span>' + FB.money(FB.scrip.balance()) + ' available</span></span></div>' +
          '<button class="mrow" data-next>' + FB.icon('x', 19) + '<span class="mr-b"><b>Cancel membership</b><span>Available online.</span></span>' +
          '<span class="mr-r">' + FB.icon('fwd', 15) + '</span></button>',
        onMount: function (b, h) { FB.on(b, 'click', '[data-next]', function () { h.close(); FB.latency.run('plusCancel', function () { cancelStep(2); }); }); },
      });
    } else if (n === 2) {
      FB.sheet.open({
        title: 'Before you go',
        sub: 'Here is what you would lose.',
        html: FEATURES.map(function (f) {
          return '<div class="plusfeat">' + FB.icon(f[0], 19) + '<span><b>' + FB.esc(f[1]) + '</b><span>' + FB.esc(f[2]) + '</span></span></div>';
        }).join('') +
        '<div style="padding:18px 16px 8px"><p style="font:var(--t-sub);color:var(--ink-2);line-height:1.55;margin:0">' +
        'You have saved ' + FB.money(st.plus.saved || 0) + ' with BANG+. Members save an average of ' + FB.money(41.20) +
        ', which is an average of all members, including members who spend more than you.</p></div>',
        footer: '<div style="flex:1;display:flex;flex-direction:column;gap:10px">' +
          '<button class="btn btn--dark btn--block" data-keep>Keep my membership</button>' +
          '<button class="linkbtn" data-next style="color:var(--ink-3);font-size:calc(12.5px * var(--fs));text-align:center">Continue to cancel</button></div>',
        onMount: function (b, h) {
          FB.on(h.el, 'click', '[data-keep]', function () { h.close(); FB.toast('Membership retained. Thank you.'); });
          FB.on(h.el, 'click', '[data-next]', function () { h.close(); FB.latency.run('plusCancel', function () { cancelStep(3); }); });
        },
      });
    } else if (n === 3) {
      FB.sheet.open({
        title: 'A one-time offer',
        sub: 'Available to you only, and to everyone.',
        html: '<div style="padding:6px 16px 18px">' +
          '<div style="background:var(--plus);color:var(--bg);border-radius:18px;padding:20px;text-align:center">' +
          '<div style="font:var(--t-micro);letter-spacing:.16em;color:var(--gold)">RETENTION OFFER</div>' +
          '<div style="font:900 calc(32px * var(--fs))/1.06 var(--display);letter-spacing:-1px;margin:8px 0 6px">50% off</div>' +
          '<div style="font:var(--t-sub);opacity:.75">for two months, then $24.99/month</div></div>' +
          '<p style="font:var(--t-cap);color:var(--ink-3);margin:14px 0 0;line-height:1.5">' +
          'The post-promotional rate reflects a scheduled price adjustment that would have applied regardless.</p></div>',
        footer: '<div style="flex:1;display:flex;flex-direction:column;gap:10px">' +
          '<button class="btn btn--primary btn--block" data-accept>Accept 50% off</button>' +
          '<button class="linkbtn" data-next style="color:var(--ink-3);font-size:calc(12.5px * var(--fs));text-align:center">No thanks, cancel</button></div>',
        onMount: function (b, h) {
          FB.on(h.el, 'click', '[data-accept]', function () {
            h.close();
            FB.store.set(function (s) { s.plus.retentionUsed = true; return s; });
            FB.toast('Discount applied for two months. Your rate then becomes $24.99.', { kind: 'plus', ms: 3600 });
          });
          FB.on(h.el, 'click', '[data-next]', function () { h.close(); FB.latency.run('plusCancel', function () { cancelStep(4); }); });
        },
      });
    } else if (n === 4) {
      var REASONS = ['Too expensive', 'I do not order enough', 'I never reached the $312 threshold',
        'The benefits did not apply to me', 'I did not know I had this', 'Other'];
      var pick = null;
      FB.sheet.open({
        title: 'Why are you cancelling?', sub: 'A selection is required to continue.',
        html: REASONS.map(function (r, i) {
          return '<button class="opt" role="radio" aria-checked="false" data-reason="' + i + '">' +
            '<span class="mark"></span><span class="opt-b"><b>' + FB.esc(r) + '</b></span></button>';
        }).join(''),
        footer: '<button class="btn btn--dark btn--block" data-next disabled>Continue</button>',
        onMount: function (b, h) {
          FB.on(b, 'click', '[data-reason]', function (e, t) {
            pick = t.dataset.reason;
            FB.qsa('[data-reason]', b).forEach(function (x) { x.setAttribute('aria-checked', x.dataset.reason === pick); });
            var btn = h.el.querySelector('[data-next]'); if (btn) btn.disabled = false;
          });
          FB.on(h.el, 'click', '[data-next]', function () {
            if (pick == null) return;
            h.close(); FB.latency.run('plusCancel', function () { cancelStep(5); });
          });
        },
      });
    } else if (n === 5) {
      FB.sheet.open({
        title: 'One more step',
        html: '<div style="padding:6px 16px 18px">' +
          '<p style="font:var(--t-body);color:var(--ink-2);line-height:1.6;margin:0 0 16px">' +
          'To complete cancellation, call the Membership Retention Line during business hours.</p>' +
          '<div style="background:var(--surface-2);border-radius:14px;padding:18px;text-align:center">' +
          '<div style="font:800 calc(22px * var(--fs)) var(--mono);letter-spacing:-.5px">1-800-BANG-NO</div>' +
          '<div style="font:var(--t-cap);color:var(--ink-3);margin-top:6px">Tue &amp; Thu, 10:15 AM – 10:40 AM</div></div>' +
          '<p style="font:var(--t-cap);color:var(--ink-3);margin:16px 0 0;line-height:1.5">' +
          'Average hold time is not published. Business hours are observed in a time zone we have not disclosed.</p></div>',
        footer: '<div style="flex:1;display:flex;flex-direction:column;gap:10px">' +
          '<button class="btn btn--dark btn--block" data-keep>Never mind, keep it</button>' +
          '<button class="linkbtn" data-finish style="color:var(--ink-3);font-size:calc(12.5px * var(--fs));text-align:center">Cancel online instead</button></div>',
        onMount: function (b, h) {
          FB.on(h.el, 'click', '[data-keep]', function () { h.close(); FB.toast('Membership retained. Thank you.'); });
          FB.on(h.el, 'click', '[data-finish]', function () {
            h.close();
            FB.store.set(function (s) {
              s.plus.active = false; s.plus.cancelAttempts = (s.plus.cancelAttempts || 0) + 1;
              s.plus.since = null; s.plus.renewsOn = null;
              return s;
            });
            setTimeout(function () {
              FB.modal.open({
                html: '<h2>Membership cancelled</h2>' +
                  '<p>Your cancellation takes effect after the following billing cycle. You have been charged for that cycle. ' +
                  'You may continue to use BANG+ benefits, none of which are currently active.</p>' +
                  '<div class="modal-acts"><button class="btn btn--dark btn--block" data-ok>Understood</button></div>',
                onMount: function (bb, hh) { FB.on(bb, 'click', '[data-ok]', function () { hh.close(); FB.nav.refresh(); }); },
              });
            }, 260);
          });
        },
      });
    }
  }
})(window.FB);
