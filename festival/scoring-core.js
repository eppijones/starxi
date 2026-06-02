// STAR XI — shared scoring core (runs in the browser AND in Node /api).
//
// This is the single source of truth for how points are awarded, so the live
// client and the server-side leaderboard can NEVER disagree. It is dependency-
// free and framework-free: a UMD wrapper exposes it as `window.scoreBracket`
// etc. in the browser and as `module.exports` under Node.
//
// Road to the Final (per-prediction):
//   • Group stage — +1 per team in the right group position (max 4/group).
//   • Knockout    — each round you backed correctly is worth more than the last:
//       R16 advance   +1     SF advance     +8
//       QF  advance   +2     Finalist       (rolled into SF→Final tier)
//       SF  advance   +4     Champion       +16
//   • Home-nation 2× boost still applies — every bracket point your nation
//     earns is doubled.
//
// Star XI per-event (unchanged — kept brutally simple on purpose):
//   goal -> 4, assist -> 3, clean sheet (GK/DF) -> 2, captain -> x2
//
// tallyUser(state, sim, data) takes the fixtures/players via `data` so it works
// without browser globals. It returns the same field names as before
// (`predictionPts`, `xiPts`, `bullseyes`, `outcomesRight`, `matchBreakdown`,
// `xiBreakdown`) — only their *meaning* changes for the prediction layer — so
// the leaderboard ladder and the Live screen don't have to be rewritten in
// lock-step.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.scoreBracket = api.scoreBracket;
    window.scoreEvents = api.scoreEvents;
    window.tallyUser = api.tallyUser;
  }
})(this, function () {
  // ——— Road-to-the-Final bracket scoring ———
  // `prediction` and `actual` share the same shape:
  //   { groups: {A:[1st,2nd,3rd,4th], …}, advances: {r32:{…},r16:{…},qf:{…},sf:{…},final:code} }
  // `nation` is the player's home-nation code (string|null) for the 2× boost.
  //
  // Returns:
  //   { points, bullseyes, advancesRight,
  //     groupBreakdown: [{group, hits, perfect, points}…],
  //     roundBreakdown: [{round, hits, total, points}…] }
  //
  // Missing prediction pieces score 0 (the player skipped them).
  // Missing actual pieces (results not in yet) also score 0 — same shape, just
  // nothing to compare against.
  var KO_PTS = { r32: 1, r16: 2, qf: 4, sf: 8, final: 16 };
  var KO_KEYS = ["r32", "r16", "qf", "sf", "final"];
  var KO_SIZES = { r32: 16, r16: 8, qf: 4, sf: 2, final: 1 };

  function scoreBracket(prediction, actual, nation) {
    var out = {
      points: 0,
      bullseyes: 0,
      advancesRight: 0,
      groupBreakdown: [],
      roundBreakdown: [],
    };
    if (!prediction || !actual) return out;

    // Group stage — +1 per team in the right slot, doubled when it's the
    // player's home nation. A "perfect" group (4/4) ticks the bullseye counter
    // (also a leaderboard tiebreaker).
    var pGroups = prediction.groups || {};
    var aGroups = actual.groups || {};
    Object.keys(aGroups).forEach(function (g) {
      var pred = pGroups[g] || [];
      var act = aGroups[g] || [];
      var hits = 0, pts = 0;
      for (var i = 0; i < 4; i++) {
        if (pred[i] && act[i] && pred[i] === act[i]) {
          hits++;
          var p = 1;
          if (nation && pred[i] === nation) p *= 2;
          pts += p;
        }
      }
      var perfect = hits === 4 && pred.filter(Boolean).length === 4;
      if (perfect) out.bullseyes++;
      out.points += pts;
      out.groupBreakdown.push({ group: g, hits: hits, perfect: perfect, points: pts });
    });

    // Knockout rounds — picks at round R only score if the *actual* team
    // advanced past that round (i.e. appears in the actual round-R picks).
    var pAdv = prediction.advances || {};
    var aAdv = actual.advances || {};
    KO_KEYS.forEach(function (round) {
      var size = KO_SIZES[round];
      var per = KO_PTS[round];
      var predRound = pAdv[round] || {};
      var actRound = aAdv[round] || {};
      var actCodes = {};
      // For r32..sf: each match returns one code. For final: a single code at
      // key 0 OR a top-level `final` string — accept both shapes.
      if (round === "final") {
        var actChamp = actRound[0] || aAdv.final;
        if (actChamp) actCodes[actChamp] = true;
      } else {
        Object.keys(actRound).forEach(function (k) {
          if (actRound[k]) actCodes[actRound[k]] = true;
        });
      }
      var hits = 0, pts = 0;
      var slots = round === "final" ? 1 : size;
      for (var i = 0; i < slots; i++) {
        var pick;
        if (round === "final") pick = predRound[0] || pAdv.final;
        else pick = predRound[i];
        if (pick && actCodes[pick]) {
          hits++;
          var p2 = per;
          if (nation && pick === nation) p2 *= 2;
          pts += p2;
        }
      }
      out.points += pts;
      out.advancesRight += hits;
      out.roundBreakdown.push({ round: round, hits: hits, total: slots, points: pts });
      // Picking the right champion is a one-shot — also count as a bullseye for
      // the tiebreaker.
      if (round === "final" && hits === 1) out.bullseyes++;
    });

    return out;
  }

  // ——— Star XI per-event scoring ———
  // No captain multiplier here — tallyUser applies it on top.
  //
  // Events shape: { goals, assists, sheets, wins, draws, yellows, reds }
  //
  // GEM BOOST — lower-rated players earn more on every positive point so picking
  // a 6.0-rated hidden gem who performs can beat the Star XI:
  //   form ≥ 8.0  → ×1.0 (no boost)
  //   form 7.0–7.9 → ×1.3 (Solid Pick)
  //   form 6.0–6.9 → ×1.5 (Hidden Gem)
  //   form  < 6.0  → ×2.0 (Wild Card)
  // The boost multiplies POSITIVE points only; card deductions always sting.
  var GEM_THRESHOLDS = [
    { below: 6.0, mult: 2.0 },
    { below: 7.0, mult: 1.5 },
    { below: 8.0, mult: 1.3 },
  ];
  function gemMult(form) {
    for (var i = 0; i < GEM_THRESHOLDS.length; i++) {
      if (form < GEM_THRESHOLDS[i].below) return GEM_THRESHOLDS[i].mult;
    }
    return 1.0;
  }

  function scoreEvents(player, events) {
    var g  = events.goals   || 0;
    var a  = events.assists || 0;
    var s  = events.sheets  || 0;
    var w  = events.wins    || 0;
    var d  = events.draws   || 0;
    var yc = events.yellows || 0;
    var rc = events.reds    || 0;

    // Positive pts
    var pos = g * 5 + a * 3;
    if (player.pos === "GK") pos += s * 6;
    else if (player.pos === "DF") pos += s * 3;
    pos += w * 3 + d * 1;

    // Gem boost on positive pts
    var form = (player && typeof player.form === "number") ? player.form : 8.0;
    pos = Math.round(pos * gemMult(form));

    // Cards always sting (no boost)
    var neg = yc * 1 + rc * 3;

    return pos - neg;
  }

  // ——— Full per-user tally ———
  // sim = { results?: {...}, bracket?: {...}, playerEvents?: {...} }
  // data = { FIXTURES, PLAYERS } (defaults to window globals in the browser)
  //
  // Returns: { total, predictionPts, xiPts, bullseyes, outcomesRight,
  //            nationCalled, matchBreakdown, xiBreakdown }
  // (`matchBreakdown` is repurposed as a flat bracket row list so consumers that
  // iterated it for "your match-by-match" UIs keep working with light tweaks.)
  function tallyUser(state, sim, data) {
    if (!data && typeof window !== "undefined") {
      data = { FIXTURES: window.FIXTURES, PLAYERS: window.PLAYERS };
    }
    var FIXTURES = (data && data.FIXTURES) || [];
    var PLAYERS = (data && data.PLAYERS) || [];
    var byId = {};
    PLAYERS.forEach(function (p) { byId[p.id] = p; });

    var picks = state.picks || [];
    var captain = state.captain;
    var captainPlus = state.captainPlus;
    var captainByMd = state.captainByMd || {};
    var nation = state.nation;
    var swaps = state.swaps || [];

    // ——— Prediction (bracket) layer ———
    var br = scoreBracket(state.bracket, (sim && sim.bracket) || null, nation);
    var nationCalled = false;
    if (nation && state.bracket && state.bracket.advances) {
      var champPick = (state.bracket.advances.final || {})[0]
                    || state.bracket.advances.final;
      var actChamp = sim && sim.bracket && sim.bracket.advances
                   && ((sim.bracket.advances.final || {})[0] || sim.bracket.advances.final);
      if (champPick && champPick === nation && actChamp === nation) nationCalled = true;
    }

    // Swap timeline: swaps[i] = { from, to, atMd } -> from MD atMd onwards,
    // replace `from` with `to` in the active XI.
    function activeIdAt(slotId, md) {
      var cur = slotId;
      swaps.forEach(function (sw) {
        if (sw.from === cur && md >= sw.atMd) cur = sw.to;
      });
      return cur;
    }

    var xiPts = 0;
    var xiBreakdown = picks.map(function (originalId) {
      var total = 0;
      var mdLines = [1, 2, 3].map(function (md) {
        var activeId = activeIdAt(originalId, md);
        var p = byId[activeId];
        if (!p) {
          return {
            md: md, player: null,
            events: { goals: 0, assists: 0, sheets: 0 },
            pts: 0, isCap: false,
          };
        }
        var pe = sim && sim.playerEvents && sim.playerEvents[p.id];
        var ev = (pe && pe.byMd && pe.byMd[md - 1]) || { goals: 0, assists: 0, sheets: 0 };
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

    // matchBreakdown is repurposed: a flat row-list of bracket "lines" the Live
    // screen renders as the prediction breakdown. Each row carries enough to
    // display either a group ladder or a knockout pick.
    var matchBreakdown = [];
    (br.groupBreakdown || []).forEach(function (gb) {
      matchBreakdown.push({
        kind: "group",
        group: gb.group,
        hits: gb.hits,
        perfect: gb.perfect,
        points: gb.points,
      });
    });
    (br.roundBreakdown || []).forEach(function (rb) {
      matchBreakdown.push({
        kind: "round",
        round: rb.round,
        hits: rb.hits,
        total: rb.total,
        points: rb.points,
      });
    });

    return {
      total: br.points + xiPts,
      predictionPts: br.points,
      xiPts: xiPts,
      bullseyes: br.bullseyes,
      outcomesRight: br.advancesRight,
      nationCalled: nationCalled,
      matchBreakdown: matchBreakdown,
      xiBreakdown: xiBreakdown,
      bracketDetail: br,    // group + round breakdown, for the Live/locked UI
    };
  }

  return {
    scoreBracket: scoreBracket,
    scoreEvents: scoreEvents,
    tallyUser: tallyUser,
  };
});
