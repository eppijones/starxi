// STAR XI — lightweight usage telemetry for the owner's admin dashboard.
// Public + fail-silent + KV-cheap. Never blocks or affects the app.
//
//   POST /api/track            first hit of a session → count a visit + mark present
//   POST /api/track?beat=1     heartbeat → just refresh presence (no visit count)
//
// Presence is a sorted set: member = opaque client session id, score = ms epoch.
// The admin counts members seen in the last 5 min as "online now"; entries older
// than 15 min are pruned on each visit so the set stays bounded.

const { kvConfigured, redis } = require("./_lib/kv");

const VISITS = "wcxi:stats:visits";
const PRESENCE = "wcxi:presence";
const PRUNE_MS = 15 * 60 * 1000;

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
    }
  } catch (e) { /* swallow — never break a page load over telemetry */ }
  return ok(res);
};
