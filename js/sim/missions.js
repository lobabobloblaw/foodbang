/* FoodBang — Slinger Mode: the twenty restaurants, and what they want.

   The other side of the switch. Every restaurant in this app has had a voice since
   the day it shipped — a tagline, an announcement typed by whoever runs the place,
   an `about` written in the first person — and has never once addressed the player.
   Here they do, and what they want is a delivery with one rule attached to it.

   A MISSION IS A RUN. It is given an absolute timetable when it is accepted, exactly
   as an order is by js/sim/tracker.js, and tick() replays whatever is in the past —
   so catching up after an absence is the same code path as running live, and the
   whole run is a pure function of (seed, startAt).

   THE CONSTRAINT IS THE COMPLICATION. There is no generic mid-route event: the
   giver's one rule is tested once, under a bounded clock, and that is the climax.
   It is the TRACKR incident with a personality attached to it, which is the same
   observation twice — this app's native verb is the consequential choice under a
   clock, and it always has been.

   The file is missions.js and the namespace is FB.missions. Not a name built on the
   courier noun: tools/rebrand.cjs rewrites that noun on a word boundary, including
   inside the <script src> string in index.html, and the file on disk would not
   follow. Copy may say Slinger as much as it likes — that word renames correctly. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  function SIM() { return FB.tracker.SIM_MS_PER_MIN; }
  function MARGIN() { return FB.tracker.RESOLVE_MARGIN_MS; }
  function TEST_MS() { return FB.tracker.INCIDENT_MS; }
  function TEST_MIN_MS() { return FB.tracker.INCIDENT_MIN_MS; }
  /* The giver's rule inherits the incident's floor, because it is the same shape of
     thing: a sheet with fine print under it. The platform's interruption is one line
     and two buttons — genuinely quicker to read than the thing that floor was set
     for — so it gets its own, shorter one. Twenty-two seconds inside a seventy-second
     run is a third of the run, and two of those do not fit. */
  var INT_MIN_MS = 9000, INT_MAX_MS = 22000;

  /* ---------------- the twenty ----------------
     `rule` is the one thing the giver asks. `prompt` is how it comes due mid-run.
     `keep` and `brk` are the two answers; saying nothing elects `keep`, because the
     platform's own default is always the one that costs you time rather than the one
     that costs it a complaint. Every quoted phrase is read back out of the store's
     own JSON — nothing here is invented for the giver. */
  var MISSIONS = [
    { slug: 'pandaxpress', title: 'Collection, Unattended',
      brief: ['The 9000-Series unit is operating unattended and is fulfilling orders normally.',
              'Your order has been released to the shelf. The unit will not acknowledge you.'],
      rule: 'Do not tap the glass.',
      prompt: ['The unit has not acknowledged you', 'The order is behind the glass. The glass is not a door.'],
      keep: ['Wait', 'the unit releases on its own schedule'],
      brk:  ['Tap the glass', 'faster'],
      kept: 'The unit released the order. It took the time it takes.',
      broken: 'The unit acknowledged the contact. The contact has been logged.' },

    { slug: 'oliveorchard', title: 'Departure',
      brief: ['Guests are family. Family arrangements remain in effect.',
              'The order is ready. Getting out of the building is the assignment.'],
      rule: 'Leave.',
      prompt: ['A refill has been brought to you', 'You did not order it. It is on the table.'],
      keep: ['Accept the refill', 'and then leave'],
      brk:  ['Refuse it', 'processed as a refill'],
      kept: 'You accepted the refill and left. It took eleven minutes.',
      broken: 'The refusal was processed as a refill. A second was brought.' },

    { slug: 'ssa', title: 'Determination',
      brief: ['The application has been reviewed. A determination has been issued.',
              'Determinations are final and are not disclosed. You are carrying one.'],
      rule: 'Do not read the determination.',
      prompt: ['The envelope is not sealed', 'It was issued unsealed. That is not an invitation.'],
      keep: ['Deliver it as issued', 'unread'],
      brk:  ['Read it', 'you will know'],
      kept: 'Delivered as issued. You do not know what it said.',
      broken: 'You know what it said. The Authority has been notified that you know.' },

    { slug: 'chipoltergeist', title: 'Cold Spot',
      brief: ['Cold spots between the salsa well and the register are known, documented, and priced.',
              'The order passed through one. This is disclosed and is not a defect.'],
      rule: 'Do not report it as cold.',
      prompt: ['The order is cold', 'It was cold when it was made. It is colder now.'],
      keep: ['Say nothing', 'it is disclosed'],
      brk:  ['Report it', 'as cold'],
      kept: 'Nothing was reported. The disclosure stands.',
      broken: 'A cold report was filed against a disclosed cold spot. It was closed.' },

    { slug: 'mcronalds', title: 'Procedure',
      brief: ['Procedures described in this listing are procedures. They are not promises.',
              'The 1974 manual specifies a collection door on the north face.'],
      rule: 'Follow the manual.',
      prompt: ['There is no north door', 'The manual has never been revised. The building has.'],
      keep: ['Wait at the wall', 'as specified'],
      brk:  ['Use the door that exists', 'unspecified'],
      kept: 'You waited at the wall. Someone came around eventually.',
      broken: 'You used an unspecified door. The deviation is billed.' },

    { slug: 'applebeez', title: 'Riblets',
      brief: ['RIBLETS ARE AVAILABLE. RIBLETS HAVE ALWAYS BEEN AVAILABLE.',
              'The customer may raise the question of availability.'],
      rule: 'Riblets have always been available.',
      prompt: ['They asked when riblets came back', 'They remember them going away.'],
      keep: ['They never left', 'as stated'],
      brk:  ['Agree that they left', 'accurate'],
      kept: 'You confirmed continuous availability. Records agree with you.',
      broken: 'You confirmed a gap in availability. There is no record of a gap.' },

    { slug: 'starbux', title: 'Regional',
      brief: ['Product is dispensed by volume through calibrated brass hoses rather than poured.',
              'You are carrying a Regional. Watershed remains suspended pending a drain inspection.'],
      rule: 'Do not set it down.',
      prompt: ['Your arm', 'A Regional is not a cup. There is a wall here.'],
      keep: ['Do not set it down', 'as instructed'],
      brk:  ['Set it down', 'briefly'],
      kept: 'It was not set down. Your arm is a matter for you.',
      broken: 'It was set down. Volume settled. The settled volume is the volume.' },

    { slug: 'cluckingham', title: 'Before The Inspector',
      brief: ['The Compound’s gravy line is now connected to the township’s secondary main.',
              'An inspection is scheduled. Your collection is not related to the inspection.'],
      rule: 'Do not enter the gravy room.',
      prompt: ['The gravy room is the short way', 'It is also where the inspection is.'],
      keep: ['Go around', 'six minutes'],
      brk:  ['Cut through', 'ninety seconds'],
      kept: 'You went around. The inspection proceeded without you in it.',
      broken: 'You were in the gravy room during the inspection. You are in the inspection.' },

    { slug: 'manufactory', title: 'Page 118',
      brief: ['MENU PAGES 96-141 ARE CURRENTLY UNDER LOAD REVIEW.',
              'Items on those pages remain orderable and remain large. This is one of them.'],
      rule: 'The item is not adjustable at the table.',
      prompt: ['It does not fit the bag', 'Portions are specified by the structural department.'],
      keep: ['Carry it uncontained', 'as specified'],
      brk:  ['Adjust it', 'to fit'],
      kept: 'Carried uncontained, as specified. Both hands.',
      broken: 'The item was adjusted. The structural department has been informed.' },

    { slug: 'pizzahutch', title: 'Metered Return',
      brief: ['The salad bar remains under sneeze-guard supervision. Return trips are metered.',
              'Two returns are included with this collection.'],
      rule: 'Two returns are permitted.',
      prompt: ['A third return is needed', 'Something was left behind. Returns three and above are metered.'],
      keep: ['Do not return', 'incomplete'],
      brk:  ['Return a third time', 'metered'],
      kept: 'You did not return. The order is incomplete and was not metered.',
      broken: 'A third return was metered. The meter is not itemised.' },

    { slug: 'tacobelligerent', title: 'Fourth Meal',
      brief: ['THE FOURTH MEAL PROTOCOL IS ACTIVE.',
              'All formats are folded, layered, coned, or wrapped inside another format at our sole discretion.'],
      rule: 'The format is not disclosed before handover.',
      prompt: ['They asked what format it is', 'The format was decided after the order was placed.'],
      keep: ['Do not disclose', 'per protocol'],
      brk:  ['Tell them the format', 'they asked'],
      kept: 'The format was not disclosed. It was handed over folded.',
      broken: 'The format was disclosed before handover. The protocol notes this.' },

    { slug: 'entirefoods', title: 'Chalkboard',
      brief: ['SEASONAL NOTICE: The chalkboards are being rewritten this week.',
              'Prices shown may be lower than the prices being charged.'],
      rule: 'Collect at the posted price.',
      prompt: ['The posted price is lower', 'The register has the other one.'],
      keep: ['Pay the posted price', 'as written'],
      brk:  ['Pay the register price', 'as charged'],
      kept: 'You paid what was posted. The difference is being rewritten.',
      broken: 'You paid what was charged. The chalkboard was correct and is now gone.' },

    { slug: 'brawndo', title: 'Watershed Drop',
      brief: ['DOCK NOTICE: Orders above 275 gallons are delivered to the curb.',
              'They become the household’s problem at the curb. Reaching the curb is your problem.'],
      rule: 'It becomes their problem at the curb.',
      prompt: ['They have asked you to bring it in', 'It is above 275 gallons.'],
      keep: ['Leave it at the curb', 'as noticed'],
      brk:  ['Bring it in', 'past the curb'],
      kept: 'Left at the curb. It became their problem exactly there.',
      broken: 'It was brought past the curb. It is no longer clear whose problem it is.' },

    { slug: 'dunkinn', title: 'Continuous Morning',
      brief: ['MORNING IS NOW CONTINUOUS. You are already enrolled in the rewards programme.',
              'Nineteen minutes. This is the tightest window in the city.'],
      rule: 'Nineteen minutes.',
      prompt: ['There is a shorter way', 'It goes past the school at the hour it lets out.'],
      keep: ['Take the route', 'nineteen minutes'],
      brk:  ['Take the shorter way', 'twelve'],
      kept: 'You took the route. Nineteen minutes, as classified.',
      broken: 'You took the shorter way. It was shorter.' },

    /* ---- the six ---- */

    { slug: 'gyropalace', title: 'Route 9', local: true,
      brief: ['Emre asks. It is not an order and it is not on the ticket.',
              'The first Gyro Palace was on Route 9. That building is a phone store now.'],
      rule: 'Ask whether the sign is still up.',
      prompt: ['You are outside the phone store', 'There is someone behind the counter.'],
      keep: ['Go in and ask', 'four minutes'],
      brk:  ['Keep going', 'you are on a clock'],
      kept: 'You asked. The sign came down in 2019. Emre already knew.',
      broken: 'You kept going. Emre will ask you next time, in the same way.' },

    { slug: 'wingbunker', title: 'The Same Fryer', local: true,
      brief: ['Same fryer since 1996. It came from the Route 9 location when that closed in 2011.',
              'A part for it is being held for us behind the counter.'],
      rule: 'Do not tell the gas station.',
      prompt: ['The attendant asked what you are carrying', 'The kitchen is at the back, past the coffee.'],
      keep: ['Say nothing', 'keep walking'],
      brk:  ['Explain', 'about the fryer'],
      kept: 'You kept walking. The part is in the back with the fryer.',
      broken: 'You explained. The gas station now knows about the fryer.' },

    { slug: 'verdadera', title: 'Before It Is A Day Old', local: true,
      brief: ['SALSA HECHA CADA MAÑANA. NO ANTES.',
              'Señora Elvia does not send out salsa that is a day old. It is 11:40.'],
      rule: 'It goes out today.',
      prompt: ['It is 11:52', 'Eight minutes. The address is fourteen away.'],
      keep: ['Take it anyway', 'it will be late'],
      brk:  ['Hold it to tomorrow', 'it will be a day old'],
      kept: 'It went out today. It arrived at 12:06, which was today when it left.',
      broken: 'It was held. Señora Elvia made a fresh one and threw the first away.' },

    { slug: 'sunrisedonut', title: 'Before The Case Is Done', local: true,
      brief: ['Ray starts the donuts at 3:15 and answers the phone himself.',
              'There are two left in the case. Both of them are on your ticket.'],
      rule: 'The case is done when the case is done.',
      prompt: ['Someone at the counter wants one', 'They have been standing there a while. There are two.'],
      keep: ['Give them one', 'your order is short'],
      brk:  ['Keep both', 'the ticket says two'],
      kept: 'You gave one away. Ray did not say anything and did not charge you for it.',
      broken: 'You kept both. The ticket was correct.' },

    { slug: 'goldenwok', title: 'Have Your Number Ready', local: true,
      brief: ['There are 214 items on the paper menu and all of it is cooked in the same kitchen.',
              'Your number is 118. Please have your number ready.'],
      rule: 'Present the number.',
      prompt: ['They have asked for the number', 'It was in the briefing.'],
      keep: ['Present 118', 'as briefed'],
      brk:  ['You do not have it', 'the briefing was dismissed'],
      kept: 'You had the number. The order came out immediately.',
      broken: 'You did not have the number. They found it. It took a while.',
      needsBrief: true },

    { slug: 'bobacloud', title: 'Do Not Shake It Twice', local: true,
      brief: ['THE SEALING MACHINE IS FIXED. Sorry to everybody last week.',
              'Forty-one toppings, two people, and one sealing machine that has opinions.'],
      rule: 'It cannot be shaken twice.',
      prompt: ['The seal does not look right', 'It was shaken once, and sealed once.'],
      keep: ['Leave it', 'as sealed'],
      brk:  ['Shake it again', 'to settle it'],
      kept: 'Left as sealed. The seal was fine.',
      broken: 'It was shaken twice. The machine was not the problem last week either.' },
  ];

  /* The giver gives you one rule. The PLATFORM interrupts with its own agenda, and
     that is a different kind of thing entirely — so it is a shared pool rather than
     twenty more bespoke prompts, it is written in the platform's register rather
     than a restaurant's, and it costs MONEY rather than standing.

     Restaurants own your reputation. The platform owns your wallet. Keeping the two
     axes separate is what stops a run being one decision made twice. */
  var INTERRUPTS = [
    { id: 'reroute', title: 'Route recalculated',
      body: 'A faster route has been selected. It is longer.',
      keep: ['Accept the route', 'as selected'], brk: ['Deviate', 'deviation is billed'],
      keepPay: 0, brkPay: -1.40,
      kept: 'The selected route was taken. It was longer.',
      broken: 'A deviation was recorded and billed at $1.40.' },

    { id: 'stack', title: 'A second order has been added to this run',
      body: 'Both are described as first.',
      keep: ['Carry both', 'one fee'], brk: ['Decline the addition', 'acceptance rate'],
      keepPay: 1.10, brkPay: 0,
      kept: 'Both were carried. One delivery fee was assessed.',
      broken: 'The addition was declined. Your acceptance rate has been updated. It is not shown here.' },

    { id: 'photo', title: 'Photographic confirmation is required',
      body: 'The photograph is retained. It is not attached to your run.',
      keep: ['Take the photograph', 'retained'], brk: ['Skip it', 'confirmation withheld'],
      keepPay: 0, brkPay: -0.85,
      kept: 'The photograph was taken. It is of a door.',
      broken: 'Confirmation was withheld. A Confirmation Absence Fee of $0.85 applies.' },

    { id: 'tipdrop', title: 'The customer has revised their tip',
      body: 'The revision has already been applied. It is available for query.',
      keep: ['Acknowledge', 'nothing follows'], brk: ['Query the revision', 'a query is an operation'],
      keepPay: -0.60, brkPay: -1.95,
      kept: 'Acknowledged. The revision stands and $0.60 came off.',
      broken: 'The query was performed and billed. The revision stands.' },

    { id: 'wait', title: 'The restaurant has not finished',
      body: 'Waiting is included. It is not paid, but it is included.',
      keep: ['Wait inside', 'included'], brk: ['Wait in the car', 'unmonitored'],
      keepPay: 0, brkPay: -0.75,
      kept: 'You waited inside. The wait was included.',
      broken: 'The wait was unmonitored and is deducted at $0.75.' },
  ];

  function byslug(slug) {
    return MISSIONS.filter(function (m) { return m.slug === slug; })[0] || null;
  }

  /* ---------------- the run ----------------
     One spine, filled with the giver. The constraint arrives at the middle of it and
     is bounded by the beat after it, the way an incident is bounded by the food. */
  var SPINE = [
    [0.02, 'Accepted · {store}', 'Navigate to {store}. Navigation is not provided.'],
    [0.20, '{store} has the order ready', '{pickup}'],
    [0.36, 'Collected', '{slinger} has taken {fries} as tribute. This is permitted under the Slinger Agreement, §4.2.'],
    [0.74, 'En route', 'The route was selected. It is not the route you would have selected.'],
    [0.93, 'Delivered', 'Photograph taken. The photograph is of a door.'],
  ];
  var TEST_FRAC = 0.52;

  function fill(text, m, store) {
    return String(text)
      .replace(/\{store\}/g, store ? (store.shortName || store.name) : m.slug)
      .replace(/\{pickup\}/g, m.brief[1] || '')
      .replace(/\{slinger\}/g, 'You')
      .replace(/\{fries\}/g, FB.tos.fries());
  }

  /** minutes a run takes, from the store's own advertised window */
  function minutesFor(store) {
    if (!store) return 24;
    return Math.round((store.deliveryMin + store.deliveryMax) / 2);
  }

  /* A run is WATCHED, start to finish, which an order never is — you check in on an
     order and you sit through a run. At the tracker's two seconds a simulated minute
     that put Dunkinn at 26 seconds and the Manufactory at two and a half minutes,
     which is both too short to hold a countdown and too long to hold attention.

     So the twenty are remapped linearly onto a band rather than clamped into it:
     clamping would flatten eleven of them onto the same number, and the ordering is
     worth keeping — Dunkinn really is the fastest place in the city and the
     Manufactory really does have a 412-page menu. The MINUTES a run advertises stay
     the store's own; only the wall clock is compressed. */
  var RUN_MIN_MS = 45000, RUN_MAX_MS = 75000;
  var band = null;
  function bandOf() {
    if (band) return band;
    var all = MISSIONS.map(function (m) { return minutesFor(FB.catalog.get(m.slug)); });
    band = { lo: Math.min.apply(null, all), hi: Math.max.apply(null, all) };
    return band;
  }
  function durationFor(minutes) {
    var b = bandOf();
    if (b.hi === b.lo) return RUN_MIN_MS;
    var t = FB.clamp((minutes - b.lo) / (b.hi - b.lo), 0, 1);
    return Math.round(RUN_MIN_MS + t * (RUN_MAX_MS - RUN_MIN_MS));
  }
  /* Which runs carry a second decision is NOT a threshold. Every run is offered one
     and the short ones cannot hold it: after the giver's rule has had its window and
     its margin there is simply nowhere left to put another answerable question. That
     is the same reading the app already takes about the store whose delivery window
     cannot hold an incident — the constraint decides, not a constant, and the two
     cannot drift apart. */

  /* Built ONCE, at accept, with every beat at an absolute moment — the tracker's
     model, and what makes a run survivable across a reload or a week away. */
  function build(slug, now, opts) {
    var m = byslug(slug);
    if (!m) return null;
    var store = FB.catalog.get(slug);
    var at = now || Date.now();
    var sim = SIM();
    var minutes = minutesFor(store);
    var run = {
      id: 'run_' + at.toString(36) + '_' + slug,
      slug: slug, title: m.title, store: store ? store.name : slug,
      logo: store ? store.logoSrc : null,
      startAt: at,
      minutes: minutes,
      pay: FB.round2(4.10 + minutes * 0.11),
      briefed: !(opts && opts.dismissed),
      events: [], replayed: 0,
      outcome: null, choice: null, elected: false,
    };
    /* Computed HERE, above the test block, because the test's deadline is bounded by
       it. Read a line too late and the bound is NaN, every comparison against NaN is
       false, and the clamp looks like it is working while doing nothing — the trap
       js/sim/tracker.js records against o.deliverAt. */
    var span = durationFor(minutes);
    run.endAt = at + span;
    run.span = span;

    run.beats = SPINE.map(function (b) {
      return { at: at + span * b[0], text: fill(b[1], m, store), sub: fill(b[2], m, store) };
    });

    /* Each check is bounded by the beat that FOLLOWS it — a question you can still be
       asked after the answer stopped mattering is not a question. Same shape as the
       incident's bound, and the same trap: the span has to exist before this block. */
    /* `floor` is the earliest this check may be pulled back to. Without it the
       pull-earlier rule — which is right for a single check, and is the incident's
       own — drags a second check on top of the first one's deadline, and the run is
       held twice at once by two different questions. */
    function mk(kind, frac, nextFrac, floor, minMs, maxMs, extra) {
      var cAt = at + span * frac;
      var bound = Math.min(at + span * nextFrac, run.endAt) - MARGIN();
      if (bound - cAt < minMs) cAt = bound - minMs;
      if (cAt < floor) cAt = floor;
      /* and drop it only when there is genuinely nowhere to put it — the same reading
         as the store whose window cannot hold an answerable deadline at all */
      var room = bound - cAt;
      if (room < minMs) return null;
      /* Math.min, not clamp: clamping UP would hand back a window the bound does not
         have room for, which is how a deadline ends up outliving the thing it is
         about — and it would also make the guard above decorative. */
      var ms = Math.min(room, maxMs);
      var c = { kind: kind, at: cAt, ms: ms, deadline: cAt + ms, announced: false, choice: null, elected: false };
      if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) c[k] = extra[k];
      return c;
    }

    run.checks = [];
    var rule = mk('rule', TEST_FRAC, 0.74, at, TEST_MIN_MS(), TEST_MS());
    if (rule) run.checks.push(rule);
    if (rule) {
      /* seeded on the run, so the same run always draws the same interruption and a
         reload cannot reroll it into a friendlier one */
      var pick = INTERRUPTS[Math.floor(FB.seeded(run.id + ':int')() * INTERRUPTS.length)];
      var inter = mk('platform', 0.79, 1.0, rule.deadline + MARGIN(), INT_MIN_MS, INT_MAX_MS, { ref: pick.id });
      if (inter) run.checks.push(inter);
    }
    return run;
  }

  /* ---------------- ticker ---------------- */
  var timer = null, listeners = [];

  function push(run, ts, text, sub) { run.events.unshift({ ts: ts, text: text, sub: sub || null }); }

  /** the check that is due and unanswered, or null */
  function pending(run, now) {
    var at = now || Date.now();
    for (var i = 0; i < run.checks.length; i++) {
      var c = run.checks[i];
      if (!c.choice && at >= c.at) return c;
    }
    return null;
  }

  function copyFor(run, c) {
    if (c.kind === 'rule') {
      var m = byslug(run.slug);
      return { title: m.prompt[0], body: m.prompt[1], rule: m.rule,
               keep: m.keep, brk: m.brk, kept: m.kept, broken: m.broken,
               needsBrief: !!m.needsBrief };
    }
    var p = INTERRUPTS.filter(function (x) { return x.id === c.ref; })[0] || INTERRUPTS[0];
    return { title: p.title, body: p.body, rule: null, keep: p.keep, brk: p.brk,
             kept: p.kept, broken: p.broken, keepPay: p.keepPay, brkPay: p.brkPay };
  }

  function replay(run, now) {
    var changed = false;

    /* Every check HOLDS the run: nothing after it plays until it is answered. That is
       what makes it a decision rather than a notification. */
    for (var ci = 0; ci < run.checks.length; ci++) {
      var c = run.checks[ci];
      if (c.choice) continue;
      if (now < c.at) break;
      var cp = copyFor(run, c);
      if (!c.announced) { c.announced = true; push(run, c.at, cp.title, cp.body); changed = true; }
      /* break, NOT return: everything BEFORE this decision still has to play, or a
         catch-up lands you on a question with no story above it */
      if (now < c.deadline) break;
      /* Saying nothing elects the compliant answer. The platform's default is always
         the one that costs you time rather than the one that costs it a complaint. */
      c.choice = 'keep'; c.elected = true;
      applyPay(run, c, cp);
      push(run, c.deadline, 'No response was recorded',
        (c.kind === 'rule' ? 'The rule was applied' : 'The instruction was applied') +
        ' on your behalf. Application was the available response.');
      changed = true;
    }

    /* the earliest decision still open is the gate: everything after it waits */
    var gate = null;
    for (var gi = 0; gi < run.checks.length; gi++) {
      if (!run.checks[gi].choice) { gate = run.checks[gi]; break; }
    }
    for (var i = run.replayed; i < run.beats.length; i++) {
      var b = run.beats[i];
      if (b.at > now) break;
      if (gate && b.at > gate.at) break;
      push(run, b.at, b.text, b.sub);
      run.replayed = i + 1;
      changed = true;
    }

    var answered = run.checks.every(function (x) { return !!x.choice; });
    if (!run.outcome && answered && now >= run.endAt && run.replayed >= run.beats.length) {
      var rule = run.checks.filter(function (x) { return x.kind === 'rule'; })[0];
      var mm = byslug(run.slug);
      run.outcome = rule && rule.choice === 'keep' ? 'kept' : 'broken';
      push(run, run.endAt, run.outcome === 'kept' ? 'Rule kept' : 'Rule broken',
        run.outcome === 'kept' ? mm.kept : mm.broken);
      changed = true;
    }
    if (changed) run.events.sort(function (a, b2) { return b2.ts - a.ts; });
    return changed;
  }

  /* only the platform's interruptions move money; a giver's rule moves standing */
  function applyPay(run, c, cp) {
    if (c.kind !== 'platform') return;
    var d = c.choice === 'keep' ? cp.keepPay : cp.brkPay;
    run.pay = FB.round2(Math.max(0, run.pay + (d || 0)));
    run.adjusted = FB.round2((run.adjusted || 0) + (d || 0));
  }

  function tick(opts) {
    var run = FB.missions.run();
    if (!run) { stop(); return false; }
    var changed = replay(run, Date.now());
    if (changed) FB.store.set(function (st) { st.slinging.run = run; return st; }, { silent: true });
    if (run.outcome && !run.settled) { FB.missions.settle(run, opts); }
    listeners.forEach(function (f) { try { f(); } catch (e) {} });
    return changed;
  }
  function start() { if (!timer) timer = setInterval(tick, 900); }
  function stop() { clearInterval(timer); timer = null; }

  FB.missions = {
    ALL: MISSIONS,
    SPINE: SPINE,
    get: byslug,
    build: build,
    tick: tick,
    start: start,
    stop: stop,
    minutesFor: minutesFor,
    onTick: function (fn) {
      listeners.push(fn);
      return function () { var i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); };
    },

    run: function () { return (FB.S().slinging || {}).run || null; },

    /** what this giver thinks of you. Stored, because it is a record of decisions. */
    standing: function (slug, st) {
      return (((st || FB.S()).slinging || {}).standing || {})[slug] || 0;
    },

    /* Your standing with the platform. Chains raise it, favours lower it, and it is
       the only thing that decides whether the well-paid work is offered to you. */
    platform: function (st) { return ((st || FB.S()).slinging || {}).platform || 0; },

    /* How many of the open givers are asking at all. Scarcity with no new state and
       no new timer: it is a pure function of FB.world's twenty-minute bucket, so the
       board turns over on its own and two tabs agree about what is on it. Falls with
       your platform standing, which is how the platform expresses an opinion. */
    asking: function (now) {
      var at = now || Date.now();
      var p = FB.missions.platform();
      return FB.clamp(6 + FB.clamp(Math.round(p / 2), -3, 2), 3, 8);
    },

    /** every giver, whether their door is open, and whether they are asking now */
    board: function (now) {
      var at = now || Date.now();
      var bucket = FB.world.bucket(at);
      var open = MISSIONS.filter(function (m) {
        var st = FB.catalog.get(m.slug);
        return st && FB.catalog.isOpen(st, at);
      });
      /* seeded on the bucket, so it is stable for twenty minutes and then it is not */
      var picked = {};
      FB.shuffle(open, FB.seeded('asking:' + bucket))
        .slice(0, FB.missions.asking(at))
        .forEach(function (m) { picked[m.slug] = true; });

      return MISSIONS.map(function (m) {
        var store = FB.catalog.get(m.slug);
        var isOpen = store ? FB.catalog.isOpen(store, at) : false;
        var mins = minutesFor(store);
        return {
          slug: m.slug, title: m.title, rule: m.rule, local: !!m.local,
          store: store, open: isOpen, asking: isOpen && !!picked[m.slug],
          minutes: mins, seconds: Math.round(durationFor(mins) / 1000),
          pay: FB.round2(4.10 + mins * 0.11),
          standing: FB.missions.standing(m.slug),
        };
      });
    },

    accept: function (slug, now, opts) {
      if (FB.missions.run()) return null;
      var run = build(slug, now, opts);
      if (!run) return null;
      FB.store.set(function (st) { st.slinging.run = run; return st; });
      start();
      return run;
    },

    /* Answered exactly once, the guard resolveIncident uses. Refuses after the
       deadline, because by then it has been answered for you. */
    pending: pending,
    copyFor: copyFor,
    INTERRUPTS: INTERRUPTS,
    durationFor: durationFor,

    /* Answered exactly once, the guard resolveIncident uses, and only while it is
       actually open — past the deadline it has already been answered for you. */
    answer: function (choice) {
      var run = FB.missions.run();
      if (!run) return null;
      var now = Date.now();
      var c = pending(run, now);
      if (!c || now > c.deadline) return null;
      var cp = copyFor(run, c);
      if (choice === 'keep' && cp.needsBrief && !run.briefed) return null;
      c.choice = choice === 'break' ? 'break' : 'keep';
      applyPay(run, c, cp);
      push(run, now, c.choice === 'keep' ? cp.keep[0] : cp.brk[0],
        c.choice === 'keep' ? cp.kept : cp.broken);
      FB.store.set(function (st) { st.slinging.run = run; return st; }, { silent: true });
      return { choice: c.choice, kind: c.kind };
    },

    /* Books the run exactly once. `settled` is the guard: two tabs both replaying
       the same timetable would otherwise both pay it. */
    settle: function (run, opts) {
      if (!run || !run.outcome || run.settled) return null;
      run.settled = true;
      var kept = run.outcome === 'kept';
      var m = byslug(run.slug);
      var rule = (run.checks || []).filter(function (x) { return x.kind === 'rule'; })[0] || {};
      /* THE POLITICS, and it is one scalar. Doing what a chain tells you raises your
         standing with the platform; doing one of the six a favour lowers it — and the
         platform decides which work you are shown. Nobody says any of this out loud. */
      var plat = m.local ? (kept ? -1 : 1) : (kept ? 1 : -1);
      var row = {
        id: run.id, slug: run.slug, title: run.title, at: run.endAt,
        outcome: run.outcome, elected: !!rule.elected, pay: run.pay,
        adjusted: run.adjusted || 0, local: !!m.local, platform: plat,
      };
      FB.store.set(function (st) {
        var s = st.slinging;
        s.run = null;
        s.log.unshift(row);
        if (s.log.length > 40) s.log.length = 40;
        s.completed = (s.completed || 0) + 1;
        if (kept) s.kept = (s.kept || 0) + 1; else s.broken = (s.broken || 0) + 1;
        s.earned = FB.round2((s.earned || 0) + run.pay);
        s.standing[run.slug] = (s.standing[run.slug] || 0) + (kept ? 1 : -1);
        s.platform = (s.platform || 0) + plat;
        return st;
      });
      stop();
      if (!(opts && opts.catchUp) && FB.toast) {
        FB.toast(kept ? 'Rule kept. ' + FB.money(run.pay) + ' earned.'
                      : 'Rule broken. ' + FB.money(run.pay) + ' earned.',
          { kind: kept ? 'plus' : 'bad', ms: 3600 });
      }
      return row;
    },

    /** catch up quietly, exactly as tracker.resume does */
    resume: function () {
      if (!FB.missions.run()) return;
      tick({ catchUp: true });
      if (FB.missions.run()) start();
    },

    /* the switch. Nothing is lost either way — the customer side keeps running
       underneath, because the tracker's ticker is global and never knew about this. */
    setMode: function (mode) {
      var next = mode === 'sling' ? 'sling' : 'order';
      FB.store.set(function (st) {
        st.mode = next;
        if (next === 'sling' && !st.slinging.since) st.slinging.since = Date.now();
        return st;
      });
      return next;
    },
  };
})(window.FB);

/* ---------------- Slinger Mode screens ----------------
   Appended here for the reason js/sim/bodymax.js registers its own screen: this file
   loads after the UI layer, so FB.screens exists, and the rules and the surface that
   reads them stay in one place. Nothing below decides anything — the harness cannot
   dispatch a click, so a rule written into a handler would be unreachable by every
   check in the suite. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var M = FB.missions;
  var offTick = null;

  function clockStr(ms) {
    var m = Math.max(0, Math.floor(ms / 60000)), s = Math.max(0, Math.floor((ms % 60000) / 1000));
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function standingChip(n) {
    if (!n) return '';
    var good = n > 0;
    return '<span class="badge badge--' + (good ? 'good' : 'bad') + '">' +
      (good ? '+' : '') + n + '</span>';
  }

  /* ---------------- dispatch ---------------- */
  FB.screens.register('dispatch', {
    tab: 'dispatch',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar bar--border"><h1>Dispatch</h1>' +
        '<button class="iconbtn" data-slinghelp aria-label="About Slinger Mode">' + FB.icon('help', 19) + '</button></div>';
    },
    render: function () {
      var now = Date.now();
      var st = FB.S();
      var run = M.run();
      var board = M.board(now);
      var asking = board.filter(function (b) { return b.asking; });
      var idle = board.filter(function (b) { return b.open && !b.asking; });
      var shut = board.filter(function (b) { return !b.open; });
      var plat = M.platform(st);

      var h = '<div class="disp-hd"><i>FULFILMENT PARTNER · PROVISIONAL</i>' +
        '<b>' + FB.plural(asking.length, 'restaurant is', 'restaurants are') + ' asking.</b>' +
        '<span>Clearance is not employment. Employment is not offered.</span></div>';

      h += '<div class="statgrid">' +
        '<div><b>' + FB.int(st.slinging.completed || 0) + '</b><span>RUNS</span></div>' +
        '<div><b>' + FB.int(st.slinging.kept || 0) + '</b><span>RULES KEPT</span></div>' +
        '<div><b style="color:var(--fb)">' + FB.money(st.slinging.earned || 0) + '</b><span>EARNED</span></div>' +
        '</div>';

      /* The platform's opinion of you, stated as flatly as everything else it says.
         It never explains that favours cost you work. It just offers you less. */
      if (st.slinging.completed) {
        h += '<p class="disp-plat">' +
          (plat > 1 ? 'Your partner standing is positive. More work is being shown to you.'
           : plat < -1 ? 'Your partner standing is negative. Less work is being shown to you. No reason is recorded.'
           : 'Your partner standing is neutral. This is not a rating.') +
          '</p>';
      }

      if (run) {
        h += '<div class="callout" style="margin:14px var(--pad)">' + FB.icon('bike', 17) +
          '<span>A run is in progress. It has to finish before another is offered.</span></div>' +
          '<div style="padding:0 var(--pad) 8px"><button class="btn btn--primary btn--block" data-go="run">Open the run</button></div>';
      }

      h += FB.C.sectionHead('Asking now',
        asking.length ? 'Each one wants something specific.' : 'Nobody is asking. This is a matter of minutes.');
      h += asking.map(function (b) { return card(b, !run); }).join('');

      if (idle.length) {
        h += FB.C.sectionHead('Open, not asking', 'They are serving. They do not need you.');
        h += idle.map(function (b) { return card(b, false); }).join('');
      }
      if (shut.length) {
        h += FB.C.sectionHead('Closed', 'They are not asking at this hour.');
        h += shut.map(function (b) { return card(b, false); }).join('');
      }

      h += '<div class="fineprint">Missions are offered by the restaurant and are not issued by ' +
        'FoodBang™. Rules attached to a mission are the restaurant’s own. FoodBang™ does not ' +
        'enforce them and does not disregard them.</div>';
      return h;
    },
    mount: function (root) {
      FB.on(document.getElementById('appbar'), 'click', '[data-slinghelp]', function () {
        FB.why('About Slinger Mode',
          'Restaurants issue missions directly. Each mission carries one rule set by the ' +
          'restaurant. Keeping the rule and breaking the rule are both recorded, and both are paid.');
      });
      FB.on(root, 'click', '[data-take]', function (e, t) {
        var slug = t.dataset.take;
        var m = M.get(slug);
        FB.sheet.open({
          title: m.title,
          sub: (FB.catalog.get(slug) || {}).name || slug,
          html: '<div class="brief">' +
            m.brief.map(function (l) { return '<p>' + FB.esc(l) + '</p>'; }).join('') +
            '<div class="brief-rule"><i>THE RULE</i><b>' + FB.esc(m.rule) + '</b></div>' +
            '</div>',
          footer: '<button class="btn btn--primary btn--block" data-accept="' + FB.attr(slug) + '">Accept</button>',
          onMount: function (b, hh) {
            FB.on(hh.el, 'click', '[data-accept]', function (e2, t2) {
              FB.busy(t2, 'dispatch', function () {
                hh.close();
                M.accept(t2.dataset.accept);
                FB.nav.go('run');
              });
            });
          },
        });
      });
    },
  });

  function card(b, canTake) {
    var s = b.store;
    return '<div class="mcard' + (b.local ? ' is-local' : '') + (b.asking ? '' : ' is-shut') + '">' +
      (s && s.logoSrc ? '<img src="' + s.logoSrc + '" alt="" loading="lazy" onerror="this.style.visibility=\'hidden\'">' : '') +
      '<div class="mc-b">' +
        '<div class="mc-top"><b>' + FB.esc(s ? (s.shortName || s.name) : b.slug) + '</b>' +
          standingChip(b.standing) +
          '<span class="mc-pay">' + FB.money(b.pay) + '</span></div>' +
        '<span class="mc-title">' + FB.esc(b.title) + '</span>' +
        '<span class="mc-rule">' + FB.icon('alert', 12) + FB.esc(b.rule) + '</span>' +
        '<span class="mc-meta">' + FB.mins(b.minutes) +
          (b.open ? '' : ' · opens ' + FB.esc((s && s.opensAt) || '')) +
          (b.open && !b.asking ? ' · not asking' : '') + '</span>' +
      '</div>' +
      (b.open && canTake
        ? '<button class="btn btn--sm btn--primary mc-take" data-take="' + FB.attr(b.slug) + '">Take</button>'
        : '') +
      '</div>';
  }

  /* ---------------- the run ---------------- */
  function testBlock(run, now) {
    if (!run) return '';
    var c = M.pending(run, now);
    if (!c) return '';
    var cp = M.copyFor(run, c);
    var left = Math.max(0, c.deadline - now);
    var blocked = cp.needsBrief && !run.briefed;
    var isRule = c.kind === 'rule';
    return '<div class="incident' + (isRule ? '' : ' is-platform') + '">' +
      '<div class="inc-h">' + FB.icon(isRule ? 'alert' : 'zap', 17) +
        '<b>' + FB.esc(cp.title) + '</b>' +
        '<span class="inc-clock">' + clockStr(left) + '</span></div>' +
      '<p>' + FB.esc(cp.body) +
        (isRule ? ' The rule is: ' + FB.esc(cp.rule) : '') + '</p>' +
      '<div class="inc-acts">' +
        '<button class="btn btn--ghost btn--block btn--split" data-answer="keep"' +
          (blocked ? ' disabled' : '') + '>' +
          '<span>' + FB.esc(cp.keep[0]) + '</span><span>' +
          FB.esc(blocked ? 'you dismissed the briefing' : cp.keep[1]) + '</span></button>' +
        '<button class="btn btn--ghost btn--block btn--split" data-answer="break">' +
          '<span>' + FB.esc(cp.brk[0]) + '</span><span>' + FB.esc(cp.brk[1]) + '</span></button>' +
      '</div>' +
      '<div class="inc-fine">' +
      (isRule ? 'This rule was set by the restaurant. '
              : 'This instruction was issued by FoodBang™ and is not the restaurant’s. ') +
      'If no response is recorded, it is applied on your behalf. ' +
      'The run does not continue until it is answered.</div></div>';
  }

  function runFeed(run) {
    if (!run.events.length) {
      return '<div class="tf is-now"><span class="tf-dot"></span><span class="tf-b">' +
        '<b>Accepted</b><span>Navigation is not provided.</span></span></div>';
    }
    return run.events.map(function (e, i) {
      return '<div class="tf ' + (i === 0 ? 'is-now' : i > 3 ? 'is-past' : '') + '">' +
        '<span class="tf-dot"></span><span class="tf-b"><b>' + FB.esc(e.text) + '</b>' +
        (e.sub ? '<span>' + FB.esc(e.sub) + '</span>' : '') +
        '<span>' + FB.clock(new Date(e.ts)) + '</span></span></div>';
    }).join('');
  }

  function runHead(run, now) {
    var frac = FB.clamp((now - run.startAt) / (run.endAt - run.startAt), 0, 1);
    var left = Math.max(0, Math.round((1 - frac) * run.minutes));
    var held = !!M.pending(run, now);
    return '<div class="te-k">' + (run.outcome ? 'RUN COMPLETE' : held ? 'HELD' : 'IN PROGRESS') + '</div>' +
      '<h2>' + (run.outcome ? FB.esc(run.title) : left + ' min') + '</h2>' +
      '<div class="te-s">' + FB.esc(run.title) + ' · ' + FB.esc(run.store) + '</div>' +
      (held ? '<div class="te-drift">' + FB.icon('alert', 13) + 'The run is held until the rule is answered.</div>' : '');
  }

  function outcomeCard(run) {
    if (!run.outcome) return '';
    var m = M.get(run.slug);
    var kept = run.outcome === 'kept';
    return '<div class="callout callout--' + (kept ? 'plus' : 'warn') + '" style="margin:12px var(--pad)">' +
      FB.icon(kept ? 'check' : 'alert', 17) +
      '<span><b>' + (kept ? 'Rule kept.' : 'Rule broken.') + '</b> ' +
      FB.esc(kept ? m.kept : m.broken) + '</span></div>';
  }

  FB.screens.register('run', {
    tab: 'run',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar bar--border"><button class="iconbtn" data-back aria-label="Back">' +
        FB.icon('back', 20) + '</button><h1>Run</h1></div>';
    },
    render: function () {
      var run = M.run();
      var st = FB.S();
      if (!run) {
        var last = (st.slinging.log || [])[0];
        return FB.C.empty({
          title: last ? 'No run in progress' : 'Nothing to run',
          body: last
            ? 'Your last run was ' + last.title + ', and the rule was ' + (last.outcome === 'kept' ? 'kept.' : 'broken.')
            : 'Dispatch has the list. Each restaurant wants something specific.',
          cta: 'Dispatch', go: 'dispatch',
        });
      }
      var now = Date.now();
      var h = '<div class="trk-map">' + FB.tracker.mapSvg(
        { id: run.id, mode: 'delivery' }, 0, { fromLabel: 'PICKUP', toLabel: 'DROP' }) + '</div>';
      h += '<div class="trk-eta">' + runHead(run, now) + '</div>';
      h += '<div class="run-test">' + testBlock(run, now) + '</div>';
      h += '<div class="run-out">' + outcomeCard(run) + '</div>';
      h += '<div class="trk-feed">' + runFeed(run) + '</div>';
      h += '<div class="fineprint">The rule attached to this run was set by the restaurant. ' +
        'Both answers are paid. Only one of them is remembered by them.</div>';
      return h;
    },
    mount: function (root, p) {
      var run = M.run();
      if (!run) return;
      FB.tracker.placeCourier(root, { id: run.id }, 0);

      FB.on(root, 'click', '[data-answer]', function (e, t) {
        FB.busy(t, 'save', function () {
          M.answer(t.dataset.answer);
          FB.nav.refresh();
        });
      });

      if (offTick) { offTick(); offTick = null; }
      var lastHead = '', lastTest = '', lastFeed = '', lastOut = '';
      offTick = M.onTick(function () {
        var cur = FB.nav.current();
        if (!cur || cur.name !== 'run') return;
        var r = M.run();
        if (!r) { FB.nav.refresh(); return; }
        var now = Date.now();
        var nh = runHead(r, now), nt = testBlock(r, now), nf = runFeed(r), no = outcomeCard(r);
        var eta = root.querySelector('.trk-eta');
        if (eta && nh !== lastHead) { eta.innerHTML = nh; lastHead = nh; }
        var te = root.querySelector('.run-test');
        if (te && nt !== lastTest) { te.innerHTML = nt; lastTest = nt; }
        var ou = root.querySelector('.run-out');
        if (ou && no !== lastOut) { ou.innerHTML = no; lastOut = no; }
        var fd = root.querySelector('.trk-feed');
        if (fd && nf !== lastFeed) { fd.innerHTML = nf; lastFeed = nf; }
        var frac = FB.clamp((now - r.startAt) / (r.endAt - r.startAt), 0, 1);
        /* the marker stops where the story stops: a held run is not moving */
        var hold = M.pending(r, now);
        var travelled = hold ? FB.clamp((hold.at - r.startAt) / r.span, 0, 1) : frac;
        FB.tracker.placeCourier(root, { id: r.id }, travelled);
      });
    },
    unmount: function () { if (offTick) { offTick(); offTick = null; } },
  });
})(window.FB);
