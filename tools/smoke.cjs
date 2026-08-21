/* Smoke test for the invariants that are easy to break silently.
   node tools/smoke.cjs   (also: npm test) */
const fs = require('fs');
const path = require('path');

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

console.log('FoodBang smoke test\n');

check('$12 of food totals exactly $60.00', () => {
  const c = FB.fees.compute({ subtotal: 12, lineCount: 2, settings: FB.S().settings });
  return eq(FB.money(c.total), '$60.00', 'total');
});

check('fee stack order is intact', () => {
  const c = FB.fees.compute({ subtotal: 12, lineCount: 2, settings: FB.S().settings });
  const peak = c.feeLines[c.feeLines.length - 1];
  if (!/Peak Demand/.test(peak.label)) throw new Error('Peak Demand must be the last fee line, saw: ' + peak.label);
  const stack = c.feeLines.slice(0, -1).reduce((a, l) => a + l.amount, 0);
  if (Math.abs(peak.amount - stack * 0.4) > 0.02) throw new Error('Peak multiplier is not applied to the whole stack');
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

check('bundle matches the source menus', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'js/data/menus')).filter(f => f.endsWith('.json')).length;
  return eq(Object.keys(MENUS).length, onDisk, 'store count') + ' stores';
});

check('every photographed item has its asset on disk', () => {
  let n = 0;
  for (const [slug, m] of Object.entries(MENUS)) {
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
  const items = Object.values(MENUS).flatMap(m => m.menu.flatMap(s => s.items)).filter(i => i.photo);
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
  for (const [slug, m] of Object.entries(MENUS)) {
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
  for (const [slug, m] of Object.entries(MENUS)) {
    if (seen.has(m.ratingCount)) throw new Error(slug + ' and ' + seen.get(m.ratingCount) + ' both show ' + m.ratingCount);
    seen.set(m.ratingCount, slug);
  }
  return seen.size + ' distinct counts';
});

check('no modifier group offers a cap it cannot reach', () => {
  /* "Optional · up to 8" printed over four checkboxes reads as a data slip, and the
     app's jokes are always explicit — an unreachable cap is not one of them. */
  const bad = [];
  for (const [slug, m] of Object.entries(MENUS)) {
    for (const it of m.menu.flatMap(s => s.items)) {
      for (const g of it.groups || []) {
        const n = (g.options || []).length;
        if (g.max != null && g.max > n) bad.push(slug + '/' + it.id + '/' + g.id + ' max ' + g.max + ' > ' + n);
      }
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
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      src.split('\n').forEach((line, i) => {
        if (/\.addEventListener\(/.test(line) && !/^\s*(\*|\/\/|\/\*)/.test(line)) hits.push(d + '/' + f + ':' + (i + 1));
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
  for (const m of Object.values(MENUS)) {
    for (const it of m.menu.flatMap(s => s.items)) {
      n++;
      for (const g of it.groups || []) {
        if (!g.options || !g.options.length) throw new Error(it.id + '/' + g.id + ' has no options');
        if (g.required && !g.options.length) throw new Error(it.id + '/' + g.id + ' required but empty');
      }
      if (!(it.groups || []).length) throw new Error(it.id + ' has no modifier groups');
    }
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
  const { FB } = app;
  RENDERED = [];
  const bad = [];
  let n = 0;
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
        const where = fx.name + ' / ' + name + '.' + fn + '()';
        try { out = def[fn](p); }
        catch (e) { bad.push(where + ' threw: ' + e.message); continue; }
        if (typeof out !== 'string') { bad.push(where + ' returned ' + typeof out); continue; }
        n++;
        RENDERED.push({ screen: name, fn: fn, html: out, fixture: fx.name });
        /* A field that arrived undefined on an old save, or a total poisoned to NaN,
           reaches the user as these two literal strings and nothing else notices. */
        if (out.indexOf('undefined') > -1) bad.push(where + ' rendered the string "undefined"');
        if (out.indexOf('NaN') > -1) bad.push(where + ' rendered the string "NaN"');
      }
    }
  }
  app.dispose();
  if (bad.length) throw new Error(bad.length + ' problem(s):\n          ' + bad.slice(0, 8).join('\n          '));
  return n + ' renders across ' + harness.FIXTURES.length + ' fixtures, ' + FB.screens.list().length + ' screens';
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

console.log('');
if (failed) { console.log(failed + ' check(s) failed'); process.exit(1); }
console.log('all checks passed');
