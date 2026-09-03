/* FoodBang — store page */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var activeSec = null;
  var offScroll = null;

  FB.screens.register('store', {
    tab: 'home',
    immersive: true,
    appbar: function (p) {
      var s = FB.catalog.get(p.slug); if (!s) return '';
      return '<div class="st-bar" id="stbar"><div class="bar">' +
        '<button class="iconbtn" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
        /* not a second <h1>: the body below carries the page's heading, and this
            bar only repeats it once the hero has scrolled away */
        '<b class="st-bar-t trunc1">' + FB.esc(s.name) + '</b>' +
        '<button class="iconbtn" data-storeinfo aria-label="Store info">' + FB.icon('info', 19) + '</button>' +
        '</div></div>';
    },
    render: function (p) {
      var s = FB.catalog.get(p.slug);
      if (!s) return FB.C.empty({ title: 'Store unavailable', body: 'This location has been reclassified.' });
      var fav = FB.store.isFav(s.slug);

      var h = '<div class="st-hero"><img src="' + s.heroSrc + '" alt="" onerror="this.style.opacity=0"></div>' +
        '<div class="st-float">' +
          '<button class="iconbtn iconbtn--glass" data-back aria-label="Back">' + FB.icon('back', 20) + '</button>' +
          '<span class="sp"></span>' +
          '<button class="iconbtn iconbtn--glass" data-share aria-label="Share">' + FB.icon('share', 19) + '</button>' +
          '<button class="iconbtn iconbtn--glass" data-fav aria-label="Save">' + FB.icon(fav ? 'heartFill' : 'heart', 19) + '</button>' +
        '</div>';

      h += '<div class="st-head">' +
        '<img class="st-logo" src="' + s.logoSrc + '" alt="" onerror="this.style.opacity=0">' +
        '<h1>' + FB.esc(s.name) + '</h1>' +
        '<div class="st-tag">' + FB.esc(s.tagline) + '</div>' +
        '<div class="st-facts">' + FB.C.storeMeta(s) + '</div>' +
        '<div class="st-facts" style="margin-top:5px">' +
          FB.icon('clock', 14) + '<span>' + FB.mins(s.deliveryMin, s.deliveryMax) + '</span>' +
          '<i class="dot-sep"></i>' + FB.icon('bike', 14) +
          '<span>' + (s.deliveryFee === 0 ? '$0 delivery fee' : FB.money(s.deliveryFee) + ' delivery fee') + '</span>' +
          '<i class="dot-sep"></i><span>' +
            (FB.catalog.isOpen(s) ? 'Closes ' + FB.esc(s.closesAt) : 'Opens ' + FB.esc(s.opensAt)) + '</span>' +
        '</div>' +
        '<p class="st-about">' + FB.esc(s.about) + '</p>' +
        '<div class="st-quick">' +
          '<button class="chip chip--outline" data-storeinfo>' + FB.icon('info', 14) + 'Store info</button>' +
          '<button class="chip chip--outline" data-reviews>' + FB.icon('starFill', 14) + s.rating.toFixed(1) + ' (' + FB.compact(s.ratingCount) + ')</button>' +
          (s.bangPlus ? '<span class="chip badge--plus" style="height:34px">' + FB.icon('zap', 14) + 'BANG+</span>' : '') +
        '</div>' +
      '</div>';

      if (!FB.catalog.isOpen(s)) {
        h += '<div class="st-ann st-ann--shut">' + FB.icon('clock', 16) +
          '<span>The counter is closed. Your order can be scheduled for ' + FB.esc(s.opensAt) +
          '. Scheduling requires the future, which must be reserved.</span></div>';
      }
      if (s.announcement) {
        h += '<div class="st-ann">' + FB.icon('alert', 16) + '<span>' + FB.esc(s.announcement) + '</span></div>';
      }
      if (s.promos && s.promos.length) {
        /* the ones with arithmetic behind them say where you stand; the fourteen
           without say nothing extra, because there is nothing to say */
        var subNow = FB.cart.subtotal(s.slug);
        var live = FB.catalog.storeOffer(s, subNow, FB.store.isPlus());
        h += '<div style="padding:12px 16px 0;display:flex;flex-direction:column;gap:7px">' + s.promos.map(function (pr) {
          var applied = live && live.text === pr.text;
          var note = '';
          if (applied) note = ' · applied automatically';
          else if (pr.kind === 'spendSave') {
            note = subNow > 0
              ? ' · applies at ' + FB.money(pr.min) + '. You are ' + FB.money(FB.round2(pr.min - subNow)) + ' away.'
              : ' · applies at ' + FB.money(pr.min);
          } else if (pr.kind === 'plusFlat' && !FB.store.isPlus()) {
            note = ' · members only';
          }
          return '<div class="badge badge--promo' + (applied ? ' is-on' : '') +
            '" style="height:auto;padding:8px 11px;font:var(--t-sub);align-self:flex-start">' +
            FB.icon('tag', 13) + FB.esc(pr.text) + (note ? '<span style="opacity:.7">' + FB.esc(note) + '</span>' : '') + '</div>';
        }).join('') + '</div>';
      }

      /* the toggle writes to this store's own cart, which is what checkout reads —
         it is not a per-page preference and it does not follow you to another store */
      var mode = FB.cart.co(s.slug).mode;
      h += '<div class="st-modes">' +
        '<button data-mode="delivery" aria-pressed="' + (mode === 'delivery') + '">Delivery · ' + FB.mins(s.deliveryMin, s.deliveryMax) + '</button>' +
        '<button data-mode="pickup" aria-pressed="' + (mode === 'pickup') + '">Pickup · ' + s.distanceMi.toFixed(1) + ' mi</button>' +
      '</div>';

      h += '<div class="catnav"><div class="rail">' + s.menu.map(function (sec, i) {
        return '<button class="chip' + (i === 0 ? ' is-on' : '') + '" data-jump="' + sec.id + '"' +
          (i === 0 ? ' aria-current="true"' : '') + '>' + FB.esc(sec.name) + '</button>';
      }).join('') + '</div></div>';

      h += s.menu.map(function (sec) {
        /* Five sections already named their own window — "Lunch Specials (Ended at
           3:00)", "Morning Service Window", "The Fourth Meal Protocol" — and the app
           served them at every hour regardless. */
        var live = FB.catalog.sectionOpen(sec);
        return '<section class="msec' + (live ? '' : ' is-shut') + '" id="sec-' + sec.id + '">' +
          '<h2>' + FB.esc(sec.name) +
            (live ? '' : '<span class="msec-off">' + FB.esc(sec.daypart.from) + '–' + FB.esc(sec.daypart.to) +
              ' · it is ' + FB.esc(FB.clock()) + '</span>') + '</h2>' +
          (sec.blurb ? '<p>' + FB.esc(sec.blurb) + '</p>' : '') +
          sec.items.map(function (it) { return FB.C.menuItem(it, s); }).join('') +
        '</section>';
      }).join('');

      h += '<section class="sec" style="padding-top:20px">' + FB.C.sectionHead('Ratings & reviews', s.rating.toFixed(1) + ' from ' + FB.int(s.ratingCount) + ' ratings') +
        (s.reviews || []).map(function (r) {
          return '<div class="reviewcard"><div class="rv-h">' +
            '<span class="rv-a">' + FB.esc(r.name.slice(0, 1)) + '</span>' +
            '<b>' + FB.esc(r.name) + '</b>' + FB.starRow(r.stars) +
            '<span class="rv-d">' + FB.esc(r.date) + '</span></div>' +
            '<p>' + FB.esc(r.text) + '</p></div>';
        }).join('') + '</section>';

      h += '<div class="fineprint">' + FB.esc(s.name) + ' is a fictional establishment. ' +
        FB.esc(s.address) + ' is not a place. Menu prices exclude required selections, which are not optional. ' +
        'Calorie counts are estimates provided by the establishment and are not, in the establishment\'s own words, "load-bearing."</div>';

      return h;
    },

    mount: function (root, p) {
      var s = FB.catalog.get(p.slug); if (!s) return;

      FB.on(root, 'click', '[data-mode]', function (e, t) {
        FB.cart.setCo(s.slug, { mode: t.dataset.mode }); FB.nav.refresh();
        FB.toast(t.dataset.mode === 'pickup' ? 'Pickup selected. Retrieval fees now apply.' : 'Delivery selected.');
      });
      FB.on(root, 'click', '[data-fav]', function () {
        FB.store.set(function (st) {
          var i = st.favorites.indexOf(s.slug);
          if (i > -1) st.favorites.splice(i, 1); else st.favorites.push(s.slug);
          return st;
        });
        FB.toast(FB.store.isFav(s.slug) ? 'Saved. We will remind you about this.' : 'Removed. We will remind you about this.');
        FB.nav.refresh();
      });
      FB.on(root, 'click', '[data-share]', function () {
        FB.toast('Link copied. It contains a referral code that benefits us.', { icon: 'share' });
      });
      FB.on(root, 'click', '[data-jump]', function (e, t) {
        var el = document.getElementById('sec-' + t.dataset.jump);
        if (el) root.scrollTo({ top: el.offsetTop - 96, behavior: FB.smooth() });
      });
      FB.on(root, 'click', '[data-storeinfo]', function () { openInfo(s); });
      FB.on(root, 'click', '[data-reviews]', function () {
        var el = root.querySelector('.sec:last-of-type');
        if (el) root.scrollTo({ top: el.offsetTop - 60, behavior: FB.smooth() });
      });
      FB.on(document.getElementById('appbar'), 'click', '[data-storeinfo]', function () { openInfo(s); });

      /* sticky compact bar + category highlight */
      var bar = document.getElementById('stbar');
      var chips = FB.qsa('[data-jump]', root);
      var secs = s.menu.map(function (sec) { return { id: sec.id, el: document.getElementById('sec-' + sec.id) }; });
      var dev = document.getElementById('device');
      function onScroll() {
        var y = root.scrollTop;
        /* READS first, then writes. The class toggles below invalidate layout, and
           reading offsetTop after them forced a synchronous reflow per section on
           every scroll event. */
        var cur = secs[0] && secs[0].id;
        for (var i = 0; i < secs.length; i++) { if (secs[i].el && secs[i].el.offsetTop - 130 <= y) cur = secs[i].id; }
        if (bar) bar.classList.toggle('on', y > 170);
        dev.classList.toggle('scrolled', y > 170);
        if (cur !== activeSec) {
          activeSec = cur;
          chips.forEach(function (c) {
            var on = c.dataset.jump === cur;
            c.classList.toggle('is-on', on);
            if (on) c.setAttribute('aria-current', 'true'); else c.removeAttribute('aria-current');
          });
          var on = chips.filter(function (c) { return c.dataset.jump === cur; })[0];
          if (on) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: FB.smooth() });
        }
      }
      offScroll = FB.on(root, 'scroll', onScroll, { passive: true });
      activeSec = null; onScroll();
    },
    unmount: function () {
      if (offScroll) { offScroll(); offScroll = null; }
      document.getElementById('device').classList.remove('scrolled');
    },
  });

  function openInfo(s) {
    FB.sheet.open({
      title: s.name,
      sub: s.cuisine + ' · ' + s.distanceMi.toFixed(1) + ' mi away',
      html: '<div style="padding:0 16px 22px">' +
        '<p style="font:var(--t-body);color:var(--ink-2);line-height:1.55;margin:0 0 16px">' + FB.esc(s.about) + '</p>' +
        row('pin', 'Address', s.address) +
        row('clock', 'Hours', FB.esc(s.opensAt) + ' – ' + FB.esc(s.closesAt) + ' · ' +
          (FB.catalog.isOpen(s) ? 'open now' : 'closed now')) +
        row('bike', 'Delivery', FB.mins(s.deliveryMin, s.deliveryMax) + ' · ' + (s.deliveryFee === 0 ? 'No delivery fee' : FB.money(s.deliveryFee) + ' delivery fee')) +
        row('starFill', 'Rating', s.rating.toFixed(1) + ' from ' + FB.int(s.ratingCount) + ' ratings') +
        row('utensils', 'Menu', FB.plural(s.itemCount, 'item') + ' across ' + FB.plural(s.menu.length, 'section')) +
        row('shield', 'Compliance', 'Inspected. Result withheld pending appeal.') +
        '</div>',
      footer: '<button class="btn btn--dark btn--block" data-sheet-close>Close</button>',
    });
  }
  function row(icon, k, v) {
    return '<div class="crow" style="padding-left:0;padding-right:0">' + FB.icon(icon, 19) +
      '<span class="crow-b"><b>' + FB.esc(k) + '</b><span>' + FB.esc(v) + '</span></span></div>';
  }
})(window.FB);
