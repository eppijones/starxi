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

  // Optional ?matchId= to scope to one match; otherwise we page through the
  // whole result set (a full matchday is far more than one 100-row page, so a
  // single fetch would silently drop most scorers).
  const url = new URL(req.url, "http://x");
  const matchId = url.searchParams.get("matchId");
  const baseParams = matchId ? `match_ids[]=${encodeURIComponent(matchId)}&per_page=100` : `per_page=100`;

  // Cursor pagination with hard caps so a runaway feed can't hang the function.
  const MAX_PAGES = 25;        // 25 × 100 = 2,500 rows — comfortably a full round
  const DEADLINE_MS = 8000;    // total upstream budget
  const startedAt = Date.now();

  try {
    const stats = [];
    let cursor = null;
    let pages = 0;
    let throttled = false;
    while (pages < MAX_PAGES && Date.now() - startedAt < DEADLINE_MS) {
      const qs = "?" + baseParams + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      const upstream = await fetch(`${BDL_BASE}/player_match_stats${qs}`, {
        headers: { Authorization: key },
      });
      if (upstream.status === 429) { throttled = true; break; } // return what we have so far
      if (!upstream.ok) {
        if (pages === 0) {
          res.statusCode = 200;
          return res.end(JSON.stringify({ configured: true, error: `upstream ${upstream.status}`, updatedAt: new Date().toISOString(), stats: [] }));
        }
        break; // partial page failed — serve what we collected
      }
      const data = await upstream.json();
      const rows = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      rows.forEach((r) => {
        stats.push({
          playerName: r.player_name || (r.player && (r.player.name || `${r.player.first_name || ""} ${r.player.last_name || ""}`.trim())) || null,
          teamTla: (r.team && (r.team.abbreviation || r.team.code)) || r.team_abbreviation || null,
          goals: numeric(r.goals),
          assists: numeric(r.assists),
          cleanSheet: !!(r.clean_sheet || r.clean_sheets),
          matchId: r.match_id || (r.match && r.match.id) || null,
          utcDate: (r.match && r.match.date) || r.date || null,
        });
      });
      pages++;
      cursor = (data.meta && (data.meta.next_cursor || data.meta.next_page)) || null;
      if (!cursor || rows.length === 0) break; // last page
    }

    res.statusCode = 200;
    return res.end(JSON.stringify({
      configured: true,
      throttled,
      truncated: pages >= MAX_PAGES, // signal if we hit the page cap
      updatedAt: new Date().toISOString(),
      count: stats.length,
      stats,
    }));
  } catch (err) {
    res.statusCode = 200;
    return res.end(JSON.stringify({ configured: true, error: String(err && err.message || err), updatedAt: new Date().toISOString(), stats: [] }));
  }
};

function numeric(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
