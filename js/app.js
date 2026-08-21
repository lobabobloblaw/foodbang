/* FoodBang — boot */
(function (FB) {
  'use strict';

  function updateClock() {
    var el = document.querySelector('.sb-time');
    if (el) el.textContent = FB.clock();
    /* the world moves on its own clock, not on navigation */
    if (FB.shell && FB.shell.stampWorld) FB.shell.stampWorld();
  }

  FB.cycleTheme = function () {
    var order = ['system', 'light', 'dark'];
    var cur = FB.S().settings.theme;
    var next = order[(order.indexOf(cur) + 1) % order.length];
    FB.store.set(function (st) { st.settings.theme = next; return st; });
    FB.applyAppearance();
    FB.toast('Theme: ' + next);
  };

  FB.hardReset = function () {
    FB.confirm({
      title: 'Reset all local data?', danger: true, yes: 'Erase', no: 'Cancel',
      body: 'Clears orders, carts, achievements and settings stored in this browser.',
    }).then(function (ok) {
      if (!ok) return;
      FB.store.reset(); FB.applyAppearance(); FB.nav.tab('home');
      FB.toast('All local data erased.');
    });
  };

  FB.updateDeskStats = function () {
    var el = document.getElementById('ds-stats');
    if (!el) return;
    var st = FB.S();
    var m = FB.bodymax.metrics();
    var rows = [
      ['Stores', FB.catalog.count()],
      ['Menu items', FB.int(FB.catalog.itemCount())],
      ['Orders placed', st.meta.orderCount],
      ['Paid in fees', FB.money(st.meta.lifetimeFees)],
      ['Units consumed', FB.int(m.totalCal)],
      ['Trajectory', m.orders ? m.trajectory : '—'],
    ];
    el.innerHTML = rows.map(function (r) {
      return '<div class="dss"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
  };

  /* The splash exists so that the app can say its own name before you have
     asked it for anything. It is held for a beat, then dropped. */
  function hideSplash(now) {
    var el = document.getElementById('splash');
    if (!el || el.classList.contains('out')) return;
    var instant = now || FB.S().settings.motion === 'off' ||
      (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    setTimeout(function () {
      el.classList.add('out');
      setTimeout(function () { el.classList.add('gone'); }, 300);
    }, instant ? 0 : 420);
  }

  function boot() {
    FB.applyAppearance();
    FB.installFavicon();
    FB.paintMarks();

    var n = FB.catalog.init(window.FB_MENUS);
    if (!n) {
      hideSplash(true);
      document.getElementById('view').innerHTML =
        '<div class="empty"><h3>Menu data missing</h3><p>Run <code>npm run bundle</code> to rebuild ' +
        '<code>js/data/menus.generated.js</code>, then reload.</p></div>';
      return;
    }

    FB.shell.init();
    FB.wireItemOpeners();

    /* localStorage can be full, blocked outright, or absent in a private window.
       state.js debounces its writes and would swallow every failure silently, so
       it reports the first one here rather than reaching for the DOM itself. */
    FB.store.onStorageError = function () {
      FB.toast('Local storage is unavailable. This session will not be retained. ' +
        'Your intake will be, in aggregate.', { kind: 'bad', icon: 'alert' });
    };

    /* opening a fee explainer is an achievement, because of course it is */
    FB.on(document, 'click', '[data-why]', function () { FB.bodymax.flag('readFees'); });

    /* three days away is three days of correctly back-dated nagging, computed from
       what the save already knows rather than accrued by a timer */
    /* Standing decays once, here, against a day stamp — never in a render path. */
    var lost = FB.standing.settle();
    FB.notifs.backfill();
    FB.nav.go('home', {}, { silent: true });
    FB.tracker.resume();
    FB.updateDeskStats();
    hideSplash();

    if (lost) {
      var name = FB.standing.name(lost.to);
      FB.toast('Your Standing has been reduced to ' + name + '.', { kind: 'bad', ms: 4200 });
      FB.notifs.push({
        id: 'standing-down:' + name + ':' + Math.floor(Date.now() / 86400000),
        kind: 'promo', icon: 'alert', title: 'Standing reduced to ' + name,
        body: 'Standing decays at one point per day. This is not a penalty; it is an absence of activity.',
        go: 'account',
      });
    }

    updateClock();
    setInterval(updateClock, 20000);

    /* first-run welcome */
    if (!FB.S().seen.welcome) {
      setTimeout(function () {
        FB.modal.open({
          html: '<div style="display:flex;justify-content:center;margin-bottom:10px">' + FB.markTile(54) + '</div>' +
            '<h2 style="text-align:center">Welcome to FoodBang™</h2>' +
            '<p style="text-align:center">A satirical simulation of a food delivery app. Every restaurant, dish, price, ' +
            'fee and modifier is invented. Nothing is ordered, charged, or sent anywhere — it all lives in this browser.</p>' +
            '<p style="text-align:center;font:var(--t-cap);color:var(--ink-3);margin-bottom:18px">' +
            'Your intake profile has been created. Pricing is displayed at checkout, ' +
            'and is displayed accurately.</p>' +
            '<div class="modal-acts"><button class="btn btn--primary btn--block" data-ok>Begin intake</button></div>',
          dismissible: false,
          onMount: function (b, h) {
            FB.on(b, 'click', '[data-ok]', function () {
              FB.store.set(function (st) { st.seen.welcome = true; return st; });
              h.close();
            });
          },
        });
      }, 1050);   /* after the splash has cleared */
    }

    console.log('%cFoodBang™', 'font:800 20px system-ui;color:#FF2D14',
      '\n' + FB.catalog.count() + ' stores · ' + FB.catalog.itemCount() + ' items loaded.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.FB);
