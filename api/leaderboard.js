// WORLD CUP XI — leaderboard (global + per-league), computed ON READ.
//
//   GET /api/leaderboard                 -> global ranking
//   GET /api/leaderboard?code=ABC23      -> private-league ranking (members only)
//   GET /api/leaderboard?limit=100       -> cap the returned top N (default 50, max 200)
//
// Why score on read (instead of trusting client-pushed scores)? Fairness. A
// player who locks in their entry and never opens the app again must still rank
// correctly as real results land — so the server re-scores every stored entry
// against the live feed each time, using the SAME scoring-core the browser uses.
//
// Ranking is fantasy-first: rows are ordered by Dream XI points (the headline
// `pts`), then the prediction bonus, then exact scorelines, then submit time. So
// a strong squad ranks on its own; predictions are the bonus that crowns the
// "ultimate champion". `total` = xiPts + predictionPts (the combined haul).
//
// Response:
//   { ok, configured, scope:"global"|"league", code, name, total, played, live,
//     updatedAt, resultsConfigured,
//     top:[ { rank, name, pts, total, predictionPts, xiPts, bullseyes, isYou } ],
//     you: { …same shape… } | null }   // `you` is included even when outside top N
//
// We never leak other players' userIds — only their chosen display name.

const { kvConfigured, kvGet, kvSmembers, kvMget } = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");
const { loadGameData } = require("./_lib/gamedata");
const { buildResultsMap } = require("../festival/results-map");
const { tallyUser } = require("../festival/scoring-core");

const ENTRY = (uid) => `wcxi:entry:${uid}`;
const ROSTER = "wcxi:players";
const LEAGUE_META = (code) => `wcxi:league:${code}`;
const LEAGUE_MEMBERS = (code) => `wcxi:league:${code}:m`;

// Per-scope memo so a crowd refreshing at once doesn't re-run the full
// (MGET-every-entry + score-everyone) pass more than ~3×/min. We cache the
// fully-ranked rows (with userIds) and derive each caller's view cheaply.
const MEMO = new Map(); // scopeKey -> { at, rows, meta }
const MEMO_TTL_MS = 20 * 1000;

function json(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}
function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}
function normalizeCode(c) {
  return String(c || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}

// Pull the live-results payload from our own /api/results (reuses its edge cache
// + rate-limit budget). Always resolves; null -> we score against zero results.
async function fetchResultsPayload(req) {
  try {
    const host = req.headers && req.headers.host;
    if (!host) return null;
    const proto = String(
      (req.headers && req.headers["x-forwarded-proto"]) || "https"
    ).split(",")[0];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${proto}://${host}/api/results`, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    clearTimeout(t);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

// Rank ladder — fantasy first. The league is built on the Dream XI: a great
// squad alone keeps you in the fight, predictions or not. Score predictions are
// the bonus that separates tied XIs and crowns the "ultimate champion".
//   1) Dream XI points  2) prediction bonus  3) exact scorelines (bullseyes)
//   4) earliest submission — the deterministic tiebreaker that always terminates.
function rankLadder(a, b) {
  if (b.xiPts !== a.xiPts) return b.xiPts - a.xiPts;
  if (b.predictionPts !== a.predictionPts) return b.predictionPts - a.predictionPts;
  if (b.bullseyes !== a.bullseyes) return b.bullseyes - a.bullseyes;
  return (a.submittedAt || 0) - (b.submittedAt || 0);
}

function publicRow(r, uid) {
  return {
    rank: r.rank,
    name: r.name,
    pts: r.pts,
    total: r.total,
    predictionPts: r.predictionPts,
    xiPts: r.xiPts,
    bullseyes: r.bullseyes,
    isYou: r.userId === uid,
  };
}

// Build the ranked rows for a roster (list of userIds). Heavy path: one MGET
// for all entries + score each against the live sim. Cached by the caller.
async function computeRows(memberUids, req) {
  const keys = (memberUids || []).map(ENTRY);
  const raws = await kvMget(keys);
  const entries = [];
  raws.forEach((raw) => {
    const e = safeParse(raw);
    if (e) entries.push(e);
  });

  const { FIXTURES, PLAYERS } = loadGameData();
  const payload = await fetchResultsPayload(req);
  const mapped = buildResultsMap(payload, FIXTURES);
  // playerEvents (Dream XI per-player stats) arrive when balldontlie is wired;
  // until then XI points are 0 for everyone, so the prediction bonus + submit
  // time order the table (and the headline `pts` reads 0 — honest pre-data).
  const sim = { results: mapped.results, playerEvents: {} };
  const data = { FIXTURES, PLAYERS };

  const rows = entries.map((e) => {
    const t = tallyUser(e, sim, data);
    return {
      userId: e.userId,
      name: (e.displayName && String(e.displayName)) || "Player",
      // Headline = Dream XI (fantasy) points: the league's ranking spine. The
      // prediction bonus is surfaced separately and breaks ties between XIs.
      pts: t.xiPts,
      total: t.total,
      predictionPts: t.predictionPts,
      xiPts: t.xiPts,
      bullseyes: t.bullseyes,
      submittedAt: e.submittedAt || e.updatedAt || 0,
    };
  });
  rows.sort(rankLadder);
  rows.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    rows,
    meta: {
      played: mapped.played,
      live: mapped.live,
      updatedAt: mapped.updatedAt,
      resultsConfigured: mapped.configured,
    },
  };
}

module.exports = async (req, res) => {
  if (!kvConfigured()) {
    return json(res, 200, { ok: false, configured: false });
  }
  const auth = await verifyRequest(req);
  if (!auth) return json(res, 401, { error: "unauthorized" });
  const uid = auth.userId;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "method not allowed" });
  }

  const url = new URL(req.url, "http://x");
  const code = normalizeCode(url.searchParams.get("code"));
  let limit = parseInt(url.searchParams.get("limit"), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  limit = Math.min(limit, 200);

  // Resolve scope + roster.
  let scope, scopeName, leagueCode, memberUids;
  if (code) {
    const meta = safeParse(await kvGet(LEAGUE_META(code)));
    if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
    memberUids = (await kvSmembers(LEAGUE_MEMBERS(code))) || [];
    // Private leagues: only members can see the table.
    if (!memberUids.includes(uid)) {
      return json(res, 403, { ok: false, error: "not_a_member" });
    }
    scope = "league";
    scopeName = meta.name;
    leagueCode = code;
  } else {
    memberUids = (await kvSmembers(ROSTER)) || [];
    scope = "global";
    scopeName = "Global";
    leagueCode = null;
  }

  // Serve a warm per-scope memo if fresh; otherwise recompute.
  const scopeKey = scope + ":" + (leagueCode || "");
  let cached = MEMO.get(scopeKey);
  if (!cached || Date.now() - cached.at > MEMO_TTL_MS) {
    const { rows, meta } = await computeRows(memberUids, req);
    cached = { at: Date.now(), rows, meta };
    MEMO.set(scopeKey, cached);
  }

  const { rows, meta } = cached;
  const top = rows.slice(0, limit).map((r) => publicRow(r, uid));
  const mine = rows.find((r) => r.userId === uid);
  const you = mine ? publicRow(mine, uid) : null;

  return json(res, 200, {
    ok: true,
    configured: true,
    scope,
    code: leagueCode,
    name: scopeName,
    total: rows.length,
    played: meta.played,
    live: meta.live,
    updatedAt: meta.updatedAt,
    resultsConfigured: meta.resultsConfigured,
    top,
    you,
  });
};

// Exposed for unit tests.
module.exports.rankLadder = rankLadder;
module.exports.normalizeCode = normalizeCode;
