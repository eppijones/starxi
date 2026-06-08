// STAR XI — local-draft identity reconcile (shared browser + Node, unit-tested).
//
// The localStorage draft is shared by every account on a browser. This pure
// function decides what to do with it once the signed-in identity is known, so
// one account's team can never be shown — or saved — under another. It is the
// single source of truth for that rule (app.jsx calls window.starxiReconcileAction).
//
//   localOwner     — the draft's stamped owner: "u:<id>" | "g:<token>" | "anon" | null
//   idKey          — the current identity, same shape (never null; "anon" when none)
//   hasServerEntry — whether THIS identity owns a stored server entry
//
// Returns one of:
//   "keep"  — the draft already belongs to this identity; trust the local copy
//   "load"  — this identity has a server entry; it's authoritative, load it
//   "adopt" — an anonymous/guest draft + a fresh account with no entry → carry it over
//   "wipe"  — the draft belongs to a DIFFERENT account (or is a signed-out
//             leftover) and this identity has no entry → discard it

(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") {
    window.starxiReconcileAction = api.starxiReconcileAction;
  }
})(this, function () {
  function starxiReconcileAction(localOwner, idKey, hasServerEntry) {
    var owner = localOwner || "anon";
    if (owner === idKey) return "keep";
    if (hasServerEntry) return "load";
    var adoptable = (owner === "anon" || owner.slice(0, 2) === "g:") && idKey !== "anon";
    return adoptable ? "adopt" : "wipe";
  }
  return { starxiReconcileAction: starxiReconcileAction };
});
