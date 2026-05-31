// WORLD CUP XI — shared scoring core (runs in the browser AND in Node /api).
//
// This is the single source of truth for how points are awarded, so the live
// client and the server-side leaderboard can NEVER disagree. It is dependency-
// free and framework-free: a UMD wrapper exposes it as `window.scoreMatch` etc.
// in the browser and as `module.exports` under Node.
//
// Prediction (per match):
//   correct outcome (1/X/2)        -> 3
//   + correct goal margin          -> +1 (=4)
//   exact scoreline                -> 5 (replaces the above)
//   home-nation matches            -> x2 ("boost")
//
// Dream XI per-event:
//   goal -> 4, assist -> 3, clean sheet (GK/DF) -> 2, captain -> x2
//
// tallyUser(state, sim, data) takes the fixtures/players via `data` so it works
// without browser globals; in the browser `data` defaults to window.{FIXTURES,
// PLAYERS}, keeping every existing `window.tallyUser(state, sim)` call working.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.scoreMatch = api.scoreMatch;
    window.scoreEvents = api.scoreEvents;
    window.tallyUser = api.tallyUser;
  }
})(this, function () {
  // ——— Prediction scoring ———
  function scoreMatch(prediction, actual, isBoost) {
    if (!prediction || prediction.home == null || prediction.away == null) {
      return { points: 0, bullseye: false, outcome: false };
    }
    var pSign = Math.sign(prediction.home - prediction.away);
    var aSign = Math.sign(actual.home - actual.away);
    var pts = 0,
      bull = false,
      outcome = false;
    var exact =
      prediction.home === actual.home && prediction.away === actual.away;
    if (exact) {
      pts = 5;
      bull = true;
      outcome = true;
    } else if (pSign === aSign) {
      outcome = true;
      pts =
        prediction.home - prediction.away === actual.home - actual.away ? 4 : 3;
    }
    if (isBoost) pts *= 2;
    return { points: pts, bullseye: bull, outcome: outcome };
  }

  // ——— Dream XI per-event scoring (no captain multiplier here) ———
  function scoreEvents(player, events) {
    var g = events.goals || 0;
    var a = events.assists || 0;
    var s = events.sheets || 0;
    var pts = g * 4 + a * 3;
    if (player.pos === "GK" || player.pos === "DF") pts += s * 2;
    return pts;
  }

  // ——— Full per-user tally ———
  // sim = { results: { [fixtureId]: { home, away } },
  //         playerEvents: { [playerId]: { byMd: [ {goals,assists,sheets} x3 ] } } }
  // data = { FIXTURES, PLAYERS }  (defaults to window globals in the browser)
  function tallyUser(state, sim, data) {
    if (!data && typeof window !== "undefined") {
      data = { FIXTURES: window.FIXTURES, PLAYERS: window.PLAYERS };
    }
    var FIXTURES = (data && data.FIXTURES) || [];
    var PLAYERS = (data && data.PLAYERS) || [];
    var byId = {};
    PLAYERS.forEach(function (p) {
      byId[p.id] = p;
    });

    var predictions = state.predictions || {};
    var picks = state.picks || [];
    var captain = state.captain;
    var captainPlus = state.captainPlus;
    var captainByMd = state.captainByMd || {};
    var nation = state.nation;
    var swaps = state.swaps || [];

    var predictionPts = 0;
    var xiPts = 0;
    var bullseyes = 0;
    var outcomesRight = 0;
    var nationCalled = false;

    var matchBreakdown = FIXTURES.map(function (fx) {
      var actual = sim.results[fx.id];
      var pred = predictions[fx.id];
      var isBoost =
        !!nation && (fx.home.code === nation || fx.away.code === nation);
      // No result yet -> 0 points, but keep the row for the UI.
      if (!actual) {
        return {
          fx: fx,
          actual: null,
          pred: pred,
          points: 0,
          bullseye: false,
          outcome: false,
          isBoost: isBoost,
        };
      }
      var r = scoreMatch(pred, actual, isBoost);
      if (r.bullseye) bullseyes++;
      if (r.outcome) outcomesRight++;
      predictionPts += r.points;
      if (isBoost && r.outcome) nationCalled = true;
      return {
        fx: fx,
        actual: actual,
        pred: pred,
        points: r.points,
        bullseye: r.bullseye,
        outcome: r.outcome,
        isBoost: isBoost,
      };
    });

    // Swap timeline: swaps[i] = { from, to, atMd } -> from MD atMd onwards,
    // replace `from` with `to` in the active XI.
    function activeIdAt(slotId, md) {
      var cur = slotId;
      swaps.forEach(function (sw) {
        if (sw.from === cur && md >= sw.atMd) cur = sw.to;
      });
      return cur;
    }

    var xiBreakdown = picks.map(function (originalId) {
      var total = 0;
      var mdLines = [1, 2, 3].map(function (md) {
        var activeId = activeIdAt(originalId, md);
        var p = byId[activeId];
        if (!p) {
          return {
            md: md,
            player: null,
            events: { goals: 0, assists: 0, sheets: 0 },
            pts: 0,
            isCap: false,
          };
        }
        var pe = sim.playerEvents && sim.playerEvents[p.id];
        var ev =
          (pe && pe.byMd && pe.byMd[md - 1]) || {
            goals: 0,
            assists: 0,
            sheets: 0,
          };
        var pts = scoreEvents(p, ev);
        var capId = captainPlus ? captainByMd[md] : captain;
        var isCap = !!capId && (capId === activeId || capId === originalId);
        if (isCap) pts *= 2;
        total += pts;
        return { md: md, player: p, events: ev, pts: pts, isCap: isCap };
      });
      xiPts += total;
      return { slotId: originalId, mdLines: mdLines, total: total };
    });

    return {
      total: predictionPts + xiPts,
      predictionPts: predictionPts,
      xiPts: xiPts,
      bullseyes: bullseyes,
      outcomesRight: outcomesRight,
      nationCalled: nationCalled,
      matchBreakdown: matchBreakdown,
      xiBreakdown: xiBreakdown,
    };
  }

  return {
    scoreMatch: scoreMatch,
    scoreEvents: scoreEvents,
    tallyUser: tallyUser,
  };
});
