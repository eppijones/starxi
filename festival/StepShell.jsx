// STAR XI — shared step chrome
// One source of truth for the fixed top-centre brand lockup + the 100vh paged
// shell every screen lives in. The lockup never moves between screens (it's the
// fixed anchor the whole layout is built around); content lives in a single
// viewport with a pinned Back/Next action bar instead of long-scroll pages.

// The brand crest, drawn once. Used by the landing AND every step so the
// lockup is pixel-identical and always in the same place. The crest is the
// animated v2 mark: shimmer sweeps, the silhouette breathes, a single spark
// lifts off the star, then it rests — a seamless ~5.6s loop, white not gold.
function BrandLockup({ onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={"brand-lockup" + (onClick ? " is-link" : "")}
      onClick={onClick || undefined}
      aria-label={onClick ? "STAR XI — back to start" : "STAR XI"}
    >
      <span className="bl-crest sxanim" aria-hidden="true">
        <img className="base" src="brand/star-xi-white.png" alt="" draggable="false" />
        <span className="glow" />
        <span className="shine" />
        <span className="spark" />
      </span>
      <div className="bl-name">STAR XI</div>
      <div className="bl-sub">World Cup 2026</div>
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
        const reachable = i <= currentIdx + 1 || step === "history" || step === "leaderboard" || step === "matchwatch";
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
function StepShell({ step, steps, currentIdx, goTo, reset, ghost, children, matchWatchEnabled }) {
  const isFlow = step !== "history" && step !== "leaderboard" && step !== "matchwatch";
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
        {matchWatchEnabled && (
          <button
            className={"shell-util watch" + (step === "matchwatch" ? " on" : "")}
            onClick={() => goTo("matchwatch")}
            title="NOR vs SWE live scoring test (temporary)"
          >📡<span>Match watch</span></button>
        )}
        <button
          className={"shell-util" + (step === "leaderboard" ? " on" : "")}
          onClick={() => goTo("leaderboard")}
          title="Leaderboard & mini-leagues"
        >🏆<span>Leaderboard</span></button>
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
