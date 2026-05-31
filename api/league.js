// WORLD CUP XI — private mini-leagues (join by code).
//
//   GET  /api/league              -> { ok, leagues:[{code,name,memberCount,owner}] }
//   GET  /api/league?code=ABC23   -> { ok, league:{code,name,ownerId,memberCount} }
//   POST /api/league {action:"create", name}  -> { ok, code, name }
//   POST /api/league {action:"join",   code}  -> { ok, code, name, memberCount }
//   POST /api/league {action:"leave",  code}  -> { ok, code }
//
// Auth required (the userId comes from the verified Clerk token). Storage:
//   wcxi:league:<code>       -> JSON { code, name, ownerId, createdAt }
//   wcxi:league:<code>:m     -> SET of member userIds
//   wcxi:user:<uid>:leagues  -> SET of league codes the user belongs to

const {
  kvConfigured,
  kvGet,
  kvSet,
  kvSadd,
  kvSrem,
  kvSmembers,
  kvScard,
} = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");

const META = (code) => `wcxi:league:${code}`;
const MEMBERS = (code) => `wcxi:league:${code}:m`;
const USER_LEAGUES = (uid) => `wcxi:user:${uid}:leagues`;

// Unambiguous alphabet (no 0/O/1/I) for human-friendly, shareable codes.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode(len = 5) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return s;
}
function normalizeCode(c) {
  return String(c || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);
}
function cleanName(n) {
  const s = String(n || "").trim().replace(/\s+/g, " ").slice(0, 40);
  return s || "My League";
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
async function readBody(req) {
  if (req.body != null) {
    if (typeof req.body === "string") return safeParse(req.body) || {};
    return req.body;
  }
  return await new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => resolve(safeParse(d || "{}") || {}));
    req.on("error", () => resolve({}));
  });
}

async function createLeague(uid, name) {
  // Find a free code (tiny retry loop; collisions are astronomically rare).
  let code = null;
  for (let i = 0; i < 6; i++) {
    const candidate = randomCode(5);
    if (!(await kvGet(META(candidate)))) {
      code = candidate;
      break;
    }
  }
  if (!code) code = randomCode(6); // fall back to a longer code space
  const meta = { code, name: cleanName(name), ownerId: uid, createdAt: Date.now() };
  await kvSet(META(code), JSON.stringify(meta));
  await kvSadd(MEMBERS(code), uid);
  await kvSadd(USER_LEAGUES(uid), code);
  return meta;
}

module.exports = async (req, res) => {
  if (!kvConfigured()) {
    return json(res, 200, { ok: false, configured: false });
  }
  const auth = await verifyRequest(req);
  if (!auth) return json(res, 401, { error: "unauthorized" });
  const uid = auth.userId;

  if (req.method === "GET") {
    const url = new URL(req.url, "http://x");
    const code = normalizeCode(url.searchParams.get("code"));
    if (code) {
      const meta = safeParse(await kvGet(META(code)));
      if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
      const memberCount = await kvScard(MEMBERS(code));
      return json(res, 200, {
        ok: true,
        league: { code, name: meta.name, ownerId: meta.ownerId, memberCount },
      });
    }
    // List the caller's leagues.
    const codes = (await kvSmembers(USER_LEAGUES(uid))) || [];
    const leagues = [];
    for (const c of codes) {
      const meta = safeParse(await kvGet(META(c)));
      if (!meta) continue;
      const memberCount = await kvScard(MEMBERS(c));
      leagues.push({
        code: c,
        name: meta.name,
        memberCount,
        owner: meta.ownerId === uid,
      });
    }
    leagues.sort((a, b) => b.memberCount - a.memberCount);
    return json(res, 200, { ok: true, leagues });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action;

    if (action === "create") {
      const meta = await createLeague(uid, body.name);
      return json(res, 200, { ok: true, code: meta.code, name: meta.name });
    }

    if (action === "join") {
      const code = normalizeCode(body.code);
      if (!code) return json(res, 400, { ok: false, error: "bad_code" });
      const meta = safeParse(await kvGet(META(code)));
      if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
      await kvSadd(MEMBERS(code), uid);
      await kvSadd(USER_LEAGUES(uid), code);
      const memberCount = await kvScard(MEMBERS(code));
      return json(res, 200, { ok: true, code, name: meta.name, memberCount });
    }

    if (action === "leave") {
      const code = normalizeCode(body.code);
      if (!code) return json(res, 400, { ok: false, error: "bad_code" });
      await kvSrem(MEMBERS(code), uid);
      await kvSrem(USER_LEAGUES(uid), code);
      return json(res, 200, { ok: true, code });
    }

    return json(res, 400, { ok: false, error: "unknown_action" });
  }

  res.setHeader("Allow", "GET, POST");
  return json(res, 405, { error: "method not allowed" });
};

// Exposed for unit tests.
module.exports.normalizeCode = normalizeCode;
module.exports.cleanName = cleanName;
module.exports.randomCode = randomCode;
