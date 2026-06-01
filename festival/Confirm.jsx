// STAR XI '26 — Screen 4: Confirm + scoring explainer

function Confirm({ state, setState, onSubmit, onBack }) {
  const nation = state.nation ? window.NATIONS.find(n => n.code === state.nation) : null;
  const predictions = state.predictions || {};
  const picks = state.picks || [];
  const captain = state.captain;
  const captainPlus = !!state.captainPlus;
  const captainByMd = state.captainByMd || {};
  const formation = state.formation || "4-3-3";

  const summary = useMemo(() => {
    const made = window.FIXTURES.filter(f => {
      const p = predictions[f.id];
      return p && p.home != null && p.away != null;
    }).length;
    const boosted = window.FIXTURES.filter(f =>
      nation && (f.home.code === nation.code || f.away.code === nation.code)
    );
    return { made, total: 72, boosted };
  }, [predictions, nation]);

  const sampleRows = useMemo(() => {
    return window.FIXTURES
      .filter(f => {
        const p = predictions[f.id];
        return p && p.home != null && p.away != null;
      })
      .slice(0, 6);
  }, [predictions]);

  const xiByPos = useMemo(() => {
    const out = { GK: [], DF: [], MF: [], FW: [] };
    picks.forEach(id => {
      const p = window.PLAYERS.find(x => x.id === id);
      if (p) out[p.pos].push(p);
    });
    return out;
  }, [picks]);

  return (
    <div className="step-screen">
      <div className="step-scroll stagger">
        <div className="dxi-head">
          <div className="ph-titles">
            <div className="eyebrow">Step 4 · Confirm & lock</div>
            <h2 className="title">Lock these in for the summer?</h2>
            <p className="lede">Quick double-check — when you submit, your entry locks for the summer and your points update here every matchday.</p>
          </div>
        </div>

      <div className="confirm-grid">
        <div className="card summary-card">
          <h3>Star XI — {formation}</h3>
          <div className="sum-meta">
            {picks.length}/11 picked ·{" "}
            {captainPlus
              ? `Captain+ on (${[1,2,3].filter(md => captainByMd[md]).length}/3 set)`
              : (captain ? "season captain set" : "no captain set")
            }
          </div>
          <div className="xi-preview">
            {picks.length === 0 && (
              <div className="empty-state">No squad picked yet — the Star XI is what the table ranks on. Go back and draft your eleven.</div>
            )}
            {["GK", "DF", "MF", "FW"].map(pos => (
              xiByPos[pos].length > 0 && (
                <div key={pos} className="xi-pos-group">
                  <div className="xi-pos-label">{pos}</div>
                  {xiByPos[pos].map(p => {
                    const isSeasonCap = captain === p.id && !captainPlus;
                    const capMds = [1, 2, 3].filter(md => captainByMd[md] === p.id);
                    return (
                      <div key={p.id} className="xi-prev-row">
                        <span className="em">{p.flag}</span>
                        <div>
                          <div className="nm">{p.name}</div>
                          <div className="ps">{p.nat} · form {p.form.toFixed(1)}</div>
                        </div>
                        {isSeasonCap && <span className="cap">★ CAPT · 2×</span>}
                        {captainPlus && capMds.length > 0 && (
                          <span className="cap">★ MD{capMds.join(",")}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            ))}
          </div>
        </div>

        <div className="card summary-card">
          <h3>Predictions <span className="sc-opt">bonus</span></h3>
          <div className="sum-meta">
            {summary.made}/72 made
            {nation && <> · {nation.flag} {nation.name} 2× boost on {summary.boosted.length} matches</>}
          </div>
          <div className="preview-list">
            {sampleRows.length === 0 && (
              <div className="empty-state">No predictions — that's fine, they're optional. Add a few for a shot at ultimate champion; blanks just score zero.</div>
            )}
            {sampleRows.map(fx => {
              const p = predictions[fx.id];
              const boost = nation && (fx.home.code === nation.code || fx.away.code === nation.code);
              return (
                <div key={fx.id} className={"pl-row" + (boost ? " boost" : "")}>
                  <span className="l">{fx.home.flag} {fx.home.name}</span>
                  <span className="sc">{p.home} <span style={{ opacity: .35 }}>–</span> {p.away}</span>
                  <span className="r">{fx.away.name} {fx.away.flag}</span>
                </div>
              );
            })}
            {summary.made > sampleRows.length && (
              <div className="more-tag">+ {summary.made - sampleRows.length} more locked</div>
            )}
          </div>
        </div>
      </div>

      <div className="math-card">
        <div className="eyebrow">How the table ranks</div>
        <h3>Your Star XI is the spine. Predictions crown the champion.</h3>
        <p>
          The global table and your mini-leagues rank on Star XI points first —
          so a great squad alone keeps you in the fight, predictions or not. When
          XI scores tie, your prediction bonus separates you, and the player who
          tops both stands alone as <strong>ultimate champion</strong>.
        </p>
        <div className="ladder">
          <div className="lstep">
            <div className="ln">Step 1</div>
            <div className="lt">Star XI points</div>
          </div>
          <div className="lstep">
            <div className="ln">Step 2</div>
            <div className="lt">Prediction bonus</div>
          </div>
          <div className="lstep">
            <div className="ln">Step 3</div>
            <div className="lt">Most exact scorelines</div>
          </div>
          <div className="lstep">
            <div className="ln">Step 4</div>
            <div className="lt">Earliest entry timestamp</div>
          </div>
        </div>
      </div>

      </div>
      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>← Back</button>
        <span className="foot-note grow">Once you submit, you're in for the summer.</span>
        <button className="pill primary" onClick={onSubmit}>✓ Submit — lock in <span>→</span></button>
      </div>
    </div>
  );
}

window.Confirm = Confirm;
