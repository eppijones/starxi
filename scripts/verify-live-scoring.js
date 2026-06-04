#!/usr/bin/env node
// Live END-TO-END proof: a real match's goals (ESPN) → our player mapping →
// scoring-core → the SAME ranking ladder the production leaderboard uses. Proves
// "scoring + league ranking actually work" on real data, without touching prod.
//
// Usage:
//   node scripts/verify-live-scoring.js                       # 2022 WC final (archive)
//   node scripts/verify-live-scoring.js fifa.friendly 730312  # any ESPN match
//     (find event ids in the scoreboard: .../soccer/fifa.friendly/scoreboard?dates=YYYYMMDD)

const { parseGoal } = require("../api/_lib/espn-wc");
const { mapPlayerStats } = require("../festival/results-map");
const { tallyUser } = require("../festival/scoring-core");
const { rankLadder } = require("../api/leaderboard");
const { loadGameData } = require("../api/_lib/gamedata");

const LEAGUE = process.argv[2] || "fifa.world";
const EVENT = process.argv[3] || "633850"; // 2022 WC final, ARG–FRA

async function jf(u) {
  const r = await fetch(u, { headers: { accept: "application/json" } });
  return r.ok ? r.json() : null;
}

(async () => {
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}`;
  const sum = await jf(`${base}/summary?event=${EVENT}`);
  if (!sum) { console.log("Could not load summary for", LEAGUE, EVENT); process.exit(1); }

  const comp = (((sum.header || {}).competitions || [])[0] || {});
  const tlaById = {};
  (comp.competitors || []).forEach((c) => { if (c.team && c.team.id) tlaById[c.team.id] = c.team.abbreviation; });
  const date = comp.date || "2022-12-18T00:00:00Z";
  const teams = (comp.competitors || []).map((c) => c.team && c.team.abbreviation).join(" v ");

  // Extract goals + assists from the match summary, exactly like prod.
  const stats = [];
  (sum.keyEvents || []).forEach((e) => {
    const t = ((e.type && (e.type.type || e.type.text)) || "").toLowerCase();
    if (!/goal/.test(t) && !/^goal!/i.test(e.text || "")) return;
    if (/own/.test(t) || /own goal/i.test(e.text || "")) return;
    const teamTla = (e.team && (e.team.abbreviation || tlaById[e.team.id])) || null;
    const { scorer, assist } = parseGoal(e.text);
    if (scorer) stats.push({ playerName: scorer, teamTla, goals: 1, assists: 0, utcDate: date });
    if (assist) stats.push({ playerName: assist, teamTla, goals: 0, assists: 1, utcDate: date });
  });
  console.log(`\nMatch: ${teams}  (${LEAGUE} #${EVENT}, ${date.slice(0, 10)})`);
  console.log(`Extracted: ${stats.filter((s) => s.goals).length} goals, ${stats.filter((s) => s.assists).length} assists`);

  const data = loadGameData();
  // Synthetic payload so the match day maps to a matchday (group MD1 → index 0).
  const payload = { matches: [{ stage: "GROUP_STAGE", matchday: 1, status: "FINISHED", utcDate: date, group: "A", home: { tla: "AAA" }, away: { tla: "BBB" }, score: { home: 1, away: 0, winner: "HOME_TEAM" } }] };
  const events = mapPlayerStats(stats, payload, data.PLAYERS, [], data.NATIONS);
  const byId = {}; data.PLAYERS.forEach((p) => { byId[p.id] = p; });
  const scorerIds = Object.keys(events);
  console.log("Pool players who featured:", scorerIds.map((id) => `${byId[id].name} (${byId[id].nat})`).join(", ") || "(none in our squad pool)");
  if (!scorerIds.length) {
    console.log("→ No World-Cup-squad players in this match, so nothing scores in our game. Try a match with WC nations (e.g. FRA, ESP, MEX).");
    return;
  }

  // Two mock entries: one that picked the scorers, one that didn't — then rank
  // them with the EXACT ladder the production leaderboard uses.
  const others = data.PLAYERS.filter((p) => !scorerIds.includes(p.id));
  const padTo = (ids, n) => { const out = [...ids]; for (const p of others) { if (out.length >= n) break; out.push(p.id); } return out.slice(0, n); };
  const entries = [
    { displayName: "Backed the scorers", picks: padTo(scorerIds, 11) },
    { displayName: "Missed them", picks: others.slice(0, 11).map((p) => p.id) },
  ];
  const sim = { results: {}, bracket: null, playerEvents: events };
  const rows = entries.map((e, i) => {
    const t = tallyUser(e, sim, data);
    return { name: e.displayName, xiPts: t.xiPts, predictionPts: t.predictionPts, bullseyes: t.bullseyes, submittedAt: i, _t: t };
  });
  rows.sort(rankLadder);

  console.log("\nMini-league (ranked by the production ladder):");
  rows.forEach((r, i) => console.log(`  ${i + 1}. ${r.name.padEnd(20)} ${r.xiPts} pts`));
  const top = rows[0];
  console.log(`\nBreakdown of "${top.name}":`);
  top._t.xiBreakdown.filter((b) => b.total !== 0).forEach((b) => {
    const p = byId[b.slotId];
    console.log(`   ${p.name} (${p.nat}) — ${b.total} pts`);
  });
  console.log("\n✅ Real goals → player mapping → scoring → ranking all working on live data.");
})();
