// MATCH-WATCH (temporary) — live NOR vs SWE friendly dashboard.
// Uses window.tallyUser + real /api/match-watch feed. Remove when test is done.

function MatchWatch({ onBack, useEntryState, entryState }) {
  const watchState = useMemo(
    () =>
      useEntryState && entryState && (entryState.picks || []).length >= 11
        ? entryState
        : window.MATCH_WATCH_STATE,
    [useEntryState, entryState]
  );

  const [payload, setPayload] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [fetchErr, setFetchErr] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const pull = useCallback(async () => {
    const p = await window.fetchMatchWatch({ date: "2026-06-01" });
    setLastFetch(new Date());
    if (!p) {
      setFetchErr("Could not reach /api/match-watch — use vercel dev, not python http.server");
      return;
    }
    setFetchErr(null);
    setPayload(p);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!alive) return;
      await pull();
    };
    run();
    return () => { alive = false; };
  }, [pull]);

  useEffect(() => {
    if (!payload) return;
    const ms = window.matchWatchPollMs(payload.match);
    const t = setInterval(pull, ms);
    return () => clearInterval(t);
  }, [payload && payload.match && payload.match.status, pull]);

  const sim = useMemo(
    () =>
      payload
        ? window.buildMatchWatchSim(payload, window.PLAYERS, watchState.picks)
        : { results: {}, bracket: null, playerEvents: null, match: null },
    [payload, watchState.picks]
  );

  const tally = useMemo(
    () => window.tallyUser(watchState, sim),
    [watchState, sim]
  );

  const m = payload && payload.match;
  const live =
    m &&
    (m.status === "IN_PLAY" ||
      m.status === "PAUSED" ||
      m.status === "LIVE");
  const finished = m && m.status === "FINISHED";

  const kickoffMs = m && m.utcDate ? new Date(m.utcDate).getTime() : null;
  const until =
    kickoffMs != null ? Math.max(0, kickoffMs - now) : null;

  const xiAnim = window.useCountUp(tally.xiPts, 800);

  const picks = (watchState.picks || []).map((id) =>
    window.PLAYERS.find((p) => p.id === id)
  ).filter(Boolean);

  const goalLog = (payload && payload.goals) || [];

  return (
    <div className="step-screen match-watch-screen">
      <div className="step-scroll stagger">
        <header className="mw-head">
          <div className="eyebrow">Match watch · temporary</div>
          <h2 className="mw-title">Norway vs Sweden — live scoring test</h2>
          <p className="mw-blurb">
            Polls <code>/api/match-watch</code> and scores your XI through the same{" "}
            <code>tallyUser</code> / <code>scoreEvents</code> path as production
            (4 pts goal · 3 assist · 2 clean sheet · captain ×2).
          </p>
        </header>

        {!payload || !payload.configured ? (
          <div className="math-card mw-card">
            <h3>API not configured</h3>
            <p>
              Add <strong>FOOTBALL_DATA_TOKEN</strong> to <code>.env.local</code>{" "}
              (football-data.org key), then run:
            </p>
            <pre className="mw-pre">vercel dev --listen 4321</pre>
            <p className="mw-note">
              A plain <code>python -m http.server</code> cannot serve{" "}
              <code>/api/*</code> — that is why the global leaderboard shows
              unavailable on port 4321 today.
            </p>
            <button className="btn ghost sm" onClick={pull}>Retry</button>
          </div>
        ) : !m ? (
          <div className="math-card mw-card">
            <p className="mw-connected">API connected</p>
            <h3>Match not in feed yet</h3>
            <p>{payload.note || "Could not find Norway vs Sweden on today's scoreboard."}</p>
            <p className="mw-note">
              Last check: {lastFetch ? lastFetch.toLocaleTimeString() : "—"}.
              Keep this tab open — it polls automatically.
            </p>
            <button className="btn ghost sm" onClick={pull}>Retry</button>
          </div>
        ) : (
          <>
            <section className="mw-scoreboard" aria-live="polite">
              <div className="mw-status">
                <span className={"mw-live-pill" + (live ? " on" : finished ? " done" : "")}>
                  {live ? "LIVE" : finished ? "FULL TIME" : m.status}
                </span>
                {m.minute != null && live && (
                  <span className="mw-minute">{m.minute}'</span>
                )}
                {lastFetch && (
                  <span className="mw-updated">
                    Updated {lastFetch.toLocaleTimeString()}
                    {payload.source && ` · ${payload.source}`}
                    {payload.requestsRemainingThisMinute != null &&
                      ` · ${payload.requestsRemainingThisMinute} req/min left`}
                  </span>
                )}
                {m.statusDetail && (
                  <span className="mw-minute">{m.statusDetail}</span>
                )}
              </div>
              <div className="mw-teams">
                <div className="mw-team">
                  <span className="mw-tla">{m.home.tla}</span>
                  <span className="mw-name">{m.home.name}</span>
                </div>
                <div className="mw-score">
                  <span className="mw-goals">
                    {m.score.home != null ? m.score.home : "–"}
                    <span className="mw-sep">:</span>
                    {m.score.away != null ? m.score.away : "–"}
                  </span>
                  {(m.score.halfHome != null || m.score.halfAway != null) && (
                    <span className="mw-ht">
                      HT {m.score.halfHome ?? "–"}–{m.score.halfAway ?? "–"}
                    </span>
                  )}
                </div>
                <div className="mw-team away">
                  <span className="mw-tla">{m.away.tla}</span>
                  <span className="mw-name">{m.away.name}</span>
                </div>
              </div>
              {until != null && until > 0 && !live && !finished && (
                <p className="mw-countdown">
                  Kickoff in {Math.floor(until / 3600000)}h{" "}
                  {Math.floor((until % 3600000) / 60000)}m{" "}
                  {Math.floor((until % 60000) / 1000)}s
                </p>
              )}
            </section>

            <section className="mw-points math-card">
              <div className="mw-pts-hero">
                <span className="mw-pts-label">Star XI points (this match → GW1)</span>
                <span className="mw-pts-val">{xiAnim}</span>
              </div>
              <p className="mw-pts-sub">
                Captain:{" "}
                {watchState.captain
                  ? (window.PLAYERS.find((p) => p.id === watchState.captain) || {}).name
                  : "none"}
                {watchState.captain ? " (×2 on goals/assists/CS)" : ""}
              </p>
            </section>

            <section className="mw-section">
              <h3>Goal log (API)</h3>
              {goalLog.length === 0 ? (
                <p className="mw-empty">No goals in feed yet.</p>
              ) : (
                <ul className="mw-goals-list">
                  {goalLog.map((g, i) => {
                    const mapped = window.findPlayerForScorer(
                      g.scorer,
                      g.teamTla,
                      window.PLAYERS
                    );
                    return (
                      <li key={i}>
                        <span className="mw-g-min">{g.minute}'</span>
                        <span className="mw-g-scorer">{g.scorer}</span>
                        <span className="mw-g-team">{g.teamTla}</span>
                        {g.assist && (
                          <span className="mw-g-assist">A: {g.assist}</span>
                        )}
                        <span className={"mw-g-map" + (mapped ? " hit" : " miss")}>
                          {mapped ? `→ ${mapped.name} (${mapped.id})` : "→ unmapped"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="mw-section">
              <h3>Your test XI — per player</h3>
              <div className="mw-xi-grid">
                {tally.xiBreakdown.map(({ slotId, mdLines, total }) => {
                  const p =
                    mdLines[0].player ||
                    window.PLAYERS.find((x) => x.id === slotId);
                  const line = mdLines[0];
                  return (
                    <div key={slotId} className="mw-xi-row">
                      <div className="mw-xi-name">
                        {p && <span className="em">{p.flag}</span>}
                        {p ? p.name : slotId}
                        {line.isCap && <span className="mw-cap">★</span>}
                      </div>
                      <div className="mw-xi-ev">
                        {line.events.goals ? `${line.events.goals}G ` : ""}
                        {line.events.assists ? `${line.events.assists}A ` : ""}
                        {(p?.pos === "GK" || p?.pos === "DF") && line.events.sheets
                          ? `${line.events.sheets}CS `
                          : ""}
                        {!line.events.goals &&
                          !line.events.assists &&
                          !line.events.sheets &&
                          "–"}
                      </div>
                      <div className="mw-xi-pts">{total} pts</div>
                    </div>
                  );
                })}
              </div>
              {!useEntryState && (
                <p className="mw-note">
                  Using built-in NOR/SWE test squad. Lock in your own XI in the
                  app to watch your picks instead.
                </p>
              )}
            </section>
          </>
        )}

        {fetchErr && <p className="mw-err">{fetchErr}</p>}

        <div className="mw-debug">
          <button
            className="btn ghost sm"
            onClick={() => setShowRaw((s) => !s)}
          >
            {showRaw ? "Hide" : "Show"} raw API
          </button>
          {showRaw && (
            <pre className="mw-pre">{JSON.stringify(payload, null, 2)}</pre>
          )}
        </div>
      </div>

      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>
          ← Back
        </button>
        <span className="grow"></span>
        <button className="pill ghost sm" onClick={pull}>
          ↻ Refresh now
        </button>
      </div>
    </div>
  );
}

window.MatchWatch = MatchWatch;
