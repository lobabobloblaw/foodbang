# DoorGorge™

**Every Door Is A Mouth.**

**→ [lobabobloblaw.github.io/doorgorge](https://lobabobloblaw.github.io/doorgorge/)**

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

Or run `npm run artifact` to produce `build/doorgorge.html` — a single self-contained file with
every asset inlined, openable from anywhere with no server at all.

Two hosted mirrors:

| | |
|---|---|
| [GitHub Pages](https://lobabobloblaw.github.io/doorgorge/) | the multi-file app; images lazy-load and cache individually |
| [Claude artifact](https://claude.ai/code/artifact/a577d604-3fd5-4a05-a698-50ebbedf9e41) | the single-file build (private until shared from its Share menu) |

```bash
npm run bundle     # rebuild js/data/menus.generated.js from js/data/menus/*.json
npm run artifact   # rebuild build/doorgorge.html
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

The **Settings → Privacy** screen is the tightest version of the gag: showing itemised fees costs
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

**171 generated images**, all `bytedance/seedream-4.5` via Replicate, each brand given its own art
direction — 1974 franchise flash, 2am neon drive-thru, faux-Egyptian revival, institutional
fluorescent, gas-station hot case. Menu photography is deliberately **mixed**: 45 polished chain
marketing shots and **75 amateur staff phone photos** — styrofoam clamshells, hard on-camera flash,
green fluorescent cast, crooked framing, cluttered prep counters — because that is what a real
delivery feed looks like.

**Two food-tracking simulations.**

- **TRACKR™** — a live order tracker on a global ticker, so it keeps advancing while you shop.
  Animated route map, a Gorger with a name and a tenure in days, an ETA that only ever revises
  later, and a status feed that includes *"your Gorger has taken one (1) fry as tribute — this is
  permitted under the Gorger Agreement, §4.2."* Offers to reduce your arrival time for a larger tip,
  then explains that arrival is not affected by tip.
- **BODYMAX™ Intake Telemetry** — ingests every order and reports back. Units Consumed against a
  Recommended Daily Intake of 9,400. Sodium Saturation, Grease Index, Blood Ranch Level, Structural
  Integrity, Corporate Loyalty, Chew Debt. A 14-day chart, twelve achievements, a six-stage Body
  Trajectory from STABLE to WATERSHED that "cannot be reversed within this application," and
  wellness recommendations that are all upsells.

**Everything else you'd expect:** category browse, filters and sort (including "Desperation"),
search that reaches into modifier options, per-store carts, delivery/pickup, scheduling, six working
promo codes that are all traps, address and payment CRUD, order history, reorder, ratings, a
notification centre, light/dark/system theming, three text sizes, a Hunger Level slider that
changes how hard the app upsells you — and GORGE+ INFINITY PRIME ELITE™, whose five-step
cancellation flow ends by telling you to call 1-800-GORGE-NO during a 25-minute window on Tuesdays.

---

## Layout

```
index.html               shell — phone frame, status bar, tab bar
css/tokens.css           64 design tokens; light + dark, three-state theming
css/app.css              component library
css/screens.css          screen-specific styles
js/core/                 util · icons · state (localStorage) · catalog · fees · cart
js/ui/                   shell (router, sheets, toasts) · components · 12 screens
js/sim/tracker.js        TRACKR™ order simulation
js/sim/bodymax.js        BODYMAX™ telemetry
js/data/menus/*.json     one file per restaurant — the source of truth
js/data/menus.generated.js  bundled by tools/bundle.cjs (validates as it builds)
tools/brand-bible.json   art direction + pricing doctrine for the 14 chains
tools/local-bible.json   independent doctrine + the amateur-photography recipe
build/doorgorge.html     single-file build, every asset inlined
build/raw/               2048px source renders, kept for re-encoding
```

No framework, no build step, no dependencies. Classic scripts under a `DG` namespace so it runs
straight from `file://`.

---

## Legal, sincerely

DoorGorge™ is a work of parody. Every brand, dish, price, fee, modifier, review and statistic in it
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
