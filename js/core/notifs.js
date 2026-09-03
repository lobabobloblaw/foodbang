/* FoodBang — the notification centre.

   The bell used to open a module-local array of six rows with the literal ages
   "2m" and "31m" baked into them, under a subtitle admitting they were always
   unread. Real events accumulate here now, each with a real timestamp, a kind that
   the six switches in Settings actually gate, and somewhere to go when tapped.

   The backlog is COMPUTED at boot from what the save already knows rather than
   accrued by a timer, which is why closing the app for three days and opening it
   produces three days of correctly back-dated nagging at no storage cost. It must
   therefore be idempotent: `notifs.through` records how far the synthesis has run,
   so booting twice does not produce two copies. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var CAP = 40;

  /* kind -> the settings switch that gates it. A kind with no switch is ungated. */
  var GATE = {
    order: 'orderUpdates',
    promo: 'promos',
    slinger: 'slingerMessages',
    body: 'biometric',
    nightly: 'nightly',
    miss: 'reengagement',
  };

  /* The platform gets less patient, and never stops being polite about it. */
  var MISS_TITLES = [
    'We miss you',
    'We continue to miss you',
    'Your absence has been logged',
    'A review of your account has been scheduled',
    'The review of your account has concluded',
    'No further notifications are planned',
  ];
  var MISS_BODIES = [
    'This has been noted in your intake profile and in nothing else.',
    'Your Standing is unaffected. Standing is affected by ordering.',
    'Absence is not a violation. It is recorded in the same field as one.',
    'No action is required from you. No action is available to you.',
    'The finding was that you have not ordered. The finding has been filed.',
    'You will continue to receive this one.',
  ];

  function gated(kind) {
    var key = GATE[kind];
    if (!key) return false;
    var n = FB.S().settings.notifications || {};
    return n[key] === false;
  }

  /* The joke depends on them being permanently unread, so "Mark all as read" is
     honoured and then quietly undone — stored as a DUE TIME rather than a
     setTimeout, so it survives a reload and cannot fire twice. */
  function unread(n) {
    return !n.read || (n.reReadAt && Date.now() >= n.reReadAt);
  }

  FB.notifs = {
    CAP: CAP,
    GATE: GATE,

    list: function () { return (FB.S().notifs || []).slice(); },
    unreadCount: function () { return (FB.S().notifs || []).filter(unread).length; },
    isUnread: unread,

    /** entry: { kind, icon, title, body, ts, go, params, id } */
    push: function (entry) {
      if (!entry || gated(entry.kind)) return false;
      var e = {
        id: entry.id || FB.uid('n'),
        kind: entry.kind || 'order',
        icon: entry.icon || 'bell',
        title: entry.title || '',
        body: entry.body || '',
        ts: entry.ts || Date.now(),
        go: entry.go || null,
        params: entry.params || null,
        read: false,
        reReadAt: null,
      };
      FB.store.set(function (st) {
        st.notifs = st.notifs || [];
        /* an id already present means this event has been synthesised before —
           the boot backlog runs every launch and must not stack */
        if (st.notifs.some(function (x) { return x.id === e.id; })) return st;
        st.notifs.unshift(e);
        st.notifs.sort(function (a, b) { return b.ts - a.ts; });
        if (st.notifs.length > CAP) st.notifs.length = CAP;
        return st;
      }, { silent: true });
      return true;
    },

    /** push many in ONE state write — the boot backlog can be a dozen at once */
    pushMany: function (entries) {
      var keep = entries.filter(function (e) { return e && !gated(e.kind); });
      if (!keep.length) return 0;
      var added = 0;
      FB.store.set(function (st) {
        st.notifs = st.notifs || [];
        keep.forEach(function (entry) {
          var id = entry.id || FB.uid('n');
          if (st.notifs.some(function (x) { return x.id === id; })) return;
          st.notifs.unshift({
            id: id, kind: entry.kind || 'order', icon: entry.icon || 'bell',
            title: entry.title || '', body: entry.body || '', ts: entry.ts || Date.now(),
            go: entry.go || null, params: entry.params || null, read: false, reReadAt: null,
          });
          added++;
        });
        st.notifs.sort(function (a, b) { return b.ts - a.ts; });
        if (st.notifs.length > CAP) st.notifs.length = CAP;
        return st;
      }, { silent: true });
      return added;
    },

    markAllRead: function () {
      var now = Date.now();
      FB.store.set(function (st) {
        (st.notifs || []).forEach(function (n, i) {
          n.read = true;
          /* one at a time, over the following few minutes */
          n.reReadAt = now + (i + 1) * 45000;
        });
        return st;
      });
    },

    /* You paid to be told once. Told once, and the monitoring stops — otherwise the
       Restock Monitoring fee is charged on every future order at every store for the
       rest of the save, for a notification that never arrives. */
    /* The local day the last settle saw. Scarcity turns over at midnight, so a tab
       left open across it is looking at yesterday's menu until something says so.
       Lives here rather than in app.js because app.js boots on load and is skipped
       by the test harness — logic parked there cannot be checked at all. */
    _day: null,

    /* Call on a timer. Reports whether the local day rolled since the last call and
       how many monitorings that discharged; the first call only records the day. */
    settleDay: function (at) {
      var now = at || Date.now();
      var day = new Date(now).toDateString();
      var prev = FB.notifs._day;
      FB.notifs._day = day;
      if (prev === null || prev === day) return { rolled: false, settled: 0 };
      return { rolled: true, settled: FB.notifs.restocks(now) };
    },

    /* The ids still being monitored FOR SOMETHING — that is, whose item is still out.
       st.restock is only settled at boot, so a session that crosses local midnight
       kept billing $1.40 an order for an item the same app was rendering as back in
       stock. A pure read: FB.catalog.available is seeded and stores nothing, so this
       is safe to call from a render path, which both fee call sites are. */
    monitored: function (at) {
      return (FB.S().restock || []).filter(function (id) {
        var f = FB.catalog.find(id);
        return f && !FB.catalog.available(f.item, at);
      });
    },

    restocks: function (at) {
      var st = FB.S();
      var ids = (st.restock || []).slice();
      if (!ids.length) return 0;
      var now = at || Date.now();
      var back = [], keep = [], gone = [];
      ids.forEach(function (id) {
        var found = FB.catalog.find(id);
        /* An id the catalog no longer knows landed in neither list: the monitoring
           lingered in st.restock forever and, whenever another item came back, was
           silently dropped instead. You paid to be told, so you are told. */
        if (!found) { gone.push(id); return; }
        if (FB.catalog.available(found.item, now)) back.push(found); else keep.push(id);
      });
      if (!back.length && !gone.length) return 0;
      var added = FB.notifs.pushMany(gone.map(function (id) {
        return {
          id: 'restock-gone:' + id, kind: 'restock', icon: 'bell',
          title: 'A monitored item has been withdrawn',
          body: 'The restaurant no longer lists it. The monitoring you paid for is discharged; the fee is not.',
          ts: now,
        };
      }).concat(back.map(function (f) {
        return {
          id: 'restock:' + f.item.id + ':' + Math.floor(now / 86400000),
          /* Deliberately an UNGATED kind. You paid to be told once, and the id is
             dropped from st.restock as soon as this runs — so if a settings switch
             could suppress it, the monitoring would be discharged without ever
             delivering, and the item could then be re-armed and billed again. */
          kind: 'restock', icon: 'bell',
          title: f.item.name + ' is available again',
          body: 'You were told once, which discharges the monitoring you paid for.',
          ts: now, go: 'store', params: { slug: f.store.slug },
        };
      })));
      FB.store.set(function (s) { s.restock = keep; return s; }, { silent: true });
      return added;
    },

    /* Computed from what the save already knows, not accrued by a timer. Runs at
       boot, is capped, and is keyed by a deterministic id so running it twice is a
       no-op. `through` is a stamp, not a count: a count would drift. */
    backfill: function () {
      var st = FB.S();
      var now = Date.now();
      var orders = st.orders || [];
      var since = orders.length ? orders[0].placedAt : (st.meta && st.meta.installedAt) || now;
      var through = st.notifsThrough || 0;
      var from = Math.max(since, through);
      var out = [];

      /* One nag per full day since the last order, each dated at the day it would
         have been sent and reporting the gap AS IT WAS THEN — three identical "you
         have not ordered in 3 days" rows is a backlog that admits it was generated
         all at once. It also gets less patient. */
      var days = Math.floor((now - from) / 86400000);
      for (var d = 1; d <= Math.min(days, 6); d++) {
        var ts = from + d * 86400000;
        var elapsed = Math.max(1, Math.round((ts - since) / 86400000));
        out.push({
          id: 'miss:' + Math.floor(ts / 86400000),
          kind: 'miss', icon: 'bell',
          /* Indexed by the GAP, not by the loop counter. `d` counts days added on
             THIS launch, so someone who opens the app daily always saw rung one —
             a fresh "We miss you (15 days)" sitting above an older "No further
             notifications are planned (6 days)". */
          title: MISS_TITLES[Math.min(elapsed, MISS_TITLES.length) - 1],
          body: 'You have not ordered in ' + FB.plural(elapsed, 'day') + '. ' +
            MISS_BODIES[Math.min(elapsed, MISS_BODIES.length) - 1],
          ts: ts,
        });
      }
      /* The nightly summary the Settings row promises, "Delivered at 2:40 AM", which
         the app had never once delivered — `nightly` was a GATE entry with no
         emitter, so the switch was inert in both positions. Back-dated to the 2:40
         it claims, computed from what the save already knows, capped with everything
         else, and keyed by the day so running twice is a no-op. Only for days that
         had an order: a summary of nothing is a notification nobody asked for. */
      var nights = [];
      for (var n = 1; n <= Math.min(days, 6); n++) {
        var at = new Date(from + n * 86400000);
        var slot = new Date(at.getFullYear(), at.getMonth(), at.getDate(), 2, 40, 0).getTime();
        if (slot > now) continue;
        /* The previous CALENDAR day, midnight to midnight, both by the local
           constructor: `midnight - 86400000` is an hour off across a daylight-saving
           change, and an order placed in that hour fell into no summary at all. */
        var dayStart = new Date(at.getFullYear(), at.getMonth(), at.getDate() - 1).getTime();
        var dayEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
        var sum = orders.filter(function (o) { return o.placedAt >= dayStart && o.placedAt < dayEnd; });
        if (!sum.length) continue;
        var spent = FB.sum(sum, function (o) { return (o.calc && o.calc.total) || 0; });
        nights.push({
          id: 'nightly:' + Math.floor(slot / 86400000),
          kind: 'nightly', icon: 'clock',
          title: 'Your nightly summary',
          body: FB.plural(sum.length, 'order') + ', ' + FB.money(spent) + '. ' +
            'This summary is generated at 2:40 AM and is not adjustable.',
          ts: slot, go: 'bodymax',
        });
      }

      /* An actual promotion, on the kind whose switch is named for it. Moving the
         four ACCOUNT records off 'promo' — a BangBux expiry is not an offer — left
         nothing emitting it at all, so the "Promotions · Up to 14 per day" switch
         became inert in the other direction. The menus already carry the offers;
         this advertises one. Seeded on the day so it never reshuffles, back-dated
         like everything else here, and one a day rather than fourteen because the
         joke is the promise, not the volume. */
      var promos = [];
      var stores = (FB.catalog && FB.catalog.all) ? FB.catalog.all().filter(function (st2) {
        return (st2.promos || []).some(function (pr) { return pr.text; });
      }) : [];
      if (stores.length) {
        for (var q = 1; q <= Math.min(days, 6); q++) {
          var pts = from + q * 86400000;
          if (pts > now) continue;
          var day = Math.floor(pts / 86400000);
          var pick = stores[FB.hash('promo:' + day) % stores.length];
          var offer = (pick.promos || []).filter(function (pr) { return pr.text; })[0];
          promos.push({
            id: 'promo:' + day,
            kind: 'promo', icon: 'tag',
            title: pick.name + ' has an offer',
            body: offer.text + ' Conditions apply and are not listed here.',
            ts: pts, go: 'store', params: { slug: pick.slug },
          });
        }
      }

      var added = FB.notifs.pushMany(out.concat(nights).concat(promos));
      FB.store.set(function (s) { s.notifsThrough = now; return s; }, { silent: true });
      added += FB.notifs.restocks(now);
      return added;
    },
  };
})(window.FB);
