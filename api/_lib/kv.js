// WORLD CUP XI — minimal Upstash Redis (Vercel KV) REST client.
//
// No npm dependency: we POST command arrays to the Upstash REST endpoint
//   POST {URL}        body: ["SET","key","value"]    -> { result: "OK" }
//   POST {URL}        body: ["GET","key"]            -> { result: "<value>"|null }
// authenticated with `Authorization: Bearer {TOKEN}`.
//
// Env vars (Vercel injects these when you connect an Upstash/KV store; the
// UPSTASH_* names are the fallback if you wire the store manually):
//   KV_REST_API_URL   / UPSTASH_REDIS_REST_URL
//   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN
//
// Everything degrades gracefully: kvConfigured() is false when the env isn't
// set, so callers can respond with { configured:false } instead of erroring.

function kvConfig() {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token =
    process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
  return { url: url.replace(/\/+$/, ""), token };
}

function kvConfigured() {
  const { url, token } = kvConfig();
  return !!(url && token);
}

// Send a single Redis command (array form) to the Upstash REST root endpoint.
//
// Retries transient failures (rate-limit 429, upstream 5xx, network blip) with a
// short backoff before giving up — so a launch-day traffic burst against Upstash
// degrades gracefully instead of surfacing as 500s. Safe because every command we
// send is idempotent (GET/SMEMBERS read-only; SET/SADD/SREM/DEL converge to the
// same state on a repeat), so a re-sent write can never corrupt data.
async function redis(command, _attempt = 0) {
  const { url, token } = kvConfig();
  if (!url || !token) throw new Error("KV not configured");

  let r;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });
  } catch (netErr) {
    if (_attempt < 2) {
      await new Promise((res) => setTimeout(res, 150 * (_attempt + 1)));
      return redis(command, _attempt + 1);
    }
    throw netErr;
  }

  // Transient: rate-limited or upstream hiccup → brief backoff, then retry.
  if ((r.status === 429 || r.status >= 500) && _attempt < 2) {
    await new Promise((res) => setTimeout(res, 150 * (_attempt + 1)));
    return redis(command, _attempt + 1);
  }

  if (!r.ok) throw new Error(`KV HTTP ${r.status}`);
  const j = await r.json();
  if (j && j.error) throw new Error(`KV: ${j.error}`);
  return j ? j.result : null;
}

// Fetch many keys in ONE round-trip (Redis MGET). Returns an array aligned to
// `keys`, with null for any missing key. Empty input short-circuits (no call).
async function kvMget(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return [];
  const out = await redis(["MGET", ...keys]);
  return Array.isArray(out) ? out : [];
}

module.exports = {
  kvConfig,
  kvConfigured,
  redis,
  kvGet: (key) => redis(["GET", key]),
  kvSet: (key, value) => redis(["SET", key, value]),
  kvDel: (key) => redis(["DEL", key]),
  kvSadd: (set, member) => redis(["SADD", set, member]),
  kvSrem: (set, member) => redis(["SREM", set, member]),
  kvSmembers: (set) => redis(["SMEMBERS", set]),
  kvScard: (set) => redis(["SCARD", set]),
  kvMget,
};
