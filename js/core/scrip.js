/* FoodBang — BangBux™.

   The currency was declared in state as `credits`, rendered in two screens, and
   granted by nothing: the balance was permanently $0.00, and the checkout row that
   displays it is guarded on `> 0`, so in the whole life of this app it had never
   rendered once. The BANG+ screen advertised "2% back on fees" as a benefit that
   never paid.

   The field is called `scrip` rather than `bux` deliberately. tools/rebrand.cjs
   carries the currency name as a literal string rule, so an identifier spelled with
   a fragment of the brand is one no rule can rewrite and --selfcheck cannot see.
   The user-facing string stays BangBux™, which the currency rule does rewrite.

   Grants expire seventy-two hours after issue, which is the point of them. */
window.FB = window.FB || {};
(function (FB) {
  'use strict';

  function ttl() { return (FB.fees && FB.fees.SCRIP_TTL_MS) || 72 * 3600 * 1000; }

  FB.scrip = {
    /** unexpired grants, newest first */
    grants: function (at) {
      var now = at || Date.now();
      return (FB.S().scrip || []).filter(function (g) { return now - g.at < ttl(); });
    },

    balance: function (at) {
      return FB.sum(FB.scrip.grants(at), function (g) { return g.amt; });
    },

    /** what the next order may redeem: whole BangBux, capped, never above balance */
    redeemable: function (at) {
      var cap = (FB.fees && FB.fees.SCRIP_MAX_PER_ORDER) || 1;
      return Math.min(cap, Math.floor(FB.scrip.balance(at)));
    },

    /** the oldest unexpired grant's expiry, or null */
    nextExpiry: function (at) {
      var g = FB.scrip.grants(at);
      if (!g.length) return null;
      return Math.min.apply(null, g.map(function (x) { return x.at + ttl(); }));
    },

    grant: function (amt, at) {
      if (!(amt > 0)) return 0;
      FB.store.set(function (st) {
        st.scrip = st.scrip || [];
        st.scrip.unshift({ id: FB.uid('b'), amt: amt, at: at || Date.now() });
        if (st.scrip.length > 40) st.scrip.length = 40;
        return st;
      }, { silent: true });
      return amt;
    },

    /** spend oldest-first, so the balance that is about to expire goes first */
    spend: function (amt, at) {
      var left = amt;
      if (!(left > 0)) return 0;
      FB.store.set(function (st) {
        var live = (st.scrip || []).slice().sort(function (a, b) { return a.at - b.at; });
        live.forEach(function (g) {
          if (left <= 0) return;
          var take = Math.min(g.amt, left);
          g.amt -= take; left -= take;
        });
        st.scrip = (st.scrip || []).filter(function (g) { return g.amt > 0.0001; });
        return st;
      }, { silent: true });
      return amt - left;
    },

    /* Called once at boot, AFTER FB.shell.init so FB.toast exists. Returns what was
       lost, so the caller can say so — silently dropping a currency the app told you
       you had is the one version of this joke that is not funny. */
    expire: function (at) {
      var now = at || Date.now();
      var all = FB.S().scrip || [];
      var dead = all.filter(function (g) { return now - g.at >= ttl(); });
      if (!dead.length) return 0;
      var lost = FB.sum(dead, function (g) { return g.amt; });
      FB.store.set(function (st) {
        st.scrip = (st.scrip || []).filter(function (g) { return now - g.at < ttl(); });
        return st;
      }, { silent: true });
      return lost;
    },
  };
})(window.FB);
