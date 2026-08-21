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
node tools/rebrand.cjs --dry         # preview an app-wide rename
node tools/rebrand.cjs --selfcheck   # prove no rule leaves the outgoing brand behind
```

There is no linter, no test framework and no watch mode, deliberately. `npm test` is one script
(`node tools/smoke.cjs`) whose thirty-four checks always run together — there is no way to run a
single one short of editing the file. `tools/harness.cjs` loads the whole app into a `vm` realm
behind a stub document, which is what lets the UI checks render every screen headlessly; it also
exposes `clock.set(ts)` for travelling in time. **`makeOrder` runs in Node's realm and does not see
`clock.set` — pass `opts.now` or the fixture is stamped with the test machine's wall clock.** `node tools/rebrand.cjs --selfcheck` is separate and is only
worth running after editing that file's rules.

Deployed from `main` at repo root via GitHub Pages. Pushing to `main` redeploys.

## Layout

```
index.html            shell: phone frame, status bar, tab bar, and the ordered <script> list
css/tokens.css        67 design tokens — light/dark, three-state theming; --fs scales the type ramp
css/app.css           component library      css/screens.css   per-screen styles
js/core/              util · world · icons · state · latency · notifs · catalog · fees · scrip · tos · cart
js/ui/                shell (router/sheets/toasts) · components · item sheet · 16 screens
js/sim/               roster.js (the nine Slingers) · standing.js · tracker.js (TRACKR™) · bodymax.js
js/app.js             boot: catalog.init -> shell.init -> nav.go('home') -> tracker.resume
js/data/menus/*.json  one file per restaurant — THE source of truth
assets/app/cat/*.webp 14 category tiles (the photographic ones on Home and Search)
tools/                bundle.cjs · build-artifact.cjs · harness.cjs · rebrand.cjs · serve.mjs · smoke.cjs
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
cart pill and desk stats. **New fields go in `defaults()` and nothing else is required**:
`fillDefaults()` backfills every key a save is missing at any depth, so adding a field is safe
against every existing save. Plain objects only — an array in a save is the user's data and is
never merged into. **Do not bump `VERSION` to add a field.** A bump runs the `MIGRATIONS` ladder,
and a rung that does not exist still falls back to wiping the save; add a rung only for a
genuinely breaking *reshape*. `persist()` reports the first storage failure through
`FB.store.onStorageError`, which `app.js` voices — core must not reach for `FB.toast` itself.

**The world is a pure function of the clock.** `FB.world.at(ts)` (`js/core/world.js`) buckets time
into 20 minutes and derives daypart, weather, surge and `kitchenLoad(slug)` from `FB.seeded` on the
bucket. It stores nothing and ticks nothing, which is why leaving for a week is automatically
correct. Two rules: **read it at render, never on `catalog.decorate()`** (which runs once at boot,
so a stamped value is wrong for a tab left open), and never let it reorder the feed — a store list
that reshuffles under a thumb at a bucket boundary is a bug. `at()` deliberately does not echo back
the timestamp it was given, because idempotence inside a bucket is the property under test.

**Interactions wait.** `js/core/latency.js` gives each kind of interaction a small millisecond
range and draws from it seeded on a call counter. The ranges are asymmetric on purpose — adding to
a cart is quick, taking something out is not, and cancelling a membership is the slowest thing in
the app. `FB.busy(el, kind, fn)` is the visible half and also guards against a double fire. Only
things that would really leave the building wait; anything a real app answers optimistically (the
qty stepper, the tip selector, form validation) stays instant.

**Screens are self-registering and never reach into each other.**
`FB.screens.register(name, { tab, appbar, render, mount, unmount, immersive, hideCartBar, viewClass })`.
`render(params)` returns an HTML string; `mount(viewEl, params)` wires delegated listeners with
`FB.on(root, 'click', sel, fn)` — **bind through `FB.on`, never `addEventListener`**, which
`npm test` now greps for. Two things stop a listener outliving its screen: the shell records
everything bound during a mount and unbinds it on the next paint, *and* `paint()` replaces the
`#view` and `#appbar` nodes outright, so the old elements and everything attached to them are
garbage. The node is replaced rather than wrapped because `#view` is the scroll container —
screens read `root.scrollTop` and bind `root` `'scroll'`, and a non-scrolling wrapper would break
both silently. Navigate via `FB.nav.go/replace/tab/back`, or declaratively with the globally
delegated `data-go="screen" data-params='{"slug":"x"}'` / `data-back` attributes, which any screen
can emit without knowing who handles them. After a state change a screen calls `FB.nav.refresh()`
and re-renders wholesale — scroll position is preserved, keyboard focus is restored by signature
when the session is keyboard-driven, there is no diffing and no per-component state. `unmount`
exists for screens that start timers (`track`).

**A `<span>` with block children is a bug.** Padding, `max-width` and `text-overflow` on an inline
box do not reach block-level children, which escape it — this has now bitten the app-bar address
line and the promo cards. If a wrapper is styled as a box, give it `display: block`.

**Item detail is a sheet, not a screen** — `js/ui/item.js` exposes `FB.openItem` and
`FB.wireItemOpeners`. Sheets and modals (`FB.sheet`, `FB.modal`, `FB.confirm`, `FB.why`) stack in
`#overlay-root`, and `nav.back()` / Esc closes the top overlay before it pops the router stack.

**`js/core/catalog.js` owns everything derived from the menu JSON.**
`FB.catalog.init(window.FB_MENUS)` decorates each store in place with `logoSrc` / `heroSrc` /
`photoSrc`, `itemCount`, `priceFrom` and per-store flavor, then indexes every item. Pricing
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

**Never hand-edit `js/data/menus.generated.js`.** Edit `js/data/menus/*.json` and run
`npm run bundle`. The bundler validates as it builds (required fields, duplicate ids, missing
assets, non-numeric prices, items with no modifier groups) and **refuses to write a partial
bundle**. See also the source-hash note above.

**Classic scripts only, `FB` namespace.** No ES modules, no imports — the app must run from
`file://` as well as over http. Add a new file to the ordered `<script>` list in `index.html`.

**Only restaurant *logos* contain text.** Heroes and all 120 menu photos were generated with an
explicit no-text clause. Consequence: renaming a restaurant requires regenerating exactly one
image (its logo); its entire photo set survives. Renaming the *app* requires regenerating nothing.

**The amateur/studio photo split is deliberate.** 87 of 120 menu photos are staff-phone-style
(styrofoam, flash hotspot, fluorescent cast, crooked framing); 33 are chain marketing shots. That
mix is the realism, not an inconsistency. Recipe: `tools/local-bible.json` → `amateurPhotoRecipe`.
Do not "clean them up."

**Every photo states its `photoStyle`; absence is not a value.** 45 photos used to carry no
`photoStyle` at all, so "not amateur" silently meant "studio" — and seven that *were* labelled
amateur are visibly studio work. All 120 were classified by eye in Aug 2026; `bundle.cjs` now
refuses to build a photo without the field, and `npm test` asserts the exact 87/33 split rather
than a band wide enough to hide the drift. All six independents are amateur-only by doctrine
(`tools/local-bible.json` -> `independentDoctrine`). Each manifest entry carries a `styleObserved`, and a
`promptDrift` note where the recorded prompt disagrees with the pixels — 54 chain photos were
reshot in amateur style and the prompt was never updated, six came back studio from an amateur
brief. The prompts stay verbatim: they record what was actually sent.

**Fee order matters.** `js/core/fees.js` computes: subtotal → discounts → itemized fee stack →
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

**The order runs on a wall clock.** `FB.tracker.build(o)` gives an order an absolute timetable at
placement — every beat with a real timestamp, plus a `deliverAt` — and `tick()` replays whatever is
in the past, so catching up after an absence is the same code path as running live. One simulated
minute is `SIM_MS_PER_MIN` (2 s) of real time. Three rules that are easy to undo: replayed beats
are stamped from the **timetable**, never `Date.now()` (or a catch-up collapses the whole feed onto
one second); `resume()` catches up with `{catchUp:true}` so an order that finished while nobody was
here does not fire a toast; and `deliveredAt` records when it happened, not when it was noticed. A
scheduled order's clock starts at its slot. Pickup has its own script and step labels.

**`js/data/menus.generated.js` is generated, and is not the source of truth.** `bundle.cjs` strips
`BUILD_ONLY` fields (`imagePrompt`, `photoStyle`) — they stay verbatim in the JSON by doctrine but
no screen reads them, and `imagePrompt` was the only thing in the app producing a line over 1 KB.
It also stamps a sha256 of the sources into the banner, and `npm test` recomputes it, so a
forgotten `npm run bundle` is a red test rather than a wrong price. **Data checks read
`js/data/menus/*.json`, never the bundle.**

**Every fee goes through `fees.compute`, or it cannot be explained.** The `FEE_WHY` walk only reads
what `compute` returns, so a charge applied anywhere else can never be covered by it — which is why
the restock notification, the tip-reduction review and the substitution are `ctx` branches rather
than arithmetic at the call site. Add the fee, add its `FEE_WHY` entry, add a context to the list in
`smoke.cjs`, and thread the `ctx` field through **both** compute call sites (`checkout.js` `calc()`
*and* `cart-screen.js`) or the cart preview quotes a total checkout will not charge. Gate every new
fee on a `ctx` field the headless $12 context does not pass, so the $60.00 case cannot acquire it.

**`fees.js` may not reference another module.** `smoke.cjs` requires it with only `util.js` loaded,
so a lookup into `FB.world`, `FB.standing`, `FB.tos` or `FB.scrip` throws at require time and takes
the one thing under direct test with it. Tables the other modules need live *here* and are read back
off `FB.fees` — that is why `STANDING_UPKEEP` and the scrip constants are in this file.

**Three ledgers record what an order cost**, and any change after placement must patch all of them:
the order's own `calc`, `st.meta.lifetime*`, and the frozen `st.bodymax.history` row. `FB.adjustOrder`
in `js/ui/orders.js` is the only thing that should — `FB.adjustTip` and the incident resolver both go
through it, and the invariant is tested against that function rather than a copy of it.

**Rename hazards live in identifiers, not just prose.** `tools/rebrand.cjs` rewrites the courier noun
wherever it appears as a word, so a *filename* containing it breaks the app (the `<script src>` string
is rewritten; the file on disk is not), and a camelCase suffix slips past the word boundary and
carries the outgoing brand forever. That is why the roster file is `roster.js` and the order field is
`personId`. `--selfcheck` finds both; run it after adding a subsystem, not just after editing `RULES`.

**Run `npm test` before committing.** Thirty-four checks. Beyond the original thirteen they cover:
every screen rendering under six state fixtures × two hours with no `undefined`/`NaN` in the markup;
accessible names in that markup; nested backfill of an old save; Hunger never lowering a price or
pre-selecting a refusal; single-use promo codes; no unseeded randomness outside `util.js`; latency
staying small and buyable; the world clock's idempotence; the wall-clock order lifecycle including
catch-up, pickup, scheduling and legacy saves; store hours surviving midnight; notifications
back-dating without duplicating; Standing's ladder and decay; the BANG+ ledger and BangBux expiry;
the cancellation flow growing; the terms getting worse and taking §4.2 with them; no two orders
telling the same story; store promotions moving a total; scarcity that never guts a menu; the roster
and a revised tip keeping three ledgers in agreement; a mid-order incident answered exactly once; and
the artifact build's regex contract plus its 1 KB line limit.

## Rebranding

`tools/rebrand.cjs` moves the app's own identity in one pass. Its `FROM` block tracks the
*current* state and the script rewrites itself as it runs (it is inside its own walk), so
successive renames stay accurate — edit only `TO`. Rules are derived from `ns` / `courier` / `sub`,
so CSS classes, settings keys, data fields and asset filenames follow automatically. Restaurants
are excluded by design; `menus.generated.js` and `tools/retired-brands.json` are skipped.

**`--selfcheck` is how you know the rules are complete.** It rebuilds every rule against a
synthetic identity, applies them to every file in memory, and lists each place a `FROM` value
survives the pass. Run it after editing `RULES`; it writes nothing. It is what found the promo-code
prefix (`FROM.sub` ends in `+`, which escapes to a literal plus and so can never match a code) and
the namespace CSS classes (`.fb-tile`, `.fb-word`, `data-fb-mark`, which the `--fb` token rule does
not cover). It also means this file must not spell a brand out even in prose, because the check
cannot tell a comment from code — which is the right instinct anyway.

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
