// STAR XI '26 — Screen 4: Confirm + scoring explainer

function Confirm({ state, setState, onSubmit, onBack, signedIn }) {
  const teamName = state.teamName || "";
  const setTeamName = (val) => setState(s => ({ ...s, teamName: val }));
  const nation = state.nation ? window.NATIONS.find(n => n.code === state.nation) : null;
  const bracket = state.bracket || { groups: {}, advances: {} };
  const picks = state.picks || [];
  const captain = state.captain;
  const captainPlus = !!state.captainPlus;
  const captainByMd = state.captainByMd || {};
  const formation = state.formation || "4-3-3";

  // ——— Road-to-the-Final summary ———
  const groupLetters = "ABCDEFGHIJKL".split("");
  const groupsDone = groupLetters.filter(g => {
    const o = (bracket.groups || {})[g];
    return o && o.length === 4 && o.every(Boolean);
  }).length;
  const luckyCount = (bracket.lucky3rds || []).length;
  const koCounts = ["r32", "r16", "qf", "sf", "final"].map(r => {
    const round = (bracket.advances || {})[r] || {};
    const n = Object.keys(round).filter(k => round[k]).length;
    return { round: r, made: n, total: window.KO_ROUND_SIZES[r] };
  });
  const knockoutTotalMade = koCounts.reduce((a, c) => a + c.made, 0);
  const knockoutTotal = 16 + 8 + 4 + 2 + 1;
  const champCode = ((bracket.advances || {}).final || {})[0] || null;
  const champion = champCode ? window.NATIONS.find(n => n.code === champCode) : null;

  // Show a small preview of the player's top-line predictions: the 4 SF teams,
  // both finalists, the champion.
  const sfTeams = [0, 1].map(idx => {
    const m = window.resolveKoMatch(bracket, "sf", idx);
    return [m.home, m.away];
  }).flat().filter(Boolean);

  const xiByPos = useMemo(() => {
    const out = { GK: [], DF: [], MF: [], FW: [] };
    picks.forEach(id => {
      const p = window.PLAYERS.find(x => x.id === id);
      if (p) out[p.pos].push(p);
    });
    return out;
  }, [picks]);

  return (
    <div className="step-screen confirm-screen">
      <div className="step-scroll stagger">
        <div className="dxi-head confirm-head">
          <div className="ph-titles">
            <h2 className="title">Lock these in for the summer?</h2>
            <p className="lede">Quick double-check: when you submit, your entry locks for the summer and points update every matchday.</p>
          </div>
        </div>

      <div className="confirm-grid">
        <div className="card summary-card">
          <h3>Star XI · {formation}</h3>
          <div className="sum-meta">
            {picks.length}/11 picked ·{" "}
            {captainPlus
              ? `${[1,2,3].filter(md => captainByMd[md]).length}/3 GW captains picked`
              : (captain ? "season captain set" : "no captain set")
            }
          </div>
          <div className="xi-preview">
            {picks.length === 0 && (
              <div className="empty-state">No squad picked yet. The Star XI is what the table ranks on. Go back and draft your eleven.</div>
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
                          <span className="cap">★ GW{capMds.join(",")}</span>
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
          <h3>Road to the Final <span className="sc-opt">bonus</span></h3>
          <div className="sum-meta">
            {groupsDone}/12 group ladders · {luckyCount}/8 Lucky 3rds · {knockoutTotalMade}/{knockoutTotal} knockout picks
            {nation && <> · {nation.flag} {nation.name} 2× boost</>}
          </div>

          {groupsDone + luckyCount + knockoutTotalMade === 0 ? (
            <div className="empty-state">
              No Road picks yet. That's fine, they're optional. Skip back to the Road step for a shot at the bonus pile; blanks just score zero.
            </div>
          ) : (
            <div className="rtf-confirm">
              <div className="rtf-conf-row">
                <span className="rtf-conf-label">Groups</span>
                <div className="rtf-conf-bar">
                  <div className="rtf-conf-fill" style={{ width: `${(groupsDone / 12) * 100}%` }}></div>
                </div>
                <span className="rtf-conf-count">{groupsDone}/12</span>
              </div>
              <div className="rtf-conf-row">
                <span className="rtf-conf-label">Lucky 3rds</span>
                <div className="rtf-conf-bar">
                  <div className="rtf-conf-fill" style={{ width: `${(luckyCount / 8) * 100}%` }}></div>
                </div>
                <span className="rtf-conf-count">{luckyCount}/8</span>
              </div>
              {koCounts.map(({ round, made, total }) => (
                <div key={round} className="rtf-conf-row">
                  <span className="rtf-conf-label">{window.KO_ROUND_LABELS[round]}</span>
                  <div className="rtf-conf-bar">
                    <div className="rtf-conf-fill" style={{ width: `${(made / total) * 100}%` }}></div>
                  </div>
                  <span className="rtf-conf-count">{made}/{total}</span>
                </div>
              ))}

              {sfTeams.length > 0 && (
                <div className="rtf-conf-sf">
                  <div className="rtf-conf-sf-lab">Your Final Four</div>
                  <div className="rtf-conf-sf-list">
                    {sfTeams.map((t, i) => (
                      <span key={i} className={"rtf-conf-team" + (t.code === (nation && nation.code) ? " mine" : "")}>
                        {t.flag} {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {champion && (
                <div className={"rtf-conf-champ" + (nation && champion.code === nation.code ? " mine" : "")}>
                  <span className="rtfcc-trophy">🏆</span>
                  <span>Champion: <strong>{champion.flag} {champion.name}</strong></span>
                  <span className="rtfcc-pts">+{nation && champion.code === nation.code ? 32 : 16} if right</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      </div>
      <div className="confirm-name-row">
        <input
          className="lb-input confirm-name-input"
          type="text"
          maxLength={40}
          placeholder="Name your squad (e.g. Route One Merchants)"
          value={teamName}
          onChange={e => setTeamName(e.target.value)}
          aria-label="Squad name"
        />
      </div>
      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>← Back</button>
        <span className="foot-note">{signedIn ? "Once you submit, you're in for the summer." : "Sign up to lock in — your picks are already saved."}</span>
        <button className="pill primary" onClick={onSubmit}>{signedIn ? "✓ Submit — lock in" : "✓ Sign up & lock in"} <span>→</span></button>
      </div>
    </div>
  );
}

window.Confirm = Confirm;
