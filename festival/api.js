// WORLD CUP XI — entry persistence client (plain JS, sets globals).
//
// Talks to /api/entry so a player's locked-in entry is saved server-side: it
// survives across devices (sign in anywhere -> your entry follows you) and feeds
// the leaderboards. Every call degrades silently to a no-op when the API isn't
// reachable/configured (local static preview, or before KV is provisioned), so
// localStorage remains the always-available source of truth for the UI.

(function () {
  // ——— Guest identity (play with a code, no sign-up) ———
  // A guest's signed session token lives in localStorage and authenticates the
  // very same /api routes a Clerk JWT does — the server treats the userId as
  // opaque, so leaderboard, leagues and entry all "just work". When the player is
  // signed into Clerk, that always takes precedence over the guest token.
  const GUEST_TOKEN_KEY = "starxi.guestToken";
  const GUEST_CODE_KEY = "starxi.guestCode";
  function lsGet(k) { try { return window.localStorage.getItem(k) || null; } catch (e) { return null; } }
  function guestToken() { return lsGet(GUEST_TOKEN_KEY); }
  function guestCode() { return lsGet(GUEST_CODE_KEY); }
  function setGuestSession(token, code) {
    try {
      if (token) window.localStorage.setItem(GUEST_TOKEN_KEY, token);
      if (code) window.localStorage.setItem(GUEST_CODE_KEY, code);
    } catch (e) {}
  }
  function clearGuest() {
    try {
      window.localStorage.removeItem(GUEST_TOKEN_KEY);
      window.localStorage.removeItem(GUEST_CODE_KEY);
    } catch (e) {}
  }
  // Mirror of the server's display format: groups of four (7K3P-9QX2-T8MZ).
  function formatGuestCode(input) {
    return String(input || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 12)
      .replace(/(.{4})(?=.)/g, "$1-");
  }

  async function authedFetch(path, opts) {
    let token = window.clerkGetToken ? await window.clerkGetToken() : null;
    if (!token) token = guestToken(); // signed-out players act as their guest identity
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
    if (opts.mode) qs.push("mode=" + encodeURIComponent(opts.mode));
    if (opts.stage) qs.push("stage=" + encodeURIComponent(opts.stage));
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
  // GET one league's detail incl. its member roster (members-only): the server
  // body { ok, league:{ code, name, memberCount, owner, isMember, members:[…] } }.
  async function wcxiLeagueDetail(code) {
    try {
      const r = await authedFetch("/api/league?code=" + encodeURIComponent(code), { method: "GET" });
      const j = await r.json().catch(() => null);
      if (!r.ok) return Object.assign({ ok: false, status: r.status }, j || {});
      return Object.assign({ ok: true }, j);
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
  // GET one team's full scoring breakdown (the leaderboard drill-down). `token`
  // is the opaque handle from a leaderboard row; `code` scopes to a league.
  async function wcxiTeam(token, code) {
    try {
      const qs = "token=" + encodeURIComponent(token) + (code ? "&code=" + encodeURIComponent(code) : "");
      const r = await authedFetch("/api/team?" + qs, { method: "GET" });
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
  const wcxiToggleLeagueRtf = (code) => wcxiLeagueAction("toggleRtf", { code: code });
  const wcxiRenameLeague = (code, name) => wcxiLeagueAction("rename", { code: code, name: name });
  const wcxiRemoveMember = (code, member) => wcxiLeagueAction("remove", { code: code, member: member });
  const wcxiDeleteLeague = (code) => wcxiLeagueAction("delete", { code: code });

  // ——— Guest mint / redeem / claim ———
  // Create a brand-new guest identity ("lock in with a code"). On success the
  // session is stored, so every later authedFetch is this guest. Returns
  // { ok, userId, code } or { ok:false } (API down / not configured → caller
  // stays local-only). The display `code` is shown to the player to write down.
  async function wcxiGuestMint() {
    try {
      const r = await fetch("/api/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "mint" }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) return { ok: false };
      setGuestSession(j.token, j.code);
      return { ok: true, userId: j.userId, code: j.code };
    } catch (e) { return { ok: false }; }
  }

  // Restore a guest on a new device / after clearing storage: a code → a fresh
  // session token. Returns { ok, userId } or { ok:false, error }.
  async function wcxiGuestRedeem(code) {
    try {
      const r = await fetch("/api/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "redeem", code: code }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) return { ok: false, status: r.status, error: j && j.error };
      // Server can't return the (hashed) code, so remember the player's own input.
      setGuestSession(j.token, formatGuestCode(code));
      return { ok: true, userId: j.userId };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  // Upgrade the current guest into the signed-in Clerk account: the server merges
  // the guest's entry, roster slot and leagues onto the account, then we drop the
  // guest session. No-op when there's no guest or no account. Returns { ok, merged }.
  async function wcxiGuestClaim() {
    const gt = guestToken();
    if (!gt) return { ok: false, error: "no_guest" };
    const clerk = window.clerkGetToken ? await window.clerkGetToken() : null;
    if (!clerk) return { ok: false, error: "no_account" };
    try {
      const r = await fetch("/api/guest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          Authorization: "Bearer " + clerk,
        },
        body: JSON.stringify({ action: "claim", guestToken: gt }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.ok) return { ok: false, status: r.status, error: j && j.error };
      clearGuest();
      return { ok: true, merged: !!j.merged };
    } catch (e) { return { ok: false, error: String(e) }; }
  }

  Object.assign(window, {
    wcxiSaveEntry,
    wcxiLoadEntry,
    wcxiLeaderboard,
    wcxiLeagues,
    wcxiLeagueDetail,
    wcxiTeam,
    wcxiCreateLeague,
    wcxiJoinLeague,
    wcxiLeaveLeague,
    wcxiToggleLeagueRtf,
    wcxiRenameLeague,
    wcxiRemoveMember,
    wcxiDeleteLeague,
    wcxiGuestMint,
    wcxiGuestRedeem,
    wcxiGuestClaim,
    wcxiGuestToken: guestToken,
    wcxiGuestCode: guestCode,
    wcxiClearGuest: clearGuest,
    wcxiFormatGuestCode: formatGuestCode,
  });
})();
