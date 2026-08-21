# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## FoodBang — working notes

A satirical, entirely fictional food-delivery app. Static site, no framework, no build step,
no dependencies. See `README.md` for what it is; this file is for editing it.

## Commands

```bash
npm start          # preview on http://127.0.0.1:8899 (no-cache server; other port: node tools/serve.mjs 9000)
npm run bundle     # js/data/menus/*.json  ->  js/data/menus.generated.js   (npm run build is an alias)
npm run artifact   # bundle, then single-file build  ->  build/foodbang.html
npm test           # smoke-test the invariants below (exits 1 on regression)
npm run check      # rebundle, then smoke-test
node tools/rebrand.cjs --dry   # preview an app-wide rename
```

There is no linter, no test framework and no watch mode, deliberately. `npm test` is one script
(`node tools/smoke.cjs`) whose eight checks always run together — there is no way to run a single
one short of editing the file.

Deployed from `main` at repo root via GitHub Pages. Pushing to `main` redeploys.

## Layout

```
index.html            shell: phone frame, status bar, tab bar, and the ordered <script> list
css/tokens.css        64 design tokens — light/dark, three-state theming
css/app.css           component library      css/screens.css   per-screen styles
js/core/              util · icons · state · catalog · fees · cart      (no DOM access)
js/ui/                shell (router/sheets/toasts) · components · item sheet · 15 screens
js/sim/               tracker.js (TRACKR™)   bodymax.js (BODYMAX™ — and the 16th screen)
js/app.js             boot: catalog.init -> shell.init -> nav.go('home') -> tracker.resume
js/data/menus/*.json  one file per restaurant — THE source of truth
assets/app/cat/*.webp 14 category tiles (the photographic ones on Home and Search)
tools/                bundle.cjs · build-artifact.cjs · rebrand.cjs · serve.mjs · smoke.cjs
tools/*-bible.json    the art-direction + pricing briefs the content was generated from
tools/retired-brands.json  names this app has stopped using; npm test greps for them
```

## Architecture

**One global, `FB`, assembled by load order.** Every file is
`window.FB = window.FB || {}; (function (FB) { … })(window.FB)` and hangs its API off `FB`. The
ordered `<script>` list in `index.html` is the only dependency graph there is, so a new file goes
there, after whatever it uses. Nothing in `js/core/` touches the DOM — which is why
`tools/smoke.cjs` can `require()` `fees.js` under a stubbed `global.window` and test the pricing
headlessly.

**State is one object under one localStorage key** (`foodbang.state.v1`, `js/core/state.js`). Read
it with `FB.S()`; never assign into it. `FB.store.set(function (st) { …; return st; })` persists
(debounced 90 ms) and notifies `FB.store.sub` subscribers — that is what repaints the tab bar,
cart pill and desk stats. New fields go in `defaults()`; `migrate()` shallow-merges keys that a
saved state predates, so bump `VERSION` only for a genuinely breaking change (it wipes the save).

**Screens are self-registering and never reach into each other.**
`FB.screens.register(name, { tab, appbar, render, mount, unmount, immersive, hideCartBar, viewClass })`.
`render(params)` returns an HTML string; `mount(viewEl, params)` wires delegated listeners with
`FB.on(root, 'click', sel, fn)` — **bind through `FB.on`, never `addEventListener`**: the shell
records everything bound during a mount and unbinds it on the next paint. `#view` and `#appbar`
outlive every screen, so a listener that escapes that bookkeeping fires again on the next render,
and again on the one after that. Navigate via `FB.nav.go/replace/tab/back`, or declaratively with
the globally delegated `data-go="screen" data-params='{"slug":"x"}'` / `data-back` attributes,
which any screen can emit without knowing who handles them. After a state change a screen calls
`FB.nav.refresh()` and re-renders wholesale — scroll position is preserved, there is no diffing
and no per-component state. `unmount` exists for screens that start timers (`track`).

**Item detail is a sheet, not a screen** — `js/ui/item.js` exposes `FB.openItem` and
`FB.wireItemOpeners`. Sheets and modals (`FB.sheet`, `FB.modal`, `FB.confirm`, `FB.why`) stack in
`#overlay-root`, and `nav.back()` / Esc closes the top overlay before it pops the router stack.

**`js/core/catalog.js` owns everything derived from the menu JSON.**
`FB.catalog.init(window.FB_MENUS)` decorates each store in place with `logoSrc` / `heroSrc` /
`photoSrc`, `itemCount`, `priceFrom` and per-store flavour, then indexes every item. Pricing
(`unitPrice`, `defaultSel`, `validate`), search ranking (name > description > modifier option),
sorting and the BODYMAX nutrition estimate all live here, not in screens. Asset paths it builds
are always root-relative `assets/brands/<slug>/…` strings — the single-file build keys its inlined
asset map by exactly those strings, so an image referenced any other way silently breaks there.

**Randomness is always seeded.** `FB.seeded(key)` / `FB.hash(key)` drive feed order, "busy" flags,
recent-order counts and photo shuffles from slugs, so a re-render or reload never reshuffles the
app. Do not use `Math.random()` in a render path.

**The two sims run on a global ticker, not on their screens.** `FB.tracker.resume()` starts at boot
and keeps the active order advancing while you shop; `FB.bodymax` ingests completed orders, owns
the `bodymax` screen and its achievement flags (`app.js` fires `FB.bodymax.flag('readFees')` on any
`[data-why]` tap).

## Invariants — these are easy to break silently

**`js/data/menus.generated.js` is generated.** Never hand-edit it. Edit `js/data/menus/*.json`
and run `npm run bundle`. The bundler validates as it builds (required fields, duplicate ids,
missing assets, non-numeric prices, items with no modifier groups) and **refuses to write a
partial bundle**.

**Classic scripts only, `FB` namespace.** No ES modules, no imports — the app must run from
`file://` as well as over http. Add a new file to the ordered `<script>` list in `index.html`.

**Only restaurant *logos* contain text.** Heroes and all 120 menu photos were generated with an
explicit no-text clause. Consequence: renaming a restaurant requires regenerating exactly one
image (its logo); its entire photo set survives. Renaming the *app* requires regenerating nothing.

**The amateur/studio photo split is deliberate.** 75 of 120 menu photos are staff-phone-style
(styrofoam, flash hotspot, fluorescent cast, crooked framing); 45 are chain marketing shots.
That mix is the realism, not an inconsistency. Recipe: `tools/local-bible.json`
→ `amateurPhotoRecipe`. Do not "clean them up."

**Fee order matters.** `js/core/fees.js` computes: subtotal → discounts → itemised fee stack →
Peak Demand ×1.4 applied to the *whole stack* → tax on (subtotal + fees) → tip on the *subtotal*
→ round total up to the next $5. Reordering these breaks the joke, which is that $12 of food
lands at exactly $60.00. `FB.fees.compute(ctx)` is pure — no DOM, no state reads beyond
`ctx.settings` — keep it that way, it is the only thing under direct test. `npm test` asserts the
$60.00, the multiplier landing on the whole stack, and the tip being computed on the subtotal.

**Every fee needs an entry in `FEE_WHY`, keyed by the fee's `id`.** `components.js` only renders
the `?` when `FB.FEE_WHY[l.id]` exists, so a mismatch doesn't crash — the explanation just
silently disappears. `npm test` walks six contexts (delivery, pickup, BANG+ above and below the
waiver, express + scheduled, and the three fee-bearing privacy settings) covering 25 distinct ids.
Add a fee on a new branch and add its context to that list, or nothing will ever check it.

**The app's own logo is drawn, not photographed.** `FB.mark` / `FB.markTile` / `FB.lockup` in
`js/core/icons.js` emit inline SVG in `currentColor` on a tile tinted by `--fb`; `FB.installFavicon`
builds the tab icon from the same path data. There is deliberately no logo *asset*: a raster mark
would make renaming the app an image job again, and a linked `.svg` favicon does not survive being
inlined into the single-file build. Restaurant logos stay raster — only the app's own identity is
code.

**Run `npm test` before committing.** It covers all of the above plus asset presence (including
zero-byte dataless files), the amateur/studio photo mix, every item being orderable, and stale
brand strings after a rename.

## Rebranding

`tools/rebrand.cjs` moves the app's own identity in one pass. Its `FROM` block tracks the
*current* state and the script rewrites itself as it runs (it is inside its own walk), so
successive renames stay accurate — edit only `TO`. Rules are derived from `ns` / `courier` / `sub`,
so CSS classes, settings keys, data fields and asset filenames follow automatically. Restaurants
are excluded by design; `menus.generated.js` and `tools/retired-brands.json` are skipped.

**Every rule must be derived from `FROM`, never spelled out.** A literal `/\bGorger\b/` cannot
rewrite itself — the backslashes on either side kill the word boundaries — so a hard-coded rule
silently stays pointed at an identity two renames old while the live one goes unrenamed. Same trap
in `smoke.cjs`: its stale-brand needles live in `tools/retired-brands.json` because, written inline,
the courier rule would rewrite them and the check would start hunting for the *current* brand in
every file. `rebrand.cjs` appends the outgoing identity to that file as it runs.

After a rename: `npm run bundle && npm run artifact`, and rename the repo if the slug changed
(GitHub redirects the repo URL but **not** the Pages path).

## Environment gotchas

**iCloud eviction.** This project sits under `~/Documents` on a near-full disk, so macOS
sometimes evicts file contents: `stat` reports the real size but `readFileSync` returns zero
bytes and `ls -lO` shows `dataless`. Both build scripts detect a short read, run
`brctl download`, and fail loudly rather than shipping a smaller app. Manual fix:
`brctl download .` from the repo root.

**Artifact publishing needs short lines.** A multi-megabyte single line makes a published
Artifact render as a blank frame with `SyntaxError: Invalid or unexpected token`. It works
locally and in a plain iframe, so local testing will not catch it. `build-artifact.cjs` emits
base64 in 480-char chunks and `bundle.cjs` writes indented JSON; keep every line under ~1 KB.
The build also injects a visible boot-failure banner — keep it, it is the only way to see an
error inside the artifact frame.

**`build-artifact.cjs` parses `index.html` with regexes.** It reads the CSS/JS lists from
`<link rel="stylesheet" href="…">` and `<script src="…"></script>` matches, and takes the body as
everything between `<body>` and the first `<script src=`. Keep those tags one-per-line in that
exact attribute shape, and keep all `<script src>` tags below the markup, or the single-file build
loses files or duplicates markup without erroring.

## Tone

Deadpan corporate-dystopian. The satire lives in the pricing structure and the modifier
groups, never in zany dish names. Brands believe in themselves completely and never wink.
Declining something costs money and is given a bureaucratic justification. When adding copy,
match `tools/brand-bible.json` → `app.voice`.
