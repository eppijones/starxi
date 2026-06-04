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
// Star XI per-event:
//   goal -> 5, assist -> 3, clean sheet (GK -> 6 / DF -> 3), win -> 3, draw -> 1,
//   yellow -> -1, red -> -3, captain -> x2.
//   • GEM BOOST (attacking only) multiplies a pick's GOAL + ASSIST points when
//     the player is lower-rated, so a breakout cheap forward can out-score a star.
//     It deliberately does NOT touch clean-sheet/win/draw points (team-driven, not
//     individual brilliance) — that closes the "park-the-bus minnow keeper" exploit.
//
// Star XI scores across the WHOLE tournament — 3 group matchdays AND the 5
// knockout rounds (R32, R16, QF, SF, Final), all with the same per-event values:
//   matchday index  0 1 2 | 3   4   5   6    7
//   stage           G G G | R32 R16 QF  SF   Final
// A pick only scores in a knockout round if their nation actually reached it; use
// your 3 swaps to replace eliminated picks. The GW3 captain's ×2 armband carries
// through every knockout round (falling back GW2 → GW1 if GW3 is unset).
//
// Home-nation DEEP-RUN bonus (Star XI layer, on top of the bracket boost): you
// earn the value of the FURTHEST round your home nation actually reaches —
//   R16 +3 · QF +6 · SF +10 · Final +15 · Champion +25 — it escalates each round.
//
// tallyUser(state, sim, data) takes the fixtures/players via `data` so it works
// without browser globals. It returns every field it used to
// (`predictionPts`, `xiPts`, `bullseyes`, `outcomesRight`, `matchBreakdown`,
// `xiBreakdown`, `bracketDetail`, `total`, `nationCalled`) PLUS a stage split
// (`xiGroupPts`, `xiKnockoutPts`, `predictionGroupPts`, `predictionKnockoutPts`,
// `nationBonus`, `groupPts`, `knockoutPts`) so the leaderboard can rank on the
// full tournament, the group stage, or the knockouts alone — without re-scoring.

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.scoreBracket = api.scoreBracket;
    window.scoreEvents = api.scoreEvents;
    window.tallyUser = api.tallyUser;
    window.nationRunBonus = api.nationRunBonus;
    window.STARXI_SCORING = {
      MD_GROUP: api.MD_GROUP,
      MD_KNOCKOUT: api.MD_KNOCKOUT,
      MD_ALL: api.MD_ALL,
      KO_MD_ROUND: api.KO_MD_ROUND,
      NATION_RUN_PTS: api.NATION_RUN_PTS,
    };
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

  // ——— Matchday model ———
  // Star XI player events are keyed by matchday index (0-based) in byMd[]:
  //   0,1,2 = group MD1–3   3=R32  4=R16  5=QF  6=SF  7=Final (+3rd place)
  var MD_GROUP = [1, 2, 3];
  var MD_KNOCKOUT = [4, 5, 6, 7, 8];
  var MD_ALL = [1, 2, 3, 4, 5, 6, 7, 8];
  // Which bracket round each knockout matchday corresponds to.
  var KO_MD_ROUND = { 4: "r32", 5: "r16", 6: "qf", 7: "sf", 8: "final" };

  // Home-nation deep-run bonus (Star XI layer). You earn the value of the
  // FURTHEST round your home nation actually reaches — escalating each round.
  var NATION_RUN_PTS = { r16: 3, qf: 6, sf: 10, final: 15, champion: 25 };

  // How far did `nation` actually advance? Returns the bonus points for the
  // furthest round reached (0 if it didn't make the knockouts / no actuals yet).
  // advances.r32 holds R32 winners (= teams that REACHED the R16), and so on.
  function nationRunBonus(actual, nation) {
    if (!actual || !nation || !actual.advances) return 0;
    var adv = actual.advances;
    function reached(roundObj) {
      if (!roundObj) return false;
      return Object.keys(roundObj).some(function (k) { return roundObj[k] === nation; });
    }
    var champ = (adv.final && (adv.final[0] || adv.final)) || null;
    if (champ === nation) return NATION_RUN_PTS.champion;     // won the Final
    if (reached(adv.sf)) return NATION_RUN_PTS.final;         // reached the Final
    if (reached(adv.qf)) return NATION_RUN_PTS.sf;            // reached the SF
    if (reached(adv.r16)) return NATION_RUN_PTS.qf;           // reached the QF
    if (reached(adv.r32)) return NATION_RUN_PTS.r16;          // reached the R16
    return 0;
  }

  function scoreBracket(prediction, actual, nation) {
    var out = {
      points: 0,
      groupPoints: 0,
      knockoutPoints: 0,
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
      out.groupPoints += pts;
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
      out.knockoutPoints += pts;
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
  // GEM BOOST (rebalanced) — lower-rated players earn a multiplier on their
  // ATTACKING returns (goals + assists) only, so a breakout cheap forward can
  // out-score a superstar without making elite picks strictly worse:
  //   form ≥ 8.0   → ×1.0 (Star)
  //   form 7.0–7.9 → ×1.2 (Solid Pick)
  //   form 6.0–6.9 → ×1.4 (Hidden Gem)
  //   form  < 6.0  → ×1.6 (Wild Card)
  // Why attack-only: clean sheets / wins / draws are team-driven, not individual
  // brilliance. Boosting them rewarded stacking weak keepers behind a park-the-bus
  // minnow (sheet ×6 ×2.0 = 12) — an inverted incentive. Defensive and result
  // points are now flat; card deductions always sting (never boosted).
  var GEM_THRESHOLDS = [
    { below: 6.0, mult: 1.6 },
    { below: 7.0, mult: 1.4 },
    { below: 8.0, mult: 1.2 },
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

    // Attacking pts — gem-boosted (rounded so the boost can't leak fractions).
    var form = (player && typeof player.form === "number") ? player.form : 8.0;
    var attack = Math.round((g * 5 + a * 3) * gemMult(form));

    // Defensive + result pts — flat, never boosted.
    var flat = 0;
    if (player.pos === "GK") flat += s * 6;
    else if (player.pos === "DF") flat += s * 3;
    flat += w * 3 + d * 1;

    // Cards always sting (no boost).
    var neg = yc * 1 + rc * 3;

    return attack + flat - neg;
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

    // Captain for a given matchday. Group MDs use the per-GW captain (or the
    // single captain). Knockout MDs (4–8) all wear the GW3 armband — it "stays on
    // for the knockouts" — falling back GW2 → GW1 → single captain if GW3 unset.
    var koCaptain = captainPlus
      ? (captainByMd[3] || captainByMd[2] || captainByMd[1] || captain)
      : captain;
    function captainForMd(md) {
      if (md >= 4) return koCaptain;
      return captainPlus ? captainByMd[md] : captain;
    }

    var xiGroupPts = 0;
    var xiKnockoutPts = 0;
    var xiBreakdown = picks.map(function (originalId) {
      var total = 0;
      var mdLines = MD_ALL.map(function (md) {
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
        var capId = captainForMd(md);
        var isCap = !!capId && (capId === activeId || capId === originalId);
        if (isCap) pts *= 2;
        total += pts;
        if (md >= 4) xiKnockoutPts += pts; else xiGroupPts += pts;
        return { md: md, player: p, events: ev, pts: pts, isCap: isCap };
      });
      return { slotId: originalId, mdLines: mdLines, total: total };
    });

    // Home-nation deep-run bonus (Star XI layer) — counts as knockout points.
    var nationBonus = nationRunBonus((sim && sim.bracket) || null, nation);
    xiKnockoutPts += nationBonus;
    var xiPts = xiGroupPts + xiKnockoutPts;

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

      // ——— Stage split (so the leaderboard can rank on any stage × mode) ———
      xiGroupPts: xiGroupPts,                  // Star XI points from group MD1–3
      xiKnockoutPts: xiKnockoutPts,            // Star XI knockout pts (incl. nation bonus)
      nationBonus: nationBonus,                // home-nation deep-run bonus (subset of above)
      predictionGroupPts: br.groupPoints,      // bracket group-standings points
      predictionKnockoutPts: br.knockoutPoints,// bracket knockout-advance points
      groupPts: xiGroupPts + br.groupPoints,           // full group-stage haul
      knockoutPts: xiKnockoutPts + br.knockoutPoints,  // full knockout haul
    };
  }

  return {
    scoreBracket: scoreBracket,
    scoreEvents: scoreEvents,
    tallyUser: tallyUser,
    nationRunBonus: nationRunBonus,
    // Constants other modules (leaderboard, sim, UI) should share rather than
    // re-declare, so the matchday model + bonus table can never drift.
    MD_GROUP: MD_GROUP,
    MD_KNOCKOUT: MD_KNOCKOUT,
    MD_ALL: MD_ALL,
    KO_MD_ROUND: KO_MD_ROUND,
    NATION_RUN_PTS: NATION_RUN_PTS,
  };
});
