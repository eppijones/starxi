#!/usr/bin/env node
// Post-match verification of the live scoring test (MAR v NOR friendly).
// Cross-checks three independent sources:
//   1) ESPN  — the real final score + scorers/assisters
//   2) prod /api/player-stats — did the injection + extraction surface them?
//   3) prod /api/leaderboard (global, public) — did the test teams score correctly?
// Then reads the QAJYV league entries from KV and confirms each team's points
// match exactly the players they picked who featured.

const fs = require("fs");
const path = require("path");
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").forEach((line) => {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const { parseGoal } = require("../api/_lib/espn-wc");
const { mapPlayerStats } = require("../festival/results-map");
const { tallyUser } = require("../festival/scoring-core");
const { kvSmembers, kvGet } = require("../api/_lib/kv");
const { loadGameData } = require("../api/_lib/gamedata");

const EVENT = "401866598";
const CODE = "QAJYV";
const jf = async (u) => { const r = await fetch(u, { headers: { accept: "application/json" } }); return r.ok ? r.json() : null; };

(async () => {
  const data = loadGameData();
  const byId = {}; data.PLAYERS.forEach((p) => { byId[p.id] = p; });

  // 1) ESPN final
  const sum = await jf(`https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.friendly/summary?event=${EVENT}`);
  const comp = (((sum.header || {}).competitions || [])[0]) || {};
  const state = (comp.status && comp.status.type && comp.status.type.state) || "?";
  const detail = (comp.status && comp.status.type && comp.status.type.shortDetail) || "";
  const score = (comp.competitors || []).map((c) => `${c.team && c.team.abbreviation} ${c.score}`).join("  ");
  const goals = [];
  (sum.keyEvents || []).forEach((e) => {
    const t = ((e.type && (e.type.type || e.type.text)) || "").toLowerCase();
    if ((!/goal/.test(t) && !/^goal!/i.test(e.text || "")) || /own/.test(t)) return;
    const g = parseGoal(e.text);
    goals.push(`${(e.team && e.team.abbreviation) || "?"}: ${g.scorer}${g.assist ? " (a: " + g.assist + ")" : ""}`);
  });
  console.log(`\n1) ESPN — ${state.toUpperCase()} (${detail}):  ${score}`);
  goals.forEach((g) => console.log("     " + g));

  // 2) Production player-stats feed
  const ps = await jf("https://starxi.io/api/player-stats");
  console.log(`\n2) prod /api/player-stats — test:${ps && ps.test}  rows:${(ps && ps.stats || []).length}`);
  (ps && ps.stats || []).forEach((s) => console.log(`     ${s.teamTla} ${s.playerName}  G${s.goals} A${s.assists}`));

  // 3) Production global leaderboard (public) — the test teams
  const lb = await jf("https://starxi.io/api/leaderboard?limit=50");
  console.log(`\n3) prod global leaderboard — test teams:`);
  (lb && lb.top || []).filter((r) => /Norge|Control/i.test(r.name)).forEach((r) =>
    console.log(`     #${r.rank} ${r.name} — ${r.pts} pts  (xi ${r.xiPts}, road ${r.predictionPts})`));

  // 4) Independent recompute from KV + the prod stats, to confirm correctness
  const uids = (await kvSmembers(`wcxi:league:${CODE}:m`)) || [];
  const payload = { matches: [{ stage: "GROUP_STAGE", matchday: 1, status: "SCHEDULED", utcDate: "2026-06-11T19:00:00Z", group: "A", home: { tla: "MEX" }, away: { tla: "RSA" }, score: {} }] };
  const events = mapPlayerStats((ps && ps.stats) || [], payload, data.PLAYERS, data.FIXTURES, data.NATIONS);
  console.log(`\n4) independent recompute (KV entries × prod stats):`);
  for (const uid of uids) {
    const e = JSON.parse((await kvGet(`wcxi:entry:${uid}`)) || "null");
    if (!e) continue;
    const t = tallyUser(e, { results: {}, bracket: null, playerEvents: events }, data);
    const scorers = (e.picks || []).filter((id) => events[id]).map((id) => {
      const ev = events[id].byMd.reduce((a, m) => ({ g: a.g + m.goals, as: a.as + m.assists }), { g: 0, as: 0 });
      return `${byId[id].name}(${ev.g}G${ev.as}A)`;
    });
    console.log(`     ${(e.displayName || "Player").padEnd(12)} ${t.xiPts} pts  ${scorers.join(", ") || "(no players featured)"}`);
  }
})().catch((e) => { console.error("failed:", e.message); process.exit(1); });
