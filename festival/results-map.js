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
    window.deriveActualBracket = api.deriveActualBracket;
    window.buildDayToMd = api.buildDayToMd;
    window.mapPlayerStats = api.mapPlayerStats;
    window.assembleLiveSim = api.assembleLiveSim;
    window.__wcPairKey = api.pairKey; // exposed for tests
  }
})(this, function () {
  // our code -> football-data tla
  var WC_TLA_ALIAS = { URU: "URY" };
  function tla(code) {
    return WC_TLA_ALIAS[code] || code;
  }
  // football-data tla -> our code (reverse of WC_TLA_ALIAS), for the live feed.
  var WC_TLA_UNALIAS = { URY: "URU" };
  function ourCode(t) {
    return WC_TLA_UNALIAS[t] || t;
  }
  // football-data `stage` -> our knockout round key (and the byMd index it scores
  // on). 2026 is a 48-team bracket, so the first KO round is the Round of 32.
  // We match defensively on substrings since the exact labels finalise upstream.
  function stageToRound(stage) {
    var s = String(stage || "").toUpperCase();
    if (s.indexOf("GROUP") >= 0) return null;
    if (s.indexOf("32") >= 0) return "r32";
    if (s.indexOf("16") >= 0 || s.indexOf("LAST_16") >= 0) return "r16";
    if (s.indexOf("QUARTER") >= 0) return "qf";
    if (s.indexOf("SEMI") >= 0) return "sf";
    if (s.indexOf("THIRD") >= 0 || s.indexOf("3RD") >= 0) return "third";
    if (s.indexOf("FINAL") >= 0) return "final"; // checked last so SEMI_FINAL etc. don't match
    return null;
  }
  // byMd index each knockout round scores on (group MD1–3 = 0,1,2).
  var ROUND_MD_INDEX = { r32: 3, r16: 4, qf: 5, sf: 6, final: 7, third: 7 };

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

  // ——— Derive the ACTUAL bracket from real results ———
  // Produces the { groups, advances } shape scoreBracket/nationRunBonus compare
  // against. Group standings come from finished group fixtures (pts, GD, GF, then
  // FIFA rank as the final tiebreak — same ladder the demo sim uses). Knockout
  // advancers come from each finished KO match's winner. advances[round] holds the
  // WINNERS of that round (i.e. the teams that REACHED the next round), keyed by an
  // arbitrary index — scoreBracket matches on the code SET, not the index.
  function deriveActualBracket(payload, FIXTURES, NATIONS) {
    if (!FIXTURES && typeof window !== "undefined") FIXTURES = window.FIXTURES;
    if (!NATIONS && typeof window !== "undefined") NATIONS = window.NATIONS;
    FIXTURES = FIXTURES || [];
    NATIONS = NATIONS || [];
    var rankOf = {};
    NATIONS.forEach(function (n) { rankOf[n.code] = n.rank; });

    var bracket = { groups: {}, advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} } };
    if (!payload || !Array.isArray(payload.matches)) return bracket;

    // 1. Group standings from finished group fixtures.
    var mapped = buildResultsMap(payload, FIXTURES);
    var byGroup = {};
    FIXTURES.forEach(function (fx) {
      if (!fx.group) return;
      (byGroup[fx.group] = byGroup[fx.group] || []).push(fx);
    });
    Object.keys(byGroup).forEach(function (g) {
      // Group positions only settle once EVERY match in the group is finished —
      // otherwise an all-zero table would sort by FIFA rank and hand out group
      // points before a ball is kicked. No standings until the group is decided.
      var fixtures = byGroup[g];
      var allDone = fixtures.length > 0 && fixtures.every(function (fx) {
        return mapped.statusById[fx.id] === "FINISHED";
      });
      if (!allDone) return;
      var stats = {};
      function seed(code) { if (!stats[code]) stats[code] = { code: code, pts: 0, gd: 0, gf: 0 }; }
      fixtures.forEach(function (fx) {
        seed(fx.home.code); seed(fx.away.code);
        var r = mapped.results[fx.id];
        if (!r) return;
        var hs = stats[fx.home.code], as = stats[fx.away.code];
        hs.gf += r.home; hs.gd += r.home - r.away;
        as.gf += r.away; as.gd += r.away - r.home;
        if (r.home > r.away) hs.pts += 3;
        else if (r.home < r.away) as.pts += 3;
        else { hs.pts += 1; as.pts += 1; }
      });
      var sorted = Object.keys(stats).map(function (c) { return stats[c]; }).sort(function (a, b) {
        return b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || (rankOf[a.code] || 99) - (rankOf[b.code] || 99);
      });
      bracket.groups[g] = sorted.map(function (s) { return s.code; });
    });

    // 2. Knockout advancers from finished KO matches.
    payload.matches.forEach(function (m) {
      var round = stageToRound(m.stage);
      if (!round || round === "third") return; // 3rd-place game doesn't feed the bracket
      if (m.status !== "FINISHED") return;
      var w = m.score && m.score.winner;
      var code = null;
      if (w === "HOME_TEAM") code = m.home && m.home.tla;
      else if (w === "AWAY_TEAM") code = m.away && m.away.tla;
      if (!code) {
        // A finished KO match with no resolved winner shouldn't happen (ties go to
        // penalties) — if it does, the feed is lagging. Don't guess; log it loudly
        // so a stuck bracket is diagnosable instead of silently mis-scored.
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[results-map] finished " + round + " match has no winner yet — not advancing:",
            (m.home && m.home.tla) || "?", "v", (m.away && m.away.tla) || "?");
        }
        return;
      }
      code = ourCode(code);
      var slot = Object.keys(bracket.advances[round]).length;
      bracket.advances[round][slot] = code;
    });
    return bracket;
  }

  // Build a { "YYYY-MM-DD": byMdIndex } map from the payload's own match dates, so
  // a player-stat row (which carries a date, not our matchday) can be slotted onto
  // the right matchday. Group days take their matchday number; KO days map by stage.
  function buildDayToMd(payload) {
    var out = {};
    if (!payload || !Array.isArray(payload.matches)) return out;
    payload.matches.forEach(function (m) {
      var day = String(m.utcDate || "").slice(0, 10);
      if (!day) return;
      var round = stageToRound(m.stage);
      if (round) { out[day] = ROUND_MD_INDEX[round]; return; }
      if (m.matchday >= 1 && m.matchday <= 3) out[day] = m.matchday - 1; // group MD → index 0–2
    });
    return out;
  }

  // Map balldontlie player-stat rows onto our PLAYERS, producing the
  // playerEvents { id: { byMd:[8] } } shape tallyUser consumes. Goals/assists come
  // from the stats; clean sheets are derived from scorelines (per nation, per
  // matchday) and applied to that nation's GK/DF picks — a standard approximation
  // when lineup data is absent. `stats` rows: { playerName, teamTla, goals,
  // assists, cleanSheet, utcDate }. Name matching is last-name, case-insensitive.
  function mapPlayerStats(stats, payload, PLAYERS, FIXTURES, NATIONS) {
    PLAYERS = PLAYERS || (typeof window !== "undefined" ? window.PLAYERS : []) || [];
    FIXTURES = FIXTURES || (typeof window !== "undefined" ? window.FIXTURES : []) || [];
    var dayToMd = buildDayToMd(payload);
    var events = {};
    function ensure(id) {
      if (!events[id]) {
        events[id] = { byMd: [0,1,2,3,4,5,6,7].map(function () { return { goals: 0, assists: 0, sheets: 0 }; }) };
      }
      return events[id];
    }
    // Index players by nation + normalised last name for fuzzy matching across
    // two different feeds. Accent-fold (María → maria) so a scorer string from
    // one source matches a roster name spelled with/without diacritics.
    function fold(s) {
      var x = String(s || "");
      if (x.normalize) x = x.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      return x.toLowerCase();
    }
    function lastName(name) {
      var parts = fold(name).replace(/[.'-]/g, " ").trim().split(/\s+/);
      return parts[parts.length - 1] || "";
    }
    var byNatLast = {};
    PLAYERS.forEach(function (p) {
      byNatLast[ourCode(p.nat) + "|" + lastName(p.name)] = p;
      byNatLast[p.nat + "|" + lastName(p.name)] = p;
    });

    // Goals/assists from the stats feed.
    (stats || []).forEach(function (row) {
      var day = String(row.utcDate || "").slice(0, 10);
      var md = dayToMd[day];
      if (md == null) return;
      var nat = ourCode(row.teamTla);
      var p = byNatLast[nat + "|" + lastName(row.playerName)] || byNatLast[row.teamTla + "|" + lastName(row.playerName)];
      if (!p) return;
      var line = ensure(p.id).byMd[md];
      line.goals += row.goals || 0;
      line.assists += row.assists || 0;
    });

    // Clean sheets derived from scorelines (group + KO) for every GK/DF pick of a
    // nation that shut its opponent out that matchday.
    var mapped = buildResultsMap(payload, FIXTURES);
    var defendersByNat = {};
    PLAYERS.forEach(function (p) {
      if (p.pos === "GK" || p.pos === "DF") {
        (defendersByNat[ourCode(p.nat)] = defendersByNat[ourCode(p.nat)] || []).push(p);
      }
    });
    // Group fixtures: opponent scored 0 → clean sheet for that side, on fx.matchday.
    (FIXTURES || []).forEach(function (fx) {
      if (mapped.statusById[fx.id] !== "FINISHED") return;
      var r = mapped.results[fx.id];
      if (!r) return;
      var mdIdx = (fx.matchday || 1) - 1;
      if (r.away === 0) creditSheet(fx.home.code, mdIdx);
      if (r.home === 0) creditSheet(fx.away.code, mdIdx);
    });
    function creditSheet(code, mdIdx) {
      (defendersByNat[ourCode(code)] || []).forEach(function (p) {
        ensure(p.id).byMd[mdIdx].sheets += 1;
      });
    }

    return events;
  }

  // One call the leaderboard (and Live screen) use to turn the raw feeds into the
  // `sim` tallyUser expects: { results, bracket, playerEvents }.
  function assembleLiveSim(resultsPayload, statsPayload, data) {
    data = data || {};
    var FIXTURES = data.FIXTURES || (typeof window !== "undefined" ? window.FIXTURES : []);
    var PLAYERS = data.PLAYERS || (typeof window !== "undefined" ? window.PLAYERS : []);
    var NATIONS = data.NATIONS || (typeof window !== "undefined" ? window.NATIONS : []);
    var mapped = buildResultsMap(resultsPayload, FIXTURES);
    var stats = (statsPayload && statsPayload.stats) || [];
    return {
      results: mapped.results,
      bracket: deriveActualBracket(resultsPayload, FIXTURES, NATIONS),
      playerEvents: mapPlayerStats(stats, resultsPayload, PLAYERS, FIXTURES, NATIONS),
      meta: { played: mapped.played, live: mapped.live, updatedAt: mapped.updatedAt, configured: mapped.configured },
    };
  }

  return {
    WC_TLA_ALIAS: WC_TLA_ALIAS,
    pairKey: pairKey,
    buildResultsMap: buildResultsMap,
    deriveActualBracket: deriveActualBracket,
    buildDayToMd: buildDayToMd,
    mapPlayerStats: mapPlayerStats,
    assembleLiveSim: assembleLiveSim,
    stageToRound: stageToRound,
  };
});
