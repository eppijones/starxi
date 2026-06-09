// STAR XI — admin monitoring data. Gated by a shared password held ONLY in the
// ADMIN_PASSWORD env var (set in Vercel; never committed, never sent to clients).
// Read-only and safe to poll. Returns everything the /admin dashboard renders:
// registered users, locked-in teams, leagues, data-connection health, live usage.

const crypto = require("crypto");
const { kvConfigured, redis, kvGet, kvSmembers } = require("./_lib/kv");

const ROSTER = "wcxi:players";
const ENTRY = (uid) => `wcxi:entry:${uid}`;
const LEAGUES_ALL = "wcxi:leagues:all";
const META = (c) => `wcxi:league:${c}`;
const MEMBERS = (c) => `wcxi:league:${c}:m`;
const VISITS = "wcxi:stats:visits";
const PRESENCE = "wcxi:presence";
const UNIQUE_IPS = "wcxi:stats:ips";
const UNIQUE_IPS_DAY = (d) => `wcxi:stats:ips:${d}`;
const utcDay = (now) => new Date(now).toISOString().slice(0, 10).replace(/-/g, "");

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

// Constant-time comparison so the gate can't be brute-forced by timing.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch (e) { return false; }
}

function bearer(req) {
  const h = req.headers["authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : "";
}

module.exports = async (req, res) => {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return json(res, 503, { ok: false, error: "admin_not_configured" });
  if (!safeEqual(bearer(req), pw)) return json(res, 401, { ok: false, error: "unauthorized" });
  if (!kvConfigured()) return json(res, 200, { ok: true, kv: false });

  const now = Date.now();
  const out = { ok: true, ts: now, kv: true };

  // ── Locked-in teams (our roster of saved entries) ──
  try {
    const uids = (await kvSmembers(ROSTER)) || [];
    const raws = uids.length ? await redis(["MGET", ...uids.map(ENTRY)]) : [];
    const teams = (raws || [])
      .map((r) => { let e = null; try { e = JSON.parse(r); } catch (x) {} return e; })
      .filter(Boolean)
      .map((e) => ({
        name: e.displayName || "(unnamed)",
        nation: e.nation || "?",
        lateEntry: !!e.lateEntry,
        submittedAt: e.submittedAt || e.joinedAt || 0,
      }))
      .sort((a, b) => b.submittedAt - a.submittedAt);
    const dayAgo = now - 24 * 60 * 60 * 1000;
    out.teams = { count: teams.length, today: teams.filter((t) => t.submittedAt >= dayAgo).length, recent: teams.slice(0, 60) };
  } catch (e) { out.teams = { error: String((e && e.message) || e) }; }

  // ── Leagues (from the global index) ──
  try {
    const codes = (await kvSmembers(LEAGUES_ALL)) || [];
    const leagues = [];
    for (const c of codes) {
      const meta = JSON.parse((await kvGet(META(c))) || "null");
      if (!meta) continue;
      const members = (await kvSmembers(MEMBERS(c))) || [];
      leagues.push({ code: c, name: meta.name || "(unnamed)", members: members.length, createdAt: meta.createdAt || 0 });
    }
    leagues.sort((a, b) => b.members - a.members || b.createdAt - a.createdAt);
    out.leagues = { count: leagues.length, list: leagues.slice(0, 100) };
  } catch (e) { out.leagues = { error: String((e && e.message) || e) }; }

  // ── Live activity ──
  try {
    const visits = parseInt(await redis(["GET", VISITS]), 10) || 0;
    const online = parseInt(await redis(["ZCOUNT", PRESENCE, String(now - 5 * 60 * 1000), "+inf"]), 10) || 0;
    const uniqueVisitors = parseInt(await redis(["SCARD", UNIQUE_IPS]), 10) || 0;
    const uniqueToday = parseInt(await redis(["SCARD", UNIQUE_IPS_DAY(utcDay(now))]), 10) || 0;
    out.activity = { totalVisits: visits, onlineNow: online, uniqueVisitors, uniqueToday };
  } catch (e) { out.activity = { error: String((e && e.message) || e) }; }

  // ── Data connections ──
  out.connections = {
    kv: true,
    clerk: !!process.env.CLERK_SECRET_KEY,
    footballData: !!process.env.FOOTBALL_DATA_TOKEN,
    clerkUsers: null,
  };
  // Registered Clerk users (total). Best-effort.
  try {
    if (process.env.CLERK_SECRET_KEY) {
      const r = await fetch("https://api.clerk.com/v1/users/count", {
        headers: { Authorization: "Bearer " + process.env.CLERK_SECRET_KEY },
      });
      if (r.ok) { const j = await r.json(); if (j && typeof j.total_count === "number") out.connections.clerkUsers = j.total_count; }
    }
  } catch (e) {}
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0];

  // Live results feed health + finished-match scores (internal call).
  try {
    const rr = await fetch(`${proto}://${host}/api/results`);
    if (rr.ok) {
      const j = await rr.json();
      out.results = {
        configured: j.configured !== false,
        source: j.source || null,
        count: j.count || (j.matches ? j.matches.length : 0),
        played: j.played || 0,
        throttled: !!j.throttled,
        updatedAt: j.updatedAt || null,
      };
      const done = (j.matches || []).filter((m) => m.status === "FINISHED" || (m.score && m.score.home != null));
      done.sort((a, b) => new Date(b.utcDate || 0) - new Date(a.utcDate || 0));
      out.scoring = {
        matchesPlayed: j.played || done.length,
        recentMatches: done.slice(0, 16).map((m) => ({
          home: (m.home && (m.home.tla || m.home.name)) || "?",
          away: (m.away && (m.away.tla || m.away.name)) || "?",
          hs: m.score ? m.score.home : null,
          as: m.score ? m.score.away : null,
          stage: m.stage || null,
          utcDate: m.utcDate || null,
        })),
      };
    } else { out.results = { error: "HTTP " + rr.status }; }
  } catch (e) { out.results = { error: "unreachable" }; }

  // Player scoring — goals + assists are what drive Star XI points.
  try {
    const pr = await fetch(`${proto}://${host}/api/player-stats`);
    if (pr.ok) {
      const j = await pr.json();
      const stats = (j.stats || []).filter((s) => (s.goals || 0) + (s.assists || 0) > 0);
      stats.sort((a, b) => (b.goals || 0) - (a.goals || 0) || (b.assists || 0) - (a.assists || 0));
      out.players = {
        scorers: stats.length,
        top: stats.slice(0, 25).map((s) => ({ name: s.playerName || "?", tla: s.teamTla || "", goals: s.goals || 0, assists: s.assists || 0 })),
      };
    }
  } catch (e) {}

  return json(res, 200, out);
};
