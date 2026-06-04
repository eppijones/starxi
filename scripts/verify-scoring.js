#!/usr/bin/env node
// STAR XI — scoring verification harness (run: node scripts/verify-scoring.js)
//
// Proves the scoring-core math against hand-computed expected values. Covers the
// rebalanced gem boost (attack-only), group + knockout Star XI scoring, the GW3
// captain carry into the knockouts, swaps, the home-nation deep-run bonus, the
// bracket layer, and the group/knockout stage split. Exits non-zero on any miss
// so it can gate a deploy.

const {
  scoreEvents,
  scoreBracket,
  nationRunBonus,
  tallyUser,
} = require("../festival/scoring-core");

let pass = 0,
  fail = 0;
function eq(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}\n      got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`);
  }
}
function section(name) {
  console.log(`\n${name}`);
}

// ——— scoreEvents: gem boost is ATTACK-ONLY, defensive/result pts are flat ———
section("scoreEvents — gem boost (attack-only) + flat defensive/result pts");
const FW = (form) => ({ pos: "FW", form });
const GK = (form) => ({ pos: "GK", form });
const DF = (form) => ({ pos: "DF", form });
const MF = (form) => ({ pos: "MF", form });

// Star FW (form 9.0, ×1.0): goal+assist = 5+3 = 8.
eq("star FW goal+assist", scoreEvents(FW(9.0), { goals: 1, assists: 1 }), 8);
// Solid (7.5, ×1.2): 2 assists = round(6*1.2)=7.
eq("solid MF 2 assists", scoreEvents(MF(7.5), { assists: 2 }), 7);
// Hidden gem (6.5, ×1.4): 1 goal = round(5*1.4)=7.
eq("hidden-gem FW 1 goal", scoreEvents(FW(6.5), { goals: 1 }), 7);
// Wild card (5.5, ×1.6): goal+assist = round(8*1.6)=round(12.8)=13.
eq("wild-card FW goal+assist", scoreEvents(FW(5.5), { goals: 1, assists: 1 }), 13);
// THE EXPLOIT FIX: low-form GK clean sheet is NOT boosted → flat 6 (was 12).
eq("wild-card GK clean sheet is flat (exploit closed)", scoreEvents(GK(5.5), { sheets: 1 }), 6);
// Low-form DF clean sheet + win, both flat: 3 + 3 = 6.
eq("wild-card DF sheet+win flat", scoreEvents(DF(5.5), { sheets: 1, wins: 1 }), 6);
// Cards always sting, never boosted: star FW 1 goal, 1 yellow, 1 red = 5 - 1 - 3 = 1.
eq("cards sting unboosted", scoreEvents(FW(9.0), { goals: 1, yellows: 1, reds: 1 }), 1);
// gemMult tier boundaries via attack pts (1 goal = 5 base):
eq("form 8.0 → ×1.0", scoreEvents(FW(8.0), { goals: 1 }), 5);
eq("form 7.9 → ×1.2", scoreEvents(FW(7.9), { goals: 1 }), 6); // round(5*1.2)=6
eq("form 7.0 → ×1.2", scoreEvents(FW(7.0), { goals: 1 }), 6);
eq("form 6.9 → ×1.4", scoreEvents(FW(6.9), { goals: 1 }), 7);
eq("form 6.0 → ×1.4", scoreEvents(FW(6.0), { goals: 1 }), 7);
eq("form 5.9 → ×1.6", scoreEvents(FW(5.9), { goals: 1 }), 8);

// ——— nationRunBonus: furthest round reached ———
section("nationRunBonus — furthest round reached");
const advWith = (round, code) => ({ advances: { [round]: { 0: code } } });
eq("reached R16 (in r32 winners) → 3", nationRunBonus(advWith("r32", "FRA"), "FRA"), 3);
eq("reached QF (in r16 winners) → 6", nationRunBonus(advWith("r16", "FRA"), "FRA"), 6);
eq("reached SF (in qf winners) → 10", nationRunBonus(advWith("qf", "FRA"), "FRA"), 10);
eq("reached Final (in sf winners) → 15", nationRunBonus(advWith("sf", "FRA"), "FRA"), 15);
eq("champion → 25", nationRunBonus({ advances: { final: { 0: "FRA" } } }, "FRA"), 25);
eq("not in knockouts → 0", nationRunBonus(advWith("r32", "BRA"), "FRA"), 0);
eq("null actual → 0", nationRunBonus(null, "FRA"), 0);
// Champion takes precedence over earlier rounds it also appears in.
eq(
  "champion precedence",
  nationRunBonus({ advances: { r32: { 0: "FRA" }, r16: { 0: "FRA" }, final: { 0: "FRA" } } }, "FRA"),
  25
);

// ——— scoreBracket: group + KO split, home-nation doubling, bullseyes ———
section("scoreBracket — group/KO split, home-nation 2×, bullseyes");
const br1 = scoreBracket(
  {
    groups: { A: ["X", "Y", "Z", "W"] },
    advances: { r32: { 0: "AAA", 1: "BBB" }, final: { 0: "CHAMP" } },
  },
  {
    groups: { A: ["X", "Y", "Q", "W"] }, // 3/4 right (idx 0,1,3)
    advances: { r32: { 0: "AAA", 5: "CCC" }, final: { 0: "CHAMP" } },
  },
  null
);
eq("group points (3 hits)", br1.groupPoints, 3);
eq("knockout points (r32 hit 1 + final 16)", br1.knockoutPoints, 17);
eq("total points", br1.points, 20);
eq("bullseyes (champion only, group not perfect)", br1.bullseyes, 1);

// Home-nation doubling: nation X (group slot) + CHAMP final pick.
const br2 = scoreBracket(
  { groups: { A: ["X", "Y", "Z", "W"] }, advances: { final: { 0: "CHAMP" } } },
  { groups: { A: ["X", "Y", "Z", "W"] }, advances: { final: { 0: "CHAMP" } } },
  "X"
);
// Group: X doubled (2) + Y,Z,W (1 each) = 5; perfect group → bullseye.
eq("home-nation group doubling", br2.groupPoints, 5);
eq("perfect group bullseye + champion bullseye", br2.bullseyes, 2);

// ——— tallyUser end-to-end: group + KO + GW3 captain carry + nation bonus ———
section("tallyUser — full tournament, GW3 captain carries to knockouts");
const PLAYERS = [
  { id: "p1", pos: "FW", form: 9.0, code: "FRA" },
  { id: "p2", pos: "GK", form: 7.0, code: "FRA" },
  { id: "p3", pos: "FW", form: 5.5, code: "BRA" },
];
const state = {
  nation: "FRA",
  picks: ["p1", "p2", "p3"],
  captainPlus: true,
  captainByMd: { 1: "p1", 2: "p1", 3: "p3" }, // GW3 captain = p3 → carries to KO
  swaps: [],
  bracket: { groups: {}, advances: { final: { 0: "FRA" } } },
};
const sim = {
  bracket: { advances: { final: { 0: "FRA" } } }, // FRA champion → nation bonus 25
  playerEvents: {
    // byMd index: 0,1,2=group MD1-3 | 3=R32 4=R16 5=QF 6=SF 7=Final
    p1: { byMd: [{ goals: 1 }, {}, {}, { goals: 1 }, {}, {}, {}, { goals: 1 }] },
    p2: { byMd: [{ sheets: 1 }, {}, {}, { sheets: 1 }, {}, {}, {}, {}] },
    p3: { byMd: [{}, {}, { goals: 1, assists: 1 }, { goals: 1 }, {}, {}, {}, {}] },
  },
};
const t = tallyUser(state, sim, { FIXTURES: [], PLAYERS });

// Hand-computed (see harness comments):
// p1: MD1 goal×cap(p1)=10 (group) | R32 5 + Final 5 = 10 (KO)
// p2: MD1 sheet 6 (group) | R32 sheet 6 (KO)
// p3: MD3 (5+3)*1.6=13 ×cap(p3)=26 (group) | R32 5*1.6=8 ×cap(p3 KO)=16 (KO)
eq("xiGroupPts", t.xiGroupPts, 42);            // 10 + 6 + 26
eq("nationBonus (FRA champion)", t.nationBonus, 25);
eq("xiKnockoutPts (incl. nation bonus)", t.xiKnockoutPts, 57); // 10 + 6 + 16 + 25
eq("xiPts", t.xiPts, 99);                      // 42 + 57
eq("predictionKnockoutPts (champion ×2 home)", t.predictionKnockoutPts, 32);
eq("predictionGroupPts", t.predictionGroupPts, 0);
eq("predictionPts", t.predictionPts, 32);
eq("groupPts (full group haul)", t.groupPts, 42);
eq("knockoutPts (full KO haul)", t.knockoutPts, 89); // 57 + 32
eq("total = group + knockout", t.total, t.groupPts + t.knockoutPts);
eq("total = xiPts + predictionPts", t.total, t.xiPts + t.predictionPts);
eq("nationCalled", t.nationCalled, true);

// ——— Swap timeline: replace an eliminated pick from R16 onward ———
section("tallyUser — swap replaces an eliminated pick at a knockout MD");
const state2 = {
  nation: null,
  picks: ["p1"],
  captainPlus: false,
  captain: null,
  swaps: [{ from: "p1", to: "p3", atMd: 5 }], // from R16 (MD5) use p3 instead of p1
  bracket: { groups: {}, advances: {} },
};
const sim2 = {
  bracket: null,
  playerEvents: {
    p1: { byMd: [{ goals: 1 }, {}, {}, { goals: 1 }, {}, {}, {}, {}] }, // scores MD1+R32
    p3: { byMd: [{}, {}, {}, {}, { goals: 1 }, {}, {}, {}] },           // scores R16
  },
};
const t2 = tallyUser(state2, sim2, { FIXTURES: [], PLAYERS });
// MD1 p1 goal = 5 (group), R32 p1 goal = 5 (KO), R16 now p3 (form5.5) goal = round(5*1.6)=8 (KO)
eq("swap: group pts (p1 MD1)", t2.xiGroupPts, 5);
eq("swap: knockout pts (p1 R32 5 + p3 R16 8)", t2.xiKnockoutPts, 13);

// ——— Live-data pipeline: derive bracket + clean sheets from real scorelines ———
section("live pipeline — derive actuals from a synthetic football-data payload");
const { loadGameData } = require("../api/_lib/gamedata");
const {
  deriveActualBracket,
  buildDayToMd,
  mapPlayerStats,
  assembleLiveSim,
  stageToRound,
} = require("../festival/results-map");
const GAME = loadGameData();

// Synthetic payload: MEX win all their group-A games 2–0, everyone else draws 0–0.
// Deterministic standings → MEX 1st; then KOR(23) < CZE(33) < RSA(56) by FIFA rank.
const MD_DAY = { 1: "2026-06-11", 2: "2026-06-16", 3: "2026-06-21" };
const groupA = GAME.FIXTURES.filter((f) => f.group === "A");
const matches = groupA.map((fx) => {
  let h = 0, a = 0, winner = "DRAW";
  if (fx.home.code === "MEX") { h = 2; winner = "HOME_TEAM"; }
  else if (fx.away.code === "MEX") { a = 2; winner = "AWAY_TEAM"; }
  return {
    stage: "GROUP_STAGE", group: "A", matchday: fx.matchday,
    utcDate: MD_DAY[fx.matchday] + "T16:00:00Z", status: "FINISHED",
    home: { tla: fx.home.code }, away: { tla: fx.away.code },
    score: { home: h, away: a, winner },
  };
});
// Two knockout results: ARG win an R32 tie; FRA win the Final.
matches.push({
  stage: "LAST_32", utcDate: "2026-06-28T16:00:00Z", status: "FINISHED",
  home: { tla: "ARG" }, away: { tla: "AUS" }, score: { home: 2, away: 0, winner: "HOME_TEAM" },
});
matches.push({
  stage: "FINAL", utcDate: "2026-07-19T16:00:00Z", status: "FINISHED",
  home: { tla: "FRA" }, away: { tla: "BRA" }, score: { home: 1, away: 0, winner: "HOME_TEAM" },
});
const payload = { configured: true, matches, played: matches.length, updatedAt: "2026-07-19T18:00:00Z" };

eq("stageToRound LAST_32 → r32", stageToRound("LAST_32"), "r32");
eq("stageToRound SEMI_FINALS → sf (not final)", stageToRound("SEMI_FINALS"), "sf");
eq("stageToRound FINAL → final", stageToRound("FINAL"), "final");

const actual = deriveActualBracket(payload, GAME.FIXTURES, GAME.NATIONS);
eq("group A standings (MEX 1st, rank tiebreak)", actual.groups.A, ["MEX", "KOR", "CZE", "RSA"]);

// Gate: a group with an unfinished match must NOT produce standings (else a
// zeroed table would sort by FIFA rank and award group points pre-kickoff).
const partial = { ...payload, matches: payload.matches.map((m, i) =>
  i === 0 ? { ...m, status: "SCHEDULED", score: { home: null, away: null, winner: null } } : m) };
const partialBracket = deriveActualBracket(partial, GAME.FIXTURES, GAME.NATIONS);
eq("no group standings until the group is complete", partialBracket.groups.A, undefined);
eq("R32 advancers include ARG", Object.values(actual.advances.r32), ["ARG"]);
eq("Final winner (champion) is FRA", Object.values(actual.advances.final), ["FRA"]);
eq("nation bonus: ARG reached R16 → 3", nationRunBonus(actual, "ARG"), 3);
eq("nation bonus: FRA champion → 25", nationRunBonus(actual, "FRA"), 25);

const dayToMd = buildDayToMd(payload);
eq("dayToMd: group MD1 day → index 0", dayToMd["2026-06-11"], 0);
eq("dayToMd: group MD3 day → index 2", dayToMd["2026-06-21"], 2);
eq("dayToMd: R32 day → index 3", dayToMd["2026-06-28"], 3);
eq("dayToMd: Final day → index 7", dayToMd["2026-07-19"], 7);

// Player stats → events: Mbappé (FRA) scores on a MD1 day.
const mbappe = GAME.PLAYERS.find((p) => /Mbapp/.test(p.name));
const stats = [{ playerName: "K. Mbappé", teamTla: "FRA", goals: 2, assists: 1, utcDate: "2026-06-11T16:00:00Z" }];
const ev = mapPlayerStats(stats, payload, GAME.PLAYERS, GAME.FIXTURES, GAME.NATIONS);
eq("Mbappé mapped 2 goals on MD1", ev[mbappe.id].byMd[0].goals, 2);
eq("Mbappé mapped 1 assist on MD1", ev[mbappe.id].byMd[0].assists, 1);

// Clean sheet derivation (synthetic players so it's deterministic).
const csEvents = mapPlayerStats(
  [],
  { matches: [{ stage: "GROUP_STAGE", group: "Z", matchday: 1, status: "FINISHED",
      utcDate: "2026-06-11T16:00:00Z", home: { tla: "AAA" }, away: { tla: "BBB" },
      score: { home: 1, away: 0, winner: "HOME_TEAM" } }] },
  [{ id: "g1", nat: "AAA", pos: "GK", form: 8 }, { id: "d1", nat: "BBB", pos: "DF", form: 8 }],
  [{ id: 900, group: "Z", matchday: 1, home: { code: "AAA" }, away: { code: "BBB" } }],
  []
);
eq("clean sheet credited to shutout nation's GK", csEvents.g1.byMd[0].sheets, 1);
eq("no clean sheet for the nation that conceded", (csEvents.d1 && csEvents.d1.byMd[0].sheets) || 0, 0);

// assembleLiveSim end-to-end → tallyUser scores real (non-zero) points.
const liveSim = assembleLiveSim(payload, { stats }, GAME);
const fraState = {
  nation: "FRA", picks: [mbappe.id], captainPlus: false, captain: null, swaps: [],
  bracket: { groups: {}, advances: {} },
};
const lt = tallyUser(fraState, liveSim, GAME);
eq("assembled sim: Mbappé group pts (form 9.1, 2g+1a = 13)", lt.xiGroupPts, 13);
eq("assembled sim: FRA nation bonus flows through", lt.nationBonus, 25);

// ——— Late-entry per-round lock (anti-backfill) ———
section("late entry — per-round prediction lock");
const { gateLateBracket } = require("../api/entry");
const fullBracket = {
  groups: { A: ["MEX", "KOR", "CZE", "RSA"] },
  lucky3rds: ["X", "Y", "Z", "W", "P", "Q", "R", "S"],
  advances: { r32: { 0: "ARG" }, r16: { 0: "BRA" }, qf: { 0: "FRA" }, sf: { 0: "ESP" }, final: { 0: "GER" } },
};
// Join during the R16 window (after R16 kicked off, before QF): groups, lucky,
// R32 and R16 are cleared (already started); QF/SF/Final survive (still ahead).
const midKo = gateLateBracket(fullBracket, Date.parse("2026-07-05T12:00:00Z"));
eq("late: groups cleared once tournament started", midKo.groups, {});
eq("late: lucky 3rds cleared", midKo.lucky3rds, []);
eq("late: R32 cleared (already played)", midKo.advances.r32, {});
eq("late: R16 cleared (already started)", midKo.advances.r16, {});
eq("late: QF preserved (still ahead)", midKo.advances.qf, { 0: "FRA" });
eq("late: SF preserved", midKo.advances.sf, { 0: "ESP" });
eq("late: Final preserved", midKo.advances.final, { 0: "GER" });
// Joining before any QF: a late joiner during the group stage keeps every KO
// prediction (nothing's kicked off) but loses group/lucky calls.
const earlyLate = gateLateBracket(fullBracket, Date.parse("2026-06-20T12:00:00Z"));
eq("group-stage joiner keeps all KO picks", Object.keys(earlyLate.advances.r32).length, 1);
eq("group-stage joiner loses group calls", earlyLate.groups, {});

// ——— ESPN goal-text parser (goals + assists source) ———
section("ESPN parseGoal — scorer + assist extraction");
const { parseGoal } = require("../api/_lib/espn-wc");
eq("penalty, no assist",
  parseGoal("Goal!  Argentina 1, France 0. Lionel Messi (Argentina) converts the penalty with a left footed shot to the bottom right corner."),
  { scorer: "Lionel Messi", assist: null });
eq("open play with assist",
  parseGoal("Goal!  Argentina 2, France 0. Ángel Di María (Argentina) left footed shot from the centre of the box to the bottom right corner. Assisted by Alexis Mac Allister  following a fast break."),
  { scorer: "Ángel Di María", assist: "Alexis Mac Allister" });
eq("assist ended by period",
  parseGoal("Goal!  Argentina 2, France 2. Kylian Mbappé (France) right footed shot from the left side of the box to the bottom right corner. Assisted by Marcus Thuram."),
  { scorer: "Kylian Mbappé", assist: "Marcus Thuram" });

// ——— Summary ———
console.log(`\n${"─".repeat(48)}`);
console.log(`  ${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log("  SCORING VERIFICATION FAILED");
  process.exit(1);
}
console.log("  ✅ scoring verified");
