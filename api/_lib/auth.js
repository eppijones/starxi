// WORLD CUP XI — server-side Clerk session verification.
//
// The browser sends a short-lived Clerk session JWT as `Authorization: Bearer …`
// (see festival/api.js -> clerkGetToken). We verify it here so a player can only
// ever read/write their OWN entry — the userId comes from the signed token, never
// from the request body.
//
// Verification uses @clerk/backend's verifyToken:
//   • CLERK_JWT_KEY  -> networkless (PEM public key; fastest, no JWKS fetch)
//   • CLERK_SECRET_KEY -> networked JWKS (works out of the box with the key you
//                         already have; the JWKS is cached between invocations)
// We prefer the networkless key when present and fall back to the secret key.

const { verifyToken } = require("@clerk/backend");

function bearer(req) {
  const h =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
    "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : null;
}

// Returns { userId, claims } for a valid token, or null otherwise.
async function verifyRequest(req) {
  const token = bearer(req);
  if (!token) return null;

  const jwtKey = process.env.CLERK_JWT_KEY;
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!jwtKey && !secretKey) return null; // server not configured for auth

  // authorizedParties hardens against token replay from other origins. Set
  // CLERK_AUTHORIZED_PARTIES (comma-separated origins) in prod; optional in dev.
  const authorizedParties = (process.env.CLERK_AUTHORIZED_PARTIES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const opts = {};
  if (jwtKey) opts.jwtKey = jwtKey;
  else opts.secretKey = secretKey;
  if (authorizedParties.length) opts.authorizedParties = authorizedParties;

  try {
    const claims = await verifyToken(token, opts);
    if (!claims || !claims.sub) return null;
    return { userId: claims.sub, claims };
  } catch (e) {
    return null;
  }
}

module.exports = { verifyRequest, bearer };
