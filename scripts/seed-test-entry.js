#!/usr/bin/env node
// TEMPORARY test helper — seed (or remove) a "control" entry in the live KV so a
// pre-tournament friendly test has an A/B opponent. The control is a squad of
// marquee players who are NOT in tonight's match, so it scores 0 while a team of
// the actual participants racks up real points.
//
//   node scripts/seed-test-entry.js                 # seed control into the global roster
//   node scripts/seed-test-entry.js --league ABCDE  # ...also add it to a league
//   node scripts/seed-test-entry.js --remove        # tear it all down
//   node scripts/seed-test-entry.js --remove --league ABCDE
//
// KV creds are read from .env.local (KV_REST_API_URL / KV_REST_API_TOKEN).

const fs = require("fs");
const path = require("path");

// Load KV creds from .env.local into process.env.
const envFile = path.join(__dirname, "..", ".env.local");
fs.readFileSync(envFile, "utf8").split("\n").forEach((line) => {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const { kvSet, kvDel, kvSadd, kvSrem } = require("../api/_lib/kv");
const { loadGameData } = require("../api/_lib/gamedata");

const UID = "starxi_test_control";
const ENTRY = `wcxi:entry:${UID}`;
const ROSTER = "wcxi:players";
const EXCLUDE = new Set(["NOR", "MAR"]); // tonight's match — control must avoid these
const FORMATION = { GK: 1, DF: 4, MF: 3, FW: 3 };

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const li = args.indexOf("--league");
const league = li >= 0 ? String(args[li + 1] || "").toUpperCase() : null;

(async () => {
  if (remove) {
    await kvDel(ENTRY);
    await kvSrem(ROSTER, UID);
    if (league) await kvSrem(`wcxi:league:${league}:m`, UID);
    console.log("✓ removed control entry" + (league ? ` (and from league ${league})` : ""));
    return;
  }

  const { PLAYERS } = loadGameData();
  const picks = [];
  for (const pos of Object.keys(FORMATION)) {
    PLAYERS.filter((p) => p.pos === pos && !EXCLUDE.has(p.nat))
      .sort((a, b) => b.form - a.form)
      .slice(0, FORMATION[pos])
      .forEach((p) => picks.push(p.id));
  }
  const now = 1749200000000; // fixed (no Date.now bias); earlier than user's entry
  const record = {
    v: 1, userId: UID, displayName: "Control XI (test)",
    nation: null,
    bracket: { groups: {}, lucky3rds: [], advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} } },
    picks, formation: "4-3-3", captain: null, captainPlus: false, captainByMd: {}, swaps: [],
    lateEntry: false, joinedAt: now, submittedAt: now, updatedAt: now,
  };
  await kvSet(ENTRY, JSON.stringify(record));
  await kvSadd(ROSTER, UID);
  if (league) await kvSadd(`wcxi:league:${league}:m`, UID);

  const byId = {}; PLAYERS.forEach((p) => { byId[p.id] = p; });
  console.log("✓ seeded Control XI (test) into global roster" + (league ? ` + league ${league}` : ""));
  console.log("  picks:", picks.map((id) => `${byId[id].name} (${byId[id].nat})`).join(", "));
})().catch((e) => { console.error("seed failed:", e.message); process.exit(1); });
