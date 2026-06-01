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
// still change. A brand-new entry can't be created once the tournament kicks off.

const { kvConfigured, kvGet, kvSet, kvSadd } = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");

// Group A opener, Mexico City — must match KICKOFF in festival/app.jsx.
const KICKOFF_MS = Date.parse("2026-06-11T16:00:00Z");
const KEY = (uid) => `wcxi:entry:${uid}`;
const ROSTER = "wcxi:players";

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

function sanitize(e) {
  e = e && typeof e === "object" ? e : {};
  return {
    nation: typeof e.nation === "string" ? e.nation : null,
    bracket: sanitizeBracket(e.bracket),
    picks: Array.isArray(e.picks) ? e.picks.slice(0, 11) : [],
    formation: typeof e.formation === "string" ? e.formation : "4-3-3",
    captain: e.captain != null ? e.captain : null,
    captainPlus: !!e.captainPlus,
    captainByMd:
      e.captainByMd && typeof e.captainByMd === "object" ? e.captainByMd : {},
    swaps: Array.isArray(e.swaps) ? e.swaps : [],
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

    if (locked && !existing) {
      return json(res, 403, {
        error: "locked",
        message: "Entries closed at kickoff.",
      });
    }

    const merged = applyLock(existing, incoming, now);

    const displayName =
      (body.displayName && String(body.displayName).slice(0, 60)) ||
      (existing && existing.displayName) ||
      null;

    const record = {
      v: 1,
      userId: uid,
      displayName,
      ...merged,
      submittedAt: (existing && existing.submittedAt) || now,
      updatedAt: now,
    };

    await kvSet(KEY(uid), JSON.stringify(record));
    await kvSadd(ROSTER, uid);
    return json(res, 200, { ok: true, locked, entry: record });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { error: "method not allowed" });
};

// Exposed for unit tests (harmless extra props on the handler export).
module.exports.sanitize = sanitize;
module.exports.applyLock = applyLock;
module.exports.KICKOFF_MS = KICKOFF_MS;
