// WORLD CUP XI — ESPN public World Cup stats source (goals + assists).
//
// football-data.org's free tier gives scorelines but NOT goalscorers/assists,
// and balldontlie gates player_match_stats behind a paid plan. ESPN's public
// `fifa.world` API exposes both for free, no key — the same source the NOR–SWE
// match-watch probe used. Goals live in each match summary's `keyEvents[]`, with
// the scorer + assist embedded in the human-readable `text` (athletesInvolved is
// empty), so we text-parse — exactly like espn-live.js already does.
//
// Output shape matches what results-map.js → mapPlayerStats() consumes:
//   { configured, stats: [ { playerName, teamTla, goals, assists, utcDate } ] }
//
// Caching: finished matches' goal lists never change, so they're memoised for the
// life of the warm lambda; only in-play matches are re-fetched. The scoreboard
// list (one ranged call for the whole tournament) is memoised for 60s.

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
// 2026 tournament window (Jun 11 – Jul 19). Overridable for testing past cups.
const WC_FROM = "20260611";
const WC_TO = "20260719";

let SB_CACHE = { at: 0, key: "", events: [] };
const EVENT_CACHE = new Map(); // eventId -> { state, rows }
const SB_TTL_MS = 60 * 1000;
const CONCURRENCY = 8;
const DEADLINE_MS = 7500;

async function fetchJson(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Pull scorer + assist out of an ESPN goal `text`, e.g.
//   "Goal!  Argentina 2, France 0. Ángel Di María (Argentina) left footed shot
//    ... Assisted by Alexis Mac Allister  following a fast break."
function parseGoal(text) {
  const s = String(text || "");
  // scorer = the name after the "…, X 0. " score sentence, up to " (Team)".
  const scorerM = /\d\.\s+(.+?)\s+\(/.exec(s);
  const scorer = scorerM ? scorerM[1].trim() : null;
  // assist = after "Assisted by", stopping at a clause boundary or sentence end.
  const assistM = /Assisted by\s+(.+?)(?:\s+following\b|\s+after\b|\s+with\b|\s+from\b|\.|$)/i.exec(s);
  const assist = assistM ? assistM[1].trim() : null;
  return { scorer, assist };
}

function isGoalEvent(e) {
  const t = ((e.type && (e.type.type || e.type.text)) || "").toLowerCase();
  const text = String(e.text || "");
  if (/own/.test(t) || /own goal/i.test(text)) return false; // don't credit own goals
  return /goal/.test(t) || /^goal!/i.test(text);
}

// One match summary -> [{ teamTla, playerName, goals, assists }] rows.
// `leaguePath` defaults to the World Cup; a TEST event can point at e.g.
// "fifa.friendly" so a pre-tournament friendly can be scored as a dress rehearsal.
async function summaryRows(eventId, utcDate, leaguePath) {
  const base = leaguePath
    ? `https://site.api.espn.com/apis/site/v2/sports/soccer/${leaguePath}`
    : ESPN_BASE;
  const j = await fetchJson(`${base}/summary?event=${encodeURIComponent(eventId)}`);
  if (!j) return [];
  // team id -> abbreviation, from the header competitors.
  const comps = (((j.header || {}).competitions || [])[0] || {}).competitors || [];
  const tlaById = {};
  comps.forEach((c) => { if (c.team && c.team.id) tlaById[c.team.id] = c.team.abbreviation; });

  const rows = [];
  (j.keyEvents || []).forEach((e) => {
    if (!isGoalEvent(e)) return;
    const teamTla = (e.team && (e.team.abbreviation || tlaById[e.team.id])) || null;
    const { scorer, assist } = parseGoal(e.text);
    if (scorer) rows.push({ teamTla, playerName: scorer, goals: 1, assists: 0, utcDate });
    if (assist) rows.push({ teamTla, playerName: assist, goals: 0, assists: 1, utcDate });
  });
  return rows;
}

// Run async tasks with a small concurrency cap and an overall wall-clock budget.
async function pooled(items, fn, started) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < items.length && Date.now() - started < DEADLINE_MS) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

// Aggregate goals/assists across every played WC match into mapPlayerStats rows.
async function worldCupStats(opts) {
  opts = opts || {};
  const from = opts.from || WC_FROM;
  const to = opts.to || WC_TO;
  const started = Date.now();

  // 1. Scoreboard list for the whole window (memoised 60s).
  const key = from + "-" + to;
  if (!SB_CACHE.events.length || SB_CACHE.key !== key || Date.now() - SB_CACHE.at > SB_TTL_MS) {
    const sb = await fetchJson(`${ESPN_BASE}/scoreboard?dates=${from}-${to}&limit=200`);
    const events = ((sb && sb.events) || []).map((e) => ({
      id: e.id,
      date: e.date,
      state: (e.status && e.status.type && e.status.type.state) || "pre", // pre | in | post
    }));
    SB_CACHE = { at: Date.now(), key, events };
  }

  // 2. Pull goal rows for every started match (post = cached forever; in = fresh).
  const playable = SB_CACHE.events.filter((e) => e.state !== "pre");
  const perMatch = await pooled(playable, async (e) => {
    const cached = EVENT_CACHE.get(e.id);
    if (cached && cached.state === "post") return cached.rows;
    const rows = await summaryRows(e.id, e.date);
    EVENT_CACHE.set(e.id, { state: e.state, rows });
    return rows;
  }, started);

  const stats = [];
  perMatch.forEach((rows) => { if (Array.isArray(rows)) stats.push(...rows); });

  // ——— TEMPORARY: pre-tournament dress-rehearsal injection ———
  // When STARXI_TEST_EVENTS is set (e.g. "fifa.friendly/401866598"), also score
  // those non-WC matches, re-dating their goals to STARXI_TEST_MAPDATE (a real WC
  // matchday, default the Jun 11 opener = MD1) so the leaderboard's day→matchday
  // map picks them up. Purely additive + env-gated: unset the var and the real WC
  // pipeline is untouched. REMOVE after testing.
  let test = false;
  const testSpec = process.env.STARXI_TEST_EVENTS;
  if (testSpec) {
    test = true;
    const mapDate = process.env.STARXI_TEST_MAPDATE || "2026-06-11T19:00:00Z";
    const specs = testSpec.split(",").map((s) => s.trim()).filter(Boolean);
    const testRows = await pooled(specs, async (spec) => {
      const [league, id] = spec.split("/");
      if (!id) return [];
      return summaryRows(id, mapDate, league); // never cached — small + we want it live
    }, started);
    testRows.forEach((rows) => { if (Array.isArray(rows)) stats.push(...rows); });
  }

  return {
    configured: true,
    source: "espn",
    test,
    updatedAt: new Date().toISOString(),
    played: playable.filter((e) => e.state === "post").length,
    count: stats.length,
    stats,
  };
}

// ——— Fixtures + scores from ESPN, normalised to the football-data shape ———
// football-data's free tier rate-limits Vercel's shared IPs (returns 0 matches),
// so /api/results falls back to ESPN's fifa.world scoreboard. ESPN gives teams,
// scores, status and the stage (season.slug); we recover group + matchday by
// matching the team pair to our own FIXTURES. Output is a drop-in for everything
// downstream (buildResultsMap / deriveActualBracket / Match Centre).
const ESPN_STAGE = {
  "group-stage": "GROUP_STAGE", "round-of-32": "LAST_32", "round-of-16": "LAST_16",
  "quarterfinals": "QUARTER_FINALS", "semifinals": "SEMI_FINALS", "3rd-place-match": "THIRD_PLACE", "final": "FINAL",
};
const ESPN_STATE = { pre: "TIMED", in: "IN_PLAY", post: "FINISHED" };
const TLA_TO_FD = { URU: "URY" }; // football-data convention the pipeline expects
const ourCodeFromTla = (t) => (t === "URY" ? "URU" : t);

async function worldCupResults(FIXTURES) {
  const sb = await fetchJson(`${ESPN_BASE}/scoreboard?dates=${WC_FROM}-${WC_TO}&limit=300`, 8000);
  if (!sb || !Array.isArray(sb.events) || !sb.events.length) return null;

  const byPair = new Map();
  (FIXTURES || []).forEach((f) => byPair.set([f.home.code, f.away.code].sort().join("-"), f));

  let played = 0;
  const matches = sb.events.map((e) => {
    const c = (e.competitions || [])[0] || {};
    const state = (c.status && c.status.type && c.status.type.state) || "pre";
    const status = ESPN_STATE[state] || "TIMED";
    const comp = c.competitors || [];
    const H = comp.find((x) => x.homeAway === "home") || comp[0] || {};
    const A = comp.find((x) => x.homeAway === "away") || comp[1] || {};
    const htla = (H.team && H.team.abbreviation) || null;
    const atla = (A.team && A.team.abbreviation) || null;
    const fd = (t) => (t ? (TLA_TO_FD[t] || t) : null);
    const stage = ESPN_STAGE[e.season && e.season.slug] || "GROUP_STAGE";

    let group = null, matchday = null;
    if (stage === "GROUP_STAGE" && htla && atla) {
      const f = byPair.get([ourCodeFromTla(htla), ourCodeFromTla(atla)].sort().join("-"));
      if (f) { group = f.group; matchday = f.matchday; }
    }
    const scored = state === "in" || state === "post";
    const hs = scored ? parseInt(H.score, 10) : null;
    const as = scored ? parseInt(A.score, 10) : null;
    if (status === "FINISHED") played++;
    const winner = H.winner ? "HOME_TEAM" : A.winner ? "AWAY_TEAM" : (state === "post" ? "DRAW" : null);
    return {
      id: e.id, utcDate: e.date, status, stage, group, matchday,
      home: { tla: fd(htla), name: (H.team && H.team.displayName) || null },
      away: { tla: fd(atla), name: (A.team && A.team.displayName) || null },
      score: { home: Number.isFinite(hs) ? hs : null, away: Number.isFinite(as) ? as : null, winner, duration: "REGULAR" },
    };
  });
  return { configured: true, source: "espn", throttled: false, updatedAt: new Date().toISOString(), count: matches.length, played, matches };
}

module.exports = { worldCupStats, worldCupResults, parseGoal, summaryRows, ESPN_BASE };
