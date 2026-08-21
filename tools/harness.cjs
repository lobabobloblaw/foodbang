/* FoodBang — headless app loader for the smoke tests.

   Every screen's render() and appbar() is a pure string function that never
   touches the DOM — that is an architectural rule, not an accident — so the whole
   UI layer can be exercised without a browser. This loads index.html's ordered
   <script> list into one vm realm behind a stub document, which is enough for all
   twenty files except js/app.js, which boots on load and is deliberately skipped.

   The stub is intentionally dumb. If a screen ever starts reading real layout out
   of it, that screen has broken the rule and the harness SHOULD fail. */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

function stubEl(tag) {
  const attrs = {};
  const el = {
    tagName: String(tag || 'div').toUpperCase(),
    id: '', className: '', innerHTML: '', textContent: '', value: '',
    dataset: {}, style: {}, children: [], scrollTop: 0, offsetParent: null,
    isConnected: true, parentNode: null,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    removeAttribute(k) { delete attrs[k]; },
    hasAttribute(k) { return Object.prototype.hasOwnProperty.call(attrs, k); },
    /* These have to be REAL. FB.toast trims its stack with
       `while (root.children.length >= 2) root.removeChild(root.firstElementChild)`,
       so a removeChild that does not remove is an infinite loop on the third toast —
       which is exactly how it presented: a test that hung with no output. */
    appendChild(c) { el.children.push(c); c.parentNode = el; return c; },
    removeChild(c) {
      const i = el.children.indexOf(c);
      if (i > -1) el.children.splice(i, 1);
      if (c) c.parentNode = null;
      return c;
    },
    replaceChild(a, b) {
      const i = el.children.indexOf(b);
      if (i > -1) el.children[i] = a; else el.children.push(a);
      /* reparent, or the SECOND paint throws: shell.js's freshRoot() does
         el.parentNode.replaceChild(next, el) every time, so the replacement must
         inherit the parent or navigating twice is untestable */
      if (a) a.parentNode = el;
      if (b) b.parentNode = null;
      return b;
    },
    get firstElementChild() { return el.children[0] || null; },
    insertAdjacentHTML() {},
    addEventListener() {}, removeEventListener() {},
    /* returns another stub rather than null so mount-time and toast-time code
       degrades instead of throwing. Layout still reads as nothing — offsetParent is
       null and every rect is zero — so a screen that tries to measure still fails. */
    querySelector() { return stubEl('div'); },
    querySelectorAll() { return []; },
    closest() { return null; },
    contains() { return false; },
    focus() {}, blur() {}, click() {},
    scrollIntoView() {}, scrollTo() {},
    getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
  };
  return el;
}

function stubDocument() {
  const byId = {};
  const doc = {
    documentElement: stubEl('html'),
    head: stubEl('head'),
    body: stubEl('body'),
    activeElement: null,
    getElementById(id) {
      if (!byId[id]) {
        const el = stubEl('div');
        el.id = id;
        /* a parent, because shell.js's freshRoot() replaces #view and #appbar in
           their parent on every paint — without one, boot throws on the first
           render and the whole boot path stays untested */
        const parent = stubEl('div');
        parent.appendChild(el);
        byId[id] = el;
      }
      return byId[id];
    },
    createElement(tag) { return stubEl(tag); },
    createTextNode(t) { return { textContent: t }; },
    querySelector() { return stubEl('div'); },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {},
  };
  return doc;
}

/* A localStorage that actually stores, so state.js round-trips like the real one. */
function stubStorage() {
  const map = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
    setItem(k, v) { map[k] = String(v); },
    removeItem(k) { delete map[k]; },
    clear() { Object.keys(map).forEach((k) => delete map[k]); },
  };
}

/* The ordered <script> list IS the dependency graph — read it rather than
   restating it, so a file added to index.html is picked up here automatically. */
function scriptList() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const out = [];
  const re = /<script src="([^"]+)"><\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/* opts.savedState: an object written into localStorage under the app's own key
   BEFORE state.js loads, so migrate() runs on it exactly as it would in a browser.
   The key is read off a previously-loaded app rather than spelled out here — it
   carries the brand, and tools/rebrand.cjs does not rewrite this file. */
function loadApp(opts) {
  opts = opts || {};
  const sandbox = {};
  const ctx = vm.createContext(sandbox);
  const doc = stubDocument();

  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  sandbox.document = doc;
  sandbox.localStorage = stubStorage();
  if (opts.savedState) sandbox.localStorage.setItem(opts.storageKey, JSON.stringify(opts.savedState));
  sandbox.console = console;
  /* Timers are tracked so dispose() can clear them. state.js debounces its writes
     through setTimeout, so without this the smoke run renders everything, prints
     its results, and then simply never exits. */
  const timers = new Set();
  sandbox.setTimeout = (fn, ms) => { const t = setTimeout(fn, ms); timers.add(t); return t; };
  sandbox.clearTimeout = (t) => { timers.delete(t); return clearTimeout(t); };
  sandbox.setInterval = (fn, ms) => { const t = setInterval(fn, ms); timers.add(t); return t; };
  sandbox.clearInterval = (t) => { timers.delete(t); return clearInterval(t); };
  sandbox.requestAnimationFrame = (fn) => sandbox.setTimeout(fn, 0);
  sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.scrollTo = () => {};
  sandbox.history = { pushState() {}, replaceState() {} };
  sandbox.location = { hash: '', href: 'http://localhost/' };
  sandbox.navigator = { userAgent: 'harness', vibrate() {} };

  const files = scriptList();
  const skipped = [];
  for (const rel of files) {
    if (rel === 'js/app.js') { skipped.push(rel); continue; }  /* boots on load */
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    try {
      vm.runInContext(src, ctx, { filename: rel });
    } catch (e) {
      throw new Error('loading ' + rel + ': ' + e.message);
    }
  }

  const FB = sandbox.FB;
  if (!FB) throw new Error('no FB global after loading ' + files.length + ' files');
  FB.catalog.init(sandbox.FB_MENUS);
  const dispose = () => {
    timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
    timers.clear();
  };
  /* Built-ins live in the vm realm, not on the sandbox object, so Date cannot be
     reached from out here. run() is how a test travels in time — which the wall
     clock in js/sim/tracker.js is otherwise untestable without. */
  const run = (code) => vm.runInContext(code, ctx, { filename: 'harness-eval' });
  const clock = {
    set(ts) { run('Date.now = function () { return ' + ts + '; };'); return ts; },
    /* the realm's clock, not Node's — reaching for Date.now() out here is the trap */
    now() { return run('Date.now()'); },
    advance(ms) { return clock.set(clock.now() + ms); },
    restore() { run('delete Date.now;'); },
  };
  return { win: sandbox, FB, files, skipped, doc, dispose, run, clock };
}

/* ---------------- fixtures ---------------- */

/* Build a cart through the REAL cart API, so a change to line shape or pricing
   shows up here rather than being re-stated by the fixture. */
function addToCart(FB, slug, n) {
  const store = FB.catalog.get(slug);
  const items = [];
  /* SELLABLE items only. Scarcity is seeded on the item and the local DAY, and its
     threshold samples the world at a local 7 PM whose EPOCH moves with the zone — so
     which items are out genuinely differs between Los Angeles, Berlin and Tokyo.
     Once checkout learned to refuse a basket holding an unavailable line, any fixture
     that happened to scoop one up stopped rendering a receipt at all, and three of
     five timezones went red on a check about something else entirely.
     A fixture asking for n items wants n BUYABLE ones; a check that specifically
     wants a dead line adds it with FB.cart.add directly. */
  store.menu.forEach((sec) => sec.items.forEach((it) => {
    if (FB.catalog.available(it)) items.push(it);
  }));
  for (let i = 0; i < n && i < items.length; i++) {
    const it = items[i];
    FB.cart.add(slug, it, FB.catalog.defaultSel(it), 1, i === 0 ? 'no notes' : '');
  }
  return store;
}

/* Mirrors the object literal js/ui/checkout.js place() writes. It is duplicated
   rather than imported because place() needs a live button; if the shapes drift,
   a screen reading the missing field is exactly what these checks catch.

   opts.now is REQUIRED. This function runs in NODE's realm, so it does not see
   clock.set(), which only patches Date inside the vm — a fixture that omits it is
   stamped with the wall clock of the machine running the tests, which silently
   moved the render fixtures' orders out of the day the sweep was pinned to and made
   coverage depend on what time the suite was run. Defaulting to Date.now() is what
   hid that, so it throws instead. */
function makeOrder(FB, slug, opts) {
  opts = opts || {};
  if (!opts.now) throw new Error("makeOrder needs opts.now — Date.now() here is Node's clock, not the vm's");
  const now = opts.now;
  const s = FB.catalog.get(slug);
  const lines = FB.cart.lines(slug).map((l) => ({
    name: l.name, qty: l.qty, unit: l.unit, itemId: l.itemId, sel: l.sel, note: l.note,
    opts: FB.cart.describe(slug, l),
  }));
  const st = FB.S();
  const c = FB.fees.compute({
    subtotal: FB.cart.subtotal(slug),
    lineCount: lines.length,
    store: s,
    mode: opts.mode || 'delivery',
    plus: !!st.plus.active,
    settings: st.settings,
    tipPct: st.settings.autoTipPct,
  });
  const id = 'o_fixture_' + slug;
  return {
    id: id, slug: s.slug, storeName: s.name, logo: s.logoSrc,
    placedAt: now - (opts.ageMs || 0),
    mode: opts.mode || 'delivery', express: false, scheduled: null,
    address: FB.deep(FB.store.address()), payment: FB.deep(FB.store.payment()),
    lines: lines,
    calc: {
      subtotal: c.subtotal, feesTotal: c.feesTotal, tax: c.taxLine.amount,
      tip: c.tipLine.amount, total: c.total, nonFood: c.nonFood, multiple: c.multiple,
      feeLines: c.feeLines.map((l) => ({ label: l.label, amount: l.amount, id: l.id, free: l.free })),
      roundUp: c.roundLine ? c.roundLine.amount : 0, promo: c.promoAmount,
    },
    status: opts.status || 'preparing',
    slinger: FB.C.slinger(id),
    etaMin: s.deliveryMax, etaDrift: 0,
    events: [{ step: 'placed', text: 'Order received', sub: null, ts: now }],
    rated: opts.rated === undefined ? null : opts.rated,
    load: { calories: 4200, sodium: 9100, grease: 61, ranch: 24 },
    step: opts.step === undefined ? 2 : opts.step,
  };
}

/* Each fixture returns the params to render screens with, and is handed the moment
   the caller has pinned the vm's clock to — see makeOrder's note about realms.
   Fixtures are applied to a FRESH state every time, so one never leaks into the
   next. */
const FIXTURES = [
  {
    name: 'fresh install',
    apply() { return {}; },
  },
  {
    name: 'loaded cart',
    apply(FB) {
      addToCart(FB, 'mcronalds', 3);
      return { slug: 'mcronalds' };
    },
  },
  {
    name: 'live order',
    apply(FB, now) {
      addToCart(FB, 'cluckingham', 2);
      const o = makeOrder(FB, 'cluckingham', { status: 'preparing', step: 2, now: now });
      FB.store.set((st) => {
        st.orders.unshift(o); st.activeOrderId = o.id;
        st.meta.orderCount = 1; st.meta.lifetimeSpend = o.calc.total;
        st.meta.lifetimeFees = o.calc.feesTotal; st.meta.lifetimeTips = o.calc.tip;
        st.meta.lifetimeCalories = o.load.calories;
        return st;
      });
      FB.bodymax.ingest(o);
      return { id: o.id, slug: 'cluckingham' };
    },
  },
  {
    name: 'delivered and unrated',
    apply(FB, now) {
      addToCart(FB, 'starbux', 2);
      const o = makeOrder(FB, 'starbux', { status: 'delivered', step: 5, rated: null, ageMs: 3600000, now: now });
      o.deliveredAt = now - 60000;
      FB.store.set((st) => {
        st.orders.unshift(o); st.activeOrderId = o.id; st.meta.orderCount = 1;
        st.favorites.push('starbux');
        st.recentSearches.push('ranch');
        return st;
      });
      FB.bodymax.ingest(o);
      FB.notifs.push({ id: 'fixture:1', kind: 'order', icon: 'bike', title: 'Delivered', body: 'Photo attached.', go: 'track', params: { id: o.id } });
      FB.cart.clear('starbux');
      return { id: o.id, slug: 'starbux' };
    },
  },
  {
    name: 'BANG+ active, pickup cart',
    apply(FB) {
      FB.store.set((st) => {
        st.plus.active = true; st.plus.since = Date.now() - 86400000 * 40;
        st.plus.renewsOn = Date.now() + 86400000 * 20;
        st.credits = 3;
        return st;
      });
      addToCart(FB, 'pizzahutch', 2);
      FB.cart.setCo('pizzahutch', { mode: 'pickup', tipPct: 0, promoCode: 'WELCOME' });
      return { slug: 'pizzahutch' };
    },
  },
  {
    /* The other side of the switch, mid-run and held by a decision. Without this the
       dispatch and run screens render only their empty states in the sweep, which is
       where the undefined/NaN and accessible-name checks actually bite. */
    name: 'slinging, held mid-run',
    apply(FB, now) {
      FB.missions.setMode('sling');
      /* Probe the shape first, then start the run far enough in the past that NOW
         falls two seconds inside the rule's window — so the held branch is what
         renders. build() writes nothing, which is what makes this safe. */
      const probe = FB.missions.build('oliveorchard', now);
      const into = probe.checks[0].at - probe.startAt + 2000;
      FB.missions.accept('oliveorchard', now - into);
      FB.store.set((st) => {
        st.slinging.completed = 3; st.slinging.kept = 2; st.slinging.broken = 1;
        st.slinging.earned = 24.6; st.slinging.platform = 2;
        st.slinging.standing = { oliveorchard: 1, gyropalace: -1 };
        return st;
      });
      FB.missions.tick({ catchUp: true });
      return {};
    },
  },
  {
    name: 'privacy toggles flipped, hunger 10',
    apply(FB) {
      FB.store.set((st) => {
        st.settings.feeTransparency = false;
        st.settings.reduceUpsells = true;
        st.settings.dataSharing = false;
        st.settings.hungerLevel = 10;
        st.settings.textsize = 'xl';
        st.settings.theme = 'dark';
        return st;
      });
      addToCart(FB, 'ssa', 4);
      return { slug: 'ssa' };
    },
  },
];

/* Screens that need a param get one from the fixture; the rest render bare. */
function paramsFor(name, fx) {
  switch (name) {
    case 'store': return { slug: fx.slug || 'mcronalds' };
    case 'cart': return { slug: fx.slug || 'mcronalds' };
    case 'checkout': return { slug: fx.slug || 'mcronalds' };
    case 'category': return { cat: 'burgers' };
    case 'track': return { id: fx.id || null };
    default: return {};
  }
}

module.exports = { loadApp, FIXTURES, paramsFor, makeOrder, addToCart, ROOT };
