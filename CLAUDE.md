# FoodBang — working notes

A satirical, entirely fictional food-delivery app. Static site, no framework, no build step,
no dependencies. See `README.md` for what it is; this file is for editing it.

## Commands

```bash
npm start          # preview on http://127.0.0.1:8899 (no-cache server)
npm run bundle     # js/data/menus/*.json  ->  js/data/menus.generated.js
npm run artifact   # single-file build     ->  build/foodbang.html
node tools/rebrand.cjs --dry   # preview an app-wide rename
```

Deployed from `main` at repo root via GitHub Pages. Pushing to `main` redeploys.

## Layout

```
index.html            shell: phone frame, status bar, tab bar
css/tokens.css        64 design tokens — light/dark, three-state theming
css/app.css           component library      css/screens.css   per-screen styles
js/core/              util · icons · state · catalog · fees · cart
js/ui/                shell (router/sheets/toasts) · components · 12 screens
js/sim/               tracker.js (TRACKR™)   bodymax.js (BODYMAX™)
js/data/menus/*.json  one file per restaurant — THE source of truth
tools/                bundle.cjs · build-artifact.cjs · rebrand.cjs · serve.mjs
tools/*-bible.json    the art-direction + pricing briefs the content was generated from
```

## Invariants — these are easy to break silently

**`js/data/menus.generated.js` is generated.** Never hand-edit it. Edit `js/data/menus/*.json`
and run `npm run bundle`. The bundler validates as it builds (required fields, duplicate ids,
missing assets, non-numeric prices) and **refuses to write a partial bundle**.

**Classic scripts only, `FB` namespace.** No ES modules, no imports — the app must run from
`file://` as well as over http. Add a new file to the ordered `<script>` list in `index.html`.

**Screens are self-registering.** `FB.screens.register(name, { tab, appbar, render, mount,
unmount, immersive })`. `render` returns an HTML string; `mount` wires delegated listeners. A
screen never reaches into another screen.

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
lands at exactly $60.00. There is a smoke test for that number in the README.

**Every fee needs an entry in `FEE_WHY`.** The `?` next to a fee line reads from it; a fee
without one renders a dead button.

## Rebranding

`tools/rebrand.cjs` moves the app's own identity in one pass. Its `FROM` block tracks the
*current* state and the script rewrites itself as it runs, so successive renames stay accurate —
edit only `TO`. Rules are derived from `ns` / `courier` / `sub`, so CSS classes, settings keys,
data fields and asset filenames follow automatically. Restaurants are excluded by design.

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

## Tone

Deadpan corporate-dystopian. The satire lives in the pricing structure and the modifier
groups, never in zany dish names. Brands believe in themselves completely and never wink.
Declining something costs money and is given a bureaucratic justification. When adding copy,
match `tools/brand-bible.json` → `app.voice`.
