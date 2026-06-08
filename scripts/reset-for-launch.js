#!/usr/bin/env node
// STAR XI — pre-launch reset.
// Keeps ONLY the launch team (displayName === KEEP_NAME) and wipes every other
// entry + every league, so the global + league leaderboards start clean.
//
//   node scripts/reset-for-launch.js            # dry run (shows plan, changes nothing)
//   node scripts/reset-for-launch.js --execute  # perform the deletion
//
// Does NOT touch Clerk login accounts — only the app's KV data (entries, roster
// membership, leagues). A login with no entry simply doesn't appear anywhere.

const fs = require("fs");
try {
  fs.readFileSync(require("path").join(__dirname, "..", ".env.local"), "utf8")
    .split("\n").forEach((l) => { const m = /^([A-Z_]+)=(.*)$/.exec(l.trim()); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; });
} catch (e) {}

const { kvGet, kvDel, kvSrem, kvSmembers } = require("../api/_lib/kv");

const KEEP_NAME = "Eppicenter";
const EXECUTE = process.argv.includes("--execute");
const ROSTER = "wcxi:players";

(async () => {
  const uids = (await kvSmembers(ROSTER)) || [];
  const entries = [];
  for (const uid of uids) {
    const e = JSON.parse((await kvGet("wcxi:entry:" + uid)) || "null");
    entries.push({ uid, name: e && e.displayName, nation: e && e.nation, e });
  }

  const keepers = entries.filter((x) => x.name === KEEP_NAME);
  const victims = entries.filter((x) => x.name !== KEEP_NAME);

  if (keepers.length !== 1) {
    console.error(`✗ ABORT: expected exactly 1 team named "${KEEP_NAME}", found ${keepers.length}. No changes made.`);
    keepers.forEach((k) => console.error("   keeper candidate:", k.uid, k.name));
    process.exit(1);
  }
  const keepUid = keepers[0].uid;

  // Gather every league referenced by ANY roster member (covers all of them).
  const leagueCodes = new Set();
  for (const uid of uids) {
    ((await kvSmembers("wcxi:user:" + uid + ":leagues")) || []).forEach((c) => leagueCodes.add(c));
  }
  const leagues = [];
  for (const c of leagueCodes) {
    const meta = JSON.parse((await kvGet("wcxi:league:" + c)) || "null");
    const mem = (await kvSmembers("wcxi:league:" + c + ":m")) || [];
    leagues.push({ code: c, name: meta && meta.name, ownerId: meta && meta.ownerId, members: mem });
  }

  console.log(`\n${EXECUTE ? "🔻 EXECUTING RESET" : "🔎 DRY RUN (no changes)"} — keep "${KEEP_NAME}"\n`);
  console.log("KEEP (1 team):");
  console.log(`   ✅ ${keepers[0].name}  [${keepUid}]  nation=${keepers[0].nation}`);
  console.log(`\nDELETE entries (${victims.length}):`);
  victims.forEach((v) => console.log(`   🗑️  ${v.name}  [${v.uid}]  nation=${v.nation}`));
  console.log(`\nDELETE leagues (${leagues.length}) — ALL are test leagues:`);
  leagues.forEach((l) => console.log(`   🗑️  ${l.code}  "${l.name}"  members=${l.members.length}`));

  if (!EXECUTE) {
    console.log(`\n(dry run) re-run with --execute to apply.\n`);
    return;
  }

  // 1) Tear down every league: drop each member's membership, then the sets.
  for (const l of leagues) {
    for (const uid of l.members) await kvSrem("wcxi:user:" + uid + ":leagues", l.code);
    await kvDel("wcxi:league:" + l.code + ":m");
    await kvDel("wcxi:league:" + l.code);
  }
  // 2) Delete victim entries + remove from roster + clear their league set.
  for (const v of victims) {
    await kvDel("wcxi:entry:" + v.uid);
    await kvSrem(ROSTER, v.uid);
    await kvDel("wcxi:user:" + v.uid + ":leagues");
  }
  // 3) Keeper: clear any now-dangling league membership set.
  await kvDel("wcxi:user:" + keepUid + ":leagues");

  // 4) Verify.
  const rosterAfter = (await kvSmembers(ROSTER)) || [];
  const keepLeaguesAfter = (await kvSmembers("wcxi:user:" + keepUid + ":leagues")) || [];
  let leaguesLeft = 0;
  for (const c of leagueCodes) { if (await kvGet("wcxi:league:" + c)) leaguesLeft++; }

  console.log(`\n✅ DONE. Roster now: ${rosterAfter.length} team(s).`);
  for (const uid of rosterAfter) {
    const e = JSON.parse((await kvGet("wcxi:entry:" + uid)) || "null");
    console.log(`   • ${e && e.displayName}  [${uid}]`);
  }
  console.log(`   Keeper's leagues: ${keepLeaguesAfter.length}.  Leagues remaining: ${leaguesLeft}.`);
  if (rosterAfter.length === 1 && rosterAfter[0] === keepUid && leaguesLeft === 0) {
    console.log(`\n🎉 Clean slate — "${KEEP_NAME}" is the only team, no leagues. Ready for launch.\n`);
  } else {
    console.log(`\n⚠️  Unexpected end state — review above.\n`);
  }
})();
