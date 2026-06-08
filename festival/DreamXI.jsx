// STAR XI '26 — Screen 3: Star XI (11-player squad with pitch visualization)
// Single-viewport layout: header up top, body splits into left (filters + scrollable
// player list) and right (formation picker + pitch + compact captain bar). Nothing
// outside the player list scrolls — the whole screen lives inside the shell body.

const POS_LABELS = { ALL: "All", GK: "GK", DF: "DF", MF: "MF", FW: "FW" };
const POS_FULL = { ALL: "player", GK: "Goalkeeper", DF: "Defender", MF: "Midfielder", FW: "Forward" };

function DreamXI({ state, setState, onNext, onSkip, onBack }) {
  const formation = state.formation || "4-3-3";
  const limits = window.FORMATIONS[formation];
  const picks = state.picks || [];
  // Per-matchweek captain is now the only mode — three armbands (MD1/MD2/MD3),
  // and the GW3 captain stays on for the knockouts (with GW2 → GW1 fallback).
  // The legacy single-captain field is kept in state for back-compat but unused.
  const captainByMd = state.captainByMd || {};
  const mdCount = [1, 2, 3].filter(md => captainByMd[md]).length;

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
  const [sortMode, setSortMode] = useState("rating");
  const [moreFormOpen, setMoreFormOpen] = useState(false);

  // Every nation present in the pool, sorted alphabetically.
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
  // Re-sync filter when picks change and current filter is full
  useEffect(() => {
    if (posFilter !== "ALL" && counts[posFilter] >= limits[posFilter] && picks.length < 11) {
      setPosFilter(suggestedFilter);
    }
  }, [counts, posFilter, limits, suggestedFilter, picks.length]);

  // Close the formation popover when clicking outside it.
  const moreFormRef = useRef(null);
  useEffect(() => {
    if (!moreFormOpen) return;
    const onDoc = (e) => {
      if (moreFormRef.current && !moreFormRef.current.contains(e.target)) {
        setMoreFormOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [moreFormOpen]);

  // The pool is ~1,250 real, announced players. Show the top-form slice by default;
  // the search + nation filter narrows to anything. Picked players always stay visible.
  const LIST_LIMIT = 60;
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
      if (sortMode === "az") return a.name.localeCompare(b.name);
      return b.form - a.form;
    });
    const narrowed = q || natFilter !== "ALL";
    if (!narrowed && sorted.length > LIST_LIMIT) {
      const top = sorted.slice(0, LIST_LIMIT);
      const pickedTail = sorted.slice(LIST_LIMIT).filter(p => picks.includes(p.id));
      return { shown: [...top, ...pickedTail], hiddenCount: sorted.length - top.length - pickedTail.length };
    }
    return { shown: sorted, hiddenCount: 0 };
  }, [posFilter, picks, query, natFilter, sortMode]);

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

  // Tap-on-shirt now manages the per-matchweek armbands. If the player is
  // already a captain in any MD, tapping clears them from every MD. Otherwise
  // they fill the first empty MD slot (MD1 → MD2 → MD3); if all three are
  // already filled, the tap is ignored (use the dropdowns to reassign).
  const setCaptain = (id) => {
    setState(s => {
      const cur = { ...(s.captainByMd || {}) };
      const inMd = [1, 2, 3].find(md => cur[md] === id);
      if (inMd) {
        [1, 2, 3].forEach(md => { if (cur[md] === id) delete cur[md]; });
        return { ...s, captainByMd: cur };
      }
      const emptyMd = [1, 2, 3].find(md => !cur[md]);
      if (!emptyMd) return s;
      cur[emptyMd] = id;
      return { ...s, captainByMd: cur };
    });
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
    setMoreFormOpen(false);
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
      // Seed the three per-matchweek captains with the top-form picks (MD1
      // = highest, MD2 = next, MD3 = third). Existing assignments are kept.
      const nextCapByMd = { ...(s.captainByMd || {}) };
      const ranked = nextPicks
        .map(id => window.PLAYERS.find(p => p.id === id))
        .filter(Boolean)
        .sort((a, b) => b.form - a.form);
      let cursor = 0;
      [1, 2, 3].forEach(md => {
        if (nextCapByMd[md]) return;
        while (cursor < ranked.length &&
               [1, 2, 3].some(m => nextCapByMd[m] === ranked[cursor].id)) {
          cursor++;
        }
        if (cursor < ranked.length) {
          nextCapByMd[md] = ranked[cursor].id;
          cursor++;
        }
      });
      return { ...s, picks: nextPicks, captainByMd: nextCapByMd, captainPlus: true };
    });
  };

  const clearXI = () => {
    if (!confirm("Clear your Star XI?")) return;
    setState(s => ({ ...s, picks: [], captain: null, captainByMd: {} }));
  };

  const pinned = window.FORMATIONS_PINNED || Object.keys(window.FORMATIONS).slice(0, 3);
  const allFormations = Object.keys(window.FORMATIONS);
  // If the active formation isn't in the pinned set, surface it in the row so
  // the user can see what's selected without opening the popover.
  const visibleFormations = pinned.includes(formation) ? pinned : [...pinned, formation];

  // Pitch-first flow: tapping "+" on an empty slot opens the player picker,
  // pre-filtered to that position. null = closed.
  const [pickerPos, setPickerPos] = useState(null);
  const [showPoints, setShowPoints] = useState(false);

  const openPicker = (pos) => {
    setPosFilter(pos && pos !== "ALL" ? pos : suggestedFilter);
    setQuery("");
    setPickerPos(pos || "ALL");
  };
  const closePicker = () => setPickerPos(null);

  // Add from the overlay. Keep it open so a whole line fills fast: auto-advance
  // to the next position that still needs players, and close once the XI is full.
  const pickFromOverlay = (p) => {
    const wasPicked = picks.includes(p.id);
    togglePick(p);
    if (wasPicked) return;                 // a removal — stay put
    if (picks.length + 1 >= 11) { closePicker(); return; }
    const active = posFilter;
    if (active !== "ALL") {
      const after = (counts[active] || 0) + (p.pos === active ? 1 : 0);
      if (after >= limits[active]) {
        const gap = (pos) => limits[pos] - ((counts[pos] || 0) + (pos === p.pos ? 1 : 0));
        const next = ["GK", "DF", "MF", "FW"].filter((x) => gap(x) > 0).sort((a, b) => gap(b) - gap(a))[0];
        if (next) setPosFilter(next);
      }
    }
  };

  // Esc closes the picker; lock background scroll while it's open.
  useEffect(() => {
    if (!pickerPos) return;
    const onKey = (e) => { if (e.key === "Escape") closePicker(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [pickerPos]);

  return (
    <div className="step-screen">
      {showPoints && (
        <div className="pts-sheet-backdrop" onClick={() => setShowPoints(false)}>
          <div className="pts-sheet" onClick={e => e.stopPropagation()}>
            <div className="pts-sheet-handle" />
            <div className="pts-sheet-head">
              <span className="pts-sheet-title">How points work</span>
              <button className="pts-sheet-close" onClick={() => setShowPoints(false)}>×</button>
            </div>
            <div className="pts-sheet-body">

              <div className="pts-block">
                <div className="pts-block-label">⚽ Star XI — every match, all tournament</div>
                <div className="pts-table">
                  <div className="pts-row pos"><span>Goal scored</span><span>+5</span></div>
                  <div className="pts-row pos"><span>Assist</span><span>+3</span></div>
                  <div className="pts-row pos"><span>Clean sheet (GK)</span><span>+6</span></div>
                  <div className="pts-row pos"><span>Clean sheet (DF)</span><span>+3</span></div>
                  <div className="pts-row pos"><span>Team wins</span><span>+3</span></div>
                  <div className="pts-row pos"><span>Team draws</span><span>+1</span></div>
                  <div className="pts-row neg"><span>Yellow card</span><span>−1</span></div>
                  <div className="pts-row neg"><span>Red card</span><span>−3</span></div>
                  <div className="pts-row cap"><span>Captain armband</span><span>×2</span></div>
                </div>
                <p className="pts-note">Your XI keeps scoring through the knockouts — same values in the Round of 32, R16, QF, SF and Final. Picks from eliminated nations fall silent, so use your 3 swaps. Your <strong>GW3 captain</strong> wears the ×2 armband all the way through the knockouts.</p>
              </div>

              <div className="pts-block">
                <div className="pts-block-label">💎 Gem Boost — on goals &amp; assists</div>
                <div className="pts-table">
                  <div className="pts-row"><span>⭐ 8.0+ rating</span><span style={{color:"rgba(255,255,255,.5)"}}>×1</span></div>
                  <div className="pts-row pos"><span>🔵 7.0–7.9 (Solid Pick)</span><span>×1.2</span></div>
                  <div className="pts-row pos"><span>💎 6.0–6.9 (Hidden Gem)</span><span>×1.4</span></div>
                  <div className="pts-row pos"><span>🃏 &lt;6.0 (Wild Card)</span><span>×1.6</span></div>
                </div>
                <p className="pts-note">The boost lifts <strong>attacking returns only</strong> (goals + assists), so a breakout cheap forward can out-score a superstar. Clean sheets, wins and cards are flat.</p>
              </div>

              <div className="pts-block">
                <div className="pts-block-label">🏴 Your nation's deep run</div>
                <div className="pts-table">
                  <div className="pts-row pos"><span>Reaches Round of 16</span><span>+3</span></div>
                  <div className="pts-row pos"><span>Reaches Quarter-final</span><span>+6</span></div>
                  <div className="pts-row pos"><span>Reaches Semi-final</span><span>+10</span></div>
                  <div className="pts-row pos"><span>Reaches the Final</span><span>+15</span></div>
                  <div className="pts-row pos"><span>Champion 🏆</span><span>+25</span></div>
                </div>
                <p className="pts-note">A one-off bonus for how far your chosen home nation actually goes — you earn the highest milestone it reaches.</p>
              </div>

              <div className="pts-block">
                <div className="pts-block-label">🗺️ Road to the Final — bonus</div>
                <div className="pts-table">
                  <div className="pts-row pos"><span>Group position (each)</span><span>+1</span></div>
                  <div className="pts-row pos"><span>R32 advancer</span><span>+1</span></div>
                  <div className="pts-row pos"><span>R16 advancer</span><span>+2</span></div>
                  <div className="pts-row pos"><span>QF advancer</span><span>+4</span></div>
                  <div className="pts-row pos"><span>SF advancer</span><span>+8</span></div>
                  <div className="pts-row pos"><span>Champion call</span><span>+16</span></div>
                  <div className="pts-row cap"><span>Home-nation picks</span><span>×2</span></div>
                </div>
                <p className="pts-note">Predictions are optional bonus on top of your XI. The leaderboard can rank the full tournament, the group stage, or the knockouts alone.</p>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* ——— Player picker overlay ———
          Opens when you tap + on an empty slot, pre-filtered to that position.
          Bottom-sheet on phones, centred dialog on tablet/desktop. */}
      {pickerPos && (
        <div className="dxi-picker-backdrop" onClick={closePicker}>
          <div
            className="dxi-picker"
            role="dialog"
            aria-modal="true"
            aria-label={posFilter === "ALL" ? "Pick a player" : `Pick a ${POS_FULL[posFilter]}`}
            onClick={e => e.stopPropagation()}
          >
            <div className="dxi-picker-handle" />
            <div className="dxi-picker-head">
              <div className="dxi-picker-titles">
                <span className="dxi-picker-title">
                  {posFilter === "ALL" ? "Pick a player" : `Pick a ${POS_FULL[posFilter]}`}
                </span>
                <span className="dxi-picker-sub">
                  {picks.length}/11 picked
                  {posFilter !== "ALL" ? ` · ${counts[posFilter]}/${limits[posFilter]} ${posFilter}` : ""}
                </span>
              </div>
              <button className="dxi-picker-close" onClick={closePicker} aria-label="Close picker">×</button>
            </div>

            <div className="dxi-picker-controls">
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
                    placeholder="Search players: name or club…"
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
                  {natOptions.map(o => (
                    <option key={o.code} value={o.code}>{o.flag} {o.name}</option>
                  ))}
                </select>
                <select
                  className="dxi-sort"
                  value={sortMode}
                  onChange={e => setSortMode(e.target.value)}
                  aria-label="Sort players"
                >
                  <option value="rating">↓ Rating</option>
                  <option value="az">A–Z Name</option>
                </select>
              </div>
            </div>

            <div className="player-grid scroll">
              {shown.map(p => {
                const picked = picks.includes(p.id);
                const posFull = counts[p.pos] >= limits[p.pos];
                const disabled = !picked && (posFull || picks.length >= 11);
                return (
                  <button
                    key={p.id}
                    className={
                      "player-card" +
                      (picked ? " picked" : "") +
                      (disabled ? " is-disabled" : "")
                    }
                    onClick={() => pickFromOverlay(p)}
                    disabled={disabled}
                    title={p.hype ? `${p.name}: ${p.hype}` : p.name}
                  >
                    <div className="pc-flag">{p.flag}</div>
                    <div className="pc-body">
                      <div className="pc-name">{p.name}</div>
                      <div className="pc-meta">{p.pos} · {p.nat}</div>
                    </div>
                    <div className="pc-right">
                      <div className="pc-form">{p.form.toFixed(1)}</div>
                      {!disabled && (
                        <span className="pc-action">{picked ? "✓" : "+"}</span>
                      )}
                    </div>
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
                  +{hiddenCount} more {posFilter === "ALL" ? "" : POS_LABELS[posFilter] + " "}players.
                  <strong> Search</strong> by name, nation or club to find anyone.
                </div>
              )}
            </div>

            <div className="dxi-picker-foot">
              <span className="dxi-picker-hint">
                {picks.length >= 11
                  ? "Your XI is full — tap a shirt to set captains."
                  : posFilter !== "ALL" && counts[posFilter] >= limits[posFilter]
                    ? `${POS_FULL[posFilter]} line full — switch position above.`
                    : "Tap to add. Keep going, or close when you're done."}
              </span>
              <button className="btn primary sm dxi-picker-done" onClick={closePicker}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div className="dxi-screen">
        <header className="dxi-head">
          <div className="ph-titles">
            <h2 className="title">Draft your Star XI</h2>
            <p className="lede">
              No limits! Just your dream eleven, ranked all summer.
              Pick a formation, captain a player for ×2 points and rotate the armband each match week, if you want!
            </p>
          </div>
          <div className="dxi-actions">
            <button className="btn ghost sm dxi-points-btn" onClick={() => setShowPoints(true)}>Points ?</button>
            <button className="btn ghost sm" onClick={autoFillXI}>Auto-fill XI</button>
            <button className="btn ghost sm" onClick={clearXI}>Clear</button>
          </div>
        </header>

        <div className="dxi-body">
          <div className="dxi-stage">
            <div className="formation-row" ref={moreFormRef}>
              <span className="fr-label">Formation</span>
              <div className="formation-tabs">
                {visibleFormations.map(f => (
                  <button
                    key={f}
                    className={"formation-tab" + (formation === f ? " sel" : "")}
                    onClick={() => setFormation(f)}
                  >{f}</button>
                ))}
                <button
                  className={"formation-more" + (moreFormOpen ? " open" : "")}
                  onClick={() => setMoreFormOpen(v => !v)}
                  aria-label="More tactics"
                  aria-expanded={moreFormOpen}
                  title="More tactics"
                >
                  <span aria-hidden="true">⊞</span>
                </button>
              </div>
              {moreFormOpen && (
                <div className="formation-pop" role="menu">
                  <div className="fp-head">All tactics</div>
                  <div className="fp-grid">
                    {allFormations.map(f => (
                      <button
                        key={f}
                        className={"fp-tile" + (formation === f ? " sel" : "")}
                        onClick={() => setFormation(f)}
                        role="menuitem"
                      >
                        <span className="fp-name">{f}</span>
                        <span className="fp-sub">
                          {window.FORMATIONS[f].DF} · {window.FORMATIONS[f].MF} · {window.FORMATIONS[f].FW}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Pitch
              formation={formation}
              picks={picks}
              onPicksChange={(next) => setState(s => ({ ...s, picks: next }))}
              captain={null}
              captainPlus={true}
              captainByMd={captainByMd}
              onRemove={togglePick}
              onCaptain={setCaptain}
              onAddSlot={openPicker}
            />

            <div className="cap-bar">
              <div className="cap-bar-summary">
                <span className={"cap-star" + (mdCount === 3 ? " set" : "")}>★★★</span>
                <span className="cap-bar-text">
                  <strong>Three captains, one per round.</strong> Pick a different ×2 armband for GW1, GW2 &amp; GW3.
                  <em> ({mdCount}/3 set)</em>
                </span>
              </div>

              <div className="cap-md-strip">
                {[1, 2, 3].map(md => {
                  const cur = captainByMd[md];
                  const pickedPlayers = picks.map(id => window.PLAYERS.find(p => p.id === id)).filter(Boolean);
                  return (
                    <label key={md} className={"cap-md-chip" + (cur ? " set" : "")}>
                      <span className="cap-md-tag">GW{md}</span>
                      <select
                        value={cur || ""}
                        onChange={e => setCaptainForMd(md, e.target.value || null)}
                        aria-label={`Captain for GW${md}`}
                      >
                        <option value="">— pick —</option>
                        {pickedPlayers.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.flag} {p.name} ({p.pos})
                          </option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>

              <p className="cap-note">
                Your <strong>GW3 captain</strong> stays on for the knockouts. If your team is out
                or your captain is injured, it falls back to GW2 → GW1. Send and forget. No
                in-tournament subs.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>← Back</button>
        <div className="grow" />
        {picks.length < 11 ? (
          <button className="pill primary" disabled>Pick {totalLeft} more</button>
        ) : (
          <>
            <button className="pill ghost sm" onClick={onSkip}>Review</button>
            <button className="pill primary" onClick={onNext}>Road to Final →</button>
          </>
        )}
      </div>
    </div>
  );
}

// ——— Pitch visualization ———
function Pitch({ formation, picks, onPicksChange, captain, captainPlus, captainByMd, onRemove, onCaptain, onAddSlot, readOnly }) {
  const limits = window.FORMATIONS[formation];
  const needsCap = !readOnly && !captainPlus && !captain && picks.length > 0;
  const layout = [
    { pos: "FW", n: limits.FW },
    { pos: "MF", n: limits.MF },
    { pos: "DF", n: limits.DF },
    { pos: "GK", n: limits.GK },
  ];

  // Drag-and-drop: swap two filled slots by reordering picks array.
  const dragId = useRef(null);
  const handleDragStart = (id) => { dragId.current = id; };
  const handleDrop = (targetId) => {
    if (!dragId.current || dragId.current === targetId || !onPicksChange) return;
    const next = [...picks];
    const ai = next.indexOf(dragId.current);
    const bi = next.indexOf(targetId);
    if (ai === -1 || bi === -1) return;
    [next[ai], next[bi]] = [next[bi], next[ai]];
    onPicksChange(next);
    dragId.current = null;
  };

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
    <div className={"pitch" + (needsCap ? " needs-cap" : "") + (readOnly ? " read-only" : "")} aria-label={`${formation} pitch with your Star XI`}>
      <div className="pitch-bg" aria-hidden="true"></div>

      <div className="pitch-rows">
        {layout.map(({ pos, n }) => (
          <div key={pos} className="pitch-row" data-pos={pos}>
            {Array.from({ length: n }).map((_, i) => {
              const p = playersByPos[pos][i];
              if (!p) {
                if (readOnly || !onAddSlot) {
                  return (
                    <div key={i} className="pitch-slot empty" title={`${pos} slot`}>
                      <span className="slot-pos">{pos}</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={i}
                    type="button"
                    className="pitch-slot empty add"
                    onClick={() => onAddSlot(pos)}
                    title={`Add a ${POS_FULL[pos] || pos}`}
                  >
                    <span className="slot-add" aria-hidden="true">+</span>
                    <span className="slot-pos">{pos}</span>
                  </button>
                );
              }
              const cap = isCaptain(p.id);
              const capMd = captainPlus
                ? [1, 2, 3].find(md => captainByMd && captainByMd[md] === p.id)
                : null;
              const tip = readOnly
                ? `${p.name} · ${p.pos} · ${p.nat}`
                : (cap
                    ? `${p.name} is your MD${capMd} captain. Tap to clear`
                    : `Tap to make ${p.name} a captain (next empty MD slot)`);
              return (
                <div
                  key={p.id}
                  className={"pitch-slot filled" + (cap ? " cap" : "")}
                  draggable={!readOnly}
                  onDragStart={!readOnly ? () => handleDragStart(p.id) : undefined}
                  onDragOver={!readOnly ? (e) => e.preventDefault() : undefined}
                  onDrop={!readOnly ? () => handleDrop(p.id) : undefined}
                >
                  <div className="slot-shirt">
                    <button
                      className="slot-tile"
                      title={tip}
                      onClick={readOnly ? undefined : () => onCaptain(p.id)}
                    >
                      <span className="slot-flag">{p.flag}</span>
                      <span className="slot-pos-label">{p.pos}</span>
                      {cap && (
                        <span className="cap-mark" aria-label={`MD${capMd} captain`}>
                          {capMd || "★"}
                        </span>
                      )}
                      {!cap && !readOnly && <span className="cap-hint" aria-hidden="true">★</span>}
                    </button>
                    {!readOnly && (
                      <button
                        className="slot-x"
                        aria-label="Remove"
                        title={`Remove ${p.name}`}
                        onClick={(e) => { e.stopPropagation(); onRemove(p); }}
                      >×</button>
                    )}
                  </div>
                  <div className="slot-info">
                    <div className="slot-name">{p.name}</div>
                    <div className="slot-meta">{p.nat} · {p.form.toFixed(1)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <div className="pitch-foot">
        <span>{formation}</span>
        {readOnly && <span className="pitch-tip">your locked-in XI</span>}
      </div>
    </div>
  );
}

window.DreamXI = DreamXI;
