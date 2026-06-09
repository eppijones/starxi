// WORLD CUP XI — private mini-leagues (join by code).
//
//   GET  /api/league              -> { ok, leagues:[{code,name,memberCount,owner}] }
//   GET  /api/league?code=ABC23   -> { ok, league:{…, members:[{token,name,owner,you}]} }
//   POST {action:"create",   name}            -> { ok, code, name }
//   POST {action:"join",     code}            -> { ok, code, name, memberCount }
//   POST {action:"leave",    code}            -> { ok, code }   (owner leaving transfers/deletes)
//   POST {action:"rename",   code, name}      -> { ok, code, name }            (owner only)
//   POST {action:"remove",   code, member}    -> { ok, code, memberCount }     (owner only)
//   POST {action:"delete",   code}            -> { ok, code, deleted:true }    (owner only)
//   POST {action:"toggleRtf",code}            -> { ok, code, roadToFinalEnabled} (owner only)
//
// Auth required (the userId comes from the verified Clerk token). Storage:
//   wcxi:league:<code>       -> JSON { code, name, ownerId, createdAt, roadToFinalEnabled }
//   wcxi:league:<code>:m     -> SET of member userIds
//   wcxi:user:<uid>:leagues  -> SET of league codes the user belongs to
//
// Privacy: we never expose raw Clerk userIds. A member is addressed by an opaque
// per-league token = sha256(uid:code) truncated, so an owner can remove a member
// without ever seeing their account id. Display names come from each member's
// stored entry (wcxi:entry:<uid>.displayName).

const crypto = require("crypto");
const {
  kvConfigured,
  kvGet,
  kvSet,
  kvDel,
  kvSadd,
  kvSrem,
  kvSmembers,
  kvScard,
  kvMget,
} = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");

const META = (code) => `wcxi:league:${code}`;
const MEMBERS = (code) => `wcxi:league:${code}:m`;
const USER_LEAGUES = (uid) => `wcxi:user:${uid}:leagues`;
const ENTRY = (uid) => `wcxi:entry:${uid}`;
// Global index of every league code — lets the admin dashboard enumerate leagues
// (regular users still only ever see their own via USER_LEAGUES).
const LEAGUES_ALL = "wcxi:leagues:all";

// Opaque, stable handle for a member within a league (never the raw userId).
function memberToken(uid, code) {
  return crypto.createHash("sha256").update(uid + ":" + code).digest("hex").slice(0, 16);
}

// Resolve a league's members to display rows. `callerUid` flags the caller's own
// row. Owner is sorted first, then alphabetically by name. Names come from each
// member's stored entry; a member who hasn't saved an entry shows as "Player".
async function listMembers(code, ownerId, callerUid) {
  const uids = (await kvSmembers(MEMBERS(code))) || [];
  const entries = uids.length ? await kvMget(uids.map(ENTRY)) : [];
  const rows = uids.map((uid, i) => {
    const e = safeParse(entries[i]);
    const name = (e && e.displayName && String(e.displayName)) || "Player";
    return {
      token: memberToken(uid, code),
      name,
      owner: uid === ownerId,
      you: uid === callerUid,
    };
  });
  rows.sort((a, b) => (b.owner - a.owner) || a.name.localeCompare(b.name));
  return { rows, uids };
}

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
  const meta = {
    code,
    name: cleanName(name),
    ownerId: uid,
    createdAt: Date.now(),
    roadToFinalEnabled: true,
  };
  await kvSet(META(code), JSON.stringify(meta));
  await kvSadd(MEMBERS(code), uid);
  await kvSadd(USER_LEAGUES(uid), code);
  await kvSadd(LEAGUES_ALL, code);
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
      const memberUids = (await kvSmembers(MEMBERS(code))) || [];
      const memberCount = memberUids.length;
      const isMember = memberUids.includes(uid);
      const isOwner = meta.ownerId === uid;
      // The roster (with names) is members-only — non-members get just the count
      // so they can preview a league before joining without a privacy leak.
      let members = null;
      if (isMember) members = (await listMembers(code, meta.ownerId, uid)).rows;
      return json(res, 200, {
        ok: true,
        league: {
          code,
          name: meta.name,
          memberCount,
          owner: isOwner,
          isMember,
          roadToFinalEnabled: meta.roadToFinalEnabled !== false,
          members,
        },
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
        roadToFinalEnabled: meta.roadToFinalEnabled !== false,
      });
    }
    leagues.sort((a, b) => b.memberCount - a.memberCount);
    return json(res, 200, { ok: true, leagues });
  }

  if (req.method === "POST") {
    const body = await readBody(req);
    const action = body.action;

    if (action === "create") {
      // Leagues are the "serious" layer — only real accounts can own one. A guest
      // must claim their team (sign up) first; joining a league stays open to all.
      if (auth.guest) return json(res, 403, { ok: false, error: "needs_account", needsAccount: true });
      const meta = await createLeague(uid, body.name);
      return json(res, 200, {
        ok: true,
        code: meta.code,
        name: meta.name,
        roadToFinalEnabled: meta.roadToFinalEnabled,
      });
    }

    if (action === "toggleRtf") {
      const code = normalizeCode(body.code);
      if (!code) return json(res, 400, { ok: false, error: "bad_code" });
      const meta = safeParse(await kvGet(META(code)));
      if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
      if (meta.ownerId !== uid) return json(res, 403, { ok: false, error: "not_owner" });
      meta.roadToFinalEnabled = !meta.roadToFinalEnabled;
      await kvSet(META(code), JSON.stringify(meta));
      return json(res, 200, { ok: true, code, roadToFinalEnabled: meta.roadToFinalEnabled });
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
      const meta = safeParse(await kvGet(META(code)));
      await kvSrem(MEMBERS(code), uid);
      await kvSrem(USER_LEAGUES(uid), code);
      // Orphan handling: if the OWNER leaves, hand the league to the next member;
      // if nobody's left, the league is dissolved entirely.
      if (meta && meta.ownerId === uid) {
        const remaining = (await kvSmembers(MEMBERS(code))) || [];
        if (remaining.length) {
          meta.ownerId = remaining[0];
          await kvSet(META(code), JSON.stringify(meta));
        } else {
          await kvDel(META(code));
          await kvDel(MEMBERS(code));
        }
      }
      return json(res, 200, { ok: true, code });
    }

    if (action === "rename") {
      const code = normalizeCode(body.code);
      if (!code) return json(res, 400, { ok: false, error: "bad_code" });
      const meta = safeParse(await kvGet(META(code)));
      if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
      if (meta.ownerId !== uid) return json(res, 403, { ok: false, error: "not_owner" });
      meta.name = cleanName(body.name);
      await kvSet(META(code), JSON.stringify(meta));
      return json(res, 200, { ok: true, code, name: meta.name });
    }

    if (action === "remove") {
      const code = normalizeCode(body.code);
      if (!code) return json(res, 400, { ok: false, error: "bad_code" });
      const meta = safeParse(await kvGet(META(code)));
      if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
      if (meta.ownerId !== uid) return json(res, 403, { ok: false, error: "not_owner" });
      // Resolve the opaque member token back to a userId without ever exposing it.
      const uids = (await kvSmembers(MEMBERS(code))) || [];
      const target = uids.find((u) => memberToken(u, code) === String(body.member || ""));
      if (!target) return json(res, 404, { ok: false, error: "no_such_member" });
      if (target === uid) return json(res, 400, { ok: false, error: "cant_remove_owner" });
      await kvSrem(MEMBERS(code), target);
      await kvSrem(USER_LEAGUES(target), code);
      const memberCount = await kvScard(MEMBERS(code));
      return json(res, 200, { ok: true, code, memberCount });
    }

    if (action === "delete") {
      const code = normalizeCode(body.code);
      if (!code) return json(res, 400, { ok: false, error: "bad_code" });
      const meta = safeParse(await kvGet(META(code)));
      if (!meta) return json(res, 404, { ok: false, error: "no_such_league" });
      if (meta.ownerId !== uid) return json(res, 403, { ok: false, error: "not_owner" });
      // Detach the league from every member, then delete the league itself.
      const uids = (await kvSmembers(MEMBERS(code))) || [];
      for (const u of uids) await kvSrem(USER_LEAGUES(u), code);
      await kvDel(MEMBERS(code));
      await kvDel(META(code));
      await kvSrem(LEAGUES_ALL, code);
      return json(res, 200, { ok: true, code, deleted: true });
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
