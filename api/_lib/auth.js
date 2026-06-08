// WORLD CUP XI — server-side session verification (Clerk accounts only).
//
// The browser sends a Clerk session JWT as `Authorization: Bearer …` (see
// festival/api.js -> authedFetch). The userId comes from the signed token, never
// from the request body, so a player can only ever touch their OWN data. Locking
// in a team requires a real account — the old guest recovery-code path is retired.
//   • CLERK_JWT_KEY    -> networkless (PEM public key; fastest, no JWKS fetch)
//   • CLERK_SECRET_KEY -> networked JWKS (cached between invocations)
// Yields { userId:"user_…", claims }, or null when unauthenticated.

const { verifyToken } = require("@clerk/backend");

function bearer(req) {
  const h =
    (req.headers && (req.headers.authorization || req.headers.Authorization)) ||
    "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : null;
}

// Returns { userId, claims } (Clerk) or { userId, guest:true } (guest) for a valid
// token, or null otherwise.
async function verifyRequest(req) {
  const token = bearer(req);
  if (!token) return null;

  // Clerk accounts only — locking in a team requires a real account. (The old
  // guest recovery-code path is retired; any leftover gt_ tokens won't verify.)
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
