/* Rebrand the app in place.
 *
 * Only the app's own identity moves — the 20 restaurants are untouched, because
 * their names are rendered into their logo pixels and renaming one means
 * regenerating that logo.
 *
 * FROM tracks the CURRENT state and the script rewrites its own FROM block as
 * it runs, so it stays accurate across successive renames.
 *
 * Edit TO below, then:  node tools/rebrand.cjs --dry    (preview)
 *                       node tools/rebrand.cjs          (apply)
 * Then: npm run bundle && npm run artifact
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');

/* ---------------------------------------------------------------- identity */
const FROM = {
  name: 'FoodBang',
  slug: 'foodbang',
  ns: 'FB',
  tagline: 'IMPACT IS PART OF DELIVERY.',
  taglineTitle: 'Impact Is Part Of Delivery',
  courier: 'Slinger',
  sub: 'BANG+',
  subFull: 'BANG+ INFINITY PRIME ELITE',
  currency: 'BangBux',
  express: 'Express Bang',
  cta: 'Begin intake',
  accentName: 'FOODBANG RED',
  cssVar: '--fb',
  plusHeroAsset: 'bangplus-hero',
  courierAsset: 'slinger-',
};

const TO = {
  name: 'FoodBang',
  slug: 'foodbang',
  ns: 'FB',
  tagline: 'IMPACT IS PART OF DELIVERY.',
  taglineTitle: 'Impact Is Part Of Delivery',
  courier: 'Slinger',
  sub: 'BANG+',
  subFull: 'BANG+ INFINITY PRIME ELITE',
  currency: 'BangBux',
  express: 'Express Bang',
  cta: 'Begin intake',
  accentName: 'FOODBANG RED',
  cssVar: '--fb',
  plusHeroAsset: 'bangplus-hero',
  courierAsset: 'slinger-',
};

/* Ordered: longest and most specific first, so a broad rule never eats a
   narrow one. Each entry is [pattern, replacement, label]. */
const RULES = [
  [FROM.subFull, TO.subFull, 'subscription (full)'],
  [FROM.tagline, TO.tagline, 'tagline'],
  [FROM.taglineTitle, TO.taglineTitle, 'tagline (title case)'],
  [FROM.cta, TO.cta, 'welcome CTA'],
  [FROM.express, TO.express, 'express tier'],
  [FROM.currency, TO.currency, 'currency'],
  [FROM.accentName, TO.accentName, 'accent colour name'],
  [FROM.plusHeroAsset, TO.plusHeroAsset, 'subscription hero asset'],
  [FROM.courierAsset, TO.courierAsset, 'courier avatar assets'],
  [FROM.name, TO.name, 'app name'],
  [FROM.slug, TO.slug, 'app slug'],
  [FROM.sub, TO.sub, 'subscription (short)'],
  /* Derived from FROM.courier, not spelled out: a literal /\bGorger\b/ cannot
     rewrite itself (the backslashes around it kill the word boundaries), so the
     hard-coded version stayed pointed at a courier two renames ago while the
     live noun went unrenamed. These rewrite FROM.courier in the block above too. */
  [new RegExp('\\b' + FROM.courier + 's\\b', 'g'), TO.courier + 's', 'courier noun (plural)'],
  [new RegExp('\\b' + FROM.courier + '\\b', 'g'), TO.courier, 'courier noun'],
  [new RegExp('\\b' + FROM.courier.toLowerCase() + 's\\b', 'g'), TO.courier.toLowerCase() + 's', 'courier noun (lc plural)'],
  [new RegExp('\\b' + FROM.courier.toLowerCase() + '\\b', 'g'), TO.courier.toLowerCase(), 'courier noun (lc)'],
  [new RegExp('\\b' + FROM.courier.toUpperCase() + 'S\\b', 'g'), TO.courier.toUpperCase() + 'S', 'courier noun (uc plural)'],
  [new RegExp('\\b' + FROM.courier.toUpperCase() + '\\b', 'g'), TO.courier.toUpperCase(), 'courier noun (uc)'],
  ["1-800-" + FROM.sub.replace('+', '') + "-NO", "1-800-" + TO.sub.replace('+', '') + "-NO", 'retention phone gag'],
  [FROM.cssVar, TO.cssVar, 'css accent tokens'],
  [FROM.ns + '_MENUS', TO.ns + '_MENUS', 'menu bundle global'],
  ['__' + FROM.ns + '_ASSETS', '__' + TO.ns + '_ASSETS', 'inlined asset global'],
  [new RegExp('\\b' + FROM.ns + '\\b', 'g'), TO.ns, 'js namespace'],
  ['data-' + FROM.ns.toLowerCase() + 'm', 'data-' + TO.ns.toLowerCase() + 'm', 'asset-shim marker'],
  ['__' + FROM.ns.toLowerCase() + 'err', '__' + TO.ns.toLowerCase() + 'err', 'boot-failure banner id'],
  [FROM.courier.toLowerCase() + 'card', TO.courier.toLowerCase() + 'card', 'courier card css class'],
  [FROM.courier.toLowerCase() + 'Messages', TO.courier.toLowerCase() + 'Messages', 'courier notification key'],
  [FROM.sub.replace('+', '').toLowerCase() + 'Plus', TO.sub.replace('+', '').toLowerCase() + 'Plus', 'subscription data field'],
];

/* ------------------------------------------------------------------- files */
const SKIP_DIRS = new Set(['.git', 'node_modules', 'build']);
const EXTS = new Set(['.js', '.cjs', '.mjs', '.css', '.html', '.json', '.md']);
const SKIP_FILES = new Set(['menus.generated.js', 'package-lock.json', 'retired-brands.json']);

function collect(dir, out) {
  for (const e of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = path.join(dir, e);
    if (fs.statSync(p).isDirectory()) { collect(p, out); continue; }
    if (!EXTS.has(path.extname(p)) || SKIP_FILES.has(e)) continue;
    out.push(p);
  }
  return out;
}

/* ------------------------------------------------------------------- apply */
const files = collect(ROOT, []);
const hits = {};
let changedFiles = 0, totalEdits = 0;

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const [pat, rep, label] of RULES) {
    const re = pat instanceof RegExp ? pat : new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const n = (after.match(re) || []).length;
    if (!n) continue;
    hits[label] = (hits[label] || 0) + n;
    totalEdits += n;
    after = after.replace(re, rep);
  }
  if (after !== before) {
    changedFiles++;
    if (!DRY) fs.writeFileSync(file, after);
  }
}

/* ---------------------------------------------------------- asset renames */
const RENAMES = [
  ['assets/app/' + FROM.plusHeroAsset + '.webp', 'assets/app/' + TO.plusHeroAsset + '.webp'],
];
for (let i = 1; i <= 3; i++) {
  RENAMES.push(['assets/app/' + FROM.courierAsset + i + '.webp', 'assets/app/' + TO.courierAsset + i + '.webp']);
}
const renamed = [];
for (const [a, b] of RENAMES) {
  const src = path.join(ROOT, a), dst = path.join(ROOT, b);
  if (fs.existsSync(src)) { if (!DRY) fs.renameSync(src, dst); renamed.push(a + ' -> ' + b); }
}

/* ------------------------------------------------- retire the old identity */
/* smoke.cjs greps for names this app has stopped using. Recording them here is
   what stops the next rename from leaving half of this one behind. */
const RETIRED = path.join(ROOT, 'tools', 'retired-brands.json');
const retiredAdds = [];
if (FROM.name !== TO.name || FROM.courier !== TO.courier || FROM.currency !== TO.currency || FROM.ns !== TO.ns) {
  const doc = JSON.parse(fs.readFileSync(RETIRED, 'utf8'));
  const candidates = [FROM.slug, FROM.name, FROM.courier, FROM.currency]
    .filter(Boolean).map(v => String(v).toLowerCase());
  if (FROM.ns !== TO.ns) candidates.push('\\b' + FROM.ns + '\\b');
  const live = new Set([TO.slug, TO.name, TO.courier, TO.currency].filter(Boolean).map(v => String(v).toLowerCase()));
  for (const c of candidates) {
    if (live.has(c) || doc.patterns.includes(c)) continue;
    doc.patterns.push(c);
    retiredAdds.push(c);
  }
  if (retiredAdds.length && !DRY) fs.writeFileSync(RETIRED, JSON.stringify(doc, null, 2) + '\n');
}

/* ------------------------------------------------------------------ report */
console.log((DRY ? 'DRY RUN — ' : '') + FROM.name + ' -> ' + TO.name);
console.log('');
Object.entries(hits).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
  console.log('  ' + String(v).padStart(5) + '  ' + k);
});
console.log('  ' + String(totalEdits).padStart(5) + '  total, across ' + changedFiles + ' files');
if (renamed.length) {
  console.log('\n  asset renames:');
  renamed.forEach(r => console.log('    ' + r));
}
if (retiredAdds.length) {
  console.log('\n  retired (now watched by npm test):');
  retiredAdds.forEach(r => console.log('    ' + r));
}
console.log('\nrestaurant brands untouched — their names are baked into their logo pixels.');
if (!DRY) console.log('next: npm run bundle && npm run artifact');
