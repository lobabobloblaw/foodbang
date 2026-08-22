# FoodBang™

**Impact Is Part Of Delivery.**

**→ [lobabobloblaw.github.io/foodbang](https://lobabobloblaw.github.io/foodbang/)**

A satirical, entirely fictional clone of a present-day food-delivery app. Twenty invented
restaurants, 426 menu items, 1,473 modifier groups and 4,700 modifier options — every one of them
priced to make the total arrive somewhere you did not agree to.

Nothing here is real. No orders are placed, no payments are processed, no network requests are
made. Everything lives in `localStorage` and can be erased from **Account → Reset all data**.

---

## Run it

```bash
npm start          # http://127.0.0.1:8899
```

Or run `npm run artifact` to produce `build/foodbang.html` — a single self-contained file with
every asset inlined, openable from anywhere with no server at all.

Two hosted mirrors:

| | |
|---|---|
| [GitHub Pages](https://lobabobloblaw.github.io/foodbang/) | the multi-file app; images lazy-load and cache individually |
| [Claude artifact](https://claude.ai/code/artifact/a577d604-3fd5-4a05-a698-50ebbedf9e41) | the single-file build (private until shared from its Share menu) |

```bash
npm run bundle     # rebuild js/data/menus.generated.js from js/data/menus/*.json
npm run artifact   # rebuild build/foodbang.html
```

Keyboard: <kbd>D</kbd> theme · <kbd>/</kbd> search · <kbd>Esc</kbd> back · <kbd>R</kbd> reset.

---

## The joke, mechanically

The satire is not in silly dish names. It is in the **pricing structure**, which mirrors the real
thing and then keeps going.

**Base prices are the advertisement.** A bucket of fried chicken is $6.45. Then every item carries
two to four *required* modifier groups, and in at least one of them every option costs money —
including the option to decline.

```
Headcount Declaration        (required)
  Personal      +$2.15   Family     +$6.40
  Municipal    +$13.75   Regional  +$21.50    Watershed  +$34.90

Bucket Custody               (required)
  Retain Bucket        +$4.60   "becomes a household asset and is taxed as one"
  Surrender at Door    +$4.60   "surrender is processed as a retrieval, and billed as a retrieval"
  Bucketless           +$5.25   "food arrives in the shape of a bucket, without a bucket"
```

$6.45 becomes $26.80 before it reaches the cart. Then `js/core/fees.js` applies the stack:

| | |
|---|---|
| Delivery, Expanded Range, Service (18.5%, no cap) | the ordinary ones |
| Small Order Fee **and** Large Order Fee | you can be wrong in both directions |
| Menu Digitization Surcharge | $0.39 per line item, because it was typed once |
| Bag Fee **and** Bag Handle Fee | handles are licensed separately from the bag |
| Off-Peak Underutilization Fee | applied *concurrently* with the Peak Demand Multiplier |
| Currency Conversion (USD → USD) | 2.5% |
| Fee Transparency Fee $0.85 | the fee for displaying the fees |
| Peak Demand Multiplier ×1.4 | applied to everything above |
| Convenience Rounding™ | rounds the total **up** to the next $5.00 |

Tip defaults to 42% and is computed on the subtotal, before you have read any of it.

**$12.00 of food arrives as a $60.00 total.** Every fee has a "?" that opens its official
justification.

The **Settings → Privacy** screen is the tightest version of the gag: showing itemized fees costs
$0.85 per order, hiding them costs $2.85, reducing recommendations costs $3.25, and withdrawing
your data costs $4.10. There is no configuration of that screen that is free.

---

## What's in it

**20 restaurants.** Fourteen national chains — McRonald's, Taco Belligerent, Chipoltergeist,
STARBUX Refuel Terminal, Colonel Cluckingham's Poultry Compound, The Cheesecake Manufactory,
Applebeez Neighborhood Feeding Trough, Pizza Hutch, Panda Xpress 9000, Subterranean Sandwich
Authority, Entire Foods Market, BRAWNDO Hydration Depot, Dunkinn, Olive Orchard — and six
independents that make the feed feel like a real one: Gyro Palace #3, Wing Bunker (inside a gas
station), La Taqueria Verdadera #2, Boba Cloud Tea & Snow, Golden Wok Express, Sunrise Donut & Deli.

The independents carry their own signals: two- and three-digit rating counts, higher delivery fees,
41–79 minute windows, odd closing times, and announcements that read like the owner typed them.

**Over 600 generated images**, each brand given its own art direction — 1974 franchise flash, 2am
neon drive-thru, faux-Egyptian revival, institutional fluorescent, gas-station hot case. Menu
photography is deliberately **mixed**: 33 polished chain marketing shots and **393 amateur staff
phone photos** — styrofoam clamshells, hard on-camera flash, green fluorescent cast, crooked
framing, cluttered prep counters — because that is what a real delivery feed looks like. Every one
of the 426 menu items has a photograph.

There are also **136 proof-of-delivery photographs**, tagged by drop-off type and time of day so a
3am doorstep and a lunchtime office hand-off never draw the same frame — and, on the courier side,
rolled as loot. Most are unremarkable. A few are not.

**A world with a clock in it.** The app knows what time it is and so does the city. Twenty stores
have opening hours — eight of them close after midnight — so at 3 AM one restaurant is open and at
noon all twenty are; Sunrise Donut shuts at 1:20 PM and the Sandwich Authority at 4:30. Menu sections
that name their own window keep it: Golden Wok's "Lunch Specials (Ended at 3:00)" end at 3. Kitchens
get busy at dinner and empty in the afternoon, the weather moves on its own three-hour clock and
re-tints the delivery map, and sixteen items can simply run out for the day — "the aunt who rolls
these does so on Sundays." None of it is stored: it is a pure function of the clock, so closing the
tab for a week is automatically correct when you come back.

**Two food-tracking simulations.**

- **TRACKR™** — a live order tracker on the wall clock. An order is given an absolute timetable when
  you place it, so the estimate genuinely counts down — 29, 24, 18, 9, 2 — and only ever revises
  *later*. Leave mid-delivery and come back tomorrow and it is delivered, with a timeline stamped at
  the times things happened. Animated route map where the courier does not leave until the food
  exists. A Slinger drawn from the nine people in your area, whose tenure with you counts up and who
  greets you differently once you have rated them. A status feed that widens with your order count,
  so your fortieth delivery goes wrong in ways your first could not. And sometimes the restaurant
  runs out mid-preparation and gives you forty seconds to choose between substituting, being credited
  the base price, or holding the order — after which it elects the most expensive option for you.
- **BODYMAX™ Intake Telemetry** — ingests every order and reports back. Units Consumed against a
  Recommended Daily Intake of 9,400. Sodium Saturation, Grease Index, Blood Ranch Level, Structural
  Integrity, Corporate Loyalty, Chew Debt. A 14-day chart, twelve achievements, a six-stage Body
  Trajectory from STABLE to WATERSHED that "cannot be reversed within this application," and
  wellness recommendations that are all upsells.

**A platform that remembers you.** FoodBang™ Standing is a loyalty ladder that *demotes* you: one
point per order, one point lost per day, and each tier's benefit is a waiver on a fee you would not
have paid anyway. Every fifth order from the third, the Terms of Service update — with a diff, and
one button — and each version is materially worse than the last, including §4.2, which raises the
Slinger's fry tribute from one to two and changes what actually happens on the tracker. BANG+ keeps
real books now, and the number growing fastest is NET, in red. BangBux™ pay out 2% of your fees in
whole dollars, expire in seventy-two hours, and are redeemable against fees — where Convenience
Rounding™ absorbs them entirely.

**And there is another app inside it.** Every delivery app has the toggle, and the line that
introduces this one has been sitting in the pickup script since the tracker was written: *"No
Slinger has been assigned. You are the Slinger."* Flip it and the accent moves off the platform's
red onto sodium vapour, the tab bar is replaced, and the twenty restaurants — which have had
taglines, opening hours and announcements typed by whoever runs the place since the day they
shipped, and have never once addressed you — start handing out work.

Each one asks for a delivery with **one rule attached**. Panda Xpress 9000 is unattended and asks
you not to tap the glass, so the app puts a glass in front of you. Olive Orchard's entire mission is
*leave*, and refusing a refill is processed as a refill. Golden Wok needs the number ready, and the
number is in the briefing, and the briefing has a dismiss button. Sunrise Donut only asks before the
case is done, which means before 1:20 PM, and it pays the least of anything on the board.

A run takes 45 to 75 seconds — remapped from each store's own advertised window, so Dunkinn is still
the fastest place in the city. Halfway through, the run **holds**: the rule comes due on a clock, and
if you say nothing it is applied on your behalf. The longer runs get interrupted a second time by
FoodBang™ itself, which wants something different — and that is the split. **The restaurants own
your reputation. The platform owns your wallet.** Doing what a chain tells you raises your partner
standing; doing one of the six independents a favour lowers it, and the platform quietly shows you
less work. It never explains why.

**Everything else you'd expect:** category browse, filters and sort (including "Desperation"),
search that reaches into modifier options, per-store carts, delivery/pickup that are now tracked
differently, scheduling that actually waits for its slot, six working promo codes that are all traps
and each work exactly once, twenty-two store promotions of which eight move a price, address and
payment CRUD, order history, reorder, ratings that land on a person, a notification centre fed by
real events and correctly back-dated across an absence, light/dark/system theming, three text sizes,
a Hunger Level slider that really does raise every portion default — and BANG+ INFINITY PRIME
ELITE™, whose cancellation flow gets one step longer every time you attempt it, inserts a mandatory
survey whose answers do not affect the outcome, and ends by telling you to call 1-800-BANG-NO during
a 25-minute window on Tuesdays.

**And it takes a moment.** Nothing in the app resolves in the same frame it was tapped in any more.
The delays are small and deliberately asymmetric: adding to a cart clears in under a quarter of a
second, taking something back out takes half a second, honouring a promo code takes the better part
of one, and every step of cancelling a membership is the slowest thing here. Settings offers to
suppress all of it, for a fee.

---

## Layout

```
index.html               shell — phone frame, status bar, tab bar
css/tokens.css           67 design tokens; light + dark, three-state theming
css/app.css              component library
css/screens.css          screen-specific styles
js/core/                 util · world (the clock) · icons · state · latency · notifs · catalog · fees · scrip · tos · cart
js/ui/                   shell (router, sheets, toasts) · components · item sheet · 16 screens
js/sim/roster.js         the nine Slingers in your area
js/sim/standing.js       the loyalty ladder that demotes you
js/sim/tracker.js        TRACKR™ order simulation, on the wall clock
js/sim/bodymax.js        BODYMAX™ telemetry — and the 16th screen
js/sim/missions.js       Slinger Mode — twenty givers, and the 17th and 18th screens
tools/harness.cjs        loads the whole app headlessly, so npm test can render every screen
js/data/menus/*.json     one file per restaurant — the source of truth
js/data/menus.generated.js  bundled by tools/bundle.cjs (validates as it builds)
tools/brand-bible.json   art direction + pricing doctrine for the 14 chains
tools/local-bible.json   independent doctrine + the amateur-photography recipe
build/foodbang.html     single-file build, every asset inlined
build/raw/               2048px source renders, kept for re-encoding
```

No framework, no build step, no dependencies. Classic scripts under a `FB` namespace so it runs
straight from `file://`. `npm test` is fifty-eight checks in one script — the pricing invariants, the
data, and every screen rendered headlessly against six states at two different hours.

The app's own mark — a bag, and a handle, which on this platform is a separate object and is billed
separately — is drawn in `js/core/icons.js` rather than stored as an image, so it is crisp at every
size, follows the accent token, survives being inlined into the single-file build, and costs nothing
to regenerate when the app is renamed.

---

## Legal, sincerely

FoodBang™ is a work of parody. Every brand, dish, price, fee, modifier, review and statistic in it
is invented. The restaurants are exaggerated fictions and are not affiliated with, endorsed by, or
representative of any real company. BODYMAX™ figures are not medical information and its 9,400-unit
Recommended Daily Intake was, as the app itself admits, "selected internally."

---

## Two environment notes

This project lives under `~/Documents`, which is iCloud-synced, and the disk is ~96% full. macOS
responded by evicting three menu files to the cloud: `stat` still reported their real size, but
`readFileSync` returned zero bytes, and the bundler happily produced a bundle missing three
restaurants. Both build scripts now detect a short read, run `brctl download` to pull the file back,
and **refuse to write an incomplete bundle** rather than shipping a silently smaller app.

If a build ever complains about a dataless file, `brctl download .` from the project root fixes it.
Freeing disk space — `build/raw/` holds ~20 MB of 2048px source renders and is only needed if you
want to re-encode assets at a different size — makes it stop happening.

**Long lines.** The single-file build originally emitted the inlined asset map as one 3.7 MB line
and the menu bundle as one 798 KB line. That is fine locally and in a plain iframe, but the
published mirror rendered an empty frame — the page threw `SyntaxError: Invalid or unexpected
token` partway into the long line. `tools/build-artifact.cjs` now emits base64 in 480-character
chunks joined at runtime, and `tools/bundle.cjs` writes indented JSON; nothing exceeds ~1 KB per
line. The build also injects a visible boot-failure banner, so a single-file build can never again
fail silently into a blank page.
