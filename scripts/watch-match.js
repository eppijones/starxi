#!/usr/bin/env node
// Background match watcher for the live scoring test. Polls an ESPN match every
// ~2 min and EXITS (re-invoking the agent) the moment the score/goals change or
// the match goes final — or after ~28 min of no change, so the agent can relaunch.
//   node scripts/watch-match.js <eventId> "<lastSignature>"

const { parseGoal } = require("../api/_lib/espn-wc");
const LEAGUE = "fifa.friendly";
const EVENT = process.argv[2] || "401866598";
const lastSig = process.argv[3] || "";
const POLL_MS = 120000;
const MAX_MS = 28 * 60000;

async function jf(u) {
  try { const r = await fetch(u, { headers: { accept: "application/json" } }); return r.ok ? r.json() : null; }
  catch (e) { return null; }
}
function snap(sum) {
  const comp = (((sum.header || {}).competitions || [])[0]) || {};
  const state = (comp.status && comp.status.type && comp.status.type.state) || "pre";
  const clock = (comp.status && (comp.status.displayClock || "")) + " " + ((comp.status && comp.status.type && comp.status.type.shortDetail) || "");
  const cs = (comp.competitors || []).map((c) => `${c.team && c.team.abbreviation} ${c.score}`);
  const goals = [];
  (sum.keyEvents || []).forEach((e) => {
    const t = ((e.type && (e.type.type || e.type.text)) || "").toLowerCase();
    if ((!/goal/.test(t) && !/^goal!/i.test(e.text || "")) || /own/.test(t)) return;
    const { scorer, assist } = parseGoal(e.text);
    goals.push(`${(e.team && e.team.abbreviation) || "?"}: ${scorer}${assist ? " (a: " + assist + ")" : ""}`);
  });
  return { state, clock: clock.trim(), score: cs.join("  "), goals };
}

(async () => {
  const start = Date.now();
  while (Date.now() - start < MAX_MS) {
    const sum = await jf(`https://site.api.espn.com/apis/site/v2/sports/soccer/${LEAGUE}/summary?event=${EVENT}`);
    if (sum) {
      const s = snap(sum);
      const sig = s.goals.join(","); // fire on goal changes (and always at full-time)
      if (sig !== lastSig || s.state === "post") {
        console.log(JSON.stringify({ changed: true, final: s.state === "post", ...s, sig }));
        return;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  console.log(JSON.stringify({ changed: false, note: "no change in ~28m — relaunch to keep watching", sig: lastSig }));
})();
