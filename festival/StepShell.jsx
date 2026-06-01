// STAR XI — shared step chrome
// One source of truth for the fixed top-centre brand lockup + the 100vh paged
// shell every screen lives in. The lockup never moves between screens (it's the
// fixed anchor the whole layout is built around); content lives in a single
// viewport with a pinned Back/Next action bar instead of long-scroll pages.

// The brand crest, drawn once. Used by the landing AND every step so the
// lockup is pixel-identical and always in the same place.
function BrandLockup({ onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={"brand-lockup" + (onClick ? " is-link" : "")}
      onClick={onClick || undefined}
      aria-label={onClick ? "STAR XI — back to start" : "STAR XI"}
    >
      <svg className="bl-crest" width="40" viewBox="0 0 200 210" fill="none" aria-hidden="true">
        <path d="M48,24 L152,24 Q166,24 166,48 Q166,110 146,148 Q126,184 100,196 Q74,184 54,148 Q34,110 34,48 Q34,24 48,24 Z"
              stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
        <g transform="translate(100,110) scale(0.9) translate(-100,-110)">
          <path d="M48,24 L152,24 Q166,24 166,48 Q166,110 146,148 Q126,184 100,196 Q74,184 54,148 Q34,110 34,48 Q34,24 48,24 Z"
                stroke="#fff" strokeWidth="3" fill="none" />
        </g>
        <polygon points="100,37 103.41,47.31 114.27,47.36 105.52,53.79 108.82,64.14 100,57.8 91.18,64.14 94.48,53.79 85.73,47.36 96.59,47.31" fill="#fff" />
        <g fill="#fff">
          <polygon points="55,80 75,80 117,148 97,148" />
          <polygon points="97,80 117,80 75,148 55,148" />
          <polygon points="125,80 145,80 145,148 125,148" />
        </g>
      </svg>
      <div className="bl-name">STAR XI</div>
      <div className="bl-sub">World Cup 2026 Edition</div>
    </Tag>
  );
}

// The compact step tracker that sits under the lockup. Shows where you are in
// the 5-step flow; tapping a reachable step jumps there.
function StepProgress({ steps, currentIdx, step, goTo }) {
  return (
    <nav className="shell-progress" aria-label="progress">
      {steps.map((s, i) => {
        const isActive = s.id === step;
        const isDone = i < currentIdx;
        const reachable = i <= currentIdx + 1 || step === "history" || step === "leaderboard";
        return (
          <button
            key={s.id}
            className={"sp-step" + (isActive ? " active" : isDone ? " done" : "")}
            onClick={() => goTo(s.id)}
            disabled={!reachable}
          >
            <span className="sp-num">{s.num}</span>
            <span className="sp-label">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// The shell: fixed lockup + progress + top-right utility cluster, wrapping a
// single-viewport body. Screens render their own content + a .step-foot action
// row inside; the shell guarantees the chrome stays put.
function StepShell({ step, steps, currentIdx, goTo, reset, ghost, children }) {
  const isFlow = step !== "history" && step !== "leaderboard";
  return (
    <div className="step-shell">
      {ghost && (
        <div className="shell-ghost" aria-hidden="true">
          <span>{ghost}</span>
        </div>
      )}

      <BrandLockup onClick={() => goTo("welcome")} />

      {isFlow && (
        <StepProgress steps={steps} currentIdx={currentIdx} step={step} goTo={goTo} />
      )}

      <div className="shell-topright">
        <button
          className={"shell-util" + (step === "leaderboard" ? " on" : "")}
          onClick={() => goTo("leaderboard")}
          title="Leaderboard & mini-leagues"
        >🏆<span>Table</span></button>
        <button
          className={"shell-util" + (step === "history" ? " on" : "")}
          onClick={() => goTo("history")}
          title="World Cup history & records"
        >📖<span>History</span></button>
        <button className="shell-util ghost" onClick={reset} title="Start over">Reset</button>
        <AuthControls />
      </div>

      <main className="shell-body">{children}</main>
    </div>
  );
}

window.BrandLockup = BrandLockup;
window.StepShell = StepShell;
