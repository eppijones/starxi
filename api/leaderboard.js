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
const { assembleLiveSim } = require("../festival/results-map");
const { tallyUser } = require("../festival/scoring-core");
const { teamToken } = require("./_lib/tokens");

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

// Pull a payload from one of our own /api routes (reuses its edge cache +
// rate-limit budget). Always resolves; null -> caller scores against nothing.
async function fetchApi(req, path) {
  try {
    const host = req.headers && req.headers.host;
    if (!host) return null;
    const proto = String(
      (req.headers && req.headers["x-forwarded-proto"]) || "https"
    ).split(",")[0];
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${proto}://${host}${path}`, {
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

// Rank ladder — two orthogonal dimensions the client selects via ?mode= & ?stage=:
//
//   mode:  "combined" (Star XI + Road) | "xionly" (Star XI only)
//   stage: "all" (whole tournament) | "group" | "knockout"
//
// The points BASIS a row is ranked (and shown) on is the (mode × stage) cell:
//                 group              knockout                 all
//   combined   groupPts           knockoutPts            xiPts+predictionPts
//   xionly     xiGroupPts         xiKnockoutPts          xiPts
//
// Ties always break on: 2) bullseyes  3) earliest submission. Submission order is
// surfaced to the client (tiebreak flag) so a level table never reads as arbitrary.
function rowBasis(r, mode, stage) {
  if (mode === "xionly") {
    if (stage === "group") return r.xiGroupPts;
    if (stage === "knockout") return r.xiKnockoutPts;
    return r.xiPts;
  }
  if (stage === "group") return r.groupPts;
  if (stage === "knockout") return r.knockoutPts;
  return r.xiPts + r.predictionPts;
}
function makeLadder(mode, stage) {
  return function (a, b) {
    const ba = rowBasis(a, mode, stage);
    const bb = rowBasis(b, mode, stage);
    if (bb !== ba) return bb - ba;
    if (b.bullseyes !== a.bullseyes) return b.bullseyes - a.bullseyes;
    return (a.submittedAt || 0) - (b.submittedAt || 0);
  };
}
// Keep old export name for unit tests (maps to combined / all).
function rankLadder(a, b) { return makeLadder("combined", "all")(a, b); }

function publicRow(r, uid, mode, stage) {
  const total = r.xiPts + r.predictionPts;
  return {
    rank: r.rank,
    name: r.name,
    token: teamToken(r.userId), // opaque handle to drill into this team (no uid leak)
    pts: rowBasis(r, mode, stage),
    total,
    predictionPts: r.predictionPts,
    xiPts: r.xiPts,
    xiGroupPts: r.xiGroupPts,
    xiKnockoutPts: r.xiKnockoutPts,
    groupPts: r.groupPts,
    knockoutPts: r.knockoutPts,
    nationBonus: r.nationBonus,
    bullseyes: r.bullseyes,
    isYou: r.userId === uid,
  };
}

// Build raw (unsorted) scored rows for a roster. Sorting happens at serve time
// so a single memo serves both `combined` and `xionly` requests.
async function computeRows(memberUids, req) {
  const keys = (memberUids || []).map(ENTRY);
  const raws = await kvMget(keys);
  const entries = [];
  raws.forEach((raw) => {
    const e = safeParse(raw);
    if (e) entries.push(e);
  });

  const data = loadGameData(); // { GROUPS, NATIONS, PLAYERS, FIXTURES }
  // Two live feeds, fetched in parallel: scorelines (football-data) drive the
  // bracket + clean sheets; player stats (balldontlie) drive goals/assists. Both
  // degrade to null → the assembler scores against whatever is available.
  const [resultsPayload, statsPayload] = await Promise.all([
    fetchApi(req, "/api/results"),
    fetchApi(req, "/api/player-stats"),
  ]);
  const sim = assembleLiveSim(resultsPayload, statsPayload, data);

  const rows = entries.map((e) => {
    const t = tallyUser(e, sim, data);
    return {
      userId: e.userId,
      name: (e.displayName && String(e.displayName)) || "Player",
      predictionPts: t.predictionPts,
      xiPts: t.xiPts,
      xiGroupPts: t.xiGroupPts,
      xiKnockoutPts: t.xiKnockoutPts,
      groupPts: t.groupPts,
      knockoutPts: t.knockoutPts,
      nationBonus: t.nationBonus,
      bullseyes: t.bullseyes,
      submittedAt: e.submittedAt || e.updatedAt || 0,
    };
  });
  // Rows are intentionally NOT sorted here — the caller applies mode/stage sorting.

  return {
    rows,
    meta: {
      played: sim.meta.played,
      live: sim.meta.live,
      updatedAt: sim.meta.updatedAt,
      resultsConfigured: sim.meta.configured,
    },
  };
}

function sortedRows(rows, mode, stage) {
  const sorted = rows.slice().sort(makeLadder(mode, stage));
  sorted.forEach((r, i) => { r.rank = i + 1; });
  return sorted;
}

module.exports = async (req, res) => {
  if (!kvConfigured()) {
    return json(res, 200, { ok: false, configured: false });
  }
  // The GLOBAL table is public — no sign-in needed (it's the shop window). Auth
  // is optional here: a signed-in caller also gets their own `you` row + isYou
  // flags; an anonymous caller just sees the ranked names. League scopes below
  // still require auth (they're private and members-only).
  const auth = await verifyRequest(req);
  const uid = auth ? auth.userId : null;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "method not allowed" });
  }

  const url = new URL(req.url, "http://x");
  const code = normalizeCode(url.searchParams.get("code"));
  let limit = parseInt(url.searchParams.get("limit"), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = 50;
  limit = Math.min(limit, 200);
  // `mode` selects the ranking spine. Combined (default) ranks by total points;
  // xionly ranks by Star XI points alone (ignores prediction bonus).
  let mode = url.searchParams.get("mode") === "xionly" ? "xionly" : "combined";
  // `stage` scopes the points window: the whole tournament (default), the group
  // stage only, or the knockouts only. The knockout board lets players who join
  // mid-tournament still compete on equal footing from the R32 onward.
  const stageParam = url.searchParams.get("stage");
  let stage = stageParam === "group" || stageParam === "knockout" ? stageParam : "all";

  // Resolve scope + roster.
  let scope, scopeName, leagueCode, memberUids, leagueRtfEnabled;
  if (code) {
    // Private league → must be signed in AND a member.
    if (!uid) return json(res, 401, { ok: false, error: "auth_required" });
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
    leagueRtfEnabled = meta.roadToFinalEnabled !== false;
    // If the league has disabled Road-to-Final scoring, force Star XI only ranking.
    if (!leagueRtfEnabled) mode = "xionly";
  } else {
    memberUids = (await kvSmembers(ROSTER)) || [];
    scope = "global";
    scopeName = "Global";
    leagueCode = null;
    leagueRtfEnabled = true;
  }

  // Serve a warm per-scope memo if fresh; otherwise recompute.
  // The memo caches raw (unsorted) rows so both modes share one expensive pass.
  const scopeKey = scope + ":" + (leagueCode || "");
  let cached = MEMO.get(scopeKey);
  if (!cached || Date.now() - cached.at > MEMO_TTL_MS) {
    const { rows, meta } = await computeRows(memberUids, req);
    cached = { at: Date.now(), rows, meta };
    MEMO.set(scopeKey, cached);
  }

  const { rows, meta } = cached;
  const ranked = sortedRows(rows, mode, stage);
  const top = ranked.slice(0, limit).map((r) => publicRow(r, uid, mode, stage));
  const mine = ranked.find((r) => r.userId === uid);
  const you = mine ? publicRow(mine, uid, mode, stage) : null;

  return json(res, 200, {
    ok: true,
    configured: true,
    scope,
    code: leagueCode,
    name: scopeName,
    mode,
    stage,
    leagueRtfEnabled,
    total: ranked.length,
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
