/* FoodBang — the world clock.

   Until now the app existed only while the tab was open. Nothing outside it moved,
   nothing had a time of day, and a "Busy" badge decided at boot stayed decided
   until you reloaded. This is the smallest thing that fixes that: a pure function
   of a timestamp.

   Nothing here is stored, and nothing here ticks. FB.world.at(ts) buckets time and
   derives everything from FB.seeded on the bucket, so it is stable for twenty
   minutes, different in the next twenty, identical across a reload, and
   automatically correct after an absence of any length. Close the app on Tuesday
   and open it on Friday and the world is simply where Friday says it should be —
   at a storage cost of zero, and with no scheduler to double-fire.

   Two rules for anything that reads this. Read it at RENDER TIME, never on
   catalog.decorate(), which runs once inside catalog.init() at boot: a value
   stamped there is wrong for a tab that has been left open. And do not let the
   world reorder the feed — crossing a bucket boundary mid-session is intended for
   weather and copy, and is a bug if it reshuffles store cards under a thumb. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  var BUCKET_MS = 20 * 60 * 1000;

  /* Dayparts are the restaurant's, not the clock's: "night" is a service period
     that ends when breakfast starts, which is why it wraps past midnight. */
  var DAYPARTS = [
    { key: 'earlyam',   label: 'Early Morning', from: 4,  to: 7 },
    { key: 'breakfast', label: 'Breakfast',     from: 7,  to: 11 },
    { key: 'lunch',     label: 'Lunch',         from: 11, to: 14 },
    { key: 'slump',     label: 'Afternoon',     from: 14, to: 17 },
    { key: 'dinner',    label: 'Dinner',        from: 17, to: 21 },
    { key: 'evening',   label: 'Evening',       from: 21, to: 24 },
    { key: 'deadzone',  label: 'Overnight',     from: 0,  to: 4 },
  ];

  /* pressure by daypart: what share of the kitchens are under it */
  var PRESSURE = {
    earlyam: 0.12, breakfast: 0.55, lunch: 0.86, slump: 0.18,
    dinner: 0.92, evening: 0.58, deadzone: 0.22,
  };

  var WEATHER = [
    { key: 'clear',    label: 'Clear',        etaMin: 0 },
    { key: 'overcast', label: 'Overcast',     etaMin: 0 },
    { key: 'rain',     label: 'Rain',         etaMin: 4 },
    { key: 'heat',     label: 'Heat Advisory', etaMin: 2 },
    { key: 'wind',     label: 'Wind',         etaMin: 1 },
  ];
  /* weather moves on its own, slower clock — a shower that changes every twenty
     minutes is not weather, it is a flicker */
  var WEATHER_BUCKET_MS = 3 * 60 * 60 * 1000;

  function daypartFor(hour) {
    for (var i = 0; i < DAYPARTS.length; i++) {
      var d = DAYPARTS[i];
      if (hour >= d.from && hour < d.to) return d;
    }
    return DAYPARTS[DAYPARTS.length - 1];
  }

  FB.world = {
    BUCKET_MS: BUCKET_MS,
    DAYPARTS: DAYPARTS,
    WEATHER: WEATHER,

    bucket: function (ts) { return Math.floor((ts || Date.now()) / BUCKET_MS); },

    /** everything the world knows at one moment. Pure, and idempotent inside a bucket. */
    at: function (ts) {
      ts = ts || Date.now();
      var d = new Date(ts);
      var hour = d.getHours();
      var b = FB.world.bucket(ts);
      var part = daypartFor(hour);

      var wb = Math.floor(ts / WEATHER_BUCKET_MS);
      var weather = FB.pick(WEATHER, FB.seeded('weather' + wb));

      /* surge wobbles around the daypart's pressure rather than replacing it, so
         dinner is always busier than the afternoon and never quite the same twice */
      var wobble = (FB.seeded('surge' + b)() - 0.5) * 0.22;
      var surge = Math.max(0, Math.min(1, PRESSURE[part.key] + wobble));

      /* deliberately NOT carrying ts: at(T) and at(T + 60s) inside one bucket must
         be indistinguishable, and echoing the input back makes that untestable */
      return {
        bucket: b, hour: hour,
        daypart: part.key, daypartLabel: part.label,
        weather: weather.key, weatherLabel: weather.label, weatherEta: weather.etaMin,
        surge: surge,
        busy: surge > 0.62,
      };
    },

    /** how hard one kitchen is being hit right now, 0..1 */
    kitchenLoad: function (slug, ts) {
      var w = FB.world.at(ts);
      var own = FB.seeded('kitchen' + slug + w.bucket)();
      /* Blended so the daypart dominates but never decides alone. At an earlier
         weighting every kitchen in the city was Busy at 7pm, which is no more
         informative than none of them being. */
      return Math.max(0, Math.min(1, w.surge * 0.55 + own * 0.45));
    },

    /** the "Busy" badge, which used to be decided once at boot and never revisited */
    isBusy: function (slug, ts) { return FB.world.kitchenLoad(slug, ts) > 0.70; },
  };
})(window.FB);
