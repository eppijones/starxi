#!/usr/bin/env node
// One-time migration: rewrite every stored entry's player ids (picks, captain,
// per-GW captains, swaps) through the alias map, so entries saved before a squad
// refresh use canonical ids. Idempotent. Run after deploying player-aliases.js.
//   node scripts/migrate-entry-ids.js          # apply
//   node scripts/migrate-entry-ids.js --dry    # preview only

const fs = require("fs"), path = require("path");
fs.readFileSync(path.join(__dirname, "..", ".env.local"), "utf8").split("\n").forEach((line) => {
  const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
});

const { kvSmembers, kvGet, kvSet } = require("../api/_lib/kv");
const { resolvePid } = require("../festival/player-aliases");
const { loadGameData } = require("../api/_lib/gamedata");

const DRY = process.argv.includes("--dry");

(async () => {
  const ids = new Set(loadGameData().PLAYERS.map((p) => p.id));
  const uids = (await kvSmembers("wcxi:players")) || [];
  let touched = 0;
  for (const uid of uids) {
    const raw = await kvGet(`wcxi:entry:${uid}`);
    const e = raw && JSON.parse(raw);
    if (!e) continue;
    const before = JSON.stringify([e.picks, e.captain, e.captainByMd, e.swaps]);
    e.picks = (e.picks || []).map(resolvePid);
    e.captain = e.captain != null ? resolvePid(e.captain) : e.captain;
    const cap = {}; Object.keys(e.captainByMd || {}).forEach((md) => { cap[md] = resolvePid(e.captainByMd[md]); });
    e.captainByMd = cap;
    e.swaps = (e.swaps || []).map((sw) => (sw && typeof sw === "object" ? { ...sw, from: resolvePid(sw.from), to: resolvePid(sw.to) } : sw));
    const after = JSON.stringify([e.picks, e.captain, e.captainByMd, e.swaps]);
    const orphans = (e.picks || []).filter((id) => !ids.has(id));
    if (before !== after) {
      touched++;
      console.log(`${DRY ? "[dry] " : ""}${(e.displayName || uid).padEnd(16)} migrated${orphans.length ? "  ⚠️ still-orphaned: " + orphans.join(",") : ""}`);
      if (!DRY) await kvSet(`wcxi:entry:${uid}`, JSON.stringify(e));
    } else if (orphans.length) {
      console.log(`${(e.displayName || uid).padEnd(16)} no alias for removed picks: ${orphans.join(",")}`);
    }
  }
  console.log(`\n${DRY ? "Would migrate" : "Migrated"} ${touched}/${uids.length} entries.`);
})().catch((e) => { console.error("failed:", e.message); process.exit(1); });
