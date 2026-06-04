// WORLD CUP XI — player match stats (Dream XI layer): goals + assists.
//
// Source: ESPN's public `fifa.world` API (free, no key) — the only feed we found
// that exposes goalscorers AND assists for the World Cup at no cost. (football-
// data.org's free tier omits them; balldontlie gates player_match_stats behind a
// paid plan.) The heavy lifting + caching lives in _lib/espn-wc.js; this is just
// the HTTP surface, returning the shape results-map.js → mapPlayerStats expects:
//   { configured, source, updatedAt, count, played, stats:[
//       { playerName, teamTla, goals, assists, utcDate } ] }
//
// Clean sheets are NOT sourced here — the leaderboard derives those from the
// football-data scorelines (opponent kept to 0). This feed is goals + assists.
//
// Query params (testing): ?from=YYYYMMDD&to=YYYYMMDD to scope the date window
// (defaults to the 2026 tournament). Lets us validate against past World Cups.

const { worldCupStats } = require("./_lib/espn-wc");

// In-instance memo so a burst of leaderboard recomputes shares one upstream pass.
let MEMO = { at: 0, key: "", body: null };
const MEMO_TTL_MS = 60 * 1000;

module.exports = async (req, res) => {
  // ESPN data updates within a match; cache at the edge for 2 min, serve stale
  // while revalidating, so we stay light on ESPN no matter the crowd size.
  res.setHeader("Cache-Control", "public, s-maxage=120, stale-while-revalidate=600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const url = new URL(req.url, "http://x");
  const from = (url.searchParams.get("from") || "").replace(/[^0-9]/g, "") || undefined;
  const to = (url.searchParams.get("to") || "").replace(/[^0-9]/g, "") || undefined;
  const key = (from || "") + ":" + (to || "");

  if (MEMO.body && MEMO.key === key && Date.now() - MEMO.at < MEMO_TTL_MS) {
    res.statusCode = 200;
    return res.end(MEMO.body);
  }

  try {
    const result = await worldCupStats({ from, to });
    const body = JSON.stringify(result);
    MEMO = { at: Date.now(), key, body };
    res.statusCode = 200;
    return res.end(body);
  } catch (err) {
    // Never hard-fail: the leaderboard degrades to clean-sheet + bracket scoring.
    res.statusCode = 200;
    return res.end(JSON.stringify({
      configured: true,
      source: "espn",
      error: String((err && err.message) || err),
      updatedAt: new Date().toISOString(),
      stats: [],
    }));
  }
};
