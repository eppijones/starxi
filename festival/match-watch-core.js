// MATCH-WATCH (temporary) — map football-data goals → playerEvents for tallyUser.
// Shared UMD (browser + Node). Remove with the match-watch feature.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.MATCH_WATCH_PICKS = api.MATCH_WATCH_PICKS;
    window.MATCH_WATCH_STATE = api.MATCH_WATCH_STATE;
    window.normalizeScorerName = api.normalizeScorerName;
    window.findPlayerForScorer = api.findPlayerForScorer;
    window.buildPlayerEventsFromGoals = api.buildPlayerEventsFromGoals;
    window.buildMatchWatchSim = api.buildMatchWatchSim;
  }
})(this, function () {
  // Test XI: half Norway, half Sweden — mirrors a realistic WC26 squad mix.
  var MATCH_WATCH_PICKS = [
    "nor-nyland",
    "nor-ryerson",
    "nor-ajer",
    "swe-lindelof",
    "nor-nusa",
    "nor-schjelderup",
    "swe-sema",
    "swe-ayari",
    "swe-svanberg",
    "nor-rloth",
    "isak",
  ];

  var MATCH_WATCH_STATE = {
    nation: "NOR",
    picks: MATCH_WATCH_PICKS,
    formation: "3-5-2",
    captain: "nor-nusa",
    captainPlus: false,
    captainByMd: {},
    swaps: [],
    bracket: { groups: {}, advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} } },
    submitted: true,
    submittedAt: Date.now(),
  };

  function normalizeScorerName(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function lastToken(s) {
    var parts = normalizeScorerName(s).split(" ").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "";
  }

  function findPlayerForScorer(name, teamTla, players) {
    players = players || [];
    var nat = teamTla === "NOR" || teamTla === "SWE" ? teamTla : null;
    var pool = nat ? players.filter(function (p) { return p.nat === nat; }) : players;
    var norm = normalizeScorerName(name);
    if (!norm) return null;

    var exact = pool.find(function (p) {
      return normalizeScorerName(p.name) === norm;
    });
    if (exact) return exact;

    var aliases = {
      "alexander isak": "isak",
      "a isak": "isak",
      "erling haaland": "haaland",
      "alexander sorloth": "nor-rloth",
      "kristoffer ajer": "nor-ajer",
      "antonio nusa": "nor-nusa",
      "orjan nyland": "nor-nyland",
      "julian ryerson": "nor-ryerson",
      "victor lindelof": "swe-lindelof",
      "ken sema": "swe-sema",
      "yasin ayari": "swe-ayari",
      "mattias svanberg": "swe-svanberg",
      "andreas schjelderup": "nor-schjelderup",
    };
    if (aliases[norm]) {
      return pool.find(function (p) { return p.id === aliases[norm]; }) ||
        players.find(function (p) { return p.id === aliases[norm]; });
    }

    var last = lastToken(name);
    if (!last) return null;
    var byLast = pool.filter(function (p) {
      return lastToken(p.name) === last || normalizeScorerName(p.name).indexOf(last) >= 0;
    });
    if (byLast.length === 1) return byLast[0];
    return byLast[0] || null;
  }

  // Goals from /api/match-watch → playerEvents shape for tallyUser (MD1 only).
  function buildPlayerEventsFromGoals(goals, players, pickIds) {
    players = players || [];
    pickIds = pickIds || [];
    var byId = {};
    pickIds.forEach(function (id) {
      byId[id] = { goals: 0, assists: 0, sheets: 0 };
    });

    (goals || []).forEach(function (g) {
      var scorer = findPlayerForScorer(g.scorer, g.teamTla, players);
      if (scorer && byId[scorer.id] != null) byId[scorer.id].goals += 1;
      if (g.assist) {
        var assister = findPlayerForScorer(g.assist, g.teamTla, players);
        if (assister && byId[assister.id] != null) byId[assister.id].assists += 1;
      }
    });

    var playerEvents = {};
    pickIds.forEach(function (id) {
      var ev = byId[id] || { goals: 0, assists: 0, sheets: 0 };
      playerEvents[id] = {
        byMd: [
          { goals: ev.goals, assists: ev.assists, sheets: ev.sheets },
          { goals: 0, assists: 0, sheets: 0 },
          { goals: 0, assists: 0, sheets: 0 },
        ],
        total: { goals: ev.goals, assists: ev.assists, sheets: ev.sheets },
      };
    });
    return playerEvents;
  }

  function buildMatchWatchSim(payload, players, pickIds) {
    var playerEvents = buildPlayerEventsFromGoals(
      payload && payload.goals,
      players,
      pickIds
    );
    return {
      results: {},
      bracket: null,
      playerEvents: playerEvents,
      match: payload && payload.match,
    };
  }

  return {
    MATCH_WATCH_PICKS: MATCH_WATCH_PICKS,
    MATCH_WATCH_STATE: MATCH_WATCH_STATE,
    normalizeScorerName: normalizeScorerName,
    findPlayerForScorer: findPlayerForScorer,
    buildPlayerEventsFromGoals: buildPlayerEventsFromGoals,
    buildMatchWatchSim: buildMatchWatchSim,
  };
});
