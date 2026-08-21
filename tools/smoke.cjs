/* Smoke test for the invariants that are easy to break silently.
   node tools/smoke.cjs   (also: npm test) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
let failed = 0;

function check(label, fn) {
  try {
    const detail = fn();
    console.log('  ok    ' + label + (detail ? '  (' + detail + ')' : ''));
  } catch (e) {
    failed++;
    console.log('  FAIL  ' + label + '\n          ' + e.message);
  }
}
/* The source greps below must not match their own explanations. This codebase
   comments in /* … *\/ blocks whose continuation lines start with plain spaces, so
   a "does this line start with a star" test does not see them. Block comments are
   replaced with blank lines rather than removed, to keep line numbers honest. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^\s*\/\/.*$/gm, '');
}

function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(what + ': expected ' + expected + ', got ' + actual);
  return String(actual);
}

/* ---- load the app's pure modules (no DOM needed) ---- */
global.window = {};
require(path.join(ROOT, 'js/core/util.js'));
const FB = global.window.FB;
FB.S = () => ({ settings: { feeTransparency: true, reduceUpsells: false, dataSharing: true, autoTipPct: 42, hungerLevel: 7 } });
require(path.join(ROOT, 'js/core/fees.js'));
require(path.join(ROOT, 'js/data/menus.generated.js'));
const MENUS = global.window.FB_MENUS;

/* js/data/menus/*.json is the source of truth; menus.generated.js is a build
   product that no longer even carries every field. The data checks below read the
   SOURCES, so a price edited without `npm run bundle` fails the hash check rather
   than passing every other check against a stale bundle. */
const MENU_DIR = path.join(ROOT, 'js/data/menus');
const SRC_FILES = fs.readdirSync(MENU_DIR).filter(f => f.endsWith('.json')).sort();
const SOURCES = Object.fromEntries(
  SRC_FILES.map(f => [f.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(MENU_DIR, f), 'utf8'))])
);
const SRC_ITEMS = Object.entries(SOURCES).flatMap(([slug, m]) => m.menu.flatMap(s => s.items.map(it => [slug, it])));
const RETENTION_PROBE = 3;

console.log('FoodBang smoke test\n');

check('$12 of food totals exactly $60.00', () => {
  const c = FB.fees.compute({ subtotal: 12, lineCount: 2, settings: FB.S().settings });
  return eq(FB.money(c.total), '$60.00', 'total');
});

check('fee stack order is intact', () => {
  /* Located by ID, not by position. This asserted peak was the LAST line until the
     BangBux redemption started landing after it — deliberately, so that redeeming a
     dollar does not also shrink the multiplier that dollar was multiplied into. */
  const c = FB.fees.compute({ subtotal: 12, lineCount: 2, settings: FB.S().settings });
  const i = c.feeLines.findIndex(l => l.id === 'peak');
  if (i < 0) throw new Error('no Peak Demand line at all');
  const stack = c.feeLines.slice(0, i).reduce((a, l) => a + l.amount, 0);
  if (Math.abs(c.feeLines[i].amount - stack * 0.4) > 0.02) throw new Error('Peak multiplier is not applied to the whole stack');
  if (c.feeLines.slice(0, i).some(l => l.amount < 0)) throw new Error('something is discounted before the multiplier is applied');
  if (Math.abs(c.tipLine.amount - 12 * 0.42) > 0.01) throw new Error('tip must be computed on the subtotal');
  return 'peak on stack, tip on subtotal';
});

check('every fee line has a FEE_WHY entry, in every context', () => {
  /* one context only ever exercises one branch of the fee stack, and the fee
     that goes unexplained is always the one on the branch nobody tested */
  const base = FB.S().settings;
  const contexts = [
    { subtotal: 12, lineCount: 2 },
    { subtotal: 40, lineCount: 3, express: true, scheduled: true },
    { subtotal: 90, lineCount: 9, mode: 'pickup' },
    { subtotal: 40, lineCount: 3, plus: true },
    { subtotal: 400, lineCount: 3, plus: true },
    { subtotal: 40, lineCount: 3, settings: { ...base, feeTransparency: false, reduceUpsells: true, dataSharing: false } },
    { subtotal: 40, lineCount: 3, settings: { ...base, hungerLevel: 1 } },
    { subtotal: 40, lineCount: 3, settings: { ...base, instantInterface: true } },
    { subtotal: 40, lineCount: 3, standingTier: 3 },
    { subtotal: 40, lineCount: 3, scrip: 3 },
    { subtotal: 40, lineCount: 3, tosVersion: 3 },
  ];
  const seen = new Set(), missing = new Set();
  for (const ctx of contexts) {
    const c = FB.fees.compute({ settings: base, ...ctx });
    for (const l of c.feeLines.concat([c.taxLine, c.tipLine], c.roundLine ? [c.roundLine] : [])) {
      seen.add(l.id);
      if (!FB.FEE_WHY[l.id]) missing.add(l.id);
    }
  }
  if (missing.size) throw new Error('missing explanations for: ' + [...missing].join(', '));
  return seen.size + ' distinct fee ids across ' + contexts.length + ' contexts';
});

check('the bundle was built from exactly these sources', () => {
  /* The only claim this check used to make was a store count, so editing a price
     and forgetting `npm run bundle` shipped a stale app that everything agreed
     with. bundle.cjs stamps a hash of the sources into the banner. */
  eq(Object.keys(MENUS).length, SRC_FILES.length, 'store count');
  const h = crypto.createHash('sha256');
  for (const f of SRC_FILES) h.update(f).update(fs.readFileSync(path.join(MENU_DIR, f)));
  const want = h.digest('hex');
  const gen = fs.readFileSync(path.join(ROOT, 'js/data/menus.generated.js'), 'utf8').slice(0, 400);
  const got = (gen.match(/sources sha256 ([0-9a-f]{64})/) || [])[1];
  if (!got) throw new Error('the bundle carries no source hash — run npm run bundle');
  if (got !== want) throw new Error('the bundle is stale: run npm run bundle');
  /* and the build-only fields really are absent from what ships */
  for (const k of ['imagePrompt', 'photoStyle']) {
    if (fs.readFileSync(path.join(ROOT, 'js/data/menus.generated.js'), 'utf8').includes('"' + k + '"')) {
      throw new Error(k + ' is still in the runtime bundle');
    }
  }
  return SRC_FILES.length + ' stores, hash matches, build-only fields stripped';
});

check('every photographed item has its asset on disk', () => {
  let n = 0;
  for (const [slug, m] of Object.entries(SOURCES)) {
    for (const it of m.menu.flatMap(s => s.items)) {
      if (!it.photo) continue;
      n++;
      const p = path.join(ROOT, 'assets/brands', slug, it.photo);
      if (!fs.existsSync(p)) throw new Error('missing ' + slug + '/' + it.photo);
      if (fs.statSync(p).size === 0) throw new Error('zero-byte (dataless?) ' + slug + '/' + it.photo);
    }
    for (const a of ['logo.webp', 'hero.webp']) {
      if (!fs.existsSync(path.join(ROOT, 'assets/brands', slug, a))) throw new Error('missing ' + slug + '/' + a);
    }
  }
  return n + ' photos';
});

check('every photo declares its style, and the mix is preserved', () => {
  /* This used to assert a 50-75% band against a field that 45 of 120 photos simply
     omitted, so "not amateur" silently meant "studio" and the band absorbed it. Every
     photo now states its style, so the split can be asserted exactly. The numbers come
     from looking at all 120: seven were labelled amateur and were visibly studio work, and
     La Taqueria Verdadera's three studio-looking photos were reshot to its own doctrine. */
  /* Read from the sources: photoStyle is a build-only field and bundle.cjs strips
     it, which is exactly why this check must not look at the bundle. */
  const items = SRC_ITEMS.map(([, it]) => it).filter(i => i.photo);
  const bad = items.filter(i => i.photoStyle !== 'amateur' && i.photoStyle !== 'studio');
  if (bad.length) throw new Error(bad.length + ' photo(s) with no/unknown photoStyle, e.g. ' + bad[0].id);
  const amateur = items.filter(i => i.photoStyle === 'amateur').length;
  eq(items.length, 120, 'photographed items');
  eq(amateur, 87, 'amateur photos');
  return amateur + ' amateur / ' + (items.length - amateur) + ' studio';
});

check('the advertised delivery fee is the one charged', () => {
  /* fees.js used to invent its own base and ignore store.deliveryFee entirely, so the
     number on the store card and the number on the receipt were unrelated. */
  let n = 0;
  for (const [slug, m] of Object.entries(SOURCES)) {
    const c = FB.fees.compute({ subtotal: 30, lineCount: 3, store: m, settings: FB.S().settings });
    const d = c.feeLines.find(l => l.id === 'delivery');
    if (!d) throw new Error(slug + ': no delivery line');
    if (d.amount < m.deliveryFee - 0.005) {
      throw new Error(slug + ' advertises ' + FB.money(m.deliveryFee) + ' but is charged ' + FB.money(d.amount));
    }
    n++;
  }
  return n + ' stores, advertised fee is the floor';
});

check('no two stores share a ratingCount', () => {
  const seen = new Map();
  for (const [slug, m] of Object.entries(SOURCES)) {
    if (seen.has(m.ratingCount)) throw new Error(slug + ' and ' + seen.get(m.ratingCount) + ' both show ' + m.ratingCount);
    seen.set(m.ratingCount, slug);
  }
  return seen.size + ' distinct counts';
});

check('no modifier group offers a cap it cannot reach', () => {
  /* "Optional · up to 8" printed over four checkboxes reads as a data slip, and the
     app's jokes are always explicit — an unreachable cap is not one of them. */
  const bad = [];
  for (const [slug, it] of SRC_ITEMS) {
    for (const g of it.groups || []) {
      const n = (g.options || []).length;
      if (g.max != null && g.max > n) bad.push(slug + '/' + it.id + '/' + g.id + ' max ' + g.max + ' > ' + n);
    }
  }
  if (bad.length) throw new Error(bad.length + ' group(s), e.g. ' + bad[0]);
  return 'all caps reachable';
});

check('screens bind through FB.on, never addEventListener', () => {
  /* The shell records everything bound during a mount and unbinds it on the next
     paint. A raw addEventListener escapes that bookkeeping, so the listener outlives
     its screen and fires again on the next render, and the one after that. Two of the
     confirmed criticals in this app were exactly that. shell.js owns the boot-time
     document/window listeners and util.js implements FB.on, so both are exempt. */
  /* js/sim is walked too: bodymax.js registers a screen with a real mount() and
     tracker.js runs the global ticker, so a raw listener there escapes the same
     bookkeeping — and any future sim would have shipped unchecked by default. */
  const dirs = ['js/ui', 'js/sim'];
  const exempt = new Set(['shell.js']);
  const hits = [];
  let n = 0;
  for (const d of dirs) {
    const dir = path.join(ROOT, d);
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
      if (exempt.has(f)) continue;
      n++;
      codeOnly(fs.readFileSync(path.join(dir, f), 'utf8')).split('\n').forEach((line, i) => {
        if (/\.addEventListener\(/.test(line)) hits.push(d + '/' + f + ':' + (i + 1));
      });
    }
  }
  if (hits.length) throw new Error('raw addEventListener in: ' + hits.join(', '));
  return n + ' screen and sim files clean';
});

check('a re-mount does not accumulate listeners', () => {
  /* The DOM-free half of the mount/unmount contract. There is no test framework and
     no dependencies here by design, so rather than shim a DOM, this exercises the
     actual mechanism: FB.on records every listener bound while FB._binds is parked,
     and the shell calls those unbind fns before the next paint. Mount twice, assert
     one live listener. The other half — that screens never bypass FB.on — is the
     addEventListener check above. */
  const live = [];
  const fakeRoot = {
    addEventListener: (t, h, o) => live.push({ t, h, o }),
    removeEventListener: (t, h) => {
      const i = live.findIndex(x => x.t === t && x.h === h);
      if (i > -1) live.splice(i, 1);
    },
    contains: () => true,
  };
  function mountOnce() {
    const binds = FB._binds = [];
    FB.on(fakeRoot, 'click', '[data-x]', () => {});
    FB.on(fakeRoot, 'scroll', () => {});
    FB._binds = null;
    return binds;
  }
  let binds = mountOnce();
  eq(live.length, 2, 'listeners after first mount');
  eq(binds.length, 2, 'recorded unbind fns');

  /* what paint() does: unbind the previous mount, then mount again */
  binds.forEach(off => off());
  binds = mountOnce();
  eq(live.length, 2, 'listeners after re-mount');

  /* and ten more re-mounts must not drift */
  for (let i = 0; i < 10; i++) { binds.forEach(off => off()); binds = mountOnce(); }
  eq(live.length, 2, 'listeners after twelve mounts');

  binds.forEach(off => off());
  eq(live.length, 0, 'listeners after unmount');
  return 'twelve mounts, two listeners';
});

check('every item is orderable (required groups resolvable)', () => {
  let n = 0;
  for (const [, it] of SRC_ITEMS) {
    n++;
    for (const g of it.groups || []) {
      if (!g.options || !g.options.length) throw new Error(it.id + '/' + g.id + ' has no options');
      if (g.required && !g.options.length) throw new Error(it.id + '/' + g.id + ' required but empty');
    }
    if (!(it.groups || []).length) throw new Error(it.id + ' has no modifier groups');
  }
  return n + ' items';
});

check('no stale brand strings in source', () => {
  /* The needles live in a data file that tools/rebrand.cjs skips. Spelled out
     here they would themselves be rewritten by the courier-noun rule on the
     next rename, and this check would start hunting for the CURRENT brand. */
  const retired = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/retired-brands.json'), 'utf8'));
  const stale = new RegExp(retired.patterns.join('|'), 'i');
  const skipDirs = new Set(['.git', 'node_modules', 'build']);
  const skipFiles = new Set(['menus.generated.js', 'rebrand.cjs', 'smoke.cjs', 'retired-brands.json', 'CLAUDE.md']);
  const hits = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir)) {
      if (skipDirs.has(e)) continue;
      const p = path.join(dir, e);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|css|html|json|md)$/.test(e) || skipFiles.has(e)) continue;
      if (stale.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(ROOT, p));
    }
  })(ROOT);
  if (hits.length) throw new Error('stale brand in: ' + hits.join(', '));
  return 'clean';
});

/* ---- the UI layer, rendered headlessly ---------------------------------- */
/* Until these two, ~2,300 lines of js/ui had exactly one grep for coverage. Every
   screen's render() is a pure string function by architectural rule, so the whole
   layer can be exercised behind a stub document — see tools/harness.cjs. */
const harness = require(path.join(ROOT, 'tools/harness.cjs'));

/* Buttons are not nested in this app, but count depth anyway rather than assume it. */
function eachButton(html, fn) {
  const re = /<button\b/g;
  let m;
  while ((m = re.exec(html))) {
    const gt = html.indexOf('>', m.index);
    if (gt < 0) continue;
    const attrs = html.slice(m.index + 7, gt);
    let depth = 1, i = gt + 1;
    while (i < html.length && depth > 0) {
      const nb = html.indexOf('<button', i), cb = html.indexOf('</button>', i);
      if (cb < 0) break;
      if (nb > -1 && nb < cb) { depth++; i = nb + 7; } else { depth--; i = cb + 9; }
    }
    fn(attrs, html.slice(gt + 1, i - 9));
  }
}

let RENDERED = null;   /* [{screen, fn, html}] — built once, swept twice */

check('every screen renders under every state fixture', () => {
  const app = harness.loadApp();
  const { FB, clock } = app;
  RENDERED = [];
  const bad = [];
  let n = 0;
  /* Two hours, because half the catalog is shut at one of them and the closed-store,
     dayparted-section and overnight-map paths are otherwise never rendered at all. */
  const HOURS = [
    ['dinner', new Date(2026, 7, 20, 19, 14, 0).getTime()],
    ['3 AM', new Date(2026, 7, 20, 3, 4, 0).getTime()],
  ];
  for (const [hourName, hourTs] of HOURS) {
  clock.set(hourTs);
  for (const fx of harness.FIXTURES) {
    FB.store.reset();
    let params;
    try { params = fx.apply(FB) || {}; }
    catch (e) { bad.push('fixture "' + fx.name + '" threw: ' + e.message); continue; }
    for (const name of FB.screens.list()) {
      const def = FB.screens.get(name);
      const p = harness.paramsFor(name, params);
      for (const fn of ['appbar', 'render']) {
        if (!def[fn]) continue;
        let out;
        const where = hourName + ' / ' + fx.name + ' / ' + name + '.' + fn + '()';
        try { out = def[fn](p); }
        catch (e) { bad.push(where + ' threw: ' + e.message); continue; }
        if (typeof out !== 'string') { bad.push(where + ' returned ' + typeof out); continue; }
        n++;
        RENDERED.push({ screen: name, fn: fn, html: out, fixture: hourName + '/' + fx.name });
        /* A field that arrived undefined on an old save, or a total poisoned to NaN,
           reaches the user as these two literal strings and nothing else notices. */
        if (out.indexOf('undefined') > -1) bad.push(where + ' rendered the string "undefined"');
        if (out.indexOf('NaN') > -1) bad.push(where + ' rendered the string "NaN"');
      }
    }
  }
  }
  clock.restore();
  app.dispose();
  if (bad.length) throw new Error(bad.length + ' problem(s):\n          ' + bad.slice(0, 8).join('\n          '));
  return n + ' renders across ' + harness.FIXTURES.length + ' fixtures × ' + HOURS.length + ' hours, ' + FB.screens.list().length + ' screens';
});

check('rendered markup keeps its accessible names', () => {
  if (!RENDERED) throw new Error('the render check did not run');
  const bad = [];
  const seen = new Set();
  function flag(r, msg) {
    const k = r.screen + '.' + r.fn + ' :: ' + msg;
    if (!seen.has(k)) { seen.add(k); bad.push(k); }
  }
  for (const r of RENDERED) {
    (r.html.match(/<img\b[^>]*>/g) || []).forEach((t) => {
      if (!/\balt=/.test(t)) flag(r, 'img without alt: ' + t.slice(0, 60));
    });
    (r.html.match(/<(input|textarea)\b[^>]*>/g) || []).forEach((t) => {
      if (!/aria-label=/.test(t) && !/aria-labelledby=/.test(t)) {
        flag(r, 'input without an accessible name: ' + t.slice(0, 70));
      }
    });
    eachButton(r.html, (attrs, inner) => {
      /* strip the icon, then the tags — what is left is what a screen reader says */
      const text = inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').trim();
      if (!text && !/aria-label=/.test(attrs)) flag(r, 'icon-only button without aria-label: <button' + attrs.slice(0, 60) + '>');
    });
    if (/role="radio"/.test(r.html) && !/role="radiogroup"/.test(r.html)) {
      flag(r, 'role="radio" with no role="radiogroup" around it');
    }
  }
  if (bad.length) throw new Error(bad.length + ' problem(s):\n          ' + bad.slice(0, 8).join('\n          '));
  return RENDERED.length + ' rendered fragments swept';
});

check('a save written before a field existed gets it back, at any depth', () => {
  /* migrate() used to walk the top level plus two hardcoded sub-objects, so the
     first NESTED field anyone added arrived undefined on every existing save and
     `st.meta.lifetimeCalories += n` poisoned a lifetime total to NaN forever.
     Adding depth to this app means adding fields, so this is load-bearing. */
  const probe = harness.loadApp();
  const KEY = probe.FB.store.KEY;
  const fresh = JSON.parse(JSON.stringify(probe.FB.S()));
  probe.dispose();

  function leaves(o, prefix, out) {
    Object.keys(o).forEach((k) => {
      const v = o[k];
      const p = prefix ? prefix + '.' + k : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) leaves(v, p, out);
      else out.push(p);
    });
    return out;
  }
  function at(o, p) { return p.split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o); }

  const expected = leaves(fresh, '', []);

  /* the emptiest save the app can be handed that still claims to be current */
  const bare = harness.loadApp({ savedState: { v: 1 }, storageKey: KEY });
  const got = bare.FB.S();
  const missing = expected.filter((p) => at(got, p) === undefined);
  bare.dispose();
  if (missing.length) {
    throw new Error(missing.length + ' leaf/leaves arrived undefined, e.g. ' + missing.slice(0, 5).join(', '));
  }

  /* and a populated save must keep everything it already had */
  const saved = {
    v: 1,
    meta: { orderCount: 7, lifetimeSpend: 421.5 },
    settings: { theme: 'dark', hungerLevel: 2, notifications: { promos: false } },
    plus: { active: true },
    addresses: [{ id: 'only', label: 'Only', line1: 'x', city: 'y', isDefault: true }],
    favorites: ['starbux'],
  };
  const app = harness.loadApp({ savedState: saved, storageKey: KEY });
  const st = app.FB.S();
  const kept = [
    ['meta.orderCount', 7], ['meta.lifetimeSpend', 421.5],
    ['settings.theme', 'dark'], ['settings.hungerLevel', 2],
    ['settings.notifications.promos', false], ['plus.active', true],
  ];
  for (const [p, v] of kept) {
    if (at(st, p) !== v) { app.dispose(); throw new Error('overwrote a saved value at ' + p + ': got ' + at(st, p)); }
  }
  /* An array in a save is the user's data. Merging the defaults in would resurrect
     an address they deleted; a defaults array is a starting point, never a floor. */
  if (st.addresses.length !== 1 || st.addresses[0].id !== 'only') {
    app.dispose(); throw new Error('saved array was merged into: ' + JSON.stringify(st.addresses.map((a) => a.id)));
  }
  if (st.favorites.length !== 1) { app.dispose(); throw new Error('favorites array was merged into'); }
  /* the whole point: this used to be undefined, and += made it NaN */
  const poisoned = st.meta.lifetimeCalories + 1200;
  app.dispose();
  if (!Number.isFinite(poisoned)) throw new Error('meta.lifetimeCalories is not a number: ' + st.meta.lifetimeCalories);

  return expected.length + ' leaves backfilled, saved values and arrays untouched';
});

check('a raised Hunger Level raises the default and never lowers it', () => {
  /* Settings promises "portion defaults are raised one tier" and nothing read the
     number. The obvious index rule is wrong — the last option is the dearest in
     only 445 of the 1,019 required groups — and a pure price rule pre-selects a
     refusal in 57 of them, which is less food for more money. */
  const app = harness.loadApp();
  const { FB } = app;
  const DECLINE = /^\s*(no\b|no-|none\b|without\b|decline|omit|skip|hold the\b|do not\b|zero\b|bucketless|refuse|opt.?out)/i;
  const lowered = [], declined = [], unorderable = [];
  let items = 0, raised = 0;
  FB.catalog.all().forEach((s) => s.menu.forEach((sec) => sec.items.forEach((it) => {
    items++;
    const p = [1, 8, 10].map((hh) => FB.catalog.unitPrice(it, FB.catalog.defaultSel(it, hh)));
    if (p[1] < p[0] || p[2] < p[0] || p[2] < p[1]) lowered.push(it.id + ' ' + p.join('/'));
    if (p[2] > p[0]) raised++;
    for (const hh of [1, 8, 10]) {
      const sel = FB.catalog.defaultSel(it, hh);
      if (FB.catalog.validate(it, sel).length) unorderable.push(it.id + ' @ ' + hh);
      (it.groups || []).forEach((g) => {
        if (!g.required) return;
        const o = g.options.filter((x) => x.id === sel[g.id][0])[0];
        /* only a group with nothing BUT declines may default to one */
        if (hh >= 8 && DECLINE.test(o.name) && g.options.some((x) => !DECLINE.test(x.name))) {
          declined.push(it.id + '/' + g.id + ' -> "' + o.name + '"');
        }
      });
    }
  })));
  app.dispose();
  if (lowered.length) throw new Error('Hunger LOWERED the price on ' + lowered.length + ', e.g. ' + lowered[0]);
  if (declined.length) throw new Error('Hunger pre-selected a refusal in ' + declined.length + ', e.g. ' + declined[0]);
  if (unorderable.length) throw new Error('Hunger left ' + unorderable.length + ' unorderable, e.g. ' + unorderable[0]);
  return raised + ' of ' + items + ' items cost more at Hunger 10, none less, none a refusal';
});

check('every promo code burns, and says something specific when it does', () => {
  /* st.promo.used has been written on every order since the app shipped and read
     by nothing, so all six codes were infinitely reusable — while WELCOME's own
     blurb asserted "New customers. You are not new." */
  const codes = Object.keys(FB.fees.PROMOS);
  for (const k of codes) {
    const fresh = FB.fees.checkPromo(k, 999, []);
    if (!fresh.valid) throw new Error(k + ' is not valid unused at a $999 subtotal');
    /* the burn is opt-in: a caller that passes no `used` gets the old behaviour */
    if (JSON.stringify(FB.fees.checkPromo(k, 999)) !== JSON.stringify(fresh)) {
      throw new Error(k + ' behaves differently with no `used` argument');
    }
    const burnt = FB.fees.checkPromo(k, 999, [k]);
    if (burnt.valid) throw new Error(k + ' is still valid after being used');
    if (!burnt.error) throw new Error(k + ' has no `spent` string');
    if (burnt.error === fresh.blurb) throw new Error(k + ' reuses its blurb as its spent message');
  }
  /* the spent branch must sit before the minimum branch, or a burned HALFOFF says
     "you are $170 short" rather than telling you that you already used it */
  const low = FB.fees.checkPromo('HALFOFF', 10, ['HALFOFF']);
  if (/short/.test(low.error)) throw new Error('a spent code below its minimum reports the shortfall instead');
  return codes.length + ' codes, each single-use with its own justification';
});

check('randomness is seeded everywhere but its own implementation', () => {
  /* FB.seeded/FB.hash drive feed order, busy flags, photo shuffles and now
     interaction latency, so a re-render or a reload never reshuffles the app.
     util.js implements the fallback inside FB.pick/FB.shuffle and is exempt; a
     bare Math.random() anywhere else is a re-render that disagrees with itself. */
  const dirs = ['js/core', 'js/ui', 'js/sim'];
  const exempt = new Set(['util.js']);
  const hits = [];
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(ROOT, d)).filter((f) => f.endsWith('.js'))) {
      if (exempt.has(f)) continue;
      codeOnly(fs.readFileSync(path.join(ROOT, d, f), 'utf8')).split('\n').forEach((line, i) => {
        if (/Math\.random\(/.test(line)) hits.push(d + '/' + f + ':' + (i + 1));
      });
    }
  }
  codeOnly(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8')).split('\n').forEach((line, i) => {
    if (/Math\.random\(/.test(line)) hits.push('js/app.js:' + (i + 1));
  });
  if (hits.length) throw new Error('unseeded randomness in: ' + hits.join(', '));
  return 'seeded outside util.js';
});

check('interaction latency stays small, varies, and can be bought off', () => {
  /* The delays exist so the app reads as an app rather than as a diagram of one.
     They are believable only while they stay short and stop being identical. */
  const app = harness.loadApp();
  const { FB } = app;
  const kinds = Object.keys(FB.latency.KINDS);
  try {
    for (const k of kinds) {
      const [lo, hi] = FB.latency.KINDS[k];
      if (!(lo > 0 && hi > lo)) throw new Error(k + ' has a bad range [' + lo + ',' + hi + ']');
      if (hi > 1500) throw new Error(k + ' waits ' + hi + 'ms — that is a hang, not a delay');
      const seen = new Set();
      for (let i = 0; i < 12; i++) {
        const ms = FB.latency.ms(k);
        if (ms < lo || ms > hi) throw new Error(k + ' returned ' + ms + 'ms, outside [' + lo + ',' + hi + ']');
        seen.add(ms);
      }
      if (seen.size < 4) throw new Error(k + ' returned only ' + seen.size + ' distinct delays in 12 calls');
    }
    /* the platform is quicker to take money than to give it back */
    if (FB.latency.KINDS.cartAdd[1] >= FB.latency.KINDS.cartRemove[0]) {
      throw new Error('removing from the cart is not slower than adding to it');
    }
    FB.store.set((st) => { st.settings.instantInterface = true; return st; });
    for (const k of kinds) {
      if (FB.latency.ms(k) !== 0) throw new Error(k + ' still waits with Instant Interface on');
    }
  } finally { app.dispose(); }
  return kinds.length + ' kinds, ' + FB.latency.KINDS.cartAdd[0] + '-' + FB.latency.KINDS.plusCancel[1] + 'ms';
});

check('the single-file build can still parse index.html, and its output is safe to publish', () => {
  /* build-artifact.cjs reads index.html with regexes that FAIL OPEN. A <script src>
     placed above the markup makes html.indexOf('<script src=') precede '<body>', so
     the body slice comes back empty and the artifact publishes as a blank page with
     nothing but the boot banner — without erroring. Nothing checked any of it.
     The stylesheet regex is deliberately NOT asserted: index.html's Google Fonts
     link uses the reversed attribute order and the build skips it on purpose. */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const allScriptTags = (html.match(/<script\b/g) || []).length;
  if (scripts.length !== allScriptTags) {
    throw new Error(allScriptTags + ' <script> tags but only ' + scripts.length + ' match the shape the build reads');
  }
  const bodyAt = html.indexOf('<body>');
  const firstScript = html.indexOf('<script src=');
  if (bodyAt < 0) throw new Error('no <body> in index.html');
  if (firstScript < bodyAt) throw new Error('a <script src> sits above <body>: the artifact would ship an empty body');
  const body = html.slice(bodyAt + 6, firstScript);
  if (!body.includes('id="view"')) throw new Error('the body slice the build takes does not contain #view');
  for (const f of scripts) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error('index.html lists a missing script: ' + f);
  }

  /* Every asset path the app builds at runtime is a root-relative string that the
     inlined map is keyed by, so a path written any other way silently 404s there. */
  const missing = [];
  for (const d of ['js/core', 'js/ui', 'js/sim']) {
    for (const f of fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(ROOT, d, f), 'utf8');
      for (const m of src.matchAll(/'(assets\/[A-Za-z0-9._\/-]+\.(webp|png|jpg|json))'/g)) {
        if (!fs.existsSync(path.join(ROOT, m[1]))) missing.push(d + '/' + f + ': ' + m[1]);
      }
    }
  }
  if (missing.length) throw new Error('asset literals that do not resolve: ' + missing.join(', '));

  /* And if a build is present, hold it to the rule that made it publishable. */
  const built = path.join(ROOT, 'build/foodbang.html');
  let note = 'no build present';
  if (fs.existsSync(built)) {
    const out = fs.readFileSync(built, 'utf8');
    for (const needle of ['__fberr', '__FB_ASSETS']) {
      if (!out.includes(needle)) throw new Error('the build is missing ' + needle);
    }
    let longest = 0, at = 0;
    out.split('\n').forEach((l, i) => { if (l.length > longest) { longest = l.length; at = i + 1; } });
    /* A multi-megabyte single line renders as a blank frame with SyntaxError when
       published — it works locally and in a plain iframe, so only this catches it. */
    if (longest > 1024) throw new Error('build/foodbang.html line ' + at + ' is ' + longest + ' chars (limit 1024)');
    note = 'build longest line ' + longest;
  }
  return scripts.length + ' scripts, body slice intact, ' + note;
});

check('the world is a pure function of the clock', () => {
  /* FB.world stores nothing and ticks nothing: it buckets time and derives from a
     seed. That is what makes leaving the app and coming back a week later correct
     for free — and it only holds while at() is genuinely idempotent inside a
     bucket, because screens call it in a render path. */
  const app = harness.loadApp();
  const { FB } = app;
  try {
    const day = (h, m) => new Date(2026, 7, 20, h, m, 0, 0).getTime();

    /* every hour of the day belongs to exactly one daypart */
    for (let h = 0; h < 24; h++) {
      const d = FB.world.at(day(h, 0)).daypart;
      if (!d) throw new Error('hour ' + h + ' has no daypart');
      const spans = FB.world.DAYPARTS.filter((p) => h >= p.from && h < p.to);
      if (spans.length !== 1) throw new Error('hour ' + h + ' matches ' + spans.length + ' dayparts');
    }

    const T = day(19, 14);
    const a = JSON.stringify(FB.world.at(T));
    if (a !== JSON.stringify(FB.world.at(T + 60000))) throw new Error('at() is not idempotent inside a bucket');
    if (a !== JSON.stringify(FB.world.at(T))) throw new Error('at() is not even idempotent at one instant');
    if (a === JSON.stringify(FB.world.at(T + FB.world.BUCKET_MS + 1000))) throw new Error('at() never changes bucket');

    /* the same must hold per store, because the Busy badge is drawn from it */
    const slug = FB.catalog.all()[0].slug;
    if (FB.world.kitchenLoad(slug, T) !== FB.world.kitchenLoad(slug, T + 60000)) {
      throw new Error('kitchenLoad is not stable inside a bucket');
    }

    /* and it has to say something: a city where every kitchen is slammed at 3 AM,
       or none of them at dinner, is no more informative than no badge at all */
    const busyAt = (h) => FB.catalog.all().filter((s) => FB.world.isBusy(s.slug, day(h, 4))).length;
    const night = busyAt(3), dinner = busyAt(19);
    if (night > 3) throw new Error(night + ' kitchens are Busy at 3 AM');
    if (dinner < 4) throw new Error('only ' + dinner + ' kitchens are Busy at dinner');
    if (dinner <= night) throw new Error('dinner (' + dinner + ') is no busier than 3 AM (' + night + ')');
    return 'dayparts cover the clock; ' + night + ' busy at 3 AM, ' + dinner + ' at dinner';
  } finally { app.dispose(); }
});

check('an order runs on the wall clock and survives being abandoned', () => {
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    function place(slug, opts) {
      clock.set(T0);
      harness.addToCart(FB, slug, 2);
      const o = harness.makeOrder(FB, slug, { mode: (opts || {}).mode || 'delivery', now: T0 });
      o.etaDrift = 0; o.events = []; o.scheduled = (opts || {}).scheduled || null;
      FB.tracker.build(o);
      FB.cart.clear(slug);
      FB.store.set((st) => { st.orders.unshift(o); st.activeOrderId = o.id; return st; });
      return o;
    }

    /* ---- the estimate counts down, and only ever revises later ---- */
    const o = place('mcronalds');
    if (FB.tracker.eta(o) !== o.etaMin) throw new Error('the first estimate is not the advertised one');
    let prevEta = Infinity, prevDrift = 0, delivered = false;
    for (let t = 0; t <= 140; t += 1) {
      clock.set(o.startAt + t * 1000);
      FB.tracker.tick();
      const c = FB.store.order(o.id);
      const e = FB.tracker.eta(c);
      if (e < 0) throw new Error('a negative estimate at t=' + t);
      if (e > prevEta && c.etaDrift === prevDrift) throw new Error('the estimate went UP at t=' + t + ' with no drift');
      if (c.status !== 'delivered' && FB.tracker.progress(c) === 1) throw new Error('the courier arrived before the order did');
      prevEta = e; prevDrift = c.etaDrift;
      if (c.status === 'delivered') { delivered = true; break; }
    }
    if (!delivered) throw new Error('the order never delivered inside its own window');
    const done = FB.store.order(o.id);
    if (FB.tracker.eta(done) !== 0) throw new Error('a delivered order still has minutes left');
    if (done.etaDrift <= 0) throw new Error('nothing ever revised the estimate');

    /* ---- an abandoned order settles, stamped when it happened ---- */
    FB.store.reset();
    const ab = place('cluckingham');
    clock.set(T0 + 86400000);            /* a day later */
    FB.tracker.resume();
    const A = FB.store.order(ab.id);
    if (A.status !== 'delivered') throw new Error('an order abandoned for a day is still ' + A.status);
    const ts = A.events.map((e) => e.ts);
    if (!ts.every((t, i) => i === 0 || ts[i - 1] >= t)) throw new Error('the feed is not in time order');
    /* the bug this prevents: a catch-up pass stamping twenty beats with Date.now() */
    if (Math.max(...ts) - Math.min(...ts) < 20000) throw new Error('the whole feed collapsed onto one instant');
    if (Math.abs(A.deliveredAt - (T0 + 86400000)) < 60000) throw new Error('delivery was stamped when we noticed, not when it happened');

    /* ---- a pickup is not a delivery ---- */
    FB.store.reset();
    const pk = place('pizzahutch', { mode: 'pickup' });
    clock.set(pk.startAt + 300000);
    FB.tracker.tick();
    const P = FB.store.order(pk.id);
    if (P.status !== 'delivered') throw new Error('the pickup never completed');
    const feed = JSON.stringify(P.events);
    if (/photo is of a door/.test(feed)) throw new Error('a pickup order ended with a photo of your door');
    if (FB.tracker.steps(P)[4].label === FB.tracker.steps(o)[4].label) throw new Error('pickup and delivery share step labels');

    /* ---- a scheduled order waits for its slot ---- */
    FB.store.reset();
    const sc = place('starbux', { scheduled: '11:45 PM' });
    if (sc.startAt <= sc.placedAt) throw new Error('a scheduled order started when it was placed');
    FB.tracker.tick();
    if (FB.store.order(sc.id).events.length) throw new Error('a scheduled order began cooking before its slot');
    if (!FB.tracker.isPending(FB.store.order(sc.id))) throw new Error('a scheduled order does not read as pending');
    clock.set(sc.startAt + 30000);
    FB.tracker.tick();
    if (!FB.store.order(sc.id).events.length) throw new Error('a scheduled order never started at its slot');

    /* ---- a save written before timetables existed must not throw ---- */
    FB.store.reset();
    clock.set(T0);
    harness.addToCart(FB, 'starbux', 2);
    const legacy = harness.makeOrder(FB, 'starbux', { now: T0 });
    delete legacy.schedule; delete legacy.deliverAt; delete legacy.finalBeat; delete legacy.startAt;
    legacy.step = 2; legacy.status = 'preparing'; legacy._next = T0 + 1400;
    FB.store.set((st) => { st.orders.unshift(legacy); st.activeOrderId = legacy.id; return st; });
    clock.set(T0 + 3600000);
    FB.tracker.resume();
    const L = FB.store.order(legacy.id);
    if (L.status !== 'delivered') throw new Error('a schedule-less order did not settle: ' + L.status);

    return 'countdown, catch-up, pickup, scheduling and legacy saves';
  } finally { clock.restore(); app.dispose(); }
});

check('every store has hours, and they survive midnight', () => {
  /* closesAt was printed as decoration: the info sheet hardcoded "Open now", so
     Sunrise Donut — which shuts at 1:20 PM — was orderable at 3 AM. Eight of the
     twenty stores close AFTER midnight, so none of this works unless a window is
     allowed to wrap; a validation of the shape opensAt !== closesAt would pass a
     store open for minus nineteen hours. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const at = (h, m) => new Date(2026, 7, 20, h, m || 0, 0).getTime();
    let wrapping = 0, dayparted = 0;

    for (const [slug, m] of Object.entries(SOURCES)) {
      const o = FB.minsOfDay(m.opensAt), c = FB.minsOfDay(m.closesAt);
      if (o === null) throw new Error(slug + ': opensAt "' + m.opensAt + '" does not parse');
      if (c === null) throw new Error(slug + ': closesAt "' + m.closesAt + '" does not parse');
      if (o === c) throw new Error(slug + ' opens and closes at the same minute');
      if (c <= o) wrapping++;
      for (const sec of m.menu) {
        if (!sec.daypart) continue;
        dayparted++;
        const f = FB.minsOfDay(sec.daypart.from), t = FB.minsOfDay(sec.daypart.to);
        if (f === null || t === null) throw new Error(slug + '/' + sec.id + ': daypart does not parse');
        /* the section must be servable at its own opening minute */
        const store = FB.catalog.get(slug);
        const probe = new Date(2026, 7, 20, Math.floor(f / 60), f % 60, 0).getTime();
        if (!FB.catalog.isOpen(store, probe)) {
          throw new Error(slug + '/' + sec.id + ' opens at ' + sec.daypart.from + ', when the store is shut');
        }
        if (!FB.catalog.sectionOpen(sec, probe)) throw new Error(slug + '/' + sec.id + ' is not open at its own opening minute');
      }
    }
    /* the wrap branch must actually be exercised by the data, not just supported */
    if (wrapping < 1) throw new Error('no store spans midnight, so the wrap branch is never tested');
    if (dayparted < 1) throw new Error('no section carries a daypart');

    /* the specific claims the copy makes */
    const shut = (slug, t) => !FB.catalog.isOpen(FB.catalog.get(slug), t);
    if (!shut('sunrisedonut', at(15))) throw new Error('Sunrise Donut is open at 3 PM and closes at 1:20 PM');
    if (!shut('ssa', at(18))) throw new Error('the Sandwich Authority is open at 6 PM and closes at 4:30 PM');
    if (shut('tacobelligerent', at(3))) throw new Error('the late-night Tex-Mex place is shut at 3 AM');
    if (shut('mcronalds', at(1))) throw new Error("McRonald's is shut at 1 AM and closes at 2 AM");

    /* and the city as a whole has to have a shape */
    const openAt = (h) => FB.catalog.all().filter((s) => FB.catalog.isOpen(s, at(h))).length;
    if (openAt(3) > 4) throw new Error(openAt(3) + ' stores open at 3 AM');
    if (openAt(12) !== 20) throw new Error('only ' + openAt(12) + ' stores open at noon');

    /* purity: same store, same instant, same answer, and no state read */
    const s0 = FB.catalog.get('mcronalds');
    if (FB.catalog.isOpen(s0, at(12)) !== FB.catalog.isOpen(s0, at(12))) throw new Error('isOpen is not pure');

    return wrapping + ' stores span midnight, ' + dayparted + ' dayparted sections, ' +
      openAt(3) + ' open at 3 AM and ' + openAt(12) + ' at noon';
  } finally { clock.restore(); app.dispose(); }
});

check('notifications accumulate, back-date, and never stay read', () => {
  /* The bell opened a module-local array of six rows with the ages "2m" and "31m"
     baked in. The backlog is COMPUTED at boot from what the save already knows
     rather than accrued by a timer — which is what makes three days away produce
     three days of correctly back-dated nagging at no storage cost, and is also why
     it has to be idempotent. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    if (FB.notifs.unreadCount() !== 0) throw new Error('a fresh install already has notifications');

    /* an order emits one per STEP, not one per beat, and never twice */
    harness.addToCart(FB, 'mcronalds', 2);
    const o = harness.makeOrder(FB, 'mcronalds', { now: T0 });
    o.etaDrift = 0; o.events = [];
    FB.tracker.build(o);
    FB.cart.clear('mcronalds');
    FB.store.set((st) => { st.orders.unshift(o); st.activeOrderId = o.id; return st; });
    for (let t = 0; t <= 160; t += 2) { clock.set(o.startAt + t * 1000); FB.tracker.tick(); }
    const afterOrder = FB.notifs.list().length;
    if (afterOrder < 3) throw new Error('an entire order produced only ' + afterOrder + ' notifications');
    if (afterOrder > 6) throw new Error(afterOrder + ' notifications for one order — that is per beat, not per step');
    FB.tracker.tick(); FB.tracker.tick();
    if (FB.notifs.list().length !== afterOrder) throw new Error('re-ticking duplicated notifications');
    for (const n of FB.notifs.list()) {
      if (!n.ts || n.ts > clock.now()) throw new Error('a notification is stamped in the future');
      if (n.go && !FB.screens.get(n.go)) throw new Error('a notification points at a screen that does not exist: ' + n.go);
      if (!FB.icon(n.icon, 12)) throw new Error('a notification uses an icon that does not exist: ' + n.icon);
    }

    /* three days away is three days of back-dated nagging, and running it twice is not six */
    FB.store.reset();
    clock.set(T0);
    FB.store.set((st) => { st.orders = [{ placedAt: T0 }]; st.notifsThrough = 0; return st; });
    clock.set(T0 + 3 * 86400000);
    const first = FB.notifs.backfill();
    if (first !== 3) throw new Error('three days away produced ' + first + ' notifications');
    if (FB.notifs.backfill() !== 0) throw new Error('running the backlog twice produced duplicates');
    const miss = FB.notifs.list().filter((n) => n.kind === 'miss');
    const bodies = new Set(miss.map((n) => n.body));
    if (bodies.size !== miss.length) throw new Error('the backlog sent the same sentence more than once');
    /* each is dated at the day it would have been sent, and reports the gap as it was THEN */
    if (!miss.some((n) => /in 1 day\b/.test(n.body))) throw new Error('no nag reports the gap as it was on day one');

    /* the cap holds */
    FB.notifs.pushMany(Array.from({ length: 100 }, (_, i) => ({ id: 'bulk:' + i, kind: 'order', title: 'x', body: 'y', ts: T0 + i })));
    if (FB.notifs.list().length !== FB.notifs.CAP) throw new Error('the cap is ' + FB.notifs.list().length + ', not ' + FB.notifs.CAP);

    /* a switch that is off gates its kind */
    FB.store.reset();
    clock.set(T0);
    FB.store.set((st) => { st.settings.notifications.reengagement = false; st.orders = [{ placedAt: T0 }]; return st; });
    clock.set(T0 + 3 * 86400000);
    if (FB.notifs.backfill() !== 0) throw new Error('re-engagement is switched off and still notified');

    /* and the joke: marked as read, then unread again, one at a time */
    FB.store.reset();
    clock.set(T0);
    FB.store.set((st) => { st.orders = [{ placedAt: T0 }]; return st; });
    clock.set(T0 + 3 * 86400000);
    FB.notifs.backfill();
    const n0 = FB.notifs.unreadCount();
    FB.notifs.markAllRead();
    if (FB.notifs.unreadCount() !== 0) throw new Error('Mark all as read did not');
    clock.advance(60000);
    if (FB.notifs.unreadCount() !== 1) throw new Error('they came back all at once, or not at all');
    clock.advance(600000);
    if (FB.notifs.unreadCount() !== n0) throw new Error('they did not all come back');

    return 'per step, back-dated, capped at ' + FB.notifs.CAP + ', gated, and always unread';
  } finally { clock.restore(); app.dispose(); }
});

check('Standing is earned by ordering and lost by not ordering', () => {
  /* Nothing outside BODYMAX changed as you used this app: order forty was
     byte-identical to order one. The tier table and decay curve are pure, so they
     are tested here the way fees.js is — numbers in, numbers out. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const S = FB.standing;

    /* the ladder is monotone and its top tier is reachable */
    let prevAt = -1;
    for (const t of S.TIERS) {
      if (t.at <= prevAt) throw new Error('tier ' + t.name + ' is not above the one below it');
      if (S.tierFor(t.at) !== t.key) throw new Error(t.name + ' is not entered at its own threshold');
      if (!t.benefit) throw new Error(t.name + ' has no benefit');
      prevAt = t.at;
    }
    if (S.toNext(S.TIERS[S.TIERS.length - 1].at) !== null) throw new Error('the top tier claims a next one');

    /* upkeep rises with the tier and is free at the bottom */
    let prevFee = -1;
    for (const t of S.TIERS) {
      const f = S.upkeep(t.key);
      if (f < prevFee) throw new Error('upkeep falls at ' + t.name);
      prevFee = f;
    }
    if (S.upkeep(0) !== 0) throw new Error('the bottom tier is not free, which makes it a subscription');
    /* one table, in fees.js, read back by standing.js */
    if (S.upkeep(3) !== FB.fees.STANDING_UPKEEP[3]) throw new Error('standing.js and fees.js disagree about upkeep');

    /* the fee is invisible without a tier, so the headless $60.00 case is safe */
    const bare = FB.fees.compute({ subtotal: 12, lineCount: 2, settings: FB.S().settings });
    if (bare.feeLines.some((l) => l.id === 'standing')) throw new Error('a tierless order was charged Standing Maintenance');
    if (bare.total !== 60) throw new Error('the $60.00 case moved: ' + bare.total);
    for (const tier of [0, undefined, null]) {
      const c = FB.fees.compute({ subtotal: 12, lineCount: 2, standingTier: tier, settings: FB.S().settings });
      if (c.feeLines.some((l) => l.id === 'standing')) throw new Error('tier ' + tier + ' acquired the fee');
    }

    /* decay is day-granular: reloading a page cannot cost you a point */
    if (S.decay(10, 0) !== 10) throw new Error('decay charged for no elapsed days');
    if (S.decay(10, 3) !== 7) throw new Error('decay is not one point per day');
    if (S.decay(2, 99) !== 0) throw new Error('decay went below zero');
    if (S.daysBetween(0, Date.now()) !== 0) throw new Error('decay from a null stamp is not zero');

    /* and the round trip through state */
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    FB.store.set((st) => {
      st.standing = { points: 9, tier: S.tierFor(9), lastOrderAt: T0, decayedThrough: T0, seenTier: S.tierFor(9) };
      return st;
    });
    if (FB.S().standing.tier !== 2) throw new Error('nine points is not SUSTAINING');
    clock.set(T0 + 12 * 3600000);            /* half a day */
    if (S.settle() !== null) throw new Error('half a day cost a point');
    clock.set(T0 + 4 * 86400000);            /* four days */
    const lost = S.settle();
    if (!lost) throw new Error('four days away cost nothing');
    if (FB.S().standing.points !== 5) throw new Error('points after four days: ' + FB.S().standing.points);
    if (FB.S().standing.tier !== 1) throw new Error('four days away did not demote');
    /* settling again on the same day must be a no-op, or every reload demotes */
    if (S.settle() !== null) throw new Error('settling twice in one day decayed twice');

    return S.TIERS.length + ' tiers, upkeep $' + S.upkeep(1).toFixed(2) + '-$' + S.upkeep(4).toFixed(2) + ', 1 point a day';
  } finally { clock.restore(); app.dispose(); }
});

check('BANG+ keeps books, and BangBux expire', () => {
  /* plus.saved was written as 0 on join and never incremented while five places
     rendered it, and `credits` was declared, rendered in two screens, and granted
     by nothing — the checkout row is gated on > 0, so it had never rendered once. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const S = FB.S().settings;
    const base = { subtotal: 40, lineCount: 3, settings: S, store: FB.catalog.get('mcronalds') };

    /* the ledger */
    const member = FB.fees.compute({ ...base, plus: true });
    const outsider = FB.fees.compute(base);
    if (!(member.plusSaved > 0)) throw new Error('membership saved nothing on a delivery order');
    if (member.plusPaid !== 1.99) throw new Error('the Benefit Realization Fee is not being recorded');
    /* the joke has to survive: on an ordinary order, membership is a net loss */
    if (member.plusSaved - member.plusPaid >= 0) throw new Error('membership is net POSITIVE on a $40 order');
    if (outsider.plusSaved !== 0 || outsider.plusPaid !== 0) throw new Error('a non-member has a member ledger');
    /* and pickup has no saving at all, which is why the checkout pitch hides there */
    const pickup = FB.fees.compute({ ...base, plus: true, mode: 'pickup' });
    if (pickup.plusSaved !== 0) throw new Error('pickup claims a BANG+ delivery saving');

    /* redemption: whole BangBux, capped, and after the multiplier */
    const plain = FB.fees.compute(base);
    if (JSON.stringify(FB.fees.compute({ ...base, scrip: 0 })) !== JSON.stringify(plain)) {
      throw new Error('passing scrip: 0 changes the result');
    }
    const red = FB.fees.compute({ ...base, scrip: 3 });
    if (red.scripUsed !== FB.fees.SCRIP_MAX_PER_ORDER) throw new Error('redemption is not capped per order: ' + red.scripUsed);
    if (FB.fees.compute({ ...base, scrip: 0.9 }).scripUsed !== 0) throw new Error('a fractional balance was redeemed');
    const line = red.feeLines.find(l => l.id === 'scrip');
    if (!line || line.amount >= 0) throw new Error('redemption is not a negative fee line');
    const peakIdx = red.feeLines.findIndex(l => l.id === 'peak');
    if (red.feeLines.findIndex(l => l.id === 'scrip') < peakIdx) {
      throw new Error('redemption lands before the multiplier, shrinking the ×1.4 it was multiplied into');
    }
    if (Math.abs(red.feesTotal - (plain.feesTotal - red.scripUsed)) > 0.011) {
      throw new Error('redemption did not come off the fee total');
    }

    /* and the punchline the engine delivers on its own */
    if (red.total !== plain.total) {
      throw new Error('Convenience Rounding no longer absorbs a $1 redemption — check the copy still matches');
    }

    /* grants expire seventy-two hours after issue, oldest spent first */
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);
    FB.scrip.grant(1, T);
    FB.scrip.grant(1, T - 40 * 3600000);
    if (FB.scrip.balance() !== 2) throw new Error('balance is ' + FB.scrip.balance() + ', not 2');
    if (FB.scrip.redeemable() !== FB.fees.SCRIP_MAX_PER_ORDER) throw new Error('redeemable ignores the per-order cap');
    FB.scrip.grant(1, T - 80 * 3600000);          /* already dead on arrival */
    if (FB.scrip.balance() !== 2) throw new Error('an expired grant counted toward the balance');
    if (FB.scrip.expire(T) !== 1) throw new Error('expire() did not reclaim the dead grant');
    /* spending takes the oldest first, so what is about to expire goes first */
    FB.scrip.spend(1, T);
    const left = FB.S().scrip;
    if (left.length !== 1 || left[0].at !== T) throw new Error('spending did not take the oldest grant first');
    clock.set(T + 80 * 3600000);
    if (FB.scrip.expire() !== 1) throw new Error('a grant did not expire after 72 hours');
    if (FB.scrip.balance() !== 0) throw new Error('balance survived expiry');

    return 'ledger, capped whole-BangBux redemption after the multiplier, 72h expiry';
  } finally { clock.restore(); app.dispose(); }
});

check('the cancellation flow gets longer and the offer gets worse', () => {
  /* cancelAttempts counts COMPLETED cancellations, so it cannot drive "your second
     cancellation" — that would need a rejoin in between. Entries to the flow are
     counted separately. The flow is an ordered list rather than a numbered chain,
     because inserting a step into the chain meant renumbering every forward call
     and an off-by-one there strands the user in a sheet with no way out. */
  const app = harness.loadApp();
  const { FB } = app;
  try {
    const F = FB.plusFlow;

    /* the offer deepens while the rate it lands on rises */
    let prevRate = -1;
    for (let i = 1; i <= RETENTION_PROBE; i++) {
      const r = F.retentionFor(i);
      if (!r || !r.headline) throw new Error('no retention offer at entry ' + i);
      if (r.then <= prevRate) throw new Error('the post-promotional rate did not rise at entry ' + i);
      prevRate = r.then;
    }
    /* and it is clamped, never undefined, however many times you try */
    for (const n of [0, 1, 99, -3]) {
      if (!F.retentionFor(n) || !F.retentionFor(n).headline) throw new Error('retentionFor(' + n + ') is not a real offer');
    }

    /* the flow only grows, and every step in it is distinct */
    let prevLen = 0;
    for (let entry = 1; entry <= 4; entry++) {
      const steps = F.stepsFor(entry);
      if (steps.length < prevLen) throw new Error('the flow got SHORTER at entry ' + entry);
      if (new Set(steps).size !== steps.length) throw new Error('a step appears twice at entry ' + entry);
      if (steps[0] !== 'manage') throw new Error('the flow does not start at Manage membership');
      if (steps[steps.length - 1] !== 'phone') throw new Error('the flow does not end at the phone number');
      prevLen = steps.length;
    }
    if (F.stepsFor(2).length <= F.stepsFor(1).length) throw new Error('the second entry is no longer than the first');
    if (F.stepsFor(3).length <= F.stepsFor(2).length) throw new Error('the third entry is no longer than the second');
    if (F.stepsFor(1).includes('survey')) throw new Error('the survey appears on the first entry');
    if (!F.stepsFor(2).includes('survey')) throw new Error('the survey never appears');
    if (!F.stepsFor(3).includes('arbitration')) throw new Error('the arbitration notice never appears');

    return F.stepsFor(1).length + ' steps, then ' + F.stepsFor(2).length + ', then ' + F.stepsFor(3).length +
      '; $' + F.retentionFor(1).then + ' -> $' + F.retentionFor(3).then;
  } finally { app.dispose(); }
});

check('the terms get worse, and take §4.2 with them', () => {
  /* The only mechanism in this app that can retroactively worsen a rule you have
     already learned. Everything else escalates what happens next. */
  const app = harness.loadApp();
  const { FB } = app;
  try {
    const T = FB.tos;

    /* well-formed: versions strictly increase, each has a label and a diff */
    let prev = 0;
    for (const v of T.VERSIONS) {
      if (v.n <= prev) throw new Error('version ' + v.label + ' does not increase');
      if (!v.label) throw new Error('version ' + v.n + ' has no label');
      if (v.n > 1 && (!v.diff || !v.diff.length)) throw new Error('version ' + v.label + ' changes nothing');
      if (!v.fries) throw new Error('version ' + v.label + ' does not say what §4.2 entitles a Slinger to');
      prev = v.n;
    }
    /* the labels continue the app version already printed on the Account screen */
    if (T.VERSIONS[0].label !== '9.4.1') throw new Error('the terms start a second version scheme');

    /* the gate fires on the third order and every fifth after it */
    const fires = [];
    for (let n = 1; n <= 30; n++) if (T.dueAt(n)) fires.push(n);
    const want = [];
    for (let n = T.FIRST_AT; n <= 30; n += T.EVERY) want.push(n);
    if (fires.join(',') !== want.join(',')) throw new Error('the gate fires at ' + fires.join(',') + ', expected ' + want.join(','));

    /* accepting one stops it asking again for that version */
    const at = T.dueAt(T.FIRST_AT);
    T.accept(at);
    if (T.dueAt(T.FIRST_AT) !== null) throw new Error('the gate asks again for a version already accepted');
    if (T.version() !== at) throw new Error('accepting did not record the version');
    if (T.label() !== T.entry(at).label) throw new Error('the accepted label does not match');

    /* the Reconciliation Fee arrives with §14 and not before */
    const S = FB.S().settings;
    for (const v of [undefined, 0, 1, 2]) {
      const c = FB.fees.compute({ subtotal: 40, lineCount: 3, settings: S, tosVersion: v });
      if (c.feeLines.some(l => l.id === 'reconciliation')) throw new Error('the Reconciliation Fee applies at version ' + v);
    }
    const c3 = FB.fees.compute({ subtotal: 40, lineCount: 3, settings: S, tosVersion: 3 });
    if (!c3.feeLines.some(l => l.id === 'reconciliation')) throw new Error('the Reconciliation Fee never applies');
    /* and it cannot reach the headless $12 -> $60.00 case */
    if (FB.fees.compute({ subtotal: 12, lineCount: 2, settings: S }).total !== 60) throw new Error('the $60.00 case moved');

    /* §4.2 changes the world, not just the paperwork: the version that raises the
       tribute must be the version whose diff says it does */
    const raises = T.VERSIONS.find(v => v.diff.some(d => /§4\.2/.test(d) && /fry|fries/.test(d)));
    if (!raises) throw new Error('no version amends §4.2');
    const before = T.fries(raises.n - 1), after = T.fries(raises.n);
    if (before === after) throw new Error('the §4.2 diff claims a change the tracker does not make');

    /* every token the scripts use must be one fill() knows about */
    const known = new Set(['store', 'slinger', 'rating', 'deliveries', 'vehicle', 'fries']);
    for (const script of [FB.tracker.SCRIPT, FB.tracker.PICKUP_SCRIPT]) {
      for (const step of Object.values(script)) {
        const all = (step.beats || []).concat(...Object.values(step.extra || {}));
        for (const b of all) {
          for (const m of String(b[0] + ' ' + (b[1] || '')).matchAll(/\{(\w+)\}/g)) {
            if (!known.has(m[1])) throw new Error('a tracker beat uses {' + m[1] + '}, which fill() does not know');
          }
        }
      }
    }

    return T.VERSIONS.length + ' versions, gated at order ' + want.slice(0, 3).join(', ') + '…, §4.2 ' + before + ' -> ' + after;
  } finally { app.dispose(); }
});

check('no two orders tell the same story', () => {
  /* advance() indexed a fixed array, so the tracker revealed itself as a tape loop
     on about order four. The spine still plays in order — "arrived at {store}"
     cannot follow "Order collected" and still read — but flavour is unlocked by
     tenure and inserted among it, seeded on the order id. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    function story(orderCount, id, mode) {
      FB.store.set((st) => { st.meta.orderCount = orderCount; return st; });
      harness.addToCart(FB, 'mcronalds', 2);
      const o = harness.makeOrder(FB, 'mcronalds', { now: T0, mode: mode || 'delivery' });
      o.id = id; o.etaDrift = 0; o.events = []; delete o.tier;
      FB.tracker.build(o);
      FB.cart.clear('mcronalds');
      return o;
    }

    /* tenure widens the pool */
    const t1 = story(0, 'o_t1'), t2 = story(8, 'o_t2'), t3 = story(20, 'o_t3');
    if (!(t1.tier === 1 && t2.tier === 2 && t3.tier === 3)) {
      throw new Error('tenure did not map to tiers: ' + [t1.tier, t2.tier, t3.tier].join(','));
    }
    if (!(t3.schedule.length > t2.schedule.length && t2.schedule.length > t1.schedule.length)) {
      throw new Error('a longer tenure did not produce a longer story');
    }

    /* two orders at the same tier are different stories */
    const a = story(20, 'o_aaa'), b = story(20, 'o_bbb');
    const sa = a.schedule.map((x) => x.text).join('|'), sb = b.schedule.map((x) => x.text).join('|');
    if (sa === sb) throw new Error('two orders at the same tier told an identical story');

    /* and the same order is the same story, twice */
    const again = story(20, 'o_aaa');
    if (again.schedule.map((x) => x.text).join('|') !== sa) throw new Error('rebuilding an order changed its story');

    /* the spine keeps its order inside every step */
    for (const o of [t1, t2, t3]) {
      const script = o.mode === 'pickup' ? FB.tracker.PICKUP_SCRIPT : FB.tracker.SCRIPT;
      for (const key of Object.keys(script)) {
        if (key === 'delivered') continue;
        const spine = script[key].beats.map((x) => x[0]);
        const got = o.schedule.filter((x) => x.step === key).map((x) => x.text);
        let at = -1;
        for (const s of spine) {
          /* a spine beat may carry tokens, so match on the filled prefix */
          const idx = got.findIndex((g, i) => i > at && g.slice(0, 12) === s.replace(/\{\w+\}/g, '').slice(0, 12).trim().slice(0, 12));
          if (s.startsWith('{')) continue;              /* token-led beats are matched loosely */
          if (idx <= at && idx !== -1) throw new Error('the spine of ' + key + ' was reordered');
          if (idx > at) at = idx;
        }
      }
    }

    /* the delivered beat comes from the pool, not from a hardcoded literal —
       SCRIPT.delivered was dead code until it did */
    const d3 = FB.tracker.SCRIPT.delivered;
    if (!d3.extra || !d3.extra[3]) throw new Error('there is no tier-3 delivered beat to be dead code about');

    /* and every order still delivers inside its own window */
    for (const o of [t1, t2, t3]) {
      FB.store.reset();
      FB.store.set((st) => { st.orders.unshift(o); st.activeOrderId = o.id; return st; });
      clock.set(o.deliverAt + 5 * 60000);
      FB.tracker.tick();
      if (FB.store.order(o.id).status !== 'delivered') throw new Error('a tier-' + o.tier + ' order ran past its own window');
    }

    return 'tiers ' + t1.schedule.length + '/' + t2.schedule.length + '/' + t3.schedule.length + ' beats, seeded per order';
  } finally { clock.restore(); app.dispose(); }
});

console.log('');
if (failed) { console.log(failed + ' check(s) failed'); process.exit(1); }
console.log('all checks passed');
