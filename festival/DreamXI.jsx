// DREAM XI '26 — Screen 3: Dream XI (11-player squad with pitch visualization)

const POS_LABELS = { ALL: "All", GK: "GK", DF: "DF", MF: "MF", FW: "FW" };

function DreamXI({ state, setState, onNext, onSkip, onBack }) {
  const formation = state.formation || "4-3-3";
  const limits = window.FORMATIONS[formation];
  const picks = state.picks || [];
  const captain = state.captain;
  const captainPlus = !!state.captainPlus;
  const captainByMd = state.captainByMd || {};

  const counts = useMemo(() => window.countByPos(picks), [picks]);
  const totalLeft = 11 - picks.length;

  // Auto-suggest position filter: the slot with the biggest gap.
  const suggestedFilter = useMemo(() => {
    if (picks.length === 11) return "ALL";
    const gap = pos => limits[pos] - counts[pos];
    return ["GK", "DF", "MF", "FW"].sort((a, b) => gap(b) - gap(a))[0];
  }, [picks, counts, limits]);

  const [posFilter, setPosFilter] = useState(suggestedFilter);
  const [query, setQuery] = useState("");
  const [natFilter, setNatFilter] = useState("ALL");
  const [showAdv, setShowAdv] = useState(!!captainPlus);

  // Every nation present in the pool, sorted by name, for the nation dropdown.
  const natOptions = useMemo(() => {
    const byCode = {};
    window.PLAYERS.forEach(p => { if (!byCode[p.nat]) byCode[p.nat] = p.flag; });
    return Object.entries(byCode)
      .map(([code, flag]) => {
        const n = window.NATIONS.find(x => x.code === code);
        return { code, flag, name: n ? n.name : code };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);
  // The player's chosen nation, pinned to the top of the dropdown if it has players.
  const yourNat = state.nation ? natOptions.find(o => o.code === state.nation) : null;
  // Re-sync filter when picks change and current filter is full
  useEffect(() => {
    if (posFilter !== "ALL" && counts[posFilter] >= limits[posFilter] && picks.length < 11) {
      setPosFilter(suggestedFilter);
    }
  }, [counts, posFilter, limits, suggestedFilter, picks.length]);

  // The pool is now ~1,250 real, announced players — far too many to scroll.
  // Show the top-form slice by default; a search box (name / nation / club)
  // narrows to anything. Picked players always stay visible at the tail.
  const LIST_LIMIT = 60;
  // Accent-insensitive: "vini"→Vinícius, "nicolas"→Nicolás, "mbappe"→Mbappé.
  const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const { shown, hiddenCount } = useMemo(() => {
    const q = norm(query.trim());
    let list = posFilter === "ALL"
      ? window.PLAYERS
      : window.PLAYERS.filter(p => p.pos === posFilter);
    if (natFilter !== "ALL") list = list.filter(p => p.nat === natFilter);
    if (q) {
      list = list.filter(p =>
        norm(p.name).includes(q) ||
        norm(p.nat).includes(q) ||
        (p.hype && norm(p.hype).includes(q))
      );
    }
    const sorted = [...list].sort((a, b) => {
      const ap = picks.includes(a.id);
      const bp = picks.includes(b.id);
      if (ap !== bp) return ap ? 1 : -1;
      return b.form - a.form;
    });
    // Only cap the firehose "everything" view — once you've narrowed by search
    // or nation the list is small enough to show in full.
    const narrowed = q || natFilter !== "ALL";
    if (!narrowed && sorted.length > LIST_LIMIT) {
      const top = sorted.slice(0, LIST_LIMIT);
      // keep any already-picked players that fell past the cut visible
      const pickedTail = sorted.slice(LIST_LIMIT).filter(p => picks.includes(p.id));
      return { shown: [...top, ...pickedTail], hiddenCount: sorted.length - top.length - pickedTail.length };
    }
    return { shown: sorted, hiddenCount: 0 };
  }, [posFilter, picks, query, natFilter]);

  const togglePick = (p) => {
    setState(s => {
      const has = (s.picks || []).includes(p.id);
      let nextPicks = s.picks || [];
      let nextCap = s.captain;
      let nextCapByMd = { ...(s.captainByMd || {}) };
      if (has) {
        nextPicks = nextPicks.filter(id => id !== p.id);
        if (nextCap === p.id) nextCap = null;
        [1, 2, 3].forEach(md => {
          if (nextCapByMd[md] === p.id) delete nextCapByMd[md];
        });
      } else {
        const lim = window.FORMATIONS[s.formation || "4-3-3"];
        const cur = window.countByPos(nextPicks);
        if (cur[p.pos] >= lim[p.pos]) return s;
        if (nextPicks.length >= 11) return s;
        nextPicks = [...nextPicks, p.id];
      }
      return { ...s, picks: nextPicks, captain: nextCap, captainByMd: nextCapByMd };
    });
  };

  const setCaptain = (id) => {
    setState(s => ({ ...s, captain: s.captain === id ? null : id }));
  };

  const setCaptainForMd = (md, id) => {
    setState(s => ({
      ...s,
      captainByMd: { ...(s.captainByMd || {}), [md]: id || null }
    }));
  };

  const setFormation = (f) => {
    setState(s => {
      const newLimits = window.FORMATIONS[f];
      const cur = window.countByPos(s.picks || []);
      // If new formation can't fit existing picks at a position, drop the lowest-form ones.
      let nextPicks = [...(s.picks || [])];
      ["GK", "DF", "MF", "FW"].forEach(pos => {
        const overBy = cur[pos] - newLimits[pos];
        if (overBy > 0) {
          const here = nextPicks
            .map(id => window.PLAYERS.find(p => p.id === id))
            .filter(p => p && p.pos === pos)
            .sort((a, b) => a.form - b.form);
          for (let i = 0; i < overBy; i++) {
            nextPicks = nextPicks.filter(id => id !== here[i].id);
          }
        }
      });
      return { ...s, formation: f, picks: nextPicks };
    });
  };

  const autoFillXI = () => {
    setState(s => {
      const lim = window.FORMATIONS[s.formation || "4-3-3"];
      const cur = window.countByPos(s.picks || []);
      let nextPicks = [...(s.picks || [])];
      ["GK", "DF", "MF", "FW"].forEach(pos => {
        const need = lim[pos] - cur[pos];
        if (need <= 0) return;
        const candidates = window.PLAYERS
          .filter(p => p.pos === pos && !nextPicks.includes(p.id))
          .sort((a, b) => b.form - a.form)
          .slice(0, need);
        candidates.forEach(c => nextPicks.push(c.id));
      });
      // Default captain = highest-form player picked, if none set
      let nextCap = s.captain;
      if (!nextCap && nextPicks.length) {
        nextCap = nextPicks
          .map(id => window.PLAYERS.find(p => p.id === id))
          .sort((a, b) => b.form - a.form)[0].id;
      }
      return { ...s, picks: nextPicks, captain: nextCap };
    });
  };

  const clearXI = () => {
    if (!confirm("Clear your Dream XI?")) return;
    setState(s => ({ ...s, picks: [], captain: null, captainByMd: {} }));
  };

  return (
    <div className="screen stagger">
      <div className="dxi-head">
        <div>
          <div className="eyebrow">Step 2 · The main event</div>
          <h2 className="title">Draft your Dream XI</h2>
          <p className="lede" style={{ marginTop: 4 }}>
            This is the game. A full eleven, ranked on the global table all
            summer. Pick a formation, captain a player to double their points,
            and you're in — score predictions are an optional bonus on top.
          </p>
        </div>
        <div className="dxi-actions">
          <button className="btn ghost sm" onClick={autoFillXI}>Auto-fill XI</button>
          <button className="btn ghost sm" onClick={clearXI}>Clear</button>
        </div>
      </div>

      <div className="dxi-layout">
        {/* LEFT: position filter + player list */}
        <div>
          <div className="dxi-controls">
            <div className="pos-tabs">
              {Object.entries(POS_LABELS).map(([k, l]) => {
                const c = k === "ALL"
                  ? picks.length + "/11"
                  : `${counts[k]}/${limits[k]}`;
                const full = k !== "ALL" && counts[k] >= limits[k];
                return (
                  <button
                    key={k}
                    className={"pos-tab" + (posFilter === k ? " sel" : "") + (full ? " full" : "")}
                    onClick={() => setPosFilter(k)}
                  >
                    {l} <span className="pct">{c}</span>
                  </button>
                );
              })}
            </div>
            <div className="dxi-find">
              <div className="dxi-search">
                <span className="dxi-search-ico" aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search players — name or club…"
                  aria-label="Search players by name, nation or club"
                />
                {query && (
                  <button className="dxi-search-x" onClick={() => setQuery("")} aria-label="Clear search">×</button>
                )}
              </div>
              <select
                className="dxi-nat"
                value={natFilter}
                onChange={e => setNatFilter(e.target.value)}
                aria-label="Filter by nation"
              >
                <option value="ALL">🌍 All nations</option>
                {yourNat && (
                  <option value={yourNat.code}>{yourNat.flag} {yourNat.name} — yours</option>
                )}
                {natOptions.filter(o => !yourNat || o.code !== yourNat.code).map(o => (
                  <option key={o.code} value={o.code}>{o.flag} {o.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="player-grid">
            {shown.map(p => {
              const picked = picks.includes(p.id);
              const posFull = counts[p.pos] >= limits[p.pos];
              const disabled = !picked && (posFull || picks.length >= 11);
              return (
                <button
                  key={p.id}
                  className={"player-card" + (picked ? " picked" : "")}
                  onClick={() => togglePick(p)}
                  disabled={disabled}
                  style={disabled ? { opacity: .35, cursor: "not-allowed" } : {}}
                >
                  <div className="pc-flag">{p.flag}</div>
                  <div>
                    <div className="pc-name">{p.name}</div>
                    <div className="pc-meta">{p.pos} · {p.nat}</div>
                  </div>
                  <div className="pc-form">{p.form.toFixed(1)}</div>
                  <div className="pc-hype">{p.hype}</div>
                </button>
              );
            })}
            {shown.length === 0 && (
              <div className="empty-state">
                No {posFilter !== "ALL" ? POS_LABELS[posFilter] + " " : ""}players
                {query ? <> match “{query}”</> : null}
                {natFilter !== "ALL" ? <> for {natOptions.find(o => o.code === natFilter)?.name}</> : null}.{" "}
                <button className="link-btn" onClick={() => { setQuery(""); setNatFilter("ALL"); }}>Clear filters</button>
              </div>
            )}
            {hiddenCount > 0 && (
              <div className="player-more">
                +{hiddenCount} more {posFilter === "ALL" ? "" : POS_LABELS[posFilter] + " "}players —
                <strong> search</strong> by name, nation or club to find anyone.
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: pitch + captain */}
        <aside className="xi-side">
          <div className="formation-row">
            <span className="fr-label">Formation</span>
            <div className="formation-tabs">
              {Object.keys(window.FORMATIONS).map(f => (
                <button
                  key={f}
                  className={"formation-tab" + (formation === f ? " sel" : "")}
                  onClick={() => setFormation(f)}
                >{f}</button>
              ))}
            </div>
          </div>

          <Pitch
            formation={formation}
            picks={picks}
            captain={captain}
            captainPlus={captainPlus}
            captainByMd={captainByMd}
            onRemove={togglePick}
            onCaptain={setCaptain}
          />

          <div className="cap-block">
            {/* Season captain — the default path, always visible */}
            {!captainPlus && (
              captain ? (
                <div className="cap-summary set">
                  <span className="cap-star">★</span>
                  <span>
                    {window.PLAYERS.find(p => p.id === captain)?.flag}{" "}
                    <strong>{window.PLAYERS.find(p => p.id === captain)?.name}</strong>{" "}
                    is your captain — goals, assists &amp; clean sheets all score ×2.
                  </span>
                </div>
              ) : (
                <div className="cap-summary empty">
                  <span className="cap-star">★</span>
                  <span>
                    {picks.length === 0
                      ? "Pick your XI, then tap a shirt on the pitch to set your captain (×2 points)."
                      : "Tap a shirt on the pitch to set your captain — they score ×2 all summer."}
                  </span>
                </div>
              )
            )}

            {/* Advanced: per-matchday captain, tucked away for the obsessives */}
            <button
              className={"cap-adv-toggle" + (showAdv ? " open" : "")}
              onClick={() => setShowAdv(v => !v)}
              aria-expanded={showAdv}
            >
              <span className="cat-chev">{showAdv ? "▾" : "▸"}</span>
              Advanced · per-matchday captain
              {captainPlus && <span className="cap-adv-on">ON</span>}
            </button>

            {showAdv && (
              <div className="cap-adv">
                <label className="cap-toggle">
                  <input
                    type="checkbox"
                    checked={captainPlus}
                    onChange={e => setState(s => ({ ...s, captainPlus: e.target.checked }))}
                  />
                  <span>
                    <strong>Captain+</strong>
                    <em>Swap captain each matchday instead of one for the summer.</em>
                  </span>
                </label>

                {captainPlus && (
                  <div className="cap-md-rows">
                    {[1, 2, 3].map(md => {
                      const cur = captainByMd[md];
                      const pickedPlayers = picks.map(id => window.PLAYERS.find(p => p.id === id)).filter(Boolean);
                      return (
                        <div key={md} className="cap-md-row">
                          <span className="cap-md-label">MD{md}</span>
                          <select
                            className="cap-md-select"
                            value={cur || ""}
                            onChange={e => setCaptainForMd(md, e.target.value || null)}
                          >
                            <option value="">— none —</option>
                            {pickedPlayers.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.flag} {p.name} ({p.pos})
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="notice">
            ⓘ Squads provisional. Official 26-man rosters drop early June 2026 —
            you'll get one free swap window before kickoff to lock in your XI.
          </div>

          {picks.length < 11 ? (
            <button
              className="btn gold sm"
              disabled
              style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
            >
              Pick {totalLeft} more
            </button>
          ) : (
            <div className="dxi-finish">
              <button
                className="btn gold sm"
                onClick={onSkip}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Review &amp; lock in →
              </button>
              <button
                className="btn ghost sm"
                onClick={onNext}
                style={{ width: "100%", justifyContent: "center" }}
              >
                + Add score predictions <span className="dxi-opt">optional</span>
              </button>
              <p className="dxi-finish-note">
                Your XI is what the global table ranks on. Nail the group scores
                too and you're in the running for <strong>ultimate champion</strong>.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ——— Pitch visualization ———
function Pitch({ formation, picks, captain, captainPlus, captainByMd, onRemove, onCaptain, readOnly }) {
  const limits = window.FORMATIONS[formation];
  const needsCap = !readOnly && !captainPlus && !captain && picks.length > 0;
  const layout = [
    { pos: "FW", n: limits.FW },
    { pos: "MF", n: limits.MF },
    { pos: "DF", n: limits.DF },
    { pos: "GK", n: limits.GK },
  ];

  // Pick the next player(s) from picks[] that match each row's position.
  const playersByPos = { GK: [], DF: [], MF: [], FW: [] };
  picks.forEach(id => {
    const p = window.PLAYERS.find(x => x.id === id);
    if (p) playersByPos[p.pos].push(p);
  });

  const isCaptain = (pid) => {
    if (captainPlus) {
      return [1, 2, 3].some(md => captainByMd[md] === pid);
    }
    return captain === pid;
  };

  return (
    <div className={"pitch" + (needsCap ? " needs-cap" : "") + (readOnly ? " read-only" : "")} aria-label={`${formation} pitch with your Dream XI`}>
      <div className="pitch-bg" aria-hidden="true">
        <div className="pitch-stripe"></div>
        <div className="pitch-mid-line"></div>
        <div className="pitch-mid-circle"></div>
        <div className="pitch-box top"></div>
        <div className="pitch-box bottom"></div>
        <div className="pitch-6yd top"></div>
        <div className="pitch-6yd bottom"></div>
      </div>

      <div className="pitch-rows">
        {layout.map(({ pos, n }) => (
          <div key={pos} className="pitch-row" data-pos={pos}>
            {Array.from({ length: n }).map((_, i) => {
              const p = playersByPos[pos][i];
              if (!p) {
                return (
                  <div key={i} className="pitch-slot empty" title={`${pos} slot — pick from list`}>
                    <span className="slot-pos">{pos}</span>
                  </div>
                );
              }
              const cap = isCaptain(p.id);
              return (
                <div key={p.id} className={"pitch-slot filled" + (cap ? " cap" : "")}>
                  <button
                    className="slot-tile"
                    title={readOnly ? `${p.name} · ${p.pos} · ${p.nat}` : `Tap to make ${p.name} captain`}
                    onClick={readOnly ? undefined : () => onCaptain(p.id)}
                  >
                    <span className="slot-flag">{p.flag}</span>
                    {cap && <span className="cap-mark" aria-label="captain">★</span>}
                    {!cap && !readOnly && <span className="cap-hint" aria-hidden="true">★</span>}
                  </button>
                  <div className="slot-info">
                    <div className="slot-name">{p.name}</div>
                    <div className="slot-meta">{p.nat} · {p.form.toFixed(1)}</div>
                  </div>
                  {!readOnly && (
                    <button
                      className="slot-x"
                      aria-label="Remove"
                      onClick={(e) => { e.stopPropagation(); onRemove(p); }}
                    >×</button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="pitch-foot">
        <span>{formation}</span>
        <span className="pitch-tip">
          {readOnly ? "your locked-in XI" : (needsCap ? "★ tap a shirt to set your captain" : "tap shirt = captain · tap × = remove")}
        </span>
      </div>
    </div>
  );
}

window.DreamXI = DreamXI;
