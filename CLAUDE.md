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
(`node tools/smoke.cjs`) whose seventy-three checks always run together — there is no way to run a
single one short of editing the file. `tools/harness.cjs` loads the whole app into a `vm` realm
behind a stub document, which is what lets the UI checks render every screen headlessly; it also
exposes `clock.set(ts)` for travelling in time. **`makeOrder` runs in Node's realm and does not see
`clock.set` — pass `opts.now` or the fixture is stamped with the test machine's wall clock.**
`addToCart` adds only items that are AVAILABLE today, because scarcity's threshold samples the world
at a *local* 7 PM whose epoch moves with the zone: a fixture that scooped up a sold-out item turned
unrelated checks red in Berlin, Tokyo and Honolulu while staying green in Los Angeles. **Run the
suite under a second `TZ=` before believing it.** `mount()` only *patches* — the initial markup comes
from `render()`, so asserting a fragment straight after a mount asserts an empty stub. `node tools/rebrand.cjs --selfcheck` is separate and is only
worth running after editing that file's rules.

Deployed from `main` at repo root via GitHub Pages. Pushing to `main` redeploys.

## Layout

```
index.html            shell: phone frame, status bar, tab bar, and the ordered <script> list
css/tokens.css        67 design tokens — light/dark, three-state theming; --fs scales the type ramp
css/app.css           component library      css/screens.css   per-screen styles
js/core/              util · world · icons · state · latency · notifs · catalog · fees · scrip · tos · cart
js/ui/                shell (router/sheets/toasts) · components · item sheet · 18 screens
js/sim/               roster.js (the nine Slingers) · standing.js · tracker.js (TRACKR™) · bodymax.js · missions.js
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

**A screen that renders a `?` must call `FB.C.wireWhy(root)` in its `mount`.** The explanation is
delegated per-container, so a screen can render fifteen of them and hand back nothing — and it fails
in the worst possible way, because `app.js` delegates the "Read The Fees" achievement on *document*:
the tap fires a toast and looks handled while no explanation ever opens. It bit the pay statement,
twice over — the call was missing, and then it was placed below a `if (!run) return` that is taken on
exactly the branch that renders the statement. `npm test` now checks this generically against every
screen, so a new one is covered without being named.

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

**The amateur/studio photo split is deliberate.** 393 of 426 menu photos are staff-phone-style
(styrofoam, flash hotspot, fluorescent cast, crooked framing); 33 are chain marketing shots. That
mix is the realism, not an inconsistency. Recipe: `tools/local-bible.json` → `amateurPhotoRecipe`.
Do not "clean them up."

**Every photo states its `photoStyle`; absence is not a value.** 45 photos used to carry no
`photoStyle` at all, so "not amateur" silently meant "studio" — and seven that *were* labelled
amateur are visibly studio work. All 120 were classified by eye in Aug 2026; `bundle.cjs` now
refuses to build a photo without the field, and `npm test` asserts the exact 393/33 split rather
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
silently disappears. `npm test` walks eighteen contexts — fifteen through `compute` (delivery,
pickup, BANG+ above and below the waiver, express + scheduled, the fee-bearing privacy settings,
standing, scrip, terms, restock, tip review, substitution, hold) and three through `payout` —
covering 35 distinct ids. Add a fee on a new branch and add its context to that list, or nothing
will ever check it. The count in this paragraph went stale once already; the check reports its own
totals, so read them off a run rather than trusting the prose.

**The photograph answers to the delivery.** The app has said "Photo attached" since it shipped and
then shown one of three pictures hashed on the order id, blind to everything it already knew.
`js/core/proof.js` tags every photograph with the facets it is valid for — `drop` (leave/hand) and
`light` (day/dusk/night) — reads those off the order (`o.address.dropoff`, the hour of
`o.deliveredAt`) and picks **seeded on the order id**, so a photograph belongs to its order forever
but a 3 AM doorstep and a lunchtime office hand-off can never draw the same frame. Light is read off
the *hour* rather than `FB.world`'s daypart, because `dinner` spans 17:00–21:00 — daylight in June,
dark in December — and a doorstep photograph is about the sky, not the meal. That also keeps this
file free of a world lookup, so it requires with only `util.js`.

**A courier keeps the thermal bag.** What is left at the door is the customer's own takeout bag, and
it is paper or plastic, never the insulated one — it is the courier's own kit and it goes back on the
bike. Eleven of the first thirty-six got this wrong and were reshot; `proof-delivery-2.webp` gets it
wrong too and is deliberately **out of the pool** while staying on disk. `npm test` asserts its
absence by name, because dropping the rule would put it back silently.

**Both histories are photographic, and the collection lives in one of them.** There is no gallery
screen: a trophy case is not something this platform would build. The customer's **Orders** list
shows each delivered order's own photograph in place of the restaurant logo — every past order has
had one since the app shipped and the list showed a logo instead. Slinger Mode's **Records** tab is
the run log, which had been written and capped at forty since the mode shipped with exactly one row
ever read; each row carries its photograph, its filing category, and what the run actually paid, and
a run completed without one says so. Tapping a row opens the photograph; tapping an unphotographed
run says a photograph cannot be added later and its absence is not recorded as a fault.

**Every id in a tab bar must name a registered screen** — `nav.tab(id)` sets `current.name` to it
directly, so a tab pointing at nothing navigates to a screen that does not exist. CLAUDE.md has said
so since Slinger Mode shipped and **nothing checked it** until a fourth sling tab was added. It is
checked now, read out of `shell.js`'s own source rather than a copy of the table.

**On the courier side a delivery photograph is loot.** The same pool serves two jobs. A *customer*
is shown one photograph per order, matched to the delivery's facets — that is `FB.proof.pick(o)`. A
*courier* who finishes a run presses "Photograph the drop" and gets one from `FB.proof.roll(runId)`,
weighted by rarity. Tiers are **ROUTINE · NOTED · FLAGGED · ESCALATED · UNFILED** at
**55 / 25 / 13 / 5.5 / 1.5**, and the app never once says "rare": what the player reads is the
category the platform filed the incident under, and the platform is unimpressed by all of it.

Three rules. **The weights are TIER-level and sum to 100**, so a tier's odds are exactly its number
however many photographs sit in it — weighting per photograph instead couples the curve to the
contents and every image added silently re-tunes the game. **The roll is seeded on the run id**, so
which photograph a run yields was settled the moment the run existed: the button REVEALS it, and a
reload cannot re-roll it. Unseeded, the rarest tier becomes farmable by refreshing. **The collection
is a set and the counter is not** — a photograph seen twice is one kept and two taken.

Note what is *not* a defect: photographs are not equally likely across the whole pool under `pick`,
and cannot be. `day` covers ten hours against dusk's five, and the facet buckets differ in size, so
the structural spread is about 3x end to end. That is fine, because a customer sees one photograph
per order and is not collecting them. Evenness is the ROLL's job, and it is uniform inside a tier.

**Do not generate these on seedream.** It lost a four-model bake-off on this brief and it did not
merely default to polish — given an explicit "no warm sunset glow" it rendered a sunset anyway. Use
`openai/gpt-image-2` (the most careless framing) and `black-forest-labs/flux-2-max` (the flattest,
grainiest light), two models across the pool so forty photographs do not share one look. For **food**
the ranking inverts: flux-2-max keeps the dish legible and greasy, while gpt-image-2 pushes past
honest into inedible, which breaks `local-bible.json`'s rule that the food is still real food. And
generate at the size the app actually stores — `assets/` keeps 640px and the artifact cache 420px, so
1 MP is already generous and 4 MP is waste.

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

**Who is carrying it is decided at placement; when the app may SAY so is not.** The roster draw is
seeded on the order id and runs in `place()`, so the courier is derivable from the first moment — but
the beat that introduces them is `tag`ged `'assign'` (beats are tuples; `ev[3]` is the tag), and
`FB.tracker.assigned/assignedAt/dispatch` gate every surface on it. All three are **pure**, take
`now`, and store nothing: making assignment a state transition instead would put a write inside
`replay()`, where the hold path returns early and two tabs each running `resume()` would both
increment the roster ledger. Three rules hold this together: **absence means already-assigned** (an
order with no tagged beat is a legacy save or a fixture, so the gate can only ever withdraw a claim,
never invent a wait); the monotonic guard `(o.replayed || 0) > i` is consulted **before** the clock,
so a corrected system clock cannot un-introduce someone the feed has named; and anything keyed on the
courier is announced off the **tag**, never off the step — the tagged beat is the third of
`confirmed` and the step changed on the first, so a step-gated push never fires at all.

**A beat that names the courier may not precede the beat that introduces them.** `beatsFor` splices
`extra` beats at seeded positions; without the barrier the name leaked above its own introduction in
93 of 160 tier-2/3 orders. Matched on the tag, not on the text, so rewording a line cannot unhook it.
Each roster member also carries one habit (`FB.slingers.quirk`, keyed by roster **position** — the
hash collided into five habits across nine people), appended rather than pooled so it always plays,
and carrying **no drift**: who you got must not change what the order cost.

**An incident's deadline is bounded by the food.** It expires before the earlier of the courier
taking the bag and the advertised arrival, less `RESOLVE_MARGIN_MS`, and never offers less than
`INCIDENT_MIN_MS` — a shorter window is pulled *earlier* rather than deleted. `o.deliverAt` is
computed **above** the incident block: read a line too late it is `undefined`, the bound is `NaN`,
every comparison against it is false, and the clamp appears to work while doing nothing. The election
path shifts arrival by the hold actually offered, not by `INCIDENT_MS`.
**The shortest store drops its incident entirely, and that is the intended reading** — Dunkinn's
19-minute window cannot hold an answerable deadline, so it never runs out of anything. Nineteen of
the twenty stores are unaffected. Do not "fix" this by shrinking the floor without deciding that a
deadline shorter than the sheet takes to read is worth offering.

**`js/data/menus.generated.js` is generated, and is not the source of truth.** `bundle.cjs` strips
`BUILD_ONLY` fields (`imagePrompt`, `photoStyle`) — they stay verbatim in the JSON by doctrine but
no screen reads them, and `imagePrompt` was the only thing in the app producing a line over 1 KB.
It also stamps a sha256 of the sources into the banner, and `npm test` recomputes it, so a
forgotten `npm run bundle` is a red test rather than a wrong price. **Data checks read
`js/data/menus/*.json`, never the bundle.**

**One rule, in core, read by every screen that needs it.** The repeated failure in this codebase is
two screens deciding the same thing separately and drifting: `mode` did it, `scheduled` did it, and
the fee `ctx` list did it twice. So the derivations live beside the data they read —
`FB.cart.slot`/`slotAt`/`slotOptions` (a stored slot is a bare clock string and is re-checked against
the clock on every read), `FB.cart.unsellable`, `FB.notifs.monitored`/`settleDay`, `FB.store.adopt`,
`FB.nav.pop`, `FB.fees.foodPaid`/`TIP_MAX`, `FB.plusMonths`/`plusRenewsAt`. **Logic that must be
testable cannot live in `js/app.js`** — the harness skips it because it boots on load, so anything
parked there is unreachable by every check. `settleDay`, `adopt` and `nav.pop` are all split that
way: the rule in core, the one-line wiring in the boot file.

**There are two apps, and `st.mode` says which one you are in.** Flipping to `'sling'` stamps
`#device[data-mode]`, and one rule in `css/tokens.css` moves every `var(--fb)` in the app at once —
a custom property inherits from the nearest ancestor that declares it, and `#device` is an ancestor
of `#view`, which is the same mechanism the map palette already uses. The tab bar is chosen by
mode, and **every id in it must name a registered screen**, because `nav.tab(id)` sets
`current.name` to it directly. The two tickers do not know about each other: the customer side
keeps running while you are slinging, and it should.

**A road runs between two givers, and it is data.** Gyro Palace opened on Route 9 in 1998 and that
building is a phone store now; Wing Bunker's fryer came out of the Route 9 location when it closed in
2011. Neither family has ever mentioned the other. A giver may carry a `carried` block naming the
OTHER end; it turns on once that end's rule has been **kept**, so a marked end can only ever change
its opposite — which is what makes "both speaking at once" a state unreachable from one end alone. It
falls out of the symmetric rule rather than being a third tier.

`st.slinging.learned[slug]` is **write-once and only on kept**: standing is an opinion and moves both
ways, but a room you have stood in cannot be un-stood-in by a later bad night. Written for **every**
giver, not just the two that read it, so no branch can drift from the data. Stamped from `run.endAt`,
never `Date.now()`.

Four rules. `carried` is **stamped at accept** like `regard`, because `copyFor` feeds both the stored
event and the live render. The beat override is matched on the beat's **tag** (`b[3]`) and never on
its index or text — the same trap CLAUDE.md records for the courier-introduction barrier. `b[0]` is
read **unconditionally**, and `carried.beat` may hold only `tag`/`text`/`sub`, so a fraction can never
depend on player history and the decision's placement is provably identical run to run. And `pair` is
computed **before** the write in `settle()` — after it, `learned[run.slug]` is already set, the term
is false, and the pair silently never closes. Same shape as reading `o.deliverAt` a line too late.

Nothing anywhere explains the connection. Every line reports something said or done and withholds
why — *"He did not say how he knew."* The platform's only contribution is a count: one run on file is
on Route 9; two runs on file are on the same road, and **the record does not connect them**.

**Every giver has its own shape, and the placement is derived from it.** All twenty runs used to
share one five-beat spine, so a doughnut counter and a 75-minute steakhouse were the same shape with
the name swapped. A giver may now carry its own `beats`; the rest fall back to `SPINE`. Four beats is
the floor because the placement needs a beat before the decision and a beat after the one that closes
it.

**The decision's position is computed, not written down.** The rule's window is closed by the
**second-to-last beat** — the one that commits you — and the rule lands `RULE_POS` of the way through
the gap before it. Those were the literals `0.52` and `0.74`, which was only ever correct because
every run had the same beats. `RULE_POS`/`INT_POS` are chosen to reproduce the old numbers exactly on
the default spine.

**The commit beat may not sit later than 0.74, and that number is not arbitrary.** The platform's
interruption goes after it, and `(1 − commit) × span − RESOLVE_MARGIN ≥ INT_MIN_MS` resolves to
span ≥ 58s — which is exactly the fourteen runs the original spine gave. Push the commit later and
the *cap* starts deciding which runs carry a second decision instead of the run's length, which is
the opposite of "the constraint decides". It also has a floor: a rule needs
`INCIDENT_MIN_MS + RESOLVE_MARGIN` of room before the beat that closes it — 28s against Dunkinn's 45s
span — so a commit before ~0.62 produces a run with **nothing to decide**. Dunkinn was written at
0.58 and did exactly that.

**Nobody is a person for long.** `st.user` was one hardcoded account, so every save that ever existed
belonged to Dana Whitfield. It is now drawn from a roster of fifteen — ten people and five things
that are not people but order lunch anyway — **once, at save creation, seeded on the save's own
timestamp, and stored**. That is what keeps it inside the no-unseeded-randomness rule: a render reads
the stored value and can never reshuffle it. Do not re-derive it on read; a save opened tomorrow must
still be the same account. `fillDefaults` runs at LOAD, so testing the backfill means writing a save
into storage *before* `state.js` loads — deleting `st.user` at runtime and reading it back tests
nothing.

**A mission is a run, and a run is watched.** An order is checked in on; a run is sat through, so
it cannot use the tracker's two-seconds-a-simulated-minute — that put Dunkinn at 26 seconds and the
Manufactory at two and a half minutes. The twenty are **remapped** onto 45–75 seconds rather than
clamped into it, because clamping flattens half of them onto the same number and the ordering is
worth keeping. The minutes a run advertises stay the store's own; only the wall clock is compressed.

**The constraint IS the complication.** There is no generic mid-route event: the giver's one rule is
tested once, under a bounded clock, and that is the climax. Every check holds the run — but
`replay()` must `break` rather than `return` when a check is open, or a catch-up lands the player on
a question with no story above it. Beats **before** the gate still play; beats after it wait.

**Which runs carry a second decision is not a threshold.** Every run is offered one and the short
ones cannot hold it — after the rule has had its window and its margin there is nowhere left to put
another answerable question. The constraint decides, not a constant, so the two cannot drift apart.
A window is `Math.min(room, max)` and never `clamp(room, min, max)`: clamping *up* hands back a
window the bound never had room for, and makes the guard above it decorative.

**Two axes, kept apart.** A restaurant's rule moves your standing with that restaurant and never
your pay. The platform's interruption moves your pay and never your standing. The separation lives
in the data — a mission carries no price fields at all — so a check asserts it against the table
rather than against the branch that reads it.

**A run pays, and then the same engine takes most of it back.** `FB.fees.payout({gross, access})`
is the other side of `compute`, and it is in `fees.js` for the reason everything else is: it must
compute with only `util.js` loaded. It adds **no `FEE_WHY` entries** — every row reuses an id the
receipt already emits, so tapping the `?` on a deduction opens the paragraph the customer read.
Every amount except the Tip Processing Fee is the customer's own price, read off the same branches
(`bag` 0.35, `handle` 0.60, `thermal` 1.60, `pickupA` 3.75, `pickupB` 2.20, `labor` 2.25, `service`
max($3.99, 18.5%), `fx` 2.5%, Peak Demand on the whole stack). Two ids that no line had **ever**
emitted are now live: `other` ("Other.") is the platform's entire published justification for what
it pays a person to cross a city, and `tip` — which has promised customers for this app's whole life
that a Tip Processing Fee comes out of the courier's tip — is finally charged to somebody.

Four rules hold it together. **The input surface is two scalars.** `payout` takes a gross and an
access flag and refuses a slug, an outcome or a tier, so a restaurant's rule cannot reach pay
*through* it — the two-axis separation is unexpressible here rather than merely unexpressed, and the
check asserts it by passing the smuggled fields and reading the same number back. **`WHY.labor` stays
byte-identical**, both possessives still addressed to the customer: the platform never rewrote its
boilerplate for the person it is deducting from, and that is the joke — do not fix the pronouns.
**`breakEven` is solved piecewise**, because the Service Fee has a floor: below a gross of
`SERVICE_MIN/SERVICE_PCT` the fee is flat and above it it scales, so a single-regime solve is wrong
on one side ($9.49 ordinary, $43.13 on an access day — and the board tops out at $13.45, so the
access statement never pays out and is not meant to). **BangBux are granted against the deduction
stack**, by the identical formula `compute` grants them by; granting on the *shortfall* instead puts
a cliff at $25.00 of it, which made the best-paid run the only one compensated with nothing.

`settle()` books the **net** into `st.slinging.earned` and accumulates `deducted` — `earned` is what
was paid, not what was billed, and the toast quotes the net for the same reason. The log row freezes
the totals but not the rows, which re-derive from `(pay, access)` because `payout` is a pure function
of exactly those two; a disagreement between the frozen net and the re-derived one is reported as a
schedule no longer in effect rather than silently redrawn at today's prices. Access is charged once
per **local** calendar day and stamped from `run.endAt`, never `Date.now()`, or a catch-up charges
one day's access twice on the path nobody is present for — which is why the suite is run under a
second `TZ=`.

**A restaurant remembers you, and it can only ever change how it talks.** `st.slinging.standing[slug]`
was written on one line and read by nothing for the mode's whole life. It is now banded — `regardOf(n)`
returns `known` at +3, `cold` at −3, `plain` between — and a giver may carry an optional
`voice: { known, cold }` whose variants are merged key-by-key through `copyFor`'s existing explicit
literal. Eleven of the twenty carry one; the rest fall through to the base table, which **is** `plain`.

Five things hold it in place. **The band is stamped at accept**, on the run, exactly as the timetable
is — `copyFor` feeds both the event pushed into `run.events` and the live `testBlock()` render, so a
live read makes a stored event disagree with the sheet the moment `settle` moves the number. **The
rule never varies**: it is drawn from live state on the card and the sheet and from the stamped run
mid-run, and a varying rule lets those three contradict each other. **Regard may remove a gate and
may never add one** — the single expression `needsBrief: band === 'known' ? false : !!m.needsBrief`,
because imposing the briefing at `cold` blocks the compliant answer, forces a break, and spirals into
a store you can never recover with. **The ladder is clamped to ±6 on write**, or forty broken runs at
one store means forty kept runs to climb back — a hole deeper than the climb out of it. And **the
variant shape cannot hold a number**: its whole vocabulary is strings and arrays of strings, asserted
against the *table* the way the two-axis check asserts `keepPay`/`brkPay`, because a price written
into the data would otherwise be dropped silently on the way out and the separation would look
enforced when the data had already broken.

**Why standing must not decide who is asking, however obvious that hook looks.** A run's gross is
`4.10 + minutes * 0.11` where the minutes are the store's own advertised window — $5.53 at the
shortest, $12.35 at the longest. Biasing *which* restaurants ask you on your standing with them is
therefore biasing your expected earnings, and it is farmable: build standing at the longest store,
get shown it more, earn more per hour. That is the pay axis, reached sideways. The platform scalar
decides **how many** doors are open; a restaurant decides **how it talks to you**; and the two cannot
drift together because one is an integer consumed by `slice(0, n)` and the other is a string consumed
by a copy lookup. `npm test` pins both directions — `asking()` flat across the whole ladder, and the
asking *set* unchanged under four different spreads of standing.

**Doing the six a favour costs you work.** One scalar, `st.slinging.platform`: chains raise it,
favours lower it, and it decides how many givers are shown as asking. Nobody says so out loud.

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
It has since caught a pair of camelCase identifiers in a screen that carried the courier noun as a
prefix and as a suffix — the noun renames on a word boundary and camelCase has none, so **run it
after naming anything, not only after adding a file.** Those two are not spelled out here for the
reason given above: this file is inside the walk, and a prose example would itself be a survivor.

**Run `npm test` before committing.** Seventy-three checks. Beyond the original thirteen they cover:
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

The twelve added by the edge-case programme are the ones that pin behaviour the app used to only
*claim*: a schedule slot never offered outside the hours it is for; checkout refusing to place at a
total it has stopped quoting; an item the restaurant has stopped serving unsellable on every surface;
every figure a receipt prints reconciling with the ones beside it; a ledger that cannot be
overwritten, retracted, or written from the wrong basket; the browser buttons agreeing with the
router; a screen never describing an order it is not showing; the build tools failing loudly rather
than quietly; an incident expiring while the food is still in the kitchen; nobody driving until
somebody has been assigned; placing an order being narrated and then waiting; and the same nine
people bringing their own habits.

The three added with the pay statement pin what a run is actually worth: the statement reconciling as
an *equality* (every printed row telescoping to gross − net, which an inequality survives a dropped
row of), both outcomes staying reachable so the deduction table cannot go arithmetically inert, the
break-even straddled by two adjacent real stores, `settle` booking the net rather than the gross, and
access charged by the day the run **ended**. `harness.cjs` grew a `statement issued` fixture for the
render sweep, because `settle()` nulls the run and the statement is otherwise reachable only from a
log row — fifteen rows of money nothing else in the sweep would ever draw. A ninth, `known and
remembered`, seeds both ends of the standing ladder, because every other fixture leaves it at `{}` —
which is exactly the state at which a regard bug is invisible. That gap was not hypothetical: the
board-purity check ran entirely at `standing = {}`, so three mutations of it were no-ops under test,
and a standing term added to `asking()` survived all sixty-one checks before this pass.

**A check that cannot fail is worse than none — prove it with a mutant.** Every check added by that
programme was validated by breaking the code it guards and confirming it goes red. That found: a
check returning a `Promise` the synchronous runner never awaited (so every assertion inside it would
have passed forever); a tip check pinning only the boundaries, so halving every tip survived; a
`multiple` assertion that was one-sided and could not see an *under*shoot; a hold check that could
not distinguish a clamped deadline on any store but the two with a 29-minute ETA. Three "survivors"
turned out to be **mis-specified mutants** rather than weak checks — a survivor is a claim about the
test, and it is only as good as the mutation.

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
