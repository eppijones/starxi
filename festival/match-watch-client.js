// MATCH-WATCH (temporary) — browser fetch glue for /api/match-watch.

(function () {
  async function fetchMatchWatch(opts) {
    opts = opts || {};
    var qs = [];
    if (opts.date) qs.push("date=" + encodeURIComponent(opts.date));
    if (opts.matchId) qs.push("matchId=" + encodeURIComponent(opts.matchId));
    var url = "/api/match-watch" + (qs.length ? "?" + qs.join("&") : "");
    try {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); }, opts.timeoutMs || 8000);
      var r = await fetch(url, {
        signal: ctrl.signal,
        headers: { accept: "application/json" },
      });
      clearTimeout(t);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  function pollIntervalMs(match) {
    if (!match) return 30000;
    var s = match.status;
    if (s === "IN_PLAY" || s === "PAUSED" || s === "LIVE") return 15000;
    if (s === "FINISHED") return 60000;
    return 30000;
  }

  Object.assign(window, {
    fetchMatchWatch: fetchMatchWatch,
    matchWatchPollMs: pollIntervalMs,
  });
})();
