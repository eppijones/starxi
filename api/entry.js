// WORLD CUP XI — per-player entry persistence (the "write side").
//
//   GET  /api/entry           -> { configured, entry|null }
//   POST /api/entry {entry,…}  -> { ok, locked, entry }
//
// Auth: `Authorization: Bearer <clerk session jwt>` (verified server-side, so a
// player can only ever touch their OWN entry). When the request is unauthenticated
// we return 401; when storage isn't provisioned yet we return { configured:false }
// so the client silently falls back to its localStorage-only experience.
//
// Storage keys (Upstash Redis / Vercel KV):
//   wcxi:entry:<userId>  -> JSON entry record
//   wcxi:players         -> SET of userIds that have an entry (leaderboard roster)
//
// Kickoff lock: before KICKOFF the whole entry is editable. At/after KICKOFF the
// prediction CORE (nation, bracket, picks, formation) freezes; only the
// in-tournament tactical fields (captain, captainPlus, captainByMd, swaps) may
// still change.
//
// Late entries: a player CAN still join after kickoff (the World Cup is when
// interest peaks). A brand-new entry created post-kickoff is flagged
// { lateEntry:true, joinedAt } and its core is frozen the moment it's saved
// (you get one shot to set your XI + bracket, same as everyone else). Late
// joiners compete on the KNOCKOUT-STAGE leaderboard, which scores only from the
// Round of 32 onward — so joining during the group stage costs you nothing there.

const { kvConfigured, kvGet, kvSet, kvSadd } = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");

// Group A opener, Mexico City — must match KICKOFF in festival/app.jsx.
const KICKOFF_MS = Date.parse("2026-06-11T16:00:00Z");
const KEY = (uid) => `wcxi:entry:${uid}`;
const ROSTER = "wcxi:players";

// Per-round prediction lock times (UTC, from the 2026 schedule). A LATE entry
// (created after kickoff) cannot back-fill a prediction for a round that has
// already started — those predictions are cleared on save, so a mid-tournament
// joiner can't "call" results that already happened. They CAN still predict
// rounds that haven't kicked off yet. Group standings + Lucky-8 lock at kickoff.
const ROUND_LOCK_MS = {
  r32: Date.parse("2026-06-28T00:00:00Z"),
  r16: Date.parse("2026-07-04T00:00:00Z"),
  qf: Date.parse("2026-07-09T00:00:00Z"),
  sf: Date.parse("2026-07-14T00:00:00Z"),
  final: Date.parse("2026-07-18T00:00:00Z"),
};

// Clear the parts of a late joiner's bracket whose round has already started, so
// they only score predictions for rounds still ahead of them. Pure: returns a
// new bracket; never mutates the input.
function gateLateBracket(bracket, now) {
  const b = bracket && typeof bracket === "object" ? bracket : {};
  const adv = (b.advances && typeof b.advances === "object") ? b.advances : {};
  const out = {
    // Group standings + the Lucky 8 settle during the group stage → cleared once
    // the tournament is under way (a late joiner can't call group tables).
    groups: now >= KICKOFF_MS ? {} : (b.groups || {}),
    lucky3rds: now >= KICKOFF_MS ? [] : (Array.isArray(b.lucky3rds) ? b.lucky3rds : []),
    advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} },
  };
  ["r32", "r16", "qf", "sf", "final"].forEach((round) => {
    const started = now >= ROUND_LOCK_MS[round];
    out.advances[round] = started ? {} : (adv[round] && typeof adv[round] === "object" ? adv[round] : {});
  });
  return out;
}

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

// Whitelist + shape the incoming entry; never trust the client blindly.
// `bracket` is the new Road-to-the-Final pick set; we shape it tightly so the
// stored record can't be padded with junk keys.
function sanitizeBracket(b) {
  if (!b || typeof b !== "object") {
    return { groups: {}, lucky3rds: [], advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} } };
  }
  const groups = {};
  if (b.groups && typeof b.groups === "object") {
    Object.keys(b.groups).forEach((g) => {
      if (!/^[A-L]$/.test(g)) return;
      const arr = b.groups[g];
      if (Array.isArray(arr)) {
        groups[g] = arr.slice(0, 4).map((x) => (typeof x === "string" ? x : null));
        while (groups[g].length < 4) groups[g].push(null);
      }
    });
  }
  const lucky3rds = Array.isArray(b.lucky3rds)
    ? b.lucky3rds.filter((c) => typeof c === "string").slice(0, 8)
    : [];
  const adv = { r32: {}, r16: {}, qf: {}, sf: {}, final: {} };
  if (b.advances && typeof b.advances === "object") {
    ["r32", "r16", "qf", "sf", "final"].forEach((round) => {
      const src = b.advances[round];
      if (!src || typeof src !== "object") return;
      Object.keys(src).forEach((k) => {
        const idx = parseInt(k, 10);
        if (!Number.isFinite(idx) || idx < 0 || idx > 31) return;
        if (typeof src[k] === "string") adv[round][idx] = src[k];
      });
    });
  }
  return { groups, lucky3rds, advances: adv };
}

// Resolve retired player ids to their current ones, so an entry saved before a
// squad refresh is auto-migrated to canonical ids on its next save.
const { resolvePid } = require("../festival/player-aliases");

function sanitize(e) {
  e = e && typeof e === "object" ? e : {};
  const captainByMd = {};
  if (e.captainByMd && typeof e.captainByMd === "object") {
    Object.keys(e.captainByMd).forEach((md) => { captainByMd[md] = resolvePid(e.captainByMd[md]); });
  }
  const swaps = Array.isArray(e.swaps)
    ? e.swaps.map((sw) => (sw && typeof sw === "object" ? { ...sw, from: resolvePid(sw.from), to: resolvePid(sw.to) } : sw))
    : [];
  return {
    nation: typeof e.nation === "string" ? e.nation : null,
    bracket: sanitizeBracket(e.bracket),
    picks: Array.isArray(e.picks) ? e.picks.slice(0, 11).map(resolvePid) : [],
    formation: typeof e.formation === "string" ? e.formation : "4-3-3",
    captain: e.captain != null ? resolvePid(e.captain) : null,
    captainPlus: !!e.captainPlus,
    captainByMd: captainByMd,
    swaps: swaps,
  };
}

// Apply the kickoff lock: before KICKOFF the incoming entry fully replaces the
// stored one; at/after KICKOFF the prediction core is frozen and only the
// in-tournament tactical fields are taken from the incoming payload.
function applyLock(existing, incoming, now) {
  const locked = now >= KICKOFF_MS;
  if (locked && existing) {
    return {
      ...existing,
      captain: incoming.captain,
      captainPlus: incoming.captainPlus,
      captainByMd: incoming.captainByMd,
      swaps: incoming.swaps,
    };
  }
  return incoming;
}

async function readBody(req) {
  if (req.body != null) {
    if (typeof req.body === "string") return safeParse(req.body) || {};
    return req.body;
  }
  return await new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(safeParse(data || "{}") || {}));
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  if (!kvConfigured()) {
    return json(res, 200, {
      configured: false,
      note: "Set KV_REST_API_URL + KV_REST_API_TOKEN to enable cloud save.",
    });
  }

  const auth = await verifyRequest(req);
  if (!auth) return json(res, 401, { error: "unauthorized" });
  const uid = auth.userId;

  if (req.method === "GET") {
    const raw = await kvGet(KEY(uid));
    return json(res, 200, { configured: true, entry: raw ? safeParse(raw) : null });
  }

  if (req.method === "POST") {
    const now = Date.now();
    const body = await readBody(req);
    const incoming = sanitize(body.entry || body);

    const existingRaw = await kvGet(KEY(uid));
    const existing = existingRaw ? safeParse(existingRaw) : null;
    const locked = now >= KICKOFF_MS;
    // A brand-new entry saved after kickoff is a late joiner. Their core freezes
    // immediately (applyLock freezes it on every save once `existing` is set), so
    // they get one shot to pick — then it's locked like everyone else's.
    const isLate = locked && !existing;
    // Anti-backfill: a late joiner can't predict rounds that already kicked off.
    if (isLate) incoming.bracket = gateLateBracket(incoming.bracket, now);

    const merged = applyLock(existing, incoming, now);

    // Server-side completeness guard: the UI gates the happy path, but a malformed
    // or direct API call must never land an incomplete team on the leaderboard.
    // Validate the MERGED record (a post-kickoff tactical-only save keeps the
    // existing 11 picks + nation, so it still passes).
    if (!merged.nation || !Array.isArray(merged.picks) || merged.picks.length !== 11) {
      return json(res, 400, { ok: false, error: "incomplete_entry", message: "Lock-in needs a nation and exactly 11 players." });
    }

    const displayName =
      (body.displayName && String(body.displayName).slice(0, 60)) ||
      (existing && existing.displayName) ||
      null;

    const record = {
      v: 1,
      userId: uid,
      displayName,
      ...merged,
      lateEntry: (existing && existing.lateEntry) || isLate || false,
      joinedAt: (existing && existing.joinedAt) || now,
      submittedAt: (existing && existing.submittedAt) || now,
      updatedAt: now,
    };

    await kvSet(KEY(uid), JSON.stringify(record));
    await kvSadd(ROSTER, uid);
    return json(res, 200, { ok: true, locked, lateEntry: record.lateEntry, entry: record });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { error: "method not allowed" });
};

// Exposed for unit tests (harmless extra props on the handler export).
module.exports.sanitize = sanitize;
module.exports.applyLock = applyLock;
module.exports.gateLateBracket = gateLateBracket;
module.exports.KICKOFF_MS = KICKOFF_MS;
module.exports.ROUND_LOCK_MS = ROUND_LOCK_MS;
