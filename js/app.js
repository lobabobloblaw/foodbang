/* DoorGorge — boot */
(function (DG) {
  'use strict';

  function updateClock() {
    var el = document.querySelector('.sb-time');
    if (el) el.textContent = DG.clock();
  }

  DG.cycleTheme = function () {
    var order = ['system', 'light', 'dark'];
    var cur = DG.S().settings.theme;
    var next = order[(order.indexOf(cur) + 1) % order.length];
    DG.store.set(function (st) { st.settings.theme = next; return st; });
    DG.applyAppearance();
    DG.toast('Theme: ' + next);
  };

  DG.hardReset = function () {
    DG.confirm({
      title: 'Reset all local data?', danger: true, yes: 'Erase', no: 'Cancel',
      body: 'Clears orders, carts, achievements and settings stored in this browser.',
    }).then(function (ok) {
      if (!ok) return;
      DG.store.reset(); DG.applyAppearance(); DG.nav.tab('home');
      DG.toast('All local data erased.');
    });
  };

  DG.updateDeskStats = function () {
    var el = document.getElementById('ds-stats');
    if (!el) return;
    var st = DG.S();
    var m = DG.bodymax.metrics();
    var rows = [
      ['Stores', DG.catalog.count()],
      ['Menu items', DG.int(DG.catalog.itemCount())],
      ['Orders placed', st.meta.orderCount],
      ['Paid in fees', DG.money(st.meta.lifetimeFees)],
      ['Units consumed', DG.int(m.totalCal)],
      ['Trajectory', m.orders ? m.trajectory : '—'],
    ];
    el.innerHTML = rows.map(function (r) {
      return '<div class="dss"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
  };

  function boot() {
    DG.applyAppearance();

    var n = DG.catalog.init(window.DG_MENUS);
    if (!n) {
      document.getElementById('view').innerHTML =
        '<div class="empty"><h3>Menu data missing</h3><p>Run <code>node tools/bundle.mjs</code> to rebuild ' +
        '<code>js/data/menus.generated.js</code>, then reload.</p></div>';
      return;
    }

    DG.shell.init();
    DG.wireItemOpeners();

    /* opening a fee explainer is an achievement, because of course it is */
    DG.on(document, 'click', '[data-why]', function () { DG.bodymax.flag('readFees'); });

    DG.nav.go('home', {}, { silent: true });
    DG.tracker.resume();
    DG.updateDeskStats();

    updateClock();
    setInterval(updateClock, 20000);

    /* first-run welcome */
    if (!DG.S().seen.welcome) {
      setTimeout(function () {
        DG.modal.open({
          html: '<div style="text-align:center;margin-bottom:6px;font-size:34px">🚪</div>' +
            '<h2 style="text-align:center">Welcome to DoorGorge™</h2>' +
            '<p style="text-align:center">A satirical simulation of a food delivery app. Every restaurant, dish, price, ' +
            'fee and modifier is invented. Nothing is ordered, charged, or sent anywhere — it all lives in this browser.</p>' +
            '<p style="text-align:center;font:var(--t-cap);color:var(--ink-3);margin-bottom:18px">' +
            'Watch the fees. That is the whole joke.</p>' +
            '<div class="modal-acts"><button class="btn btn--primary btn--block" data-ok>Start gorging</button></div>',
          dismissible: false,
          onMount: function (b, h) {
            DG.on(b, 'click', '[data-ok]', function () {
              DG.store.set(function (st) { st.seen.welcome = true; return st; });
              h.close();
            });
          },
        });
      }, 500);
    }

    console.log('%cDoorGorge™', 'font:800 20px system-ui;color:#FF2D14',
      '\n' + DG.catalog.count() + ' stores · ' + DG.catalog.itemCount() + ' items loaded.');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DG);
