// DREAM XI '26 — Screen 5: Live (post-simulation)

function Live({ state, sim, setState, onReplay, onEditPicks, onHistory }) {
  const nation = state.nation ? window.NATIONS.find(n => n.code === state.nation) : null;
  const tally = useMemo(() => window.tallyUser(state, sim), [state, sim]);
  const league = useMemo(
    () => window.buildLeague(tally.total, tally.predictionPts, tally.xiPts, tally.bullseyes, "You"),
    [tally]
  );
  const you = league.find(r => r.isYou);

  const totalAnim = window.useCountUp(tally.total, 1100);
  const predAnim  = window.useCountUp(tally.predictionPts, 1000);
  const xiAnim    = window.useCountUp(tally.xiPts, 1000);
  const bullAnim  = window.useCountUp(tally.bullseyes, 800);

  const [swapOpen, setSwapOpen] = useState(null);

  // Confetti shower on the final-whistle reveal (and on every replay).
  const [confettiRun, setConfettiRun] = useState(true);
  useEffect(() => {
    setConfettiRun(true);
    const t = setTimeout(() => setConfettiRun(false), 4600);
    return () => clearTimeout(t);
  }, [sim]);

  // Split the flat breakdown back into groups vs knockout rounds for display.
  const groupRows = (tally.matchBreakdown || []).filter(r => r.kind === "group");
  const roundRows = (tally.matchBreakdown || []).filter(r => r.kind === "round");

  // The simulated champion — used to celebrate / contrast with the player's pick.
  const simBracket = sim && sim.bracket;
  const simChampCode = simBracket && simBracket.advances && simBracket.advances.final && simBracket.advances.final[0];
  const simChamp = simChampCode ? window.NATIONS.find(n => n.code === simChampCode) : null;
  const myChampCode = state.bracket && state.bracket.advances && state.bracket.advances.final && state.bracket.advances.final[0];
  const myChamp = myChampCode ? window.NATIONS.find(n => n.code === myChampCode) : null;

  const swapsUsed = (state.swaps || []).length;
  const swapsLeft = window.MAX_SWAPS - swapsUsed;

  const applySwap = (slotId, atMd, newPlayerId) => {
    setState(s => {
      const swaps = [...(s.swaps || []), { from: slotId, to: newPlayerId, atMd }];
      return { ...s, swaps };
    });
    setSwapOpen(null);
  };

  const resetSwaps = () => {
    setState(s => ({ ...s, swaps: [] }));
  };

  return (
    <div className="screen stagger">
      {confettiRun && <window.ConfettiBurst key={state && sim ? "c" + (you?.pts || 0) : "c"} run={confettiRun} />}
      <div className="live-hero pop">
        <div className="lh-eyebrow">Final whistle · group stage</div>
        <div className="lh-score">
          {nation && <span className="lh-flag">{nation.flag}</span>}
          {totalAnim}
          <span style={{ fontSize: ".25em", opacity: .45, marginLeft: 12, verticalAlign: "0.4em" }}>pts</span>
        </div>
        <div className="lh-row">
          <div className="lh-stat">
            <div className="n">{predAnim}</div>
            <div className="l">Road bonus</div>
            <div className="sub">{tally.outcomesRight} of 31 advances right</div>
          </div>
          <div className="lh-stat">
            <div className="n">{xiAnim}</div>
            <div className="l">Star XI points</div>
            <div className="sub">
              {state.captainPlus
                ? `Captain+ on (${[1,2,3].filter(md => (state.captainByMd||{})[md]).length}/3 set)`
                : (state.captain ? "captain ×2 applied" : "no captain")}
            </div>
          </div>
          <div className="lh-stat gold">
            <div className="n">{bullAnim}</div>
            <div className="l">Bullseyes</div>
            <div className="sub">perfect groups + correct champion</div>
          </div>
          <div className="lh-stat">
            <div className="n">#{you?.rank ?? "—"}</div>
            <div className="l">Mini-league rank</div>
            <div className="sub">out of {league.length}</div>
          </div>
        </div>
      </div>

      <div className="live-grid">
        {/* LEFT: knockout breakdown */}
        <div>
          <div className="section-head">
            <h2>Your Road vs the sim</h2>
            <div className="meta">
              {simChamp && <>Sim winner: <strong>{simChamp.flag} {simChamp.name}</strong></>}
            </div>
          </div>

          {myChamp && simChamp && (
            <div className={"live-champ-banner" + (myChamp.code === simChamp.code ? " hit" : " miss")}>
              <span className="lcb-trophy">🏆</span>
              {myChamp.code === simChamp.code ? (
                <><strong>{myChamp.flag} {myChamp.name}</strong> lifted it. You called it! <em>+{nation && myChamp.code === nation.code ? 32 : 16} pts</em></>
              ) : (
                <>You backed <strong>{myChamp.flag} {myChamp.name}</strong> · the sim crowned <strong>{simChamp.flag} {simChamp.name}</strong></>
              )}
            </div>
          )}

          <div className="bracket-results">
            <div className="br-section-head">Group ladders</div>
            <div className="br-groups">
              {groupRows.map(r => (
                <div key={r.group} className={"br-grow" + (r.perfect ? " perfect" : "") + (r.hits === 0 ? " zero" : "")}>
                  <div className="br-grow-head">Group {r.group}</div>
                  <div className="br-grow-body">
                    <div className="br-hits">{r.hits}<i>/4</i> right</div>
                    <div className={"br-pts" + (r.points > 0 ? " win" : " zero") + (r.perfect ? " bull" : "")}>
                      {r.perfect ? "★ " : ""}+{r.points}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="br-section-head">Knockout rounds</div>
            <div className="br-rounds">
              {roundRows.map(r => (
                <div key={r.round} className={"br-rrow" + (r.hits === 0 ? " zero" : "") + (r.hits === r.total ? " perfect" : "")}>
                  <div className="br-rrow-name">{window.KO_ROUND_LABELS[r.round]}</div>
                  <div className="br-rrow-bar">
                    <div className="br-rrow-fill" style={{ width: `${(r.hits / r.total) * 100}%` }}></div>
                  </div>
                  <div className="br-rrow-hits">{r.hits}<i>/{r.total}</i></div>
                  <div className={"br-pts" + (r.points > 0 ? " win" : " zero")}>+{r.points}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: league + XI + swaps */}
        <div>
          <div className="section-head">
            <h2>Mini-league</h2>
            <div className="meta">25 players · 1 winner</div>
          </div>
          <div className="card" style={{ padding: "8px 12px" }}>
            {league.slice(0, 10).map(r => (
              <div key={r.handle} className={"league-row" + (r.isYou ? " you" : "")}>
                <div className="rank">{r.rank}</div>
                <div className="nm">
                  {r.name}
                  <small>{r.handle} · {r.bullseyes} bullseyes</small>
                </div>
                <div className="pts">{r.pts}</div>
              </div>
            ))}
            {you && you.rank > 10 && (
              <>
                <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, opacity: .35, padding: "8px 0", letterSpacing: ".1em" }}>· · ·</div>
                <div className="league-row you">
                  <div className="rank">{you.rank}</div>
                  <div className="nm">You<small>{you.handle} · {you.bullseyes} bullseyes</small></div>
                  <div className="pts">{you.pts}</div>
                </div>
              </>
            )}
          </div>

          {/* Swap budget */}
          <div className="card xi-returns" style={{ marginTop: 14 }}>
            <div className="swap-head">
              <h3>Swap budget</h3>
              <div className="swap-pills">
                {Array.from({ length: window.MAX_SWAPS }).map((_, i) => (
                  <span key={i} className={"swap-pill" + (i < swapsUsed ? " used" : "")}>
                    {i < swapsUsed ? "✕" : "●"}
                  </span>
                ))}
                <span className="swap-count">{swapsLeft} of {window.MAX_SWAPS} left</span>
              </div>
            </div>
            <p className="swap-blurb">
              Three free swaps over the tournament for injured or eliminated picks.
              Pick a matchday, choose your replacement. Points from that MD onwards
              go to the new player.
            </p>
            {swapsUsed > 0 && (
              <button className="btn ghost sm" onClick={resetSwaps} style={{ marginBottom: 10 }}>
                ↺ Reset swaps
              </button>
            )}
          </div>

          {/* XI returns */}
          <div className="card xi-returns" style={{ marginTop: 14 }}>
            <h3>Star XI returns</h3>
            {tally.xiBreakdown.length === 0 && (
              <div className="empty-state">No Star XI picked. Predictions still scoring.</div>
            )}
            {tally.xiBreakdown
              .sort((a, b) => b.total - a.total)
              .map(({ slotId, mdLines, total }) => {
                const p0 = mdLines[0].player || window.PLAYERS.find(x => x.id === slotId);
                const swappedHere = (state.swaps || []).filter(s => s.from === slotId);
                return (
                  <div key={slotId} className="xi-block">
                    <div className="xi-block-head">
                      <span className="em">{p0?.flag}</span>
                      <div className="xi-block-name">
                        <div className="nm">{p0?.name}</div>
                        <div className="ev">
                          {p0?.pos} · {p0?.nat}
                          {swappedHere.length > 0 && <> · <em style={{ color: "var(--coral)" }}>{swappedHere.length} swap</em></>}
                        </div>
                      </div>
                      <div className="pp">{total}</div>
                      <button
                        className="btn ghost sm swap-btn"
                        disabled={swapsLeft === 0}
                        onClick={() => setSwapOpen({ slotId })}
                        title={swapsLeft === 0 ? "No swaps left" : "Swap this player"}
                      >⇄</button>
                    </div>
                    <div className="md-line-grid">
                      {mdLines.map(line => (
                        <div key={line.md} className={"md-line" + (line.isCap ? " cap" : "")}>
                          <div className="md-label">GW{line.md}</div>
                          <div className="md-events">
                            {line.events.goals ? `${line.events.goals}G ` : ""}
                            {line.events.assists ? `${line.events.assists}A ` : ""}
                            {(line.player?.pos === "GK" || line.player?.pos === "DF") && line.events.sheets ? `${line.events.sheets}CS` : ""}
                            {!line.events.goals && !line.events.assists && !((line.player?.pos === "GK" || line.player?.pos === "DF") && line.events.sheets) && "–"}
                          </div>
                          <div className="md-pts">
                            {line.isCap && <span className="cap-mark-mini">★</span>}
                            {line.pts}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="cta-row" style={{ marginTop: 16 }}>
            <button className="btn green sm" onClick={onReplay}>↻ Run again</button>
            <button className="btn ghost sm" onClick={onEditPicks}>Edit picks</button>
            <button className="btn ghost sm" onClick={onHistory}>📖 History</button>
          </div>
        </div>
      </div>

      {/* Swap modal */}
      {swapOpen && (
        <SwapModal
          slotId={swapOpen.slotId}
          state={state}
          onCancel={() => setSwapOpen(null)}
          onApply={(atMd, newId) => applySwap(swapOpen.slotId, atMd, newId)}
        />
      )}
    </div>
  );
}

function SwapModal({ slotId, state, onCancel, onApply }) {
  const cur = window.PLAYERS.find(p => p.id === slotId);
  const [atMd, setAtMd] = useState(2);
  const [chosen, setChosen] = useState(null);
  if (!cur) return null;

  const candidates = window.PLAYERS
    .filter(p => p.pos === cur.pos && !(state.picks || []).includes(p.id))
    .sort((a, b) => b.form - a.form)
    .slice(0, 14);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Swap {cur.flag} {cur.name}</h3>
          <button className="modal-x" onClick={onCancel}>×</button>
        </div>
        <p className="modal-sub">
          Pick a replacement at the same position ({cur.pos}). Points from your
          chosen matchday onwards will go to the new player.
        </p>

        <div className="modal-mds">
          {[1, 2, 3].map(md => (
            <button
              key={md}
              className={"md-tab" + (atMd === md ? " sel" : "")}
              onClick={() => setAtMd(md)}
              style={{ borderRadius: 999, fontSize: 13 }}
            >From GW{md}</button>
          ))}
        </div>

        <div className="modal-list">
          {candidates.map(p => (
            <button
              key={p.id}
              className={"player-card sm" + (chosen === p.id ? " chosen" : "")}
              onClick={() => setChosen(p.id)}
            >
              <div className="pc-flag">{p.flag}</div>
              <div>
                <div className="pc-name">{p.name}</div>
                <div className="pc-meta">{p.pos} · {p.nat} · form {p.form.toFixed(1)}</div>
              </div>
              <div className="pc-form">{p.form.toFixed(1)}</div>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
          <button
            className="btn gold sm"
            disabled={!chosen}
            onClick={() => onApply(atMd, chosen)}
          >Apply swap →</button>
        </div>
      </div>
    </div>
  );
}

window.Live = Live;
