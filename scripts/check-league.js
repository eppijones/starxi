#!/usr/bin/env node
// Pre-match proof: read the REAL entries in a league from live KV, then run them
// through the EXACT production scoring path (mapPlayerStats → tallyUser → ladder)
// with a few simulated NOR/MAR goals, to confirm the league will update when the
// real goals land. Usage: node scripts/check-league.js QAJYV

const fs = require("fs");
const path = require("path");
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").forEach((line) => {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const { kvSmembers, kvGet } = require("../api/_lib/kv");
const { mapPlayerStats } = require("../festival/results-map");
const { tallyUser } = require("../festival/scoring-core");
const { rankLadder } = require("../api/leaderboard");
const { loadGameData } = require("../api/_lib/gamedata");

const CODE = (process.argv[2] || "QAJYV").toUpperCase();

(async () => {
  const data = loadGameData();
  const byId = {}; data.PLAYERS.forEach((p) => { byId[p.id] = p; });

  const uids = (await kvSmembers(`wcxi:league:${CODE}:m`)) || [];
  console.log(`League ${CODE}: ${uids.length} members\n`);
  const entries = [];
  for (const uid of uids) {
    const e = JSON.parse((await kvGet(`wcxi:entry:${uid}`)) || "null");
    if (e) entries.push(e);
  }

  // Simulated goals for tonight (re-dated to the opener day, exactly like the
  // live test injection does). Names match ESPN's scorer strings.
  const stats = [
    { playerName: "Erling Haaland", teamTla: "NOR", goals: 1, assists: 1, utcDate: "2026-06-11T19:00:00Z" },
    { playerName: "Alexander Sørloth", teamTla: "NOR", goals: 1, assists: 0, utcDate: "2026-06-11T19:00:00Z" },
    { playerName: "Ayoub El Kaabi", teamTla: "MAR", goals: 1, assists: 0, utcDate: "2026-06-11T19:00:00Z" },
    { playerName: "Achraf Hakimi", teamTla: "MAR", goals: 0, assists: 1, utcDate: "2026-06-11T19:00:00Z" },
  ];
  const payload = { matches: [{ stage: "GROUP_STAGE", matchday: 1, status: "SCHEDULED", utcDate: "2026-06-11T19:00:00Z", group: "A", home: { tla: "MEX" }, away: { tla: "RSA" }, score: {} }] };
  const events = mapPlayerStats(stats, payload, data.PLAYERS, data.FIXTURES, data.NATIONS);
  console.log("Simulated goals →", Object.keys(events).map((id) => byId[id] ? byId[id].name : id).join(", "), "\n");

  const sim = { results: {}, bracket: null, playerEvents: events };
  const rows = entries.map((e) => {
    const t = tallyUser(e, sim, data);
    const scorers = (e.picks || []).filter((id) => events[id]).map((id) => byId[id] && byId[id].name).filter(Boolean);
    return { name: e.displayName || "Player", xiPts: t.xiPts, predictionPts: t.predictionPts, bullseyes: t.bullseyes, submittedAt: e.submittedAt || 0, scorers };
  });
  rows.sort(rankLadder);
  console.log("Projected league table IF those goals happen:");
  rows.forEach((r, i) => {
    console.log(`  ${i + 1}. ${(r.name).padEnd(14)} ${r.xiPts} pts   ${r.scorers.length ? "← " + r.scorers.join(", ") : "(no players in the match)"}`);
  });
})().catch((e) => { console.error("failed:", e.message); process.exit(1); });
