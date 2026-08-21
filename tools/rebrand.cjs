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
function buildRules(FROM, TO) { return [
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
  [FROM.sub.toLowerCase(), TO.sub.toLowerCase(), 'subscription (short, lc)'],
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
  /* FROM.sub ends in a '+', which escapes to a literal plus in the pattern and so can
     never match a promo code. The plus-stripped form (used by the phone gag above)
     can, and rewrites itself on the next rename. */
  [new RegExp(FROM.sub.replace('+', '') + '(?=[0-9])', 'g'), TO.sub.replace('+', ''), 'promo code prefix'],
  [FROM.cssVar, TO.cssVar, 'css accent tokens'],
  [FROM.ns + '_MENUS', TO.ns + '_MENUS', 'menu bundle global'],
  ['__' + FROM.ns + '_ASSETS', '__' + TO.ns + '_ASSETS', 'inlined asset global'],
  [new RegExp('\\b' + FROM.ns + '\\b', 'g'), TO.ns, 'js namespace'],
  ['data-' + FROM.ns.toLowerCase() + 'm', 'data-' + TO.ns.toLowerCase() + 'm', 'asset-shim marker'],
  ['__' + FROM.ns.toLowerCase() + 'err', '__' + TO.ns.toLowerCase() + 'err', 'boot-failure banner id'],
  [FROM.courier.toLowerCase() + 'card', TO.courier.toLowerCase() + 'card', 'courier card css class'],
  [FROM.courier.toLowerCase() + 'Messages', TO.courier.toLowerCase() + 'Messages', 'courier notification key'],
  [FROM.sub.replace('+', '').toLowerCase() + 'Plus', TO.sub.replace('+', '').toLowerCase() + 'Plus', 'subscription data field'],
  /* the drawn mark's CSS classes and data attributes are all built from the lowercase
     namespace: .fb-tile, .fb-word, .fb-tile--flat, data-fb-mark */
  [new RegExp('\\b' + FROM.ns.toLowerCase() + '-(?=[a-z])', 'g'), TO.ns.toLowerCase() + '-', 'namespace css classes'],
  ['data-' + FROM.ns.toLowerCase() + '-', 'data-' + TO.ns.toLowerCase() + '-', 'namespace data attributes'],
  /* …and the camelCase dataset reader for them. Renaming data-fb-mark without this
     leaves icons.js reading el.dataset.fbMark, which is now undefined — the drawn
     mark silently falls back to its default size. */
  [new RegExp('dataset\\.' + FROM.ns.toLowerCase() + '(?=[A-Z])', 'g'), 'dataset.' + TO.ns.toLowerCase(), 'namespace dataset accessors'],
]; }

const RULES = buildRules(FROM, TO);

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

/* -------------------------------------------------------------- self-check */
/* The failure mode this file exists to avoid is a rule that cannot rewrite its own
   source: it keeps pointing at an identity two renames old while the live one goes
   unrenamed, silently, because nothing ever looks for the CURRENT brand.
   --selfcheck does the real thing in memory — builds the rules against a synthetic
   TO, applies them to every file, and reports every place a FROM value survives.
   It writes nothing. Run it after editing RULES. */
if (process.argv.includes('--selfcheck')) {
  /* The synthetic identity is DERIVED from the live one by rotating each letter one
     place, so it can never collide with it and can never contain it as a substring —
     a hand-written SYNTH silently turns every rule into a no-op the day someone picks
     one of its words, and a prefixed one ('qFoo') still contains the original, so
     every replacement gets reported as a survivor. Non-letters pass through, which
     keeps each value's shape: a css var stays '--xx', the subscription keeps its '+',
     an asset prefix keeps its trailing '-'. */
  const rot = str => String(str).replace(/[a-zA-Z]/g, c => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - base + 1) % 26 + base);
  });
  const SYNTH = {};
  for (const k of Object.keys(FROM)) SYNTH[k] = rot(FROM[k]);

  const synthRules = buildRules(FROM, SYNTH);
  /* Longest first so a hit inside a longer FROM value is not reported twice: the
     plus-stripped subscription name is a substring of the accent-colour name, and
     only the outer one is a real finding. */
  const needles = [];
  for (const [k, v] of Object.entries(FROM)) {
    for (const form of [String(v), String(v).toLowerCase(), String(v).toUpperCase(), String(v).replace('+', '')]) {
      /* floor of 2, not 3: FROM.ns is two letters and is the single largest identity
         token in the tree — a floor of 3 made the check structurally blind to it.
         Short needles are word-bounded below so 'FB' does not match inside a word. */
      if (form.length >= 2 && !needles.some(n => n.s === form)) needles.push({ k: k, s: form });
    }
  }
  needles.sort((a, b) => b.s.length - a.s.length);

  const survivors = [];
  for (const file of collect(ROOT, [])) {
    let text = fs.readFileSync(file, 'utf8');
    for (const [pat, rep] of synthRules) {
      const re = pat instanceof RegExp ? pat : new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
      text = text.replace(re, rep);
    }
    const claimed = [];
    const wordish = c => /[A-Za-z0-9_]/.test(c);
    for (const n of needles) {
      const bound = n.s.length <= 3;
      let at = text.indexOf(n.s);
      while (at > -1) {
        if (bound) {
          const before = at > 0 ? text[at - 1] : '';
          const after = text[at + n.s.length] || '';
          if (wordish(before) || wordish(after)) { at = text.indexOf(n.s, at + 1); continue; }
        }
        if (!claimed.some(c => at >= c[0] && at < c[1])) {
          claimed.push([at, at + n.s.length]);
          const ctx = text.slice(Math.max(0, at - 26), at + n.s.length + 26).replace(/\s+/g, ' ');
          survivors.push({ file: path.relative(ROOT, file), key: n.k, needle: n.s, ctx: ctx });
        }
        at = text.indexOf(n.s, at + 1);
      }
    }
  }
  console.log('rebrand self-check — every rule applied against a synthetic identity\n');
  if (!survivors.length) { console.log('  clean: no FROM value survives the pass'); process.exit(0); }
  console.log('  ' + survivors.length + ' survivor(s) — each would keep the OUTGOING brand after a rename:\n');
  survivors.forEach(s2 => console.log('    ! ' + s2.file + '  ' + s2.key + '="' + s2.needle + '"\n        …' + s2.ctx + '…'));
  console.log('\nAdd a rule DERIVED from FROM (never a literal) for each.');
  process.exit(1);
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
