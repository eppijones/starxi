// STAR XI '26 — main app shell + routing

const STEPS = [
  { id: "welcome", num: "01", label: "Pick" },
  { id: "dreamxi", num: "02", label: "Star XI" },
  { id: "predict", num: "03", label: "Predict" },
  { id: "confirm", num: "04", label: "Confirm" },
  { id: "live",    num: "05", label: "Live" },
];

const DEFAULT_STATE = {
  nation: null,
  predictions: {},
  picks: [],
  formation: "4-3-3",
  captain: null,
  captainPlus: false,
  captainByMd: {},
  swaps: [],
  submitted: false,
  submittedAt: null,
};

// Tournament kickoff — Group A opener, Mexico City, Jun 11 2026.
const KICKOFF = new Date("2026-06-11T16:00:00Z");

// ——— Live / locked screen ———
// After you submit, your entry is locked in. Real per-matchday scoring is
// fed in by the backend during the tournament; until kickoff this shows a
// countdown + your entry summary.
function TournamentLive({ state, onEditPicks, onLeaderboard, onHistory }) {
  const nation = state.nation ? window.NATIONS.find(n => n.code === state.nation) : null;
  const predictions = state.predictions || {};
  const picks = state.picks || [];
  const formation = state.formation || "4-3-3";
  const predMade = window.FIXTURES.filter(f => {
    const p = predictions[f.id];
    return p && p.home != null && p.away != null;
  }).length;
  const xiCount = picks.length;
  const captain = state.captain ? window.PLAYERS.find(p => p.id === state.captain) : null;
  const boostMatches = nation
    ? window.FIXTURES.filter(f => f.home.code === nation.code || f.away.code === nation.code).length
    : 0;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ——— Real live results (prediction layer) ———
  // Pulls the cached /api/results proxy and maps it onto our fixtures. Degrades
  // silently to the pre-launch view when /api isn't reachable (local preview).
  const [liveResults, setLiveResults] = useState(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const payload = await window.fetchLiveResults();
      if (!alive) return;
      setLiveResults(payload ? window.buildLiveResults(payload) : null);
    };
    pull();
    const t = setInterval(pull, 60000); // edge-cached, so this is cheap
    return () => { alive = false; clearInterval(t); };
  }, []);

  // Live prediction points so far (real), using the existing scoring rules.
  const livePred = useMemo(() => {
    if (!liveResults || !liveResults.ok) return null;
    let pts = 0, scored = 0, bulls = 0;
    window.FIXTURES.forEach(fx => {
      const actual = liveResults.results[fx.id];
      if (!actual) return;
      const pred = predictions[fx.id];
      const isBoost = nation && (fx.home.code === nation.code || fx.away.code === nation.code);
      const r = window.scoreMatch(pred, actual, isBoost);
      pts += r.points; scored++; if (r.bullseye) bulls++;
    });
    return { pts, scored, bulls, played: liveResults.played, live: liveResults.live };
  }, [liveResults, predictions, nation]);

  const [copied, setCopied] = useState(false);

  // ——— Local "crowd context" (no backend needed) ———
  // The template XI = highest-form player per slot for this formation.
  const templateIds = useMemo(() => {
    const lim = window.FORMATIONS[formation];
    const ids = [];
    ["GK", "DF", "MF", "FW"].forEach(pos => {
      window.PLAYERS.filter(p => p.pos === pos)
        .sort((a, b) => b.form - a.form)
        .slice(0, lim[pos])
        .forEach(p => ids.push(p.id));
    });
    return ids;
  }, [formation]);

  const differentials = useMemo(
    () => picks.filter(id => !templateIds.includes(id))
      .map(id => window.PLAYERS.find(p => p.id === id)).filter(Boolean),
    [picks, templateIds]
  );
  const templatePct = picks.length ? Math.round((picks.length - differentials.length) / picks.length * 100) : 0;

  // Your boldest predicted upset = lower-ranked side backed to win, biggest gap.
  const { boldest, upsetCount } = useMemo(() => {
    let best = null, count = 0;
    window.FIXTURES.forEach(fx => {
      const p = predictions[fx.id];
      if (!p || p.home == null || p.away == null || p.home === p.away) return;
      const homeWin = p.home > p.away;
      const winner = homeWin ? fx.home : fx.away;
      const loser  = homeWin ? fx.away : fx.home;
      if (winner.rank > loser.rank) {
        count++;
        const gap = winner.rank - loser.rank;
        if (!best || gap > best.gap) best = { winner, loser, gap, score: `${p.home}–${p.away}` };
      }
    });
    return { boldest: best, upsetCount: count };
  }, [predictions]);

  const buildShare = () => {
    const capP = captain ? `${captain.flag} ${captain.name}` : "—";
    const L = ["⚽ My STAR XI '26 entry — locked in"];
    if (nation) L.push(`${nation.flag} ${nation.name} · 2× boost`);
    L.push(`${predMade}/72 scores called · Star XI ${formation} (${xiCount}/11)`);
    L.push(`Captain: ${capP}`);
    if (boldest) L.push(`Boldest call: ${boldest.winner.flag} ${boldest.winner.name} to beat ${boldest.loser.flag} ${boldest.loser.name}`);
    L.push("Build yours → starxi.app");
    return L.join("\n");
  };
  const doShare = async () => {
    const text = buildShare();
    try {
      if (navigator.share) { await navigator.share({ title: "STAR XI", text }); return; }
    } catch (e) { /* user cancelled */ return; }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true); setTimeout(() => setCopied(false), 2200);
    } catch (e) {}
  };

  if (!state.submitted) {
    return (
      <div className="screen">
        <div className="math-card" style={{ textAlign: "center" }}>
          <div className="eyebrow">Not locked in yet</div>
          <h3>Submit your entry to go live.</h3>
          <p>Build your Star XI (predictions optional), then hit <strong>Submit</strong> on the Confirm step. Your live scores appear here once you're in.</p>
          <div className="cta-row" style={{ marginTop: 18, justifyContent: "center" }}>
            <button className="btn gold" onClick={onEditPicks}>Finish my picks <span>→</span></button>
          </div>
        </div>
      </div>
    );
  }

  const ms = Math.max(0, KICKOFF.getTime() - now);
  const days = Math.floor(ms / 86400000);
  const hrs  = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  const live = ms === 0;
  const submittedDate = state.submittedAt
    ? new Date(state.submittedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
    : null;

  return (
    <div className="screen stagger">
      {/* Locked-in banner + compact countdown strip */}
      <div className="lockbar">
        <div className="lockbar-head">
          <span className="lock-badge">✓ Locked in</span>
          <strong>{live ? "The tournament is live" : "Your entry is set for the summer"}</strong>
          {submittedDate && <span className="lock-when">submitted {submittedDate}</span>}
        </div>
        {!live ? (
          <div className="countstrip" aria-label="time to kickoff">
            <span className="cs-lead">Kickoff</span>
            <span className="cs-unit"><b>{days}</b>d</span>
            <span className="cs-unit"><b>{String(hrs).padStart(2,"0")}</b>h</span>
            <span className="cs-unit"><b>{String(mins).padStart(2,"0")}</b>m</span>
            <span className="cs-unit"><b>{String(secs).padStart(2,"0")}</b>s</span>
          </div>
        ) : (
          <div className="countstrip live"><span className="cs-lead">● matchdays scoring now</span></div>
        )}
      </div>

      <div className="locked-grid">
        {/* LEFT — your XI, as locked */}
        <div className="locked-pitch-wrap">
          <div className="lp-head">
            <span className="eyebrow">Your Star XI</span>
            <span className="lp-form">{formation}{xiCount < 11 ? ` · ${xiCount}/11` : ""}</span>
          </div>
          {xiCount > 0 ? (
            <Pitch
              formation={formation}
              picks={picks}
              captain={state.captain}
              captainPlus={!!state.captainPlus}
              captainByMd={state.captainByMd || {}}
              readOnly
            />
          ) : (
            <div className="card" style={{ textAlign: "center", padding: 28 }}>
              <div className="empty-state">No squad locked — your predictions still score on their own.</div>
              <button className="btn ghost sm" onClick={onEditPicks} style={{ marginTop: 10 }}>Add a Star XI →</button>
            </div>
          )}
          <div className="lp-cap">
            {captain
              ? <>★ Captain <strong>{captain.flag} {captain.name}</strong> — scores ×2</>
              : (state.captainPlus ? "★ Captain+ · rotating per matchday" : "No captain set")}
          </div>
        </div>

        {/* RIGHT — entry at a glance + crowd context + actions */}
        <aside className="locked-side">
          <div className="entry-card">
            <div className="ec-nation">
              <span className="ec-flag">{nation ? nation.flag : "🏳️"}</span>
              <div>
                <div className="ec-name">{nation ? nation.name : "No nation"}</div>
                <div className="ec-sub">{nation ? `2× boost on ${boostMatches} matches` : "no boost set"}</div>
              </div>
            </div>
            <div className="ec-stats">
              <div className="ec-stat">
                <div className="n">{predMade}<em>/72</em></div>
                <div className="l">scores called</div>
              </div>
              <div className="ec-stat">
                <div className="n">{xiCount}<em>/11</em></div>
                <div className="l">squad picked</div>
              </div>
              <div className="ec-stat">
                <div className="n">{upsetCount}</div>
                <div className="l">upsets backed</div>
              </div>
            </div>
          </div>

          <div className="crowd-card">
            <div className="cc-title">How your entry stacks up</div>
            <div className="cc-row">
              <span className="cc-k">Template-y</span>
              <div className="cc-meter"><div className="cc-fill" style={{ width: `${templatePct}%` }}></div></div>
              <span className="cc-v">{templatePct}%</span>
            </div>
            <p className="cc-note">
              {xiCount === 0
                ? "Pick a Star XI to see how differential your squad is."
                : differentials.length === 0
                  ? "Pure chalk — every pick is a popular favourite. Safe, but hard to climb with."
                  : `${differentials.length} differential${differentials.length > 1 ? "s" : ""}: ${differentials.slice(0, 3).map(p => p.name).join(", ")}${differentials.length > 3 ? "…" : ""}. These are where you beat the crowd.`}
            </p>
            {boldest && (
              <div className="cc-bold">
                <span className="cc-bold-tag">Boldest call</span>
                <span>{boldest.winner.flag} <strong>{boldest.winner.name}</strong> {boldest.score} over {boldest.loser.flag} {boldest.loser.name} <i>(#{boldest.winner.rank} vs #{boldest.loser.rank})</i></span>
              </div>
            )}
          </div>

          <div className="locked-actions">
            <button className="btn gold sm" onClick={onLeaderboard}>🏆 Leaderboard</button>
            <button className="btn ghost sm" onClick={doShare}>{copied ? "✓ Copied!" : "↗ Share"}</button>
            <button className="btn ghost sm" onClick={onEditPicks}>Edit entry</button>
            <button className="btn ghost sm" onClick={onHistory}>📖 History</button>
          </div>

          <p className="locked-foot">
            Live daily scoring from real results — plus accounts and mini-leagues — land before kickoff.
            Until then this is your home base: tweak your entry any time before June 11.
          </p>
        </aside>
      </div>

      {/* Expandable: every group match with the score you called + live results */}
      <LockedFixtures
        predictions={predictions}
        nationCode={nation ? nation.code : null}
        live={live}
        results={liveResults}
        livePred={livePred}
      />
    </div>
  );
}

// All 72 group matches, collapsed by default. Shows the scoreline you called for
// each, your nation's 2× boost matches highlighted, and a result column that
// fills with the REAL scoreline + points you earned once matches kick off.
// Real data comes from /api/results (football-data.org) via `results`.
function LockedFixtures({ predictions, nationCode, live, results, livePred }) {
  const [open, setOpen] = useState(false);
  const [md, setMd] = useState(0); // 0 = all matchdays

  const fixtures = useMemo(
    () => (md ? window.FIXTURES.filter(f => f.matchday === md) : window.FIXTURES),
    [md]
  );
  const made = window.FIXTURES.filter(f => {
    const p = predictions[f.id];
    return p && p.home != null && p.away != null;
  }).length;

  const resultsById = results && results.ok ? results.results : null;
  const statusById = results && results.ok ? results.statusById : null;
  const hasLive = !!(livePred && (livePred.played + livePred.live) > 0);
  const headTail = hasLive
    ? `${livePred.played + livePred.live}/72 played · +${livePred.pts} pts`
    : `${made}/72 called · results at kickoff`;

  return (
    <section className="locked-fixtures">
      <button
        className={"lf-toggle" + (open ? " open" : "")}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="lf-chev">{open ? "▾" : "▸"}</span>
        <span className="lf-toggle-title">
          {hasLive ? "All 72 matches — your calls & live results" : "All 72 matches & the scores you called"}
        </span>
        <span className="lf-toggle-meta">{headTail}</span>
      </button>

      {open && (
        <div className="lf-body">
          {hasLive && (
            <div className="lf-live-banner">
              <span className="lf-live-dot" />
              <strong>+{livePred.pts}</strong> prediction points so far
              <i>· {livePred.played} final{livePred.live ? ` · ${livePred.live} in play` : ""} · {livePred.bulls} exact</i>
            </div>
          )}

          <div className="lf-tabs">
            {[{ k: 0, l: "All 72" }, { k: 1, l: "MD1" }, { k: 2, l: "MD2" }, { k: 3, l: "MD3" }].map(t => (
              <button
                key={t.k}
                className={"md-tab" + (md === t.k ? " sel" : "")}
                onClick={() => setMd(t.k)}
                style={{ borderRadius: 999, fontSize: 12, padding: "6px 13px" }}
              >{t.l}</button>
            ))}
          </div>

          <div className="lf-listhead" aria-hidden="true">
            <span className="lh-match">Match · your call</span>
            <span className="lh-result">{hasLive ? "Result · pts" : "Kickoff"}</span>
          </div>

          <div className="lf-list">
            {fixtures.map(fx => {
              const p = predictions[fx.id];
              const has = p && p.home != null && p.away != null;
              const boost = nationCode && (fx.home.code === nationCode || fx.away.code === nationCode);
              const actual = resultsById ? resultsById[fx.id] : null;
              const status = statusById ? statusById[fx.id] : null;
              const isLiveNow = status === "IN_PLAY" || status === "PAUSED";
              const score = actual ? window.scoreMatch(p, actual, boost) : null;
              return (
                <div key={fx.id} className={"lf-row" + (boost ? " boost" : "") + (has ? "" : " nopred") + (actual ? " hasresult" : "")}>
                  <span className="lf-grp" title={fx.venue}>
                    {fx.group}<i>{fx.matchday}</i>{boost && <b className="lf-star">★</b>}
                  </span>
                  <span className="lf-team home" title={`#${fx.home.rank}`}>
                    <span className="nm">{fx.home.name}</span>
                    <span className="em">{fx.home.flag}</span>
                  </span>
                  <span className="lf-score">
                    {has
                      ? <><b>{p.home}</b><i>–</i><b>{p.away}</b></>
                      : <span className="lf-nopred">·&nbsp;·</span>}
                  </span>
                  <span className="lf-team away" title={`#${fx.away.rank}`}>
                    <span className="em">{fx.away.flag}</span>
                    <span className="nm">{fx.away.name}</span>
                  </span>
                  <span className="lf-result">
                    {actual ? (
                      <span className="lf-actual">
                        {isLiveNow && <span className="lf-live-dot sm" title="in play" />}
                        <b className="lf-rscore">{actual.home}–{actual.away}</b>
                        {has && score && (
                          <b className={"lf-pts" + (score.points > 0 ? (score.bullseye ? " bull" : " win") : " zero")}>
                            {score.bullseye ? "★" : ""}+{score.points}
                          </b>
                        )}
                      </span>
                    ) : (
                      <span className="lf-date">{fx.date}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <p className="lf-foot">
            {hasLive
              ? "Real scorelines from football-data.org — exact score +5 (×2 on ★ your-nation matches), right result +3/+4. Updates every matchday."
              : "Real scorelines and your points per match appear here once the tournament kicks off on June 11. ★ = your nation's 2× boost matches."}
          </p>
        </div>
      )}
    </section>
  );
}

function App() {
  const initial = window.loadState();
  const [state, setState] = useState({ ...DEFAULT_STATE, ...(initial?.state || {}) });
  const [step, setStep] = useState(initial?.step || "welcome");

  useEffect(() => {
    window.saveState({ state, step });
  }, [state, step]);

  const goTo = (id) => {
    setStep(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ——— Auth-gated lock-in ———
  // Players build their whole entry anonymously; we only require a Clerk
  // sign-in at the "Lock in" moment, then persist the entry server-side.
  const auth = useClerkAuth();
  const pendingSubmit = useRef(false);
  const doSubmit = () => {
    setState(s => {
      const next = { ...s, submitted: true, submittedAt: s.submittedAt || Date.now() };
      // Persist to the server (best-effort; localStorage stays the UI's source of
      // truth, so a failed/unconfigured save never blocks locking in).
      if (window.wcxiSaveEntry) {
        Promise.resolve().then(() => window.wcxiSaveEntry(next, auth.displayName));
      }
      return next;
    });
    goTo("live");
  };
  const submit = () => {
    if (!auth.signedIn) {
      pendingSubmit.current = true;     // resume the lock-in after sign-in
      window.clerkOpenSignIn();
      return;
    }
    doSubmit();
  };
  // Finish a deferred lock-in once the player completes the Clerk flow.
  useEffect(() => {
    if (auth.signedIn && pendingSubmit.current) {
      pendingSubmit.current = false;
      doSubmit();
    }
  }, [auth.signedIn]);

  // ——— Cross-device hydrate ———
  // When a returning player signs in on a fresh device (no local draft yet),
  // pull their locked entry back from the server so it follows them everywhere.
  // We never clobber in-progress local work — only hydrate when local is empty.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!auth.loaded || !auth.signedIn || hydratedRef.current) return;
    if (!window.wcxiLoadEntry) return;
    hydratedRef.current = true;
    window.wcxiLoadEntry().then((res) => {
      const e = res && res.entry;
      if (!e) return;
      // Don't clobber local work: only hydrate when there's no local draft and
      // nothing has been locked in locally yet.
      if (state.submitted) return;
      const localHasProgress = !!(
        state.nation ||
        (state.picks && state.picks.length) ||
        (state.predictions && Object.keys(state.predictions).length)
      );
      if (localHasProgress) return;
      setState({
        nation: e.nation != null ? e.nation : null,
        predictions: e.predictions || {},
        picks: e.picks || [],
        formation: e.formation || "4-3-3",
        captain: e.captain != null ? e.captain : null,
        captainPlus: !!e.captainPlus,
        captainByMd: e.captainByMd || {},
        swaps: e.swaps || [],
        submitted: true,
        submittedAt: e.submittedAt || Date.now(),
      });
      goTo("live");
    });
  }, [auth.loaded, auth.signedIn]);
  const reset = () => {
    if (!confirm("Start over? This wipes your nation, predictions and Star XI.")) return;
    setState(DEFAULT_STATE);
    goTo("welcome");
  };

  const currentIdx = STEPS.findIndex(s => s.id === step);

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => goTo("welcome")}
          aria-label="STAR XI — home"
        >
          <img
            src="brand/star-xi-chalk.svg"
            alt=""
            className="crest-mark"
            style={{ width: 36, height: 38, display: "block" }}
          />
          <div className="brand-stack">
            <div className="brand-name">STAR XI</div>
            <div className="brand-sub">World Cup 2026 Edition</div>
          </div>
        </button>
        <div className="topbar-right">
        <nav className="steps" aria-label="progress">
          {STEPS.map((s, i) => {
            const cls = s.id === step ? "active" : i < currentIdx ? "done" : "";
            return (
              <button
                key={s.id}
                className={"step " + cls}
                onClick={() => goTo(s.id)}
                disabled={i > currentIdx && i !== currentIdx + 1 && step !== "history" && step !== "leaderboard"}
              >
                <span className="dot"></span>
                <span className="num">{s.num}</span>
                <span>{s.label}</span>
              </button>
            );
          })}
          <button
            className={"step extra" + (step === "leaderboard" ? " active" : "")}
            onClick={() => goTo("leaderboard")}
            title="Leaderboard & mini-leagues"
          >
            <span>🏆</span>
            <span>Table</span>
          </button>
          <button
            className={"step extra" + (step === "history" ? " active" : "")}
            onClick={() => goTo("history")}
            title="World Cup history & records"
          >
            <span>📖</span>
            <span>History</span>
          </button>
          <button
            onClick={reset}
            title="Reset progress"
            className="reset-btn"
          >Reset</button>
        </nav>
        <AuthControls />
        </div>
      </header>

      {step === "welcome" && (
        <Welcome
          state={state} setState={setState}
          onNext={() => goTo("dreamxi")}
          onHistory={() => goTo("history")}
        />
      )}
      {step === "dreamxi" && (
        <DreamXI state={state} setState={setState}
          onNext={() => goTo("predict")}
          onSkip={() => goTo("confirm")}
          onBack={() => goTo("welcome")} />
      )}
      {step === "predict" && (
        <Predict state={state} setState={setState}
          onNext={() => goTo("confirm")} onBack={() => goTo("dreamxi")} />
      )}
      {step === "confirm" && (
        <Confirm state={state} setState={setState}
          onSubmit={submit} onBack={() => goTo("predict")} />
      )}
      {step === "live" && (
        <TournamentLive state={state}
          onEditPicks={() => goTo("dreamxi")}
          onLeaderboard={() => goTo("leaderboard")}
          onHistory={() => goTo("history")} />
      )}
      {step === "leaderboard" && (
        <Leaderboard onEditPicks={() => goTo("dreamxi")} />
      )}
      {step === "history" && (
        <History onBack={() => goTo(currentIdx >= 0 ? STEPS[currentIdx]?.id || "welcome" : "welcome")} />
      )}

      <footer className="site-footer">
        <div className="footer-cols">
          <div>
            <strong className="ft-strong">STAR XI</strong>
            <p>STAR XI — a fan-made prediction + squad game for the summer of '26.</p>
          </div>
          <div>
            <strong className="ft-strong">Not affiliated with FIFA</strong>
            <p>
              Independent project. <em>Not</em> affiliated with, endorsed by,
              sponsored by, licensed by, or in any way officially connected
              with FIFA, the host federations or any tournament organiser.
              All trademarks, marks, names, logos and emblems are the property
              of their respective owners.
            </p>
          </div>
          <div>
            <strong className="ft-strong">Official tournament</strong>
            <p>
              For tickets, broadcasts, official squads, official mascots and
              official everything else:{" "}
              <a href="https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026"
                 target="_blank" rel="noopener noreferrer">fifa.com →</a>
            </p>
          </div>
        </div>
        <div className="footer-base">
          Built by fans, for fans · No real-money prizes · No ticket reselling ·
          Squad data provisional until 1 June 2026 · "World Cup™" is a trademark of FIFA, used here only as a factual descriptor — this is an independent fan project, not affiliated with FIFA.
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
