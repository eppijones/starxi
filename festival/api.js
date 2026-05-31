// WORLD CUP XI — entry persistence client (plain JS, sets globals).
//
// Talks to /api/entry so a player's locked-in entry is saved server-side: it
// survives across devices (sign in anywhere -> your entry follows you) and feeds
// the leaderboards. Every call degrades silently to a no-op when the API isn't
// reachable/configured (local static preview, or before KV is provisioned), so
// localStorage remains the always-available source of truth for the UI.

(function () {
  async function authedFetch(path, opts) {
    const token = window.clerkGetToken ? await window.clerkGetToken() : null;
    const headers = Object.assign(
      { "Content-Type": "application/json", accept: "application/json" },
      (opts && opts.headers) || {}
    );
    if (token) headers.Authorization = "Bearer " + token;
    return fetch(path, Object.assign({}, opts, { headers }));
  }

  // POST the player's entry. Resolves to { ok, configured?, locked?, entry? } or
  // { ok:false } on any failure — callers keep their local copy regardless.
  async function wcxiSaveEntry(state, displayName) {
    try {
      const r = await authedFetch("/api/entry", {
        method: "POST",
        body: JSON.stringify({ entry: state, displayName: displayName || null }),
      });
      if (!r.ok) return { ok: false, status: r.status };
      const j = await r.json();
      return Object.assign({ ok: true }, j);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // GET the player's stored entry. Resolves to { configured, entry } where entry
  // is null when none exists. Never throws.
  async function wcxiLoadEntry() {
    try {
      const r = await authedFetch("/api/entry", { method: "GET" });
      if (!r.ok) return { configured: false, entry: null };
      return await r.json();
    } catch (e) {
      return { configured: false, entry: null };
    }
  }

  // ——— Leaderboard ———
  // GET the ranked table for a scope. opts: { code?, limit? }. `code` selects a
  // private league; omit it for the global table. Resolves to the server body
  // ({ ok, scope, name, total, played, top:[…], you }) or { ok:false, … } on any
  // failure (signed out, KV not configured, network). Never throws.
  async function wcxiLeaderboard(opts) {
    opts = opts || {};
    const qs = [];
    if (opts.code) qs.push("code=" + encodeURIComponent(opts.code));
    if (opts.limit) qs.push("limit=" + encodeURIComponent(opts.limit));
    const url = "/api/leaderboard" + (qs.length ? "?" + qs.join("&") : "");
    try {
      const r = await authedFetch(url, { method: "GET" });
      const j = await r.json().catch(() => null);
      if (!r.ok) return Object.assign({ ok: false, status: r.status }, j || {});
      return Object.assign({ ok: true }, j);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // ——— Private mini-leagues ———
  // List the leagues the signed-in player belongs to: { ok, leagues:[…] }.
  async function wcxiLeagues() {
    try {
      const r = await authedFetch("/api/league", { method: "GET" });
      const j = await r.json().catch(() => null);
      if (!r.ok) return Object.assign({ ok: false, status: r.status }, j || {});
      return Object.assign({ ok: true }, j);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  // POST a league action (create | join | leave). Returns the server body or
  // { ok:false, … }. `name` is used by create; `code` by join/leave.
  async function wcxiLeagueAction(action, payload) {
    try {
      const r = await authedFetch("/api/league", {
        method: "POST",
        body: JSON.stringify(Object.assign({ action: action }, payload || {})),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) return Object.assign({ ok: false, status: r.status }, j || {});
      return Object.assign({ ok: true }, j);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  const wcxiCreateLeague = (name) => wcxiLeagueAction("create", { name: name });
  const wcxiJoinLeague = (code) => wcxiLeagueAction("join", { code: code });
  const wcxiLeaveLeague = (code) => wcxiLeagueAction("leave", { code: code });

  Object.assign(window, {
    wcxiSaveEntry,
    wcxiLoadEntry,
    wcxiLeaderboard,
    wcxiLeagues,
    wcxiCreateLeague,
    wcxiJoinLeague,
    wcxiLeaveLeague,
  });
})();
