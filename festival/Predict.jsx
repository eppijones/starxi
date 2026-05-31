// DREAM XI '26 — Screen 2: Predict (72 group matches)

function Predict({ state, setState, onNext, onBack }) {
  const [md, setMd] = useState(1);
  const [view, setView] = useState("cards"); // "cards" | "list"
  const nation = state.nation;
  const predictions = state.predictions || {};

  const fixtures = useMemo(() => window.FIXTURES.filter(f => f.matchday === md), [md]);
  const mdCounts = useMemo(() => {
    return [1, 2, 3].map(n => {
      const total = window.FIXTURES.filter(f => f.matchday === n).length;
      const made  = window.FIXTURES.filter(f => f.matchday === n &&
        predictions[f.id] && predictions[f.id].home != null && predictions[f.id].away != null
      ).length;
      return { md: n, made, total };
    });
  }, [predictions]);

  const totalMade = mdCounts.reduce((a, b) => a + b.made, 0);
  const totalFix = 72;
  const pct = (totalMade / totalFix) * 100;
  const mdMade = mdCounts[md - 1]?.made || 0;

  // Setting either side commits the match: the untouched side snaps to 0 so a
  // single tap gives a complete, real scoreline (and the match counts as "made").
  const set = (fxId, side, value) => {
    const val = Math.max(0, Math.min(9, value));
    setState(s => {
      const prev = (s.predictions || {})[fxId] || { home: null, away: null };
      const other = side === "home" ? "away" : "home";
      const next = { ...prev, [side]: val };
      if (next[other] == null) next[other] = 0;
      return { ...s, predictions: { ...s.predictions, [fxId]: next } };
    });
  };

  const favFor = (fx) => {
    const gap = fx.away.rank - fx.home.rank; // +ve = home is better
    let h = 1, a = 1;
    if (gap > 40)       { h = 3; a = 0; }
    else if (gap > 22)  { h = 2; a = 0; }
    else if (gap > 10)  { h = 2; a = 1; }
    else if (gap > 3)   { h = 1; a = 0; }
    else if (gap > -4)  { h = 1; a = 1; }
    else if (gap > -11) { h = 0; a = 1; }
    else if (gap > -23) { h = 1; a = 2; }
    else if (gap > -41) { h = 0; a = 2; }
    else                { h = 0; a = 3; }
    return { home: h, away: a };
  };

  const autofill = () => {
    setState(s => {
      const fresh = { ...s.predictions };
      window.FIXTURES.forEach(fx => {
        const cur = fresh[fx.id];
        if (cur && cur.home != null && cur.away != null) return;
        fresh[fx.id] = favFor(fx);
      });
      return { ...s, predictions: fresh };
    });
  };

  // Fill just the matchday on screen — gives you a starting point to tweak.
  const autofillMd = () => {
    setState(s => {
      const fresh = { ...s.predictions };
      window.FIXTURES.filter(f => f.matchday === md).forEach(fx => {
        fresh[fx.id] = favFor(fx);
      });
      return { ...s, predictions: fresh };
    });
  };

  const clearAll = () => {
    setState(s => ({ ...s, predictions: {} }));
  };

  return (
    <div className="screen stagger">
      <div className="predict-head">
        <div>
          <div className="eyebrow">Step 3 · Optional bonus</div>
          <h2 className="title">Call the scores</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            Optional — skip straight to lock-in if you like. But call the 72
            group scores and the points stack on top of your XI, putting the
            ultimate-champion title in reach. Pink card = your nation, doubled.
          </p>
        </div>
        <div className="predict-actions">
          <div className="view-toggle" role="tablist" aria-label="Layout">
            <button className={"vt" + (view === "cards" ? " sel" : "")} onClick={() => setView("cards")} aria-pressed={view === "cards"}>▦ Cards</button>
            <button className={"vt" + (view === "list" ? " sel" : "")} onClick={() => setView("list")} aria-pressed={view === "list"}>≣ List</button>
          </div>
          <button className="btn ghost sm" onClick={autofill}>Auto-fill all</button>
          <button className="btn ghost sm" onClick={clearAll}>Clear</button>
        </div>
      </div>

      <div className="md-bar">
        <div className="md-tabs" role="tablist" aria-label="Matchday">
          {mdCounts.map(({ md: n, made, total }) => (
            <button
              key={n}
              role="tab"
              aria-selected={md === n}
              className={"md-tab" + (md === n ? " sel" : "")}
              onClick={() => setMd(n)}
            >
              MD{n}
              <span className="ct">{made}/{total}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost sm md-fill" onClick={autofillMd}>
          Fill MD{md} with favourites
          <span className="md-fill-sub">{mdMade}/24 set</span>
        </button>
      </div>

      {view === "cards" ? (
        <div className="match-grid">
          {fixtures.map(fx => {
            const pred = predictions[fx.id] || { home: null, away: null };
            const boost = nation && (fx.home.code === nation || fx.away.code === nation);
            return (
              <MatchPredictCard
                key={fx.id}
                fx={fx}
                pred={pred}
                boost={!!boost}
                onSet={(side, v) => set(fx.id, side, v)}
              />
            );
          })}
        </div>
      ) : (
        <div className="predict-list">
          {fixtures.map(fx => {
            const pred = predictions[fx.id] || { home: null, away: null };
            const boost = nation && (fx.home.code === nation || fx.away.code === nation);
            return (
              <MatchPredictRow
                key={fx.id}
                fx={fx}
                pred={pred}
                boost={!!boost}
                onSet={(side, v) => set(fx.id, side, v)}
              />
            );
          })}
        </div>
      )}

      <div className="progress-bar">
        <div className="label">Predictions made</div>
        <div className="bar"><div className="fill" style={{ width: `${pct}%` }}></div></div>
        <div className="count">{totalMade}<em>/{totalFix}</em></div>
        <button className="btn gold sm" onClick={onNext}>
          Continue · Confirm <span>→</span>
        </button>
      </div>
    </div>
  );
}

// Shared tap-to-set score control. Tap the number (or +) to add a goal, – to
// remove one, or focus it and type a digit / use arrow keys.
function ScoreCell({ value, predicted, onChange, label, size }) {
  const v = value ?? 0;
  const onKey = (e) => {
    if (e.key >= "0" && e.key <= "9") { onChange(parseInt(e.key, 10)); e.preventDefault(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowRight") { onChange(v + 1); e.preventDefault(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { onChange(v - 1); e.preventDefault(); }
    else if (e.key === "Backspace" || e.key === "Delete") { onChange(0); e.preventDefault(); }
  };
  return (
    <div className={"score-set" + (size === "sm" ? " sm" : "")}>
      <button className="ss-btn" tabIndex={-1} onClick={() => onChange(v - 1)} disabled={v <= 0} aria-label={`fewer goals ${label}`}>–</button>
      <button
        className={"ss-num" + (predicted ? "" : " empty")}
        onClick={() => onChange(v + 1)}
        onKeyDown={onKey}
        aria-label={`${label} — ${predicted ? v + " goals" : "not predicted"}, tap to add`}
      >{v}</button>
      <button className="ss-btn" tabIndex={-1} onClick={() => onChange(v + 1)} aria-label={`more goals ${label}`}>+</button>
    </div>
  );
}

// Favourite read, derived purely from the FIFA ranks we already show — no paid
// odds feed needed. A rough guide to nudge a scoreline, not a betting line.
function matchFavByRank(fx) {
  const gap = fx.away.rank - fx.home.rank; // +ve = home is higher-ranked (better)
  const mag = Math.abs(gap);
  if (mag <= 3) return { side: null, label: "Too close to call" };
  const label = mag <= 12 ? "Slight edge" : mag <= 30 ? "Favourite" : "Heavy favourite";
  const team = gap > 0 ? fx.home : fx.away;
  return { side: gap > 0 ? "home" : "away", label, team };
}

function MatchPredictCard({ fx, pred, boost, onSet }) {
  const predicted = pred.home != null && pred.away != null;
  const fav = matchFavByRank(fx);
  return (
    <div className={"match-card" + (boost ? " boost" : "") + (predicted ? " done" : "")}>
      <div className="mc-meta">
        <span className="grp">Grp {fx.group} · MD{fx.matchday}</span>
        <span className="mc-when" title={fx.venue}>{fx.date} · {fx.time}</span>
        {boost && <span className="boost-tag">★ 2×</span>}
      </div>
      <div className="mc-body">
        <div className="team home" title={`#${fx.home.rank} · star: ${fx.home.star}`}>
          <span className="em">{fx.home.flag}</span>
          <span className="nm">{fx.home.name}</span>
          <span className="rk">#{fx.home.rank}</span>
        </div>
        <div className="mc-score">
          <ScoreCell value={pred.home} predicted={predicted} label={fx.home.name} onChange={v => onSet("home", v)} />
          <span className="mc-dash">–</span>
          <ScoreCell value={pred.away} predicted={predicted} label={fx.away.name} onChange={v => onSet("away", v)} />
        </div>
        <div className="team away" title={`#${fx.away.rank} · star: ${fx.away.star}`}>
          <span className="em">{fx.away.flag}</span>
          <span className="nm">{fx.away.name}</span>
          <span className="rk">#{fx.away.rank}</span>
        </div>
      </div>
      <div className={"mc-fav" + (fav.side ? " fav-" + fav.side : " fav-even")}
           title={`By FIFA ranking — #${fx.home.rank} vs #${fx.away.rank}`}>
        {fav.side ? (
          <>
            <span className="mcf-ico">★</span>
            <span className="mcf-team">{fav.team.flag} {fav.team.name}</span>
            <span className="mcf-label">{fav.label}</span>
          </>
        ) : (
          <span className="mcf-label">⚖ {fav.label}</span>
        )}
      </div>
    </div>
  );
}

function MatchPredictRow({ fx, pred, boost, onSet }) {
  const predicted = pred.home != null && pred.away != null;
  return (
    <div className={"pmatch-row" + (boost ? " boost" : "") + (predicted ? " done" : "")}>
      <span className="pmr-grp" title={`${fx.date} · ${fx.time} · ${fx.venue}`}>{fx.group}<i>{fx.matchday}</i></span>
      <span className="pmr-team home" title={`#${fx.home.rank} · ${fx.home.star}`}>
        <span className="nm">{fx.home.name}</span>
        <span className="em">{fx.home.flag}</span>
      </span>
      <div className="mc-score sm">
        <ScoreCell value={pred.home} predicted={predicted} size="sm" label={fx.home.name} onChange={v => onSet("home", v)} />
        <span className="mc-dash">–</span>
        <ScoreCell value={pred.away} predicted={predicted} size="sm" label={fx.away.name} onChange={v => onSet("away", v)} />
      </div>
      <span className="pmr-team away" title={`#${fx.away.rank} · ${fx.away.star}`}>
        <span className="em">{fx.away.flag}</span>
        <span className="nm">{fx.away.name}</span>
      </span>
      <span className="pmr-boost">{boost ? "★" : ""}</span>
    </div>
  );
}

window.Predict = Predict;
