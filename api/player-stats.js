// WORLD CUP XI — player match stats proxy (Dream XI layer). SCAFFOLD.
//
// football-data.org's FREE tier does NOT expose goalscorers / assists / lineups
// (verified: the match `goals[]`, `bookings[]`, `substitutions[]` arrays are
// absent even on finished matches). The Dream XI layer needs per-player events,
// so it is powered by a separate source: balldontlie's FIFA World Cup API,
// which has GET /player_match_stats (goals, assists, shots, GK stats).
//
// To enable, create a free key at https://balldontlie.io and set:
//   BALLDONTLIE_KEY = <your key>
//
// Until that env var is present this returns { configured:false } and the app
// keeps the Dream XI layer in its pre-launch state — nothing breaks.
//
// Response (when configured):
//   { configured:true, updatedAt, stats: [ { playerName, teamTla, goals, assists,
//     cleanSheet, matchId, utcDate } ] }
// The client maps playerName/teamTla onto window.PLAYERS to build the
// `playerEvents` map that window.tallyUser() already consumes.

const BDL_BASE = "https://api.balldontlie.io/fifa/worldcup/v1";

module.exports = async (req, res) => {
  const key = process.env.BALLDONTLIE_KEY;

  res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (!key) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      configured: false,
      updatedAt: new Date().toISOString(),
      stats: [],
      note: "Set BALLDONTLIE_KEY to enable Dream XI player scoring (goals/assists/clean sheets).",
    }));
  }

  // Optional ?matchId= to scope to one match; otherwise the caller can page.
  const url = new URL(req.url, "http://x");
  const matchId = url.searchParams.get("matchId");
  const qs = matchId ? `?match_ids[]=${encodeURIComponent(matchId)}&per_page=100` : `?per_page=100`;

  try {
    const upstream = await fetch(`${BDL_BASE}/player_match_stats${qs}`, {
      headers: { Authorization: key },
    });

    if (upstream.status === 429) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ configured: true, throttled: true, updatedAt: new Date().toISOString(), stats: [] }));
    }
    if (!upstream.ok) {
      res.statusCode = 200;
      return res.end(JSON.stringify({ configured: true, error: `upstream ${upstream.status}`, updatedAt: new Date().toISOString(), stats: [] }));
    }

    const data = await upstream.json();
    // balldontlie wraps rows in { data: [...] }. Field names are normalised
    // defensively since the exact schema is finalised closer to kickoff.
    const rows = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
    const stats = rows.map((r) => ({
      playerName: r.player_name || (r.player && (r.player.name || `${r.player.first_name || ""} ${r.player.last_name || ""}`.trim())) || null,
      teamTla: (r.team && (r.team.abbreviation || r.team.code)) || r.team_abbreviation || null,
      goals: numeric(r.goals),
      assists: numeric(r.assists),
      cleanSheet: !!(r.clean_sheet || r.clean_sheets),
      matchId: r.match_id || (r.match && r.match.id) || null,
      utcDate: (r.match && r.match.date) || r.date || null,
    }));

    res.statusCode = 200;
    return res.end(JSON.stringify({ configured: true, updatedAt: new Date().toISOString(), count: stats.length, stats }));
  } catch (err) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ configured: true, error: String(err && err.message || err), updatedAt: new Date().toISOString(), stats: [] }));
  }
};

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
