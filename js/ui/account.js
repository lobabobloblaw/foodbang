/* FoodBang — account, settings, addresses, payments, notifications */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* ===================== account root ===================== */
  FB.screens.register('account', {
    tab: 'account',
    appbar: function () {
      return '<div class="bar"><h1>Account</h1>' +
        '<button class="iconbtn" data-go="settings" aria-label="Settings">' + FB.icon('settings', 19) + '</button></div>';
    },
    render: function () {
      var st = FB.S();
      var m = FB.bodymax.metrics();
      var h = '';

      h += '<div class="acct-head"><img src="' + FB.esc(st.user.avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'">' +
        '<div class="ah-b"><h1>' + FB.esc(st.user.name) + '</h1>' +
        '<span>' + FB.esc(st.user.email) + '</span>' +
        '<div style="margin-top:6px"><button class="btn btn--sm btn--ghost" data-editprofile>Edit profile</button></div></div></div>';

      h += '<div class="statgrid">' +
        '<div><b>' + st.meta.orderCount + '</b><span>ORDERS</span></div>' +
        '<div><b>' + FB.money(st.meta.lifetimeSpend) + '</b><span>SPENT</span></div>' +
        '<div><b style="color:var(--fb)">' + FB.money(st.meta.lifetimeFees) + '</b><span>IN FEES</span></div></div>';

      /* BANG+ card */
      if (st.plus.active) {
        h += '<button class="plusbanner" data-go="plus" style="margin-top:16px">' +
          '<span class="pb-k">BANG+ INFINITY PRIME ELITE · ACTIVE</span>' +
          '<span class="pb-t">Renews ' + FB.esc(st.plus.renewsOn || 'monthly') + '</span>' +
          '<span class="pb-s">You have saved ' + FB.money(st.plus.saved || 0) + ' since joining. Membership has cost you ' +
          FB.money(19.99 * Math.max(1, Math.round((Date.now() - (st.plus.since || Date.now())) / 2592000000) || 1)) + '.</span>' +
          '<span class="pb-c">Manage membership</span></button>';
      } else {
        h += '<button class="plusbanner" data-go="plus" style="margin-top:16px">' +
          '<img src="assets/app/bangplus-hero.webp" alt="" onerror="this.remove()">' +
          '<span class="pb-k">BANG+ INFINITY PRIME ELITE</span>' +
          '<span class="pb-t">You have paid ' + FB.money(st.meta.lifetimeFees) + ' in fees</span>' +
          '<span class="pb-s">BANG+ would have reduced some of them. $19.99/month.</span>' +
          '<span class="pb-c">See what you missed</span></button>';
      }

      /* BODYMAX */
      h += '<button class="mrow" data-go="bodymax" style="border-top:8px solid var(--surface-2);border-bottom:1px solid var(--line);margin-top:14px">' +
        FB.icon('activity', 19) + '<span class="mr-b"><b>BODYMAX™ Intake Telemetry</b>' +
        '<span>' + (m.orders ? FB.int(m.totalCal) + ' units logged · trajectory ' + m.trajectory : 'No signal yet') + '</span></span>' +
        '<span class="mr-r">' + (m.orders ? '<span class="badge badge--bad">' + m.trajectory + '</span>' : '') + FB.icon('fwd', 15) + '</span></button>';

      h += '<div class="menulist"><h3>ORDERING</h3>' +
        row('pin', 'Addresses', FB.plural(st.addresses.length, 'saved address', 'saved addresses'), 'addresses') +
        row('card', 'Payment methods', FB.plural(st.payments.length, 'method'), 'payments') +
        row('orders', 'Order history', FB.plural(st.orders.length, 'order'), 'orders') +
        row('heart', 'Saved stores', FB.plural(st.favorites.length, 'store'), 'favorites') +
        row('tag', 'Promotions', Object.keys(FB.fees.PROMOS).length + ' codes circulating', null, 'promos') +
        '</div>';

      h += '<div class="menulist"><h3>APP</h3>' +
        row('settings', 'Settings', 'Appearance, privacy, notifications', 'settings') +
        row('bell', 'Notifications', 'Manage what reaches you', null, 'notifs') +
        row('help', 'Help & support', 'Available', null, 'help') +
        row('shield', 'Legal & policies', 'Terms, Privacy, Arbitration', null, 'legal') +
        '</div>';

      h += '<div class="menulist"><h3>DANGER</h3>' +
        '<button class="mrow" data-reset>' + FB.icon('trash', 19) +
        '<span class="mr-b"><b style="color:var(--bad)">Reset all data</b><span>Clears orders, carts, telemetry and settings on this device.</span></span></button>' +
        '<button class="mrow" data-signout>' + FB.icon('logout', 19) +
        '<span class="mr-b"><b>Sign out</b><span>You cannot sign out. This is a demonstration.</span></span></button>' +
        '</div>';

      h += '<div class="fineprint">FoodBang™ v9.4.1 (build 40118) · Nutrition Logistics, Inc.<br>' +
        'This is a satirical simulation. No orders are placed, no payments are processed, no data leaves this device. ' +
        'Everything is stored in your browser and can be erased above.</div>';
      return h;
    },
    mount: function (root) {
      FB.on(root, 'click', '[data-act="notifs"]', FB.openNotifications);
      FB.on(root, 'click', '[data-act="promos"]', openPromos);
      FB.on(root, 'click', '[data-act="help"]', openHelp);
      FB.on(root, 'click', '[data-act="legal"]', openLegal);
      FB.on(root, 'click', '[data-editprofile]', openProfile);
      FB.on(root, 'click', '[data-signout]', function () {
        FB.toast('Sign-out is not available in this build. It is available in a future build.');
      });
      FB.on(root, 'click', '[data-reset]', function () {
        FB.confirm({ title: 'Reset all data?', danger: true, yes: 'Erase everything', no: 'Keep it',
          body: 'This clears every order, cart, achievement and setting stored in this browser. It cannot be undone, and it is free.' })
          .then(function (ok) { if (ok) { FB.store.reset(); FB.applyAppearance(); FB.nav.tab('home'); FB.toast('All local data erased.'); } });
      });
    },
  });

  function row(icon, title, sub, go, act) {
    return '<button class="mrow"' + (go ? ' data-go="' + go + '"' : '') + (act ? ' data-act="' + act + '"' : '') + '>' +
      FB.icon(icon, 19) + '<span class="mr-b"><b>' + FB.esc(title) + '</b><span>' + FB.esc(sub) + '</span></span>' +
      '<span class="mr-r">' + FB.icon('fwd', 15) + '</span></button>';
  }

  /* ===================== favorites ===================== */
  FB.screens.register('favorites', {
    tab: 'account',
    appbar: function () { return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button><h1>Saved stores</h1></div>'; },
    render: function () {
      var favs = FB.S().favorites.map(FB.catalog.get).filter(Boolean);
      if (!favs.length) return FB.C.empty({ title: 'Nothing saved', body: 'Saving a store lets us remind you about it more often.', cta: 'Browse', go: 'home' });
      return '<div class="grid1" style="padding-top:14px">' + favs.map(FB.C.storeCard).join('') + '</div><div style="height:24px"></div>';
    },
  });

  /* ===================== settings ===================== */
  /* Kept beside the bindings in js/ui/shell.js — if one moves, move both. */
  var SHORTCUTS = [
    [['Esc'], 'Back, or close the sheet on top'],
    [['/'], 'Jump to Search'],
    [['D'], 'Cycle theme'],
    [['Shift', 'R'], 'Erase all local data'],
  ];

  FB.screens.register('settings', {
    tab: 'account',
    appbar: function () { return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button><h1>Settings</h1></div>'; },
    render: function () {
      var s = FB.S().settings;
      var h = '';

      h += '<div class="menulist"><h3>APPEARANCE</h3>' +
        '<div style="padding:2px 0 6px"><div style="padding:0 16px 8px;font:var(--t-cap);color:var(--ink-3)">Theme</div>' +
        seg('theme', s.theme, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]) +
        '</div></div>';

      /* Text size and Animations were filed under APPEARANCE, where nothing marked
         them as assistive, and the four keyboard shortcuts were advertised only in
         the desktop sidebar — which is display:none below 940px. */
      h += '<div class="menulist"><h3>ACCESSIBILITY</h3>' +
        '<div style="padding:2px 0 6px"><div style="padding:0 16px 8px;font:var(--t-cap);color:var(--ink-3)">Text size</div>' +
        seg('textsize', s.textsize, [['m', 'Default'], ['l', 'Large'], ['xl', 'Larger']]) +
        '</div>' +
        sw('motion', s.motion === 'on' || (s.motion === 'system'), 'Animations', 'Motion, transitions and the marquee.') +
        '<div style="padding:12px 16px 4px">' +
        '<div style="font:var(--t-cap);color:var(--ink-3);margin-bottom:9px">KEYBOARD</div>' +
        '<div class="keyrow">' +
        SHORTCUTS.map(function (k) {
          return '<div>' + k[0].map(function (key) { return '<kbd>' + FB.esc(key) + '</kbd>'; }).join('') +
            '<span>' + FB.esc(k[1]) + '</span></div>';
        }).join('') + '</div></div>' +
        '<div class="callout" style="margin-top:10px">' + FB.icon('info', 17) +
        '<span>Accessibility settings are provided at no charge. This arrangement is under review.</span></div>' +
        '</div>';

      h += '<div class="menulist"><h3>ORDERING</h3>' +
        '<div style="padding:12px 16px 4px"><div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<b style="font:var(--t-body);font-weight:500">Hunger Level</b>' +
        '<span style="font:700 calc(15px * var(--fs)) var(--mono);color:var(--fb)">' + s.hungerLevel + ' / 10</span></div>' +
        '<input class="slider" type="range" min="1" max="10" value="' + s.hungerLevel + '" data-hunger aria-label="Hunger Level" style="margin-top:12px">' +
        '<div style="font:var(--t-cap);color:var(--ink-3);margin-top:8px;line-height:1.45">' +
        FB.esc(hungerCopy(s.hungerLevel)) + '</div></div>' +
        '<div style="padding:14px 16px 4px"><div style="display:flex;justify-content:space-between;align-items:baseline">' +
        '<b style="font:var(--t-body);font-weight:500">Default tip</b>' +
        '<span style="font:700 calc(15px * var(--fs)) var(--mono)">' + s.autoTipPct + '%</span></div>' +
        '<input class="slider" type="range" min="0" max="80" step="1" value="' + s.autoTipPct + '" data-tipdef aria-label="Default tip percentage" style="margin-top:12px">' +
        '<div style="font:var(--t-cap);color:var(--ink-3);margin-top:8px">Pre-selected at checkout. The suggested default is 42%.</div></div>' +
        '</div>';

      h += '<div class="menulist"><h3>PRIVACY &amp; DISCLOSURE</h3>' +
        sw('feeTransparency', s.feeTransparency, 'Show itemized fees',
          s.feeTransparency ? 'On. Adds the Fee Transparency Fee ($0.85) to each order.' : 'Off. Adds the Fee Opacity Fee ($2.85) to each order.') +
        sw('reduceUpsells', s.reduceUpsells, 'Reduce recommendations',
          s.reduceUpsells ? 'On. Adds the Upsell Suppression Fee ($3.25) to each order.' : 'Off. Recommendations appear at your Hunger Level.') +
        sw('dataSharing', s.dataSharing, 'Share behavioral data with partners',
          s.dataSharing ? 'On. Your data is subsidizing your food.' : 'Off. Adds the Data Sovereignty Fee ($4.10) to each order.') +
        '<div class="callout callout--warn" style="margin-top:6px">' + FB.icon('alert', 17) +
        '<span>Every privacy setting on this screen costs money to enable <em>and</em> to disable. There is no configuration of this screen that is free.</span></div>' +
        '</div>';

      var n = s.notifications;
      h += '<div class="menulist"><h3>NOTIFICATIONS</h3>' +
        sw('n.orderUpdates', n.orderUpdates, 'Order updates', 'Status changes and arrival estimates.') +
        sw('n.slingerMessages', n.slingerMessages, 'Slinger messages', 'Messages from the person currently holding your food.') +
        sw('n.promos', n.promos, 'Promotions', 'Up to 14 per day. This is the floor, not the cap.') +
        sw('n.biometric', n.biometric, 'BODYMAX™ alerts', 'Threshold crossings and trajectory changes.') +
        sw('n.nightly', n.nightly, 'Nightly summary', 'Delivered at 2:40 AM.') +
        sw('n.reengagement', n.reengagement, 'We miss you', 'Sent when you have not ordered in 90 minutes.') +
        '</div>';

      h += '<div class="menulist"><h3>REGION</h3>' +
        '<div style="padding:2px 0 6px"><div style="padding:0 16px 8px;font:var(--t-cap);color:var(--ink-3)">Units</div>' +
        seg('units', s.units, [['imperial', 'Imperial'], ['metric', 'Metric']]) +
        '<div style="padding:6px 16px 8px;font:var(--t-cap);color:var(--ink-3)">Language</div>' +
        seg('language', s.language, [['en-US', 'American'], ['en-US-LOUD', 'American (Loud)']]) +
        '</div>' +
        sw('soundEffects', s.soundEffects, 'Sound effects', 'There are none. The setting remains available.') +
        '</div>';

      h += '<div class="fineprint">Settings are stored in this browser only. Changing a setting may change a price. ' +
        'Prices are not settings and cannot be changed.</div>';
      return h;
    },
    mount: function (root) {
      FB.on(root, 'click', '[data-seg]', function (e, t) {
        var k = t.dataset.seg, v = t.dataset.v;
        FB.store.set(function (st) { st.settings[k] = v; return st; });
        if (k === 'theme' || k === 'textsize') FB.applyAppearance();
        if (k === 'language' && v === 'en-US-LOUD') FB.toast('LANGUAGE SET TO AMERICAN (LOUD).');
        FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-sw]', function (e, t) {
        var k = t.dataset.sw;
        FB.store.set(function (st) {
          if (k === 'motion') { st.settings.motion = (st.settings.motion === 'off') ? 'on' : 'off'; return st; }
          if (k.indexOf('n.') === 0) { var nk = k.slice(2); st.settings.notifications[nk] = !st.settings.notifications[nk]; return st; }
          st.settings[k] = !st.settings[k];
          return st;
        });
        var s = FB.S().settings;
        if (k === 'motion') FB.applyAppearance();
        if (k === 'feeTransparency') FB.toast(s.feeTransparency ? 'Itemized fees restored. Fee Transparency Fee reinstated.' : 'Fees hidden. Fee Opacity Fee applied — it is larger.', { kind: 'bad' });
        if (k === 'reduceUpsells' && s.reduceUpsells) FB.toast('Recommendations reduced. Upsell Suppression Fee applied.', { kind: 'bad' });
        if (k === 'dataSharing' && !s.dataSharing) FB.toast('Data sharing off. Data Sovereignty Fee applied.', { kind: 'bad' });
        FB.nav.refresh();
      });
      FB.on(root, 'input', '[data-hunger]', function (e, t) {
        FB.store.set(function (st) { st.settings.hungerLevel = Number(t.value); return st; }, { silent: true });
        var lab = t.previousElementSibling.querySelector('span');
        if (lab) lab.textContent = t.value + ' / 10';
        var note = t.nextElementSibling;
        if (note) note.textContent = hungerCopy(Number(t.value));
      });
      FB.on(root, 'input', '[data-tipdef]', function (e, t) {
        FB.store.set(function (st) { st.settings.autoTipPct = Number(t.value); return st; }, { silent: true });
        var lab = t.previousElementSibling.querySelector('span');
        if (lab) lab.textContent = t.value + '%';
      });
    },
  });

  function hungerCopy(n) {
    if (n <= 2) return 'Minimal. Recommendations are suppressed where legally possible.';
    if (n <= 5) return 'Moderate. You will be shown items adjacent to what you selected.';
    if (n <= 7) return 'Elevated. Upsells appear in the cart, at checkout, and after delivery.';
    if (n <= 9) return 'High. Portion defaults are raised one tier. This is not reversible per-order.';
    return 'Maximum. All portion defaults are Municipal. A second order is pre-staged.';
  }
  function seg(key, cur, opts) {
    return '<div class="segmented">' + opts.map(function (o) {
      return '<button data-seg="' + key + '" data-v="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function sw(key, on, title, sub) {
    return '<button class="switchrow" data-sw="' + key + '" role="switch" aria-checked="' + !!on + '">' +
      '<span class="sr-b"><b>' + FB.esc(title) + '</b><span>' + sub + '</span></span>' +
      '<span class="switch" aria-checked="' + !!on + '"></span></button>';
  }

  /* ===================== addresses ===================== */
  FB.screens.register('addresses', {
    tab: 'account',
    appbar: function () { return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
      '<h1>Addresses</h1><button class="iconbtn" data-addnew aria-label="Add an address">' + FB.icon('plus', 20) + '</button></div>'; },
    render: function () {
      var st = FB.S();
      return st.addresses.map(function (a) {
        return '<div class="mrow" style="align-items:flex-start">' + FB.icon('pin', 19) +
          '<span class="mr-b"><b>' + FB.esc(a.label) + (a.id === st.selectedAddress ? ' <span class="badge badge--good">In use</span>' : '') + '</b>' +
          '<span>' + FB.esc(a.line1) + (a.line2 ? ', ' + FB.esc(a.line2) : '') + '<br>' + FB.esc(a.city) + '</span>' +
          '<span style="margin-top:6px;display:flex;gap:12px">' +
          '<button class="linkbtn" data-use="' + a.id + '">Use</button>' +
          '<button class="linkbtn" data-edit="' + a.id + '">Edit</button>' +
          '<button class="linkbtn" style="color:var(--bad)" data-del="' + a.id + '">Delete</button></span></span></div>';
      }).join('') +
      '<div style="padding:18px 16px"><button class="btn btn--ghost btn--block" data-addnew>' + FB.icon('plus', 17) + 'Add an address</button></div>' +
      '<div class="fineprint">Addresses are retained after deletion for operational purposes.</div>';
    },
    mount: function (root) {
      FB.on(root, 'click', '[data-use]', function (e, t) {
        FB.store.set(function (st) { st.selectedAddress = t.dataset.use; return st; });
        FB.toast('Delivery address updated.'); FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-edit]', function (e, t) { editAddress(t.dataset.edit); });
      FB.on(root, 'click', '[data-del]', function (e, t) {
        if (FB.S().addresses.length < 2) { FB.toast('At least one address is required.'); return; }
        FB.confirm({ title: 'Delete address?', danger: true, yes: 'Delete', body: 'It will be removed from this list.' }).then(function (ok) {
          if (!ok) return;
          FB.store.set(function (st) {
            st.addresses = st.addresses.filter(function (a) { return a.id !== t.dataset.del; });
            if (st.selectedAddress === t.dataset.del) st.selectedAddress = st.addresses[0].id;
            return st;
          });
          FB.nav.refresh();
        });
      });
      FB.on(root, 'click', '[data-addnew]', function () { editAddress(null); });
      FB.on(document.getElementById('appbar'), 'click', '[data-addnew]', function () { editAddress(null); });
    },
  });

  function editAddress(id) {
    var a = id ? FB.S().addresses.filter(function (x) { return x.id === id; })[0] : { label: '', line1: '', line2: '', city: '', instructions: '', dropoff: 'leave' };
    FB.sheet.open({
      title: id ? 'Edit address' : 'Add address',
      html: field('Label', 'label', a.label, 'Home, Work, Other') +
        field('Street address', 'line1', a.line1, '123 Example Way') +
        field('Apt / Suite', 'line2', a.line2, 'Optional') +
        field('City, State ZIP', 'city', a.city, 'Sprawl Heights, CA 90210') +
        '<div class="field"><label class="lbl" for="f-instructions">Dropoff instructions</label>' +
        '<textarea class="textarea" id="f-instructions" data-f="instructions" placeholder="Gate code, floor, warnings…">' + FB.esc(a.instructions) + '</textarea></div>',
      footer: '<button class="btn btn--primary btn--block" data-save>Save address</button>',
      onMount: function (b, h) {
        FB.on(h.el, 'click', '[data-save]', function () {
          var vals = {};
          FB.qsa('[data-f]', b).forEach(function (i) { vals[i.dataset.f] = i.value.trim(); });
          if (!vals.line1) { FB.toast('A street address is required.', { kind: 'bad' }); return; }
          FB.store.set(function (st) {
            if (id) {
              var x = st.addresses.filter(function (y) { return y.id === id; })[0];
              if (x) Object.keys(vals).forEach(function (k) { x[k] = vals[k]; });
            } else {
              var nid = FB.uid('a');
              st.addresses.push({ id: nid, label: vals.label || 'New address', line1: vals.line1, line2: vals.line2,
                city: vals.city || 'Sprawl Heights, CA 90210', instructions: vals.instructions, dropoff: 'leave' });
              st.selectedAddress = nid;
            }
            return st;
          });
          h.close(); FB.nav.refresh(); FB.toast('Address saved.');
        });
      },
    });
  }
  function field(label, key, val, ph) {
    /* a real <label for>, not a floating span: without it every input in the app
       is announced as "edit text, blank" */
    var id = 'f-' + key + '-' + FB.uid('');
    return '<div class="field"><label class="lbl" for="' + id + '">' + label + '</label>' +
      '<input class="input" id="' + id + '" data-f="' + key + '" value="' + FB.attr(val || '') + '" placeholder="' + FB.attr(ph || '') + '"></div>';
  }

  FB.openAddressSheet = function (after) {
    var st = FB.S();
    FB.sheet.open({
      title: 'Deliver to',
      html: st.addresses.map(function (a) {
        return '<button class="opt" role="radio" aria-checked="' + (a.id === st.selectedAddress) + '" data-pick="' + a.id + '">' +
          '<span class="mark"></span><span class="opt-b"><b>' + FB.esc(a.label) + '</b>' +
          '<span>' + FB.esc(a.line1) + ' · ' + FB.esc(a.city) + '</span></span></button>';
      }).join(''),
      footer: '<button class="btn btn--ghost btn--block" data-manage>Manage addresses</button>',
      onMount: function (b, h) {
        FB.on(b, 'click', '[data-pick]', function (e, t) {
          FB.store.set(function (s) { s.selectedAddress = t.dataset.pick; return s; });
          h.close(); if (typeof after === 'function') after(); else FB.nav.refresh();
        });
        FB.on(h.el, 'click', '[data-manage]', function () { h.close(); FB.nav.go('addresses'); });
      },
    });
  };

  /* ===================== payments ===================== */
  FB.screens.register('payments', {
    tab: 'account',
    appbar: function () { return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
      '<h1>Payment methods</h1><button class="iconbtn" data-addcard aria-label="Add a payment method">' + FB.icon('plus', 20) + '</button></div>'; },
    render: function () {
      var st = FB.S();
      return st.payments.map(function (p) {
        return '<div class="mrow" style="align-items:flex-start">' + FB.icon('card', 19) +
          '<span class="mr-b"><b>' + FB.esc(p.brand) + ' ····' + FB.esc(p.last4) +
          (p.id === st.selectedPayment ? ' <span class="badge badge--good">Default</span>' : '') + '</b>' +
          '<span>' + FB.esc(p.nickname) + ' · expires ' + FB.esc(p.exp) + '</span>' +
          '<span style="margin-top:6px;display:flex;gap:12px">' +
          '<button class="linkbtn" data-usep="' + p.id + '">Set default</button>' +
          '<button class="linkbtn" style="color:var(--bad)" data-delp="' + p.id + '">Remove</button></span></span></div>';
      }).join('') +
      '<div style="padding:18px 16px"><button class="btn btn--ghost btn--block" data-addcard>' + FB.icon('plus', 17) + 'Add payment method</button></div>' +
      '<div class="callout">' + FB.icon('lock', 17) + '<span>No payment information is transmitted anywhere. This screen is a simulation and accepts any digits.</span></div>';
    },
    mount: function (root) {
      FB.on(root, 'click', '[data-usep]', function (e, t) {
        FB.store.set(function (st) { st.selectedPayment = t.dataset.usep; return st; });
        FB.toast('Default payment updated.'); FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-delp]', function (e, t) {
        if (FB.S().payments.length < 2) { FB.toast('At least one payment method is required.'); return; }
        FB.store.set(function (st) {
          st.payments = st.payments.filter(function (p) { return p.id !== t.dataset.delp; });
          if (st.selectedPayment === t.dataset.delp) st.selectedPayment = st.payments[0].id;
          return st;
        });
        FB.nav.refresh();
      });
      var add = function () { addCard(); };
      FB.on(root, 'click', '[data-addcard]', add);
      FB.on(document.getElementById('appbar'), 'click', '[data-addcard]', add);
    },
  });

  function addCard() {
    FB.sheet.open({
      title: 'Add payment method', sub: 'Nothing entered here is stored or sent.',
      html: field('Card number', 'num', '', '4242 4242 4242 4242') +
        '<div style="display:flex"><div style="flex:1">' + field('Expires', 'exp', '', 'MM/YY') + '</div>' +
        '<div style="flex:1">' + field('CVC', 'cvc', '', '123') + '</div></div>' +
        field('Nickname', 'nick', '', 'Personal'),
      footer: '<button class="btn btn--primary btn--block" data-save>Add card</button>',
      onMount: function (b, h) {
        FB.on(h.el, 'click', '[data-save]', function () {
          var v = {}; FB.qsa('[data-f]', b).forEach(function (i) { v[i.dataset.f] = i.value.trim(); });
          var digits = (v.num || '').replace(/\D/g, '');
          if (digits.length < 4) { FB.toast('Enter at least 4 digits.', { kind: 'bad' }); return; }
          FB.store.set(function (st) {
            st.payments.push({ id: FB.uid('p'), brand: digits[0] === '4' ? 'Visa' : digits[0] === '5' ? 'Mastercard' : 'BangCard',
              last4: digits.slice(-4), exp: v.exp || '01/30', nickname: v.nick || 'Card', isDefault: false });
            return st;
          });
          h.close(); FB.nav.refresh(); FB.toast('Card added.');
        });
      },
    });
  }

  FB.openPaymentSheet = function (after) {
    var st = FB.S();
    FB.sheet.open({
      title: 'Payment method',
      html: st.payments.map(function (p) {
        return '<button class="opt" role="radio" aria-checked="' + (p.id === st.selectedPayment) + '" data-pickp="' + p.id + '">' +
          '<span class="mark"></span><span class="opt-b"><b>' + FB.esc(p.brand) + ' ····' + FB.esc(p.last4) + '</b>' +
          '<span>' + FB.esc(p.nickname) + '</span></span></button>';
      }).join(''),
      footer: '<button class="btn btn--ghost btn--block" data-managep>Manage payment methods</button>',
      onMount: function (b, h) {
        FB.on(b, 'click', '[data-pickp]', function (e, t) {
          FB.store.set(function (s) { s.selectedPayment = t.dataset.pickp; return s; });
          h.close(); if (typeof after === 'function') after(); else FB.nav.refresh();
        });
        FB.on(h.el, 'click', '[data-managep]', function () { h.close(); FB.nav.go('payments'); });
      },
    });
  };

  /* ===================== profile / notifications / misc sheets ============ */
  function openProfile() {
    var u = FB.S().user;
    FB.sheet.open({
      title: 'Edit profile',
      html: field('Name', 'name', u.name, '') + field('Email', 'email', u.email, '') + field('Phone', 'phone', u.phone, ''),
      footer: '<button class="btn btn--primary btn--block" data-save>Save</button>',
      onMount: function (b, h) {
        FB.on(h.el, 'click', '[data-save]', function () {
          var v = {}; FB.qsa('[data-f]', b).forEach(function (i) { v[i.dataset.f] = i.value.trim(); });
          FB.store.set(function (st) { Object.keys(v).forEach(function (k) { if (v[k]) st.user[k] = v[k]; }); return st; });
          h.close(); FB.nav.refresh(); FB.toast('Profile updated.');
        });
      },
    });
  }

  var NOTIFS = [
    ['zap', 'Peak demand is in effect', 'It has been in effect since March 2019.', '2m'],
    ['tag', 'Your saved store raised its prices', 'You saved it, so we are telling you.', '31m'],
    ['activity', 'BODYMAX™ threshold crossed', 'Sodium Saturation exceeded 100%. No action is available.', '1h'],
    ['bell', 'We miss you', 'You have not ordered in 90 minutes.', '2h'],
    ['gift', 'A promo code expired', 'You did not use it. It has been noted.', '5h'],
    ['bike', 'Rate your last Slinger', 'Ratings below 4 are shared with the Slinger and with you.', '1d'],
  ];
  FB.openNotifications = function () {
    FB.sheet.open({
      title: 'Notifications', sub: NOTIFS.length + ' unread · they are always unread',
      html: NOTIFS.map(function (n) {
        return '<div class="mrow" style="align-items:flex-start">' + FB.icon(n[0], 19) +
          '<span class="mr-b"><b>' + FB.esc(n[1]) + '</b><span>' + FB.esc(n[2]) + '</span></span>' +
          '<span class="mr-r">' + n[3] + '</span></div>';
      }).join('') +
      '<div style="padding:16px"><button class="btn btn--ghost btn--block" data-clearn>Mark all as read</button></div>',
      onMount: function (b, h) {
        FB.on(b, 'click', '[data-clearn]', function () { FB.toast('Marked as read. They will return.'); h.close(); });
      },
    });
  };

  function openPromos() {
    var sub = 25;
    FB.sheet.open({
      title: 'Promotions', sub: 'All codes are live. All codes have conditions.',
      html: Object.keys(FB.fees.PROMOS).map(function (k) {
        var p = FB.fees.PROMOS[k];
        return '<div class="mrow" style="align-items:flex-start">' + FB.icon('tag', 19) +
          '<span class="mr-b"><b>' + k + '</b><span>' +
          (p.kind === 'pct' ? Math.round(p.value * 100) + '% off the subtotal' : FB.money(p.value) + ' off the subtotal') +
          (p.min ? ' · requires ' + FB.money(p.min) + ' subtotal' : '') + '<br>' + FB.esc(p.blurb) + '</span></span></div>';
      }).join('') +
      '<div class="fineprint">Discounts apply to the subtotal. Fees are calculated on the subtotal before the discount and on the total after it.</div>',
    });
  }

  function openHelp() {
    FB.sheet.open({
      title: 'Help & support',
      html: [
        ['Why is my total higher than the menu?', 'Menu prices exclude required selections, which are required. Totals also include fees, which are separate from prices.'],
        ['Can I remove a fee?', 'No fee on this platform can be removed. Two of them can be exchanged for a larger fee.'],
        ['Where is my Slinger?', 'Your Slinger is where the map indicates, approximately, with a delay.'],
        ['How do I contact a human?', 'Humans are contacted through this form, which is read by a system.'],
        ['Why does declining cost money?', 'Declining is an operation. Operations are billed.'],
      ].map(function (r) {
        return '<div class="mrow" style="align-items:flex-start">' + FB.icon('help', 19) +
          '<span class="mr-b"><b>' + FB.esc(r[0]) + '</b><span>' + FB.esc(r[1]) + '</span></span></div>';
      }).join(''),
      footer: '<button class="btn btn--dark btn--block" data-sheet-close>That did not help</button>',
    });
  }

  function openLegal() {
    FB.sheet.open({
      title: 'Legal & policies', full: true,
      html: '<div style="padding:0 16px 30px;font:var(--t-sub);color:var(--ink-2);line-height:1.65">' +
        '<div style="padding:2px 0 18px;border-bottom:1px solid var(--line);margin-bottom:18px">' +
          FB.lockup({ size: 30 }) + '</div>' +
        '<p><b style="color:var(--ink)">This application is a work of satire.</b> FoodBang™, every restaurant in it, every menu item, ' +
        'every price, every fee and every modifier are fictional and were invented for parody. The brands depicted are ' +
        'exaggerated inventions and are not affiliated with, endorsed by, or representative of any real company.</p>' +
        '<p>No orders are placed. No payments are processed. No network requests are made. Everything you do here is stored ' +
        'in this browser\'s local storage and is erased when you reset it.</p>' +
        '<p style="color:var(--ink-3)">The remainder of this document is part of the parody.</p>' +
        '<p><b style="color:var(--ink)">Arbitration.</b> By reading this sentence you have agreed to resolve all disputes through a process ' +
        'we will describe later. You have waived the right to be told what it is.</p>' +
        '<p><b style="color:var(--ink)">Fees.</b> Fees are assessed at order time and reassessed at delivery time. Where the two differ, ' +
        'the larger governs. Where they are equal, a Reconciliation Fee applies.</p>' +
        '<p><b style="color:var(--ink)">Data.</b> Your behavioral data is used to improve your experience and the experience of ' +
        'FoodBang™. Where these conflict, FoodBang™ prevails.</p>' +
        '<p><b style="color:var(--ink)">Nutrition.</b> BODYMAX™ is a wellness feature, not a medical device, not a scale, and not an ' +
        'opinion. Its Recommended Daily Intake of 9,400 units is not endorsed by any medical body and was selected internally.</p>' +
        '<p style="margin-top:28px;color:var(--ink-3);font-size:calc(11px * var(--fs))">Last updated: continuously. Prior versions are not retained. ' +
        'You have accepted all of them.</p></div>',
    });
  }
})(window.FB);
