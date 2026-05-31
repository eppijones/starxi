// WORLD CUP XI — live results client glue (plain JS, sets globals).
//
// Turns the /api/results payload (real football-data.org WC matches) into the
// `results` map the existing scoring engine already understands:
//   window.scoreMatch(prediction, actual, isBoost)  expects actual = { home, away }
//   window.tallyUser(state, sim)                     expects sim.results[fixtureId] = { home, away }
//
// The actual payload->fixtures mapping lives in festival/results-map.js
// (window.buildResultsMap), shared with the server-side leaderboard so the two
// can NEVER disagree. This file is now just the browser fetch glue around it.

(function () {
  // Thin wrapper: the page calls buildLiveResults(payload); the shared mapper
  // does the work, defaulting FIXTURES to window.FIXTURES.
  function buildLiveResults(payload) {
    return window.buildResultsMap(payload, window.FIXTURES);
  }

  // Fetch the proxy. Always resolves (never throws) so the page degrades
  // gracefully to its pre-launch view when /api isn't deployed (e.g. local
  // static preview) or the feed is down.
  async function fetchLiveResults(timeoutMs = 6000) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const r = await fetch("/api/results", { signal: ctrl.signal, headers: { accept: "application/json" } });
      clearTimeout(t);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // WC_TLA_ALIAS / __wcPairKey are set by results-map.js (loaded before this).
  Object.assign(window, {
    buildLiveResults,
    fetchLiveResults,
  });
})();
