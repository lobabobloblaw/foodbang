/* Bundles js/data/menus/*.json into one classic script so the app runs from
   file:// with no server and no module loader. Validates as it builds.
   node tools/bundle.cjs */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
/* Overridable so npm test can validate a deliberately broken COPY of the menus in
   a scratch directory. It used to corrupt gyropalace.json in place and restore it
   in a finally — a Ctrl-C between the two left a tracked file carrying a fabricated
   price. Nothing else should set these. */
const DIR = process.env.SMOKE_MENU_DIR || path.join(ROOT, 'js', 'data', 'menus');
const OUT = process.env.SMOKE_BUNDLE_OUT || path.join(ROOT, 'js', 'data', 'menus.generated.js');

const REQUIRED = ['slug', 'name', 'tagline', 'cuisine', 'categories', 'rating', 'ratingCount',
  'deliveryMin', 'deliveryMax', 'deliveryFee', 'distanceMi', 'priceTier', 'opensAt', 'closesAt',
  'address', 'about', 'menu'];

/* "3:45 PM" -> 945. Duplicated from FB.minsOfDay in js/core/util.js rather than
   required from it: util.js is a browser file that hangs itself off window, and the
   build has no window. Both sides are covered by the same smoke check. */
function minsOfDay(str) {
  const m = /^\s*(\d{1,2}):(\d{2})\s*(AM|PM)?\s*$/i.exec(String(str || ''));
  if (!m) return null;
  let h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  const ap = (m[3] || '').toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return h * 60 + mi;
}
/* Eight of twenty stores close after midnight, so a window is not from < to. The
   check that matters is wrap-aware containment; `opensAt !== closesAt` would pass
   a store open for minus nineteen hours. */
function inWindow(t, from, to) {
  if (from == null || to == null) return true;
  if (from === to) return true;
  return from < to ? (t >= from && t < to) : (t >= from || t < to);
}

/* This machine has intermittently returned short reads. A menu silently dropped
   from the bundle is worse than a slow build, so verify the parse and retry. */
function readJSON(p, tries) {
  tries = tries || 4;
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const txt = fs.readFileSync(p, 'utf8');
      if (!txt.trim()) throw new Error('empty read (file is dataless)');
      return JSON.parse(txt);
    } catch (e) {
      last = e;
      /* macOS evicts file contents to iCloud when the disk fills; stat still
         reports the real size but the read comes back empty. Pull it back. */
      if (i === 0 && process.platform === 'darwin') {
        try { require('child_process').execSync('brctl download ' + JSON.stringify(p), { stdio: 'ignore' }); }
        catch (_) { /* not an iCloud volume — fall through to the plain retry */ }
      }
    }
  }
  throw new Error(path.basename(p) + ': ' + last.message + ' (after ' + tries + ' attempts)');
}

const out = {};
/* Two severities. `problems` blocks the write — a bundle that ships one of these is
   a silently broken app. `warnings` are printed and shipped: things that are wrong
   but not load-bearing. Everything used to be advisory, including duplicate ids and
   non-numeric prices, and the build exited 0 on all of it. */
const problems = [];
const warnings = [];
let items = 0, photos = 0, groups = 0, options = 0, amateur = 0, studio = 0, scarce = 0;
const ratingSeen = new Map();

const files = fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort();
for (const f of files) {
  const slug = f.replace(/\.json$/, '');
  let m;
  try { m = readJSON(path.join(DIR, f)); }
  catch (e) { problems.push(e.message); continue; }

  for (const k of REQUIRED) if (m[k] === undefined) problems.push(`${slug}: missing "${k}"`);
  if (m.slug !== slug) problems.push(`${slug}: slug field is "${m.slug}"`);
  if (!Array.isArray(m.menu) || !m.menu.length) { problems.push(`${slug}: no menu sections`); continue; }

  /* Twenty-two promos were display strings that never touched a price. Eight of
     them are now structured; the other fourteen are jokes with no arithmetic in
     them and say so with kind "none". The value check is SCOPED to the kinds that
     carry a figure — fourteen legitimately name none ("Buy 5 drinks, get a stamp.
     Card printing is paused."), and six name one while delivering something that
     is not money. */
  const PROMO_KINDS = new Set(['spendSave', 'pct', 'plusFlat', 'none']);
  for (const pr of (m.promos || [])) {
    if (typeof pr !== 'object' || !pr.text) { problems.push(`${slug}: a promo is not an object with text`); continue; }
    if (!PROMO_KINDS.has(pr.kind)) { problems.push(`${slug}: promo kind "${pr.kind}" is not one of ${[...PROMO_KINDS].join(', ')}`); continue; }
    if (pr.kind === 'spendSave') {
      if (typeof pr.min !== 'number' || typeof pr.value !== 'number') problems.push(`${slug}: spendSave promo needs numeric min and value`);
      else {
        /* the copy has to name the same numbers the engine will use */
        const nums = (pr.text.match(/\$([\d.,]+)/g) || []).map(x => Number(x.slice(1).replace(/,/g, '')));
        if (!nums.includes(pr.min)) problems.push(`${slug}: "${pr.text}" does not name its own minimum of ${pr.min}`);
        if (!nums.includes(pr.value)) problems.push(`${slug}: "${pr.text}" does not name its own saving of ${pr.value}`);
        /* and the threshold has to be an implausible multiple of the cheapest item,
           which is the joke — the earlier 4x rule was cleared by every promo 10-40x over */
        const cheapest = Math.min(...m.menu.flatMap(sec => (sec.items || []).map(it => it.price)).filter(n => typeof n === 'number'));
        if (isFinite(cheapest) && cheapest > 0 && pr.min < cheapest * 15) {
          warnings.push(`${slug}: promo minimum ${pr.min} is only ${(pr.min / cheapest).toFixed(1)}x the cheapest item (${cheapest})`);
        }
      }
    } else if (pr.kind === 'pct') {
      if (!(pr.value > 0 && pr.value < 1)) problems.push(`${slug}: pct promo value ${pr.value} is not a fraction`);
      if (typeof pr.max !== 'number') problems.push(`${slug}: pct promo needs a max`);
      else if (!pr.text.includes(String(Math.round(pr.value * 100)) + '%')) problems.push(`${slug}: "${pr.text}" does not name its own ${Math.round(pr.value * 100)}%`);
    } else if (pr.kind === 'plusFlat') {
      if (typeof pr.value !== 'number') problems.push(`${slug}: plusFlat promo needs a numeric value`);
    }
  }

  const openMins = minsOfDay(m.opensAt);
  const closeMins = minsOfDay(m.closesAt);
  if (m.opensAt !== undefined && openMins === null) problems.push(`${slug}: opensAt "${m.opensAt}" is not a clock time`);
  if (m.closesAt !== undefined && closeMins === null) problems.push(`${slug}: closesAt "${m.closesAt}" is not a clock time`);

  const seen = new Set();
  for (const sec of m.menu) {
    if (sec.daypart) {
      const f = minsOfDay(sec.daypart.from), t = minsOfDay(sec.daypart.to);
      if (f === null || t === null) {
        problems.push(`${slug}/${sec.id}: daypart is not a pair of clock times`);
      } else if (f === t) {
        problems.push(`${slug}/${sec.id}: daypart opens and closes at the same minute`);
      } else if (openMins !== null && closeMins !== null) {
        /* the section's whole window must sit inside the store's, wrap and all —
           a breakfast menu served after the restaurant has shut is not a joke,
           it is a data slip, and the app's jokes are always explicit */
        const startsInside = inWindow(f, openMins, closeMins);
        const endsInside = inWindow((t + 1439) % 1440, openMins, closeMins);
        if (!startsInside || !endsInside) {
          problems.push(`${slug}/${sec.id}: daypart ${sec.daypart.from}-${sec.daypart.to} falls outside store hours ${m.opensAt}-${m.closesAt}`);
        }
      }
    }
    if (!Array.isArray(sec.items)) { problems.push(`${slug}/${sec.id}: no items`); continue; }
    for (const it of sec.items) {
      items++;
      if (seen.has(it.id)) problems.push(`${slug}: duplicate item id ${it.id}`);
      seen.add(it.id);
      if (typeof it.price !== 'number') problems.push(`${slug}/${it.id}: price is not a number`);
      if (it.photo) {
        photos++;
        /* photoStyle must be stated, never inferred from absence. Half the photos
           used to carry no value at all, so "not amateur" silently meant "studio"
           and eighteen staff-phone shots were counted as marketing photography. */
        if (it.photoStyle === 'amateur') amateur++;
        else if (it.photoStyle === 'studio') studio++;
        else if (it.photoStyle === undefined) problems.push(`${slug}/${it.id}: photo has no photoStyle ("amateur" or "studio")`);
        else problems.push(`${slug}/${it.id}: unknown photoStyle "${it.photoStyle}"`);
        if (!fs.existsSync(path.join(ROOT, 'assets', 'brands', slug, it.photo))) {
          problems.push(`${slug}/${it.id}: missing asset ${it.photo}`);
        }
      }
      for (const g of (it.groups || [])) {
        groups++;
        const n = (g.options || []).length;
        options += n;
        for (const o of (g.options || [])) {
          if (typeof o.price !== 'number') problems.push(`${slug}/${it.id}/${g.id}/${o.id}: option price is not a number`);
        }
        /* a cap above the option count prints "Optional · up to 8" over four checkboxes */
        if (g.max != null && g.max > n) warnings.push(`${slug}/${it.id}/${g.id}: max ${g.max} exceeds ${n} options`);
        if (g.min != null && g.min > n) problems.push(`${slug}/${it.id}/${g.id}: min ${g.min} exceeds ${n} options`);
      }
      if (!(it.groups || []).length) problems.push(`${slug}/${it.id}: no modifier groups`);
      if (it.scarce !== undefined) {
        if (typeof it.scarce !== 'string' || it.scarce.length < 8) problems.push(`${slug}/${it.id}: scarce must be a reason, not ${JSON.stringify(it.scarce)}`);
        scarce++;
      }
    }
  }
  /* `(sec.items || [])` for the same reason as the guards above: a section authored
     without an items array is RECORDED as a problem further up and then walked past,
     so dereferencing it here died mid-walk with an anonymous TypeError and threw away
     every problem already collected from every other store — an author fixing a batch
     of menus saw one stack trace per run instead of the list. */
  const allItems = m.menu.reduce((a, sec) => a.concat(sec.items || []), []);
  const scarceHere = allItems.filter(it => it.scarce).length;
  const itemsHere = allItems.length;
  if (scarceHere > itemsHere * 0.25) {
    problems.push(`${slug}: ${scarceHere} of ${itemsHere} items can run out — over the 25% ceiling`);
  }

  for (const asset of ['logo.webp', 'hero.webp']) {
    if (!fs.existsSync(path.join(ROOT, 'assets', 'brands', slug, asset))) problems.push(`${slug}: missing ${asset}`);
  }

  /* ratingCount is the strongest signal of chain-vs-independent in the whole feed
     (local-bible.json: independents are three digits, never four or five), and two
     stores sitting side by side with the same count reads as placeholder data. */
  const [lo, hi] = m.local ? [38, 999] : [20000, 400000];
  if (typeof m.ratingCount !== 'number' || m.ratingCount < lo || m.ratingCount > hi) {
    warnings.push(`${slug}: ratingCount ${m.ratingCount} outside the ${m.local ? 'independent' : 'chain'} band ${lo}-${hi}`);
  }
  if (ratingSeen.has(m.ratingCount)) warnings.push(`${slug}: ratingCount ${m.ratingCount} collides with ${ratingSeen.get(m.ratingCount)}`);
  else ratingSeen.set(m.ratingCount, slug);

  out[slug] = m;
}

/* A bundle missing a store is a silent corruption, and so is one carrying a duplicate
   item id or a price that is not a number — the app renders NaN and nobody notices.
   Everything in `problems` stops the write; previously only the first case did, and
   the rest were printed under a heading and shipped with exit code 0. */
if (Object.keys(out).length !== files.length || problems.length) {
  const short = Object.keys(out).length !== files.length
    ? 'bundled ' + Object.keys(out).length + ' of ' + files.length + ' menus'
    : problems.length + ' validation ' + (problems.length === 1 ? 'problem' : 'problems');
  console.error('\nREFUSING TO WRITE: ' + short + '.');
  problems.forEach(p => console.error('  ! ' + p));
  warnings.forEach(w => console.error('  ~ ' + w));
  process.exit(1);
}

/* Fields the SOURCE is the record of and the RUNTIME never reads. imagePrompt is
   kept verbatim in js/data/menus/*.json by doctrine — it records what was actually
   sent to the image model, including where the prompt and the pixels disagree —
   but no screen has ever read it, and at ~97 KB it was 7.6% of what every visitor
   downloads. It is also the only thing in this app that produces a line over 1 KB:
   the longest single prompt is 1,781 characters, and CLAUDE.md's rule about long
   lines existed with nothing enforcing it. photoStyle is the same case; the smoke
   test asserts the exact amateur/studio split against the sources instead of the bundle. */
const BUILD_ONLY = ['imagePrompt', 'photoStyle'];
let stripped = 0;
for (const m of Object.values(out)) {
  for (const sec of m.menu) {
    for (const it of sec.items) {
      for (const k of BUILD_ONLY) {
        if (it[k] !== undefined) { delete it[k]; stripped++; }
      }
    }
  }
}

/* Hash the SOURCES, not the output. Until now this file's only claim was its store
   count, so editing a price and forgetting `npm run bundle` shipped a stale app
   that every check agreed with. smoke.cjs recomputes this over the same files. */
const srcHash = crypto.createHash('sha256');
for (const f of files) srcHash.update(f).update(fs.readFileSync(path.join(DIR, f)));
/* The builder is a source too: a change to what gets stripped or how the JSON is
   laid out is as stale-making as a price edit, and used to leave the hash agreeing
   with a bundle no longer produced by the code beside it. */
srcHash.update('tools/bundle.cjs').update(fs.readFileSync(__filename));
const digest = srcHash.digest('hex');

/* Indent 1 rather than 0: some hosts choke on multi-megabyte single lines,
   and the size cost after gzip is negligible. */
const body = 'window.FB_MENUS = ' + JSON.stringify(out, null, 1) + ';\n';
/* And the OUTPUT. The source hash proves the inputs are current; it says nothing
   about whether the file below them is what those inputs produce. A price edited
   directly in the bundle, banner untouched, passed every check — every data check
   reads the sources by design, so nothing ever looked at the number the app ships.
   smoke.cjs recomputes this over everything after the banner. */
const bodyDigest = crypto.createHash('sha256').update(body).digest('hex');

const banner = `/* GENERATED by tools/bundle.cjs — do not edit. Edit js/data/menus/*.json.\n` +
  `   ${Object.keys(out).length} stores · ${items} items · ${groups} modifier groups · ${options} options\n` +
  `   sources sha256 ${digest}\n` +
  `   bundle sha256 ${bodyDigest} */\n`;
fs.writeFileSync(OUT, banner + body);

const locals = Object.values(out).filter(m => m.local).length;
console.log(`stores      ${Object.keys(out).length}  (${locals} local, ${Object.keys(out).length - locals} chain)`);
console.log(`items       ${items}  (${photos} photographed: ${amateur} amateur, ${studio} studio)`);
console.log(`modifiers   ${groups} groups / ${options} options`);
console.log(`scarcity    ${scarce} items can run out`);
console.log(`bundle      ${(fs.readFileSync(OUT).length / 1024).toFixed(0)} KB -> js/data/menus.generated.js  (${stripped} build-only fields stripped)`);
if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.slice(0, 40).forEach(w => console.log('  ~ ' + w)); }
else console.log('\nno problems');
