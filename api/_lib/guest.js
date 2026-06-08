// STAR XI — guest identity ("play with a code", no sign-up).
//
// A guest gets three things at lock-in:
//   • userId   g_<hex>           — opaque; slots in EVERYWHERE a Clerk `sub` does
//                                   (entries, leaderboard roster, league members).
//                                   Nothing downstream knows or cares it's a guest.
//   • session TOKEN  gt_<…>      — HMAC-signed; the browser sends it as
//                                   `Authorization: Bearer …` for ongoing API auth.
//                                   Verified networklessly (no KV read), exactly
//                                   like the Clerk JWT path.
//   • recovery CODE  7K3P-9QX2…  — 60 bits of entropy, shown once. Stored ONLY as a
//                                   salted hash (a KV leak never reveals codes). Lets
//                                   a player re-mint a token on a new device / after
//                                   clearing storage.
//
// Forgery resistance comes from a server secret: GUEST_TOKEN_SECRET if set, else a
// value derived from CLERK_SECRET_KEY (already server-only and required for auth) —
// so guest mode works out of the box with no extra env var. Rotating either secret
// invalidates live guest *tokens* (players just re-enter their code); it does NOT
// invalidate codes (those are hashed independently).
//
// Storage keys (Upstash Redis / Vercel KV):
//   wcxi:guestcode:<sha256(code)>  -> userId   (code → identity, for redeem)
//   wcxi:guestmeta:<userId>        -> JSON { createdAt, codeHash }  (for cleanup on claim)

const crypto = require("crypto");

function secret() {
  const explicit = process.env.GUEST_TOKEN_SECRET;
  if (explicit) return Buffer.from(String(explicit));
  const clerk = process.env.CLERK_SECRET_KEY;
  if (clerk) return crypto.createHash("sha256").update("starxi-guest-v1:" + clerk).digest();
  return null;
}
function guestConfigured() {
  return !!secret();
}

// ——— base64url (no padding) ———
function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function b64urlToBuf(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}
function hmac(data) {
  return crypto.createHmac("sha256", secret()).update(data).digest();
}

// ——— Session token:  gt_<payload>.<sig> ———
// payload = base64url(JSON{u,iat,v}); sig = base64url(HMAC-SHA256(payload)).
function mintToken(uid) {
  const payload = b64url(JSON.stringify({ u: uid, iat: Date.now(), v: 1 }));
  const sig = b64url(hmac(payload));
  return "gt_" + payload + "." + sig;
}
// Returns { userId, guest:true } for a valid token, or null. Networkless.
function verifyGuestToken(token) {
  if (!guestConfigured()) return null;
  if (typeof token !== "string" || token.slice(0, 3) !== "gt_") return null;
  const rest = token.slice(3);
  const dot = rest.indexOf(".");
  if (dot < 0) return null;
  const payload = rest.slice(0, dot);
  const sigStr = rest.slice(dot + 1);
  let expected, given;
  try {
    expected = hmac(payload);
    given = b64urlToBuf(sigStr);
  } catch (e) {
    return null;
  }
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let data;
  try {
    data = JSON.parse(b64urlToBuf(payload).toString("utf8"));
  } catch (e) {
    return null;
  }
  if (!data || typeof data.u !== "string" || data.u.slice(0, 2) !== "g_") return null;
  return { userId: data.u, guest: true };
}

// ——— Recovery code ———
// Unambiguous base32 alphabet (no 0/O/1/I). 32 chars divides 256 evenly, so
// `byte % 32` is perfectly uniform — no modulo bias. 12 chars × 5 bits = 60 bits.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 12;

function newUserId() {
  return "g_" + crypto.randomBytes(9).toString("hex"); // 72-bit opaque id
}
function randomCodeRaw() {
  const bytes = crypto.randomBytes(CODE_LEN);
  let s = "";
  for (let i = 0; i < CODE_LEN; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}
// Display form: groups of four, e.g. 7K3P-9QX2-T8MZ (easy to read off / write down).
function formatCode(raw) {
  return String(raw).replace(/(.{4})(?=.)/g, "$1-");
}
// Accept whatever the player types/pastes (spaces, dashes, lowercase) and recover
// the canonical 12-char code.
function normalizeCode(input) {
  return String(input || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LEN);
}
function hashCode(normalized) {
  return crypto.createHash("sha256").update("starxi-code-v1:" + normalized).digest("hex");
}

const CODE_KEY = (h) => `wcxi:guestcode:${h}`;
const META_KEY = (uid) => `wcxi:guestmeta:${uid}`;

module.exports = {
  guestConfigured,
  mintToken,
  verifyGuestToken,
  newUserId,
  randomCodeRaw,
  formatCode,
  normalizeCode,
  hashCode,
  CODE_KEY,
  META_KEY,
  CODE_LEN,
};
