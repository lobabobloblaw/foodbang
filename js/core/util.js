/* FoodBang — utilities, formatting, DOM helpers */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  /* ---------- escaping / html ---------- */
  var ENT = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  FB.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ENT[c]; });
  };
  FB.attr = function (s) { return FB.esc(s).replace(/\n/g, '&#10;'); };

  /* tagged template that escapes interpolations unless wrapped in FB.raw() */
  function Raw(v) { this.v = v; }
  FB.raw = function (v) { return new Raw(v); };
  FB.html = function (strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) {
      var v = arguments[i];
      if (v instanceof Raw) out += v.v;
      else if (Array.isArray(v)) out += v.map(function (x) { return x instanceof Raw ? x.v : FB.esc(x); }).join('');
      else if (v === null || v === undefined || v === false) out += '';
      else out += FB.esc(v);
      out += strings[i];
    }
    return out;
  };

  /* ---------- money & numbers ---------- */
  FB.round2 = function (n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; };
  FB.money = function (n, opts) {
    n = FB.round2(n || 0);
    var o = opts || {};
    if (n === 0 && o.free) return 'Free';
    var neg = n < 0;
    var s = '$' + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (o.plus && n > 0) s = '+' + s;
    return neg ? '−' + s : s;
  };
  FB.moneyShort = function (n) {
    n = FB.round2(n || 0);
    return n % 1 === 0 ? '$' + n.toFixed(0) : '$' + n.toFixed(2);
  };
  FB.int = function (n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  FB.compact = function (n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace(/\.0$/, '') + 'K';
    return String(n);
  };
  FB.pct = function (n, d) { return (Number(n) || 0).toFixed(d == null ? 0 : d) + '%'; };
  FB.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  FB.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------- time ---------- */
  FB.mins = function (a, b) { return b && b !== a ? a + '–' + b + ' min' : a + ' min'; };
  FB.clock = function (d) {
    d = d || new Date();
    var h = d.getHours(), m = d.getMinutes(), ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  };
  FB.clockIn = function (minutes) { return FB.clock(new Date(Date.now() + minutes * 60000)); };
  /* the inverse of FB.clock: "3:45 PM" -> 945. Returns null on anything it does not
     recognise, so a caller can fall back rather than compute with NaN. */
  FB.minsOfDay = function (str) {
    var m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(String(str || ''));
    if (!m) return null;
    var h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    var ap = (m[3] || '').toUpperCase();
    if (ap === 'PM' && h < 12) h += 12;
    if (ap === 'AM' && h === 12) h = 0;
    return h * 60 + min;
  };
  /* the next wall-clock occurrence of a minutes-of-day, at or after `from`.

     Rolls forward by a calendar DAY, not by a fixed 86400000: a day containing a
     daylight-saving change is 23 or 25 hours long, and adding 24 landed the answer
     an hour off the wall-clock minute it was asked for. That drift reached the
     schedule sheet's pre-checked row, the stored-slot recheck in cart.js and the
     order timetable in tracker.js, which between them started a scheduled order an
     hour before its store opened.

     A spring-forward morning has no 2:30 AM; Date normalises it to 3:30 AM, which is
     the honest answer and is what a real kitchen would do with it. */
  FB.nextAtMinute = function (mins, from) {
    if (mins == null) return null;
    var now = from || Date.now();
    var base = new Date(now);
    var t = new Date(base.getFullYear(), base.getMonth(), base.getDate(), Math.floor(mins / 60), mins % 60, 0, 0).getTime();
    if (t > now) return t;
    return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1,
                    Math.floor(mins / 60), mins % 60, 0, 0).getTime();
  };
  /* Anchored at local midnight and ROUNDED, not floored. The gap between two local
     midnights is 23 or 25 hours across a daylight-saving change, so dividing by a
     flat 86400000 and flooring made every span crossing one a day short: yesterday's
     order read "Today", and two orders from different days both read "Yesterday".
     Rounding is exact here — n calendar days is n*24h +/- 1h, within 0.042 of n.

     `dd > 1` on the weekday branch as well: a FUTURE date used to fall into it and
     come back as a bare weekday name, so BANG+ said "Renews Sun" for a date a month
     out. Future dates now reach the month/day path with everything else. */
  FB.dayLabel = function (ts) {
    /* Date.now(), not `new Date()`: the test harness patches Date.now inside the vm
       and leaves the constructor alone, so a bare `new Date()` here reads the real
       wall clock and this function cannot be travelled in time at all. */
    var d = new Date(ts), now = new Date(Date.now());
    var a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var dd = Math.round((a - b) / 86400000);
    if (dd === 0) return 'Today';
    if (dd === 1) return 'Yesterday';
    if (dd > 1 && dd < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getDate();
  };
  FB.ago = function (ts) {
    var s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  };

  /* ---------- ids & rng ---------- */
  var seq = 0;
  FB.uid = function (p) { seq++; return (p || 'id') + '_' + Date.now().toString(36) + seq.toString(36); };
  /* deterministic hash-based rng so generated flavor stays stable per key */
  FB.hash = function (str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
  };
  FB.seeded = function (key) {
    var s = FB.hash(String(key)) || 1;
    return function () { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  };
  FB.pick = function (arr, rnd) { return arr[Math.floor((rnd ? rnd() : Math.random()) * arr.length)]; };
  FB.shuffle = function (arr, rnd) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor((rnd ? rnd() : Math.random()) * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };

  /* ---------- dom ---------- */
  FB.qs = function (sel, root) { return (root || document).querySelector(sel); };
  FB.qsa = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  FB.frag = function (html) {
    var t = document.createElement('template'); t.innerHTML = String(html).trim();
    return t.content;
  };
  FB.node = function (html) { return FB.frag(html).firstElementChild; };
  /* While a screen is mounting, the shell parks an array here and every listener
     bound during that mount is recorded in it. Screens delegate onto #view and
     #appbar, which outlive the screen, so without this a re-render would leave
     the previous mount's handlers attached and every click would fire twice,
     then three times, then four. */
  FB._binds = null;

  /* delegated listener; returns an unbind fn */
  FB.on = function (root, type, sel, fn, opts) {
    var off;
    if (typeof sel === 'function') {
      root.addEventListener(type, sel, fn);
      off = function () { root.removeEventListener(type, sel, fn); };
    } else {
      var h = function (e) {
        var t = e.target.closest ? e.target.closest(sel) : null;
        if (t && root.contains(t)) fn.call(t, e, t);
      };
      root.addEventListener(type, h, opts);
      off = function () { root.removeEventListener(type, h, opts); };
    }
    if (FB._binds) FB._binds.push(off);
    return off;
  };
  FB.debounce = function (fn, ms) {
    var t; return function () { var a = arguments, c = this; clearTimeout(t); t = setTimeout(function () { fn.apply(c, a); }, ms || 180); };
  };
  FB.raf = function (fn) { return requestAnimationFrame(fn); };
  FB.nextTick = function (fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); };

  /* haptic-ish feedback: a tiny scale pulse is all a browser can honestly offer */
  FB.tap = function (el) {
    if (!el || document.documentElement.dataset.motion === 'off') return;
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} }
  };

  /* ---------- misc ---------- */
  FB.titleCase = function (s) { return String(s).replace(/(^|[\s-])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); }); };
  FB.plural = function (n, s, p) { return n + ' ' + (n === 1 ? s : (p || s + 's')); };
  FB.groupBy = function (arr, fn) {
    return arr.reduce(function (acc, x) { var k = fn(x); (acc[k] = acc[k] || []).push(x); return acc; }, {});
  };
  FB.sum = function (arr, fn) { return arr.reduce(function (a, x) { return a + (fn ? fn(x) : x); }, 0); };
  FB.deep = function (o) { return JSON.parse(JSON.stringify(o)); };
  FB.ordinal = function (n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  /* The scroll behaviour a caller may use. The reduced-motion rules in tokens.css
     neutralise animations and transitions and cannot reach a programmatic smooth
     scroll, so five call sites animated anyway — one of them from inside a scroll
     handler. Same predicate the splash uses. */
  FB.smooth = function () {
    if (document.documentElement.dataset.motion === 'off') return 'auto';
    if (document.documentElement.dataset.motion !== 'on' &&
        window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return 'auto';
    return 'smooth';
  };
  FB.scrollTop = function (smooth) {
    var v = document.getElementById('view');
    if (v) v.scrollTo({ top: 0, behavior: smooth ? FB.smooth() : 'auto' });
  };
})(window.FB);
