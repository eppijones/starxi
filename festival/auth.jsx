// WORLD CUP XI — Clerk auth glue (buildless; ClerkJS hot-loaded via CDN).
//
// index.html loads @clerk/clerk-js from the Clerk Frontend API and exposes
//   window.clerkReady  -> Promise that resolves to the loaded Clerk instance.
//
// This file layers a small React surface on top:
//   useClerkAuth()      hook -> { loaded, signedIn, user, displayName }
//   <AuthControls/>     nav drop-in: "Sign in" button, or Clerk's UserButton
//   window.clerk* helpers for non-React callers (the /api layer in Phase 2)
//
// Auth is intentionally low-friction: players build their whole entry
// anonymously (draft in localStorage); sign-in is only required at the
// "Lock in my entry" moment, where the entry is persisted server-side.

(function () {
  // Non-React helpers (usable anywhere, e.g. before/around fetch calls).
  window.clerkOpenSignIn = function (opts) {
    if (window.Clerk) window.Clerk.openSignIn(opts || {});
  };
  window.clerkOpenSignUp = function (opts) {
    if (window.Clerk) window.Clerk.openSignUp(opts || {});
  };
  window.clerkSignOut = function () {
    if (window.Clerk) return window.Clerk.signOut();
  };
  // Resolves to a short-lived session JWT (or null when signed out). The /api
  // routes verify this token server-side before reading/writing an entry.
  window.clerkGetToken = async function () {
    try {
      const c = await window.clerkReady;
      return c && c.session ? await c.session.getToken() : null;
    } catch (e) { return null; }
  };
  window.clerkUser = function () {
    return (window.Clerk && window.Clerk.user) || null;
  };
})();

// Human-friendly label for the signed-in player (used on the leaderboard).
function clerkDisplayName(user) {
  if (!user) return null;
  return (
    user.firstName ||
    user.username ||
    (user.primaryEmailAddress && user.primaryEmailAddress.emailAddress) ||
    "Player"
  );
}

// React hook: subscribes to Clerk and re-renders on any auth change
// (sign-in, sign-out, user update).
function useClerkAuth() {
  const [s, setS] = useState({ loaded: false, user: null });
  useEffect(() => {
    let alive = true;
    let unsub = null;
    if (!window.clerkReady) { setS({ loaded: true, user: null }); return; }
    window.clerkReady.then((clerk) => {
      if (!alive || !clerk) { if (alive) setS({ loaded: true, user: null }); return; }
      const sync = () => setS({ loaded: true, user: clerk.user || null });
      sync();
      unsub = clerk.addListener(sync); // fires on auth/session changes
    }).catch(() => { if (alive) setS({ loaded: true, user: null }); });
    return () => { alive = false; if (typeof unsub === "function") unsub(); };
  }, []);
  return {
    loaded: s.loaded,
    signedIn: !!s.user,
    user: s.user,
    displayName: clerkDisplayName(s.user),
  };
}

// Nav drop-in. Signed out -> a themed "Sign in" button. Signed in -> Clerk's
// own UserButton (avatar + account menu) mounted into a div.
function AuthControls() {
  const { loaded, signedIn } = useClerkAuth();
  const btnRef = useRef(null);

  useEffect(() => {
    if (signedIn && btnRef.current && window.Clerk) {
      window.Clerk.mountUserButton(btnRef.current, { afterSignOutUrl: "/" });
      const el = btnRef.current;
      return () => { try { window.Clerk.unmountUserButton(el); } catch (e) {} };
    }
  }, [signedIn]);

  if (!loaded) return null; // avoid a flash of the wrong control before Clerk resolves
  if (signedIn) return <div className="auth-userbtn" ref={btnRef} aria-label="Account" />;
  return (
    <button className="auth-signin" onClick={() => window.clerkOpenSignIn()}>
      Sign in
    </button>
  );
}

window.useClerkAuth = useClerkAuth;
window.AuthControls = AuthControls;
window.clerkDisplayName = clerkDisplayName;
