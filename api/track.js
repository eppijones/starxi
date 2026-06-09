// STAR XI — lightweight usage telemetry for the owner's admin dashboard.
// Public + fail-silent + KV-cheap. Never blocks or affects the app.
//
//   POST /api/track            first hit of a session → count a visit + mark present
//   POST /api/track?beat=1     heartbeat → just refresh presence (no visit count)
//
// Presence is a sorted set: member = opaque client session id, score = ms epoch.
// The admin counts members seen in the last 5 min as "online now"; entries older
// than 15 min are pruned on each visit so the set stays bounded.

const crypto = require("crypto");
const { kvConfigured, redis } = require("./_lib/kv");

const VISITS = "wcxi:stats:visits";
const PRESENCE = "wcxi:presence";
const UNIQUE_IPS = "wcxi:stats:ips";                 // SET of salted IP hashes — all-time distinct visitors
const UNIQUE_IPS_DAY = (d) => `wcxi:stats:ips:${d}`; // SET per UTC day (YYYYMMDD) — distinct visitors today
const PRUNE_MS = 15 * 60 * 1000;
const DAY_TTL = 60 * 60 * 48;                        // daily IP sets self-expire after 48h

// Salt so the stored hash can't be reversed against the (small) IPv4 space.
// Reuses an existing secret; no new env var needed.
const IP_SALT =
  process.env.IP_HASH_SALT || process.env.CLERK_SECRET_KEY || process.env.GUEST_TOKEN_SECRET || "starxi-salt";

// First entry of x-forwarded-for is the real client on Vercel; x-real-ip backs it up.
function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return req.headers["x-real-ip"] || "";
}
// We never store the raw IP — only an 8-byte salted hash (privacy-safe, collision-free at our scale).
function hashIp(ip) {
  return crypto.createHash("sha256").update(IP_SALT + "|" + ip).digest("hex").slice(0, 16);
}
function utcDay(now) {
  return new Date(now).toISOString().slice(0, 10).replace(/-/g, "");
}

function ok(res) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify({ ok: true }));
}

async function readBody(req) {
  if (req.body != null) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
    return req.body;
  }
  return await new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async (req, res) => {
  // Always answer 200 — telemetry must never surface an error to the visitor.
  if (req.method !== "POST" || !kvConfigured()) return ok(res);
  try {
    const url = new URL(req.url, "http://x");
    const beat = url.searchParams.get("beat") === "1";
    let sid = "";
    try { const b = await readBody(req); sid = (b && b.sid) || ""; } catch (e) {}
    sid = String(sid).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || ("anon-" + (Date.now() % 100000));
    const now = Date.now();
    await redis(["ZADD", PRESENCE, String(now), sid]);
    if (!beat) {
      await redis(["INCR", VISITS]);
      await redis(["ZREMRANGEBYSCORE", PRESENCE, "-inf", String(now - PRUNE_MS)]);
      // Distinct-visitor tracking: add this IP's salted hash to the all-time set
      // and today's set (SADD is idempotent, so repeat loads from the same IP
      // count once). Lets the admin separate "just me/friends" from real reach.
      const ip = clientIp(req);
      if (ip) {
        const h = hashIp(ip);
        const dayKey = UNIQUE_IPS_DAY(utcDay(now));
        await redis(["SADD", UNIQUE_IPS, h]);
        await redis(["SADD", dayKey, h]);
        await redis(["EXPIRE", dayKey, String(DAY_TTL)]);
      }
    }
  } catch (e) { /* swallow — never break a page load over telemetry */ }
  return ok(res);
};
