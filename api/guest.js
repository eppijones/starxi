// STAR XI — guest identity endpoint (no sign-up needed to play).
//
//   POST {action:"mint"}                         -> { ok, userId, code, token }
//        Create a fresh guest identity. The browser then persists the entry via
//        /api/entry using the returned token, and shows the player their code.
//
//   POST {action:"redeem", code}                 -> { ok, userId, token }
//        Restore on a new device / after clearing storage: a code → a fresh token.
//
//   POST {action:"claim", guestToken}            -> { ok, merged }
//        Bearer MUST be a Clerk session JWT. Upgrades a guest to a real account by
//        moving the guest's entry, leaderboard roster slot and league memberships
//        onto the Clerk userId, then deleting the guest records. Idempotent.
//
// Everything degrades gracefully: when KV or the guest secret isn't configured we
// return { ok:false, configured:false } and the client stays in its local-only mode.

const {
  kvConfigured,
  kvGet,
  kvSet,
  kvDel,
  kvSadd,
  kvSrem,
  kvSmembers,
} = require("./_lib/kv");
const { verifyRequest } = require("./_lib/auth");
const guest = require("./_lib/guest");

// Shared key shapes (must match api/entry.js + api/league.js).
const ENTRY = (uid) => `wcxi:entry:${uid}`;
const ROSTER = "wcxi:players";
const META = (code) => `wcxi:league:${code}`;
const MEMBERS = (code) => `wcxi:league:${code}:m`;
const USER_LEAGUES = (uid) => `wcxi:user:${uid}:leagues`;

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

// Move a guest's footprint onto a Clerk userId. Never clobbers an existing account
// entry (a returning player who already locked in keeps theirs); always migrates
// league membership/ownership so the guest's leagues follow them. Pure side-effects
// on KV; safe to call twice (a second call finds nothing left to move).
async function mergeGuestInto(guestUid, clerkUid) {
  let merged = false;

  // 1) Entry — only if the account doesn't already have one.
  const guestEntry = safeParse(await kvGet(ENTRY(guestUid)));
  if (guestEntry) {
    const clerkEntry = await kvGet(ENTRY(clerkUid));
    if (!clerkEntry) {
      const moved = { ...guestEntry, userId: clerkUid };
      await kvSet(ENTRY(clerkUid), JSON.stringify(moved));
      await kvSadd(ROSTER, clerkUid);
      merged = true;
    }
    await kvDel(ENTRY(guestUid));
    await kvSrem(ROSTER, guestUid);
  }

  // 2) Leagues — re-point every membership (and any ownership) at the account.
  const codes = (await kvSmembers(USER_LEAGUES(guestUid))) || [];
  for (const code of codes) {
    await kvSadd(MEMBERS(code), clerkUid);
    await kvSadd(USER_LEAGUES(clerkUid), code);
    await kvSrem(MEMBERS(code), guestUid);
    await kvSrem(USER_LEAGUES(guestUid), code);
    const meta = safeParse(await kvGet(META(code)));
    if (meta && meta.ownerId === guestUid) {
      meta.ownerId = clerkUid;
      await kvSet(META(code), JSON.stringify(meta));
    }
    merged = true;
  }
  await kvDel(USER_LEAGUES(guestUid));

  // 3) Retire the guest credential so the code can never resurrect the old id.
  const gmeta = safeParse(await kvGet(guest.META_KEY(guestUid)));
  if (gmeta && gmeta.codeHash) await kvDel(guest.CODE_KEY(gmeta.codeHash));
  await kvDel(guest.META_KEY(guestUid));

  return merged;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { ok: false, error: "method_not_allowed" });
  }
  if (!kvConfigured() || !guest.guestConfigured()) {
    return json(res, 200, { ok: false, configured: false });
  }

  const body = await readBody(req);
  const action = body.action;

  if (action === "mint") {
    const uid = guest.newUserId();
    const raw = guest.randomCodeRaw();
    const codeHash = guest.hashCode(guest.normalizeCode(raw));
    await kvSet(guest.CODE_KEY(codeHash), uid);
    await kvSet(guest.META_KEY(uid), JSON.stringify({ createdAt: Date.now(), codeHash }));
    return json(res, 200, {
      ok: true,
      userId: uid,
      code: guest.formatCode(raw),
      token: guest.mintToken(uid),
    });
  }

  if (action === "redeem") {
    const normalized = guest.normalizeCode(body.code);
    if (normalized.length !== guest.CODE_LEN) {
      return json(res, 400, { ok: false, error: "bad_code" });
    }
    const uid = await kvGet(guest.CODE_KEY(guest.hashCode(normalized)));
    if (!uid) return json(res, 404, { ok: false, error: "no_such_code" });
    return json(res, 200, { ok: true, userId: uid, token: guest.mintToken(uid) });
  }

  if (action === "claim") {
    // Caller proves the ACCOUNT identity via the Bearer (a Clerk JWT)…
    const auth = await verifyRequest(req);
    if (!auth) return json(res, 401, { ok: false, error: "unauthorized" });
    if (auth.guest) return json(res, 400, { ok: false, error: "claim_needs_account" });
    // …and proves they hold the GUEST identity via its signed token.
    const guestAuth = guest.verifyGuestToken(body.guestToken);
    if (!guestAuth) return json(res, 400, { ok: false, error: "bad_guest_token" });
    if (guestAuth.userId === auth.userId) return json(res, 200, { ok: true, merged: false });
    const merged = await mergeGuestInto(guestAuth.userId, auth.userId);
    return json(res, 200, { ok: true, merged });
  }

  return json(res, 400, { ok: false, error: "bad_action" });
};

// Exposed for unit tests.
module.exports.mergeGuestInto = mergeGuestInto;
