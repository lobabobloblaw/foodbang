/* Smoke test for the invariants that are easy to break silently.
   node tools/smoke.cjs   (also: npm test) */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
let failed = 0;
let ran = 0;

function check(label, fn) {
  ran++;
  try {
    const detail = fn();
    /* This runner is synchronous. A check written as an async function returned a
       Promise nobody awaited, and every assertion inside it passed forever; the
       detail it returns is read as a string, so a thenable here is always a bug. */
    if (detail && typeof detail.then === 'function') {
      throw new Error('the check returned a Promise — the runner is synchronous and would never see it reject');
    }
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
require(path.join(ROOT, 'js/core/proof.js'));
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
    { subtotal: 40, lineCount: 3, restockAlerts: 2 },
    { subtotal: 40, lineCount: 3, tipReviews: 1 },
    { subtotal: 40, lineCount: 3, substitution: true },
    { subtotal: 40, lineCount: 3, hold: true },
  ];
  const seen = new Set(), missing = new Set();
  for (const ctx of contexts) {
    const c = FB.fees.compute({ settings: base, ...ctx });
    for (const l of c.feeLines.concat([c.taxLine, c.tipLine], c.roundLine ? [c.roundLine] : [])) {
      seen.add(l.id);
      if (!FB.FEE_WHY[l.id]) missing.add(l.id);
    }
  }
  /* The pay statement runs the same engine against a courier's gross and renders
     through the same (?) markup, so an id it emits without an explanation fails in
     exactly the same silent way. Both access branches, and a gross above the
     break-even so the settlement row is present in one and absent in the other. */
  const payCtxs = [{ gross: 5.53, access: true }, { gross: 12.35 }, { gross: 60, access: true }];
  for (const ctx of payCtxs) {
    const p = FB.fees.payout(ctx);
    for (const l of [p.incomeLine].concat(p.lines, p.settlement ? [p.settlement] : [])) {
      seen.add(l.id);
      if (!FB.FEE_WHY[l.id]) missing.add(l.id);
    }
  }
  if (missing.size) throw new Error('missing explanations for: ' + [...missing].join(', '));
  /* Both sides must actually have been walked, or this check quietly becomes the
     receipt-only check it used to be. */
  for (const id of ['other', 'scrip', 'pickupA', 'labor']) {
    if (!seen.has(id)) throw new Error('the walk never reached ' + id);
  }
  return seen.size + ' distinct fee ids across ' + (contexts.length + payCtxs.length) + ' contexts';
});

check('the bundle was built from exactly these sources', () => {
  /* The only claim this check used to make was a store count, so editing a price
     and forgetting `npm run bundle` shipped a stale app that everything agreed
     with. bundle.cjs stamps a hash of the sources into the banner. */
  eq(Object.keys(MENUS).length, SRC_FILES.length, 'store count');
  const h = crypto.createHash('sha256');
  for (const f of SRC_FILES) h.update(f).update(fs.readFileSync(path.join(MENU_DIR, f)));
  h.update('tools/bundle.cjs').update(fs.readFileSync(path.join(ROOT, 'tools/bundle.cjs')));
  const want = h.digest('hex');
  const whole = fs.readFileSync(path.join(ROOT, 'js/data/menus.generated.js'), 'utf8');
  const gen = whole.slice(0, 400);
  const got = (gen.match(/sources sha256 ([0-9a-f]{64})/) || [])[1];
  if (!got) throw new Error('the bundle carries no source hash — run npm run bundle');
  if (got !== want) throw new Error('the bundle is stale: run npm run bundle');
  /* The source hash cannot see a hand edit to the OUTPUT: every data check reads the
     sources by design, so a price changed directly in the bundle, banner untouched,
     used to pass all of them while being the number the app actually ships. */
  const bodyAt = whole.indexOf('window.FB_MENUS');
  if (bodyAt < 0) throw new Error('the bundle does not define the menu global');
  const stamped = (gen.match(/bundle sha256 ([0-9a-f]{64})/) || [])[1];
  if (!stamped) throw new Error('the bundle carries no output hash — run npm run bundle');
  const actual = crypto.createHash('sha256').update(whole.slice(bodyAt)).digest('hex');
  if (actual !== stamped) throw new Error('menus.generated.js has been edited by hand: its body no longer matches the hash bundle.cjs stamped — run npm run bundle');
  /* and the build-only fields really are absent from what ships */
  for (const k of ['imagePrompt', 'photoStyle']) {
    if (whole.includes('"' + k + '"')) throw new Error(k + ' is still in the runtime bundle');
  }
  return SRC_FILES.length + ' stores, source and output hashes match, build-only fields stripped';
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
  /* The count moves as the menu is photographed out — it was 120/87 when only six
     items per store had a picture. Every photograph added since is amateur by
     decision (see CLAUDE.md): the 33 studio shots are the original chain-marketing
     exception and no more are being made. Move this number, README.md and CLAUDE.md
     together; all three carry it. */
  eq(items.length, 426, 'photographed items');
  eq(amateur, 393, 'amateur photos');
  eq(items.length - amateur, 33, 'studio photos, which are not growing');
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
    try { params = fx.apply(FB, hourTs) || {}; }
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
     The stylesheet side is held to the same standard, LOCAL links only: the Google
     Fonts link uses the reversed attribute order and the build re-emits it itself. */
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  const localLinks = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
    .map(m => m[0]).filter(t => !/href="https?:/.test(t));
  if (styles.length !== localLinks.length) {
    throw new Error(localLinks.length + ' local stylesheet links but only ' + styles.length + ' match the shape the build reads');
  }
  if (styles.length < 3) throw new Error('index.html lists only ' + styles.length + ' stylesheets');
  for (const f of styles) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error('index.html lists a missing stylesheet: ' + f);
  }
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
  /* and the build refuses, itself, to write a file that breaks the rule — a check
     that only looks at whatever build is lying around asserts nothing on a fresh clone */
  const builder = fs.readFileSync(path.join(ROOT, 'tools/build-artifact.cjs'), 'utf8');
  if (!/refusing to write/.test(builder) || !/LINE_LIMIT = 1024/.test(builder)) {
    throw new Error('build-artifact.cjs no longer refuses to write an over-long line');
  }
  return styles.length + ' stylesheets, ' + scripts.length + ' scripts, body slice intact, ' + note;
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

check('an item the restaurant has stopped serving cannot be sold anywhere', () => {
  /* Scarcity is keyed on the item and the DAY, and the sold-out gate only ever
     covered the item sheet and reorder. A cart built before midnight still sold the
     item after it, at both the cart and the checkout; Search rendered it at full
     price with no marker and then refused the sale when tapped; and the $1.40
     Restock Monitoring fee kept being charged for items already back in stock,
     because st.restock was settled only at boot.

     The rule lives in js/core/cart.js and js/core/notifs.js so every surface reads
     one answer — the same reason `slot` does. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    /* find a real out-of-stock case rather than inventing one: the day key is
       seeded, so this is stable across runs */
    let hit = null;
    outer:
    for (const st of FB.catalog.all()) {
      for (let d = 20; d < 34; d++) {
        const now = new Date(2026, 7, d, 13, 0, 0).getTime();
        for (const sec of st.menu) for (const it of sec.items) {
          if (it.scarce && !FB.catalog.available(it, now)) { hit = { st, it, now, d }; break outer; }
        }
      }
    }
    if (!hit) throw new Error('no scarce item is ever unavailable, so scarcity is not wired up');
    clock.set(hit.now);

    /* The fixture helper must never hand a check a basket that cannot be bought.
       Which items are out is genuinely zone-dependent — scarcity's threshold samples
       the world at a LOCAL 7 PM, whose epoch moves — so a helper that scooped up a
       dead line turned unrelated checks red in Berlin, Tokyo and Honolulu while
       staying green in Los Angeles. Asserted here so it fails in every zone. */
    FB.cart.clearAll();
    harness.addToCart(FB, hit.st.slug, 40);
    const scooped = FB.cart.unsellable(hit.st.slug);
    if (scooped.length) {
      throw new Error('harness.addToCart put ' + scooped.length + ' unsellable line(s) in a fixture cart: ' +
        scooped.map((l) => l.name).join(', '));
    }
    if (!FB.cart.lines(hit.st.slug).length) throw new Error('addToCart filtered the whole menu away');
    FB.cart.clearAll();

    /* 1. the cart knows, and says why */
    FB.cart.add(hit.st.slug, hit.it, FB.catalog.defaultSel(hit.it), 1, '');
    harness.addToCart(FB, hit.st.slug, 1);
    if (FB.cart.unsellable(hit.st.slug).length !== 1) throw new Error('the cart does not know its own dead line');
    /* and a line whose item has left the menu entirely — unitPrice and describe
       cannot resolve it either, so it is just as unsellable */
    FB.store.set((st) => {
      st.cart[hit.st.slug].lines.push({ lid: 'l_ghost', key: 'ghost', itemId: 'no-such-item',
        name: 'Withdrawn Item', sel: {}, qty: 1, unit: 4.5, note: '' });
      return st;
    });
    if (FB.cart.unsellable(hit.st.slug).length !== 2) throw new Error('a line whose item has left the catalog is still sellable');
    FB.cart.remove(hit.st.slug, 'l_ghost');
    const cart = FB.screens.get('cart').render({ slug: hit.st.slug });
    if (!/cartline is-out/.test(cart)) throw new Error('the cart draws a dead line as an ordinary one');
    if (!cart.includes('Unavailable today')) throw new Error('the cart does not say the line is unavailable');
    /* The cart's total is the only figure on the screen. Pricing the struck-through
       line into it quoted a basket nothing could ever charge — the house rule this
       file enforces twice elsewhere is that a screen may not quote a total it will
       not charge. Compare against the same cart with the dead line actually gone. */
    const receiptOf = (markup) => {
      const m = /<div class="receipt">[\s\S]*?<\/div>\s*<\/div>/.exec(markup);
      if (!m) throw new Error('the cart does not print a receipt at all');
      return m[0];
    };
    /* The WHOLE receipt, not just the total: the round-up to the next $5 absorbs a
       per-line fee, so comparing the bottom line alone misses lineCount drift. */
    const withDead = receiptOf(cart);
    const deadLid = FB.cart.unsellable(hit.st.slug)[0].lid;
    const keep = FB.deep(FB.S().cart[hit.st.slug].lines);
    FB.cart.remove(hit.st.slug, deadLid);
    const withoutDead = receiptOf(FB.screens.get('cart').render({ slug: hit.st.slug }));
    FB.store.set((st) => { st.cart[hit.st.slug].lines = keep; return st; });
    if (withDead !== withoutDead) {
      throw new Error('the cart prices a basket it refuses differently from the one it is telling you to arrive at');
    }

    /* 2. and will not lead anywhere that would charge for it */
    if (/data-checkout/.test(cart)) throw new Error('the cart still offers checkout with a dead line in it');
    if (!/<button[^>]*disabled>[^<]*must be removed<\/button>/.test(cart)) {
      throw new Error('the cart withdrew its checkout button without offering anything in its place');
    }
    const co = FB.screens.get('checkout').render({ slug: hit.st.slug });
    if (/data-place/.test(co)) throw new Error('checkout still offers to place an order containing a dead line');
    if (!co.includes('no longer available')) throw new Error('checkout refuses without saying why');
    if (!/data-go="cart" data-params="\{&quot;slug&quot;/.test(co)) throw new Error('the refusal cannot get back to the cart it names');
    /* the refusal must also agree with itself on number — the subject was branched
       and the pronoun after it was not, so one dead line read "one item … They" */
    const deadNow = FB.cart.unsellable(hit.st.slug);
    if (deadNow.length !== 1) throw new Error('expected exactly one dead line at this point, found ' + deadNow.length);
    if (/\bThey must be removed/.test(co)) throw new Error('the refusal says "They" about one item');
    if (!/stopped serving one item/.test(co)) throw new Error('the refusal does not count one dead line as one item');

    /* 3. Search renders items with its own markup, and was the one surface that
          never asked — a full-price row that refuses the sale when tapped */
    const sdef = FB.screens.get('search');
    const live = [];
    const stub = () => ({ dataset: {}, innerHTML: '', scrollTop: 0, addEventListener() {}, removeEventListener() {},
      querySelector: stub, querySelectorAll: () => [], insertAdjacentHTML() {}, contains: () => true });
    const sroot = Object.assign(stub(), { addEventListener: (t, h) => live.push({ t, h }) });
    FB._binds = []; sdef.mount(sroot); FB._binds = null;
    const chip = { dataset: { q: hit.it.name } };
    live.filter((x) => x.t === 'click').forEach((x) =>
      x.h({ target: { closest: (sel) => (sel === '[data-q]' ? chip : null) }, preventDefault() {} }));
    const found = sdef.render();
    if (!found.includes(FB.esc(hit.it.name))) throw new Error('search cannot find the item it is meant to mark');
    if (!/class="row is-out"/.test(found)) throw new Error('search renders a sold-out dish as an ordinary result');
    if (found.includes(FB.money(hit.it.price))) throw new Error('search still prints a price for a dish it will refuse to sell');

    /* 4. monitoring bills only while there is something to monitor */
    FB.store.set((st) => { st.restock = [hit.it.id]; return st; });
    if (FB.notifs.monitored(hit.now).length !== 1) throw new Error('an item still out is not being monitored');
    let backTs = null;
    for (let d = hit.d + 1; d < hit.d + 20; d++) {
      const t = new Date(2026, 7, d, 13, 0, 0).getTime();
      if (FB.catalog.available(hit.it, t)) { backTs = t; break; }
    }
    if (!backTs) throw new Error('the item never comes back, so scarcity is permanent');
    if (FB.notifs.monitored(backTs).length !== 0) throw new Error('monitoring keeps billing for an item back in stock');

    /* The fee itself, at BOTH call sites and on BOTH sides of the item returning —
       st.restock still holds the id throughout, so a call site reading the raw list
       instead of monitored() keeps charging for nothing. Swept at backTs, where the
       raw count is 1 and the true count is 0: at hit.now the two agree by accident
       and nothing can be distinguished. */
    FB.cart.clearAll();
    const other = FB.catalog.all().find((x) => x.slug !== hit.st.slug);
    harness.addToCart(FB, other.slug, 2);
    /* the label is only legible in checkout's receipt — the cart renders its own
       collapsed, so the cart call site is covered by the totals sweep below, where
       a divergent count shows up as two screens quoting different money */
    const billed = (when) => {
      clock.set(when);
      return /Restock Monitoring/.test(FB.screens.get('checkout').render({ slug: other.slug }));
    };
    if (!billed(hit.now)) throw new Error('monitoring an item that is out is not billed at all');
    if (billed(backTs)) throw new Error('the Restock Monitoring fee survives the item coming back');

    /* and the two still quote the same total, which is the invariant this touched.
       Run at backTs ON PURPOSE, with st.restock still holding the id: the raw list
       says 1 and the true count says 0, so a call site reading the wrong one is the
       difference between two prices. At hit.now they agree by accident. */
    clock.set(backTs);
    for (const slug of FB.catalog.all().slice(0, 6).map((x) => x.slug)) {
      FB.cart.clearAll();
      harness.addToCart(FB, slug, 2);
      if (FB.cart.unsellable(slug).length) continue;
      const q = /data-quote="([\d.]+)"/.exec(FB.screens.get('checkout').render({ slug }));
      const c = /Go to checkout<\/span><span>\$([\d,.]+)/.exec(FB.screens.get('cart').render({ slug }));
      if (q && c && Number(q[1]).toFixed(2) !== c[1].replace(/,/g, '')) {
        throw new Error(slug + ': cart preview quotes $' + c[1] + ' and checkout quotes $' + q[1]);
      }
    }

    /* place() re-checks too, because render() is not the last word: the screen does
       not repaint on a clock tick, so a day rolling over while checkout sits open
       leaves an enabled Place order button over a basket the restaurant has dropped.
       Mount while the item is available, then move the clock and tap. */
    let avail = null;
    for (let d = hit.d - 1; d > 14; d--) {
      const t = new Date(2026, 7, d, 13, 0, 0).getTime();
      if (FB.catalog.available(hit.it, t)) { avail = t; break; }
    }
    if (!avail) throw new Error('the item is never available before the day it is out');
    clock.set(avail);
    FB.cart.clearAll();
    FB.cart.add(hit.st.slug, hit.it, FB.catalog.defaultSel(hit.it), 1, '');
    harness.addToCart(FB, hit.st.slug, 1);
    const cdef = FB.screens.get('checkout');
    if (!/data-place/.test(cdef.render({ slug: hit.st.slug }))) throw new Error('checkout refuses a basket that is fine');

    const bound = [];
    const el = () => ({ dataset: {}, innerHTML: '', addEventListener() {}, removeEventListener() {},
      querySelector: el, querySelectorAll: () => [], contains: () => true, setAttribute() {},
      getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {} } });
    const croot = Object.assign(el(), { addEventListener: (t, h) => bound.push({ t, h }) });
    FB._binds = []; cdef.mount(croot, { slug: hit.st.slug }); FB._binds = null;
    const realToast = FB.toast, realRefresh = FB.nav.refresh;
    const said = []; FB.toast = (m) => said.push(String(m));
    FB.nav.refresh = () => {};
    try {
      clock.set(hit.now);                       /* the item goes out under the screen */
      const btn = { dataset: { quote: '0' }, disabled: false, innerHTML: '' };
      bound.filter((x) => x.t === 'click').forEach((x) =>
        x.h({ target: { closest: (sel) => (sel === '[data-place]' ? btn : null) }, preventDefault() {} }));
      if (btn.disabled) throw new Error('place() accepted a basket the restaurant had stopped serving');
      if (FB.S().orders.length) throw new Error('an order was placed containing an unavailable item');
      if (!said.some((t) => /no longer available/.test(t))) {
        throw new Error('place() refused without saying why: ' + said.join(' | '));
      }
    } finally { FB.toast = realToast; FB.nav.refresh = realRefresh; }

    /* the day rolling over settles the monitoring on its own, without a reload —
       this used to happen only at boot, which is why a tab left open across midnight
       kept billing. Lives in notifs so it can be checked; app.js only calls it. */
    FB.store.set((st) => { st.restock = [hit.it.id]; return st; });
    FB.notifs._day = null;
    if (FB.notifs.settleDay(hit.now).rolled) throw new Error('the first settle claims the day rolled');
    if (FB.notifs.settleDay(hit.now).rolled) throw new Error('the same day rolled');
    const rollover = FB.notifs.settleDay(backTs);
    if (!rollover.rolled) throw new Error('crossing into another day did not register as a rollover');
    if (rollover.settled !== 1) throw new Error('the rollover did not discharge the monitoring: ' + rollover.settled);
    if ((FB.S().restock || []).length) throw new Error('the id survived the rollover that discharged it');

    /* and arming the monitoring repaints the screen it was armed from — the fee is
       live immediately, so a cart left unrepainted quotes a total under what the
       next screen charges */
    FB.store.set((st) => { st.restock = []; st.settings.instantInterface = true; return st; });
    let repainted = 0;
    FB.nav.refresh = () => { repainted++; };
    const overlays = [];
    const realSheet = FB.sheet.open;
    FB.sheet.open = (cfg) => {
      const host = Object.assign(el(), { addEventListener: (t, h) => overlays.push({ t, h }) });
      const h = { el: host, close() {} };
      if (cfg.onMount) cfg.onMount(host, h);
      return h;
    };
    try {
      FB.openItem(hit.st.slug, hit.it.id);      /* unavailable -> the sold-out sheet */
      const armBtn = { dataset: {}, disabled: false, classList: { add() {}, remove() {} } };
      overlays.filter((x) => x.t === 'click').forEach((x) =>
        x.h({ target: { closest: (sel) => (sel === '[data-restock]' ? armBtn : null) }, preventDefault() {} }));
      if ((FB.S().restock || []).indexOf(hit.it.id) < 0) throw new Error('arming the monitoring did not store it');
      if (!repainted) throw new Error('arming a restock notification does not repaint the screen it was armed from');
    } finally { FB.sheet.open = realSheet; FB.nav.refresh = realRefresh; }

    return hit.st.slug + '/"' + hit.it.name + '" is refused by cart, checkout, search and place(), and stops billing when it returns';
  } finally { clock.restore(); app.dispose(); }
});

check('every figure a receipt prints reconciles with the ones beside it', () => {
  /* Five separate ways the money on screen disagreed with itself:
       - a blank "Set tip" wrote tipPct:null over an explicit 0%, so a button labelled
         Set tip put the 42% default back on the total;
       - a custom tip above ~1.8e306 overflowed FB.round2 to Infinity, rendered as
         "$Infinity", reached localStorage as null and zeroed every lifetime ledger;
       - editing a cart line onto a configuration another line already held left two
         lines sharing one key, doubling the per-line surcharge;
       - resolving an incident with Remove spliced the row out but left calc.subtotal,
         so the printed items no longer summed to the Subtotal beneath them;
       - "$X of food · $Y of everything else" divided by the PRE-discount subtotal, so
         the pair overshot the button by exactly the promotion. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const NOW = new Date(2026, 7, 20, 13, 0, 0).getTime();
    clock.set(NOW);

    /* --- the tip cannot be erased, and cannot be made infinite ---
       Driven through the REAL sheet handler. Mirroring the handler's logic in the
       test proves only that the mirror works: every tip mutation survived a copy. */
    harness.addToCart(FB, 'mcronalds', 2);
    FB.cart.setCo('mcronalds', { tipPct: 0, tipCustom: null });

    const el = () => ({ dataset: {}, value: '', innerHTML: '', addEventListener() {}, removeEventListener() {},
      querySelector: el, querySelectorAll: () => [], contains: () => true, setAttribute() {},
      getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {} }, focus() {}, select() {} });
    const cdef = FB.screens.get('checkout');
    const rootBinds = [];
    const croot = Object.assign(el(), { addEventListener: (t, h) => rootBinds.push({ t, h }) });
    const realSheet = FB.sheet.open, realRefresh = FB.nav.refresh;
    FB.nav.refresh = () => {};
    let sheetBinds = [], input = null;
    FB.sheet.open = (cfg) => {
      sheetBinds = [];
      input = Object.assign(el(), { value: '' });
      const body = Object.assign(el(), { querySelector: (sel) => (sel === '[data-ct]' ? input : el()) });
      const host = Object.assign(el(), { addEventListener: (t, h) => sheetBinds.push({ t, h }) });
      const h = { el: host, body: body, close() {} };
      if (cfg.onMount) cfg.onMount(body, h);
      return h;
    };
    let saveTip;
    try {
      FB._binds = []; cdef.mount(croot, { slug: 'mcronalds' }); FB._binds = null;
      const fire = (binds, sel, target) => binds.filter((x) => x.t === 'click').forEach((x) =>
        x.h({ target: { closest: (q) => (q === sel ? target : null) }, preventDefault() {} }));
      saveTip = (rawIn) => {
        fire(rootBinds, '[data-tipcustom]', { dataset: {} });   /* opens the real sheet */
        if (!input) throw new Error('the custom tip sheet never rendered its field');
        input.value = String(rawIn);
        fire(sheetBinds, '[data-save]', { dataset: {} });
      };
      saveTip('');
      if (FB.cart.co('mcronalds').tipPct !== 0) throw new Error('a blank Set tip erased an explicit 0% choice');
      saveTip('   ');
      if (FB.cart.co('mcronalds').tipPct !== 0) throw new Error('a whitespace Set tip erased an explicit 0% choice');
      saveTip('abc');
      if (FB.cart.co('mcronalds').tipPct !== 0) throw new Error('an unparseable Set tip erased an explicit 0% choice');
      for (const poison of ['1e999', '1e307', '1e308', '9'.repeat(320), '1e400']) {
        saveTip(poison);
        const t = FB.cart.co('mcronalds').tipCustom;
        if (!isFinite(t)) throw new Error('a tip of ' + poison + ' stored as ' + t);
        if (JSON.parse(JSON.stringify({ t })).t !== t) throw new Error('a tip of ' + poison + ' does not survive a save');
        const markup = FB.screens.get('checkout').render({ slug: 'mcronalds' });
        if (/Infinity|NaN/.test(markup)) throw new Error('checkout renders Infinity/NaN for a tip of ' + poison);
      }
      /* the middle of the range, not just its ends: pinning only 0 and TIP_MAX let
         any zero-preserving mangling through — halving every tip, or flooring the
         cents off it, both survived a check that tested only the boundaries */
      saveTip('7.25');
      if (FB.cart.co('mcronalds').tipCustom !== 7.25) throw new Error('a $7.25 tip was stored as ' + FB.cart.co('mcronalds').tipCustom);
      if (FB.cart.co('mcronalds').tipPct !== null) throw new Error('a custom tip did not clear the percentage choice');
      saveTip('20000');
      if (FB.cart.co('mcronalds').tipCustom !== FB.fees.TIP_MAX) {
        throw new Error('a tip over the cap stored as ' + FB.cart.co('mcronalds').tipCustom + ', expected ' + FB.fees.TIP_MAX);
      }
      saveTip('-5');
      if (FB.cart.co('mcronalds').tipCustom !== 0) throw new Error('a negative tip was stored as ' + FB.cart.co('mcronalds').tipCustom);
    } finally { FB.sheet.open = realSheet; FB.nav.refresh = realRefresh; }

    /* --- a cart holds one line per configuration, however a line got there --- */
    FB.cart.clearAll();
    const store = FB.catalog.get('mcronalds');
    const item = store.menu.reduce((a, sec) => a.concat(sec.items), []).filter((i) => FB.catalog.available(i))[0];
    const sel = FB.catalog.defaultSel(item);
    FB.cart.add('mcronalds', item, sel, 1, '');
    FB.cart.add('mcronalds', item, sel, 1, 'extra');
    if (FB.cart.lines('mcronalds').length !== 2) throw new Error('two configurations did not make two lines');
    const second = FB.cart.lines('mcronalds')[1];
    /* the patch js/ui/item.js commit() sends when you edit a line back onto the other */
    FB.cart.update('mcronalds', second.lid, { sel: sel, qty: second.qty, note: '', key: JSON.stringify([item.id, sel, '']) });
    const merged = FB.cart.lines('mcronalds');
    if (merged.length !== 1) throw new Error(merged.length + ' lines after editing onto an existing configuration, expected 1');
    if (merged[0].qty !== 2) throw new Error('the merged line carries qty ' + merged[0].qty + ', expected 2');
    const keys = merged.map((l) => l.key);
    if (new Set(keys).size !== keys.length) throw new Error('two cart lines share a key');

    /* The merge must exclude the line it is editing. The stepper is update()'s
       highest-traffic caller and sends a BARE { qty } patch with no key, so a
       predicate that can match the line's own lid doubles it onto itself and then
       filters it out — the item disappears from the cart on a "+" tap. */
    FB.cart.clearAll();
    FB.cart.add('mcronalds', item, sel, 1, '');
    FB.cart.add('mcronalds', item, sel, 1, 'extra');
    const solo = FB.cart.lines('mcronalds')[0];
    FB.cart.update('mcronalds', solo.lid, { qty: solo.qty + 1 });
    const stepped = FB.cart.lines('mcronalds');
    if (stepped.length !== 2) throw new Error('a bare qty step changed the line count to ' + stepped.length);
    const still = stepped.filter((l) => l.lid === solo.lid)[0];
    if (!still) throw new Error('stepping a line up removed it from the cart');
    if (still.qty !== 2) throw new Error('stepping 1 -> 2 stored qty ' + still.qty);
    /* and stepping down to zero still removes exactly that line, not its neighbour */
    FB.cart.update('mcronalds', solo.lid, { qty: 0 });
    const left = FB.cart.lines('mcronalds');
    if (left.length !== 1 || left[0].lid === solo.lid) {
      throw new Error('stepping a line to zero removed the wrong line');
    }
    FB.cart.clearAll();

    /* --- a receipt's rows sum to its own subtotal, even after a removal --- */
    FB.cart.clearAll();
    harness.addToCart(FB, 'cluckingham', 3);
    const o = harness.makeOrder(FB, 'cluckingham', { now: NOW, status: 'preparing', step: 2 });
    FB.store.set((st) => {
      st.orders.unshift(o); st.activeOrderId = o.id; st.meta.orderCount = 1;
      st.meta.lifetimeSpend = o.calc.total;
      st.meta.lifetimeFees = o.calc.feesTotal + o.calc.tax + (o.calc.roundUp || 0);
      st.meta.lifetimeTips = o.calc.tip;
      return st;
    });
    FB.bodymax.ingest(o);
    FB.store.set((st) => {
      const oo = st.orders[0];
      oo.incident = { lineIdx: 0, name: oo.lines[0].name, at: NOW, deadline: NOW + 90000, resolution: null };
      return st;
    });
    const rowsBefore = FB.store.order(o.id).lines.length;
    FB.tracker.resolveIncident(o.id, 'remove');
    const oo = FB.store.order(o.id);
    const rowSum = FB.round2(oo.lines.reduce((a, l) => a + l.unit * l.qty, 0));
    if (Math.abs(rowSum - oo.calc.subtotal) > 0.005) {
      throw new Error('the receipt prints rows summing to $' + rowSum + ' above a Subtotal of $' + oo.calc.subtotal);
    }
    if (oo.lines.length !== rowsBefore) throw new Error('a removed line was spliced out of the receipt it is credited against');
    if (!oo.lines[0].removed) throw new Error('a removed line is not marked as removed');
    if (!/Removed by the restaurant/.test(FB.screens.get('track').render({ id: o.id }))) {
      throw new Error('the receipt does not show which row was removed');
    }
    /* and the three ledgers still agree, which is what adjustOrder exists for */
    const st2 = FB.S();
    const hist = st2.bodymax.history.filter((r) => r.orderId === o.id)[0];
    if (!hist) throw new Error('the order has no BODYMAX row');
    if (Math.abs(st2.meta.lifetimeSpend - oo.calc.total) > 0.005 || Math.abs(hist.spend - oo.calc.total) > 0.005) {
      throw new Error('ledgers disagree after a removal: order $' + oo.calc.total +
        ', meta $' + st2.meta.lifetimeSpend + ', bodymax $' + hist.spend);
    }

    /* --- food + everything else = the total, discount or no discount --- */
    let withPromo = 0;
    for (const s of FB.catalog.all()) {
      FB.cart.clearAll();
      harness.addToCart(FB, s.slug, 4);
      const sub = FB.cart.subtotal(s.slug);
      for (const promo of [null, FB.catalog.storeOffer(s, sub, false)]) {
        const c = FB.fees.compute({ subtotal: sub, lineCount: 4, store: s, mode: 'delivery',
          settings: FB.S().settings, tipPct: 25, storePromo: promo });
        if (promo) withPromo++;
        if (Math.abs((c.foodPaid + c.nonFood) - c.total) > 0.005) {
          throw new Error(s.slug + ': $' + c.foodPaid + ' of food + $' + c.nonFood +
            ' of everything else = $' + FB.round2(c.foodPaid + c.nonFood) + ', but the total is $' + c.total);
        }
        /* Math.abs: the one-sided form only caught an overshoot, so dividing by the
           pre-discount subtotal — which makes the ratio too FLAT — sailed past it. */
        if (Math.abs(c.multiple * c.foodPaid - c.total) > 0.005) {
          throw new Error(s.slug + ': "' + c.multiple.toFixed(1) + '× the price of the food" against $' +
            c.foodPaid + ' of food does not reach the $' + c.total + ' charged');
        }
      }
    }
    if (withPromo < 1) throw new Error('no store promotion qualified, so the discount branch is untested');

    /* ...and the SCREEN prints those two figures, not just the engine. Asserted on
       the markup because checkout could go on rendering c.subtotal while compute
       returned a corrected foodPaid, and every arithmetic-only assertion above would
       still pass. */
    let printed = 0;
    for (const s2 of FB.catalog.all()) {
      FB.cart.clearAll();
      harness.addToCart(FB, s2.slug, 4);
      const sub2 = FB.cart.subtotal(s2.slug);
      if (!FB.catalog.storeOffer(s2, sub2, false)) continue;
      const markup = FB.screens.get('checkout').render({ slug: s2.slug });
      const pair = /\$([\d,]+\.\d\d) of food · \$([\d,]+\.\d\d) of everything else/.exec(markup);
      const btn = /data-quote="([\d.]+)"/.exec(markup);
      if (!pair || !btn) throw new Error(s2.slug + ': checkout does not print the food/non-food pair beside a quote');
      const food = Number(pair[1].replace(/,/g, '')), rest = Number(pair[2].replace(/,/g, ''));
      if (Math.abs(food + rest - Number(btn[1])) > 0.005) {
        throw new Error(s2.slug + ': the screen says $' + food + ' of food + $' + rest +
          ' of everything else, but the button charges $' + btn[1]);
      }
      /* the receipt prints that ratio too, and it must describe the same order */
      const note = /You are paying <b>([\d.]+)×<\/b>/.exec(markup);
      if (!note) throw new Error(s2.slug + ': the receipt does not print the multiple');
      if (Math.abs(Number(note[1]) * food - Number(btn[1])) > 0.05 * food) {
        throw new Error(s2.slug + ': the receipt says ' + note[1] + '× of $' + food +
          ' but the button charges $' + btn[1]);
      }
      printed++;
    }
    if (printed < 1) throw new Error('no discounted checkout was rendered, so the screen half is untested');

    /* A flat promo code worth more than the food leaves foodPaid at exactly zero.
       The ratio has no meaning there, and printing the divide-by-zero fallback said
       "0.0× the price of the food" over a chargeable total. Reachable on any of the
       212 items priced under BANG10's $10, so it is a live path, not a contrivance. */
    FB.cart.clearAll();
    const cheapStore = FB.catalog.all().filter((x) =>
      x.menu.reduce((a, sec) => a.concat(sec.items), []).some((i) => i.price <= 3 && FB.catalog.available(i)))[0];
    if (!cheapStore) throw new Error('no store sells an item under $3, so the covered-food case is unreachable');
    const cheap = cheapStore.menu.reduce((a, sec) => a.concat(sec.items), [])
      .filter((i) => i.price <= 3 && FB.catalog.available(i))[0];
    FB.cart.add(cheapStore.slug, cheap, FB.catalog.defaultSel(cheap), 1, '');
    FB.cart.setCo(cheapStore.slug, { promoCode: 'BANG10' });
    const covered = FB.fees.compute({
      subtotal: FB.cart.subtotal(cheapStore.slug), lineCount: 1, store: cheapStore, mode: 'delivery',
      settings: FB.S().settings, promo: FB.fees.checkPromo('BANG10', FB.cart.subtotal(cheapStore.slug), []),
    });
    if (covered.foodPaid !== 0) throw new Error('BANG10 against ' + FB.money(cheap.price) + ' of food left foodPaid at ' + covered.foodPaid);
    if (!(covered.total > 0)) throw new Error('a fully discounted basket charges nothing, so there is no falsehood to print');
    for (const scr of ['checkout', 'cart']) {
      const markup = FB.screens.get(scr).render({ slug: cheapStore.slug });
      if (/0\.0×/.test(markup)) {
        throw new Error(scr + ' prints "0.0× the price of the food" over a total of ' + FB.money(covered.total));
      }
      if (markup.indexOf('× the price of the food') > -1 && covered.foodPaid <= 0) {
        throw new Error(scr + ' prints a multiple when nothing was paid for the food');
      }
      /* and it says something in its place — dropping the line entirely leaves the
         receipt's loudest sentence simply missing whenever a code covers the food */
      if (markup.indexOf('The food has been covered in full') < 0) {
        throw new Error(scr + ' prints nothing at all where the multiple would go');
      }
    }
    FB.cart.clearAll();

    /* --- BODYMAX's "not food" means everything that was not food --- */
    FB.store.set((st) => {
      st.meta.lifetimeSpend = 70; st.meta.lifetimeFees = 33.86; st.meta.lifetimeTips = 10.69;
      return st;
    });
    const bm = FB.screens.get('bodymax').render({});
    const pctPrinted = /([\d.]+)% of your lifetime spend was not food/.exec(bm);
    if (!pctPrinted) throw new Error('BODYMAX does not print its not-food share');
    const mm = FB.bodymax.metrics();
    const want = (mm.fees + mm.tips) / mm.spend * 100;
    if (Math.abs(Number(pctPrinted[1]) - want) > 0.11) {
      throw new Error('BODYMAX says ' + pctPrinted[1] + '% was not food; fees plus tips are ' +
        want.toFixed(1) + '% — the tip is being left out of a figure that claims to include it');
    }

    /* --- and the two membership call sites step on the boundary the app printed --- */
    for (const [days, want] of [[0, 1], [29, 1], [30, 2], [44, 2], [45, 2], [60, 3], [90, 4]]) {
      FB.store.set((st) => { st.plus.active = true; st.plus.since = NOW - days * 86400000; return st; });
      const got = FB.plusMonths(FB.S());
      if (got !== want) throw new Error('day ' + days + ' of membership bills ' + got + ' months, expected ' + want);
      /* BOTH screens, from the markup: these were two separate copies of the same
         expression, which is how they came to disagree. Day 44 is the discriminator —
         rounding says one month, the renewal schedule the app printed says two. */
      const dues = FB.round2(19.99 * want + (FB.S().plus.paid || 0));
      for (const scr of ['plus', 'account']) {
        const markup = FB.screens.get(scr).render({});
        if (markup.indexOf(FB.money(dues)) < 0) {
          throw new Error(scr + ' does not print ' + FB.money(dues) + ' in dues on day ' + days +
            ' — it is not reading FB.plusMonths');
        }
      }
    }

    return 'tip, cart merge, removal, promotion ratio and dues all reconcile (' + withPromo + ' promo contexts)';
  } finally { clock.restore(); app.dispose(); }
});

check('a ledger cannot be overwritten, retracted, or written from the wrong basket', () => {
  /* Three ways a recorded fact stopped being true:
       - place() snapshotted the receipt at the tap but recomputed the BODYMAX load
         from the LIVE cart three seconds later, and the app bar's Back button stays
         live for those three seconds — so a cart edited inside the window wrote a
         nutrition ledger the receipt contradicted;
       - two tabs each hold their own copy of the save and each writes the WHOLE
         document over one key, so the second to write discarded the first's order,
         Standing, BangBux and BODYMAX row together;
       - HISTORY_CAP truncates bodymax.history at 200 rows, and badges() recomputed
         from it, so achievements already recorded in st.bodymax.badges flipped back
         to Locked on the 201st order and checkBadges() could never re-announce them.

     The storage EVENT lives in js/app.js, which boots on load and is skipped by this
     harness; store.adopt() is the part that can be checked, and is. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  const realRefresh = FB.nav.refresh, realGo = FB.nav.go, realToast = FB.toast;
  try {
    const NOW = new Date(2026, 7, 20, 13, 0, 0).getTime();
    clock.set(NOW);

    /* --- the receipt and the nutrition row describe ONE basket --- */
    harness.addToCart(FB, 'mcronalds', 3);
    const cdef = FB.screens.get('checkout');
    const el = () => ({ dataset: {}, value: '', innerHTML: '', addEventListener() {}, removeEventListener() {},
      querySelector: el, querySelectorAll: () => [], contains: () => true, setAttribute() {},
      getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {} } });
    const binds = [];
    const root = Object.assign(el(), { addEventListener: (t, h) => binds.push({ t, h }) });
    FB.nav.refresh = () => {}; FB.nav.go = () => {}; FB.toast = () => {};
    FB._binds = []; cdef.mount(root, { slug: 'mcronalds' }); FB._binds = null;

    const realSetTimeout = app.win.setTimeout;
    let window3s = null;
    app.win.setTimeout = (fn, ms) => (ms === 3000 ? ((window3s = fn), 0) : realSetTimeout(fn, ms));
    let placed;
    try {
      const quote = /data-quote="([\d.]+)"/.exec(cdef.render({ slug: 'mcronalds' }))[1];
      const btn = { dataset: { quote }, disabled: false, innerHTML: '' };
      binds.filter((x) => x.t === 'click').forEach((x) =>
        x.h({ target: { closest: (q) => (q === '[data-place]' ? btn : null) }, preventDefault() {} }));
      if (!btn.disabled) throw new Error('a fresh tap was refused');
      if (!window3s) throw new Error('place() did not open a cancellation window');
      /* the app bar's Back button is NOT disabled during the window */
      FB.cart.clearAll();
      window3s();
    } finally { app.win.setTimeout = realSetTimeout; }

    placed = FB.S().orders[0];
    if (!placed) throw new Error('the cancellation window closed without placing');
    if (placed.lines.length !== 3) throw new Error('the order lost lines to a cart edited inside the window');
    if (!(placed.load.calories > 0)) throw new Error('the order was logged with no nutrition at all');
    if (FB.S().meta.lifetimeCalories !== placed.load.calories) {
      throw new Error('meta.lifetimeCalories is ' + FB.S().meta.lifetimeCalories +
        ' for an order whose own load is ' + placed.load.calories);
    }
    const bmRow = FB.S().bodymax.history.filter((r) => r.orderId === placed.id)[0];
    if (!bmRow || bmRow.cal !== placed.load.calories) {
      throw new Error('the BODYMAX row disagrees with the receipt it was written from');
    }

    /* --- a second tab converges instead of clobbering --- */
    const mine = FB.S();
    const ordersBefore = mine.orders.length;
    /* what another tab's persist() would put in storage: a whole document, one ahead */
    const theirs = JSON.parse(JSON.stringify(mine));
    theirs.w = (mine.w || 0) + 1;
    theirs.orders = [];
    theirs.meta = Object.assign({}, theirs.meta, { orderCount: 99 });
    /* subscribers must hear about it, or the tab bar, cart pill and desk stats go on
       showing a document that is no longer the state */
    let told = 0;
    const unsub = FB.store.sub(() => { told++; });
    if (!FB.store.adopt(JSON.stringify(theirs))) throw new Error('a newer save from another tab was not adopted');
    unsub();
    if (!told) throw new Error('adopting another tab\'s save did not notify subscribers');
    if (FB.S().meta.orderCount !== 99) throw new Error('adopting did not take on the other tab\'s document');
    /* and an OLDER one is refused, or two tabs ping-pong forever */
    const stale = JSON.parse(JSON.stringify(FB.S()));
    stale.w = 0; stale.meta.orderCount = 1;
    if (FB.store.adopt(JSON.stringify(stale))) throw new Error('an older save was adopted over a newer one');
    if (FB.S().meta.orderCount !== 99) throw new Error('a refused adopt still changed the state');
    if (FB.store.adopt('{not json')) throw new Error('unparseable storage was adopted');
    if (FB.store.adopt(JSON.stringify(null))) throw new Error('a null document was adopted');
    /* The counter has to actually move, or nothing above can tell newer from older.
       persist() is debounced through the vm's setTimeout, so flush it rather than
       returning a promise — check() is synchronous and does not await, which would
       make a rejection here pass silently. */
    const w0 = FB.S().w || 0;
    const realST2 = app.win.setTimeout;
    app.win.setTimeout = (fn, ms) => (ms === 90 ? (fn(), 0) : realST2(fn, ms));
    try {
      FB.store.set((st) => { st.favorites = st.favorites.concat(['mcronalds']); return st; });
    } finally { app.win.setTimeout = realST2; }
    if ((FB.S().w || 0) <= w0) throw new Error('persisting did not advance the write counter');

    /* --- and the cap cannot retract what was recorded --- */
    const night = new Date(2026, 7, 20, 2, 30, 0).getTime();
    harness.addToCart(FB, 'mcronalds', 2);
    const big = harness.makeOrder(FB, 'mcronalds', { now: night });
    big.load = { calories: 9000, sodium: 12000, grease: 90, ranch: 40 };
    FB.store.set((st) => { st.orders.unshift(big); return st; });
    FB.bodymax.ingest(big);
    const ledger = (FB.S().bodymax.badges || []).slice();
    if (!ledger.length) throw new Error('no achievement was earned, so the retraction case is untested');
    const flagsBefore = Object.keys(FB.bodymax.metrics().flags).length;
    if (FB.bodymax.metrics().maxOrderCal !== 9000) throw new Error('the high-water calorie mark did not register');
    if (!flagsBefore) throw new Error('no flags were recorded, so their durability is untested');

    /* what migrate()'s HISTORY_CAP does on the 201st order */
    FB.store.set((st) => { st.bodymax.history = []; return st; });
    const earned = FB.bodymax.badges().filter((b) => b.earned).map((b) => b.id);
    const lost = ledger.filter((id) => earned.indexOf(id) < 0);
    if (lost.length) throw new Error(lost.length + ' recorded achievement(s) retracted by the cap: ' + lost.join(', '));
    if (FB.bodymax.metrics().maxOrderCal !== 9000) throw new Error('the calorie high-water walked backwards');
    if (Object.keys(FB.bodymax.metrics().flags).length < flagsBefore) throw new Error('flags were lost with the history');

    return 'receipt and nutrition agree, a stale tab converges, and ' + ledger.length +
      ' achievements survive the cap';
  } finally { FB.nav.refresh = realRefresh; FB.nav.go = realGo; FB.toast = realToast; clock.restore(); app.dispose(); }
});

check('the browser buttons agree with the router', () => {
  /* The router wrote to history one way — pushState on every go(), a popstate handler
     that called back() unconditionally — and four things fell out of that:
       - Forward fired popstate, so the app went BACKWARD while the URL went forward;
       - `replace` meant "do not push onto the ROUTER stack" and said nothing about
         the browser, so back()'s empty-stack fallback pushed a new entry from inside
         the popstate handler and Back after a tab switch grew history instead;
       - an overlay, which never pushes an entry, SPENT one when Back closed it, so
         the URL desynced and the app ran out of entries a screen early;
       - with a dismissible:false modal up (the checkout Terms gate) Back did nothing
         visible while eating every remaining entry, then unloaded the app mid-checkout.

     Driven through FB.nav.pop(), which is what the popstate listener calls — the
     listener itself lives in shell.init() and this file's other checks do not boot
     the shell. The history below is modelled with a CURSOR, because pushState
     truncates whatever is ahead of it rather than simply appending; an append-only
     model makes a restored entry look like growth. */
  const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

  function boot() {
    const app = harness.loadApp();
    app.clock.set(new Date(2026, 7, 20, 13, 0, 0).getTime());
    const entries = [{ st: null, url: '#home' }];
    const h = { i: 0 };
    app.win.history = {
      get state() { return entries[h.i].st; },
      get length() { return entries.length; },
      pushState(st, t, url) { entries.length = h.i + 1; entries.push({ st: st, url: url }); h.i++; },
      replaceState(st, t, url) { entries[h.i] = { st: st, url: url }; },
    };
    app.run(appSrc);
    const travel = (d) => {
      const next = h.i + d;
      if (next < 0 || next >= entries.length) return false;   /* the browser leaves the page */
      h.i = next;
      const st = entries[h.i].st;
      app.FB.nav.pop(st && typeof st.s === 'number' ? st.s : 0);
      return true;
    };
    return { app, FB: app.FB, entries, travel };
  }

  /* --- Forward goes forward --- */
  let a = boot();
  try {
    a.FB.nav.go('store', { slug: 'mcronalds' });
    a.FB.nav.go('cart', { slug: 'mcronalds' });
    if (a.entries.length !== 3) throw new Error('two navigations wrote ' + (a.entries.length - 1) + ' entries');
    if (!a.travel(-1)) throw new Error('Back left the page from a two-deep stack');
    if (a.FB.nav.current().name !== 'store') throw new Error('Back landed on ' + a.FB.nav.current().name);
    if (!a.travel(+1)) throw new Error('there was nothing to go Forward to');
    if (a.FB.nav.current().name !== 'cart') {
      throw new Error('Forward navigated to ' + a.FB.nav.current().name + ', not back to the cart');
    }
    if (a.entries[a.entries.length - 1].url !== '#cart') throw new Error('the URL disagrees with the screen after Forward');
    /* and a NEW navigation invalidates what was ahead: the browser truncates its own
       forward entries on pushState, so a router still holding them would restore a
       screen the browser has already forgotten */
    a.travel(-1);
    a.FB.nav.go('account', {});
    if (a.FB.nav.fwd() !== false) throw new Error('a new navigation left a stale entry on the forward stack');
  } finally { a.app.dispose(); }

  /* --- an overlay does not spend an entry it never pushed --- */
  a = boot();
  try {
    a.FB.nav.go('store', { slug: 'mcronalds' });
    const before = a.entries.length;
    a.FB.sheet.open({ title: 'A sheet', html: '<p>x</p>' });
    if (!a.FB.overlay.any()) throw new Error('the sheet did not open');
    a.travel(-1);
    if (a.FB.overlay.any()) throw new Error('Back did not close the sheet');
    if (a.FB.nav.current().name !== 'store') throw new Error('closing a sheet also moved the screen');
    if (a.entries.length !== before) throw new Error('closing a sheet cost a history entry (' + before + ' -> ' + a.entries.length + ')');
    if (a.entries[a.entries.length - 1].url !== '#store') throw new Error('the URL no longer names the screen');
    a.travel(-1);
    if (a.FB.nav.current().name !== 'home') throw new Error('the next Back did not leave the store');
  } finally { a.app.dispose(); }

  /* --- a modal you may not dismiss cannot drain the history --- */
  a = boot();
  try {
    a.FB.nav.go('store', { slug: 'mcronalds' });
    a.FB.nav.go('cart', { slug: 'mcronalds' });
    a.FB.modal.open({ html: '<p>Terms</p>', dismissible: false });
    const before = a.entries.length;
    for (let i = 0; i < 8; i++) {
      if (!a.travel(-1)) throw new Error('Back unloaded the app from behind a modal it would not dismiss');
    }
    if (!a.FB.overlay.any()) throw new Error('a dismissible:false modal was closed by Back');
    if (a.entries.length !== before) throw new Error('eight Backs changed the history depth');
    if (a.FB.nav.current().name !== 'cart') throw new Error('the screen moved behind the modal');
  } finally { a.app.dispose(); }

  /* --- replace replaces, and nothing writes history while reacting to it --- */
  a = boot();
  try {
    a.FB.nav.go('store', { slug: 'mcronalds' });
    const afterGo = a.entries.length;
    a.FB.nav.replace('category', { cat: 'burgers' });
    if (a.entries.length !== afterGo) throw new Error('replace pushed a new entry');
    if (a.entries[a.entries.length - 1].url !== '#category') throw new Error('replace did not rewrite the URL');
    const beforeTab = a.entries.length;
    a.FB.nav.tab('orders');
    if (a.entries.length !== beforeTab) throw new Error('a tab switch grew the history');
    if (a.entries[a.entries.length - 1].url !== '#orders') throw new Error('the URL does not follow a tab switch');
    const beforeBack = a.entries.length;
    a.travel(-1);
    if (a.entries.length > beforeBack) throw new Error('Back from a tab root PUSHED an entry');
    if (a.FB.nav.current().name !== 'home') throw new Error('Back from a tab root landed on ' + a.FB.nav.current().name);
    const start = a.entries.length;
    for (let i = 0; i < 10; i++) { a.FB.nav.tab('search'); a.travel(-1); }
    if (a.entries.length > start + 1) {
      throw new Error('ten tab-and-Back cycles grew the history from ' + start + ' to ' + a.entries.length);
    }
  } finally { a.app.dispose(); }

  return 'Forward goes forward, overlays cost nothing, a forced modal cannot drain history, and replace replaces';
});

check('a screen may not describe an order it is not showing', () => {
  /* Five screens stating something untrue about the app's own world:
       - the Default tip slider runs 0..80 and the tier row knows five values, so for
         76 of its 81 positions the receipt charged a tip no control on the screen
         corresponded to, and tapping any of them destroyed the setting;
       - TRACKR drew a Slinger card, a courier route to YOU and a doorstep photo over
         a PICKUP order, contradicting the feed directly beneath it — tracker.js:125
         records fixing exactly this in the feed and the screen was never brought
         along, because the suite only ever grepped the feed;
       - the Orders tab badge dereferenced activeOrderId, one slot for a plural fact,
         so it went dark the moment any order delivered while another was still live;
       - BANG+ stamped its renewal date through a formatter that only handles the
         past, and froze the result at join;
       - day labels divided two local midnights by a flat 86400000. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const NOW = new Date(2026, 7, 20, 13, 0, 0).getTime();
    clock.set(NOW);

    /* --- every slider position is representable --- */
    harness.addToCart(FB, 'mcronalds', 2);
    for (let pct = 0; pct <= 80; pct++) {
      FB.store.set((st) => { st.settings.autoTipPct = pct; return st; });
      FB.cart.setCo('mcronalds', { tipPct: null, tipCustom: null });
      const markup = FB.screens.get('checkout').render({ slug: 'mcronalds' });
      const pressed = (markup.match(/data-tip="\d+" aria-pressed="true"/g) || []).length;
      if (pressed !== 1) throw new Error('a default tip of ' + pct + '% leaves ' + pressed + ' tip controls selected');
      const charged = /Slinger Tip \((\d+)%\)/.exec(markup);
      if (!charged || Number(charged[1]) !== pct) throw new Error('the receipt charges a tip the row cannot show at ' + pct + '%');
    }
    FB.store.set((st) => { st.settings.autoTipPct = 42; return st; });

    /* --- a pickup is not a delivery --- */
    FB.cart.clearAll();
    harness.addToCart(FB, 'pizzahutch', 2);
    FB.cart.setCo('pizzahutch', { mode: 'pickup' });
    const pick = harness.makeOrder(FB, 'pizzahutch', { now: NOW, mode: 'pickup', status: 'delivered', step: 5 });
    pick.deliveredAt = NOW - 60000;
    FB.store.set((st) => { st.orders.unshift(pick); st.activeOrderId = pick.id; return st; });
    const trk = FB.screens.get('track').render({ id: pick.id });
    if (/data-msg/.test(trk)) throw new Error('a pickup order offers to message a Slinger nobody assigned');
    if (/Proof of delivery/.test(trk)) throw new Error('a pickup order claims a delivery was photographed');
    if (/data-boost/.test(trk)) throw new Error('a pickup order offers to buy a faster arrival');
    if (!/Proof of collection/.test(trk)) throw new Error('a collected order says nothing about being collected');
    if (/>YOU</.test(trk)) throw new Error('a pickup map still routes a courier to YOU');
    /* and a delivery still gets all of it, or the branch has simply deleted the screen */
    FB.cart.clearAll();
    harness.addToCart(FB, 'cluckingham', 2);
    const del = harness.makeOrder(FB, 'cluckingham', { now: NOW, status: 'delivered', step: 5 });
    del.deliveredAt = NOW - 60000;
    FB.store.set((st) => { st.orders.unshift(del); return st; });
    const dtrk = FB.screens.get('track').render({ id: del.id });
    for (const want of ['data-msg', 'Proof of delivery', '>YOU<']) {
      if (dtrk.indexOf(want) < 0) throw new Error('a delivery lost "' + want + '" to the pickup branch');
    }

    /* --- the badge counts live orders, not one pointer ---
       Booted in its own realm: renderTabs() only draws once shell.init() has bound
       #tabbar, and init lives in js/app.js, which this harness deliberately skips. */
    (function () {
      const b = harness.loadApp();
      b.clock.set(NOW);
      b.run(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
      try {
        const mk = (id, status) => ({ id: id, slug: 'cluckingham', storeName: 'x', status: status,
          placedAt: NOW, mode: 'delivery', lines: [], calc: { subtotal: 1, feesTotal: 0, tax: 0, tip: 0,
          total: 1, nonFood: 0, multiple: 1, feeLines: [], roundUp: 0, promo: 0, discounts: [] },
          events: [], step: 2, load: { calories: 0, sodium: 0, grease: 0, ranch: 0 }, rated: null });
        b.FB.store.set((st) => {
          st.orders = [mk('o_live_a', 'preparing'), mk('o_live_b', 'pickup'), mk('o_done', 'delivered')];
          st.activeOrderId = 'o_done';        /* what tick() leaves behind */
          return st;
        });
        b.FB.shell.repaintChrome();
        const badge = /<i class="dot">(\d+)<\/i>/.exec(b.doc.getElementById('tabbar').innerHTML);
        if (!badge) throw new Error('two live orders show no badge at all');
        if (Number(badge[1]) !== 2) throw new Error('the badge reads ' + badge[1] + ' with two orders still in flight');
        /* and it goes away when they are all done */
        b.FB.store.set((st) => { st.orders.forEach((o) => { o.status = 'delivered'; }); return st; });
        b.FB.shell.repaintChrome();
        if (/<i class="dot">/.test(b.doc.getElementById('tabbar').innerHTML)) {
          throw new Error('the badge survives every order being delivered');
        }
      } finally { b.clock.restore(); b.dispose(); }
    })();

    /* --- a renewal date is in the future and moves with the membership --- */
    for (const [days, months] of [[0, 1], [29, 1], [30, 2], [60, 3], [120, 5]]) {
      FB.store.set((st) => { st.plus.active = true; st.plus.since = NOW - days * 86400000; return st; });
      const at = FB.plusRenewsAt(FB.S());
      if (at <= NOW) throw new Error('on day ' + days + ' the next renewal is already in the past');
      if (at !== FB.S().plus.since + months * 2592000000) throw new Error('the renewal does not sit on the dues boundary');
      const label = FB.plusRenewsLabel(FB.S());
      if (/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat),/.test(label)) {
        throw new Error('a renewal a month out reads as a bare weekday: "' + label + '"');
      }
      /* account renders it directly; on the BANG+ screen it lives in the manage
         sheet, so that one is driven rather than grepped */
      if (FB.screens.get('account').render({}).indexOf(FB.esc(label)) < 0) {
        throw new Error('the account banner does not print the renewal it derives');
      }
    }

    /* the BANG+ manage sheet carries the same figure, and is reached through the
       real handler so a change to either screen's wiring shows up here */
    (function () {
      const pdef = FB.screens.get('plus');
      const bound = [];
      const el = () => ({ dataset: {}, value: '', innerHTML: '', addEventListener() {}, removeEventListener() {},
        querySelector: el, querySelectorAll: () => [], contains: () => true, setAttribute() {},
        getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {} } });
      const root = Object.assign(el(), { addEventListener: (t, h) => bound.push({ t, h }) });
      const realSheet = FB.sheet.open, realBusy = FB.busy;
      let seen = '';
      FB.sheet.open = (cfg) => { seen += (cfg.html || '') + (cfg.footer || '') + (cfg.sub || ''); return { el: el(), body: el(), close() {} }; };
      FB.busy = (t, kind, fn) => fn();
      try {
        FB._binds = []; pdef.mount(root, {}); FB._binds = null;
        bound.filter((x) => x.t === 'click').forEach((x) =>
          x.h({ target: { closest: (q) => (q === '[data-cancel]' ? { dataset: {} } : null) }, preventDefault() {} }));
        const want = FB.plusRenewsLabel(FB.S());
        if (seen && seen.indexOf(FB.esc(want)) < 0 && seen.indexOf(want) < 0) {
          throw new Error('the BANG+ manage sheet does not print the renewal the account banner does');
        }
      } finally { FB.sheet.open = realSheet; FB.busy = realBusy; }
    })();

    /* --- day labels, including across a 23-hour day --- */
    if (FB.dayLabel(NOW) !== 'Today') throw new Error('today is not Today');
    if (FB.dayLabel(NOW - 86400000) !== 'Yesterday') throw new Error('yesterday is not Yesterday');
    if (FB.dayLabel(NOW + 86400000) === 'Today') throw new Error('tomorrow reads as Today');
    if (/^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)$/.test(FB.dayLabel(NOW + 30 * 86400000))) {
      throw new Error('a date a month out reads as a bare weekday');
    }
    const probe = require('child_process').execFileSync(process.execPath, ['-e', `
      const { loadApp } = require(${JSON.stringify(require('path').join(__dirname, 'harness.cjs'))});
      const app = loadApp();
      let bad = 0;
      /* 8 Mar 2026 is the 23-hour day: midnight to midnight across it is 82800000 ms,
         which floors to 0 and rounds to 1 */
      const dst = new Date(2026, 2, 9, 12, 0, 0).getTime();
      app.clock.set(dst);
      if (app.FB.dayLabel(dst - 86400000) !== 'Yesterday') { console.log('GOT:' + app.FB.dayLabel(dst - 86400000)); bad++; }
      if (app.FB.dayLabel(dst) !== 'Today') bad++;
      app.dispose();
      console.log(bad);
    `], { env: Object.assign({}, process.env, { TZ: 'America/New_York' }), encoding: 'utf8' }).trim();
    if (!/(^|\n)0$/.test(probe)) throw new Error('day labels slip across a daylight-saving change: ' + probe);

    return '81 tip positions representable, pickup and delivery differ, the badge counts, and dates survive DST';
  } finally { clock.restore(); app.dispose(); }
});

check('the build tools fail loudly rather than quietly', () => {
  /* Two ways the pipeline lied instead of complaining:
       - build-artifact.cjs preferred build/artifact-assets on EXISTENCE alone, with
         no freshness check, so every regenerated asset was silently published as its
         old bytes — three La Taqueria Verdadera reshoots shipped as the photographs
         they had replaced, while the served site showed the new ones;
       - bundle.cjs recorded a section authored without an items array as a problem
         and then dereferenced it anyway two guards later, dying mid-walk with an
         anonymous TypeError and discarding every problem it had already collected. */
  const cp = require('child_process');
  const os = require('os');
  /* Everything this check writes goes here, never into the tree: the probe used to
     corrupt gyropalace.json in place and put it back in a finally, so a Ctrl-C in
     between left a tracked menu carrying "not a number" — and then rebuilt a 40 MB
     artifact into build/ on every run. */
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-smoke-'));
  const tmpMenus = path.join(tmp, 'menus');
  fs.cpSync(path.join(ROOT, 'js/data/menus'), tmpMenus, { recursive: true });
  const tmpBundle = path.join(tmp, 'menus.generated.js');
  const tmpArtifact = path.join(tmp, 'artifact.html');
  const env = (extra) => Object.assign({}, process.env, extra);
  try {
    /* --- the copy bundles clean, so the probe below is about the corruption --- */
    const clean = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/bundle.cjs')],
      { encoding: 'utf8', env: env({ SMOKE_MENU_DIR: tmpMenus, SMOKE_BUNDLE_OUT: tmpBundle }) });
    if (clean.status !== 0) throw new Error('the copied menus did not bundle clean: ' + (clean.stdout + clean.stderr).slice(0, 200));
    if (!fs.existsSync(tmpBundle)) throw new Error('the bundle did not honour its output override');
    if (fs.existsSync(path.join(ROOT, 'js/data/menus.generated.js')) &&
        fs.statSync(path.join(ROOT, 'js/data/menus.generated.js')).mtimeMs > Date.now() - 5000) {
      throw new Error('the probe wrote into the real bundle');
    }

    /* --- an itemless section is reported, not thrown --- */
    const menuFile = path.join(tmpMenus, 'gyropalace.json');
    const j = JSON.parse(fs.readFileSync(menuFile, 'utf8'));
    j.menu.push({ id: 's_no_items', name: 'Half-finished section' });
    /* a SECOND problem, so we can tell "reported everything" from "died on the first" */
    j.menu[0].items[0].price = 'not a number';
    fs.writeFileSync(menuFile, JSON.stringify(j, null, 2));
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/bundle.cjs')],
      { encoding: 'utf8', env: env({ SMOKE_MENU_DIR: tmpMenus, SMOKE_BUNDLE_OUT: tmpBundle }) });
    const out = (r.stdout || '') + (r.stderr || '');
    if (/TypeError/.test(out)) throw new Error('an itemless section crashes the validator: ' + out.split('\n')[0]);
    if (r.status === 0) throw new Error('a menu with two authoring errors bundled clean');
    if (!/no items/.test(out)) throw new Error('the itemless section was not reported: ' + out.slice(0, 200));
    if (!/price/i.test(out)) throw new Error('the validator stopped at the first problem instead of collecting them');

  /* --- a stale asset cache is refused, and said out loud --- */
  const src = fs.readFileSync(path.join(ROOT, 'tools/build-artifact.cjs'), 'utf8');
  if (!/mtimeMs/.test(src)) throw new Error('build-artifact.cjs picks its asset source without comparing mtimes');
  const CACHE = path.join(ROOT, 'build', 'artifact-assets');
  const probeKey = 'brands/verdadera/items/02.webp';
  const probe = path.join(CACHE, probeKey);
  const asset = path.join(ROOT, 'assets', probeKey);
  const hadCache = fs.existsSync(probe);
  const saved = hadCache ? fs.readFileSync(probe) : null;
  const savedTimes = hadCache ? fs.statSync(probe) : null;
  try {
    fs.mkdirSync(path.dirname(probe), { recursive: true });
    /* a cache entry that is deliberately older than the asset it stands in for */
    fs.writeFileSync(probe, Buffer.from('stale'));
    const assetTime = fs.statSync(asset).mtime;
    fs.utimesSync(probe, new Date(assetTime.getTime() - 60000), new Date(assetTime.getTime() - 60000));
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/build-artifact.cjs')],
      { encoding: 'utf8', env: env({ SMOKE_ARTIFACT_OUT: tmpArtifact }) });
    const log = (r.stdout || '') + (r.stderr || '');
    if (r.status !== 0) throw new Error('the artifact build failed on a stale cache instead of falling back');
    if (!/stale/i.test(log)) throw new Error('a stale cache entry was used without a word about it');
    if (log.indexOf('assets/' + probeKey) < 0) throw new Error('the warning does not name the file it fell back on');
    /* and the bytes it shipped are the ones on disk */
    const html = fs.readFileSync(tmpArtifact, 'utf8');
    const marker = 'a[' + JSON.stringify('assets/' + probeKey) + '] = [';
    const i = html.indexOf(marker);
    if (i < 0) throw new Error('the artifact does not inline ' + probeKey);
    const body = html.slice(i + marker.length, html.indexOf('].join(', i));
    const joined = body.match(/"([^"]*)"/g).map((x) => JSON.parse(x)).join('');
    const inlined = Buffer.from(joined.slice(joined.indexOf('base64,') + 7), 'base64');
    if (!inlined.equals(fs.readFileSync(asset))) {
      throw new Error('the artifact inlined ' + inlined.length + ' bytes for a ' +
        fs.statSync(asset).size + '-byte asset — the stale cache was shipped anyway');
    }
    /* this build is fresh, whatever was on disk before the suite started */
    let longest = 0;
    html.split('\n').forEach((l) => { if (l.length > longest) longest = l.length; });
    if (longest > 1024) throw new Error('the artifact just built carries a ' + longest + '-char line');
    if (!/refusing to write/.test(log) && !/longest line \d+ chars/.test(log)) {
      throw new Error('the build does not report its longest line');
    }
  } finally {
    if (hadCache) { fs.writeFileSync(probe, saved); fs.utimesSync(probe, savedTimes.atime, savedTimes.mtime); }
    else { try { fs.unlinkSync(probe); } catch (e) {} }
  }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  }

  return 'an itemless section is reported with everything else, and a stale asset cache is refused out loud — all in a scratch directory';
});

check('an incident expires while the food is still in the kitchen', () => {
  /* The check that asserts a deadline lands before arrival passed by 167 MILLISECONDS
     on the one order id it happened to pick, and 7 of the 16 candidate ids in its own
     search would have failed it. It was true by luck, not by construction — so any
     future beat that adds drift would have turned it red and read as that feature's
     fault. Swept across every store and tier instead of spot-checked, and bounded
     from BOTH sides: a deadline nobody can answer in time is as useless as one that
     expires after the food has landed. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    let built = 0, incidents = 0, minMargin = Infinity, minHold = Infinity, worst = '';
    for (const s of FB.catalog.all()) {
      FB.cart.clearAll();
      harness.addToCart(FB, s.slug, 3);
      if (FB.cart.lines(s.slug).length < 2) continue;
      for (let tier = 1; tier <= 3; tier++) {
        for (let i = 0; i < 6; i++) {
          const o = harness.makeOrder(FB, s.slug, { now: T0 });
          o.id = 'inc_' + s.slug + '_' + tier + '_' + i;
          o.tier = tier; o.etaDrift = 0; o.events = []; delete o.incident; delete o.replayed;
          FB.tracker.build(o);
          built++;
          if (!o.incident) continue;
          incidents++;
          const margin = o.deliverAt - o.incident.deadline;
          const hold = o.incident.deadline - o.incident.at;
          if (margin < minMargin) { minMargin = margin; worst = o.id; }
          if (hold < minHold) minHold = hold;
          if (o.incident.deadline >= o.deliverAt) {
            throw new Error(o.id + ': the deadline lands ' + Math.round((o.incident.deadline - o.deliverAt) / 1000) +
              's AFTER the order was due to arrive');
          }
          /* and before the courier has the bag, which is the physical constraint */
          const firstPickup = (o.schedule || []).filter((b) => b.step === 'pickup')[0];
          if (firstPickup && o.incident.deadline > firstPickup.at) {
            throw new Error(o.id + ': the deadline outlives the courier collecting the order');
          }
          if (hold < FB.tracker.INCIDENT_MIN_MS) {
            throw new Error(o.id + ': offers ' + Math.round(hold / 1000) + 's to answer, under the ' +
              Math.round(FB.tracker.INCIDENT_MIN_MS / 1000) + 's floor');
          }
          if (hold > FB.tracker.INCIDENT_MS) throw new Error(o.id + ': offers longer than the ceiling');
        }
      }
    }
    if (incidents < 20) throw new Error('only ' + incidents + ' incidents across ' + built + ' orders — too few to bound');
    return incidents + ' incidents over ' + built + ' orders, closest margin ' +
      (minMargin / 1000).toFixed(1) + 's (' + worst + '), shortest hold ' + (minHold / 1000).toFixed(1) + 's';
  } finally { clock.restore(); app.dispose(); }
});

check('nobody is driving until somebody has been assigned', () => {
  /* The courier has been decided since placement — the roster draw is seeded on the
     order id — but the app claimed them from the first frame while the feed above had
     not mentioned anyone: a median of nine seconds, and up to thirty-four, of showing
     a photograph, a name, a rating and a Message button for someone who had not been
     introduced. The wait was already in the timetable; the screen simply pre-empted it.

     Nothing about WHO is chosen moves, and no write moves onto the replay path — the
     three accessors are pure and take `now`. That is the whole reason this shape was
     chosen over making assignment a state transition. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    harness.addToCart(FB, 'cluckingham', 3);
    const o = harness.makeOrder(FB, 'cluckingham', { now: T0 });
    o.id = 'dsp'; o.events = []; o.etaDrift = 0; delete o.replayed;
    FB.tracker.build(o);
    FB.store.set((st) => { st.orders.unshift(o); st.activeOrderId = o.id; return st; });

    const at = FB.tracker.assignedAt(o);
    if (!(at > o.startAt)) throw new Error('the courier is disclosed at placement, so there is no gap at all');
    if (FB.tracker.assigned(o, o.startAt)) throw new Error('somebody is assigned before the beat that assigns them');
    if (!FB.tracker.assigned(o, at + 1)) throw new Error('nobody is assigned after the beat that assigns them');

    /* the queue card, while nobody is */
    const samples = [];
    for (let t = 0; t <= at - o.startAt; t += 400) {
      const d = FB.tracker.dispatch(o, o.startAt + t);
      if (d) samples.push(d);
    }
    if (samples.length < 5) throw new Error('the dispatch queue is drawn for ' + samples.length + ' samples');
    if (samples[0].position < samples[samples.length - 1].position) throw new Error('the queue counts upward');
    const revised = samples.filter((d) => d.revised);
    if (!revised.length) throw new Error('the queue never recalculates, so the joke never lands');
    if (revised.length > samples.length / 2) throw new Error('the queue recalculates on most samples — that is a tic, not an episode');
    /* one episode, not several: the revised samples must be contiguous */
    const first = samples.indexOf(revised[0]), last = samples.lastIndexOf(revised[revised.length - 1]);
    if (last - first + 1 !== revised.length) throw new Error('the queue recalculates more than once in one order');
    if (!revised.every((d) => d.position > d.of)) throw new Error('a recalculation that does not exceed the queue is not a recalculation');
    if (FB.tracker.dispatch(o, at + 1) !== null) throw new Error('the queue card survives the assignment');

    /* a pickup has no courier to wait for, and a fixture that never ran build() has
       no tagged beat — absence must read as ALREADY assigned, so this can only ever
       withdraw a claim, never invent a wait */
    FB.cart.clearAll();
    harness.addToCart(FB, 'pizzahutch', 2);
    const pk = harness.makeOrder(FB, 'pizzahutch', { now: T0, mode: 'pickup' });
    pk.id = 'dsp_pick'; pk.events = []; pk.etaDrift = 0; delete pk.replayed;
    FB.tracker.build(pk);
    if (!FB.tracker.assigned(pk, T0)) throw new Error('a pickup waits for a courier that does not exist');
    if (FB.tracker.dispatch(pk, T0)) throw new Error('a pickup is given a dispatch queue');
    if ((pk.schedule || []).some((b) => b.tag === 'assign')) throw new Error('a pickup script assigns a Slinger');
    if (!FB.tracker.assigned(harness.makeOrder(FB, 'cluckingham', { now: T0 }), T0)) {
      throw new Error('an order with no schedule reads as unassigned — a legacy save would show a queue forever');
    }

    /* MONOTONIC. Consulted before the clock, so a corrected system clock or a save
       carried to another device cannot un-introduce someone the feed has named. */
    clock.set(at + 5000);
    FB.tracker.tick();
    const live = FB.store.order('dsp');
    if (!((live.replayed || 0) > 0)) throw new Error('nothing replayed');
    if (!FB.tracker.assigned(live, o.startAt)) throw new Error('a backwards clock un-assigned a named courier');

    /* the name may never appear above the beat that introduces it */
    let leaked = 0, checked = 0;
    for (const s of FB.catalog.all()) {
      FB.cart.clearAll();
      harness.addToCart(FB, s.slug, 3);
      if (FB.cart.lines(s.slug).length < 2) continue;
      for (let tier = 2; tier <= 3; tier++) {
        for (let i = 0; i < 3; i++) {
          const x = harness.makeOrder(FB, s.slug, { now: T0 });
          x.id = 'leak_' + s.slug + tier + i; x.tier = tier; x.events = []; x.etaDrift = 0;
          delete x.incident; delete x.replayed;
          FB.tracker.build(x);
          const ai = x.schedule.findIndex((b) => b.tag === 'assign');
          if (ai < 0) throw new Error(x.id + ' has no assignment beat');
          checked++;
          const nm = x.slinger.name;
          const early = x.schedule.findIndex((b) => b.text.indexOf(nm) > -1 || (b.sub || '').indexOf(nm) > -1);
          if (early > -1 && early < ai) leaked++;
        }
      }
    }
    if (leaked) throw new Error(leaked + ' of ' + checked + ' orders name the courier above the beat that introduces them');

    /* and the announcement is stamped from the timetable, once, however late it is read */
    const b2 = harness.loadApp();
    try {
      b2.clock.set(T0);
      harness.addToCart(b2.FB, 'cluckingham', 3);
      const o2 = harness.makeOrder(b2.FB, 'cluckingham', { now: T0 });
      o2.id = 'dsp_catch'; o2.events = []; o2.etaDrift = 0; delete o2.replayed;
      b2.FB.tracker.build(o2);
      b2.FB.store.set((st) => { st.orders.unshift(o2); st.activeOrderId = o2.id; return st; });
      const when = b2.FB.tracker.assignedAt(o2);
      b2.clock.set(T0 + 7 * 86400000);
      b2.FB.tracker.tick({ catchUp: true });
      b2.FB.tracker.tick({ catchUp: true });
      const hits = b2.FB.notifs.list().filter((n) => n.id === 'asg:dsp_catch');
      if (hits.length !== 1) throw new Error('a week-late catch-up announced the assignment ' + hits.length + ' times');
      if (Math.abs(hits[0].ts - when) > 2) {
        throw new Error('the assignment is stamped when it was noticed, not when it happened');
      }
    } finally { b2.clock.restore(); b2.dispose(); }

    /* --- and the SCREEN agrees with the sim ---
       Without this the tracker is honest and TRACKR is not: it drew the photograph,
       the name, the rating and a Message button for someone the feed had not
       mentioned. Same shape as the pickup repair this file already covers. */
    (function () {
      /* A FRESH order: `dsp` above has already been replayed, and the monotonic guard
         correctly refuses to un-introduce someone the feed has named — so rewinding
         the clock on it would be testing the wrong thing. */
      const d = harness.loadApp();
      try {
        d.clock.set(T0);
        harness.addToCart(d.FB, 'cluckingham', 3);
        const x = harness.makeOrder(d.FB, 'cluckingham', { now: T0 });
        x.id = 'dsp_screen'; x.events = []; x.etaDrift = 0; delete x.replayed;
        d.FB.tracker.build(x);
        d.FB.store.set((st) => { st.orders.unshift(x); st.activeOrderId = x.id; return st; });
        const trk = d.FB.screens.get('track');
        d.clock.set(x.startAt + 1);
        const before = trk.render({ id: 'dsp_screen' });
        if (!/slingercard--queue/.test(before)) throw new Error('TRACKR draws a courier before one is assigned');
        if (before.indexOf(x.slinger.name) > -1) throw new Error('TRACKR names the courier before the feed introduces them');
        if (/data-msg/.test(before)) throw new Error('TRACKR offers to message a courier who has not been assigned');
        if (!/Position \d+ of \d+ in the dispatch queue/.test(before)) throw new Error('the queue card does not say where you are');
        d.clock.set(d.FB.tracker.assignedAt(x) + 1000);
        d.FB.tracker.tick();
        const after = trk.render({ id: 'dsp_screen' });
        if (/slingercard--queue/.test(after)) throw new Error('the queue card survives the assignment');
        if (after.indexOf(d.FB.store.order('dsp_screen').slinger.name) < 0) throw new Error('TRACKR never names the courier at all');
        if (!/data-msg/.test(after)) throw new Error('an assigned courier cannot be messaged');
      } finally { d.clock.restore(); d.dispose(); }
    })();

    /* THE MAP. The dot used to set off toward your house during `confirmed` — a
       courier travelling before one exists. placeCourier needs a measurable path,
       which the harness's stub document does not provide, so it gets one here. */
    (function () {
      const m = harness.loadApp();
      try {
        m.clock.set(T0);
        harness.addToCart(m.FB, 'cluckingham', 3);
        const x = harness.makeOrder(m.FB, 'cluckingham', { now: T0 });
        x.id = 'dsp_map'; x.events = []; x.etaDrift = 0; delete x.replayed;
        m.FB.tracker.build(x);
        m.FB.store.set((st) => { st.orders.unshift(x); st.activeOrderId = x.id; return st; });
        const marker = { style: {}, setAttribute(k, v) { this[k] = v; } };
        const svg = { querySelector: (sel) => (sel.indexOf('#rt-') === 0
          ? { getTotalLength: () => 100, getPointAtLength: (l) => ({ x: l, y: l }) }
          : marker) };
        m.clock.set(x.startAt + 1);
        m.FB.tracker.placeCourier(svg, x, 0.4);
        if (marker.style.display !== 'none') throw new Error('the map draws a courier before one is assigned');
        if (marker.transform !== 'translate(100.0,100.0)') {
          throw new Error('an unassigned courier is not parked at the restaurant: ' + marker.transform);
        }
        m.clock.set(m.FB.tracker.assignedAt(x) + 1000);
        m.FB.tracker.tick();
        m.FB.tracker.placeCourier(svg, m.FB.store.order('dsp_map'), 0.4);
        if (marker.style.display === 'none') throw new Error('the courier never appears on the map');
        if (marker.transform === 'translate(100.0,100.0)') throw new Error('an assigned courier never leaves the restaurant');
      } finally { m.clock.restore(); m.dispose(); }
    })();

    /* THE FIFTH CACHED FRAGMENT. This screen patches a fixed list of nodes on the
       ticker and rebuilds the body only when delivery changes its shape — so a card
       that is not in that list renders "Position 4 of 4" once and never becomes a
       person. Driven through the real mount, because the list is the bug. */
    (function () {
      const c = harness.loadApp();
      try {
        c.clock.set(T0);
        harness.addToCart(c.FB, 'cluckingham', 3);
        const x = harness.makeOrder(c.FB, 'cluckingham', { now: T0 });
        x.id = 'dsp_patch'; x.events = []; x.etaDrift = 0; delete x.replayed;
        c.FB.tracker.build(x);
        c.FB.store.set((st) => { st.orders.unshift(x); st.activeOrderId = x.id; return st; });
        c.FB.nav.go = () => {};
        c.FB.nav.current = () => ({ name: 'track', params: { id: 'dsp_patch' } });
        const nodes = {};
        const mk = (cls) => (nodes[cls] = nodes[cls] || { innerHTML: '', className: cls });
        const el = () => ({ dataset: {}, innerHTML: '', scrollTop: 0, addEventListener() {}, removeEventListener() {},
          querySelector: (sel) => (sel && sel.charAt(0) === '.' ? mk(sel.slice(1)) : el()),
          querySelectorAll: () => [], contains: () => true, setAttribute() {}, getAttribute: () => null,
          classList: { add() {}, remove() {}, toggle() {} }, style: {} });
        const root = el();
        const gap = c.FB.tracker.assignedAt(x) - x.startAt;
        c.clock.set(x.startAt + 1);
        c.FB._binds = []; c.FB.screens.get('track').mount(root, { id: 'dsp_patch' }); c.FB._binds = null;
        /* mount() PATCHES; the initial markup comes from render(). So the first thing
           to prove is that a tick writes this node at all — if the fragment is not in
           the patch list it stays exactly as render() left it, forever. */
        c.clock.set(x.startAt + Math.round(gap * 0.7));
        c.FB.tracker.tick();
        const mid = mk('trk-slinger').innerHTML;
        if (!/dispatch queue/.test(mid)) {
          throw new Error('the dispatch card is not patched on the ticker — it renders once and never counts down');
        }
        /* and then it must become a person, without a body rebuild */
        c.clock.set(c.FB.tracker.assignedAt(x) + 1500);
        c.FB.tracker.tick();
        const late = mk('trk-slinger').innerHTML;
        if (/dispatch queue/.test(late)) throw new Error('the queue card is still up after the courier was assigned');
        if (late.indexOf(c.FB.store.order('dsp_patch').slinger.name) < 0) {
          throw new Error('the patched card does not name the courier');
        }
      } finally { c.clock.restore(); c.dispose(); }
    })();

    return 'the gap is ' + ((at - o.startAt) / 1000).toFixed(1) + 's, the queue counts down from ' +
      samples[0].of + ', ' + checked + ' orders introduce the courier before naming them, and the card is patched live';
  } finally { clock.restore(); app.dispose(); }
});

check('placing an order is narrated, and then it waits', () => {
  /* The three seconds place() already spent said one frozen word. They are now
     narrated, and one real wait is added AFTER the commit — scaled by surge, because
     how long it takes to find somebody to carry your food is the one thing that
     genuinely depends on how many other people are ordering.

     Post-commit on purpose: the order, the cart deletion and all three ledgers are
     written before the hold starts, so a reload during it finds a finished order
     rather than half of one. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  const realGo = FB.nav.go, realRefresh = FB.nav.refresh, realToast = FB.toast;
  try {
    const el = () => ({ dataset: {}, value: '', innerHTML: '', addEventListener() {}, removeEventListener() {},
      querySelector: el, querySelectorAll: () => [], contains: () => true, setAttribute() {},
      getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {} }, style: {} });

    /* drive a real placement, capturing the window, the stage ticker and the hold */
    const run = (hour, instant) => {
      const b = harness.loadApp();
      b.clock.set(new Date(2026, 7, 20, hour, 0, 0).getTime());
      if (instant) b.FB.store.set((st) => { st.settings.instantInterface = true; return st; });
      harness.addToCart(b.FB, 'mcronalds', 2);
      const def = b.FB.screens.get('checkout');
      const binds = [];
      const root = Object.assign(el(), { addEventListener: (t, h) => binds.push({ t, h }) });
      b.FB.nav.refresh = () => {}; b.FB.toast = () => {};
      const navs = [];
      b.FB.nav.go = (n) => navs.push(n);
      b.FB._binds = []; def.mount(root, { slug: 'mcronalds' }); b.FB._binds = null;

      const realST = b.win.setTimeout, realSI = b.win.setInterval;
      const state = { win3: null, stage: null, stageMs: 0, cleared: 0, holds: [], navs: navs, b: b, def: def };
      b.win.setTimeout = (fn, ms) => {
        if (ms === 3000 && !state.win3) { state.win3 = fn; return 1; }
        if (state.win3 && !state.committed) return realST(fn, ms);
        if (state.committed) { state.holds.push({ fn: fn, ms: ms }); return 2; }
        return realST(fn, ms);
      };
      b.win.setInterval = (fn, ms) => { state.stage = fn; state.stageMs = ms; return 9; };
      const realCI = b.win.clearInterval;
      b.win.clearInterval = (t) => { state.cleared++; return realCI(t); };
      /* Snapshot how many times the ticker had been cleared AT THE MOMENT the order
         first appears in state. stopStages() is called again later, when `placing` is
         released, so counting clears at the end cannot tell "cleared first" from
         "cleared eventually" — and cleared-first is the point: a callback that throws
         part-way through would otherwise leave an interval running forever. */
      state.clearedAtWrite = null;
      b.FB.store.sub(function () {
        if (state.clearedAtWrite === null && b.FB.S().orders.length) state.clearedAtWrite = state.cleared;
      });
      const quote = /data-quote="([\d.]+)"/.exec(def.render({ slug: 'mcronalds' }))[1];
      const btn = { dataset: { quote }, disabled: false, innerHTML: '' };
      binds.filter((x) => x.t === 'click').forEach((x) =>
        x.h({ target: { closest: (q) => (q === '[data-place]' ? btn : null) }, preventDefault() {} }));
      state.btn = btn;
      state.close = () => {
        state.committed = true;
        state.win3();
        b.win.setTimeout = realST; b.win.setInterval = realSI; b.win.clearInterval = realCI;
      };
      state.dispose = () => { b.clock.restore(); b.dispose(); };
      return state;
    };

    /* run the timers captured after the commit until one of them navigates, and
       report ITS delay — that is the dispatch hold */
    const fireHold = (st) => {
      for (const h of st.holds) {
        h.fn();
        if (st.navs.length) return h.ms;
      }
      return 0;
    };

    /* --- narrated --- */
    const d = run(19, false);
    if (!d.btn.disabled) throw new Error('the tap was refused');
    if (/Placing/.test(d.btn.innerHTML)) throw new Error('the button still says the one frozen word');
    if (!/Authorizing/.test(d.btn.innerHTML)) throw new Error('the button does not start on the first stage: ' + d.btn.innerHTML);
    if (typeof d.stage !== 'function') throw new Error('no stage ticker was started');
    if (!(d.stageMs > 0 && d.stageMs < 3000 / 4)) throw new Error('the ticker cannot resolve the stages: ' + d.stageMs + 'ms');
    /* a repaint mid-window must keep the sequence rather than reset it */
    const mid = d.def.render({ slug: 'mcronalds' });
    if (!/Authorizing/.test(mid)) throw new Error('a repaint mid-window loses the stage');
    if (/Placing…/.test(mid)) throw new Error('render() hardcodes the button text instead of reading the stage');
    d.close();
    if (!d.cleared) throw new Error('the window did not clear the stage ticker — it keeps running after the order lands');
    if (!d.clearedAtWrite) {
      throw new Error('the stage ticker is cleared only after the order is written — anything that throws ' +
        'in between leaves it running in a realm that is about to go away');
    }
    if (d.navs.length) throw new Error('the tracker was opened before the hold elapsed');
    if (d.b.FB.S().orders.length !== 1) throw new Error('the order does not exist during the hold');
    if (Object.keys(d.b.FB.S().cart).length) throw new Error('the cart survived the commit');
    /* Identified by what it DOES, not by its duration: the commit also schedules
       toasts, and picking the first timer by index picks one of those. */
    const dinnerHold = fireHold(d);
    if (!(dinnerHold > 0)) throw new Error('nothing scheduled after the commit opens the tracker');
    if (d.navs[0] !== 'track') throw new Error('the hold ended somewhere other than the tracker');
    const surgeDinner = d.b.FB.world.at(d.b.clock.now()).surge;
    d.dispose();

    /* --- scaled by how busy the world is --- */
    const q = run(15, false);
    q.close();
    const quietHold = fireHold(q);
    const surgeQuiet = q.b.FB.world.at(q.b.clock.now()).surge;
    q.dispose();
    if (!(surgeQuiet < surgeDinner)) throw new Error('the afternoon is not quieter than dinner, so the scaling is untested');
    if (!(quietHold < dinnerHold)) {
      throw new Error('a quiet hour holds ' + quietHold + 'ms and dinner holds ' + dinnerHold + 'ms — surge does not scale it');
    }

    /* --- and it can be bought off, like every other wait in the app --- */
    const i = run(19, true);
    i.close();
    if (i.navs[0] !== 'track') throw new Error('Instant Interface still waits for the dispatch queue');
    i.dispose();

    return 'four stages over ' + (3000 / 1000) + 's, then ' + quietHold + '-' + dinnerHold +
      'ms of dispatch scaled by surge ' + surgeQuiet.toFixed(2) + '-' + surgeDinner.toFixed(2);
  } finally { FB.nav.go = realGo; FB.nav.refresh = realRefresh; FB.toast = realToast; clock.restore(); app.dispose(); }
});

check('the same nine people bring their own habits', () => {
  /* The roster already made the same nine people recur, with tenure that accumulates.
     What it did not do is make them behave differently — two orders carried by two
     different couriers told the same story with a different name substituted into it.

     Each of the nine now has one recurring oddity, DERIVED from their roster position
     and never stored: no field, nothing for fillDefaults to backfill, and the same
     person always does the same thing on every order they carry. That is what makes
     the roster nine people rather than nine names. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    const people = FB.slingers.all();
    if (people.length !== FB.slingers.SIZE) throw new Error('the roster is not the size it says it is');

    /* one each, and the same one every time */
    const habits = people.map((p) => FB.slingers.quirk(p.id));
    if (habits.some((q) => !q)) throw new Error('somebody on the roster has no habit');
    const distinct = new Set(habits.map((q) => q[1]));
    if (distinct.size !== people.length) {
      throw new Error(distinct.size + ' habits spread across ' + people.length +
        ' couriers — that reads as a shallow pool, not as nine people');
    }
    for (const p of people) {
      if (FB.slingers.quirk(p.id)[1] !== FB.slingers.quirk(p.id)[1]) throw new Error('a habit is not stable');
    }
    if (FB.slingers.quirk(null) !== null) throw new Error('a habit was invented for nobody');
    if (!FB.slingers.quirk('not-on-the-roster')) throw new Error('an unknown courier falls through to nothing');
    /* colour, not delay: a habit that pushed the estimate would make WHO YOU GOT
       change what the order cost */
    for (const q of habits) {
      if (q.length > 3 && q[3]) throw new Error('a habit carries drift');
      if (!/^\{slinger\}/.test(q[1])) throw new Error('a habit does not name the person doing it: ' + q[1]);
    }

    /* it reaches the timetable, on a TIER-1 order — the first order a new player
       places used to be the one delivery with no personality in it, because an empty
       extras pool returned before the habit was appended */
    harness.addToCart(FB, 'cluckingham', 3);
    let played = 0, orders = 0;
    const missed = [];
    /* EVERY tier. Tier 1 has an empty extras pool and tiers 2 and 3 have a full one —
       a habit appended only when there is room left over is a habit that disappears
       exactly when the story is busiest, which is the wrong way round. */
    for (let tier = 1; tier <= 3; tier++) {
      for (let i = 0; i < people.length; i++) {
        const o = harness.makeOrder(FB, 'cluckingham', { now: T0 });
        o.id = 'quirk' + tier + '_' + i; o.tier = tier; o.events = []; o.etaDrift = 0;
        delete o.incident; delete o.replayed;
        o.personId = people[i].id; o.slinger = people[i];
        FB.tracker.build(o);
        orders++;
        const want = FB.slingers.quirk(o.personId)[1].replace('{slinger}', people[i].name);
        if ((o.schedule || []).some((b) => b.text === want)) played++;
        else missed.push('tier ' + tier + '/' + people[i].name);
      }
    }
    if (played !== orders) {
      throw new Error('the courier habit plays on ' + played + ' of ' + orders + ' orders; missing on ' +
        missed.slice(0, 4).join(', '));
    }

    /* the same order, carried by two different people, is two different stories —
       and neither the shuffled pool nor the splice position explains the difference,
       because the order id (and so every seed) is identical */
    const story = (pid) => {
      const o = harness.makeOrder(FB, 'cluckingham', { now: T0 });
      o.id = 'same_story'; o.tier = 1; o.events = []; o.etaDrift = 0;
      delete o.incident; delete o.replayed;
      o.personId = pid; o.slinger = people.filter((x) => x.id === pid)[0];
      FB.tracker.build(o);
      return (o.schedule || []).map((b) => b.text).join('|');
    };
    if (story(people[0].id) === story(people[3].id)) {
      throw new Error('two different couriers tell an identical story for the same order');
    }

    /* and a pickup has nobody to have a habit */
    FB.cart.clearAll();
    harness.addToCart(FB, 'pizzahutch', 2);
    const pk = harness.makeOrder(FB, 'pizzahutch', { now: T0, mode: 'pickup' });
    pk.id = 'quirk_pick'; pk.events = []; pk.etaDrift = 0; delete pk.replayed;
    pk.personId = people[0].id;
    FB.tracker.build(pk);
    const pkWant = FB.slingers.quirk(people[0].id)[1].replace('{slinger}', '');
    if ((pk.schedule || []).some((b) => b.text.indexOf(pkWant.trim().slice(0, 16)) > -1)) {
      throw new Error('a pickup order carries a courier habit');
    }

    return people.length + ' couriers, ' + distinct.size + ' distinct habits, all of them reaching a tier-1 timetable';
  } finally { clock.restore(); app.dispose(); }
});

check('a schedule slot is never offered outside the hours it is for', () => {
  /* The sheet built its rows from wall-clock arithmetic alone — deliveryMax + 45n —
     and never asked whether the store was open at the time it was offering. Swept
     over a day it put up 1,524 rows at closed times, and picking one CLEARED the
     forced hold the app had just computed for that store being shut: two taps voided
     it. A second bug in the same block hardcoded "Today," on rows that landed on the
     next calendar day.

     Generation lives in js/core/cart.js so BOTH compute call sites read one rule —
     the same reason `slot` itself does. Swept whole rather than spot-checked, because
     the shape of the bug was a percentage, not a case.

     The sweep runs at a NON-ZERO second offset on purpose. Pinned to :00 it agreed
     with FB.nextAtMinute by luck, which hid a regression where the generated grid
     carried the current seconds and the sheet drew the picked slot twice. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    let rows = 0, closed = 0, empty = 0, nextDay = 0;
    for (const s of FB.catalog.all()) {
      for (let h = 0; h < 24; h++) {
        for (const sec of [0, 37]) {
          const now = new Date(2026, 7, 20, h, 0, sec).getTime();
          clock.set(now);
          const opts = FB.cart.slotOptions(s.slug, now);
          if (!opts.length) empty++;
          const seen = new Set();
          opts.forEach((o, i) => {
            rows++;
            if (!FB.catalog.isOpen(s, o.at)) closed++;
            /* a sheet is a radio group: one row per time, in order */
            if (i && opts[i - 1].at >= o.at) throw new Error(s.slug + ' offers its slots out of order at ' + h + ':00');
            if (seen.has(o.label)) throw new Error(s.slug + ' offers ' + o.label + ' twice at ' + h + ':00:' + sec);
            seen.add(o.label);
            /* On the whole-minute grid FB.nextAtMinute answers on. Walked from a raw
               `now` the slots carried the current seconds, the in-force slot could
               never be found among them, and the sheet drew the picked time twice. */
            if (o.at % 60000 !== 0) throw new Error(s.slug + ' offers a slot that is not on a whole minute');
            /* the label is what the sheet prints AND what it stores, so it has to
               round-trip back to the instant it was drawn from */
            if (FB.minsOfDay(o.label) !== new Date(o.at).getHours() * 60 + new Date(o.at).getMinutes()) {
              throw new Error(s.slug + ' label ' + o.label + ' does not match the moment it stands for');
            }
            const a = new Date(now), b = new Date(o.at);
            if (a.getDate() !== b.getDate()) nextDay++;
          });
        }
      }
    }
    if (closed) throw new Error(closed + ' of ' + rows + ' offered slots are at a time the store is shut');
    if (empty) throw new Error(empty + ' store-hours offer no slot at all');
    /* the walk must actually be stepping over closures, or the filter is untested */
    if (nextDay < 100) throw new Error('only ' + nextDay + ' slots land on another day, so the overnight walk is not exercised');

    /* a closed store leads with its OWN opening time — the row the checkout screen
       forces onto it, and the one the coordination fee is charged for */
    const night = new Date(2026, 7, 20, 23, 0, 0).getTime();
    clock.set(night);
    const boba = FB.catalog.get('bobacloud');
    if (FB.catalog.isOpen(boba, night)) throw new Error('Boba Cloud is open at 11 PM');
    const shutOpts = FB.cart.slotOptions('bobacloud', night);
    if (shutOpts[0].at !== FB.nextAtMinute(FB.minsOfDay(boba.opensAt), night)) {
      throw new Error('a closed store does not lead with its own opening time');
    }
    if (FB.cart.slot('bobacloud', night) !== boba.opensAt) throw new Error('a closed store no longer forces its opening time');

    /* the screen must say which day it means. "Today, 11:30 AM" at 11 PM described
       an order arriving twelve and a half hours later. */
    const def = FB.screens.get('checkout');
    harness.addToCart(FB, 'bobacloud', 2);
    const row = /<button class="crow" data-schedule>[\s\S]*?<\/button>/.exec(def.render({ slug: 'bobacloud' }))[0];
    if (!row.includes('Tomorrow, ' + boba.opensAt)) throw new Error('the forced slot is not labelled with the day it lands on: ' + row);
    if (!row.includes('is closed. The order is held')) throw new Error('a slot the app forced is not explained as a closure');

    /* a stored slot is a bare clock string: it must expire rather than freeze, or a
       cart parked overnight charges the coordination fee for a time that has gone */
    FB.cart.setCo('bobacloud', { scheduled: boba.opensAt });
    if (FB.cart.slot('bobacloud', night) !== boba.opensAt) throw new Error('a slot still in reach was discarded');
    const noon = new Date(2026, 7, 21, 12, 0, 0).getTime();
    clock.set(noon);
    if (FB.cart.slot('bobacloud', noon) !== null) throw new Error('a slot the clock walked past is still in force');
    /* and once it has expired the APP owns the row again, so the copy must say so */
    const expired = /<button class="crow" data-schedule>[\s\S]*?<\/button>/.exec(def.render({ slug: 'bobacloud' }))[0];
    if (expired.includes('Scheduled')) throw new Error('an expired slot still reads as scheduled: ' + expired);

    /* The same, but with the store shut: cart.slot() falls back to opensAt while
       co.scheduled still holds the dead pick. `forced` has to mean "the APP chose
       this", not "nothing is stored" — otherwise the row credits the user with a
       2:00 AM slot they can no longer have and drops the closure explanation. */
    clock.set(night);
    FB.cart.setCo('bobacloud', { scheduled: '2:00 AM' });
    if (FB.cart.slot('bobacloud', night) !== boba.opensAt) throw new Error('a pick at a closed hour was honoured');
    const stale = /<button class="crow" data-schedule>[\s\S]*?<\/button>/.exec(def.render({ slug: 'bobacloud' }))[0];
    if (!stale.includes('is closed. The order is held')) {
      throw new Error('a slot the app fell back to is not explained as a closure: ' + stale);
    }
    FB.cart.setCo('bobacloud', { scheduled: null });

    /* the slot in force is always offered back, exactly once, however far the
       generated set has drifted from it */
    const day = new Date(2026, 7, 20, 14, 0, 11).getTime();
    clock.set(day);
    const open = FB.catalog.all().find((s) => FB.catalog.isOpen(s, day));
    const firstSlot = FB.cart.slotOptions(open.slug, day)[0];
    FB.cart.setCo(open.slug, { scheduled: firstSlot.label });
    /* Forty minutes on, not six seconds: the generated window has walked PAST the
       slot in force, so it is no longer among the rows and the splice is the only
       thing putting it back. At six seconds the grid still contained it by itself
       and the assertion below could not fail. */
    const later = day + 40 * 60000;
    clock.set(later);
    if (FB.cart.slot(open.slug, later) !== firstSlot.label) throw new Error('a slot forty minutes out expired early');
    const at = FB.cart.slotAt(open.slug, later);
    const back = FB.cart.slotOptions(open.slug, later);
    const marked = back.filter((o) => o.at === at).length;
    const labelled = back.filter((o) => o.label === firstSlot.label).length;
    if (marked !== 1) throw new Error(marked + ' rows match the slot in force, expected exactly 1');
    if (labelled !== 1) throw new Error(labelled + ' rows PRINT the slot in force, expected exactly 1');
    /* and it lands in chronological position, which is the whole point of splicing
       rather than appending — the sweep above never has a stored slot, so this is
       the only place the spliced row's ORDER is observable */
    back.forEach((o, i) => {
      if (i && back[i - 1].at >= o.at) throw new Error('the slot in force was spliced out of order');
    });
    if (back[0].at !== at) throw new Error('a slot earlier than the whole generated walk was not spliced to the front');

    /* the next occurrence of a wall-clock minute keeps that minute, whatever the
       calendar does to the length of the day. Probed in a zone that has daylight
       saving, because in UTC a fixed 24-hour roll passes this by luck. */
    const probe = require('child_process').execFileSync(process.execPath, ['-e', `
      const { loadApp } = require(${JSON.stringify(require('path').join(__dirname, 'harness.cjs'))});
      const app = loadApp();
      let bad = 0;
      for (const [y, mo, d] of [[2026, 2, 7], [2026, 9, 31]]) {
        for (let mins = 0; mins < 1440; mins += 10) {
          const from = new Date(y, mo, d, 23, 30, 0).getTime();
          const t = app.FB.nextAtMinute(mins, from);
          const got = new Date(t).getHours() * 60 + new Date(t).getMinutes();
          if (got !== mins && !(mo === 2 && mins >= 120 && mins < 180)) bad++;
        }
      }
      /* and the SCREEN on the eve of a spring-forward. Midnight to midnight is 23
         hours that night, so a day count that floors reads 0 and prints "Today" for
         an order landing the next morning; only rounding survives it. */
      /* the 8th is the 23-hour day: midnight-to-midnight across it is 82800000 ms,
         which floors to 0 days ("Today") and rounds to 1 ("Tomorrow"). The 7th is an
         ordinary 24-hour day and cannot tell the two apart. */
      const eve = new Date(2026, 2, 8, 23, 0, 0).getTime();
      app.clock.set(eve);
      const st = app.FB.catalog.get('bobacloud');
      if (app.FB.catalog.isOpen(st, eve)) throw new Error('probe store is open on the DST eve');
      const h = require(${JSON.stringify(require('path').join(__dirname, 'harness.cjs'))});
      h.addToCart(app.FB, 'bobacloud', 2);
      /* sliced, not matched: this whole script is a template literal, and a regex
         literal's backslashes do not survive the trip into the child */
      const html = app.FB.screens.get('checkout').render({ slug: 'bobacloud' });
      const i = html.indexOf('data-schedule');
      const crow = i < 0 ? '' : html.slice(i, html.indexOf('</button>', i));
      if (crow.indexOf('Tomorrow, ' + st.opensAt) < 0) { console.log('CROW:' + crow); bad += 100; }
      app.dispose();
      console.log(bad);
    `], { env: Object.assign({}, process.env, { TZ: 'America/New_York' }), encoding: 'utf8' }).trim();
    if (probe !== '0') throw new Error(probe + ' wall-clock minutes drift across a daylight-saving boundary');

    return rows + ' slots swept at two second-offsets, none at a closed hour, none doubled, ' +
      nextDay + ' correctly on a later day';
  } finally { clock.restore(); app.dispose(); }
});

check('checkout will not place an order at a total it has stopped quoting', () => {
  /* Nothing on the checkout screen re-renders on a clock tick, but place() calls
     calc() fresh at the tap. A store closing while the screen sat open added the
     coordination fee, the Peak Demand multiplier and the round-up — five dollars
     above the figure on the button — and stamped the order as next-day scheduled.

     This drives the real [data-place] handler, because asserting the data-quote
     attribute alone let the entire refusal be deleted with the suite still green.
     The tell is the button: place() disables it and writes "Placing…" as its first
     act, so a button still enabled after a tap is a tap that was refused. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  const realToast = FB.toast, realRefresh = FB.nav.refresh;
  try {
    const boba = FB.catalog.get('bobacloud');
    const before = new Date(2026, 7, 20, 21, 19, 0).getTime();   /* closes 9:20 PM */
    clock.set(before);
    if (!FB.catalog.isOpen(boba, before)) throw new Error('Boba Cloud is shut at 9:19 PM');
    harness.addToCart(FB, 'bobacloud', 3);

    const def = FB.screens.get('checkout');
    const quoteOf = (m) => {
      const q = /data-quote="([\d.]+)"/.exec(m);
      if (!q) throw new Error('the place button does not carry the total it is quoting');
      return Number(q[1]);
    };
    const q1 = quoteOf(def.render({ slug: 'bobacloud' }));

    const after = new Date(2026, 7, 20, 21, 21, 0).getTime();
    clock.set(after);
    if (FB.catalog.isOpen(boba, after)) throw new Error('Boba Cloud is open at 9:21 PM');
    const q2 = quoteOf(def.render({ slug: 'bobacloud' }));
    if (q2 <= q1) throw new Error('closing did not move the total, so the guard is untested');

    /* mount the real screen onto a root that records what FB.on binds */
    const live = [];
    const stub = () => ({ dataset: {}, addEventListener() {}, removeEventListener() {},
                          querySelector: stub, querySelectorAll: () => [], contains: () => true,
                          setAttribute() {}, getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {} } });
    const root = Object.assign(stub(), {
      addEventListener: (t, h) => live.push({ t, h }),
      removeEventListener: (t, h) => { const i = live.findIndex((x) => x.t === t && x.h === h); if (i > -1) live.splice(i, 1); },
    });
    FB._binds = []; def.mount(root, { slug: 'bobacloud' }); FB._binds = null;

    const toasts = []; FB.toast = (m) => toasts.push(String(m));
    let refreshed = 0; FB.nav.refresh = () => { refreshed++; };
    const tap = (quote) => {
      const btn = { dataset: { quote: String(quote) }, disabled: false, innerHTML: '' };
      const ev = { target: { closest: (sel) => (sel === '[data-place]' ? btn : null) }, preventDefault() {} };
      live.filter((x) => x.t === 'click').forEach((x) => x.h(ev));
      return btn;
    };

    /* a button still carrying the 9:19 figure must be refused, not charged */
    const stale = tap(q1);
    if (stale.disabled) throw new Error('a stale quote was placed anyway');
    if (!refreshed) throw new Error('a stale quote did not repaint the screen');
    if (!toasts.some((t) => /reassessed/.test(t))) throw new Error('a stale quote was refused without saying so: ' + toasts.join(' | '));
    if (FB.S().orders.length) throw new Error('a stale quote produced an order');

    /* And the honest figure still goes through, or the guard is just a wall. This is
       also the cancellation-window test: place() reads the clock a SECOND time three
       seconds after the tap, so capture that callback rather than waiting for it,
       move the clock across the store's closing minute, and assert the order is
       stamped with the schedule its receipt was priced against.

       One place() serves both halves because `placing` latches until the window
       closes — a second accepted tap would be swallowed by that guard, not by this
       one. */
    clock.set(before);                       /* 9:19 PM: open, so no slot, no fee */
    FB.nav.go = () => {};
    const realSetTimeout = app.win.setTimeout;
    let window3s = null;
    app.win.setTimeout = (fn, ms) => (ms === 3000 ? ((window3s = fn), 0) : realSetTimeout(fn, ms));
    try {
      const fresh = tap(quoteOf(def.render({ slug: 'bobacloud' })));
      if (!fresh.disabled) throw new Error('the current quote was refused too — the guard never lets an order through');
      if (!window3s) throw new Error('place() did not open a cancellation window');
      clock.set(after);                      /* 9:21 PM: shut while the window ran */
      window3s();
    } finally { app.win.setTimeout = realSetTimeout; }

    const placed = FB.S().orders[0];
    if (!placed) throw new Error('the cancellation window closed without placing');
    if (placed.scheduled !== null) {
      throw new Error('an order priced with no coordination fee was stamped scheduled ' + placed.scheduled);
    }
    if (placed.calc.feeLines.some((l) => l.id === 'schedule')) {
      throw new Error('an unscheduled order carries a Temporal Coordination Fee');
    }

    return 'quote moves ' + FB.money(q1) + ' -> ' + FB.money(q2) + ' across closing; the stale tap is refused, ' +
      'the fresh one is not, and the schedule survives the cancellation window intact';
  } finally { FB.toast = realToast; FB.nav.refresh = realRefresh; clock.restore(); app.dispose(); }
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
    /* The bound this was written for is "one per STEP, not one per beat" — an order
       has eighteen or more beats and five step changes. Stated against the step
       notifications themselves rather than against a total, because the total also
       carries the two TAGGED moments (the courier being assigned, and their message
       on collection), and a bare number could not tell a new tagged moment from the
       per-beat regression it exists to catch. */
    const perStep = FB.notifs.list().filter((n) => /^ord:/.test(n.id));
    if (perStep.length > 6) {
      throw new Error(perStep.length + ' step notifications for one order — that is per beat, not per step');
    }
    if (new Set(perStep.map((n) => n.id)).size !== perStep.length) {
      throw new Error('the same step notified twice');
    }
    const tagged = FB.notifs.list().filter((n) => /^(asg|slg):/.test(n.id));
    if (tagged.length > 2) throw new Error(tagged.length + ' tagged moments in one order');
    if (afterOrder !== perStep.length + tagged.length) {
      throw new Error('an order emitted ' + afterOrder + ' notifications that are neither per-step nor tagged');
    }
    /* the courier's assignment is one of them, and it is the moment the feed claims */
    if (!tagged.some((n) => /^asg:/.test(n.id))) throw new Error('the courier was assigned and never announced');
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
    FB.store.set((st) => { st.orders = [{ placedAt: T0, calc: { total: 60 } }]; st.notifsThrough = 0; return st; });
    clock.set(T0 + 3 * 86400000);
    const first = FB.notifs.backfill();
    /* counted BY KIND, not in total: the backlog also carries the nightly summary the
       Settings row promises at 2:40 AM, which used to be a GATE entry with no emitter
       at all — so a bare total here would have to move every time a kind is added,
       and would say nothing about which kind went missing. */
    const byKind = (k) => FB.notifs.list().filter((n) => n.kind === k).length;
    if (byKind('miss') !== 3) throw new Error('three days away produced ' + byKind('miss') + ' nags');
    if (byKind('nightly') < 1) throw new Error('the nightly summary the Settings row promises was never sent');
    if (byKind('promo') < 1) throw new Error('the Promotions switch gates a kind nothing sends');
    /* the store started empty, so what backfill reported is what it stored */
    if (first !== FB.notifs.list().length) {
      throw new Error('backfill reported ' + first + ' but stored ' + FB.notifs.list().length);
    }
    for (const n of FB.notifs.list().filter((x) => x.kind === 'nightly')) {
      const at = new Date(n.ts);
      if (at.getHours() !== 2 || at.getMinutes() !== 40) {
        throw new Error('a nightly summary is stamped ' + at.getHours() + ':' + at.getMinutes() + ', not the 2:40 it claims');
      }
      if (n.ts > clock.now()) throw new Error('a nightly summary is stamped in the future');
    }
    if (FB.notifs.backfill() !== 0) throw new Error('running the backlog twice produced duplicates');

    /* every kind the settings screen offers a switch for must have an emitter, and
       every kind that is emitted must be gateable or deliberately ungated */
    const GATED = ['order', 'promo', 'slinger', 'body', 'nightly', 'miss'];
    const emitted = new Set();
    for (const f of ['js/core/notifs.js', 'js/core/scrip.js', 'js/sim/tracker.js', 'js/sim/bodymax.js',
                     'js/ui/checkout.js', 'js/ui/orders.js', 'js/ui/item.js', 'js/app.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      let m; const re = /kind:\s*'([a-z]+)'/g;
      while ((m = re.exec(src))) emitted.add(m[1]);
    }
    const dead = GATED.filter((k) => !emitted.has(k));
    if (dead.length) throw new Error('Settings offers a switch for ' + dead.join(' and ') + ', which nothing ever emits');

    /* An ACCOUNT record is not a promotion. Four of them — BangBux expiry, Terms
       acceptance, Standing up and Standing down — rode on kind:'promo', so turning
       off "Promotions · Up to 14 per day" silently stopped the only notice that a
       balance had expired. There is no toast on that branch, so the money simply
       vanished with no record anywhere in the app.
       Booted for real, with the switch off, because the call site is in js/app.js. */
    (function () {
      const b = harness.loadApp();
      const T1 = new Date(2026, 7, 20, 19, 0, 0).getTime();
      b.clock.set(T1);
      b.FB.store.set((st) => {
        st.settings.notifications.promos = false;
        st.scrip = [{ at: T1 - 96 * 3600000, amt: 4 }];    /* issued four days ago */
        return st;
      });
      try {
        if (b.FB.scrip.balance() !== 0) throw new Error('a four-day-old grant has not expired');
        b.run(fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8'));
        const told = b.FB.notifs.list().some((n) => /BangBux/i.test(n.title || '') && /expired/i.test(n.title || ''));
        if (!told) {
          throw new Error('with Promotions switched off, nothing records that a BangBux balance expired');
        }
      } finally { b.clock.restore(); b.dispose(); }
    })();
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
    FB.notifs.backfill();
    /* by KIND: backfill also carries the nightly summary and a promotion, neither of
       which this switch governs, so a bare zero here would only prove that gating one
       kind had silenced all of them */
    if (FB.notifs.list().some((n) => n.kind === 'miss')) throw new Error('re-engagement is switched off and still notified');
    if (!FB.notifs.list().length) throw new Error('switching off one kind silenced every kind');

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
    const known = new Set(['store', 'slinger', 'rating', 'deliveries', 'vehicle', 'fries', 'note']);
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
        /* Two things made the original version of this unable to fail: the search
           was constrained to indexes AFTER the cursor, which made "is it before the
           cursor" unsatisfiable, and every beat whose text begins with a {token}
           was skipped — which in the pickup step is three of its four beats, so
           there was nothing left to order. Strip the tokens, keep the beat, and ask
           whether it can still be found at or after where we are. */
        let at = 0;
        for (const s of spine) {
          const needle = s.replace(/\{\w+\}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 14);
          if (needle.length < 8) continue;              /* too short to identify a beat */
          if (got.findIndex((g) => g.indexOf(needle) > -1) === -1) continue;  /* not in this order */
          const here = got.findIndex((g, i) => i >= at && g.indexOf(needle) > -1);
          if (here === -1) {
            throw new Error('the spine of ' + key + ' was reordered: "' + needle + '" plays before what should precede it');
          }
          at = here;
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

check('store promotions change the total, or say they do not', () => {
  /* Twenty-two promos were display strings that never touched a price, while six
     real codes lived in fees.js. `discounts` is display-only — everything runs on
     one scalar — so pushing a line there without adding to it renders a receipt row
     that changes no number, which is exactly what these were. */
  const app = harness.loadApp();
  const { FB } = app;
  try {
    const S = FB.S().settings;
    const KINDS = new Set(['spendSave', 'pct', 'plusFlat', 'none']);
    let mech = 0, inert = 0, total = 0;

    for (const [slug, m] of Object.entries(SOURCES)) {
      for (const pr of (m.promos || [])) {
        total++;
        if (typeof pr !== 'object' || !pr.text) throw new Error(slug + ': a promo is still a bare string');
        if (!KINDS.has(pr.kind)) throw new Error(slug + ': promo kind "' + pr.kind + '" is not in the enum');
        if (pr.kind === 'none') { inert++; continue; }
        mech++;
        /* the copy must name the numbers the engine uses — scoped to the kinds that
           carry one, because fourteen legitimately name none */
        if (pr.kind === 'spendSave') {
          const nums = (pr.text.match(/\$([\d.,]+)/g) || []).map(x => Number(x.slice(1).replace(/,/g, '')));
          if (!nums.includes(pr.min)) throw new Error(slug + ': "' + pr.text + '" does not name its minimum');
          if (!nums.includes(pr.value)) throw new Error(slug + ': "' + pr.text + '" does not name its saving');
        }
      }
    }
    if (!mech) throw new Error('no promo has any arithmetic behind it');
    if (!inert) throw new Error('every promo became mechanical — the jokes are gone');

    /* every store still renders a promo string, and none of them is [object Object] */
    for (const s of FB.catalog.all()) {
      const card = FB.C.storeCard(s);
      if (/\[object Object\]/.test(card)) throw new Error(s.slug + "'s card renders [object Object]");
      if ((s.promos || []).length && !card.includes(FB.esc(s.promos[0].text))) {
        throw new Error(s.slug + "'s card does not show its promo text");
      }
    }

    /* the threshold fires exactly at the threshold */
    const ab = FB.catalog.get('applebeez');
    const pr = (ab.promos || []).find(p => p.kind === 'spendSave');
    if (!FB.catalog.storeOffer(ab, pr.min, false)) throw new Error('the promo does not fire at its own minimum');
    if (FB.catalog.storeOffer(ab, pr.min - 0.01, false)) throw new Error('the promo fires below its minimum');
    const on = FB.fees.compute({ subtotal: pr.min, lineCount: 3, store: ab, settings: S, storePromo: FB.catalog.storeOffer(ab, pr.min, false) });
    const off = FB.fees.compute({ subtotal: pr.min, lineCount: 3, store: ab, settings: S });
    if (!on.discounts.some(d => d.id === 'storepromo')) throw new Error('no store promotion line on the receipt');
    if (on.promoAmount !== pr.value) throw new Error('the discount scalar did not take the store promo: ' + on.promoAmount);
    if (!(on.total < off.total)) throw new Error('the promo changed the receipt but not the total');

    /* a member-only promo is member-only */
    const ph = FB.catalog.get('pizzahutch');
    if (FB.catalog.storeOffer(ph, 50, false)) throw new Error('a members-only promo applied to a non-member');
    if (!FB.catalog.storeOffer(ph, 50, true)) throw new Error('a members-only promo did not apply to a member');

    /* a percentage promo respects its own cap */
    const bw = FB.catalog.get('brawndo');
    const pct = (bw.promos || []).find(p => p.kind === 'pct');
    if (FB.catalog.storeOffer(bw, 10000, false).amount !== pct.max) throw new Error('the percentage promo ignored its cap');

    /* stacking with a typed code can never discount more than the food */
    const stacked = FB.fees.compute({
      subtotal: 4, lineCount: 1, store: ab, settings: S,
      promo: { valid: true, kind: 'flat', value: 10, code: 'BANG10', blurb: '' },
      storePromo: { text: 'x', kind: 'spendSave', amount: 5 },
    });
    if (stacked.promoAmount > 4) throw new Error('the combined discount exceeded the subtotal');

    return mech + ' promos with arithmetic, ' + inert + ' without, across ' + total;
  } finally { app.dispose(); }
});

check('some things run out, and never too many of them', () => {
  /* The menus have always promised this — "when they are gone they are gone until
     Sunday", "hand battered in the morning, and the app does not know when they are
     gone" — and the app honoured none of it, which is what makes a menu read as
     published rather than operated. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    let marked = 0;
    for (const [slug, m] of Object.entries(SOURCES)) {
      const all = m.menu.flatMap(s => s.items);
      const scarce = all.filter(it => it.scarce);
      marked += scarce.length;
      for (const it of scarce) {
        if (typeof it.scarce !== 'string' || it.scarce.length < 8) throw new Error(slug + '/' + it.id + ': scarce is not a reason');
      }
      /* a menu that is mostly unavailable is not scarcity, it is a broken store */
      if (scarce.length > all.length * 0.25) throw new Error(slug + ': ' + scarce.length + ' of ' + all.length + ' can run out');
    }
    if (marked < 7) throw new Error('only ' + marked + ' items can ever run out');

    /* stable for a whole day, different tomorrow, identical across a restart */
    const day0 = new Date(2026, 7, 20, 12, 0, 0).getTime();
    const item = FB.catalog.item('gyropalace', 'gyp-017');
    if (!item.scarce) throw new Error('the grape leaves lost their scarcity');
    clock.set(day0);
    const a = FB.catalog.available(item, day0);
    if (FB.catalog.available(item, day0 + 6 * 3600000) !== a) throw new Error('availability changed within one day');
    if (FB.catalog.available(item, day0) !== a) throw new Error('availability is not deterministic');

    /* Every scarce item, sampled at the world clock's own 20-minute resolution
       across a whole day. The threshold used to be weighted by kitchen load read at
       `now`, which re-seeds every twenty minutes — so "unavailable today" came back
       at 3:20 and left again at 3:40. Checking one item at 6-hour steps missed it. */
    const scarceItems = FB.catalog.all().flatMap((s) => s.menu.flatMap((sec) => sec.items)).filter((i) => i.scarce);
    for (const it of scarceItems) {
      const midnight = new Date(2026, 7, 20, 0, 0, 0).getTime();
      const first = FB.catalog.available(it, midnight);
      for (let m = 20; m < 24 * 60; m += 20) {
        if (FB.catalog.available(it, midnight + m * 60000) !== first) {
          throw new Error(it.id + ' changed availability ' + Math.floor(m / 60) + ':' + (m % 60) + ' into its own day');
        }
      }
    }

    /* over a fortnight it must both happen and not happen */
    let outDays = 0;
    for (let d = 0; d < 14; d++) {
      const t = day0 + d * 86400000;
      clock.set(t);
      if (!FB.catalog.available(item, t)) outDays++;
    }
    if (outDays === 0) throw new Error('a scarce item was never once unavailable in a fortnight');
    if (outDays === 14) throw new Error('a scarce item was never once available in a fortnight');

    /* and no store is ever gutted: every day, every store keeps most of its menu */
    for (let d = 0; d < 14; d++) {
      const t = day0 + d * 86400000;
      clock.set(t);
      for (const s of FB.catalog.all()) {
        const all = s.menu.flatMap(sec => sec.items);
        const live = all.filter(it => FB.catalog.available(it, t));
        if (live.length < 15) throw new Error(s.slug + ' has only ' + live.length + ' items on day ' + d);
        if (live.length < all.length * 0.75) throw new Error(s.slug + ' lost over a quarter of its menu on day ' + d);
      }
    }

    /* an unavailable item is unavailable everywhere it is drawn, not just on the
       store page — Home's rail and Search render items too */
    clock.set(day0);
    const gone = FB.catalog.all().flatMap(s => s.menu.flatMap(sec => sec.items))
      .find(it => it.scarce && !FB.catalog.available(it, day0));
    if (!gone) throw new Error('no scarce item is out on the probe day, so nothing below was drawn');
    {
      const store = FB.catalog.get(gone.storeSlug);
      const row = FB.C.menuItem(gone, store);
      if (!/is-out/.test(row)) throw new Error('an unavailable item renders as available on the store page');
      if (!row.includes(FB.esc(gone.scarce))) throw new Error('the menu row does not say why it is gone');
      if (gone.photoSrc) {
        const tile = FB.C.dishTile({ item: gone, store: store });
        if (!/is-out/.test(tile)) throw new Error("an unavailable item renders as available on Home's rail");
      }
    }

    /* the restock fee is order-level, so the FEE_WHY walk can reach it at all */
    const c = FB.fees.compute({ subtotal: 40, lineCount: 3, settings: FB.S().settings, restockAlerts: 2 });
    const l = c.feeLines.find(x => x.id === 'restock');
    if (!l) throw new Error('the restock fee is unreachable from fees.compute');
    if (Math.abs(l.amount - 2.80) > 0.011) throw new Error('the restock fee does not scale with the count');
    if (FB.fees.compute({ subtotal: 12, lineCount: 2, settings: FB.S().settings }).total !== 60) throw new Error('the $60.00 case moved');

    /* reorder must not walk around the sold-out gate the item sheet enforces */
    const goneToday = FB.catalog.all().flatMap((s) => s.menu.flatMap((sec) => sec.items))
      .find((it) => it.scarce && !FB.catalog.available(it, day0));
    if (goneToday) {
      clock.set(day0);
      FB.store.reset();
      const st = FB.catalog.get(goneToday.storeSlug);
      FB.cart.add(st.slug, goneToday, FB.catalog.defaultSel(goneToday), 1, '');
      /* the cart is where reorder would put it — assert the app knows it is gone,
         on the surface that would have to refuse it, not by re-asking the predicate
         that chose it */
      const deadLines = FB.cart.unsellable(st.slug);
      if (deadLines.length !== 1 || deadLines[0].itemId !== goneToday.id) {
        throw new Error('a sold-out item reordered into the cart is not flagged unsellable there');
      }
      if (!/cartline is-out/.test(FB.screens.get('cart').render({ slug: st.slug }))) {
        throw new Error('the cart draws a reordered sold-out item as an ordinary line');
      }
      FB.cart.clear(st.slug);
    } else {
      throw new Error('no scarce item is out on the probe day, so the reorder gate was never exercised');
    }

    /* paying to be told stops being billed once you have been told */
    FB.store.reset();
    clock.set(day0);
    const target = scarceItems[0];
    FB.store.set((s) => { s.restock = [target.id]; return s; });
    let told = 0;
    for (let d = 0; d < 14 && !told; d++) {
      const t = day0 + d * 86400000;
      clock.set(t);
      if (FB.catalog.available(target, t)) told = FB.notifs.restocks(t);
    }
    if (!told) throw new Error('a monitored item never came back in a fortnight');
    if ((FB.S().restock || []).length !== 0) throw new Error('monitoring kept billing after the notification was sent');

    return marked + ' items can run out; ' + outDays + ' of 14 days for the grape leaves';
  } finally { clock.restore(); app.dispose(); }
});

check('nine couriers have nine faces, and every one of them is on disk', () => {
  /* The roster was nine named people sharing THREE portraits, five of them the same
     man, in a mode built on the same nine turning up. The face is now taken from the
     roster index rather than from the seeded draw, because a draw over nine collides. */
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    clock.set(new Date(2026, 7, 20, 19, 0, 0).getTime());
    FB.store.reset();
    const all = FB.slingers.all();
    eq(all.length, 9, 'roster size');
    const faces = new Set(all.map((s) => s.photo));
    eq(faces.size, 9, 'distinct portraits');
    for (const s of all) {
      if (!/^assets\/app\//.test(s.photo)) throw new Error('not a root-relative path: ' + s.photo);
      if (!fs.existsSync(path.join(ROOT, s.photo))) throw new Error('missing portrait: ' + s.photo);
    }

    /* REPAIRED ON READ. A save written while the pool was three deep keeps its three
       faces forever otherwise — fillDefaults never descends into an array. */
    FB.store.set((st) => {
      st.slingers.forEach((x) => { x.photo = 'assets/app/slinger-1.webp'; });
      return st;
    }, { silent: true });
    const repaired = new Set(FB.slingers.all().map((s) => s.photo));
    eq(repaired.size, 9, 'portraits after an old save is read back');
    return '9 couriers, 9 portraits, repaired on read';
  } finally { app.dispose(); }
});

check('the same nine people keep turning up, and a revised tip stays consistent', () => {
  /* Identity was seeded on the ORDER id, so a given Slinger structurally could never
     recur: every delivery in the app's life was made by a stranger. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);

    /* nine people, and the same nine in every save */
    const roster = FB.slingers.all();
    if (roster.length !== FB.slingers.SIZE) throw new Error('the roster is ' + roster.length + ' people');
    if (new Set(roster.map(s => s.name)).size !== roster.length) throw new Error('two people on the roster share a name');
    if (new Set(roster.map(s => s.id)).size !== roster.length) throw new Error('two people on the roster share an id');

    /* assignment is deterministic and recurs */
    const first = FB.slingers.assign('o_probe');
    if (FB.slingers.assign('o_probe').id !== first.id) throw new Error('assignment is not deterministic');
    const seen = {};
    for (let i = 0; i < 40; i++) { const s = FB.slingers.assign('o_' + i); seen[s.id] = (seen[s.id] || 0) + 1; }
    if (Object.keys(seen).length < 4) throw new Error('only ' + Object.keys(seen).length + ' people ever deliver');
    if (!Object.values(seen).some(n => n > 1)) throw new Error('nobody ever delivers twice');

    /* rating goes on the person, and shapes who comes back */
    FB.slingers.rate(roster[0].id, 5);
    FB.slingers.rate(roster[0].id, 5);
    if (FB.slingers.avgRating(FB.slingers.get(roster[0].id)) !== 5) throw new Error('ratings did not land on the person');

    /* --- a revised tip must leave three ledgers agreeing --- */
    harness.addToCart(FB, 'mcronalds', 2);
    const o = harness.makeOrder(FB, 'mcronalds', { now: T0 });
    o.etaDrift = 0; o.events = [];
    FB.tracker.build(o);
    FB.cart.clear('mcronalds');
    FB.store.set((st) => {
      st.orders.unshift(o); st.activeOrderId = o.id;
      st.meta.orderCount = 1;
      st.meta.lifetimeSpend = o.calc.total;
      st.meta.lifetimeTips = o.calc.tip;
      st.meta.lifetimeFees = o.calc.feesTotal;
      return st;
    });
    FB.bodymax.ingest(o);

    const before = {
      total: FB.store.order(o.id).calc.total,
      spend: FB.S().meta.lifetimeSpend,
      tips: FB.S().meta.lifetimeTips,
      row: FB.S().bodymax.history.find(r => r.orderId === o.id).spend,
    };
    if (before.row !== before.total) throw new Error('the BODYMAX row disagreed with the receipt before anything changed');

    /* the fee is charged whether or not it is larger than the reduction */
    const FEE = FB.TIP_REVIEW_FEE, CUT = 5;
    const tipWas = FB.store.order(o.id).calc.tip;
    FB.adjustTip(o.id, -CUT, FEE);

    const after = FB.store.order(o.id);
    const row = FB.S().bodymax.history.find(r => r.orderId === o.id);
    if (after.calc.tip !== FB.round2(tipWas - CUT)) throw new Error('the tip did not come down by the amount chosen');
    if (row.spend !== after.calc.total) throw new Error('the BODYMAX row and the receipt disagree after a revision');
    if (FB.S().meta.lifetimeSpend !== FB.round2(before.spend + (after.calc.total - before.total))) {
      throw new Error('lifetimeSpend and the receipt disagree after a revision');
    }
    if (FB.S().meta.lifetimeTips !== FB.round2(before.tips - CUT)) throw new Error('lifetimeTips did not follow the revision');
    /* the fee exceeding the reduction is the joke and must stay possible */
    if (FEE <= 2) throw new Error('the review fee is too small to ever exceed a reduction');
    if (after.tipHistory.length !== 1 || after.tipHistory[0].delta !== -CUT) throw new Error('tipHistory is not append-only and accurate');
    /* and a tip can never be revised below zero */
    if (after.calc.tip < 0) throw new Error('the tip went negative');

    return FB.slingers.SIZE + ' on the roster, ' + Object.keys(seen).length + ' seen over 40 orders, ledgers agree after a revision';
  } finally { clock.restore(); app.dispose(); }
});

check('the restaurant can run out mid-order, and it is answered exactly once', () => {
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    function place(id, lines) {
      clock.set(T0);
      harness.addToCart(FB, 'mcronalds', lines);
      const o = harness.makeOrder(FB, 'mcronalds', { now: T0 });
      o.id = id; o.etaDrift = 0; o.events = []; delete o.incident; delete o.replayed;
      FB.tracker.build(o);
      FB.cart.clear('mcronalds');
      FB.store.set((st) => {
        st.orders.unshift(o); st.activeOrderId = o.id;
        st.meta.lifetimeSpend = o.calc.total; st.meta.lifetimeFees = o.calc.feesTotal;
        st.meta.lifetimeTips = o.calc.tip;
        return st;
      });
      FB.bodymax.ingest(o);
      return o;
    }

    /* a single-line order never gets one: "remove and be credited" would empty an
       order whose fee stack has already been multiplied */
    for (let i = 0; i < 25; i++) {
      FB.store.reset();
      const one = place('o_single' + i, 1);
      if (one.incident) throw new Error('a single-line order was given an incident');
    }

    /* find a multi-line order that does get one */
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      FB.store.reset();
      const o = place('o_multi' + i, 3);
      if (o.incident) hit = o;
    }
    if (!hit) throw new Error('no multi-line order ever gets an incident');
    if (hit.incident.at <= hit.startAt) throw new Error('the incident fires before the order starts');
    if (hit.incident.deadline <= hit.incident.at) throw new Error('the deadline is not after the incident');
    if (hit.incident.deadline >= hit.deliverAt) throw new Error('the deadline lands after the order was due to arrive');

    /* it HOLDS the order: the estimate does not run down while nobody answers */
    clock.set(hit.incident.at + 1000);
    FB.tracker.tick();
    const held = FB.store.order(hit.id);
    if (held.status === 'delivered') throw new Error('the order delivered with an unanswered incident');
    const etaA = FB.tracker.eta(held);
    clock.set(hit.incident.at + 20000);
    FB.tracker.tick();
    if (FB.tracker.eta(FB.store.order(hit.id)) < etaA - 1) throw new Error('the estimate ran down while the order was held');

    /* answering it patches all three ledgers together */
    const before = {
      total: FB.store.order(hit.id).calc.total,
      spend: FB.S().meta.lifetimeSpend,
      row: FB.S().bodymax.history.find(r => r.orderId === hit.id).spend,
    };
    const r = FB.tracker.resolveIncident(hit.id, 'remove');
    if (!r || !(r.credit > 0)) throw new Error('removing an item credited nothing');
    const after = FB.store.order(hit.id);
    const row = FB.S().bodymax.history.find(r2 => r2.orderId === hit.id);
    if (row.spend !== after.calc.total) throw new Error('the BODYMAX row and the receipt disagree after a resolution');
    if (FB.S().meta.lifetimeSpend !== FB.round2(before.spend + (after.calc.total - before.total))) {
      throw new Error('lifetimeSpend and the receipt disagree after a resolution');
    }
    /* the credit is the BASE price, not the unit price that was charged */
    const removedName = hit.incident.name;
    const src = FB.catalog.all().flatMap(s => s.menu.flatMap(sec => sec.items)).find(it => it.name === removedName);
    if (src && Math.abs(r.credit % src.price) > 0.011 && r.credit !== src.price) {
      throw new Error('the credit is not a multiple of the base price');
    }
    /* and it cannot be answered twice */
    if (FB.tracker.resolveIncident(hit.id, 'substitute') !== null) throw new Error('an incident was resolved twice');

    /* an expired incident elects ONCE, even across a closed browser and two boots */
    FB.store.reset();
    let ab = null;
    for (let i = 0; i < 60 && !ab; i++) {
      FB.store.reset();
      const o = place('o_gone' + i, 3);
      if (o.incident) ab = o;
    }
    if (!ab) throw new Error('no incident to abandon');
    clock.set(ab.incident.deadline + 86400000);
    FB.tracker.resume();
    FB.tracker.resume();
    const done = FB.store.order(ab.id);
    if (done.incident.resolution !== 'substitute') throw new Error('an expired incident did not elect the dearest option');
    const elections = done.events.filter(e => /No resolution was selected/.test(e.text));
    if (elections.length !== 1) throw new Error('the election fired ' + elections.length + ' times');
    if (done.status !== 'delivered') throw new Error('an abandoned incident never settled: ' + done.status);
    /* the feed still reads in time order with the incident in it */
    const ts = done.events.map(e => e.ts);
    if (!ts.every((t, i) => i === 0 || ts[i - 1] >= t)) throw new Error('the feed is out of order with an incident in it');

    return 'held, answered, and elected once when abandoned';
  } finally { clock.restore(); app.dispose(); }
});

check('every screen mounts, and records what it binds', () => {
  /* The render check never calls mount(), which is where a screen reaches for an
     API — so a function renamed out from under a mount handler renders perfectly
     and throws the moment anyone opens the screen. */
  const app = harness.loadApp();
  const { FB, clock, doc } = app;
  try {
    clock.set(new Date(2026, 7, 20, 19, 0, 0).getTime());
    const bad = [];
    let mounted = 0, bound = 0;
    for (const fx of harness.FIXTURES) {
      FB.store.reset();
      const params = fx.apply(FB, new Date(2026, 7, 20, 19, 0, 0).getTime()) || {};
      for (const name of FB.screens.list()) {
        const def = FB.screens.get(name);
        if (!def.mount) continue;
        const p = harness.paramsFor(name, params);
        const root = doc.createElement('main');
        try { root.innerHTML = def.render ? def.render(p) : ''; }
        catch (e) { bad.push(fx.name + ' / ' + name + '.render: ' + e.message); continue; }
        /* the shell parks this array; FB.on records every unbind fn into it */
        const binds = FB._binds = [];
        try { def.mount(root, p); mounted++; }
        catch (e) { bad.push(fx.name + ' / ' + name + '.mount: ' + e.message); }
        FB._binds = null;
        bound += binds.length;
        /* every recorded unbind must actually be callable, or the shell throws on
           the next paint instead of on this one */
        for (const off of binds) {
          if (typeof off !== 'function') { bad.push(name + ' recorded a non-function unbind'); break; }
        }
        if (def.unmount) {
          try { def.unmount(); } catch (e) { bad.push(fx.name + ' / ' + name + '.unmount: ' + e.message); }
        }
        binds.forEach((off) => { try { off(); } catch (e) { bad.push(name + ': unbind threw: ' + e.message); } });
      }
    }
    if (bad.length) throw new Error(bad.length + ' problem(s):\n          ' + bad.slice(0, 6).join('\n          '));
    if (!bound) throw new Error('no screen bound a single listener — the harness is not exercising mount');
    return mounted + ' mounts, ' + bound + ' listeners recorded and unbound';
  } finally { clock.restore(); app.dispose(); }
});

check('the cart preview and the checkout it links to quote the same total', () => {
  /* Every ctx field must be threaded through BOTH compute call sites. `scheduled`
     was not: checkout forced a slot for a closed store and the preview did not, so
     a cart said $60.00 and the very next screen said $65.00. The comment above
     cart-screen's compute call records the same drift happening once before. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const money = (html, label) => (html.match(new RegExp(label + '<\\/span><span>(\\$[\\d.,]+)')) || [])[1];
    const bad = [];
    let compared = 0;
    for (const [hourName, ts] of [['dinner', new Date(2026, 7, 20, 19, 0, 0).getTime()],
                                  ['3 AM', new Date(2026, 7, 20, 3, 0, 0).getTime()],
                                  ['10 PM', new Date(2026, 7, 20, 22, 0, 0).getTime()]]) {
      clock.set(ts);
      for (const s of FB.catalog.all()) {
        FB.store.reset();
        harness.addToCart(FB, s.slug, 2);
        const cart = FB.screens.get('cart').render({ slug: s.slug });
        const chk = FB.screens.get('checkout').render({ slug: s.slug });
        const a = money(cart, 'Go to checkout'), b = money(chk, 'Place order');
        if (!a || !b) { bad.push(hourName + ' / ' + s.slug + ': could not read a total'); continue; }
        compared++;
        if (a !== b) bad.push(hourName + ' / ' + s.slug + ': cart ' + a + ' vs checkout ' + b);
      }
    }
    if (bad.length) throw new Error(bad.length + ' disagreement(s):\n          ' + bad.slice(0, 6).join('\n          '));
    return compared + ' carts compared against their own checkout, open and closed';
  } finally { clock.restore(); app.dispose(); }
});

check('a receipt always reaches its own total', () => {
  /* A charge that moves the total without moving the itemised lines is a receipt
     whose rows do not sum to its bottom line. Store promotions started applying
     automatically, and the incident fees are charged after placement. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T0);
    function sums(c) {
      const fees = c.feeLines.reduce((a, l) => a + l.amount, 0);
      const disc = (c.discounts || []).reduce((a, l) => a + l.amount, 0);
      return FB.round2(c.subtotal + disc + fees + c.taxLine.amount + c.tipLine.amount +
        (c.roundLine ? c.roundLine.amount : 0));
    }
    const S = FB.S().settings;
    /* the engine itself, across every branch the fee walk exercises */
    const ctxs = [
      { subtotal: 12, lineCount: 2 },
      { subtotal: 95, lineCount: 3, store: FB.catalog.get('applebeez'), storePromo: FB.catalog.storeOffer(FB.catalog.get('applebeez'), 95, false) },
      { subtotal: 40, lineCount: 3, plus: true, scrip: 3, standingTier: 3, tosVersion: 3, restockAlerts: 1, tipReviews: 1 },
      { subtotal: 40, lineCount: 3, substitution: true, hold: true },
    ];
    for (const ctx of ctxs) {
      const c = FB.fees.compute({ settings: S, ...ctx });
      if (Math.abs(sums(c) - c.total) > 0.011) {
        throw new Error('fees.compute rows sum to ' + sums(c) + ' but total is ' + c.total);
      }
    }

    /* and a placed order after an incident has been resolved */
    let hit = null;
    for (let i = 0; i < 60 && !hit; i++) {
      FB.store.reset();
      clock.set(T0);
      harness.addToCart(FB, 'mcronalds', 3);
      const o = harness.makeOrder(FB, 'mcronalds', { now: T0 });
      o.id = 'o_r' + i; o.etaDrift = 0; o.events = []; delete o.incident; delete o.replayed;
      o.calc.discounts = [];
      FB.tracker.build(o);
      FB.cart.clear('mcronalds');
      FB.store.set((st) => { st.orders.unshift(o); st.activeOrderId = o.id; return st; });
      FB.bodymax.ingest(o);
      if (o.incident) hit = o;
    }
    if (!hit) throw new Error('no incident to resolve');
    const beforeLines = FB.store.order(hit.id).calc.feeLines.length;
    FB.tracker.resolveIncident(hit.id, 'substitute');
    const after = FB.store.order(hit.id);
    if (after.calc.feeLines.length !== beforeLines + 1) {
      throw new Error('the substitution moved the total without adding a line');
    }
    const added = after.calc.feeLines[after.calc.feeLines.length - 1];
    if (!FB.FEE_WHY[added.id]) throw new Error('the added line has no FEE_WHY entry: ' + added.id);
    if (added.amount !== FB.fees.INCIDENT_FEES.substitution) throw new Error('the line does not match the price quoted');

    return ctxs.length + ' fee contexts and a resolved incident, all reconciled';
  } finally { clock.restore(); app.dispose(); }
});

check('an unanswered incident holds the order without running away with it', () => {
  /* The hold re-derived the remaining span from the already-updated deliverAt on
     every tick, so forty seconds of not answering pushed arrival out by nearly
     fifteen real minutes. The old check ticked twice and only asserted the estimate
     did not run DOWN. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
    /* Prefer an order whose deadline was actually CLAMPED. On one that happens to get
       a near-full hold, shifting arrival by the 40 s ceiling instead of by the hold
       offered is a one-second error and invisible — the defect only shows on the
       short windows the clamp exists for. */
    /* starbux, not cluckingham: at a 29-minute ETA the kitchen window is short enough
       that the deadline is always CLAMPED, and the clamp is what this check has to be
       able to see. On a long-window store the hold runs the full 40 s, and shifting
       arrival by the ceiling instead of by the hold offered is a one-second error
       that no assertion can distinguish. Measured: starbux and mcronalds clamp on
       every order, every other store on none. */
    const SHORT = 'starbux';
    let o = null;
    for (let i = 0; i < 90 && !o; i++) {
      FB.store.reset();
      clock.set(T0);
      harness.addToCart(FB, SHORT, 3);
      const x = harness.makeOrder(FB, SHORT, { now: T0 });
      x.id = 'o_hold' + i; x.etaDrift = 0; x.events = []; delete x.incident; delete x.replayed;
      FB.tracker.build(x);
      FB.cart.clear(SHORT);
      FB.store.set((st) => { st.orders.unshift(x); st.activeOrderId = x.id; return st; });
      if (x.incident) o = x;
    }
    if (!o) throw new Error('no incident to hold');
    if (o.incident.deadline - o.incident.at >= FB.tracker.INCIDENT_MS - 8000) {
      throw new Error(SHORT + ' no longer produces a clamped deadline, so this check can no longer ' +
        'tell a hold shifted by its own length from one shifted by the ceiling');
    }
    const span0 = o.deliverAt - o.startAt;
    /* THIS order's hold, not the ceiling. The deadline is clamped to fit inside the
       kitchen window, so an order whose window is short offers less than
       INCIDENT_MS — and a loop that ticks past its own deadline fires the election
       mid-loop, moves deliverAt, and throws about the estimate growing when what
       actually happened is that the hold ended. */
    const holdMs = o.incident.deadline - o.incident.at;
    if (holdMs < FB.tracker.INCIDENT_MIN_MS) throw new Error('a hold of ' + holdMs + 'ms is shorter than the floor');
    if (holdMs > FB.tracker.INCIDENT_MS) throw new Error('a hold of ' + holdMs + 'ms exceeds the ceiling');

    /* tick through the whole hold at the real ticker's cadence */
    let eta0 = null;
    for (let t = 0; t < holdMs - 1000; t += 900) {
      clock.set(o.incident.at + t);
      FB.tracker.tick();
      const c = FB.store.order(o.id);
      const e = FB.tracker.eta(c);
      if (eta0 === null) eta0 = e;
      if (e > eta0) throw new Error('the estimate GREW during the hold: ' + eta0 + ' -> ' + e + ' at +' + t + 'ms');
      if (c.deliverAt - o.startAt > span0 + holdMs + 2000) {
        throw new Error('deliverAt ran away: pushed ' + Math.round((c.deliverAt - o.startAt - span0) / 1000) + 's for a ' +
          Math.round(t / 1000) + 's hold');
      }
    }

    /* Nobody answered, so the platform elects for you — and the arrival moves by the
       hold that was ACTUALLY offered. Shifting by the 40 s ceiling instead pushes
       arrival out by the difference for a wait that never happened, and the settle
       bound below is 60 s wide, so it cannot see a 17 s over-push. */
    clock.set(o.incident.deadline + 1200);
    FB.tracker.tick();
    const elected = FB.store.order(o.id);
    if (!elected.incident.elected) throw new Error('the deadline passed without electing');
    /* measured from the BASELINE the hold captured, not from the previous tick:
       shiftAfterHold recomputes deliverAt as base + held on every pass, so the push
       accumulates during the hold and the last pass only adds the remainder */
    const base = elected.incident.baseDeliverAt;
    if (base == null) throw new Error('the hold captured no baseline to shift from');
    const pushed = elected.deliverAt - base;
    if (Math.abs(pushed - holdMs) > 2500) {
      throw new Error('an unanswered ' + Math.round(holdMs / 1000) + 's hold moved arrival by ' +
        Math.round(pushed / 1000) + 's');
    }

    /* it still settles, and within a sane window */
    let delivered = false;
    for (let t = 0; t < 400 && !delivered; t += 2) {
      clock.set(o.incident.deadline + t * 1000);
      FB.tracker.tick();
      if (FB.store.order(o.id).status === 'delivered') delivered = true;
    }
    if (!delivered) throw new Error('a held order never delivered');
    const final = FB.store.order(o.id);
    const took = final.deliveredAt - o.startAt;
    if (took > span0 + holdMs + 60000) {
      throw new Error('a held order took ' + Math.round(took / 1000) + 's for a ' + Math.round(span0 / 1000) + 's delivery');
    }
    /* the beats moved with it rather than dumping in one tick when the gate lifted */
    const inHold = final.events.filter((e) => e.ts > o.incident.at && e.ts < o.incident.deadline &&
      !/resolution|out of/.test(e.text));
    if (inHold.length > 1) throw new Error(inHold.length + ' scheduled beats played during the hold');

    return 'estimate frozen, arrival pushed once, beats moved with it';
  } finally { clock.restore(); app.dispose(); }
});

check('the map tints carry all six tokens and both themes', () => {
  /* #device is an ancestor of #view, and a custom property inherits from the
     nearest ancestor that DECLARES it — so a tint on #device beats the :root dark
     palette regardless of specificity. Four of six tokens left the roads at the
     other theme's value: a near-white plate with near-black roads. */
  const css = fs.readFileSync(path.join(ROOT, 'css/tokens.css'), 'utf8');
  const TOKENS = ['--map-bg', '--map-block', '--map-road', '--map-roadcase', '--map-park', '--map-water'];
  const blocks = [...css.matchAll(/([^{}]*#device\[data-(?:weather|daypart)[^{]*)\{([^}]*)\}/g)];
  if (!blocks.length) throw new Error('no map tint blocks at all');
  const light = [];
  for (const b of blocks) {
    const sel = b[1].trim().replace(/\s+/g, ' ');
    const missing = TOKENS.filter((t) => !b[2].includes(t));
    if (missing.length) throw new Error(sel.slice(0, 60) + ' declares only ' + (6 - missing.length) + '/6 map tokens');
    if (!/data-theme|prefers-color-scheme/.test(sel)) light.push(sel);
  }
  /* every light tint needs the two dark forms: the media query and the explicit stamp */
  for (const sel of light) {
    const key = sel.match(/#device\[[^\]]+\]/g).join('');
    const dark = blocks.filter((b) => /data-theme="dark"/.test(b[1]) && b[1].includes(key.slice(0, 24)));
    const media = css.includes('prefers-color-scheme: dark') &&
      new RegExp('not\\(\\[data-theme="light"\\]\\)[^{]*' + key.slice(0, 24).replace(/[[\]]/g, '\\$&')).test(css);
    if (!dark.length) throw new Error(sel.slice(0, 50) + ' has no [data-theme="dark"] counterpart');
    if (!media) throw new Error(sel.slice(0, 50) + ' has no prefers-color-scheme counterpart');
  }
  return blocks.length + ' tint blocks, six tokens each, both dark forms';
});

check('the app boots', () => {
  /* js/app.js is the one file the harness deliberately skips, so nothing has ever
     exercised the actual boot sequence: applyAppearance, installFavicon, catalog
     init, shell.init, standing decay, BangBux expiry, the notification backlog,
     nav.go('home') and tracker.resume — in that order, with whatever the save
     happens to contain. Every one of those is a place a renamed API throws. */
  const T0 = new Date(2026, 7, 20, 19, 0, 0).getTime();
  const appSrc = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');

  function boot(seed) {
    const app = harness.loadApp();
    app.clock.set(T0);
    if (seed) seed(app.FB, T0);
    try { app.run(appSrc); }
    catch (e) { app.dispose(); throw new Error('boot threw: ' + e.message); }
    const at = app.FB.nav.current();
    const orders = app.FB.S().orders.length;
    app.clock.restore();
    app.dispose();
    if (!at || at.name !== 'home') throw new Error('boot did not land on home: ' + (at && at.name));
    return orders;
  }

  /* a fresh install */
  boot(null);

  /* navigating repeatedly must keep working: paint() replaces #view and #appbar in
     their parent every time, so the second navigation is the one that catches a
     root that was not reparented */
  (function () {
    const app = harness.loadApp();
    app.clock.set(T0);
    app.run(appSrc);
    const FB = app.FB;
    try {
      harness.addToCart(FB, 'pizzahutch', 1);
      const trail = ['store', 'cart', 'store', 'search', 'orders', 'account', 'home'];
      for (const name of trail) FB.nav.go(name, name === 'store' || name === 'cart' ? { slug: 'pizzahutch' } : {});
      if (FB.nav.current().name !== 'home') throw new Error('a seven-screen walk did not end where it was sent');
      /* and back out again */
      let guard = 0;
      while (FB.nav.depth() > 0 && guard++ < 20) FB.nav.back();
      if (guard >= 20) throw new Error('nav.back() would not unwind the stack');
    } finally { app.clock.restore(); app.dispose(); }
  })();

  /* and a save with an order abandoned a day ago, which is what makes boot do work:
     tracker.resume() catches it up, standing decays, the backlog is synthesised */
  const withOrder = boot((FB, now) => {
    harness.addToCart(FB, 'mcronalds', 2);
    const o = harness.makeOrder(FB, 'mcronalds', { now: now - 86400000 });
    o.etaDrift = 0; o.events = []; o.calc.discounts = [];
    FB.tracker.build(o);
    FB.cart.clear('mcronalds');
    FB.store.set((st) => {
      st.orders.unshift(o);
      st.activeOrderId = o.id;
      st.meta.orderCount = 9;
      st.standing = { points: 12, tier: 2, lastOrderAt: now - 86400000 * 5, decayedThrough: now - 86400000 * 5, seenTier: 2 };
      st.scrip = [{ id: 'b1', amt: 1, at: now - 86400000 * 4 }];
      return st;
    });
  });
  if (!withOrder) throw new Error('the seeded order did not survive boot');

  return 'fresh install and a day-old abandoned order, both reaching home';
});

check('nothing escapes a sheet subtitle twice', () => {
  /* mkOverlay escapes cfg.title and cfg.sub itself, so a caller that pre-escapes
     renders "Colonel Cluckingham&#39;s" as visible entity text. Four of the twenty
     store names carry an escapable character, and the render sweep never opens a
     sheet, so nothing else can see this. */
  const bad = [];
  for (const d of ['js/ui', 'js/sim']) {
    for (const f of fs.readdirSync(path.join(ROOT, d)).filter((x) => x.endsWith('.js'))) {
      codeOnly(fs.readFileSync(path.join(ROOT, d, f), 'utf8')).split('\n').forEach((line, i) => {
        if (/\b(sub|title):\s*[^,]*FB\.esc\(/.test(line)) bad.push(d + '/' + f + ':' + (i + 1));
      });
    }
  }
  if (bad.length) throw new Error('pre-escaped overlay title/sub in: ' + bad.join(', '));

  /* and prove the double-escape really is visible, so this check keeps its point */
  const app = harness.loadApp();
  try {
    const once = app.FB.esc("Colonel Cluckingham's Poultry Compound");
    const twice = app.FB.esc(once);
    if (once === twice) throw new Error('FB.esc is idempotent, so this check guards nothing');
  } finally { app.dispose(); }
  return 'no overlay pre-escapes its own title or subtitle';
});

/* ===================== Slinger Mode ===================== */

check('a run is watched, so it is bounded to a band', () => {
  /* An order is checked in on; a run is sat through, start to finish. At the
     tracker's two seconds a simulated minute that put Dunkinn at 26s and the
     Manufactory at two and a half minutes — too short to hold a countdown and too
     long to hold attention. The twenty are REMAPPED onto a band rather than clamped
     into it, because clamping flattens half of them onto the same number and the
     ordering is worth keeping. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);
    FB.store.reset();
    const bad = [];
    const secs = [];
    let twoDecisions = 0;
    for (const m of FB.missions.ALL) {
      const run = FB.missions.build(m.slug, T);
      if (!run) { bad.push(m.slug + ': no run at all'); continue; }
      const s = run.span / 1000;
      secs.push({ slug: m.slug, s: s, mins: run.minutes });
      if (s < 45 || s > 75) bad.push(m.slug + ' runs ' + s + 's, outside 45-75');
      if (!run.checks.length) bad.push(m.slug + ': a run with nothing to decide');
      if (run.checks.length > 1) twoDecisions++;

      run.checks.forEach(function (c, i) {
        /* every check must be answerable, and answerable before the run is over */
        if (c.at <= run.startAt) bad.push(m.slug + ': ' + c.kind + ' due before the run began');
        if (c.deadline >= run.endAt) bad.push(m.slug + ': ' + c.kind + ' outlives the run');
        const floor = c.kind === 'rule' ? FB.tracker.INCIDENT_MIN_MS : 9000;
        if (c.ms < floor) bad.push(m.slug + ': ' + c.kind + ' offers ' + Math.round(c.ms / 1000) + 's');
        /* and two questions may never be open at once */
        if (i && c.at <= run.checks[i - 1].deadline) {
          bad.push(m.slug + ': two decisions are open at the same time');
        }
      });
    }
    /* the ordering the remap exists to preserve */
    const byTime = secs.slice().sort((a, b) => a.s - b.s);
    const byMins = secs.slice().sort((a, b) => a.mins - b.mins);
    for (let i = 0; i < byTime.length; i++) {
      if (byTime[i].mins !== byMins[i].mins) {
        bad.push('the remap reordered the roster: ' + byTime[i].slug + ' is out of place');
        break;
      }
    }
    if (!twoDecisions) throw new Error('no run anywhere gets a second decision');
    if (twoDecisions === secs.length) throw new Error('every run gets a second decision — the threshold does nothing');
    if (bad.length) throw new Error(bad.length + ' problem(s):\n          ' + bad.slice(0, 6).join('\n          '));
    return secs.length + ' runs, ' + Math.round(byTime[0].s) + '-' + Math.round(byTime[byTime.length - 1].s) +
      's, ' + twoDecisions + ' with a second decision';
  } finally { clock.restore(); app.dispose(); }
});

check('a run is held until the decision in front of it is answered', () => {
  /* What makes it a decision rather than a notification: nothing after a check plays
     while it is pending, and past the deadline it is answered for you — the incident's
     own shape, and the same guard against being answered twice. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);
    FB.store.reset();
    FB.missions.setMode('sling');
    const run = FB.missions.accept('oliveorchard', T);
    if (!run) throw new Error('the run was refused');
    const c = run.checks[0];

    /* before it is due, nothing is pending */
    clock.set(c.at - 1000);
    FB.missions.tick({ catchUp: true });
    if (FB.missions.pending(FB.missions.run(), c.at - 1000)) throw new Error('a decision was pending before it was due');

    /* while it is open the run does not advance past it */
    clock.set(c.at + 1000);
    for (let i = 0; i < 40; i++) FB.missions.tick({ catchUp: true });
    let r = FB.missions.run();
    if (!FB.missions.pending(r, c.at + 1000)) throw new Error('the decision is not pending while it is open');
    const heldAt = r.replayed;
    const past = r.beats.filter((b) => b.at <= c.at).length;
    if (heldAt > past) throw new Error('the run played ' + (heldAt - past) + ' beat(s) past an unanswered decision');

    /* A run is held until the DEADLINE, not forever — past it the answer is made for
       you and the run continues, which is the whole point of the elected branch. So
       the hold has to end exactly there and not before. */
    clock.set(c.deadline - 500);
    for (let i = 0; i < 20; i++) FB.missions.tick({ catchUp: true });
    r = FB.missions.run();
    if (!r) throw new Error('the run finished while its decision was still open');
    if (r.replayed > past) throw new Error('a held run replayed past its decision');
    if (!FB.missions.pending(r, c.deadline - 500)) throw new Error('the decision closed before its deadline');

    /* answered exactly once, and only while open */
    clock.set(c.at + 2000);
    const first = FB.missions.answer('keep');
    if (!first) throw new Error('a decision that was open refused an answer');
    const snap = JSON.stringify(FB.S().slinging.run);
    if (FB.missions.answer('break')) throw new Error('the same decision was answered twice');
    if (JSON.stringify(FB.S().slinging.run) !== snap) throw new Error('a refused answer still wrote');

    /* and past the deadline it is elected, once */
    FB.store.reset();
    FB.missions.setMode('sling');
    const r2 = FB.missions.accept('oliveorchard', T);
    clock.set(r2.checks[0].deadline + 500);
    for (let i = 0; i < 30; i++) FB.missions.tick({ catchUp: true });
    const live = FB.missions.run();
    const row = FB.S().slinging.log[0];
    /* Whichever way the thirty ticks left it: still live, or settled into the log.
       Both paths must show the election — an `(x ? [] : [])` placeholder here once
       made the settled path pass with nothing inspected at all. */
    if (!live && !row) throw new Error('the run neither held nor settled after the deadline');
    const elected = live ? live.checks.filter((x) => x.elected).length : (row.elected ? 1 : 0);
    if (!elected) throw new Error('the deadline passed and nothing was elected (' + (live ? 'live' : 'settled') + ')');
    if (live) {
      const events = live.events.filter((e) => e.text === 'No response was recorded').length;
      if (events !== 1) throw new Error('the election was announced ' + events + ' times');
    }
    return 'held through 60 ticks, answered once, elected once (' + (live ? 'still live' : 'settled') + ')';
  } finally { clock.restore(); app.dispose(); }
});

check('the restaurant moves your standing and the platform moves your pay', () => {
  /* Two axes, kept apart on purpose. A giver's rule is about what they think of you;
     the platform's interruption is about money. Collapsing them would make a run one
     decision made twice. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);

    /* find a run that carries both kinds */
    let slug = null;
    for (const m of FB.missions.ALL) {
      const r = FB.missions.build(m.slug, T);
      if (r.checks.length === 2) { slug = m.slug; break; }
    }
    if (!slug) throw new Error('no run carries both a rule and an interruption');

    function play(ruleAnswer, platAnswer) {
      FB.store.reset();
      FB.missions.setMode('sling');
      const run = FB.missions.accept(slug, T);
      const startPay = run.pay;
      for (const c of run.checks.slice()) {
        clock.set(c.at + 500);
        FB.missions.tick({ catchUp: true });
        FB.missions.answer(c.kind === 'rule' ? ruleAnswer : platAnswer);
      }
      clock.set(run.endAt + 2000);
      for (let i = 0; i < 20; i++) FB.missions.tick({ catchUp: true });
      const st = FB.S();
      return { startPay: startPay, row: st.slinging.log[0], standing: st.slinging.standing[slug] || 0 };
    }

    /* the rule alone must never touch money */
    const a = play('keep', 'keep');
    const b = play('break', 'keep');
    if (!a.row || !b.row) throw new Error('a run did not settle');
    if (a.row.pay !== b.row.pay) {
      throw new Error('keeping the rule paid ' + a.row.pay + ' and breaking it paid ' + b.row.pay);
    }
    if (a.standing <= b.standing) throw new Error('keeping the rule did not stand you better than breaking it');
    eq(a.standing, 1, 'standing after keeping the rule');
    eq(b.standing, -1, 'standing after breaking it');

    /* The separation is a property of the DATA and not only of a branch: a giver's
       rule carries no money at all, and the platform's interruption carries nothing
       else. A kind check alone would be decorative, because the rule copy has no
       price fields for it to guard. */
    for (const m of FB.missions.ALL) {
      /* asserted against the TABLE, not against the copy: copyFor builds a rule from
         an explicit field list, so a price added to a mission would be silently
         dropped on the way out and the separation would look enforced when the data
         had already broken it. */
      if (m.keepPay !== undefined || m.brkPay !== undefined) {
        throw new Error(m.slug + ' attaches a price to a rule the restaurant set');
      }
      const cp = FB.missions.copyFor({ slug: m.slug }, { kind: 'rule' });
      if (cp.keepPay !== undefined || cp.brkPay !== undefined) {
        throw new Error(m.slug + ' leaks a price through copyFor');
      }
      if (!cp.keep || !cp.brk || !cp.kept || !cp.broken) throw new Error(m.slug + ' has an incomplete rule');
    }
    for (const p of FB.missions.INTERRUPTS) {
      if (typeof p.keepPay !== 'number' || typeof p.brkPay !== 'number') {
        throw new Error(p.id + ' does not price both of its answers');
      }
      if (p.keepPay === p.brkPay) throw new Error(p.id + ' costs the same either way');
    }

    /* the interruption alone must never touch standing */
    const c = play('keep', 'break');
    if (c.standing !== a.standing) throw new Error('the platform moved your standing with the restaurant');
    if (c.row.pay === a.row.pay) throw new Error('the platform interruption changed nothing at all');

    /* and the money it moves is itemised on the row rather than conjured */
    if (FB.round2(a.startPay + a.row.adjusted) !== a.row.pay) {
      throw new Error('the pay on the row does not reconcile with the adjustment recorded beside it');
    }
    /* a rule-only run adjusts nothing */
    const short = FB.missions.ALL.filter((m) => FB.missions.build(m.slug, T).checks.length === 1)[0];
    FB.store.reset(); FB.missions.setMode('sling');
    const r = FB.missions.accept(short.slug, T);
    clock.set(r.checks[0].at + 500); FB.missions.tick({ catchUp: true });
    FB.missions.answer('break');
    clock.set(r.endAt + 2000);
    for (let i = 0; i < 20; i++) FB.missions.tick({ catchUp: true });
    eq(FB.S().slinging.log[0].adjusted, 0, 'pay adjusted by a run with no interruption');
    return 'rule ' + a.standing + '/' + b.standing + ' at a flat ' + FB.money(a.row.pay) +
      '; platform ' + FB.money(a.row.adjusted) + ' vs ' + FB.money(c.row.adjusted) + ' at flat standing';
  } finally { clock.restore(); app.dispose(); }
});

check('doing the six a favour costs you work', () => {
  /* The politics, and it is one scalar. Doing what a chain tells you raises your
     standing with the platform; doing one of the six a favour lowers it — and the
     platform decides how much work you are shown. Nobody says any of this out loud. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);
    const chains = FB.missions.ALL.filter((m) => !m.local);
    const locals = FB.missions.ALL.filter((m) => m.local);
    eq(locals.length, 6, 'independents on the roster');
    eq(chains.length + locals.length, 20, 'givers on the roster');

    function play(slug, answer) {
      FB.missions.setMode('sling');
      const run = FB.missions.accept(slug, T);
      if (!run) throw new Error('the run was refused for ' + slug);
      for (const c of run.checks.slice()) {
        clock.set(c.at + 400);
        FB.missions.tick({ catchUp: true });
        FB.missions.answer(answer);
      }
      clock.set(run.endAt + 2000);
      for (let i = 0; i < 20; i++) FB.missions.tick({ catchUp: true });
      clock.set(T);
      return FB.S().slinging.platform;
    }

    FB.store.reset();
    const afterChain = play(chains[0].slug, 'keep');
    if (!(afterChain > 0)) throw new Error('doing what a chain asked did not raise your partner standing');
    const afterFavour = play(locals[0].slug, 'keep');
    if (!(afterFavour < afterChain)) throw new Error('a favour for one of the six cost you nothing');

    /* and the platform expresses it by showing you less */
    const at = [-6, 0, 6].map(function (p) {
      FB.store.set(function (st) { st.slinging.platform = p; return st; });
      return FB.missions.asking(T);
    });
    if (!(at[0] < at[1] && at[1] < at[2])) {
      throw new Error('the board does not respond to your partner standing: ' + at.join(', '));
    }
    if (at[0] < 3) throw new Error('a bad partner standing leaves you with ' + at[0] + ' — that is a wall, not a cost');

    /* the board never offers more than are actually open */
    FB.store.set(function (st) { st.slinging.platform = 99; return st; });
    const board = FB.missions.board(T);
    const asking = board.filter(function (b) { return b.asking; }).length;
    const open = board.filter(function (b) { return b.open; }).length;
    if (asking > open) throw new Error(asking + ' asking against ' + open + ' open');
    if (board.some(function (b) { return b.asking && !b.open; })) throw new Error('a closed restaurant is asking');
    return 'chain +' + afterChain + ', favour ' + afterFavour + ', board ' + at.join('/') + ' by standing';
  } finally { clock.restore(); app.dispose(); }
});

check('the dispatch board is a pure function of the clock', () => {
  /* Scarcity with no new state and no new timer: which givers are asking is seeded on
     FB.world's twenty-minute bucket, so the board turns over on its own, two tabs
     agree about what is on it, and reading it never writes. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);
    FB.store.reset();
    FB.missions.setMode('sling');

    /* Seeded BEFORE the first read, and at both ends. This check used to run entirely
       at standing = {} straight after store.reset(), so every mutation that mixes
       regard into the seed, sorts the rows by it, or reads a clock for a row field
       was a no-op under test and survived. */
    FB.store.set((st) => {
      st.slinging.standing = { goldenwok: 6, sunrisedonut: 4, gyropalace: -6, pandaxpress: -4 };
      return st;
    });

    const key = function (b) { return b.filter(function (x) { return x.asking; }).map(function (x) { return x.slug; }).sort().join(','); };
    const a = key(FB.missions.board(T));
    if (!a) throw new Error('nobody is asking at seven in the evening');

    /* The key above sorts, so it is structurally blind to a reordering. The board is
       MISSIONS.map in declaration order and must stay that way — a list that
       reshuffles under a thumb is the bug CLAUDE.md names. */
    const order = FB.missions.board(T).map((x) => x.slug).join(',');
    const declared = FB.missions.ALL.map((m) => m.slug).join(',');
    if (order !== declared) throw new Error('the board no longer lists the givers in declaration order');

    /* And the key only compares which slugs are asking — it cannot see a row FIELD
       that moved. The WALL CLOCK is advanced between these two reads while the same
       bucket timestamp is passed in: without that, Date.now() returns the same frozen
       value in both calls and a row field reading it is identical in both, so the
       mutant survives a comparison that looks like it covers this. */
    const rowsAtT = JSON.stringify(FB.missions.board(T));
    clock.set(T + 5 * 60000);
    if (JSON.stringify(FB.missions.board(T)) !== rowsAtT) {
      throw new Error('a board row reads a clock other than the bucket it was given');
    }
    clock.set(T);
    if (JSON.stringify(FB.missions.board(T + 60000)) !== rowsAtT) {
      throw new Error('a board row changed inside its own bucket');
    }

    /* REAL GAP this replaces: standing may not change WHO is asking. The count is
       already pinned elsewhere, but membership was not — and biasing which
       restaurants ask is biasing expected earnings, because a run's gross is a fixed
       function of the store ($5.53 at the shortest, $12.35 at the longest). */
    const askingSet = (b) => b.filter((x) => x.asking).map((x) => x.slug).sort().join(',');
    const atZero = (() => {
      FB.store.set((st) => { st.slinging.standing = {}; return st; });
      return askingSet(FB.missions.board(T));
    })();
    /* VARIED, not uniform. Setting every slug to the same number makes a sort by
       standing a stable no-op, so the mutation that orders the pool by regard before
       shuffling survives a check that looks like it covers exactly that. */
    const spreads = [
      { name: 'uniform high', of: () => 6 },
      { name: 'uniform low', of: () => -6 },
      { name: 'alternating', of: (i) => (i % 2 ? 6 : -6) },
      { name: 'graded', of: (i) => (i % 13) - 6 },
    ];
    for (const sp of spreads) {
      FB.store.set((st) => {
        st.slinging.standing = {};
        FB.missions.ALL.forEach((m, i) => { st.slinging.standing[m.slug] = sp.of(i); });
        return st;
      });
      if (askingSet(FB.missions.board(T)) !== atZero) {
        throw new Error('standing changed which restaurants are asking (' + sp.name + ')');
      }
    }
    FB.store.set((st) => {
      st.slinging.standing = { goldenwok: 6, sunrisedonut: 4, gyropalace: -6, pandaxpress: -4 };
      return st;
    });

    /* stable inside the bucket */
    const bucketMs = FB.world.BUCKET_MS;
    if (key(FB.missions.board(T + 60000)) !== a) throw new Error('the board changed inside its own bucket');

    /* and different in the next one — not guaranteed for any single pair, so sweep */
    let moved = 0;
    for (let i = 1; i <= 12; i++) {
      if (key(FB.missions.board(T + i * bucketMs)) !== a) moved++;
    }
    if (!moved) throw new Error('the board never turns over across twelve buckets');

    /* reading it does not write */
    const realSet = FB.store.set;
    let writes = 0;
    FB.store.set = function (fn, o) { writes++; return realSet.call(FB.store, fn, o); };
    try { for (let i = 0; i < 5; i++) FB.missions.board(T); } finally { FB.store.set = realSet; }
    if (writes) throw new Error('reading the board called store.set ' + writes + ' time(s)');

    /* every row is renderable — no undefined store, no NaN duration */
    for (const row of FB.missions.board(T)) {
      if (!row.title || !row.rule) throw new Error(row.slug + ' has no title or no rule');
      if (!(row.seconds > 0) || isNaN(row.seconds)) throw new Error(row.slug + ' has no duration');
      if (!(row.pay > 0) || isNaN(row.pay)) throw new Error(row.slug + ' pays ' + row.pay);
    }
    return moved + ' of 12 buckets differ, ' + FB.missions.board(T).length + ' rows, no writes';
  } finally { clock.restore(); app.dispose(); }
});

check('a run pays, and then the same engine takes most of it back', () => {
  /* fees.js is required at the top with only util.js loaded, so this is the same
     numbers-in/numbers-out contract the $12 -> $60.00 case runs under. */
  const P = (g, a) => FB.fees.payout({ gross: g, access: a });

  /* Every reachable gross: the twenty stores' own pay, and the platform deltas that
     can actually land. A run is 4.10 + minutes * 0.11, and the platform check is only
     PLACED on a span long enough to hold it — which six of the twenty never are — so
     sweeping deltas across all twenty would test grosses the mode cannot produce. */
  const mins = Object.values(MENUS).map(s => Math.round((s.deliveryMin + s.deliveryMax) / 2));
  const DELTAS = [1.10, 0, -0.60, -0.75, -0.85, -1.40, -1.95];
  const grosses = [];
  for (const m of mins) {
    const base = FB.round2(4.10 + m * 0.11);
    grosses.push(base);
    if (m >= 40) for (const d of DELTAS) grosses.push(FB.round2(Math.max(0, base + d)));
  }

  let paidOut = 0, zeroed = 0;
  for (const g of grosses) {
    for (const access of [false, true]) {
      const p = P(g, access);
      /* A statement may never pay out less than nothing, and may never invent money. */
      if (p.net < 0) throw new Error('net ' + p.net + ' at gross ' + g + (access ? ' (access)' : ''));
      if (p.net > g + 0.004) throw new Error('net ' + p.net + ' exceeds gross ' + g);
      if (isNaN(p.net) || isNaN(p.deductionsTotal)) throw new Error('NaN at gross ' + g);
      /* THE RECONCILIATION, as an equality. An inequality survives a dropped row;
         this does not. Every row the statement prints must telescope to the gap
         between what was earned and what was paid. */
      const printed = FB.round2(p.lines.reduce((t, l) => t + l.amount, 0) + (p.settlement ? p.settlement.amount : 0));
      if (printed !== FB.round2(p.gross - p.net)) {
        throw new Error('rows sum to ' + printed + ' but gross - net is ' + FB.round2(p.gross - p.net) + ' at ' + g);
      }
      /* and the income row is the gross, not a restated one */
      if (p.incomeLine.amount !== p.gross) throw new Error('income row ' + p.incomeLine.amount + ' != gross ' + p.gross);
      if (p.net > 0.004) paidOut++; else zeroed++;
    }
  }
  /* The mode's money must not be a constant. A table that lands every statement on
     $0.00 makes every one of these rows unobservable, and no mutation to any amount
     could ever be caught. Both outcomes have to be reachable. */
  if (!paidOut) throw new Error('no reachable run ever pays out — the deduction table is inert');
  if (!zeroed) throw new Error('no reachable run is ever zeroed');

  /* The break-even is straddled by two ADJACENT real stores, so it is pinned from
     both sides on grosses the board actually offers: pizzahutch $9.38 falls under it
     and entirefoods $9.93 clears it. Pinning one side only cannot see the line move. */
  const be = P(10, false).breakEven;
  eq(be, 9.49, 'ordinary break-even');
  eq(P(9.38, false).net, 0, 'pizzahutch nets nothing');
  eq(P(9.93, false).net, 0.42, 'entirefoods clears the line');
  /* and the access-day break-even is solved in the OTHER regime — above it the
     Service Fee has stopped being its floor, so a single-regime solve is wrong here */
  eq(P(10, true).breakEven, 43.13, 'access break-even');
  eq(P(43.13, true).netPre, 0, 'the access break-even actually zeroes');

  /* Strictly more gross, strictly more taken. Halving every amount in the table
     survives a check that only pins the ends. */
  if (!(P(20, false).deductionsGross > P(10, false).deductionsGross)) throw new Error('deductions do not rise with pay');
  if (!(P(10, true).deductionsGross > P(10, false).deductionsGross)) throw new Error('the access block costs nothing');

  /* BangBux are granted by the SAME formula compute grants them by, against the
     deduction stack — which is monotone. Granting on the shortfall instead put a
     cliff at $25.00 of it, so the best-paid run in the app was the only one
     compensated with nothing. */
  let last = -1;
  for (const g of grosses.slice().sort((a, b) => a - b)) {
    const sc = P(g, true).scrip;
    if (sc < last) throw new Error('BangBux fall as pay rises, at gross ' + g);
    last = sc;
  }
  eq(P(12.35, true).scrip, 1, 'the best run is still settled');
  eq(P(5.53, true).scrip, 1, 'and so is the worst');
  eq(P(12.35, false).scrip, 0, 'nothing to settle when it pays out');

  /* TWO AXES. payout takes a gross and a flag and NOTHING else, so a restaurant's
     rule cannot reach pay through it. Asserted against the signature rather than
     against the branch that calls it: fields naming the other axis are ignored. */
  const plain = P(9.93, false);
  const smuggled = FB.fees.payout({ gross: 9.93, access: false, outcome: 'broken', slug: 'dunkinn', standingTier: 4, tier: 4, standing: -9 });
  eq(smuggled.net, plain.net, 'standing reached the pay axis');
  eq(smuggled.deductionsTotal, plain.deductionsTotal, 'standing reached the deductions');
  /* the Standing Maintenance Fee is on the statement, and is pinned to tier 1 */
  const stand = P(9.93, true).lines.filter(l => l.id === 'standing')[0];
  if (!stand) throw new Error('no Standing Maintenance Fee on an access statement');
  eq(stand.amount, FB.fees.STANDING_UPKEEP[1], 'the clearance advanced');

  /* Every amount except the Tip Processing Fee is the customer's own price, read off
     the same tables — that is what makes the (?) show the same sentence beside the
     same number on both documents. */
  const byId = {};
  P(9.93, true).lines.forEach(l => { byId[l.id] = l.amount; });
  eq(byId.bag, 0.35, 'bag');
  eq(byId.handle, 0.60, 'handle');
  eq(byId.thermal, 1.60, 'thermal');
  eq(byId.labor, 2.25, 'emotional labor');
  eq(byId.pickupA, 3.75, 'retrieval');
  eq(byId.pickupB, 2.20, 'deployment');
  eq(byId.service, FB.round2(Math.max(3.99, 9.93 * 0.185)), 'service, same floor');
  eq(byId.fx, FB.round2(9.93 * 0.025), 'fx, same rate');
  /* Peak Demand lands on the whole stack, in the same position as on a receipt */
  const stack = FB.round2(P(9.93, true).lines.filter(l => l.id !== 'peak').reduce((t, l) => t + l.amount, 0));
  eq(byId.peak, FB.round2(stack * 0.4), 'peak on the whole stack');

  /* The access block is a LOCAL calendar day. Stamped from the run's end, so a
     catch-up books the day it ended on rather than the day it was noticed. */
  const d1 = new Date(2026, 7, 20, 23, 30, 0).getTime();
  const d2 = new Date(2026, 7, 21, 0, 30, 0).getTime();
  if (FB.fees.accessDue(d1, d1 + 60000)) throw new Error('access charged twice in one day');
  if (!FB.fees.accessDue(d1, d2)) throw new Error('access not charged on a new day');
  if (!FB.fees.accessDue(null, d1)) throw new Error('the first statement ever must charge access');

  return grosses.length + ' reachable grosses, ' + paidOut + ' pay out and ' + zeroed +
    ' are zeroed; break-even $' + be.toFixed(2);
});

check('the pay statement and the receipt explain themselves with one sentence', () => {
  /* The whole point of reusing the ids: the (?) on a deduction opens the paragraph
     the customer already read. If a future edit gives the pay statement its own
     copy of a sentence, this goes red. */
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    clock.set(new Date(2026, 7, 20, 19, 14, 0).getTime());
    FB.store.reset();
    const p = FB.fees.payout({ gross: 9.93, access: true });
    const html = FB.C.statement(p);
    /* every row that carries a (?) must resolve to a real sentence */
    const ids = [...html.matchAll(/data-why="([a-zA-Z0-9]+)"/g)].map(m => m[1]);
    if (ids.length < 15) throw new Error('only ' + ids.length + ' rows are explainable');
    for (const id of ids) {
      if (!FB.FEE_WHY[id]) throw new Error('the statement offers an explanation for ' + id + ' and there is none');
    }
    /* the two the app had never charged anybody are now both live */
    if (!ids.includes('other')) throw new Error('the income row does not carry its explanation');
    if (!ids.includes('tip')) throw new Error('the Tip Processing Fee is not on the statement');
    /* deductions are drawn with a minus by the RENDERER: line() writes a `kind` that
       nothing in this app reads, so a row cannot be trusted to know its own sign */
    if (!html.includes('−')) throw new Error('the deductions are not signed');
    /* and the statement says what it netted */
    if (!html.includes('Net Pay')) throw new Error('the statement does not total');
    if (/undefined|NaN/.test(html)) throw new Error('the statement prints undefined or NaN');

    /* A LOG ROW WRITTEN BEFORE ANY OF THIS EXISTED. fillDefaults backfills every key
       a save is missing at any depth, but an array in a save is the user's data and
       is never merged into — so a row from an older build carries no net, no access
       and no deducted, and the screen still has to draw it. */
    FB.store.set((st) => {
      st.mode = 'sling';
      st.slinging.log = [{ id: 'run_legacy', slug: 'oliveorchard', title: 'An older run',
        at: Date.now() - 60000, outcome: 'kept', elected: true, pay: 10.48, adjusted: 0,
        local: false, platform: 1 }];
      return st;
    });
    const legacy = FB.screens.get('run').render({});
    if (/undefined|NaN/.test(legacy)) throw new Error('an old log row prints undefined or NaN');
    if (!legacy.includes('Net Pay')) throw new Error('an old log row does not draw a statement');
    /* and it must NOT claim the schedule changed — it never had a net to disagree with */
    if (legacy.includes('no longer in effect')) throw new Error('an old row was reported as a changed schedule');

    return ids.length + ' explainable rows, all shared with the receipt; an old row still draws';
  } finally { app.dispose(); }
});

check('the statement is what gets booked, and access is charged by the day the run ended', () => {
  /* payout() being right is not the same as settle() BOOKING it. This drives real
     runs through the ticker and reads the ledgers back. */
  const app = harness.loadApp();
  const { FB, clock } = app;
  try {
    const day1 = new Date(2026, 7, 20, 22, 0, 0).getTime();

    function finish(slug, at) {
      const run = FB.missions.accept(slug, at);
      clock.set(run.endAt + 2000);
      for (let i = 0; i < 30; i++) FB.missions.tick({ catchUp: true });
      return FB.S().slinging.log[0];
    }

    clock.set(day1);
    FB.store.reset();
    FB.missions.setMode('sling');

    /* first statement of the day carries the access block and is zeroed by it */
    const a = finish('manufactory', day1);
    if (!a) throw new Error('the first run did not settle');
    if (!a.access) throw new Error('the first statement of a day did not charge access');
    const pa = FB.fees.payout({ gross: a.pay, access: true });
    eq(a.net, pa.net, 'the row froze a net the engine does not agree with');
    eq(a.deducted, pa.deductionsTotal, 'the row froze the wrong deductions');
    eq(a.net, 0, 'an access statement paid out');

    /* second run the same day: no access block, and it is the one that pays */
    let st = FB.S();
    const earnedAfterA = st.slinging.earned;
    eq(earnedAfterA, 0, 'the ledger booked something on a statement that paid nothing');
    const b = finish('manufactory', FB.S().slinging.accessAt + 60000);
    if (b.access) throw new Error('access was charged twice in one day');
    const pb = FB.fees.payout({ gross: b.pay, access: false });
    eq(b.net, pb.net, 'the second row froze the wrong net');
    if (!(b.net > 0)) throw new Error('an ordinary run on the best store still paid nothing');

    /* THE LEDGERS. `earned` is what was PAID — booking the gross here is the whole
       failure this feature exists to fix, and it is invisible from payout() alone. */
    st = FB.S();
    const rows = st.slinging.log;
    const netSum = FB.round2(rows.reduce((t, r) => t + r.net, 0));
    const grossSum = FB.round2(rows.reduce((t, r) => t + r.pay, 0));
    eq(st.slinging.earned, netSum, 'earned does not equal the statements');
    if (st.slinging.earned === grossSum) throw new Error('earned is the gross — the deductions were never booked');
    eq(st.slinging.deducted, FB.round2(rows.reduce((t, r) => t + r.deducted, 0)), 'deducted does not equal the statements');
    /* and the two must reconcile against the gross the runs advertised */
    eq(FB.round2(st.slinging.earned + st.slinging.deducted), grossSum, 'paid + deducted is not the gross');

    /* ACCESS IS STAMPED FROM THE RUN, NOT THE WALL CLOCK. A run that ended before
       midnight but is settled after it belongs to the day it ended on — the same
       rule the tracker replays beats under. Stamping Date.now() charges the access
       block twice for one day, on the catch-up path nobody is present for. */
    clock.set(day1);
    FB.store.reset();
    FB.missions.setMode('sling');
    const first = finish('dunkinn', new Date(2026, 7, 20, 22, 0, 0).getTime());
    if (!first.access) throw new Error('the first statement did not charge access');
    /* a run that ends at 23:50, replayed at 01:00 the next day */
    const late = new Date(2026, 7, 20, 23, 50, 0).getTime();
    const run = FB.missions.accept('dunkinn', late);
    clock.set(new Date(2026, 7, 21, 1, 0, 0).getTime());
    for (let i = 0; i < 30; i++) FB.missions.tick({ catchUp: true });
    const c = FB.S().slinging.log[0];
    if (c.access) throw new Error('a run that ended yesterday charged today its access block');
    if (c.at !== run.endAt) throw new Error('the row was stamped when it was noticed, not when it happened');

    /* and a run that genuinely ends on the next day charges it again */
    const d = finish('dunkinn', new Date(2026, 7, 21, 9, 0, 0).getTime());
    if (!d.access) throw new Error('a new day did not charge its access block');

    return rows.length + ' statements booked; paid $' + st.slinging.earned.toFixed(2) +
      ' of $' + grossSum.toFixed(2) + ' gross';
  } finally { app.dispose(); }
});

check('a screen that offers an explanation is wired to give one', () => {
  /* The (?) is delegated per-container by C.wireWhy, so a screen can render fifteen
     of them and hand back nothing when they are tapped. It fails silently in the
     worst way: app.js delegates the "Read The Fees" achievement on DOCUMENT, so the
     tap fires a toast and looks handled while no explanation ever opens. Checked
     generically — any future screen that renders one is covered without being named. */
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const offenders = [];
    for (const [hourName, ts] of [['dinner', new Date(2026, 7, 20, 19, 14, 0).getTime()]]) {
      clock.set(ts);
      for (const fx of harness.FIXTURES) {
        FB.store.reset();
        let params;
        try { params = fx.apply(FB, ts) || {}; } catch (e) { continue; }
        for (const name of FB.screens.list()) {
          const def = FB.screens.get(name);
          if (!def.render) continue;
          const p = harness.paramsFor(name, params);
          let html;
          try { html = def.render(p); } catch (e) { continue; }
          if (!/data-why=/.test(html)) continue;
          /* it renders one — mounting it must wire one */
          let wired = 0;
          const real = FB.C.wireWhy;
          FB.C.wireWhy = function (r) { wired++; return real.apply(this, arguments); };
          try { if (def.mount) def.mount(app.doc.querySelector('#view'), p); }
          catch (e) { /* a mount that throws is the render sweep's problem, not this one */ }
          finally { FB.C.wireWhy = real; }
          if (!wired) offenders.push(hourName + ' / ' + fx.name + ' / ' + name);
        }
      }
    }
    if (offenders.length) {
      throw new Error('renders a (?) and never wires it: ' + offenders.join(', '));
    }
    return 'every screen offering an explanation wires it';
  } finally { app.dispose(); }
});

check('a restaurant remembers you, and it can only ever change how it talks', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    clock.set(new Date(2026, 7, 20, 19, 0, 0).getTime());
    FB.store.reset();

    /* THE BANDS. Pure arithmetic on an integer — no slug, no state. */
    const R = FB.missions.regardOf;
    eq(R(0), 'plain', 'nobody at zero'); eq(R(2), 'plain', 'two is not known');
    eq(R(3), 'known', 'three is'); eq(R(-2), 'plain', 'minus two is not cold');
    eq(R(-3), 'cold', 'minus three is'); eq(R(undefined), 'plain', 'a missing entry');

    /* THE CLAMP is what stops a hole deeper than the climb out of it. */
    eq(FB.missions.nextStanding(6, true), 6, 'the ceiling holds');
    eq(FB.missions.nextStanding(-6, false), -6, 'the floor holds');
    eq(FB.missions.nextStanding(-40, true), -6, 'a pre-cap save heals toward the cap');
    if (R(-40) !== 'cold') throw new Error('a pre-cap save does not read as cold');

    /* THE DATA CANNOT HOLD A PRICE. Asserted against the TABLE — the same way the
       two-axis check asserts keepPay/brkPay against the mission table rather than
       against the branch that reads it, because a price written into the data would
       otherwise be silently dropped on the way out and the separation would look
       enforced when the data had already broken. */
    let variants = 0, strings = 0;
    for (const m of FB.missions.ALL) {
      if (!m.voice) continue;
      for (const band of Object.keys(m.voice)) {
        if (band !== 'known' && band !== 'cold') throw new Error(m.slug + ' carries a band called ' + band);
        variants++;
        const v = m.voice[band];
        for (const k of Object.keys(v)) {
          if (/pay|price|fee|cost|scrip|bux|amount|total/i.test(k)) {
            throw new Error(m.slug + '.' + band + ' carries a money field: ' + k);
          }
          const val = v[k];
          const list = Array.isArray(val) ? val : [val];
          for (const x of list) {
            if (typeof x !== 'string') throw new Error(m.slug + '.' + band + '.' + k + ' is not a string');
            if (!x.length) throw new Error(m.slug + '.' + band + '.' + k + ' is empty');
            strings++;
          }
        }
        if (v.prompt && v.prompt.length !== 2) throw new Error(m.slug + '.' + band + '.prompt is not two lines');
        for (const k of ['keep', 'brk']) {
          if (v[k] && v[k].length !== 2) throw new Error(m.slug + '.' + band + '.' + k + ' is not a label and a sub');
        }
      }
    }
    if (variants < 20) throw new Error('only ' + variants + ' voice variants exist');
    /* The PAY table carries no voice at all. A restaurant's variant block was once
       pasted onto the first interrupt — inert, because copyFor's platform branch
       never looks for one, and invisible, because this sweep walked ALL only. */
    for (const p of FB.missions.INTERRUPTS) {
      if (p.voice) throw new Error('interrupt ' + p.id + ' carries a voice block — that is a restaurant register on the pay axis');
      if (typeof p.keepPay !== 'number' || typeof p.brkPay !== 'number') throw new Error('interrupt ' + p.id + ' is not priced');
    }

    /* THE RULE NEVER VARIES. It is drawn from live state on the card, from live state
       on the sheet and from the stamped run mid-run; a varying rule lets those three
       disagree with each other. */
    for (const m of FB.missions.ALL) {
      if (!m.voice) continue;
      for (const band of ['known', 'cold']) {
        const v = m.voice[band];
        if (v && v.rule) throw new Error(m.slug + ' varies its rule at ' + band);
      }
    }

    /* THE COPY ACTUALLY REACHES THE SHEET, and off the run's STAMPED band. */
    const run = { slug: 'goldenwok', regard: 'known' };
    const c = { kind: 'rule' };
    const known = FB.missions.copyFor(run, c);
    const plain = FB.missions.copyFor({ slug: 'goldenwok', regard: 'plain' }, c);
    const cold = FB.missions.copyFor({ slug: 'goldenwok', regard: 'cold' }, c);
    /* Compared as a PAIR, not on the title: a variant is allowed to keep the opening
       line and move only the body — at Golden Wok the situation is identical at every
       band and only the pressure changes, which is the better piece of writing. */
    const sheet = (x) => x.title + '\u0000' + x.body;
    if (sheet(known) === sheet(plain)) throw new Error('a known restaurant puts it to you the same way');
    if (sheet(cold) === sheet(plain)) throw new Error('a cold restaurant puts it to you the same way');
    /* every variant must move SOMETHING, or it is a table of duplicated base copy */
    for (const m of FB.missions.ALL) {
      if (!m.voice) continue;
      for (const band of ['known', 'cold']) {
        if (!m.voice[band]) continue;
        const v = FB.missions.copyFor({ slug: m.slug, regard: band }, c);
        const b = FB.missions.copyFor({ slug: m.slug, regard: 'plain' }, c);
        if (sheet(v) === sheet(b) && v.kept === b.kept && v.broken === b.broken) {
          throw new Error(m.slug + '.' + band + ' is identical to its base copy');
        }
      }
    }
    eq(known.rule, plain.rule, 'the rule moved');
    eq(cold.rule, plain.rule, 'the rule moved at cold');

    /* REGARD MAY REMOVE A GATE. IT MAY NEVER ADD ONE — there is no band at which the
       compliant answer becomes unavailable, so the ladder is always climbable from
       wherever you are standing. Golden Wok is the only giver carrying needsBrief. */
    eq(plain.needsBrief, true, 'the briefing gate');
    eq(known.needsBrief, false, 'a regular still sits through the briefing');
    eq(cold.needsBrief, true, 'cold invented a gate');
    for (const m of FB.missions.ALL) {
      for (const band of ['known', 'plain', 'cold']) {
        const cp = FB.missions.copyFor({ slug: m.slug, regard: band }, c);
        if (!cp.keep || !cp.keep[0]) throw new Error(m.slug + ' has no compliant answer at ' + band);
        if (!m.needsBrief && cp.needsBrief) throw new Error(m.slug + ' acquired a briefing gate at ' + band);
      }
    }

    /* A STUB WITH NO BAND — the two-axis check passes exactly this — reads plain and
       gets complete base copy. */
    const stub = FB.missions.copyFor({ slug: 'goldenwok' }, c);
    eq(stub.title, plain.title, 'a run with no band is not plain');

    /* AND IT CARRIES NO PRICE OUT. */
    for (const band of ['known', 'plain', 'cold']) {
      const cp = FB.missions.copyFor({ slug: 'goldenwok', regard: band }, c);
      for (const k of Object.keys(cp)) {
        if (/pay|price|fee|cost/i.test(k)) throw new Error('the rule branch returned ' + k);
      }
    }
    return variants + ' variants, ' + strings + ' strings, no rule and no price varies';
  } finally { app.dispose(); }
});

check('what a restaurant thinks of you never changes what it pays or how many ask', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);

    /* HOW MANY ASK is the PLATFORM's, and standing must be unable to move it. The
       mutant this exists for — adding a standing term to asking() — survived every
       check in this file before it was written. */
    const seed = (v) => {
      FB.store.reset();
      FB.missions.setMode('sling');
      FB.store.set((st) => {
        st.slinging.standing = {};
        FB.missions.ALL.forEach((m) => { st.slinging.standing[m.slug] = v; });
        return st;
      });
    };
    seed(0); const base = FB.missions.asking(T);
    seed(6); const high = FB.missions.asking(T);
    seed(-6); const low = FB.missions.asking(T);
    eq(high, base, 'being known moved how many restaurants are asking');
    eq(low, base, 'being on file moved how many restaurants are asking');
    /* and it still moves with the thing that owns it */
    FB.store.set((st) => { st.slinging.platform = 6; return st; });
    const withPlat = FB.missions.asking(T);
    FB.store.set((st) => { st.slinging.platform = -6; return st; });
    if (withPlat === FB.missions.asking(T)) throw new Error('asking() stopped answering to the platform');

    /* WHAT IT PAYS. Same run, same store, swept across the whole ladder. */
    seed(0);
    const pays = new Set();
    for (const v of [-6, -3, -1, 0, 1, 3, 6]) {
      seed(v);
      const r = FB.missions.build('goldenwok', T);
      pays.add(r.pay);
      if (FB.missions.regardOf(v) !== r.regard) throw new Error('the run stamped the wrong band at ' + v);
      /* a run carries no price fields per band, and the band is a STRING — it cannot
         be an argument to the slice() that decides the count */
      if (typeof r.regard !== 'string') throw new Error('the band is not a string');
    }
    if (pays.size !== 1) throw new Error('a run paid ' + [...pays].join(' / ') + ' depending on standing');

    /* AND THE LADDER IS CLIMBABLE FROM THE FLOOR. Ten broken runs land on the cap,
       the compliant answer is still offered there, and one kept run moves it. */
    seed(0);
    let n = 0;
    for (let i = 0; i < 10; i++) n = FB.missions.nextStanding(n, false);
    eq(n, -6, 'ten broken runs');
    const atFloor = FB.missions.copyFor({ slug: 'goldenwok', regard: FB.missions.regardOf(n) }, { kind: 'rule' });
    if (!atFloor.keep || !atFloor.keep[0]) throw new Error('no way back from the floor');
    eq(FB.missions.nextStanding(n, true), -5, 'the floor is not sticky');
    return 'asking() flat across the ladder, pay flat across the ladder, floor climbable';
  } finally { app.dispose(); }
});

check('the photograph answers to the delivery, and every one of them is on disk', () => {
  /* fees.js-style: proof.js is pure and reaches for nothing but util.js, so it can be
     required headlessly and swept without a realm. */
  const P = FB.proof;
  if (!P) throw new Error('js/core/proof.js did not load');

  /* EVERY FILE EXISTS. An <img> onto a missing asset fails silently to a grey box,
     and the artifact build keys its inlined map by exactly these strings — a path
     that is right on disk but written any other way breaks only in the artifact. */
  for (const row of P.POOL) {
    if (!/^assets\/app\//.test(row.file)) throw new Error('not a root-relative asset path: ' + row.file);
    if (!fs.existsSync(path.join(ROOT, row.file))) throw new Error('missing proof photo: ' + row.file);
  }

  /* THE THERMAL BAG IS NOT LEFT BEHIND. A courier keeps it, so the one legacy
     photograph that shows one abandoned on a walkway is deliberately out of the
     pool. Asserted by name: dropping the rule would put it back silently. */
  if (P.POOL.some((r) => /proof-delivery-2\.webp$/.test(r.file))) {
    throw new Error('the thermal-bag photograph is back in the pool');
  }

  /* EVERY BUCKET IS POPULATED, or the widening fallback quietly hides an empty one
     and a whole facet of the app stops meaning anything. */
  const buckets = {};
  for (const d of ['leave', 'hand']) {
    for (const l of ['day', 'dusk', 'night']) {
      const n = P.POOL.filter((r) => r.drop === d && r.light === l).length;
      if (n < 3) throw new Error('only ' + n + ' photographs for ' + d + '/' + l);
      buckets[d + '/' + l] = n;
    }
  }

  /* THE STRANGE ONES ARE THE POINT. They are also the first thing an editor trims,
     so the share is pinned rather than left to drift. Read off the TIER, which
     replaced the old `odd` boolean: anything filed above ROUTINE is strange, and the
     tier already has to be right for the loot curve. One field, not two that drift. */
  const odd = P.POOL.filter((r) => r.tier && r.tier !== 'routine').length;
  if (odd / P.POOL.length < 0.5) throw new Error('only ' + odd + ' of ' + P.POOL.length + ' are strange');

  /* THE FACETS ARE READ OFF THE ORDER. Light comes from the hour it was delivered,
     drop from the address — both of which this screen had all along and never asked. */
  const mk = (id, drop, hour) => ({
    id: id, address: { dropoff: drop },
    deliveredAt: new Date(2026, 7, 20, hour, 0, 0).getTime(),
  });
  eq(P.facets(mk('x', 'leave', 12)).light, 'day', 'noon');
  eq(P.facets(mk('x', 'leave', 18)).light, 'dusk', 'six');
  eq(P.facets(mk('x', 'leave', 2)).light, 'night', 'two in the morning');
  eq(P.facets(mk('x', 'hand', 12)).drop, 'hand', 'a hand-off');
  eq(P.facets(mk('x', 'leave', 12)).drop, 'leave', 'a doorstep');
  /* an order with no address at all is a doorstep, which is what the legacy
     photographs already were */
  eq(P.facets({ id: 'legacy' }).drop, 'leave', 'a legacy order');

  /* WHAT IS PICKED MATCHES WHAT WAS ASKED FOR. */
  for (const d of ['leave', 'hand']) {
    for (const [h, l] of [[12, 'day'], [18, 'dusk'], [2, 'night']]) {
      const o = mk('o' + d + h, d, h);
      const file = P.pick(o);
      const row = P.POOL.filter((r) => r.file === file)[0];
      if (!row) throw new Error('picked a photograph that is not in the pool: ' + file);
      if (row.drop !== d || row.light !== l) {
        throw new Error(d + '/' + l + ' was answered with a ' + row.drop + '/' + row.light + ' photograph');
      }
    }
  }

  /* SEEDED, so the photograph attached to an order is that order's forever — the
     receipt a year later shows the same picture. Never Math.random(). */
  const o = mk('stable', 'leave', 3);
  const first = P.pick(o);
  for (let i = 0; i < 20; i++) if (P.pick(o) !== first) throw new Error('the photograph changed under a reload');

  /* AND THE WHOLE POOL IS REACHABLE. A hash that collides onto a handful of rows
     would leave most of these on disk and never on screen — which is the bug this
     feature exists to fix, reintroduced one level down. */
  const used = new Set();
  /* Enough orders to outrun the structural spread. Photographs are NOT equally
     likely here — `day` covers ten hours against dusk's five and the buckets differ
     in size, so about 3x end to end — and that is correct: a customer sees one
     photograph per order. What must hold is that none is unreachable, which is the
     collapsed-hash bug this catches. */
  for (let i = 0; i < 3000; i++) used.add(P.pick(mk('ord' + i, i % 2 ? 'hand' : 'leave', (i * 7) % 24)));
  if (used.size !== P.POOL.length) {
    throw new Error('only ' + used.size + ' of ' + P.POOL.length + ' photographs are ever chosen');
  }

  return P.POOL.length + ' photographs, ' + odd + ' strange, ' + JSON.stringify(buckets);
});

check('a delivery photograph is loot, and the odds are the tier table', () => {
  const P = FB.proof;

  /* EVERY ROW IS FILED. A row with no tier, or a tier not in the table, would be
     unreachable by roll() forever — on disk, in the artifact, and never once seen. */
  const keys = P.TIERS.map((t) => t.key);
  for (const row of P.POOL) {
    if (!row.tier) throw new Error('no tier on ' + row.file);
    if (keys.indexOf(row.tier) < 0) throw new Error(row.file + ' is filed under ' + row.tier);
  }
  /* and every tier has something in it, or its share of the curve silently falls
     through to the tier below and the rarest photographs stop existing */
  for (const t of P.TIERS) {
    if (!P.inTier(t.key).length) throw new Error('nothing is filed as ' + t.label);
  }

  /* THE WEIGHTS ARE THE ODDS. They are tier-level and sum to 100 on purpose: adding
     six more legendaries must not make legendaries commoner. */
  const sum = P.TIERS.reduce((a, t) => a + t.weight, 0);
  if (Math.abs(sum - 100) > 0.001) throw new Error('the tier weights sum to ' + sum + ', not 100');

  /* OBSERVED MATCHES DECLARED. FB.seeded is deterministic, so this sample is fixed —
     a re-weighted tier moves it and cannot be blamed on luck. */
  const N = 20000, seen = {};
  for (let i = 0; i < N; i++) {
    const r = P.roll('run_' + i);
    if (!r || !r.file || !r.tier) throw new Error('a roll returned nothing at ' + i);
    if (!P.POOL.some((x) => x.file === r.file)) throw new Error('rolled a photograph outside the pool');
    seen[r.tier] = (seen[r.tier] || 0) + 1;
  }
  const obs = {};
  for (const t of P.TIERS) {
    const pct = ((seen[t.key] || 0) / N) * 100;
    obs[t.label] = Number(pct.toFixed(2));
    /* 20% relative, which a swapped or halved weight cannot survive */
    if (Math.abs(pct - t.weight) > t.weight * 0.2) {
      throw new Error(t.label + ' came up ' + pct.toFixed(2) + '% against a declared ' + t.weight + '%');
    }
  }
  /* the curve must actually descend, or "rarity" means nothing */
  for (let i = 1; i < P.TIERS.length; i++) {
    if (!(seen[P.TIERS[i - 1].key] > seen[P.TIERS[i].key])) {
      throw new Error(P.TIERS[i].label + ' is not rarer than ' + P.TIERS[i - 1].label);
    }
  }

  /* SEEDED. The photograph a run yields was decided when the run existed: pressing
     the button reveals it. Re-rolling on reload would make the rarest ones farmable
     by refreshing, which is the whole reason this is not Math.random(). */
  const a = P.roll('run_zzz');
  for (let i = 0; i < 50; i++) {
    const b = P.roll('run_zzz');
    if (b.file !== a.file || b.tier !== a.tier) throw new Error('the same run rolled twice');
  }
  /* and different runs really do differ */
  const distinct = new Set();
  for (let i = 0; i < 400; i++) distinct.add(P.roll('r' + i).file);
  if (distinct.size < 20) throw new Error('only ' + distinct.size + ' photographs are reachable by rolling');

  return P.POOL.length + ' photographs; observed ' + JSON.stringify(obs);
});

check('the courier keeps what they photograph, and only once', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const now = new Date(2026, 7, 20, 19, 14, 0).getTime();
    clock.set(now);
    FB.store.reset();
    harness.FIXTURES.find((f) => f.name === 'slinging, statement issued').apply(FB, now);

    const row = FB.S().slinging.log[0];
    if (!row) throw new Error('the fixture did not settle a run');

    /* the button is offered before, and gone after */
    if (!FB.screens.get('run').render({}).includes('data-shoot')) {
      throw new Error('no way to photograph the drop');
    }
    const shot = FB.missions.shoot(row.id);
    if (!shot || !shot.file || !shot.tier) throw new Error('shooting returned nothing');

    let st = FB.S();
    eq(st.slinging.shots, 1, 'shots taken');
    eq(st.slinging.gallery.length, 1, 'photographs kept');
    eq(st.slinging.gallery[0], shot.file, 'the wrong photograph was kept');
    eq(st.slinging.log[0].shot.file, shot.file, 'the row did not keep it');

    const html = FB.screens.get('run').render({});
    if (html.includes('data-shoot')) throw new Error('it can be photographed twice');
    if (!html.includes(shot.file)) throw new Error('the photograph is not shown');
    if (!html.includes(FB.proof.tier(shot.tier).label)) throw new Error('the filing category is not shown');
    if (/undefined|NaN/.test(html)) throw new Error('the photograph block prints undefined or NaN');

    /* ONCE. Two taps, a double-fire, or a replayed row must not mint a second one —
       the guard is on the row, not on the button. */
    if (FB.missions.shoot(row.id) !== null) throw new Error('a second photograph was taken');
    st = FB.S();
    eq(st.slinging.shots, 1, 'shots after a second attempt');
    eq(st.slinging.gallery.length, 1, 'gallery after a second attempt');

    /* the same run always yields the same photograph, so the row and a fresh roll
       can never disagree */
    eq(FB.proof.roll(row.id).file, shot.file, 'the roll drifted from the row');

    /* THE GALLERY DOES NOT DOUBLE-COUNT. A photograph seen twice is one photograph
       KEPT and two TAKEN — the collection is a set, the shot counter is not.

       The duplicate has to be forced: a fresh run id rolls its own photograph, so a
       naive second shot almost never collides and a check written that way passes
       with the guard deleted. This seeds the gallery with exactly what run_dupe is
       going to roll, which is knowable in advance precisely because the roll is
       seeded on the id. */
    const willRoll = FB.proof.roll('run_dupe').file;
    FB.store.set((s2) => {
      s2.slinging.log.unshift({ id: 'run_dupe', slug: row.slug, title: row.title, at: row.at,
        outcome: 'kept', pay: 1, net: 0, deducted: 1, access: false });
      if (s2.slinging.gallery.indexOf(willRoll) < 0) s2.slinging.gallery.push(willRoll);
      return s2;
    });
    const before = FB.S().slinging.gallery.length;
    const dupe = FB.missions.shoot('run_dupe');
    eq(dupe.file, willRoll, 'run_dupe did not roll what the roll said it would');
    st = FB.S();
    eq(st.slinging.shots, 2, 'a second run was photographed');
    eq(st.slinging.gallery.length, before, 'the gallery kept the same photograph twice');

    return 'kept ' + st.slinging.gallery.length + ' of ' + FB.proof.POOL.length + ' across ' + st.slinging.shots + ' shots';
  } finally { app.dispose(); }
});

check('every tab names a screen, and the record of work shows the photographs', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const now = new Date(2026, 7, 20, 19, 14, 0).getTime();
    clock.set(now);

    /* EVERY TAB ID NAMES A REGISTERED SCREEN. nav.tab(id) sets current.name to the id
       directly, so a tab pointing at nothing navigates to a screen that does not
       exist. CLAUDE.md has stated this since the mode shipped and nothing checked it
       until a fourth sling tab was added. Read out of shell.js's own source rather
       than a copy, or the check drifts from the thing it guards. */
    const shell = fs.readFileSync(path.join(ROOT, 'js/ui/shell.js'), 'utf8');
    const ids = [...shell.matchAll(/\{\s*id:\s*'([a-z]+)'\s*,\s*icon:/g)].map((m) => m[1]);
    if (ids.length < 8) throw new Error('only found ' + ids.length + ' tab ids; the tab tables moved');
    const known = FB.screens.list();
    for (const id of ids) {
      if (known.indexOf(id) < 0) throw new Error('tab "' + id + '" names no registered screen');
    }
    if (ids.indexOf('records') < 0) throw new Error('the sling tab bar lost its records tab');

    /* THE RECORD OF WORK. The run log has been written and capped at forty since the
       mode shipped and exactly one row was ever read. */
    FB.store.reset();
    harness.FIXTURES.find((f) => f.name === 'slinging, statement issued').apply(FB, now);
    const row = FB.S().slinging.log[0];
    let html = FB.screens.get('records').render({});
    if (!/Not photographed/.test(html)) throw new Error('an unphotographed run does not say so');

    const shot = FB.missions.shoot(row.id);
    html = FB.screens.get('records').render({});
    if (!html.includes(shot.file)) throw new Error('the record does not show the photograph');
    if (!html.includes(FB.proof.tier(shot.tier).label)) throw new Error('the record does not show the filing category');
    if (!/retained of/.test(html)) throw new Error('the record does not count the collection');
    if (/undefined|NaN/.test(html)) throw new Error('the record prints undefined or NaN');

    /* empty and non-empty both render */
    FB.store.set((st) => { st.slinging.log = []; return st; });
    if (!/No records/.test(FB.screens.get('records').render({}))) throw new Error('no empty state');

    /* AND THE CUSTOMER'S HISTORY SHOWS ITS PHOTOGRAPHS TOO. Every delivered order has
       had one since the app shipped; the list showed a logo instead. A cancelled
       order has none, because nothing was delivered. */
    FB.store.reset();
    harness.FIXTURES.find((f) => f.name === 'delivered and unrated').apply(FB, now);
    const orders = FB.screens.get('orders').render({});
    if (!/or-shot/.test(orders)) throw new Error('past orders do not show their photograph');
    const o = FB.S().orders[0];
    if (!orders.includes(FB.proof.pick(o))) throw new Error('the row shows a photograph the order would not draw');
    if (/undefined|NaN/.test(orders)) throw new Error('the orders list prints undefined or NaN');

    return ids.length + ' tabs, all registered; records and orders both photographic';
  } finally { app.dispose(); }
});

check('every giver has its own shape, and the decision still fits inside it', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const T = new Date(2026, 7, 20, 19, 0, 0).getTime();
    clock.set(T);
    FB.store.reset();
    FB.missions.setMode('sling');

    const counts = {};
    let own = 0;
    for (const m of FB.missions.ALL) {
      const beats = FB.missions.beatsFor(m);
      if (m.beats) own++;

      /* SHAPE. Four is the floor because the placement needs a beat before the
         decision and a beat after the one that closes it. */
      if (beats.length < 4 || beats.length > 7) {
        throw new Error(m.slug + ' has ' + beats.length + ' beats');
      }
      counts[beats.length] = (counts[beats.length] || 0) + 1;

      /* STRICTLY ASCENDING, inside the run. A beat out of order plays out of order
         and a beat past 1 never plays at all. */
      for (let i = 0; i < beats.length; i++) {
        const f = beats[i][0];
        if (!(f > 0 && f < 1)) throw new Error(m.slug + ' beat ' + i + ' is at ' + f);
        if (i && !(f > beats[i - 1][0])) throw new Error(m.slug + ' beat ' + i + ' does not follow ' + (i - 1));
        if (!beats[i][1] || !beats[i][2]) throw new Error(m.slug + ' beat ' + i + ' has no text');
        /* NO NEW DECISIONS. The giver's one rule is the only question a run asks —
           "the constraint IS the complication". A beat that asks something is a
           second question with no answer path. */
        if (/\?/.test(beats[i][1] + beats[i][2])) {
          throw new Error(m.slug + ' beat ' + i + ' asks a question');
        }
      }

      /* ROOM FOR THE DECISION. The rule's window is closed by the second-to-last
         beat; without a real gap before it the question opens and expires in the
         same instant. */
      const n = beats.length;
      const gap = beats[n - 2][0] - beats[n - 3][0];
      if (gap < 0.2) throw new Error(m.slug + ' leaves only ' + gap.toFixed(2) + ' before the decision closes');

      /* AND THE DERIVED SLOTS LAND IN ORDER. */
      const slot = FB.missions.slots(beats);
      if (!(slot.rule > beats[n - 3][0] && slot.rule < slot.bound)) {
        throw new Error(m.slug + ': the rule does not sit inside its own gap');
      }
      if (!(slot.inter > slot.bound && slot.inter < 1)) {
        throw new Error(m.slug + ': the interruption does not sit after the commit beat');
      }
    }

    /* IT MUST STILL BE ANSWERABLE ON EVERY REAL RUN. The spans are remapped to
       45-75s, so a shape that is fine in fractions can still leave no milliseconds. */
    let withRule = 0, withInter = 0;
    for (const m of FB.missions.ALL) {
      const run = FB.missions.build(m.slug, T);
      const rule = run.checks.filter((c) => c.kind === 'rule')[0];
      if (!rule) throw new Error(m.slug + ' produced a run with no rule to answer');
      withRule++;
      if (run.checks.some((c) => c.kind === 'platform')) withInter++;
      /* the decision must open after the beat before it and close before the beat
         that bounds it, or it is a question about something already settled */
      const beats = run.beats;
      const bound = beats[beats.length - 2].at;
      if (!(rule.at < bound)) throw new Error(m.slug + ': the rule opens after it has closed');
      if (!(rule.deadline <= bound)) throw new Error(m.slug + ': the rule outlives the beat that bounds it');
      if (!(rule.at > run.startAt)) throw new Error(m.slug + ': the rule opens before the run does');
    }
    eq(withRule, FB.missions.ALL.length, 'runs with a rule');
    if (withInter < 8) throw new Error('only ' + withInter + ' runs can carry an interruption');

    /* THE SHAPES ARE ACTUALLY DIFFERENT. If every giver ends up on the default spine
       this check passes while the feature does not exist. */
    if (own < 15) throw new Error('only ' + own + ' givers carry their own beats');
    const shapes = new Set(FB.missions.ALL.map((m) => FB.missions.beatsFor(m).map((b) => b[0]).join(',')));
    if (shapes.size < 12) throw new Error('only ' + shapes.size + ' distinct shapes across twenty givers');

    return own + ' own spines, ' + shapes.size + ' distinct shapes, beat counts ' + JSON.stringify(counts) +
      ', ' + withInter + ' carry an interruption';
  } finally { app.dispose(); }
});

check('an older save keeps its own account and gains anything it lacks', () => {
  /* fillDefaults runs at LOAD, not on read, so this has to go through the real path:
     a save written into storage BEFORE state.js loads, exactly as a browser would
     hand it over. Deleting st.user at runtime and reading it back tests nothing —
     that was my first attempt and it failed for the wrong reason. */
  const saved = harness.loadApp();
  let key;
  try { key = 'foodbang.state.v1'; } finally { saved.dispose(); }

  /* (a) a save with NO user block at all — the shape every save had before the
     account roster existed — must come back with one rather than blank. */
  const old = harness.loadApp({ storageKey: key, savedState: { v: 1, orders: [], meta: {} } });
  try {
    const u = old.FB.S().user;
    if (!u || !u.name || !u.avatar) throw new Error('a save with no user block did not get one');
    if (!fs.existsSync(path.join(ROOT, u.avatar))) throw new Error('backfilled an avatar that is not on disk');
  } finally { old.dispose(); }

  /* (b) a save that already HAS an identity must keep it untouched — the roster
     must never rename somebody who already exists. */
  const mine = { v: 1, orders: [], meta: {},
    user: { name: 'Somebody Specific', handle: '@specific', email: 's@example.invalid',
            phone: '(555) 000-0000', avatar: 'assets/app/user/01.webp', joined: 1 } };
  const kept = harness.loadApp({ storageKey: key, savedState: mine });
  try {
    eq(kept.FB.S().user.name, 'Somebody Specific', 'an existing account was renamed');
    eq(kept.FB.S().user.phone, '(555) 000-0000', 'an existing account was rewritten');
  } finally { kept.dispose(); }
  return 'an empty save gains an identity; an existing one is left alone';
});

check('the account is somebody different each time, and never changes underneath you', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;

    /* EVERY IDENTITY IS REACHABLE and its avatar is on disk. A save that draws a
       portrait nobody generated shows a broken image on the account screen, which is
       the first screen a curious player opens. */
    const seen = new Map();
    for (let i = 0; i < 400; i++) {
      clock.set(new Date(2026, 7, 20, 0, 0, 0).getTime() + i * 997 * 1000);
      FB.store.reset();
      const u = FB.S().user;
      if (!u || !u.name || !u.avatar) throw new Error('a save was created with no identity');
      for (const k of ['name', 'handle', 'email', 'phone', 'avatar']) {
        if (!u[k] || /undefined|NaN/.test(String(u[k]))) throw new Error('user.' + k + ' is ' + u[k]);
      }
      if (!/^assets\/app\//.test(u.avatar)) throw new Error('avatar is not root-relative: ' + u.avatar);
      if (!fs.existsSync(path.join(ROOT, u.avatar))) throw new Error('missing avatar: ' + u.avatar);
      seen.set(u.name, u.avatar);
    }
    if (seen.size < 12) throw new Error('only ' + seen.size + ' identities appear across 400 fresh saves');
    /* no two identities share a portrait — a roster that doubles up reads as a bug */
    if (new Set(seen.values()).size !== seen.size) throw new Error('two identities share an avatar');
    /* and some of them are not people, which the app never remarks on */
    /* Pinned at the exact count, not a floor. Some of these accounts are not people
       and the app never remarks on it — that is the joke, and a floor with headroom
       lets one quietly become a person again without anything going red. */
    const entities = [...seen.keys()].filter((n) => /LLC|Trust|Household|Estate|FLOOR/.test(n));
    eq(entities.length, 5, 'accounts that are not people');

    /* STABLE WITHIN A SAVE. It is drawn once at creation and stored; a render must
       never redraw it, or your own name changes while you are reading it. */
    clock.set(new Date(2026, 7, 20, 12, 0, 0).getTime());
    FB.store.reset();
    const first = FB.S().user.name;
    for (let i = 0; i < 30; i++) {
      clock.set(new Date(2026, 7, 20, 12, 0, 0).getTime() + i * 60000);
      if (FB.S().user.name !== first) throw new Error('the account changed identity mid-save');
    }
    return seen.size + ' identities, ' + entities.length + ' of them not people';
  } finally { app.dispose(); }
});

check('a road runs between two givers, and carrying one changes the other', () => {
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const T = new Date(2026, 7, 20, 19, 14, 0).getTime();
    clock.set(T);
    FB.store.reset();
    FB.missions.setMode('sling');

    /* THE DATA CANNOT HOLD A PRICE, asserted against the table the way the voice
       layer already is — a money field written here would be dropped on the way out
       and the separation would look enforced when the data had already broken. */
    const marked = FB.missions.ALL.filter((m) => m.carried);
    eq(marked.length, 2, 'givers on the road');
    for (const m of marked) {
      const c = m.carried;
      if (!c.of || !FB.missions.ALL.some((x) => x.slug === c.of)) throw new Error(m.slug + ' names no other end');
      if (c.of === m.slug) throw new Error(m.slug + ' is its own other end');
      if (c.rule || c.needsBrief !== undefined) throw new Error(m.slug + ' varies its rule or its gate');
      for (const k of Object.keys(c)) {
        if (/pay|price|fee|cost|scrip|bux|amount|total/i.test(k)) throw new Error(m.slug + '.carried carries ' + k);
      }
      /* the override is keyed on a TAG that exists on the spine — keyed on an index
         or on the text, a reorder or a reword silently unhooks it, which is the trap
         CLAUDE.md records for the courier-introduction barrier */
      if (c.beat) {
        const tags = FB.missions.beatsFor(m).map((b) => b[3]).filter(Boolean);
        if (tags.indexOf(c.beat.tag) < 0) throw new Error(m.slug + ' overrides a beat tag that is not on its spine');
        /* and it may replace WORDS only. A fraction here would make the decision's
           placement depend on player history, which is the one thing the derived
           slot maths may never do. */
        for (const k of Object.keys(c.beat)) {
          if (!/^(tag|text|sub)$/.test(k)) throw new Error(m.slug + '.carried.beat carries ' + k);
        }
      }
    }
    /* symmetric: each names the other */
    eq(FB.missions.ALL.filter((x) => x.slug === marked[0].carried.of)[0].carried.of, marked[0].slug, 'the road runs both ways');

    /* THE SHAPE OF A RUN IS UNTOUCHED, for BOTH ends. A carried beat may replace
       text; it may never move a fraction, or the decision's placement would depend on
       player history. Recorded for every marked giver, not just the one the test
       happens to drive — asserting only one end left the other's fraction free to
       move, and a mutant walked straight through it. */
    const shape = {};
    for (const m of marked) {
      const r = FB.missions.build(m.slug, T);
      shape[m.slug] = {
        fracs: r.beats.map((b) => b.at - r.startAt).join(','),
        rule: (r.checks.filter((c) => c.kind === 'rule')[0] || {}),
        pay: r.pay,
      };
    }
    const plainRun = FB.missions.build('wingbunker', T);
    const beforeFracs = shape.wingbunker.fracs;
    const beforeRule = shape.wingbunker.rule;

    function finish(slug, answer) {
      const now = FB.missions.build(slug, Date.now());
      const run = FB.missions.accept(slug, Date.now() - (now.endAt - now.startAt) - 5000);
      for (const c of (run.checks || []).slice()) {
        clock.set(c.at + 500); FB.missions.tick({ catchUp: true }); FB.missions.answer(answer);
      }
      clock.set(run.endAt + 2000);
      for (let i = 0; i < 30; i++) FB.missions.tick({ catchUp: true });
      return FB.S().slinging.log[0];
    }

    /* BREAKING A RULE TEACHES YOU NOTHING. You have to actually go in. */
    const broke = finish('gyropalace', 'break');
    if ((FB.S().slinging.learned || {}).gyropalace) throw new Error('a broken rule was recorded as carried');
    if (FB.missions.carried('wingbunker')) throw new Error('breaking a rule opened the road');

    /* KEEPING IT DOES. */
    const first = finish('gyropalace', 'keep');
    if (!(FB.S().slinging.learned || {}).gyropalace) throw new Error('a kept rule was not recorded');
    if (!FB.missions.carried('wingbunker')) throw new Error('the other end did not open');
    if (FB.missions.carried('gyropalace')) throw new Error('a giver opened its own end');
    eq(first.pair, false, 'the first end closed the pair');
    eq(FB.missions.pairNote(first), '', 'the first end printed the pair line');

    /* the other end now speaks differently — and its RUN is the same shape */
    const carriedRun = FB.missions.build('wingbunker', T);
    eq(carriedRun.beats.map((b) => b.at - carriedRun.startAt).join(','), beforeFracs, 'a carried run moved its beats');
    const rule2 = carriedRun.checks.filter((c) => c.kind === 'rule')[0];
    eq(rule2.at - carriedRun.startAt, beforeRule.at - plainRun.startAt, 'a carried run moved its decision');
    eq(rule2.ms, beforeRule.ms, 'a carried run changed the window');
    eq(carriedRun.pay, plainRun.pay, 'the road moved the pay');
    const cp = FB.missions.copyFor(carriedRun, { kind: 'rule' });
    const base = FB.missions.copyFor({ slug: 'wingbunker' }, { kind: 'rule' });
    eq(cp.rule, base.rule, 'the road changed the rule');
    if (cp.body === base.body && cp.kept === base.kept) throw new Error('the other end says nothing different');
    /* and the tagged beat really did change */
    const tagged = carriedRun.beats.filter((b) => /Ray asked/.test(b.sub));
    if (!tagged.length) throw new Error('the carried beat did not reach the run');

    /* CLOSING IT. Exactly one statement, ever, carries the line. */
    const second = finish('wingbunker', 'keep');
    eq(second.pair, true, 'the closing run did not record the pair');
    if (!FB.missions.pairNote(second)) throw new Error('the closing statement has no line');
    if (!FB.missions.paired('wingbunker') || !FB.missions.paired('gyropalace')) throw new Error('the pair did not close');
    const third = finish('wingbunker', 'keep');
    eq(third.pair, false, 'the pair closed twice');
    /* and learned is write-once: the second visit must not restamp it */
    const stamp = FB.S().slinging.learned.wingbunker;
    finish('wingbunker', 'keep');
    eq(FB.S().slinging.learned.wingbunker, stamp, 'learned was rewritten on a later run');

    /* NOW BOTH ENDS ARE CARRIED — re-measure every marked giver against the shape it
       had before the road opened. */
    for (const m of marked) {
      const r = FB.missions.build(m.slug, T);
      const was = shape[m.slug];
      eq(r.beats.map((b) => b.at - r.startAt).join(','), was.fracs, m.slug + ' moved its beats once carried');
      const rl = r.checks.filter((c) => c.kind === 'rule')[0];
      eq(rl.at - r.startAt, was.rule.at - T, m.slug + ' moved its decision once carried');
      eq(rl.ms, was.rule.ms, m.slug + ' changed its window once carried');
      eq(r.pay, was.pay, m.slug + ' changed its pay once carried');
    }

    /* the board says the paired thing on both cards, and it is not the one-way line */
    const rows = FB.missions.board(Date.now());
    for (const slug of ['gyropalace', 'wingbunker']) {
      const row = rows.filter((r) => r.slug === slug)[0];
      const m = FB.missions.ALL.filter((x) => x.slug === slug)[0];
      eq(row.note, m.carried.both, slug + ' does not show the paired line');
    }
    return 'two ends, opened by keeping, closed once, run shape untouched';
  } finally { app.dispose(); }
});


check('the run feed closes in the voice the card used', () => {
  /* replay() wrote the closing line off the BASE table while the answer line and
     the outcome card went through copyFor — so at `known` Olive Orchard's card said
     "It is getting longer" over a feed that said "It took eleven minutes". Nothing
     had ever read a run's feed text. The run is captured on its way into settle(),
     which nulls it. */
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const T = new Date(2026, 7, 20, 12, 0, 0).getTime();
    const seen = [];
    const realSettle = FB.missions.settle;
    FB.missions.settle = function (run, opts) { seen.push(FB.deep(run)); return realSettle.call(FB.missions, run, opts); };
    let varied = 0;
    try {
      for (const [slug, standing] of [['oliveorchard', 5], ['gyropalace', 5], ['goldenwok', -5], ['bobacloud', 0]]) {
        FB.store.reset(); clock.set(T);
        FB.missions.setMode('sling');
        FB.store.set((st) => { st.slinging.standing[slug] = standing; return st; });
        const run = FB.missions.accept(slug, T);
        const rule = run.checks.filter((x) => x.kind === 'rule')[0];
        clock.set(rule.at + 1000);
        FB.missions.tick({ catchUp: true });
        if (!FB.missions.answer('keep')) throw new Error(slug + ': keep was refused');
        clock.set(run.endAt + 1000);
        seen.length = 0;
        FB.missions.tick({ catchUp: true });
        if (!seen.length) throw new Error(slug + ': the run never settled');
        const closed = seen[0];
        const cp = FB.missions.copyFor(closed, { kind: 'rule' });
        const last = closed.events[0];
        if (last.text !== 'Rule kept') throw new Error(slug + ': the last line is "' + last.text + '"');
        if (last.sub !== cp.kept) {
          throw new Error(slug + ' at ' + closed.regard + ': the feed closed with "' + last.sub +
            '" while the card says "' + cp.kept + '"');
        }
        const base = FB.missions.get(slug);
        const v = base.voice && base.voice[closed.regard];
        if (v && v.kept) { varied++; if (last.sub === base.kept) throw new Error(slug + ': the feed used the base line at ' + closed.regard); }
      }
    } finally { FB.missions.settle = realSettle; }
    if (varied < 2) throw new Error('only ' + varied + ' of the runs had a variant to disagree with');
    return '4 runs closed in their stamped voice, ' + varied + ' of them a variant';
  } finally { app.clock.restore(); app.dispose(); }
});

check('what the statement settles in BangBux is actually granted', () => {
  /* The settlement row said "Excess deductions are settled in BangBux™" and settle()
     booked the figure into a counter nothing read. FB.scrip.grant was never called
     on the courier side: the balance stayed at $0.00 under a statement that had
     just printed a settlement. */
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const T = new Date(2026, 7, 20, 12, 0, 0).getTime();
    clock.set(T);
    let row = null;
    for (const m of FB.missions.ALL) {
      FB.store.reset(); FB.missions.setMode('sling');
      const probe = FB.missions.build(m.slug, T);
      FB.missions.accept(m.slug, T - (probe.endAt - probe.startAt) - 5000);
      FB.missions.tick({ catchUp: true });
      const r = FB.S().slinging.log[0];
      if (r && r.scrip > 0) { row = r; break; }
    }
    if (!row) throw new Error('no run settles anything in BangBux, so the settlement row cannot be tested');
    const bal = FB.scrip.balance(row.at);
    if (Math.abs(bal - row.scrip) > 0.001) {
      throw new Error('the statement settled ' + FB.money(row.scrip) + ' but the balance holds ' + FB.money(bal));
    }
    const g = FB.S().scrip[0];
    if (!g || g.at !== row.at) throw new Error("the grant is not stamped from the run's end");
    if (Math.abs(FB.S().slinging.scrip - row.scrip) > 0.001) throw new Error('the courier ledger disagrees with the grant');
    if (FB.scrip.balance(row.at + FB.fees.SCRIP_TTL_MS + 1) !== 0) throw new Error('a settlement does not expire like every other grant');
    /* and the whole balance is the customer's to redeem — the same wallet */
    if (FB.scrip.redeemable(row.at) < Math.min(1, Math.floor(row.scrip))) throw new Error('the settlement cannot be redeemed');
    return FB.money(row.scrip) + ' settled on ' + row.slug + ', granted, stamped from run.endAt, expiring on schedule';
  } finally { app.clock.restore(); app.dispose(); }
});

check('a save with a key of the wrong shape is repaired rather than fatal', () => {
  /* fillDefaults backfilled a MISSING key and recursed into a matching one, and did
     nothing at all for a key present with the wrong shape — `orders: {}` reached
     FB.tracker.resume() at boot, threw on .filter, and left the splash up forever
     with no error on screen. */
  const probe = harness.loadApp();
  const key = probe.FB.store.KEY;
  probe.dispose();
  const cases = [
    ['orders', {}], ['addresses', {}], ['scrip', {}], ['bodymax', { history: {} }],
    ['cart', []], ['slinging', []], ['settings', 'dark'], ['meta', null], ['notifs', 'none'],
  ];
  for (const [k, v] of cases) {
    const saved = { v: 1 }; saved[k] = v;
    const app = harness.loadApp({ savedState: saved, storageKey: key });
    try {
      const { FB } = app;
      const st = FB.S();
      const want = k === 'bodymax' ? st.bodymax.history : st[k];
      const shouldBeArray = ['orders', 'addresses', 'scrip', 'notifs', 'bodymax'].includes(k);
      if (Array.isArray(want) !== shouldBeArray || want === null || typeof want !== 'object') {
        throw new Error(k + ' = ' + JSON.stringify(v) + ' survived load as ' + JSON.stringify(want).slice(0, 40));
      }
      /* the boot path that used to throw */
      FB.tracker.resume();
      FB.missions.resume();
      FB.store.address(); FB.store.payment(); FB.store.activeOrder();
      FB.scrip.balance(); FB.bodymax.metrics(); FB.notifs.backfill(); FB.notifs.unreadCount();
      FB.screens.get('home').render({});
    } catch (e) {
      throw new Error(k + ' = ' + JSON.stringify(v) + ': ' + e.message);
    } finally { app.dispose(); }
  }
  /* and a RIGHT-shaped array is still the user's own and is never merged into */
  const kept = { v: 1, addresses: [{ id: 'z', label: 'Only', line1: '1 Lane', city: 'X', dropoff: 'leave', isDefault: true }] };
  const app2 = harness.loadApp({ savedState: kept, storageKey: key });
  try {
    if (app2.FB.S().addresses.length !== 1 || app2.FB.S().addresses[0].id !== 'z') throw new Error('a well-formed address list was merged into');
  } finally { app2.dispose(); }
  return cases.length + ' wrong-shaped keys repaired, a well-formed list left alone';
});

check('the intake chart and the nightly summary step by calendar day', () => {
  /* Both walked the calendar by a flat 86 400 000. The day after spring-forward is
     23 hours long, so the 14-day chart went from the 9th to the 7th and whatever
     was eaten on the 8th vanished; the 2:40 AM summary's window started an hour
     late across fall-back, so an order placed in that hour fell into no summary at
     all. Neither is visible in a zone without daylight saving, so this runs in one. */
  const probe = require('child_process').execFileSync(process.execPath, ['-e', `
    const { loadApp } = require(${JSON.stringify(require('path').join(__dirname, 'harness.cjs'))});
    const app = loadApp();
    const { FB, clock } = app;
    const bad = [];
    /* 00:30 on 9 Mar 2026, the morning after the 23-hour day */
    clock.set(new Date(2026, 2, 9, 0, 30, 0).getTime());
    const days = FB.bodymax.days(14);
    const dates = days.map((d) => d.date);
    if (new Set(dates).size !== 14) bad.push('chart repeats a date: ' + dates.join(','));
    if (dates.indexOf(8) < 0) bad.push('8 March is missing from the chart: ' + dates.join(','));
    if (dates[13] !== 9 || dates[0] !== 24) bad.push('chart does not end today and start 13 days back: ' + dates.join(','));
    /* an order at 00:30 PDT on 2 Nov 2025, the fall-back day; summarised at 02:40 on the 3rd */
    FB.store.reset();
    const placed = new Date(2025, 10, 2, 0, 30, 0).getTime();
    FB.store.set((st) => {
      st.orders.unshift({ id: 'o_dst', slug: 'starbux', status: 'delivered', placedAt: placed,
        calc: { total: 41.5 }, lines: [], events: [] });
      st.meta.installedAt = placed - 86400000 * 3;
      return st;
    });
    clock.set(new Date(2025, 10, 4, 12, 0, 0).getTime());
    FB.notifs.backfill();
    const slot = new Date(2025, 10, 3, 2, 40, 0).getTime();
    const nightly = FB.S().notifs.filter((n) => n.kind === 'nightly');
    const hit = nightly.filter((n) => n.ts === slot)[0];
    if (!hit) bad.push('no summary at 02:40 on the 3rd; got ' + nightly.map((n) => new Date(n.ts).toString()).join(' | '));
    else if (!/^1 order, \\$41\\.50/.test(hit.body)) bad.push('the summary for the 2nd does not count the 00:30 order: ' + hit.body);
    app.dispose();
    console.log(bad.length ? bad.join('\\n') : 'OK');
  `], { env: Object.assign({}, process.env, { TZ: 'America/Los_Angeles' }), encoding: 'utf8' }).trim();
  if (!/(^|\n)OK$/.test(probe)) throw new Error(probe);
  return '14 distinct days across spring-forward, and the fall-back hour is summarised';
});

check('the briefing gate is reachable, and known waives it', () => {
  /* copyFor derived needsBrief correctly and the effect was asserted nowhere,
     because run.briefed was true on every run ever accepted: the dispatch sheet had
     one button. Now it has two, and the second is what the gate is for. */
  const app = harness.loadApp();
  try {
    const { FB, clock } = app;
    const T = new Date(2026, 7, 20, 12, 0, 0).getTime();
    clock.set(T);
    const carrier = FB.missions.ALL.filter((m) => m.needsBrief)[0];
    if (!carrier) throw new Error('no giver requires the briefing, so the gate guards nothing');

    /* the sheet offers the dismissal, through the real handler */
    FB.store.reset(); FB.missions.setMode('sling');
    let cfg = null;
    const realSheet = FB.sheet.open, realBusy = FB.busy, realGo = FB.nav.go;
    const rootBinds = [];
    const el = () => ({ dataset: {}, innerHTML: '', addEventListener() {}, removeEventListener() {},
      querySelector: el, querySelectorAll: () => [], contains: () => true, setAttribute() {},
      getAttribute: () => null, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
    const root = Object.assign(el(), { addEventListener: (t, h) => rootBinds.push({ t, h }) });
    let unread = null;
    try {
      FB.sheet.open = (c) => { cfg = c; return { close() {}, el: Object.assign(el(), { addEventListener: (t, h) => sheetBinds.push({ t, h }) }) }; };
      FB.busy = (t, kind, fn) => fn();
      FB.nav.go = () => {};
      const sheetBinds = [];
      FB.screens.get('dispatch').mount(root, {});
      const take = rootBinds.filter((b) => b.t === 'click')[0];
      if (!take) throw new Error('the dispatch screen binds no click');
      const card = Object.assign(el(), { dataset: { take: carrier.slug } });
      take.h({ target: { closest: (sel) => sel === '[data-take]' ? card : null }, preventDefault() {} });
      if (!cfg) throw new Error('taking a card opened no sheet');
      if (!/data-accept-unread=/.test(cfg.footer)) throw new Error('the briefing sheet cannot be dismissed unread');
      const hh = { close() {}, el: Object.assign(el(), { addEventListener: (t, h) => sheetBinds.push({ t, h }) }) };
      cfg.onMount(el(), hh);
      const btn = Object.assign(el(), { dataset: { acceptUnread: carrier.slug } });
      for (const b of sheetBinds.filter((x) => x.t === 'click')) {
        b.h({ target: { closest: (sel) => sel === '[data-accept-unread]' ? btn : null }, preventDefault() {} }, btn);
      }
      unread = FB.missions.run();
    } finally { FB.sheet.open = realSheet; FB.busy = realBusy; FB.nav.go = realGo; }
    if (!unread) throw new Error('accepting unread produced no run');
    if (unread.briefed) throw new Error('a run accepted unread is marked briefed');

    /* the gate blocks the compliant answer, on screen and in the API */
    const rule = unread.checks.filter((x) => x.kind === 'rule')[0];
    clock.set(rule.at + 1000);
    FB.missions.tick({ catchUp: true });
    const html = FB.screens.get('run').render({});
    if (!/data-answer="keep"[^>]*\bdisabled/.test(html)) throw new Error('the keep button is not disabled for an unbriefed run');
    if (!/you dismissed the briefing/.test(html)) throw new Error('the block does not say why');
    if (FB.missions.answer('keep') !== null) throw new Error('keep was accepted without the briefing');
    if (!FB.missions.answer('break')) throw new Error('break was refused, so the run is stuck');

    /* and a place that knows you does not brief you, so nothing is dismissed */
    FB.store.reset(); FB.missions.setMode('sling'); clock.set(T);
    FB.store.set((st) => { st.slinging.standing[carrier.slug] = 6; return st; });
    const known = FB.missions.accept(carrier.slug, T, { dismissed: true });
    const rule2 = known.checks.filter((x) => x.kind === 'rule')[0];
    clock.set(rule2.at + 1000);
    FB.missions.tick({ catchUp: true });
    if (/data-answer="keep"[^>]*\bdisabled/.test(FB.screens.get('run').render({}))) throw new Error('known does not waive the briefing');
    if (!FB.missions.answer('keep')) throw new Error('keep was refused at known');

    /* every other giver lets an unread run keep */
    FB.store.reset(); FB.missions.setMode('sling'); clock.set(T);
    const other = FB.missions.ALL.filter((m) => !m.needsBrief)[0];
    const r3 = FB.missions.accept(other.slug, T, { dismissed: true });
    clock.set(r3.checks[0].at + 1000);
    FB.missions.tick({ catchUp: true });
    if (!FB.missions.answer('keep')) throw new Error(other.slug + ' imposed a briefing it does not require');
    return carrier.slug + ' blocks keep unread, waives it at known; ' + other.slug + ' never asks';
  } finally { app.clock.restore(); app.dispose(); }
});

check('the intake ledger never shrinks, and a withdrawn monitor is discharged out loud', () => {
  const probe = harness.loadApp();
  const key = probe.FB.store.KEY;
  probe.dispose();
  /* 260 rows of history; migrate caps the rows at 200 and the fold went with them */
  const rows = [];
  for (let i = 0; i < 260; i++) rows.push({ id: 'h' + i, ts: 1700000000000 + i * 3600000, slug: 'mcronalds', cal: 1500, sodium: 10, grease: 1, ranch: 0, flags: {} });
  const saved = { v: 1, bodymax: { history: rows, badges: [], firstTs: 1700000000000, dismissed: [], flags: {}, maxCal: 1500 },
    meta: { installedAt: 1700000000000, orderCount: 260, lifetimeSpend: 1, lifetimeFees: 1, lifetimeTips: 1, lifetimeCalories: 260 * 1500 } };
  const app = harness.loadApp({ savedState: saved, storageKey: key });
  try {
    const { FB, clock } = app;
    if (FB.S().bodymax.history.length !== 200) throw new Error('the cap moved: ' + FB.S().bodymax.history.length);
    const m = FB.bodymax.metrics();
    if (m.totalCal !== 260 * 1500) throw new Error('units logged shrank to ' + m.totalCal + ' after the cap');
    if (m.chewDebt !== Math.round(260 * 1500 / 62)) throw new Error('the chew debt was forgiven');

    /* an id the catalog no longer knows was neither kept nor announced */
    const T = new Date(2026, 7, 20, 12, 0, 0).getTime();
    clock.set(T);
    FB.store.set((st) => { st.restock = ['no-such-item']; return st; });
    const n = FB.notifs.restocks(T);
    if (n !== 1) throw new Error('a withdrawn monitor produced ' + n + ' notifications');
    if (FB.S().restock.length) throw new Error('the withdrawn id lingers in st.restock');
    const note = FB.S().notifs.filter((x) => x.id === 'restock-gone:no-such-item')[0];
    if (!note || !/withdrawn/.test(note.title)) throw new Error('the discharge was not announced');
    if (FB.notifs.restocks(T) !== 0) throw new Error('the discharge was announced twice');
    return 'total held at 390,000 across the cap; one withdrawn monitor discharged, once';
  } finally { app.clock.restore(); app.dispose(); }
});


check('a failed Add to cart does not rebind the item sheet, and a dialog makes the app behind it inert', () => {
  /* commit() rebuilt the sheet body with innerHTML and then called wire() on the
     same node again, so after one refused Add every [data-opt] tap ran twice: a
     checkbox pushed and spliced in one tap, an optional radio selected and cleared.
     Counted at the listener, where it happened. */
  const app = harness.loadApp();
  try {
    const { FB } = app;
    const store = FB.catalog.all().find((s) => s.menu.some((sec) => sec.items.some((it) => FB.catalog.available(it) && (it.groups || []).some((g) => g.required))));
    const item = store.menu.flatMap((sec) => sec.items).find((it) => FB.catalog.available(it) && (it.groups || []).some((g) => g.required));
    const bound = [];
    const el = (tag) => ({ tagName: tag || 'DIV', dataset: {}, innerHTML: '', value: '', scrollTop: 0, addEventListener() {}, removeEventListener() {},
      querySelector() { return el(); }, querySelectorAll: () => [], contains: () => true, setAttribute() {}, hasAttribute: () => false,
      getAttribute: () => null, scrollIntoView() {}, focus() {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false } });
    const body = Object.assign(el(), { addEventListener: (t, h) => bound.push({ t, h }) });
    const foot = Object.assign(el(), { addEventListener: (t, h) => bound.push({ t, h, foot: true }) });
    let cfg = null;
    const realSheet = FB.sheet.open, realBusy = FB.busy, realValidate = FB.catalog.validate;
    try {
      FB.sheet.open = (c) => { cfg = c; return { close() {} }; };
      FB.busy = (t, kind, fn) => fn();
      FB.openItem(store.slug, item.id);
      if (!cfg) throw new Error('the item sheet did not open');
      const handle = { body: body, el: { querySelector: (sel) => sel === '.sheet-foot' ? foot : el() }, setFooter() {}, close() {} };
      cfg.onMount(body, handle);
      const before = bound.filter((b) => !b.foot).length;
      if (before < 2) throw new Error('the sheet body bound ' + before + ' listeners on mount');
      /* refuse the Add, twice */
      let refused = 0;
      FB.catalog.validate = () => { refused++; return [{ name: 'Probe group' }]; };
      /* every footer click handler is offered a target that only answers to
         [data-add] — the stepper's handler is bound first and must not be mistaken
         for the one under test */
      const clicks = bound.filter((b) => b.foot && b.t === 'click');
      if (!clicks.length) throw new Error('the footer has no click handler');
      const btn = Object.assign(el('BUTTON'), { dataset: { add: '' } });
      for (let i = 0; i < 2; i++) {
        for (const c of clicks) c.h({ target: { closest: (sel) => sel === '[data-add]' ? btn : null }, preventDefault() {} }, btn);
      }
      if (refused !== 2) throw new Error('the Add was refused ' + refused + ' times, not 2 — commit() never ran');
      const after = bound.filter((b) => !b.foot).length;
      if (after !== before) throw new Error('two refused Adds grew the body from ' + before + ' to ' + after + ' listeners');
    } finally { FB.sheet.open = realSheet; FB.busy = realBusy; FB.catalog.validate = realValidate; }

    /* and while any dialog is up, the screen under it is inert; when the last
       closes, it is not */
    const screen = app.doc.getElementById('screen');
    FB.sheet.open({ title: 'One' });
    if (screen.inert !== true) throw new Error('a sheet did not make the screen inert');
    FB.modal.open({ html: '<h2>Two</h2>' });
    FB.overlay.close();
    if (screen.inert !== true) throw new Error('closing the top dialog un-inerted the screen under the one still open');
    FB.overlay.closeAll(true);
    if (screen.inert !== false) throw new Error('the screen stayed inert after the last dialog closed');
    return 'body listeners ' + bound.filter((b) => !b.foot).length + ' before and after two refusals; inert follows the dialog stack';
  } finally { app.dispose(); }
});


check('the sweep draws the incident, the queue and the reserved slot, and the headings hold their order', () => {
  /* Three fixtures now go through FB.tracker.build; this pins that they reach the
     markup they exist for, so the sweep cannot quietly go back to drawing the
     courier card twenty times. And the heading structure the sweep never looked at:
     one <h1> per screen, and no screen that jumps from an h1 to an h3. */
  if (!RENDERED) throw new Error('the render check did not run');
  const want = [
    ['class="incident"', 'the open incident'],
    ['slingercard--queue', 'the dispatch queue'],
    ['SCHEDULED FOR', 'the reserved slot header'],
    ['data-inc="hold"', 'the hold button'],
  ];
  for (const [needle, what] of want) {
    if (!RENDERED.some((r) => r.screen === 'track' && r.html.indexOf(needle) > -1)) {
      throw new Error('no rendered track screen carries ' + what);
    }
  }
  const byScreen = {};
  for (const r of RENDERED) {
    const k = r.fixture + '/' + r.screen;
    byScreen[k] = (byScreen[k] || '') + r.html;
  }
  const bad = [];
  for (const k of Object.keys(byScreen)) {
    const html = byScreen[k];
    const levels = [...html.matchAll(/<h([1-3])\b/g)].map((m) => Number(m[1]));
    const h1s = levels.filter((l) => l === 1).length;
    if (h1s > 1) bad.push(k + ': ' + h1s + ' <h1>s');
    /* a jump: any heading more than one level below the one before it */
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] > levels[i - 1] + 1) { bad.push(k + ': h' + levels[i - 1] + ' -> h' + levels[i]); break; }
    }
  }
  if (bad.length) throw new Error(bad.length + ' heading problem(s): ' + bad.slice(0, 4).join('; '));
  return 'incident, queue and slot all drawn; ' + Object.keys(byScreen).length + ' screen renders with one h1 and no skipped level';
});

check('a tab that missed the other one writes above storage, and a hidden tab writes at once', () => {
  /* `w` counted this tab's own writes. A tab frozen in the background missed the
     other's storage events, wrote its own count + 1 — lower than the document already
     there — and from then on the busier tab refused everything it wrote. The counter
     is now read off storage at write time, so it is monotone across every tab. */
  const probe = harness.loadApp();
  const key = probe.FB.store.KEY;
  probe.dispose();
  const app = harness.loadApp();
  try {
    const { FB, win } = app;
    FB.store.set((st) => { st.favorites.push('starbux'); return st; });
    if (!FB.store.flush()) throw new Error('flush did not write');
    const mine = JSON.parse(win.localStorage.getItem(key));
    if (mine.w !== 1) throw new Error('the first write is w=' + mine.w);
    /* another tab has written many times while this one saw nothing */
    const theirs = JSON.parse(JSON.stringify(mine)); theirs.w = 50; theirs.favorites = ['ssa'];
    win.localStorage.setItem(key, JSON.stringify(theirs));
    FB.store.set((st) => { st.favorites.push('dunkinn'); return st; });
    FB.store.flush();
    const now = JSON.parse(win.localStorage.getItem(key));
    if (now.w !== 51) throw new Error('a tab that missed 49 writes wrote w=' + now.w + ' — the other tab would refuse it forever');
    if (now.favorites.indexOf('dunkinn') < 0) throw new Error('the write did not carry this tab\'s change');
    /* the other tab, holding w=50, adopts it */
    const other = harness.loadApp({ savedState: theirs, storageKey: key });
    try {
      if (!other.FB.store.adopt(JSON.stringify(now))) throw new Error('the busier tab refused the write');
      if (other.FB.S().favorites.indexOf('dunkinn') < 0) throw new Error('the adoption did not carry the change');
    } finally { other.dispose(); }
    /* flush is a no-op with nothing pending, and reports so */
    if (FB.store.flush() !== false) throw new Error('flush wrote with nothing pending');
    /* and app.js wires it to the page going away */
    const boot = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
    if (!/pagehide[\s\S]{0,80}FB\.store\.flush/.test(boot)) throw new Error('the boot file does not flush on pagehide');
    return 'w=1, then w=51 over a stranger\'s 50, adopted by the tab that wrote it; flush wired to pagehide';
  } finally { app.dispose(); }
});

console.log('');
if (failed) { console.log(failed + ' of ' + ran + ' check(s) failed'); process.exit(1); }
console.log('all ' + ran + ' checks passed');
