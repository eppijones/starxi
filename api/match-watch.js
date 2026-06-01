// MATCH-WATCH (temporary) — Norway vs Sweden friendly live probe.
// Primary: ESPN public API (friendlies). Fallback: football-data.org when listed.
// Remove when the friendly test is done.

const { fetchEspnNorSwe } = require("./_lib/espn-live");

const FD_BASE = "https://api.football-data.org/v4";
const HOME_TLA = "NOR";
const AWAY_TLA = "SWE";

let MEMO = { at: 0, body: null };
const MEMO_TTL_MS = 15 * 1000;

module.exports = async (req, res) => {
  const token = process.env.FOOTBALL_DATA_TOKEN;

  res.setHeader("Cache-Control", "public, s-maxage=15, stale-while-revalidate=45");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (MEMO.body && Date.now() - MEMO.at < MEMO_TTL_MS) {
    res.statusCode = 200;
    return res.end(MEMO.body);
  }

  const url = new URL(req.url, "http://x");
  const matchId = url.searchParams.get("matchId");
  const date =
    url.searchParams.get("date") ||
    new Date().toISOString().slice(0, 10);

  try {
    // 1) ESPN — covers this friendly on the free tier
    const espn = await fetchEspnNorSwe(date);
    if (espn && espn.match) {
      const body = JSON.stringify({
        configured: true,
        source: "espn",
        updatedAt: new Date().toISOString(),
        date,
        match: espn.match,
        goals: espn.goals,
        note: null,
      });
      MEMO = { at: Date.now(), body };
      res.statusCode = 200;
      return res.end(body);
    }

    // 2) football-data (when token set and match is listed)
    if (token) {
      let match = null;
      if (matchId) {
        match = await fetchMatchDetail(token, matchId);
      } else {
        const list = await fetchMatchesOnDate(token, date);
        match =
          list.find(isNorSwe) ||
          (await findNorSweNearDate(token, date));
        if (match && match.id) {
          match = await fetchMatchDetail(token, match.id);
        }
      }
      if (match) {
        const goals = extractGoals(match);
        const body = JSON.stringify({
          configured: true,
          source: "football-data",
          updatedAt: new Date().toISOString(),
          date,
          requestsRemainingThisMinute: match._remaining ?? null,
          match: normaliseMatch(match),
          goals,
        });
        MEMO = { at: Date.now(), body };
        res.statusCode = 200;
        return res.end(body);
      }
    }

    const body = JSON.stringify({
      configured: true,
      source: null,
      updatedAt: new Date().toISOString(),
      date,
      match: null,
      goals: [],
      note: `No ${HOME_TLA} vs ${AWAY_TLA} on ESPN or football-data for ${date}.`,
    });
    MEMO = { at: Date.now(), body };
    res.statusCode = 200;
    return res.end(body);
  } catch (err) {
    res.statusCode = 200;
    return res.end(JSON.stringify({
      configured: !!token,
      error: String(err && err.message || err),
      updatedAt: new Date().toISOString(),
      match: null,
      goals: [],
    }));
  }
};

function isNorSwe(m) {
  const h = m.homeTeam || {};
  const a = m.awayTeam || {};
  const ht = h.tla;
  const at = a.tla;
  if (
    (ht === HOME_TLA && at === AWAY_TLA) ||
    (ht === AWAY_TLA && at === HOME_TLA)
  ) {
    return true;
  }
  const hn = String(h.name || "").toLowerCase();
  const an = String(a.name || "").toLowerCase();
  return (
    (hn.includes("norway") && an.includes("sweden")) ||
    (hn.includes("sweden") && an.includes("norway"))
  );
}

async function fdFetch(token, path) {
  const upstream = await fetch(`${FD_BASE}${path}`, {
    headers: { "X-Auth-Token": token },
  });
  const remaining = Number(upstream.headers.get("x-requests-available-minute"));
  if (upstream.status === 429) {
    const err = new Error("upstream throttled");
    err.throttled = true;
    throw err;
  }
  if (!upstream.ok) {
    const err = new Error(`upstream ${upstream.status}`);
    err.status = upstream.status;
    throw err;
  }
  const data = await upstream.json();
  data._remaining = remaining;
  return data;
}

async function fetchMatchesOnDate(token, date) {
  const data = await fdFetch(
    token,
    `/matches?dateFrom=${date}&dateTo=${date}&limit=50`
  );
  return data.matches || [];
}

async function findNorSweNearDate(token, date) {
  const d = new Date(date + "T12:00:00Z");
  for (const offset of [-1, 1]) {
    const next = new Date(d);
    next.setUTCDate(next.getUTCDate() + offset);
    const ds = next.toISOString().slice(0, 10);
    const list = await fetchMatchesOnDate(token, ds);
    const hit = list.find(isNorSwe);
    if (hit) return hit;
  }
  return null;
}

async function fetchMatchDetail(token, id) {
  return fdFetch(token, `/matches/${id}`);
}

function extractGoals(m) {
  const raw = m.goals || [];
  return raw
    .filter((g) => g.type === "REGULAR" || g.type === "PENALTY")
    .map((g) => ({
      minute: g.minute,
      injuryTime: g.injuryTime,
      type: g.type,
      teamTla: g.team && g.team.tla,
      teamName: g.team && g.team.name,
      scorer: g.scorer && g.scorer.name,
      assist: g.assist && g.assist.name,
      score: g.score || null,
    }));
}

function normaliseMatch(m) {
  const s = m.score || {};
  const ft = s.fullTime || s.regularTime || {};
  const ht = s.halfTime || {};
  return {
    id: m.id,
    utcDate: m.utcDate,
    status: m.status,
    minute: m.minute,
    injuryTime: m.injuryTime,
    lastUpdated: m.lastUpdated,
    competition: m.competition && m.competition.name,
    stage: m.stage,
    home: {
      tla: m.homeTeam && m.homeTeam.tla,
      name: m.homeTeam && m.homeTeam.name,
    },
    away: {
      tla: m.awayTeam && m.awayTeam.tla,
      name: m.awayTeam && m.awayTeam.name,
    },
    score: {
      home: ft.home != null ? ft.home : null,
      away: ft.away != null ? ft.away : null,
      halfHome: ht.home != null ? ht.home : null,
      halfAway: ht.away != null ? ht.away : null,
      winner: s.winner || null,
      duration: s.duration || null,
    },
  };
}
