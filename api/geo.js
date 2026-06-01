// STAR XI — /api/geo
// Returns the visitor's country (ISO 3166-1 alpha-2) using Vercel's edge geo
// headers, so the landing carousel can open on the user's nation if it's
// playing this summer. Local dev / non-Vercel hosts simply get nulls and the
// client falls back to its random reel.

module.exports = (req, res) => {
  const h = req.headers || {};
  const country =
    h["x-vercel-ip-country"] ||
    h["cf-ipcountry"] ||
    null;
  const region = h["x-vercel-ip-country-region"] || null;

  // Per-visitor result — must not be shared across IPs by the edge cache.
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify({
    country: country ? String(country).toUpperCase() : null,
    region:  region  ? String(region).toUpperCase()  : null,
  }));
};
