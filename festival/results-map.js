// WORLD CUP XI — shared live-results mapper (browser AND Node /api).
//
// Single source of truth for turning the /api/results payload (real
// football-data.org WC matches) into the `results` map our scoring engine
// understands:
//   results[fixtureId] = { home, away }
//
// A real API match is mapped onto one of our 72 group fixtures by
//   group + sorted(team-pair)
// which was verified to be a 72/72 exact match against the real 2026 draw.
// The only three-letter-code difference across all 48 nations is Uruguay
// (our "URU" vs football-data "URY"), handled by WC_TLA_ALIAS.
//
// Dual-env via a UMD wrapper (same shape as scoring-core.js): the browser gets
// window.buildResultsMap etc.; Node gets module.exports. buildResultsMap takes
// FIXTURES as an argument so it works server-side without browser globals; in
// the browser it defaults to window.FIXTURES.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.WC_TLA_ALIAS = api.WC_TLA_ALIAS;
    window.buildResultsMap = api.buildResultsMap;
    window.__wcPairKey = api.pairKey; // exposed for tests
  }
})(this, function () {
  // our code -> football-data tla
  var WC_TLA_ALIAS = { URU: "URY" };
  function tla(code) {
    return WC_TLA_ALIAS[code] || code;
  }

  function pairKey(group, a, b) {
    return String(group) + ":" + [tla(a), tla(b)].sort().join("-");
  }

  // Build an index of our fixtures keyed by group+pair so we can look up the
  // matching API match regardless of home/away orientation.
  function fixtureIndex(FIXTURES) {
    var idx = new Map();
    (FIXTURES || []).forEach(function (fx) {
      idx.set(pairKey(fx.group, fx.home.code, fx.away.code), fx);
    });
    return idx;
  }

  // A real API match is only meaningful for scoring once it has a final score.
  // We treat FINISHED as final; IN_PLAY / PAUSED carry a provisional live score.
  function hasScore(m) {
    return m && m.score && m.score.home != null && m.score.away != null;
  }
  var LIVE_STATUSES = { IN_PLAY: true, PAUSED: true };

  // From the /api/results payload + our FIXTURES, produce:
  //   results:        { [fixtureId]: { home, away } }   (FINISHED + live, for scoring)
  //   statusById:     { [fixtureId]: "FINISHED"|"IN_PLAY"|... }
  //   liveById:       { [fixtureId]: true }  (in-play right now)
  //   played, live, total, updatedAt, configured, ok
  function buildResultsMap(payload, FIXTURES) {
    if (!FIXTURES && typeof window !== "undefined") FIXTURES = window.FIXTURES;
    FIXTURES = FIXTURES || [];
    var out = {
      configured: !!(payload && payload.configured),
      updatedAt: (payload && payload.updatedAt) || null,
      results: {},
      statusById: {},
      liveById: {},
      played: 0,
      live: 0,
      total: FIXTURES.length,
      ok: false,
    };
    if (!payload || !Array.isArray(payload.matches) || !payload.matches.length) {
      return out;
    }
    var idx = fixtureIndex(FIXTURES);
    payload.matches.forEach(function (m) {
      if (m.stage && m.stage !== "GROUP_STAGE") return; // our game is the 72 group games
      var fx = idx.get(pairKey(m.group, m.home.tla, m.away.tla));
      if (!fx) return;
      out.statusById[fx.id] = m.status;
      if (hasScore(m)) {
        // Orient the score to OUR fixture's home/away (the API home may differ).
        var apiHomeIsOurHome = tla(fx.home.code) === m.home.tla;
        var home = apiHomeIsOurHome ? m.score.home : m.score.away;
        var away = apiHomeIsOurHome ? m.score.away : m.score.home;
        out.results[fx.id] = { home: home, away: away };
        if (m.status === "FINISHED") out.played++;
        if (LIVE_STATUSES[m.status]) {
          out.liveById[fx.id] = true;
          out.live++;
        }
      }
    });
    out.ok = true;
    return out;
  }

  return {
    WC_TLA_ALIAS: WC_TLA_ALIAS,
    pairKey: pairKey,
    buildResultsMap: buildResultsMap,
  };
});
