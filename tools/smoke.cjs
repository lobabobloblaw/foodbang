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

check('every fee line has a FEE_WHY entry', () => {
  const c = FB.fees.compute({ subtotal: 40, lineCount: 3, express: true, scheduled: true, settings: FB.S().settings });
  const missing = c.feeLines.filter(l => !FB.FEE_WHY[l.id]).map(l => l.id);
  if (missing.length) throw new Error('missing explanations for: ' + missing.join(', '));
  return c.feeLines.length + ' fees';
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

check('the amateur/studio photo mix is preserved', () => {
  const items = Object.values(MENUS).flatMap(m => m.menu.flatMap(s => s.items)).filter(i => i.photo);
  const amateur = items.filter(i => i.photoStyle === 'amateur').length;
  const pct = amateur / items.length;
  if (pct < 0.5 || pct > 0.75) throw new Error('amateur share is ' + Math.round(pct * 100) + '%, expected 50-75%');
  return amateur + '/' + items.length + ' amateur';
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
  const stale = /doorgorge|gorger|gorgebux|mouthgut|\bDG\b/i;
  const skipDirs = new Set(['.git', 'node_modules', 'build']);
  const skipFiles = new Set(['menus.generated.js', 'rebrand.cjs', 'smoke.cjs', 'CLAUDE.md']);
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
