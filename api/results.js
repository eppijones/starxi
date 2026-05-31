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

// Tiny in-instance memo so warm invocations within the cache window don't refetch
// even before the edge cache kicks in. Keyed by nothing — single resource.
let MEMO = { at: 0, body: null };
const MEMO_TTL_MS = 25 * 1000;

module.exports = async (req, res) => {
  const token = process.env.FOOTBALL_DATA_TOKEN;

  // Edge-cache aggressively. With s-maxage=30 the upstream is hit at most ~2×/min
  // no matter how many fans load the page — well inside the 10 req/min free limit.
  res.setHeader("Cache-Control", "public, s-maxage=30, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!token) {
    // Not wired yet — respond cleanly so the client shows the pre-launch state
    // instead of erroring.
    res.statusCode = 200;
    return res.end(JSON.stringify({
      configured: false,
      updatedAt: new Date().toISOString(),
      matches: [],
      note: "Set FOOTBALL_DATA_TOKEN in the environment to enable live scoring.",
    }));
  }

  // Serve warm memo if fresh.
  if (MEMO.body && Date.now() - MEMO.at < MEMO_TTL_MS) {
    res.statusCode = 200;
    return res.end(MEMO.body);
  }

  try {
    const upstream = await fetch(`${FD_BASE}/competitions/${COMPETITION}/matches`, {
      headers: { "X-Auth-Token": token },
    });

    // Respect the rate limiter: football-data warns to watch these headers.
    const remaining = Number(upstream.headers.get("x-requests-available-minute"));

    if (upstream.status === 429) {
      // Throttled upstream — return last good memo if we have one, else a soft empty.
      res.statusCode = 200;
      const fallback = MEMO.body || JSON.stringify({
        configured: true, throttled: true, updatedAt: new Date().toISOString(), matches: [],
      });
      return res.end(fallback);
    }

    if (!upstream.ok) {
      res.statusCode = 200; // soft-fail: client falls back to its pre-launch view
      return res.end(JSON.stringify({
        configured: true, error: `upstream ${upstream.status}`,
        updatedAt: new Date().toISOString(), matches: [],
      }));
    }

    const data = await upstream.json();
    const matches = (data.matches || []).map(normaliseMatch);
    const played = matches.filter(m => m.status === "FINISHED").length;

    const body = JSON.stringify({
      configured: true,
      throttled: false,
      requestsRemainingThisMinute: Number.isFinite(remaining) ? remaining : null,
      updatedAt: new Date().toISOString(),
      season: data.filters && data.filters.season ? data.filters.season : (data.competition && data.competition.id),
      count: matches.length,
      played,
      matches,
    });

    MEMO = { at: Date.now(), body };
    res.statusCode = 200;
    return res.end(body);
  } catch (err) {
    res.statusCode = 200; // never hard-fail the page
    return res.end(JSON.stringify({
      configured: true, error: String(err && err.message || err),
      updatedAt: new Date().toISOString(), matches: [],
    }));
  }
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
