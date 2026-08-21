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
let bytes = 0;
(function walk(dir) {
  for (const e of fs.readdirSync(dir)) {
    const p = path.join(dir, e);
    if (fs.statSync(p).isDirectory()) { walk(p); continue; }
    const ext = path.extname(p);
    if (!MIME[ext]) continue;
    const key = path.relative(ROOT, p).split(path.sep).join('/');
    const small = path.join(SMALL, key.replace(/^assets\//, ''));
    const src = fs.existsSync(small) ? small : p;
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

/* ---- shell: reuse index.html's own ordered style/script lists ---- */
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const styles = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
if (!styles.length || !scripts.length) throw new Error('could not find styles/scripts in index.html');

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

fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
fs.writeFileSync(OUT, out);
console.log('images inlined  ' + Object.keys(assets).length + '  (' + (bytes / 1024 | 0) + ' KB)');
console.log('css             ' + (css.length / 1024 | 0) + ' KB');
console.log('js + menus      ' + (js.length / 1024 | 0) + ' KB');
console.log('output          ' + (out.length / 1048576).toFixed(2) + ' MB -> build/foodbang.html');
