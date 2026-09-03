/* Inlines the whole app — CSS, JS, menu bundle and every image — into one
   self-contained HTML file that runs anywhere with no server.
   Images come from build/artifact-assets (re-encoded smaller) when present.
   node tools/build-artifact.cjs  ->  build/foodbang.html */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'build', 'foodbang.html');
const SMALL = path.join(ROOT, 'build', 'artifact-assets');
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

/* ---- every image as a data URI, keyed by the path the app already requests ---- */
const assets = {};
const stale = [];   /* cache entries older than the asset they stand in for */
let bytes = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    const ext = path.extname(p);
    if (!MIME[ext]) continue;
    const key = path.relative(ROOT, p).split(path.sep).join('/');
    const small = path.join(SMALL, key.replace(/^assets\//, ''));
    /* The cache has to prove it is at least as new as the source it stands in for.
       Preferring it on existence alone silently shipped every regenerated asset's
       OLD bytes: three La Taqueria Verdadera reshoots were inlined from a cache four
       hours older than the files on disk, so the served site showed the new
       photographs and the published artifact showed the ones they replaced. Falling
       back rather than throwing keeps the build working and makes the divergence
       impossible to miss. */
    let src = p;
    if (fs.existsSync(small)) {
      if (fs.statSync(small).mtimeMs >= fs.statSync(p).mtimeMs) src = small;
      else stale.push(key);
    }
    let buf = fs.readFileSync(src);
    /* macOS evicts file contents to iCloud when the disk fills — stat reports the
       real size but the read comes back empty. An empty inline is a silently
       broken image, so pull it back rather than shipping a blank tile. */
    if (buf.length !== fs.statSync(src).size) {
      try { require('child_process').execSync('brctl download ' + JSON.stringify(src), { stdio: 'ignore' }); } catch (_) {}
      buf = fs.readFileSync(src);
    }
    if (!buf.length) throw new Error('unreadable asset: ' + src);
    bytes += buf.length;
    assets[key] = 'data:' + MIME[ext] + ';base64,' + buf.toString('base64');
  }
})(path.join(ROOT, 'assets'));

/* Cache entries whose asset no longer exists. The walk above is driven by `assets/`,
   so an orphan is never consulted and never inlined — it is dead disk rather than a
   broken build, which is exactly why it goes unnoticed. Four survived two renames
   (`gorger-1..3`, `gorgeplus-hero`) because nothing prunes the cache when an asset is
   renamed or removed. Reported, not deleted: this directory is regenerable and a
   build has no business removing files. */
const orphans = [];
(function sweep(dir, rel) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    const r = rel ? rel + '/' + e : e;
    if (fs.statSync(p).isDirectory()) { sweep(p, r); continue; }
    if (!fs.existsSync(path.join(ROOT, 'assets', r))) orphans.push(r);
  }
})(SMALL, '');
if (orphans.length) {
  console.warn('artifact-assets holds ' + orphans.length + ' entry(s) for assets that no longer exist:');
  orphans.slice(0, 8).forEach((k) => console.warn('  ' + k));
  if (orphans.length > 8) console.warn('  …and ' + (orphans.length - 8) + ' more');
  console.warn('  (harmless — they are never inlined — but `rm -rf build/artifact-assets` clears them)');
}

if (stale.length) {
  console.warn('artifact-assets is stale for ' + stale.length + ' file(s); inlined the full-size original instead:');
  stale.forEach((k) => console.warn('  ' + k));
  console.warn('  (regenerate the cache, or delete build/artifact-assets to stop using it)');
}

/* ---- shell: reuse index.html's own ordered style/script lists ---- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!styles.length || !scripts.length) throw new Error('could not find styles/scripts in index.html');
/* The strict shape above is what this build reads; the loose one is what index.html
   actually contains. They used to be allowed to disagree, and the guard fired only at
   ZERO — so one reformatted <link> shipped a single-file build missing a stylesheet,
   half-styled, without a word. Remote links (the web fonts) are excluded on purpose:
   the artifact re-emits those itself. */
const localLinks = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)]
  .map(m => m[0]).filter(t => !/href="https?:/.test(t));
if (localLinks.length !== styles.length) {
  throw new Error('index.html has ' + localLinks.length + ' local stylesheet link(s) but only ' +
    styles.length + ' match the shape this build reads (<link rel="stylesheet" href="…">)');
}
for (const f of styles.concat(scripts)) {
  if (!fs.existsSync(path.join(ROOT, f))) throw new Error('index.html references a missing file: ' + f);
}

const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('<script src=')).replace(/\s+$/, '');
const css = styles.map(f => '/* ' + f + ' */\n' + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
const js = scripts.map(f => '/* ' + f + ' */\n' + fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n;\n');

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">' +
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..900&family=Archivo:wght@600;700;800;900&display=swap" rel="stylesheet">';

/* Every image is inlined, so intercept the relative paths the app already uses
   and swap them at assignment time. innerHTML-created <img> bypasses the
   property hook, so a MutationObserver sweeps those. */
const SHIM = [
  '(function () {',
  '  var MAP = window.__FB_ASSETS;',
  '  function map(v) { if (typeof v !== "string") return v; var k = v.replace(/^\\.\\//, ""); return MAP[k] || v; }',
  '  var d = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, "src");',
  '  Object.defineProperty(HTMLImageElement.prototype, "src", {',
  '    get: function () { return d.get.call(this); },',
  '    set: function (v) { d.set.call(this, map(v)); },',
  '    configurable: true });',
  '  var setAttr = Element.prototype.setAttribute;',
  '  Element.prototype.setAttribute = function (n, v) {',
  '    if (n === "src" && this.tagName === "IMG") v = map(v);',
  '    return setAttr.call(this, n, v); };',
  '  function sweep() {',
  '    var imgs = document.querySelectorAll("img[src]:not([data-fbm])");',
  '    for (var i = 0; i < imgs.length; i++) {',
  '      var im = imgs[i], raw = im.getAttribute("src");',
  '      im.setAttribute("data-fbm", "");',
  '      var m = map(raw); if (m !== raw) setAttr.call(im, "src", m); } }',
  '  new MutationObserver(sweep).observe(document.documentElement, { childList: true, subtree: true });',
  '  document.addEventListener("DOMContentLoaded", sweep); sweep();',
  '})();',
].join('\n');

/* A single-file build has no devtools for the reader. If boot throws, say so on
   the page instead of showing an empty frame. */
const GUARD = [
  '<div id="__fberr" style="display:none;position:fixed;inset:0;z-index:9999;background:#0B0B0D;color:#F4F4F7;',
  'font:14px/1.6 ui-monospace,monospace;padding:32px;overflow:auto;white-space:pre-wrap"></div>',
  '<script>(function(){',
  '  function show(msg){var e=document.getElementById("__fberr");if(!e)return;',
  '    e.style.display="block";e.textContent="FoodBang failed to start.\\n\\n"+msg;}',
  '  window.addEventListener("error",function(ev){',
  '    show((ev.message||"error")+"\\n  at line "+(ev.lineno||"?")+":"+(ev.colno||"?")+',
  '      (ev.error&&ev.error.stack?"\\n\\n"+ev.error.stack:""));});',
  '  window.addEventListener("unhandledrejection",function(ev){show("unhandled rejection: "+ev.reason);});',
  '})();<\/script>',
].join('');

/* A multi-megabyte single line does not survive every pipeline this file may
   pass through, so the base64 goes out in short chunks joined at runtime. */
function assetScript(map) {
  const CHUNK = 480;
  const lines = ['window.__FB_ASSETS = (function () { var a = {};'];
  for (const key of Object.keys(map)) {
    const v = map[key];
    const parts = [];
    for (let i = 0; i < v.length; i += CHUNK) parts.push('"' + v.slice(i, i + CHUNK) + '"');
    lines.push('a[' + JSON.stringify(key) + '] = [');
    lines.push(parts.join(',\n'));
    lines.push('].join("");');
  }
  lines.push('return a; })();');
  return lines.join('\n');
}

/* keep the tab title identical to index.html rather than a second copy that drifts */
const title = (html.match(/<title>([\s\S]*?)<\/title>/) || [, 'FoodBang'])[1];
const themeColor = (html.match(/<meta name="theme-color"[^>]*>/) || [''])[0];

/* The published Artifact wraps this file in its own <!doctype>/<head> skeleton, so
   these tags are redundant there — but README tells you to open build/foodbang.html
   directly, and without them that lands in quirks mode with no viewport scaling. A
   duplicated charset/viewport inside a wrapper is harmless; quirks mode is not. */
const HEAD = '<!doctype html>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n';

const out = HEAD + '<title>' + title + '</title>\n' + themeColor + '\n' + FONTS + '\n<style>\n' + css + '\n</style>\n' + GUARD + body +
  '\n<script>\n' + assetScript(assets) + '\n</script>\n' +
  '<script>' + SHIM + '</script>\n<script>\n' + js + '\n</script>\n';

/* The one failure local testing cannot see. A line over ~1 KB renders the published
   copy as a blank frame with a SyntaxError, and works everywhere else — so the build
   refuses to write a file it knows cannot be published, rather than leaving it to a
   smoke check that only runs when a build happens to be on disk. */
const LINE_LIMIT = 1024;
let longest = 0, longestAt = 0;
out.split('\n').forEach((l, i) => { if (l.length > longest) { longest = l.length; longestAt = i + 1; } });
if (longest > LINE_LIMIT) {
  throw new Error('refusing to write: line ' + longestAt + ' is ' + longest + ' chars (limit ' + LINE_LIMIT + ') — it would not survive publishing');
}

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('images inlined  ' + Object.keys(assets).length + '  (' + (bytes / 1024 | 0) + ' KB)');
console.log('css             ' + (css.length / 1024 | 0) + ' KB');
console.log('js + menus      ' + (js.length / 1024 | 0) + ' KB');
console.log('output          ' + (out.length / 1048576).toFixed(2) + ' MB -> build/foodbang.html  (longest line ' + longest + ' chars)');
