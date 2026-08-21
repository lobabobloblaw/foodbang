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
FB.S = () => ({ settings: { feeTransparency: true, reduceUpsells: false, dataSharing: true, autoTipPct: 42 } });
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
  const dir = path.join(ROOT, 'js/ui');
  const exempt = new Set(['shell.js']);
  const hits = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.js'))) {
    if (exempt.has(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (/\.addEventListener\(/.test(line) && !/^\s*(\*|\/\/|\/\*)/.test(line)) hits.push(f + ':' + (i + 1));
    });
  }
  if (hits.length) throw new Error('raw addEventListener in: ' + hits.join(', '));
  return fs.readdirSync(dir).length - exempt.size + ' screen files clean';
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

console.log('');
if (failed) { console.log(failed + ' check(s) failed'); process.exit(1); }
console.log('all checks passed');
