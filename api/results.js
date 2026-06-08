// WORLD CUP XI — live results proxy (prediction layer).
//
// Why this exists: the football-data.org API token is a SECRET and the API only
// allows CORS from http://localhost, so the browser can never call it directly.
// This serverless function holds the token server-side (env var), fetches the
// real FIFA World Cup 2026 schedule + scores, normalises them to a compact shape,
// and is cached at Vercel's edge so we stay far under the free tier's 10 req/min.
//
// Env var required (set in Vercel → Project → Settings → Environment Variables):
//   FOOTBALL_DATA_TOKEN = <your football-data.org API token>
//
// Response shape:
//   { configured, updatedAt, season, count, played, throttled, matches: [
//       { id, utcDate, status, stage, group, matchday,
//         home:{tla,name}, away:{tla,name},
//         score:{ home, away, winner, duration } } ] }

const FD_BASE = "https://api.football-data.org/v4";
const COMPETITION = "WC"; // FIFA World Cup

const { loadGameData } = require("./_lib/gamedata");
const { worldCupResults } = require("./_lib/espn-wc");

// Tiny in-instance memo so warm invocations within the cache window don't refetch.
// We only ever cache a NON-EMPTY body, so a transient empty/throttled upstream can
// never poison the cache and blank out the fixtures.
let MEMO = { at: 0, body: null };
const MEMO_TTL_MS = 25 * 1000;

// ESPN fallback — football-data's free tier rate-limits Vercel's shared IPs and
// returns 0 matches, so whenever football-data comes back empty we source the full
// fixture list + scores from ESPN's fifa.world scoreboard (same normalised shape).
async function espnBody() {
  try {
    const { FIXTURES } = loadGameData();
    const r = await worldCupResults(FIXTURES);
    if (r && r.matches && r.matches.length) return JSON.stringify(r);
  } catch (e) {}
  return null;
}

module.exports = async (req, res) => {
  const token = process.env.FOOTBALL_DATA_TOKEN;
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  // Serve warm (non-empty) memo if fresh.
  if (MEMO.body && Date.now() - MEMO.at < MEMO_TTL_MS) {
    res.statusCode = 200;
    return res.end(MEMO.body);
  }

  // 1) Try football-data (cleanest native group/matchday/stage when it works).
  if (token) {
    try {
      const upstream = await fetch(`${FD_BASE}/competitions/${COMPETITION}/matches`, {
        headers: { "X-Auth-Token": token },
      });
      if (upstream.ok) {
        const data = await upstream.json();
        const matches = (data.matches || []).map(normaliseMatch);
        if (matches.length > 0) {
          const remaining = Number(upstream.headers.get("x-requests-available-minute"));
          const body = JSON.stringify({
            configured: true, source: "football-data", throttled: false,
            requestsRemainingThisMinute: Number.isFinite(remaining) ? remaining : null,
            updatedAt: new Date().toISOString(),
            count: matches.length, played: matches.filter((m) => m.status === "FINISHED").length,
            matches,
          });
          MEMO = { at: Date.now(), body };
          res.statusCode = 200;
          return res.end(body);
        }
        // football-data returned 0 (Vercel IP rate-limited) → fall through to ESPN.
      }
    } catch (e) { /* fall through to ESPN */ }
  }

  // 2) ESPN fallback — the reliable source from Vercel.
  const espn = await espnBody();
  if (espn) {
    MEMO = { at: Date.now(), body: espn };
    res.statusCode = 200;
    return res.end(espn);
  }

  // 3) Both unavailable — soft empty (client shows the pre-launch view). Not cached.
  res.statusCode = 200;
  return res.end(JSON.stringify({
    configured: !!token, source: null, updatedAt: new Date().toISOString(), matches: [],
    note: "Live results temporarily unavailable.",
  }));
};

function normaliseMatch(m) {
  const s = m.score || {};
  const ft = s.fullTime || {};
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,                       // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | ...
    stage: m.stage,                         // GROUP_STAGE | LAST_16 | ...
    group: m.group ? String(m.group).replace("GROUP_", "") : null,
    matchday: m.matchday,
    home: { tla: m.homeTeam && m.homeTeam.tla, name: m.homeTeam && m.homeTeam.name },
    away: { tla: m.awayTeam && m.awayTeam.tla, name: m.awayTeam && m.awayTeam.name },
    score: {
      home: ft.home != null ? ft.home : null,
      away: ft.away != null ? ft.away : null,
      winner: s.winner || null,
      duration: s.duration || null,
    },
  };
}
