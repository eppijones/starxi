// WORLD CUP XI — single-team scoring breakdown (the leaderboard drill-down).
//
//   GET /api/team?token=<t>            -> a GLOBAL team's breakdown (public)
//   GET /api/team?token=<t>&code=ABC23 -> a LEAGUE member's breakdown (members-only)
//
// `token` is the opaque handle the leaderboard hands out (api/_lib/tokens.js) —
// we resolve it back to a userId by scanning the scope's roster, so account ids
// are never exposed. Returns the team's Star XI scored player-by-player across
// every matchday (group MD1–3 + knockout rounds) plus the Road-to-the-Final
// group/round points — the same numbers the leaderboard ranks on, itemised.

const { kvConfigured, kvGet, kvSmembers } = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");
const { loadGameData } = require("./_lib/gamedata");
const { assembleLiveSim } = require("../festival/results-map");
const { tallyUser } = require("../festival/scoring-core");
const { teamToken } = require("./_lib/tokens");

const ENTRY = (uid) => `wcxi:entry:${uid}`;
const ROSTER = "wcxi:players";
const LEAGUE_META = (code) => `wcxi:league:${code}`;
const LEAGUE_MEMBERS = (code) => `wcxi:league:${code}:m`;

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function safeParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
function normalizeCode(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }

async function fetchApi(req, path) {
  try {
    const host = req.headers && req.headers.host;
    if (!host) return null;
    const proto = String((req.headers && req.headers["x-forwarded-proto"]) || "https").split(",")[0];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${proto}://${host}${path}`, { signal: ctrl.signal, headers: { accept: "application/json" } });
    clearTimeout(t);
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (!kvConfigured()) return json(res, 200, { ok: false, configured: false });
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return json(res, 405, { error: "method not allowed" }); }

  const url = new URL(req.url, "http://x");
  const token = String(url.searchParams.get("token") || "").replace(/[^a-f0-9]/g, "").slice(0, 32);
  const code = normalizeCode(url.searchParams.get("code"));
  if (!token) return json(res, 400, { ok: false, error: "bad_token" });

  // Auth: global is public; a league requires a signed-in member.
  const auth = await verifyRequest(req);
  const uid = auth ? auth.userId : null;

  let memberUids, scope, scopeName = null;
  if (code) {
    if (!uid) return json(res, 401, { ok: false, error: "auth_required" });
    const meta = safeParse(await kvGet(LEAGUE_META(code)));
    if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
    memberUids = (await kvSmembers(LEAGUE_MEMBERS(code))) || [];
    if (!memberUids.includes(uid)) return json(res, 403, { ok: false, error: "not_a_member" });
    scope = "league"; scopeName = meta.name;
  } else {
    memberUids = (await kvSmembers(ROSTER)) || [];
    scope = "global";
  }

  // Resolve the opaque token back to a userId (without ever exposing ids).
  const targetUid = memberUids.find((u) => teamToken(u) === token);
  if (!targetUid) return json(res, 404, { ok: false, error: "no_such_team" });

  const entry = safeParse(await kvGet(ENTRY(targetUid)));
  if (!entry) return json(res, 404, { ok: false, error: "no_entry" });

  // Score the team against the live feeds — same pipeline as the leaderboard.
  const data = loadGameData();
  const [resultsPayload, statsPayload] = await Promise.all([
    fetchApi(req, "/api/results"),
    fetchApi(req, "/api/player-stats"),
  ]);
  const sim = assembleLiveSim(resultsPayload, statsPayload, data);
  const t = tallyUser(entry, sim, data);

  // Star XI, itemised per pick across all 8 matchdays.
  const MD_LABEL = { 1: "MD1", 2: "MD2", 3: "MD3", 4: "R32", 5: "R16", 6: "QF", 7: "SF", 8: "Final" };
  const xi = (t.xiBreakdown || []).map((row) => {
    const first = (row.mdLines || []).find((l) => l.player) || {};
    const p = first.player || null;
    return {
      id: row.slotId,
      name: p ? p.name : null,
      nat: p ? p.nat : null,
      pos: p ? p.pos : null,
      total: row.total,
      byMd: (row.mdLines || []).map((l) => ({
        md: l.md,
        label: MD_LABEL[l.md],
        stage: l.md <= 3 ? "group" : "knockout",
        goals: (l.events && l.events.goals) || 0,
        assists: (l.events && l.events.assists) || 0,
        sheets: (l.events && l.events.sheets) || 0,
        pts: l.pts,
        isCap: !!l.isCap,
      })),
    };
  });

  const bd = t.bracketDetail || {};
  return json(res, 200, {
    ok: true,
    scope,
    code: code || null,
    leagueName: scopeName,
    name: entry.displayName || "Player",
    nation: entry.nation || null,
    formation: entry.formation || "4-3-3",
    isYou: targetUid === uid,
    lateEntry: !!entry.lateEntry,
    total: t.total,
    xiPts: t.xiPts,
    predictionPts: t.predictionPts,
    xiGroupPts: t.xiGroupPts,
    xiKnockoutPts: t.xiKnockoutPts,
    nationBonus: t.nationBonus,
    predictionGroupPts: t.predictionGroupPts,
    predictionKnockoutPts: t.predictionKnockoutPts,
    groupPts: t.groupPts,
    knockoutPts: t.knockoutPts,
    bullseyes: t.bullseyes,
    played: sim.meta.played,
    live: sim.meta.live,
    updatedAt: sim.meta.updatedAt,
    resultsConfigured: sim.meta.configured,
    xi,
    road: {
      groups: bd.groupBreakdown || [],
      rounds: bd.roundBreakdown || [],
    },
    orphanPicks: t.orphanPicks || [],
  });
};
