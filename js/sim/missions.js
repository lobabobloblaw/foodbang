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
      broken: 'The unit acknowledged the contact. The contact has been logged.',
      voice: {
        known: { card: 'The unit released early.',
          line: 'The unit has released to this handler without settlement delay on prior occasions.',
          prompt: ['The unit has released early', 'It is on the shelf. It was on the shelf before you arrived.'],
          keep: ['Take it and go', 'the unit releases on its own schedule'],
          brk:  ['Tap the glass', 'to acknowledge it'],
          kept: 'You took it and went. The unit did not acknowledge you and did not need to.',
          broken: 'The unit acknowledged the contact. The early release has been reviewed and discontinued.',
          turn: 'The unit has begun releasing to you before settlement. No decision was made about this.' },
        cold: { card: 'Contact is on the log.',
          line: 'Contact events associated with this collection point have been logged. Service has not been interrupted.',
          prompt: ['The unit has not acknowledged you', 'It is holding at temperature. It has held longer than usual.'],
          keep: ['Wait', 'the unit releases on its own schedule'],
          brk:  ['Tap the glass', 'faster'],
          kept: 'The unit released the order. It took longer than it takes.',
          broken: 'The unit acknowledged the contact. The contact has been added to the existing log.',
          turn: 'A contact log has been opened for this collection point. It is not reviewed.' },
      },
      beats: [
        /* Front-loaded approach then a stationary stall — the only spine whose middle beat reports that nothing has happened, because standing at the glass doing nothing is the mission, and the road is a single unnarrated gap at the end. */
        [0.02, 'Accepted · {store}', 'Sunview Galleria, upper level. Staffing was discontinued in a prior fiscal year and service has not been interrupted.'],
        [0.13, 'At the glass', 'You are at the sneeze guard. Behind it, the wok has never been off.'],
        [0.28, 'Settlement complete', '{pickup}'],
        [0.44, 'Holding at temperature', 'Nothing on the shelf has changed. Holding is a service and is reflected in the price.'],
        [0.70, 'Collected', '{slinger} {has} the vessel and {fries} besides. The unit did not observe either and does not observe.'],
        [0.92, 'Delivered, unacknowledged', 'Set down at the door with the divider intact. No acknowledgement was required at either end.'],
      ] },

    { slug: 'oliveorchard', title: 'Departure',
      brief: ['Guests are family. Family arrangements remain in effect.',
              'The order is ready. Getting out of the building is the assignment.'],
      rule: 'Leave.',
      prompt: ['A refill has been brought to you', 'You did not order it. It is on the table.'],
      keep: ['Accept the refill', 'and then leave'],
      brk:  ['Refuse it', 'processed as a refill'],
      kept: 'You accepted the refill and left. It took eleven minutes.',
      broken: 'The refusal was processed as a refill. A second was brought.',
      /* INVERTED ON PURPOSE. Everywhere else being known is warmer; here it is worse.
         Family arrangements, once entered into, remain in effect — so the reward for
         keeping faith with Olive Orchard is that leaving takes longer every time.
         This is the entry that stops the ladder reading as a reward track. */
      voice: {
        known: { card: 'Your table is held.',
          line: 'A table is held for you. Family arrangements, once entered into, remain in effect.',
          prompt: ['They have seated you', 'You did not ask to be seated. There is a refill on the table.'],
          keep: ['Accept the refill', 'and then leave'],
          brk:  ['Refuse it', 'processed as a refill'],
          kept: 'You accepted the refill and left. It took nineteen minutes. It is getting longer.',
          broken: 'The refusal was processed as a refill. The table will be held again on Thursday.',
          turn: 'A standing table has been entered for you. Standing arrangements remain in effect.' },
        cold: { card: 'A refusal is on file.',
          line: 'A refusal has been processed at this location. Refusal of a refill is processed as a refill.',
          prompt: ['A refill has been brought to you', 'It was brought immediately. You did not sit down.'],
          keep: ['Accept the refill', 'and then leave'],
          brk:  ['Refuse it', 'processed as a refill'],
          kept: 'You accepted the refill and left. It took eleven minutes, as it does.',
          broken: 'The refusal was processed as a refill. A third was brought. You did not see who brought it.',
          turn: 'The arrangement is unchanged. Guests are family.' },
      },
      beats: [
        /* Front-loaded and then stalled: four beats crowd into the first third, then a forty-point silence in which the player is simply inside the building — the refill comes due in that silence — and the run only moves again once you are in the lot, which is the moment leaving has actually happened. */
        [0.02, 'Accepted · {store}', 'Navigate to Outparcel D, Exit 118B. The entrance is marked.'],
        [0.13, 'Seated', 'You stated you were collecting. A table was assigned anyway. Guests are family.'],
        [0.24, 'Order at the pass', '{pickup}'],
        [0.31, 'Exit process opened', 'Departure is a process at this location. It is billed separately from the meal.'],
        [0.72, 'In the lot', 'You are outside the building with the bag. The building remains open until 10:45 PM.'],
        [0.92, 'Delivered', 'The customer took the bag at the door and closed it. Nobody was seated.'],
      ] },

    { slug: 'ssa', title: 'Determination',
      brief: ['The application has been reviewed. A determination has been issued.',
              'Determinations are final and are not disclosed. You are carrying one.'],
      rule: 'Do not read the determination.',
      prompt: ['The envelope is not sealed', 'It was issued unsealed. That is not an invitation.'],
      keep: ['Deliver it as issued', 'unread'],
      brk:  ['Read it', 'you will know'],
      kept: 'Delivered as issued. You do not know what it said.',
      broken: 'You know what it said. The Authority has been notified that you know.',
      voice: {
        known: { card: 'Issued unsealed.',
          line: 'Prior determinations carried by you were delivered unread. This is on file and is not a commendation.',
          prompt: ['The envelope is not sealed', 'It has not been sealed for you in some time.'],
          keep: ['Deliver it as issued', 'unread'],
          brk:  ['Read it', 'you will know'],
          kept: 'Delivered as issued. The file records no findings.',
          broken: 'You know what it said. The file recorded no findings until today.',
          turn: 'A handling history has been opened in your name. It contains no findings.' },
        cold: { card: 'Issued sealed.',
          line: 'Determinations are final and are not disclosed. This one has been issued sealed.',
          prompt: ['The envelope is sealed', 'Sealing is applied where prior handling has been recorded.'],
          keep: ['Deliver it as issued', 'sealed'],
          brk:  ['Open it', 'the seal is recorded'],
          kept: 'Delivered as issued. The seal was intact on receipt and this has been recorded.',
          broken: 'The seal was broken. Seal integrity is a separate finding and has been filed separately.',
          turn: 'Subsequent determinations in this jurisdiction will be issued sealed. No appeal is provided.' },
      },
      beats: [
        /* Four beats of counter bureaucracy crammed into the first quarter, then a deliberate 0.53 of nothing — twenty-odd minutes alone with an unsealed envelope, which is where the rule comes due — and the paperwork closes the window at 0.80 by recording the handover before it physically happens. */
        [0.02, 'Accepted · {store}', 'Report to Sublevel 3, Suite B-0. Exit 41B is the only exit that serves it.'],
        [0.10, 'Number issued', 'The dispenser is fully stocked. The board is showing a number from this morning.'],
        [0.18, 'Released at the window', '{pickup}'],
        [0.27, 'Ancillary filing', '{slinger} took {fries} from the bag. It has been entered as an ancillary filing and is not a determination.'],
        [0.74, 'Custody transferred', 'The transfer was recorded while you were still driving. Records are not amended to agree with the street.'],
        [0.93, 'Issued', 'The determination was handed over. The applicant asked what it said.'],
      ] },

    { slug: 'chipoltergeist', title: 'Cold Spot',
      brief: ['Cold spots between the salsa well and the register are known, documented, and priced.',
              'The order passed through one. This is disclosed and is not a defect.'],
      rule: 'Do not report it as cold.',
      prompt: ['The order is cold', 'It was cold when it was made. It is colder now.'],
      keep: ['Say nothing', 'it is disclosed'],
      brk:  ['Report it', 'as cold'],
      kept: 'Nothing was reported. The disclosure stands.',
      broken: 'A cold report was filed against a disclosed cold spot. It was closed.',
      beats: [
        /* Front-loaded instead of evenly paced: four beats crowd into the first quarter while you are still inside the building and in the line, then roughly twenty minutes of nothing at all — the run's whole middle is the silence in which the food keeps not being warm — and it resolves in two beats at the door. */
        [0.02, 'Accepted · {store}', 'The building is haunted. The line moves anyway. Join it at the back.'],
        [0.10, 'In the line', 'Assembly is performed in full view of the guest. For the length of the line you are a guest.'],
        [0.18, 'Salsa well to register', '{pickup}'],
        [0.27, 'Foil sealed', 'Two staples and a receipt. {slinger} {has} taken {fries}. Nobody at the register looked up; that is a service standard.'],
        [0.74, 'Transferred', 'The vessel passes from the bag to the household. Temperature from this point is the household\'s.'],
        [0.93, 'Run closed', 'The cold spot did not travel. It remains between the well and the register, where it is documented.'],
      ] },

    { slug: 'mcronalds', title: 'Procedure',
      brief: ['Procedures described in this listing are procedures. They are not promises.',
              'The 1974 manual specifies a collection door on the north face.'],
      rule: 'Follow the manual.',
      prompt: ['There is no north door', 'The manual has never been revised. The building has.'],
      keep: ['Wait at the wall', 'as specified'],
      brk:  ['Use the door that exists', 'unspecified'],
      kept: 'You waited at the wall. Someone came around eventually.',
      broken: 'You used an unspecified door. The deviation is billed.',
      beats: [
        /* Front-loaded to the point of crowding — four beats inside the first third, every one of them still on the pad site — so the run's only slack is the wait itself: one long dead stretch at a north face that has no door, which is exactly where the manual comes due. */
        [0.02, 'Run accepted', '{store}, Pad Site C. The lot is entered from the frontage road, and the frontage road is one-way.'],
        [0.10, 'Notice, weekly', 'The Frozen Dairy Solutions unit is operational. The notice was printed Monday and describes Monday.'],
        [0.19, 'In assembly', 'The Sandwich Program is running. Its output is staged, which is part of the procedure.'],
        [0.30, 'North face', '{pickup}'],
        [0.68, 'Off the lot', '{slinger} {has} taken {fries} as tribute. The frontage road is one-way and the north face is behind you.'],
        [0.92, 'Delivered to curb', 'The bag was placed at the curb. The neighbors were notified, as described.'],
      ] },

    { slug: 'applebeez', title: 'Riblets',
      brief: ['RIBLETS ARE AVAILABLE. RIBLETS HAVE ALWAYS BEEN AVAILABLE.',
              'The customer may raise the question of availability.'],
      rule: 'Riblets have always been available.',
      prompt: ['They asked when riblets came back', 'They remember them going away.'],
      keep: ['They never left', 'as stated'],
      brk:  ['Agree that they left', 'accurate'],
      kept: 'You confirmed continuous availability. Records agree with you.',
      broken: 'You confirmed a gap in availability. There is no record of a gap.',
      voice: {
        known: { card: 'Records agree with you.',
          line: 'Your account of availability has matched the record on every occasion. This is expected.',
          prompt: ['They asked when riblets came back', 'They remember them going away. You have been asked this before.'],
          keep: ['They never left', 'as stated, again'],
          brk:  ['Agree that they left', 'accurate'],
          kept: 'You confirmed continuous availability. Records agree with you, as they have.',
          broken: 'You confirmed a gap. Records agree with you on everything except this.',
          turn: 'Records agree with you. This has been noted in the neighborhood file.' },
        cold: { card: 'A gap was reported.',
          line: 'A gap in availability was reported from this location. The report was not retained.',
          prompt: ['They asked when riblets came back', 'They have been told before. They are asking you.'],
          keep: ['They never left', 'as stated'],
          brk:  ['Agree that they left', 'accurate'],
          kept: 'You confirmed continuous availability. The earlier report remains unretained.',
          broken: 'You confirmed a gap. There is no record of a gap and now there are two of you.',
          turn: 'A pattern has been identified at this location. It is retained.' },
      },
      beats: [
        /* Four beats bunched into the first quarter at the pad site, then a dead half-run across the outlots where nothing is narrated at all and the question arrives unaccompanied, then only the threshold and the record. */
        [0.02, 'Dispatched · {store}', '{store} is at Pad Site C, behind the former bank. The lot is the neighborhood.'],
        [0.09, 'Vestibule', 'Waiting is done under antiques purchased in bulk from a single vendor.'],
        [0.18, 'Tribute logged', '{slinger} {has} taken {fries} from the pass. It is recorded as shrinkage and not as loss.'],
        [0.28, 'One basket, released', '{pickup}'],
        [0.74, 'Handed over', 'The basket is across the threshold. Nothing stated after this point is entered.'],
        [0.94, 'Closed', 'Riblets remain available. The record shows no interruption and has never shown one.'],
      ] },

    { slug: 'starbux', title: 'Regional',
      brief: ['Product is dispensed by volume through calibrated brass hoses rather than poured.',
              'You are carrying a Regional. Watershed remains suspended pending a drain inspection.'],
      rule: 'Do not set it down.',
      prompt: ['Your arm', 'A Regional is not a cup. There is a wall here.'],
      keep: ['Do not set it down', 'as instructed'],
      brk:  ['Set it down', 'briefly'],
      kept: 'It was not set down. Your arm is a matter for you.',
      broken: 'It was set down. Volume settled. The settled volume is the volume.',
      beats: [
        /* Four beats bunched into the first third at the dispensing bay, then a long silent carry — the middle of this run is nothing but the weight on your arm, which is exactly where the rule comes due — closed by the last piece of level ground before the door. */
        [0.02, 'Accepted · {store}', 'Bay 7, Pump Court Commons. Approach on foot. The frontage road has no shoulder.'],
        [0.12, 'Hose coupled', 'Fourteen liters per minute. The line does not stop early and cannot be paused once opened.'],
        [0.21, 'Regional, filled', '{pickup}'],
        [0.31, 'Foam deck set', '{slinger} {has} placed {fries} on the foam deck. The deck is rated to one item and that is the item.'],
        [0.63, 'Last level ground', 'The rest of the address is stairs and grade. There is no surface between here and the door.'],
        [0.92, 'Delivered', 'Depth measured at the door and recorded against the depth taken at the bay.'],
      ] },

    { slug: 'cluckingham', title: 'Before The Inspector',
      brief: ['The Compound’s gravy line is now connected to the township’s secondary main.',
              'An inspection is scheduled. Your collection is not related to the inspection.'],
      rule: 'Do not enter the gravy room.',
      prompt: ['The gravy room is the short way', 'It is also where the inspection is.'],
      keep: ['Go around', 'six minutes'],
      brk:  ['Cut through', 'ninety seconds'],
      kept: 'You went around. The inspection proceeded without you in it.',
      broken: 'You were in the gravy room during the inspection. You are in the inspection.',
      beats: [
        /* Front-loaded: three beats crammed into the first third while the Compound processes you, then half the run is silence inside the perimeter — which is exactly where the gravy-room question lands — and the last two beats snap shut on top of each other. */
        [0.02, 'Posted · {store}', 'Report to Bay 6. The retention pond should be behind you when you are correct.'],
        [0.11, 'Bay 6', 'The gate stands open for the inspection. Signage routes you past the fryers, whose pressure is monitored and not published.'],
        [0.21, 'Collection staged', '{pickup}'],
        [0.34, 'Signed out', 'The bucket leaves sealed and warm on one side; the gravy leaves separate. {slinger} {has} taken {fries} under §4.2.'],
        [0.74, 'Off the Compound', 'The gate closes at the posted rate. The interior is now an interior matter.'],
        [0.94, 'Delivered, sealed', 'The bucket arrived warm on the same side it left. Receipt of gravy was not disputed.'],
      ] },

    { slug: 'manufactory', title: 'Page 118',
      brief: ['MENU PAGES 96-141 ARE CURRENTLY UNDER LOAD REVIEW.',
              'Items on those pages remain orderable and remain large. This is one of them.'],
      rule: 'The item is not adjustable at the table.',
      prompt: ['It does not fit the bag', 'Portions are specified by the structural department.'],
      keep: ['Carry it uncontained', 'as specified'],
      brk:  ['Adjust it', 'to fit'],
      kept: 'Carried uncontained, as specified. Both hands.',
      broken: 'The item was adjusted. The structural department has been informed.',
      beats: [
        /* Front-loaded: five beats crowd the first 40% while you are still inside the building, then a 44-point void where the only thing happening is that you are carrying it, then the commitment and the door. */
        [0.02, 'Accepted · {store}', 'Navigate to {store}. Park at Outparcel 7. The entrance is not at Outparcel 7.'],
        [0.10, 'Vestibule', 'You are inside the building and not inside the restaurant. This is normal for the building.'],
        [0.19, 'Page 118', '{pickup}'],
        [0.28, 'Handed over', '{slinger} {has} taken {fries} as tribute, which fits in a bag. The item does not.'],
        [0.40, 'One exit', 'The exit is at the rear of the Cheesecake Vault. You are on page 214.'],
        [0.74, 'Ring road, outbound', 'The ring road is one direction. Whatever shape it is in now is the shape it arrives in.'],
        [0.93, 'Delivered', 'Placed on the step. It occupies the step and part of the doorway.'],
      ] },

    { slug: 'pizzahutch', title: 'Metered Return',
      brief: ['The salad bar remains under sneeze-guard supervision. Return trips are metered.',
              'Two returns are included with this collection.'],
      rule: 'Two returns are permitted.',
      prompt: ['A third return is needed', 'Something was left behind. Returns three and above are metered.'],
      keep: ['Do not return', 'incomplete'],
      brk:  ['Return a third time', 'metered'],
      kept: 'You did not return. The order is incomplete and was not metered.',
      broken: 'A third return was metered. The meter is not itemised.',
      /* The quota stays TWO at every band. A third return granted would be a metered
         charge waived, and a waived charge is a price — which is the other axis. */
      voice: {
        known: { card: 'Two are what is included.',
          line: 'Returns are metered from the third. Your metering history at this location is unremarkable.',
          prompt: ['A third return is needed', 'Two have been used. Two are what is included.'],
          keep: ['Do not return', 'incomplete'],
          brk:  ['Return a third time', 'metered'],
          kept: 'You did not return. The order is incomplete and was not metered.',
          broken: 'A third return was metered. It is the first one that has been.',
          turn: 'Your metering history at this location contains no entries.' },
        cold: { card: 'Metering is on request.',
          line: 'Returns three and above are metered. Your metering history at this location is available on request and is not available.',
          prompt: ['A third return is needed', 'Something was left behind. Returns three and above are metered.'],
          keep: ['Do not return', 'incomplete'],
          brk:  ['Return a third time', 'metered'],
          kept: 'You did not return. The order is incomplete and was not metered.',
          broken: 'A third return was metered against a running total. The total is not itemised.',
          turn: 'A running total has been opened at this location. It is not itemised.' },
      },
      beats: [
        /* Front-loaded: five beats bunched inside the building while the two metered returns are spent, then half the run with nothing at all on the frontage loop, then the door — the opposite of the default's even walk. */
        [0.02, 'Accepted · {store}', 'Pad C, behind the former Sears. The former Sears is the landmark and is not there.'],
        [0.10, 'Dine-in room', 'Seating remains available and is no longer recommended. Wait at the guard.'],
        [0.19, 'Collected', '{pickup}'],
        [0.28, 'Return one of two', 'The Sneeze Guard Assembly was assembled after the bag was closed. The employee did not narrate the assembly.'],
        [0.36, 'Return two of two', 'The fountain draw was still being drawn. {slinger} {has} taken {fries} past the bar on the way out.'],
        [0.74, 'Frontage loop', 'The loop is one-way past the pad. The counter is behind the vehicle and the vehicle does not turn.'],
        [0.93, 'Delivered', 'Handed over in the pan. The pan is not recovered and is not itemised.'],
      ] },

    { slug: 'tacobelligerent', title: 'Fourth Meal',
      brief: ['THE FOURTH MEAL PROTOCOL IS ACTIVE.',
              'All formats are folded, layered, coned, or wrapped inside another format at our sole discretion.'],
      rule: 'The format is not disclosed before handover.',
      prompt: ['They asked what format it is', 'The format was decided after the order was placed.'],
      keep: ['Do not disclose', 'per protocol'],
      brk:  ['Tell them the format', 'they asked'],
      kept: 'The format was not disclosed. It was handed over folded.',
      broken: 'The format was disclosed before handover. The protocol notes this.',
      beats: [
        /* Front-loaded rather than evenly spaced: four beats crammed into the first third (lot, discretion, seal, tribute), then the widest silence in any spine across the whole middle, so the format question arrives into dead air on the frontage loop and only the door and the after-the-door beat are left. */
        [0.02, 'Fourth Meal · {store}', 'Outparcel 4, behind the tire place. The lot lights are the address.'],
        [0.11, 'Sole discretion', '{pickup}'],
        [0.19, 'Bag sealed', 'Six ingredients, forty-one names. The name is on the receipt and the receipt is inside the bag.'],
        [0.28, 'Tray tribute', '{slinger} {has} taken {fries} out of the compartmented tray. The compartments are decorative and are not load-bearing.'],
        [0.74, 'At the door', 'Bag closed, receipt inside. Disclosure before handover is no longer available.'],
        [0.94, 'Delivered', 'Handed over folded. Determinations made on this property are final and are not reviewable.'],
      ] },

    { slug: 'entirefoods', title: 'Chalkboard',
      brief: ['SEASONAL NOTICE: The chalkboards are being rewritten this week.',
              'Prices shown may be lower than the prices being charged.'],
      rule: 'Collect at the posted price.',
      prompt: ['The posted price is lower', 'The register has the other one.'],
      keep: ['Pay the posted price', 'as written'],
      brk:  ['Pay the register price', 'as charged'],
      kept: 'You paid what was posted. The difference is being rewritten.',
      broken: 'You paid what was charged. The chalkboard was correct and is now gone.',
      beats: [
        /* Four beats crammed into the first 40% — the whole run's density is inside the building, where everything is weighed and re-priced — then a 0.28 stretch of nothing on the Power Center's internal road; the commit is walking out past the bollards, after which the register has no further interest. */
        [0.02, 'Accepted · {store}', 'Building D, past the Power Center. The internal road is one-way and is not marked.'],
        [0.13, 'Boards off the wall', 'Four chalkboards are down. The committee that sets them meets seasonally and is meeting.'],
        [0.26, 'On the scale', '{pickup}'],
        [0.42, 'Held at the register', 'The queue is one person. That person is being explained the price.'],
        [0.70, 'Through the bollards', 'The receipt is in the bag. Past the bollards the register has no further interest.'],
        [0.93, 'Delivered', 'Left in paper on the step. The paper is packaging and is itemised.'],
      ] },

    { slug: 'brawndo', title: 'Watershed Drop',
      brief: ['DOCK NOTICE: Orders above 275 gallons are delivered to the curb.',
              'They become the household’s problem at the curb. Reaching the curb is your problem.'],
      rule: 'It becomes their problem at the curb.',
      prompt: ['They have asked you to bring it in', 'It is above 275 gallons.'],
      keep: ['Leave it at the curb', 'as noticed'],
      brk:  ['Bring it in', 'past the curb'],
      kept: 'Left at the curb. It became their problem exactly there.',
      broken: 'It was brought past the curb. It is no longer clear whose problem it is.',
      beats: [
        /* Freight, not food: four beats bunched at the dock in the first quarter, then a third of the run in silence while the weight is hauled, then a three-beat rush at the property line — and the committing beat is the weigh-out that closes the weigh-in, because nothing may be returned to the depot. */
        [0.02, 'Accepted · {store}', 'Report to Bay 14, Dock C. Foot traffic past the striping is not insured.'],
        [0.08, 'Weighed empty', 'The vehicle was weighed before loading. It is weighed again on the way out.'],
        [0.17, 'Loaded', '{pickup}'],
        [0.25, 'Volume adjusted', '{slinger} {has} drawn {fries} off the load. The manifest is not amended.'],
        [0.49, 'At the address', 'The driveway rises from the curb. The household is at the door and has not come out.'],
        [0.74, 'Weighed out', 'The vehicle is lighter by the manifest amount. Nothing may be returned to the depot.'],
        [0.94, 'Drop complete', 'The household has been notified of the volume now in its possession. Notification does not require a response.'],
      ] },

    { slug: 'dunkinn', title: 'Continuous Morning',
      brief: ['MORNING IS NOW CONTINUOUS. You are already enrolled in the rewards programme.',
              'Nineteen minutes. This is the tightest window in the city.'],
      rule: 'Nineteen minutes.',
      prompt: ['There is a shorter way', 'It goes past the school at the hour it lets out.'],
      keep: ['Take the route', 'nineteen minutes'],
      brk:  ['Take the shorter way', 'twelve'],
      kept: 'You took the route. Nineteen minutes, as classified.',
      broken: 'You took the shorter way. It was shorter.',
      beats: [
        /* The commit beat sits at 0.72 rather than the 0.58 first written, because
           Dunkinn has the shortest span in the game and a rule needs
           INCIDENT_MIN_MS + RESOLVE_MARGIN_MS of room before the beat that closes it
           — 28s against this run's 45s, so the commit cannot come before ~0.62. At
           0.58 the store produced a run with nothing to decide. Moving it later also
           lengthens the silence, which is what this shape is about. */
        /* Front-loaded to the point of crowding: accept, counter and collection all land inside the first fifth, then the run goes silent for a third of itself until one beat closes the road — the whole story is told before the halfway mark and the rest is just the clock. */
        [0.02, 'Assigned · {store}', 'Bay 4, behind the other one. The other one is also {store}.'],
        [0.11, 'The Panic Line', '{pickup}'],
        [0.21, 'Load classified', 'Class IV, load-bearing, boxed for transit. {slinger} {has} taken {fries}; §4.2 covers the tribute.'],
        [0.72, 'Past the turning', 'The last turning is behind you. Whichever road this is, it is now the only one.'],
        [0.90, 'Delivered warm', 'The beverage arrived within its class. The morning continues. Your enrolment does not lapse.'],
      ] },

    /* ---- the six ---- */

    { slug: 'gyropalace', title: 'Route 9', local: true,
      brief: ['Emre asks. It is not an order and it is not on the ticket.',
              'The first Gyro Palace was on Route 9. That building is a phone store now.'],
      rule: 'Ask whether the sign is still up.',
      prompt: ['You are outside the phone store', 'There is someone behind the counter.'],
      keep: ['Go in and ask', 'four minutes'],
      brk:  ['Keep going', 'you are on a clock'],
      kept: 'You asked. The sign came down in 2019. Emre already knew.',
      broken: 'You kept going. Emre will ask you next time, in the same way.',
      /* Emre's `broken` line is the only future-tense sentence in this table — "he
         will ask you next time, in the same way" — and until the ladder was read,
         next time was identical to this time. This is the promise being kept. */
      voice: {
        known: { card: 'Emre asks anyway.',
          line: 'Emre knows you have been. He asks anyway, because it is the asking.',
          prompt: ['You are outside the phone store', 'You know what is behind the counter. Emre knows that you know.'],
          keep: ['Go in anyway', 'four minutes'],
          brk:  ['Tell him from here', 'you already know'],
          kept: 'You went in. Nothing had changed. You told him that, which is what he wanted.',
          broken: 'You told him from the car. He said okay. He will ask you next time anyway.',
          turn: 'Sami came out to the car and said Emre says hello.' },
        cold: { card: 'Emre asks again.',
          line: 'Emre asks again. He does not mention the last time and he asks it the same way.',
          prompt: ['You are outside the phone store again', 'There is someone behind the counter. It is a different person.'],
          keep: ['Go in and ask', 'four minutes, again'],
          brk:  ['Keep going', 'you are on a clock, again'],
          kept: 'You asked this time. Emre said thank you and did not say anything else about it.',
          broken: 'You kept going. Emre will ask you next time, in the same way.',
          turn: 'Emre asked. He did not ask how it went.' },
      },
      beats: [
        /* Six beats front-loaded at the one grill, then a 0.46 dead stretch of Route 9 where the only thing that happens is Emre's question, and a two-beat rush at the door — the slack IS the drive past the phone store. */
        [0.02, 'Accepted · {store}', 'Exit 27, Unit 12, behind the car wash. The car wash is a separate business and has not agreed to anything.'],
        [0.13, 'One grill', 'The order is behind two others on the grill. There is one grill. The forty-five minutes was produced elsewhere.'],
        [0.27, 'Collected', 'Sami reads the notes off the screen because the printer cuts them off. {fries} taken from the cooler as tribute, per the Slinger Agreement, §4.2.'],
        [0.40, 'Route 9 South', '{pickup}'],
        [0.74, 'Past the turn', 'The old lot is behind you. The route does not go back for it.'],
        [0.94, 'Delivered', 'The bag was handed to a person. The record prefers a door.'],
      ] },

    { slug: 'wingbunker', title: 'The Same Fryer', local: true,
      brief: ['Same fryer since 1996. It came from the Route 9 location when that closed in 2011.',
              'A part for it is being held for us behind the counter.'],
      rule: 'Do not tell the gas station.',
      prompt: ['The attendant asked what you are carrying', 'The kitchen is at the back, past the coffee.'],
      keep: ['Say nothing', 'keep walking'],
      brk:  ['Explain', 'about the fryer'],
      kept: 'You kept walking. The part is in the back with the fryer.',
      broken: 'You explained. The gas station now knows about the fryer.',
      voice: {
        known: { card: 'Ray comes out.',
          line: 'Ray comes out to the air pump when he sees the car. The part is still behind the counter.',
          prompt: ['The attendant asked what you are carrying', 'Ray is already at the side door.'],
          keep: ['Say nothing', 'Ray is waiting'],
          brk:  ['Explain', 'about the fryer'],
          kept: 'You said nothing. Ray had it bagged and sorted the flats by hand.',
          broken: 'You explained. Ray did not say anything about it and will not.',
          turn: 'Ray came out to the air pump before you were parked.' },
        cold: { card: 'Use the side door.',
          line: 'Use the side door by the air pump. The main door alarm goes off after eight.',
          prompt: ['The attendant asked what you are carrying', 'You came in the main door. He watched you do it.'],
          keep: ['Say nothing', 'keep walking'],
          brk:  ['Explain', 'about the fryer'],
          kept: 'You kept walking. Nobody came out to meet you.',
          broken: 'You explained again. Ray heard you do it from the back.',
          turn: 'The side door was locked. Nobody came out.' },
      },
      beats: [
        /* Front-loaded then dead: four beats crammed into the first 40% getting you through the fuel stop to the counter, then a 0.37 hole while the fryer does its eighteen-to-twenty — the wait the restaurant advertises IS the slack middle, and the attendant's question lands in it. */
        [0.02, 'Exit 41B', '{store} is inside the fuel stop. The fuel stop is not {store}.'],
        [0.13, 'Side door', 'The door by the air pump. The main door is alarmed after eight.'],
        [0.26, 'Past the coffee', 'The counter is at the back of the building. {pickup}'],
        [0.41, 'Fried to order', 'Eighteen to twenty minutes. The advertised time is not the kitchen\'s time.'],
        [0.74, 'Out past the pumps', 'The bag is in the car. The counter is behind you.'],
        [0.93, 'Delivered', 'Completed outside the advertised window. The window is advisory.'],
      ] },

    { slug: 'verdadera', title: 'Before It Is A Day Old', local: true,
      brief: ['SALSA HECHA CADA MAÑANA. NO ANTES.',
              'Señora Elvia does not send out salsa that is a day old. It is 11:40.'],
      rule: 'It goes out today.',
      prompt: ['It is 11:52', 'Eight minutes. The address is fourteen away.'],
      keep: ['Take it anyway', 'it will be late'],
      brk:  ['Hold it to tomorrow', 'it will be a day old'],
      kept: 'It went out today. It arrived at 12:06, which was today when it left.',
      broken: 'It was held. Señora Elvia made a fresh one and threw the first away.',
      voice: {
        known: { card: 'She holds it for you.',
          line: 'Senora Elvia keeps the last container back until she sees the car. She does not measure anything.',
          prompt: ['It is 11:52', 'She held it back for you. The address is fourteen away.'],
          keep: ['Take it anyway', 'it will be late and it will be today'],
          brk:  ['Hold it to tomorrow', 'she held it for you'],
          kept: 'It went out today. She had already written the address on the lid.',
          broken: 'It was held. She made a fresh one in the morning and did not say anything about the first.',
          turn: 'She had it on the counter with your name on the lid.' },
        cold: { card: 'Elvia made a second one.',
          line: 'Senora Elvia has made a second batch twice this month. She does not mention it.',
          prompt: ['It is 11:52', 'Eight minutes. The address is fourteen away. She is watching the door.'],
          keep: ['Take it anyway', 'it will be late'],
          brk:  ['Hold it to tomorrow', 'it will be a day old'],
          kept: 'It went out today. She watched you take it and went back to the pot.',
          broken: 'It was held. Senora Elvia made a fresh one and threw the first away. That is twice.',
          turn: 'She put it on the counter and stepped away from it.' },
      },
      beats: [
        /* Front-loaded instead of evenly walked: four beats crowd into the twelve minutes at the counter, then a 0.38 dead stretch where the only thing that moves is the clock — the rule lands in that silence, with nothing between it and a turn that cannot be taken back. */
        [0.02, 'Accepted · {store}', 'Suite D, behind the tire place. The tire place is the landmark, not the destination.'],
        [0.11, 'No lot', 'The parking belongs to the tire place. {slinger} are on Old Bellhaven, facing the wrong way.'],
        [0.21, 'At the counter', '{pickup}'],
        [0.36, 'Confirmation attempted', 'The number on file rings in the dining room and has since Tuesday. The cell is not on file.'],
        [0.74, 'Past the turn', 'The turn back toward Old Bellhaven has been passed. It was not marked.'],
        [0.93, 'Handed over', 'The lid was photographed. The address on it is handwritten and could not be read by the system.'],
      ] },

    { slug: 'sunrisedonut', title: 'Before The Case Is Done', local: true,
      brief: ['Ray starts the donuts at 3:15 and answers the phone himself.',
              'There are two left in the case. Both of them are on your ticket.'],
      rule: 'The case is done when the case is done.',
      prompt: ['Someone at the counter wants one', 'They have been standing there a while. There are two.'],
      keep: ['Give them one', 'your order is short'],
      brk:  ['Keep both', 'the ticket says two'],
      kept: 'You gave one away. Ray did not say anything and did not charge you for it.',
      broken: 'You kept both. The ticket was correct.',
      voice: {
        known: { card: 'Ray set two aside.',
          line: 'Ray set two aside before the case opened. He does that now.',
          prompt: ['Someone at the counter wants one', 'Ray already put yours in the box. There are two.'],
          keep: ['Give them one', 'yours is already boxed'],
          brk:  ['Keep both', 'they are already yours'],
          kept: 'You gave one away. Ray replaced it out of the fryer basket without being asked.',
          broken: 'You kept both. Ray had set them aside for you, so that was correct.',
          turn: 'Ray had the coffee going before you were through the door.' },
        cold: { card: 'The case is short today.',
          line: 'The case gets thin by ten and Ray does not want anybody disappointed. There is one left.',
          prompt: ['There is one left', 'Someone at the counter has been waiting. Your ticket says two.'],
          keep: ['Give them the one', 'your order is short by half'],
          brk:  ['Take it', 'the ticket says two'],
          kept: 'You gave it away. Ray charged you for two and did not mention it.',
          broken: 'You took it. Ray boxed it himself and did not say anything.',
          turn: 'Ray put the lid on and did not say anything.' },
      },
      beats: [
        /* Front-loaded instead of evenly spaced: three beats inside the first fifth (arrive, counter, phone), then a thirty-minute hole where the only thing that happens is the box being folded shut, because the 59 minutes are Ray's one pair of hands and not the 3.8 miles — so the rule comes due while you are still standing at the counter with the box, and the run's only motion beats are the last two. */
        [0.02, 'Accepted · {store}', 'Sprawl Ring 9, Unit C. The lit sign belongs to the tire place.'],
        [0.09, 'At the counter', '{pickup}'],
        [0.16, 'Ray answers the phone', 'The number on the announcement rings the phone behind the counter. He is the one who answers it.'],
        [0.40, 'Two in the box', 'The lid is folded down. {slinger} {has} taken {fries} off the tray. §4.2 covers it.'],
        [0.74, 'Old Frontage Highway', 'The case is behind you and the door has shut. The box does not open again before the handoff.'],
        [0.93, 'Delivered flat', 'Carried flat, handed over flat. The count was settled at the counter, not here.'],
      ] },

    { slug: 'goldenwok', title: 'Have Your Number Ready', local: true,
      brief: ['There are 214 items on the paper menu and all of it is cooked in the same kitchen.',
              'Your number is 118. Please have your number ready.'],
      rule: 'Present the number.',
      prompt: ['They have asked for the number', 'It was in the briefing.'],
      keep: ['Present 118', 'as briefed'],
      brk:  ['You do not have it', 'the briefing was dismissed'],
      kept: 'You had the number. The order came out immediately.',
      broken: 'You did not have the number. They found it. It took a while.',
      needsBrief: true,
      /* The one giver carrying needsBrief, and so the only place the waiver is felt:
         a regular is not made to sit through the briefing to be allowed to present a
         number the counter has already written down for him. */
      voice: {
        known: { card: 'Danny already has it.',
          line: 'Danny has it written down. He wrote it down the second time you came.',
          prompt: ['Danny has already called it out', 'It is 118. Nobody asked you for it.'],
          keep: ['Present it anyway', 'he already said it'],
          brk:  ['Say nothing', 'he already said it'],
          kept: 'You presented it anyway. Danny said he knew, and took it.',
          broken: 'You said nothing. It came out immediately. His mother asked about your route.',
          turn: 'Danny wrote your number on the paper menu and put it back under the register.' },
        cold: { card: 'They will ask for the number.',
          line: 'Only some of the 214 items are on the app. Yours is not one of them. The number is 118.',
          prompt: ['They have asked for the number', 'They asked twice.'],
          keep: ['Present 118', 'as briefed'],
          brk:  ['Say the name of the dish', 'there are 214 of them'],
          kept: 'You had it. They checked it against the paper menu anyway.',
          broken: 'You said the name. Danny came out with the paper menu and found it. It took a while.',
          turn: 'They asked for the number at the door and again at the counter.' },
      },
      beats: [
        /* Three beats crowded into the first fifth to get you inside the plaza, then a dead forty-point wait at the counter where the only thing that happens is other people's numbers being called, then the whole rest of the run — bag, door, handover — compressed into the last twelve points. */
        [0.02, 'Accepted · {store}', 'Unit 4, Northgate Plaza. Behind the bank, next to the tax place.'],
        [0.10, 'Northgate Plaza', 'The plaza has two parking spaces. The tax place is using both of them.'],
        [0.18, 'The counter', '{pickup}'],
        [0.49, 'A number is called', 'It is not 118. The kitchen is working through the ones it has.'],
        [0.74, 'Stapled', 'The ticket is stapled through the top of the bag. What was called is what is inside.'],
        [0.94, 'Delivered', 'Handed over at the door. The customer mentions that calling is faster.'],
      ] },

    { slug: 'bobacloud', title: 'Do Not Shake It Twice', local: true,
      brief: ['THE SEALING MACHINE IS FIXED. Sorry to everybody last week.',
              'Forty-one toppings, two people, and one sealing machine that has opinions.'],
      rule: 'It cannot be shaken twice.',
      prompt: ['The seal does not look right', 'It was shaken once, and sealed once.'],
      keep: ['Leave it', 'as sealed'],
      brk:  ['Shake it again', 'to settle it'],
      kept: 'Left as sealed. The seal was fine.',
      broken: 'It was shaken twice. The machine was not the problem last week either.',
      voice: {
        known: { card: 'Amy started it early.',
          line: 'Amy does the snow bowls and Teresa does the tea. One of them started yours when the car pulled in.',
          prompt: ['The seal does not look right', 'It was shaken once and sealed once, and you watched it happen.'],
          keep: ['Leave it', 'you saw it sealed'],
          brk:  ['Shake it again', 'to settle it'],
          kept: 'Left as sealed. It was fine, and it was always going to be.',
          broken: 'It was shaken twice. Teresa remade it and did not ring in the second one.',
          turn: 'Teresa started it at twenty-five percent before you finished saying it.' },
        cold: { card: 'Teresa checked the seal twice.',
          line: 'Teresa checks the seal twice now before it goes in the bag. It takes a minute.',
          prompt: ['The seal does not look right', 'Teresa already checked it. Twice.'],
          keep: ['Leave it', 'she checked it'],
          brk:  ['Shake it again', 'to settle it'],
          kept: 'Left as sealed. Teresa checked the bag after you before you got to the door.',
          broken: 'It was shaken twice. Teresa asked you to please call the shop before it goes out next time.',
          turn: 'Teresa put the drink in the bag herself and looked at it.' },
      },
      beats: [
        /* Front-loaded: four beats crammed into the first third at a counter where two people are still shaking it, then half a run of silence on the road, then the door and the rating closing one after the other — the opposite of the default's even walk. */
        [0.02, 'Accepted · {store}', 'Unit D-6, behind the nail salon. The plaza has one sign and it is for the tax place.'],
        [0.09, 'The shared lot', 'A truck is across two spaces. The walk from the far end is not counted as distance.'],
        [0.18, '{store} is shaking to order', '{pickup}'],
        [0.30, 'Sealed once', 'The machine ran and stopped. {fries} left the counter with {slinger}, which §4.2 permits.'],
        [0.74, 'Handed over', 'The cup went across upright. Custody of the seal transfers at the door.'],
        [0.93, 'Rated', 'A rating was submitted before the door closed. The shop asks to be called first; the platform does not forward the number.'],
      ] },

    
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
      broken: 'A deviation was recorded and billed at $1.40.',
      voice: {
        known: { card: 'Amy started it early.',
          line: 'Amy does the snow bowls and Teresa does the tea. One of them started yours when the car pulled in.',
          prompt: ['The seal does not look right', 'It was shaken once and sealed once, and you watched it happen.'],
          keep: ['Leave it', 'you saw it sealed'],
          brk:  ['Shake it again', 'to settle it'],
          kept: 'Left as sealed. It was fine, and it was always going to be.',
          broken: 'It was shaken twice. Teresa remade it and did not ring in the second one.',
          turn: 'Teresa started it at twenty-five percent before you finished saying it.' },
        cold: { card: 'Teresa checked the seal twice.',
          line: 'Teresa checks the seal twice now before it goes in the bag. It takes a minute.',
          prompt: ['The seal does not look right', 'Teresa already checked it. Twice.'],
          keep: ['Leave it', 'she checked it'],
          brk:  ['Shake it again', 'to settle it'],
          kept: 'Left as sealed. Teresa checked the bag after you before you got to the door.',
          broken: 'It was shaken twice. Teresa asked you to please call the shop before it goes out next time.',
          turn: 'Teresa put the drink in the bag herself and looked at it.' },
      } },

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
    [0.36, 'Collected', '{slinger} {has} taken {fries} as tribute. This is permitted under the Slinger Agreement, §4.2.'],
    [0.74, 'En route', 'The route was selected. It is not the route you would have selected.'],
    [0.93, 'Delivered', 'Photograph taken. The photograph is of a door.'],
  ];
  /* WHERE THE DECISION SITS, derived rather than written down. The rule's window is
     closed by the SECOND-TO-LAST beat — the one that commits you to the route — and
     the rule itself lands part-way through the gap before it. Both used to be the
     literals 0.52 and 0.74, which was only correct because every run had the same
     five beats at the same fractions. Deriving them is what lets a giver have its own
     shape without the decision drifting off the end of it.

     RULE_POS and INT_POS are chosen to reproduce the old numbers exactly on the
     default spine: 0.36 + (0.74-0.36)*0.42 = 0.52, and 0.74 + (1-0.74)*0.19 = 0.79. */
  var RULE_POS = 0.42, INT_POS = 0.19;

  /* A giver may carry its own `beats`; the rest run on the default spine. Four is the
     minimum because the placement needs a beat before the decision and a beat after
     the one that closes it. */
  function beatsFor(m) {
    var b = (m && m.beats && m.beats.length >= 4) ? m.beats : SPINE;
    return b;
  }
  function slots(beats) {
    var n = beats.length;
    var bound = beats[n - 2][0];
    var prev = beats[n - 3][0];
    return {
      rule: prev + (bound - prev) * RULE_POS,
      bound: bound,
      inter: bound + (1 - bound) * INT_POS,
    };
  }

  function fill(text, m, store) {
    return String(text)
      .replace(/\{store\}/g, store ? (store.shortName || store.name) : m.slug)
      .replace(/\{pickup\}/g, m.brief[1] || '')
      .replace(/\{slinger\}/g, 'You')
      .replace(/\{has\}/g, 'have')
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
      /* Decided once, at accept, exactly as the timetable is. */
      regard: regardOf(FB.missions.standing(slug)),
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

    var beats = beatsFor(m);
    run.beats = beats.map(function (b) {
      return { at: at + span * b[0], text: fill(b[1], m, store), sub: fill(b[2], m, store) };
    });
    var slot = slots(beats);

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
    var rule = mk('rule', slot.rule, slot.bound, at, TEST_MIN_MS(), TEST_MS());
    if (rule) run.checks.push(rule);
    if (rule) {
      /* seeded on the run, so the same run always draws the same interruption and a
         reload cannot reroll it into a friendlier one */
      var pick = INTERRUPTS[Math.floor(FB.seeded(run.id + ':int')() * INTERRUPTS.length)];
      var inter = mk('platform', slot.inter, 1.0, rule.deadline + MARGIN(), INT_MIN_MS, INT_MAX_MS, { ref: pick.id });
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

  /* WHAT THE RESTAURANT MAKES OF YOU. The ladder was already there — +1 a kept rule,
     −1 a broken one, per slug — and until now nothing read it. It is banded rather
     than read raw because a restaurant does not publish a score; it either knows you,
     or it does not, or it has you on file.

     The cap is not a nicety. Without it forty broken runs at one store means forty
     kept runs to climb back, which is a hole deeper than the climb out of it. A save
     holding a pre-cap number still READS correctly and heals to the cap on its next
     settle, because the clamp is applied on write. */
  var REGARD_CAP = 6, KNOWN_AT = 3, COLD_AT = -3;

  /* Takes an INTEGER, not a slug, so it reads no state and a check can sweep it. */
  function regardOf(n) {
    n = n || 0;
    return n >= KNOWN_AT ? 'known' : n <= COLD_AT ? 'cold' : 'plain';
  }
  function nextStanding(prev, kept) {
    return FB.clamp((prev || 0) + (kept ? 1 : -1), -REGARD_CAP, REGARD_CAP);
  }
  /* `plain` IS the base table, so it deliberately has no variant object. */
  function voiceOf(m, band) {
    if (!m || !band || band === 'plain') return null;
    return (m.voice && m.voice[band]) || null;
  }

  function copyFor(run, c) {
    if (c.kind === 'rule') {
      var m = byslug(run.slug);
      /* The band is read off the RUN, stamped at accept — never off live state.
         copyFor feeds both the event push in replay() and the live testBlock()
         render, so a live read would make a stored event disagree with the sheet
         the moment settle moved the number underneath it. */
      var band = run.regard || 'plain';
      var v = voiceOf(m, band) || {};
      var pr = v.prompt || m.prompt;
      /* Still an explicit eight-key literal. A variant is merged key by key THROUGH
         it, so a price field written into the table has nowhere to arrive — which is
         what keeps the separation structural rather than disciplined. */
      return { title: pr[0], body: pr[1], rule: m.rule,
               keep: v.keep || m.keep, brk: v.brk || m.brk,
               kept: v.kept || m.kept, broken: v.broken || m.broken,
               /* Regard may REMOVE a gate. It may never add one — at cold a store
                  that would not take your word for it blocks the compliant answer,
                  forces a break, and spirals into a store you can never recover
                  with. There is no band at which `keep` is unanswerable. */
               needsBrief: band === 'known' ? false : !!m.needsBrief,
               regard: band };
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
    beatsFor: beatsFor,
    slots: slots,
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
        var rg = regardOf(FB.missions.standing(m.slug));
        return {
          slug: m.slug, title: m.title, rule: m.rule, local: !!m.local,
          store: store, open: isOpen, asking: isOpen && !!picked[m.slug],
          minutes: mins, seconds: Math.round(durationFor(mins) / 1000),
          pay: FB.round2(4.10 + mins * 0.11),
          standing: FB.missions.standing(m.slug),
          /* Two property lookups on an integer — no clock, no stream, no write. The
             asking set above is byte-identical, so the board is still a pure function
             of the bucket and nothing reorders. */
          regard: rg,
          note: (voiceOf(m, rg) || {}).card || null,
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
    /* pure, and exported so the checks can sweep them without a realm fixture */
    regardOf: regardOf,
    nextStanding: nextStanding,
    voiceOf: voiceOf,
    REGARD_CAP: REGARD_CAP, KNOWN_AT: KNOWN_AT, COLD_AT: COLD_AT,
    /** the band this restaurant currently reads you at */
    regard: function (slug, st) { return regardOf(FB.missions.standing(slug, st)); },

    /* The one line a statement gets when a restaurant changed its mind about you.
       Read off the FROZEN row, so a statement from nine runs ago still says what
       happened then. Equal bands say nothing, and an old row carrying no bands at
       all says nothing — which is what makes it safe against a log written before
       any of this existed. */
    regardNote: function (row) {
      if (!row || !row.regard || !row.regardWas || row.regard === row.regardWas) return '';
      var m = byslug(row.slug);
      var v = voiceOf(m, row.regard) || {};
      if (v.turn) return v.turn;
      var name = (FB.catalog.get(row.slug) || {}).name || row.slug;
      var local = !!(m && m.local);
      if (row.regard === 'plain') {
        return local ? name + ' did not mention it.'
                     : 'The record at ' + name + ' has returned to neutral.';
      }
      if (row.regard === 'known') {
        return local ? name + ' knew you at the counter.'
                     : 'A handling history has been opened for you at ' + name + '. It is not a rating.';
      }
      return local ? name + ' did not say anything when you picked up.'
                   : 'A pattern has been identified at ' + name + '. It is retained.';
    },
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
      /* The statement is stamped from the run's own end time, not from Date.now(),
         so a catch-up books the access block against the day the run ENDED — the
         same rule the tracker replays its beats under. */
      var access = FB.fees.accessDue(FB.S().slinging.accessAt, run.endAt);
      var pay = FB.fees.payout({ gross: run.pay, access: access });
      var row = {
        id: run.id, slug: run.slug, title: run.title, at: run.endAt,
        outcome: run.outcome, elected: !!rule.elected, pay: run.pay,
        adjusted: run.adjusted || 0, local: !!m.local, platform: plat,
        /* Frozen totals. The ROWS are re-derived from (pay, access) because payout is
           a pure function of exactly those two, so forty statements do not need forty
           copies of the same fifteen labels in localStorage. The totals are frozen
           anyway, so an edit to the deduction tables is DETECTABLE against an old
           statement rather than silently rewriting what it once paid. */
        access: access, net: pay.net, deducted: pay.deductionsTotal, scrip: pay.scrip,
        /* Both sides of the ladder, frozen, so the statement can say a restaurant
           changed its mind about you without re-deriving it from a number that has
           moved on since. Equal bands print nothing. */
        regardWas: regardOf(FB.S().slinging.standing[run.slug]),
        regard: regardOf(nextStanding(FB.S().slinging.standing[run.slug], kept)),
      };
      FB.store.set(function (st) {
        var s = st.slinging;
        s.run = null;
        s.log.unshift(row);
        if (s.log.length > 40) s.log.length = 40;
        s.completed = (s.completed || 0) + 1;
        if (kept) s.kept = (s.kept || 0) + 1; else s.broken = (s.broken || 0) + 1;
        /* what was PAID, which is not what was earned */
        s.earned = FB.round2((s.earned || 0) + pay.net);
        s.deducted = FB.round2((s.deducted || 0) + pay.deductionsTotal);
        s.scrip = (s.scrip || 0) + pay.scrip;
        if (access) s.accessAt = run.endAt;
        s.standing[run.slug] = nextStanding(s.standing[run.slug], kept);
        s.platform = (s.platform || 0) + plat;
        return st;
      });
      stop();
      if (!(opts && opts.catchUp) && FB.toast) {
        /* The toast quotes the NET, because quoting the gross and then paying the net
           is the one place this app would be lying to the player rather than to the
           character. The gross is on the statement, one row above the deductions. */
        FB.toast((kept ? 'Rule kept. ' : 'Rule broken. ') + FB.money(pay.net) + ' paid.',
          { kind: kept ? 'plus' : 'bad', ms: 3600 });
      }
      return row;
    },

    /* THE PHOTOGRAPH. The roll is seeded on the run id, so which one this run yields
       was settled the moment the run existed — the button reveals it, it does not
       decide it, and a reload cannot re-roll it. Written onto the frozen log row so
       it survives, and appended to the gallery only the first time it is seen. */
    shoot: function (rowId) {
      var st = FB.S();
      var row = (st.slinging.log || []).filter(function (r) { return r.id === rowId; })[0];
      if (!row || row.shot) return null;
      var shot = FB.proof.roll(row.id);
      FB.store.set(function (s2) {
        var r2 = (s2.slinging.log || []).filter(function (r) { return r.id === rowId; })[0];
        if (!r2 || r2.shot) return s2;
        r2.shot = shot;
        s2.slinging.shots = (s2.slinging.shots || 0) + 1;
        if (s2.slinging.gallery.indexOf(shot.file) < 0) s2.slinging.gallery.push(shot.file);
        return s2;
      });
      return shot;
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

  /* A restaurant does not publish a score, so the raw integer is no longer drawn.
     The aria-label states it, because a screen reader gets the same information a
     sighted player gets from a green rule and a word. */
  function standingChip(b) {
    var r = b && b.regard;
    if (!r || r === 'plain') return '';
    var known = r === 'known';
    return '<span class="badge badge--' + (known ? 'good' : 'bad') + '" aria-label="Restaurant record: ' +
      FB.attr(known ? 'known here' : 'on file') + '">' + (known ? 'KNOWN' : 'ON FILE') + '</span>';
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
        '<div><b style="color:var(--fb)">' + FB.money(st.slinging.earned || 0) + '</b>' +
          '<span>PAID' + (st.slinging.deducted ? ' · NET OF ' + FB.money(st.slinging.deducted) : '') + '</span></div>' +
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

      /* The collection, stated as an inventory count and never as a score. The app
         does not congratulate anybody for it. */
      if (st.slinging.shots) {
        h += '<p class="disp-plat">' + FB.plural((st.slinging.gallery || []).length, 'photograph') +
          ' retained of ' + FB.proof.POOL.length + ' on file. ' +
          FB.plural(st.slinging.shots, 'photograph') + ' taken.</p>';
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
        /* Live read is correct HERE and only here: nothing is stamped until accept,
           and the sheet is the last surface drawn before it is. */
        var band = M.regard(slug);
        var v = M.voiceOf(m, band) || {};
        FB.sheet.open({
          title: m.title,
          sub: (FB.catalog.get(slug) || {}).name || slug,
          html: '<div class="brief">' +
            /* A place that knows you does not brief you from the beginning. */
            (band === 'known' && v.line
              ? '<p>' + FB.esc(v.line) + '</p>'
              : m.brief.map(function (l) { return '<p>' + FB.esc(l) + '</p>'; }).join('') +
                (v.line ? '<p>' + FB.esc(v.line) + '</p>' : '')) +
            '<div class="brief-rule"><i>THE RULE</i><b>' + FB.esc(m.rule) + '</b></div>' +
            '</div>',
          footer: '<button class="btn btn--primary btn--block" data-accept="' + FB.attr(slug) + '">' +
            (band === 'known' ? 'Take it' : 'Accept') + '</button>',
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
          standingChip(b) +
          '<span class="mc-pay">' + FB.money(b.pay) + '</span></div>' +
        '<span class="mc-title">' + FB.esc(b.title) + '</span>' +
        '<span class="mc-rule">' + FB.icon('alert', 12) + FB.esc(b.rule) + '</span>' +
        (b.note ? '<span class="mc-note">' + FB.esc(b.note) + '</span>' : '') +
        '<span class="mc-meta">' + FB.mins(b.minutes) +
          (b.open ? '' : ' · opens ' + FB.esc((s && s.opensAt) || '')) +
          (b.open && !b.asking ? (b.regard === 'cold' ? ' · not asking for you' : ' · not asking') : '') + '</span>' +
      '</div>' +
      (b.open && canTake
        ? '<button class="btn btn--sm btn--primary mc-take" data-take="' + FB.attr(b.slug) + '">Take</button>'
        : '') +
      '</div>';
  }

  /* ---------------- records ----------------
     The run log has been written and capped at forty since the mode shipped, and
     exactly one row of it was ever read. This is that log, and it is also where the
     photographs live: a collection, filed as a record of work, because the platform
     would never call it a collection. */
  FB.screens.register('records', {
    tab: 'records',
    hideCartBar: true,
    appbar: function () {
      return '<div class="bar bar--border"><h1>Records</h1></div>';
    },
    render: function () {
      var st = FB.S();
      var log = st.slinging.log || [];
      if (!log.length) {
        return FB.C.empty({
          title: 'No records',
          body: 'A record is created when a run is completed. Records cannot be created any other way.',
          cta: 'Dispatch', go: 'dispatch',
        });
      }
      var kept = (st.slinging.gallery || []).length;
      var h = '<div class="disp-hd"><i>RECORD OF WORK</i>' +
        '<b>' + FB.plural(log.length, 'run') + ' on file</b>' +
        '<span>' + FB.plural(kept, 'photograph') + ' retained of ' + FB.proof.POOL.length +
        '. ' + FB.plural(st.slinging.shots || 0, 'photograph') + ' taken.</span></div>';

      h += '<div class="reclist">' + log.map(function (r) {
        var store = FB.catalog.get(r.slug);
        var t = r.shot ? FB.proof.tier(r.shot.tier) : null;
        return '<button class="recrow" data-shotview="' + FB.attr(r.id) + '">' +
          (r.shot
            ? '<img src="' + FB.attr(r.shot.file) + '" alt="" loading="lazy" onerror="this.remove()">'
            : '<span class="rec-none">' + FB.icon('camera', 16) + '</span>') +
          '<span class="rec-b">' +
            '<b>' + FB.esc(store ? (store.shortName || store.name) : r.slug) + '</b>' +
            '<span class="rec-meta">' + FB.dayLabel(r.at) + ' · ' +
              (r.outcome === 'kept' ? 'rule kept' : 'rule broken') + '</span>' +
            (t ? '<span class="rec-tier shot-' + FB.attr(r.shot.tier) + '">' + FB.esc(t.label) + '</span>'
               : '<span class="rec-meta">Not photographed.</span>') +
          '</span>' +
          '<span class="rec-r">' + FB.money(r.net != null ? r.net : 0) + '</span>' +
          '</button>';
      }).join('') + '</div>';

      h += '<div class="fineprint">Records are retained indefinitely. Photographs are retained ' +
        'separately and are not part of the record.</div>';
      return h;
    },
    mount: function (root) {
      FB.on(root, 'click', '[data-shotview]', function (e, t) {
        var st = FB.S();
        var row = (st.slinging.log || []).filter(function (r) { return r.id === t.dataset.shotview; })[0];
        if (!row) return;
        var store = FB.catalog.get(row.slug);
        if (!row.shot) {
          FB.why('No photograph', 'This run was completed without a photograph. A photograph cannot be added later, and its absence is not recorded as a fault.');
          return;
        }
        var tier = FB.proof.tier(row.shot.tier);
        FB.sheet.open({
          title: store ? (store.shortName || store.name) : row.slug,
          sub: FB.dayLabel(row.at) + ' · ' + tier.label,
          html: '<div class="shot" style="padding-top:0">' +
            '<img src="' + FB.attr(row.shot.file) + '" alt="Proof of delivery photograph" onerror="this.remove()">' +
            '<p class="shot-note">' + FB.esc(tier.note) + '</p></div>',
        });
      });
    },
  });

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
    /* Off the run's STAMPED band, exactly as copyFor is — reading live state here
       would let this card contradict the sheet the player just answered. */
    var v = M.voiceOf(m, run.regard) || {};
    return '<div class="callout callout--' + (kept ? 'plus' : 'warn') + '" style="margin:12px var(--pad)">' +
      FB.icon(kept ? 'check' : 'alert', 17) +
      '<span><b>' + (kept ? 'Rule kept.' : 'Rule broken.') + '</b> ' +
      FB.esc(kept ? (v.kept || m.kept) : (v.broken || m.broken)) + '</span></div>';
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
        if (!last) {
          return FB.C.empty({
            title: 'Nothing to run',
            body: 'Dispatch has the list. Each restaurant wants something specific.',
            cta: 'Dispatch', go: 'dispatch',
          });
        }
        /* The statement for the run that just finished. Rows are re-derived, totals
           were frozen at settle — see the note on the log row. */
        var pay = FB.fees.payout({ gross: last.pay, access: !!last.access });
        var h = '<div class="disp-hd"><i>STATEMENT OF PARTNER EARNINGS</i>' +
          '<b>' + FB.esc(last.title) + '</b>' +
          '<span>The rule was ' + (last.outcome === 'kept' ? 'kept.' : 'broken.') +
          ' Both answers are paid.</span></div>';
        /* The restaurant's half of the run, on the document that carries the
           platform's half. Nothing explains the relationship; it states a thing
           that happened and moves on. */
        var turn = M.regardNote(last);
        if (turn) h += '<p class="disp-turn">' + FB.esc(turn) + '</p>';

        /* THE PHOTOGRAPH. Untaken it is a button; taken it is the picture and the
           category the platform filed it under. The category is a loot tier and the
           app never says so — it says what the platform would say, which is that
           almost nothing is worth recording. */
        h += '<div class="shot">';
        if (last.shot) {
          var t = FB.proof.tier(last.shot.tier);
          h += '<div class="shot-hd"><i>PROOF OF DELIVERY</i><b class="shot-' + FB.attr(last.shot.tier) + '">' +
            FB.esc(t.label) + '</b></div>' +
            '<img src="' + FB.attr(last.shot.file) + '" alt="Proof of delivery photograph" ' +
            'onerror="this.remove()">' +
            '<p class="shot-note">' + FB.esc(t.note) + '</p>';
        } else {
          h += '<button class="btn btn--block shot-take" data-shoot="' + FB.attr(last.id) + '">' +
            FB.icon('camera', 18) + 'Photograph the drop</button>' +
            '<p class="shot-note">A photograph is required. It is not reviewed.</p>';
        }
        h += '</div>';
        h += FB.C.statement(pay);
        /* Only reachable after the deduction tables are edited under a saved log.
           Saying so is better than redrawing an old statement at today's prices. */
        if (FB.round2(pay.net) !== FB.round2(last.net != null ? last.net : pay.net)) {
          h += '<div class="fineprint">This statement was issued under a schedule of ' +
            'deductions that is no longer in effect. ' + FB.money(last.net) + ' was paid.</div>';
        }
        h += '<div style="padding:12px var(--pad)">' +
          '<button class="btn btn--primary btn--block" data-go="dispatch">Dispatch</button></div>';
        h += '<div class="fineprint">Deductions are assessed per statement. ' +
          'Conditions of access are assessed once per day, on the first statement of that day.</div>';
        return h;
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
      /* ABOVE the early return: with no live run this screen is showing a pay
         statement, which is fifteen rows each offering a (?) that would open
         nothing. The achievement still fired — app.js delegates on document — so
         the tap looked handled while the explanation never appeared. */
      FB.C.wireWhy(root);
      var run = M.run();
      if (!run) return;
      FB.tracker.placeCourier(root, { id: run.id }, 0);

      FB.on(root, 'click', '[data-shoot]', function (e, t) {
        FB.busy(t, 'save', function () {
          M.shoot(t.dataset.shoot);
          FB.nav.refresh();
        });
      });

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
