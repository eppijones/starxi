// WORLD CUP XI — leaderboard screen (global + private mini-leagues).
//
// Talks to the server-scored endpoints:
//   window.wcxiLeaderboard({ code?, limit? })  -> ranked table for a scope
//   window.wcxiLeagues()                        -> the player's leagues
//   window.wcxiCreateLeague / JoinLeague / LeaveLeague
//
// Everything degrades gracefully: signed-out players get a sign-in nudge, and
// when storage isn't provisioned yet (local preview / pre-launch) we show a
// friendly "goes live at kickoff" panel instead of an error.

function LbRow({ row, mode }) {
  const cls = "league-row" + (row.isYou ? " you" : "");
  const bits = [];
  if (mode === "combined") {
    if (row.xiPts > 0) bits.push(`${row.xiPts} XI`);
    if (row.predictionPts > 0) bits.push(`+${row.predictionPts} Road`);
    if (row.bullseyes) bits.push(`${row.bullseyes}★`);
  } else {
    if (row.predictionPts > 0) bits.push(`+${row.predictionPts} Road bonus`);
    if (row.bullseyes) bits.push(`${row.bullseyes} perfect`);
  }
  const sub = bits.join(" · ") || (mode === "xionly" ? "Star XI only" : "no picks yet");
  const ultimate = mode === "combined" && row.rank === 1 && row.xiPts > 0 && row.predictionPts > 0;
  return (
    <div className={cls}>
      <span className="rank">{row.rank}</span>
      <span className="nm">
        {row.isYou ? "You" : row.name}
        {ultimate && (
          <span className="lb-crown" title="Ultimate champion: tops the table with a strong XI and Road picks">👑</span>
        )}
        <small>{sub}</small>
      </span>
      <span className="pts">{row.pts}</span>
    </div>
  );
}

function LbTable({ data, loading, onRefresh, mode, onModeChange, leagueRtfEnabled }) {
  if (loading && !data) {
    return <div className="empty-state">Loading the table…</div>;
  }
  if (!data) {
    return <div className="empty-state">Couldn't load the table. Try again.</div>;
  }
  if (data.configured === false) {
    return (
      <div className="lb-soft">
        <div className="lb-soft-emoji">🏆</div>
        <h3>Leaderboards go live at kickoff</h3>
        <p>
          Once the tournament server is switched on, you'll see the global table
          and your private mini-leagues here, scored automatically from real
          results. Your entry is already saved.
        </p>
      </div>
    );
  }
  if (data.ok === false) {
    return (
      <div className="lb-soft">
        <div className="lb-soft-emoji">📡</div>
        <h3>Table unavailable right now</h3>
        <p>The leaderboard couldn't be reached. It'll be back shortly.</p>
        <button className="btn ghost sm" onClick={onRefresh}>↻ Retry</button>
      </div>
    );
  }

  const top = data.top || [];
  const you = data.you || null;
  const youInTop = !!(you && top.some((r) => r.isYou));
  const played = data.played || 0;
  const activeMode = data.mode || mode;
  const rtfLocked = leagueRtfEnabled === false;

  return (
    <div className="lb-table-wrap">
      <div className="lb-meta">
        <span>
          <strong>{data.total}</strong> {data.total === 1 ? "player" : "players"}
        </span>
        <span className="lb-dot">·</span>
        <span>
          {played > 0
            ? <><strong>{played}</strong>/72 matches played</>
            : "no matches played yet"}
        </span>
        <button className="lb-refresh" onClick={onRefresh} title="Refresh">↻</button>
      </div>

      {/* Mode switcher — hidden when league has RTF disabled (forced xionly) */}
      {!rtfLocked && (
        <div className="lb-mode-tabs">
          <button
            className={"lb-mode-tab" + (activeMode !== "xionly" ? " sel" : "")}
            onClick={() => onModeChange("combined")}
          >Combined</button>
          <button
            className={"lb-mode-tab" + (activeMode === "xionly" ? " sel" : "")}
            onClick={() => onModeChange("xionly")}
          >Star XI only</button>
        </div>
      )}

      {/* Nudge: you have no Road-to-Final picks but others might */}
      {you && you.predictionPts === 0 && activeMode !== "xionly" && !rtfLocked && (
        <div className="lb-rtf-nudge">
          <span className="lb-rtf-nudge-icon">🗺️</span>
          <span>Fill in your <strong>Road to the Final</strong> picks to score bonus points and compete fully.</span>
        </div>
      )}

      {top.length === 0 ? (
        <div className="empty-state">
          No entries here yet. Be the first to lock one in.
        </div>
      ) : (
        <div className="lb-rows">
          {top.map((r) => (
            <LbRow key={r.rank + ":" + r.name} row={r} mode={activeMode} />
          ))}
          {/* Pin the player's own row when they're outside the visible top N. */}
          {you && !youInTop && (
            <>
              <div className="lb-gap">⋯</div>
              <LbRow row={you} mode={activeMode} />
            </>
          )}
        </div>
      )}

      <p className="lb-legend">
        {activeMode === "xionly"
          ? <>Ranked on <strong>Star XI points</strong> only — Road-to-the-Final picks not counted here.</>
          : <>Ranked on <strong>combined points</strong> (Star XI + Road to the Final). Top both and you're the <strong>ultimate champion</strong> 👑.</>
        }
      </p>
    </div>
  );
}

function LbManage({ leagues, onCreated, onJoined, onLeft, onRtfToggled, onClose }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(null);
  const [newCode, setNewCode] = useState(null); // code of freshly-created league

  const create = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await window.wcxiCreateLeague(name.trim() || "My League");
    setBusy(false);
    if (r && r.ok) {
      setName("");
      setNewCode(r.code);
      onCreated && onCreated(r.code);
    } else {
      setMsg("Couldn't create the league. Try again.");
    }
  };
  const join = async () => {
    if (busy) return;
    const c = code.trim();
    if (!c) return;
    setBusy(true); setMsg(null);
    const r = await window.wcxiJoinLeague(c);
    setBusy(false);
    if (r && r.ok) { setCode(""); onJoined && onJoined(r.code); }
    else if (r && r.error === "no_such_league") setMsg("No league with that code.");
    else setMsg("Couldn't join. Check the code and try again.");
  };
  const leave = async (c) => {
    if (busy) return;
    if (!confirm("Leave this league?")) return;
    setBusy(true);
    const r = await window.wcxiLeaveLeague(c);
    setBusy(false);
    if (r && r.ok) onLeft && onLeft(c);
  };
  const toggleRtf = async (c) => {
    if (busy) return;
    setBusy(true);
    const r = await window.wcxiToggleLeagueRtf(c);
    setBusy(false);
    if (r && r.ok) onRtfToggled && onRtfToggled(c, r.roadToFinalEnabled);
  };
  const copy = async (c) => {
    try {
      await navigator.clipboard.writeText(c);
      setCopied(c);
      setTimeout(() => setCopied(null), 1800);
    } catch (e) {}
  };

  return (
    <div className="lb-manage">
      <div className="lb-manage-grid">
        <div className="lb-form card flat">
          <div className="eyebrow">Start a league</div>
          <p className="lb-form-note">Create a private table and share the code with friends.</p>
          <input
            className="lb-input"
            placeholder="League name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="btn gold sm" disabled={busy} onClick={create}>Create league</button>

          {/* League code reveal — shown immediately after creation */}
          {newCode && (
            <div className="lb-new-code-reveal">
              <div className="lb-new-code-label">League created! Share this code:</div>
              <button
                className={"lb-new-code-btn" + (copied === newCode ? " copied" : "")}
                onClick={() => copy(newCode)}
                title="Copy join code"
              >
                <span className="lb-new-code-val">{newCode}</span>
                <span className="lb-new-code-copy">{copied === newCode ? "✓ copied" : "📋 copy"}</span>
              </button>
              <div className="lb-new-code-hint">Friends paste this in "Join a league"</div>
            </div>
          )}
        </div>

        <div className="lb-form card flat">
          <div className="eyebrow">Join a league</div>
          <p className="lb-form-note">Got a code from a friend? Drop it in.</p>
          <input
            className="lb-input mono"
            placeholder="e.g. 7KQ4P"
            value={code}
            maxLength={8}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          <button className="btn ghost sm" disabled={busy} onClick={join}>Join league</button>
        </div>
      </div>

      {msg && <div className="lb-msg">{msg}</div>}

      {leagues.length > 0 && (
        <div className="lb-mylist">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Your leagues</div>
          {leagues.map((l) => (
            <div className="lb-mylist-row" key={l.code}>
              <div className="lb-ml-name">
                {l.name}
                <small>
                  {l.memberCount} {l.memberCount === 1 ? "member" : "members"}
                  {l.owner ? " · you own this" : ""}
                </small>
              </div>
              <button className="lb-code" onClick={() => copy(l.code)} title="Copy join code">
                {copied === l.code ? "✓" : l.code}
              </button>
              {l.owner && (
                <button
                  className={"lb-rtf-toggle" + (l.roadToFinalEnabled !== false ? " on" : " off")}
                  onClick={() => toggleRtf(l.code)}
                  disabled={busy}
                  title={l.roadToFinalEnabled !== false
                    ? "Road-to-the-Final scoring is ON — click to disable"
                    : "Road-to-the-Final scoring is OFF — click to enable"}
                >
                  {l.roadToFinalEnabled !== false ? "🗺️ Road on" : "🗺️ Road off"}
                </button>
              )}
              <button className="lb-leave" onClick={() => leave(l.code)} title="Leave league">Leave</button>
            </div>
          ))}
        </div>
      )}

      <div className="lb-manage-foot">
        <button className="btn ghost sm" onClick={onClose}>← Back to table</button>
      </div>
    </div>
  );
}

function Leaderboard({ onEditPicks, onBack }) {
  const auth = useClerkAuth();
  const [scope, setScope] = useState({ kind: "global", code: null }); // or {kind:"league",code} | {kind:"manage"}
  const [lbMode, setLbMode] = useState("combined"); // "combined" | "xionly"
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [leagues, setLeagues] = useState([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const reqIdRef = useRef(0);

  const copyCode = async (c) => {
    try {
      await navigator.clipboard.writeText(c);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
    } catch (e) {}
  };

  // Pull the player's leagues (for the scope switcher) whenever they sign in.
  const refreshLeagues = useCallback(async () => {
    if (!auth.signedIn) { setLeagues([]); return; }
    const r = await window.wcxiLeagues();
    setLeagues((r && r.ok && r.leagues) || []);
  }, [auth.signedIn]);

  useEffect(() => { refreshLeagues(); }, [refreshLeagues]);

  // Load the table for the active scope.
  const loadTable = useCallback(async () => {
    if (!auth.signedIn) return;
    if (scope.kind === "manage") return;
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const opts = scope.kind === "league"
      ? { code: scope.code, limit: 100, mode: lbMode }
      : { limit: 100, mode: lbMode };
    const r = await window.wcxiLeaderboard(opts);
    if (myReq !== reqIdRef.current) return; // a newer request superseded this one
    setData(r);
    setLoading(false);
  }, [auth.signedIn, scope, lbMode]);

  useEffect(() => { loadTable(); }, [loadTable]);

  if (!auth.loaded) {
    return (
      <div className="step-screen">
        <div className="step-scroll" style={{ display: "grid", placeItems: "center" }}>
          <div className="empty-state">…</div>
        </div>
      </div>
    );
  }

  if (!auth.signedIn) {
    return (
      <div className="step-screen">
        <div className="step-scroll stagger">
          <div className="lb-screen">
            <div className="lb-head">
              <h2 className="lb-title">See where you stand</h2>
            </div>
            <div className="lb-soft">
              <div className="lb-soft-emoji">🔐</div>
              <h3>Sign in to see the table</h3>
              <p>
                The global leaderboard and your private mini-leagues live with your
                account, so they follow you across devices. Sign in to view your rank.
              </p>
              <button className="btn gold" onClick={() => window.clerkOpenSignIn()}>Sign in</button>
            </div>
          </div>
        </div>
        <div className="step-foot">
          <button className="pill ghost sm" onClick={onBack}>← Back to my entry</button>
        </div>
      </div>
    );
  }

  const goManage = () => setScope({ kind: "manage", code: null });
  const afterLeagueChange = async (code, switchTo) => {
    await refreshLeagues();
    if (switchTo && code) setScope({ kind: "league", code });
  };
  const afterRtfToggle = async (code, enabled) => {
    // Refresh leagues list so the toggle state updates, and reload the table
    // in case the mode was forced by the old RTF setting.
    await refreshLeagues();
    setData(null); // force reload
  };

  return (
    <div className="step-screen">
      <div className="step-scroll stagger">
        <div className="lb-screen">
          <div className="lb-head">
            <h2 className="lb-title">
              {scope.kind === "manage"
                ? "Mini-leagues"
                : scope.kind === "league" && data && data.name
                  ? data.name
                  : "Global table"}
            </h2>
            {scope.kind === "league" && scope.code && (
              <button
                className={"lb-code-chip" + (codeCopied ? " copied" : "")}
                onClick={() => copyCode(scope.code)}
                title="Copy invite code"
              >
                <span className="lb-code-chip-label">Invite code</span>
                <span className="lb-code-chip-val">{scope.code}</span>
                <span className="lb-code-chip-icon">{codeCopied ? "✓" : "📋"}</span>
              </button>
            )}
          </div>

          <div className="lb-scopes">
            <button
              className={"lb-scope" + (scope.kind === "global" ? " sel" : "")}
              onClick={() => setScope({ kind: "global", code: null })}
            >🌍 Global</button>
            {leagues.map((l) => (
              <button
                key={l.code}
                className={"lb-scope" + (scope.kind === "league" && scope.code === l.code ? " sel" : "")}
                onClick={() => setScope({ kind: "league", code: l.code })}
                title={`${l.memberCount} members`}
              >
                {l.name}<small>{l.memberCount}</small>
              </button>
            ))}
            <button
              className={"lb-scope add" + (scope.kind === "manage" ? " sel" : "")}
              onClick={goManage}
            >＋ League</button>
          </div>

          {scope.kind === "manage" ? (
            <LbManage
              leagues={leagues}
              onCreated={(code) => afterLeagueChange(code, true)}
              onJoined={(code) => afterLeagueChange(code, true)}
              onLeft={(code) => afterLeagueChange(code, false)}
              onRtfToggled={afterRtfToggle}
              onClose={() => setScope({ kind: "global", code: null })}
            />
          ) : (
            <LbTable
              data={data}
              loading={loading}
              onRefresh={loadTable}
              mode={lbMode}
              onModeChange={(m) => setLbMode(m)}
              leagueRtfEnabled={
                scope.kind === "league"
                  ? (leagues.find(l => l.code === scope.code) || {}).roadToFinalEnabled
                  : true
              }
            />
          )}
        </div>
      </div>
      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>← Back to my entry</button>
        <span className="grow"></span>
        <button className="pill ghost sm" onClick={onEditPicks}>Edit my entry</button>
      </div>
    </div>
  );
}

window.Leaderboard = Leaderboard;
