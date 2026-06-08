// STAR XI '26 — Screen 3: Road to the Final (optional bonus)
//
// Single linear flow, one viewport per sub-step:
//
//   sub 0..11 — Groups A..L: order the 4 teams 1st/2nd/3rd/4th.
//                Drag-drop to reorder after seating; auto-places the 4th once
//                three are picked so a single tap completes the group.
//   sub 12    — Best 3rd-Placed (the Lucky 8 of 12). Pick which 3rds advance.
//   sub 13    — Round of 32 (16 matchups, laid out as top half | bottom half).
//   sub 14    — Round of 16 (8).
//   sub 15    — Quarterfinals (4).
//   sub 16    — Semifinals (2).
//   sub 17    — Final + champion reveal.
//
// Each placed team and each backed knockout pick shows the points it's worth if
// right (doubled if it's the player's home nation). The footer's Back/Next
// walks the whole flow — users never see a "matchday" tab grid again.

function PointsInfoModal({ onClose }) {
  return (
    <div className="pts-sheet-backdrop" onClick={onClose}>
      <div className="pts-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pts-sheet-handle" />
        <div className="pts-sheet-head">
          <span className="pts-sheet-title">How points work</span>
          <button className="pts-sheet-close" onClick={onClose}>×</button>
        </div>
        <div className="pts-sheet-body">

          <div className="pts-block">
            <div className="pts-block-label">⚽ Star XI — per match</div>
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
            <p className="pts-note">Lower-rated players earn a ×1.2–×1.6 gem boost on goals &amp; assists. Your XI scores in the knockouts too, and your nation's deep run pays a bonus (R16 +3 → Champion +25).</p>
          </div>

          <div className="pts-block">
            <div className="pts-block-label">🗺️ Road to the Final</div>
            <div className="pts-table">
              <div className="pts-row pos"><span>Correct group position</span><span>+1</span></div>
              <div className="pts-row pos"><span>Perfect group (Bullseye)</span><span>★</span></div>
              <div className="pts-row pos"><span>R32 advance</span><span>+1</span></div>
              <div className="pts-row pos"><span>R16 advance</span><span>+2</span></div>
              <div className="pts-row pos"><span>Quarterfinal advance</span><span>+4</span></div>
              <div className="pts-row pos"><span>Semifinal advance</span><span>+8</span></div>
              <div className="pts-row pos"><span>Correct champion</span><span>+16 ★</span></div>
            </div>
            <p className="pts-note">Your home nation earns double Road-to-the-Final points.</p>
          </div>

          <div className="pts-block">
            <div className="pts-block-label">📊 Two leaderboards</div>
            <p className="pts-note pts-note-board"><strong>Combined</strong> — XI points + Road picks. The main global table.</p>
            <p className="pts-note pts-note-board"><strong>Star XI only</strong> — squad performance only, Road picks excluded.</p>
          </div>

        </div>
      </div>
    </div>
  );
}

const RTF_GROUP_LETTERS = "ABCDEFGHIJKL".split("");
// Flow is now ONE combined Groups screen + Lucky 8 + R32 + R16 + QF + SF + Final.
const RTF_GROUPS_SUB = 0;   // all 12 groups, on a single screen
const RTF_LUCKY_SUB  = 1;
const RTF_KO_START   = 2;   // r32 = 2, r16 = 3, qf = 4, sf = 5
const RTF_FINAL_SUB  = 6;
const RTF_SUB_COUNT  = 7;
// Per-round points-per-correct-pick. Matches scoring-core.js.
const RTF_KO_PTS = { r32: 1, r16: 2, qf: 4, sf: 8, final: 16 };

// Is `arr` a complete, valid 1st→4th ordering of group `letter`'s four teams?
function rtfValidGroupOrder(arr, letter) {
  const teams = window.GROUPS[letter] || [];
  if (!Array.isArray(arr) || arr.length !== 4 || arr.some((c) => !c)) return false;
  const codes = new Set(teams.map((t) => t.code));
  if (arr.some((c) => !codes.has(c))) return false;
  return new Set(arr).size === 4;
}

// Normalise whatever the player has saved into a fully-shaped bracket. Groups
// are ALWAYS returned fully populated: a saved group is kept only when it's a
// valid complete ordering, otherwise it falls back to FIFA-rank order (so a
// fresh entry, a partial load, or Clear all land on the pre-seeded ladders).
// Pass null to get the all-defaults bracket.
function rtfEnsureBracket(b) {
  const out = {
    groups: {},
    lucky3rds: [],
    advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} },
  };
  const defaults = window.rankedGroups();
  RTF_GROUP_LETTERS.forEach((letter) => {
    const saved = b && b.groups && b.groups[letter];
    out.groups[letter] = rtfValidGroupOrder(saved, letter) ? saved.slice() : defaults[letter];
  });
  if (!b) return out;
  out.lucky3rds = Array.isArray(b.lucky3rds) ? b.lucky3rds.slice(0, 8) : [];
  const adv = b.advances || {};
  ["r32", "r16", "qf", "sf", "final"].forEach((k) => {
    out.advances[k] = adv[k] ? { ...adv[k] } : {};
  });
  return out;
}

function rtfGroupDone(bracket, letter) {
  const o = bracket.groups[letter];
  return !!(o && o.length === 4 && o.every(Boolean));
}
function rtfLuckyDone(bracket) {
  return !!(bracket.lucky3rds && bracket.lucky3rds.length === 8);
}
function rtfRoundDone(bracket, round) {
  const size = window.KO_ROUND_SIZES[round];
  const r = (bracket.advances && bracket.advances[round]) || {};
  let n = 0;
  for (let i = 0; i < size; i++) if (r[i]) n++;
  return n === size;
}
function rtfRoundCount(bracket, round) {
  const r = (bracket.advances && bracket.advances[round]) || {};
  let n = 0;
  Object.keys(r).forEach((k) => { if (r[k]) n++; });
  return n;
}

// Resume the player where they left off. Groups are pre-seeded by FIFA rank, so
// the road always opens on the (single) Groups screen unless the player has
// already moved past the Lucky-8 into the knockouts.
function rtfFindStartSub(bracket) {
  if (!rtfLuckyDone(bracket)) return RTF_GROUPS_SUB;
  const rounds = ["r32", "r16", "qf", "sf", "final"];
  for (let i = 0; i < rounds.length; i++) {
    if (!rtfRoundDone(bracket, rounds[i])) return RTF_KO_START + i;
  }
  return RTF_FINAL_SUB;
}

function Predict({ state, setState, onNext, onBack }) {
  const bracket = useMemo(() => rtfEnsureBracket(state.bracket), [state.bracket]);
  const nationCode = state.nation;
  const nationObj = nationCode ? window.NATIONS.find((n) => n.code === nationCode) : null;

  const [sub, setSub] = useState(() => rtfFindStartSub(bracket));
  const [ptsInfoOpen, setPtsInfoOpen] = useState(false);

  // Open each round at its OWN content whenever the sub-step changes. Players
  // jump between rounds by tapping the progress strip at the BOTTOM of the pane;
  // resetting to the very top stranded them on the shared "Road to the Final"
  // intro + action row (Points · Skip · Auto-fill) — text they've already read —
  // instead of the round's title and the picks they came to make. So we scroll
  // to the top of .rtf-body (its title leads), leaving the header one short
  // scroll up. useLayoutEffect positions the pane before paint, so there's no
  // visible jump; it falls back to the very top if the body can't be measured.
  // The round's own title (Group X / Best 3rd-Placed / Round of 32 …) is now the
  // FIRST thing in the pane, so opening each sub-step at the top lands exactly on
  // it — no header to scroll past. Reset on every sub change.
  const scrollRef = useRef(null);
  React.useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
  }, [sub]);

  const writeBracket = (mutator) => {
    setState((s) => {
      const next = rtfEnsureBracket(s.bracket);
      mutator(next);
      return { ...s, bracket: next };
    });
  };

  // Whenever the group standings (or Lucky-8) change, the T-slots in the
  // knockout template can now point at different teams. Drop any downstream
  // pick that no longer matches a real contestant in its match.
  const cleanupDownstream = (b) => {
    if (b.lucky3rds && b.lucky3rds.length > 0) {
      // Drop lucky3rds for teams that aren't 3rd-placed anywhere right now.
      const validThirds = new Set();
      Object.keys(b.groups).forEach((g) => {
        const t = b.groups[g] && b.groups[g][2];
        if (t) validThirds.add(t);
      });
      b.lucky3rds = b.lucky3rds.filter((c) => validThirds.has(c));
    }
    ["r32", "r16", "qf", "sf", "final"].forEach((round) => {
      const r = b.advances[round] || {};
      Object.keys(r).forEach((k) => {
        const idx = parseInt(k, 10);
        const m = window.resolveKoMatch(b, round, idx);
        const valid = [m.home && m.home.code, m.away && m.away.code].filter(Boolean);
        if (!valid.includes(r[k])) delete r[k];
      });
    });
  };

  const setGroup = (letter, ordering) => {
    writeBracket((b) => {
      b.groups[letter] = ordering.slice();
      cleanupDownstream(b);
    });
  };

  const setLucky = (codes) => {
    writeBracket((b) => {
      b.lucky3rds = codes.slice(0, 8);
      cleanupDownstream(b);
    });
  };

  const setAdvance = (round, idx, code) => {
    writeBracket((b) => {
      b.advances[round][idx] = code;
      // Clear later rounds that this slot fed into.
      const order = ["r32", "r16", "qf", "sf", "final"];
      const here = order.indexOf(round);
      for (let i = here + 1; i < order.length; i++) {
        const round2 = order[i];
        const r2 = b.advances[round2];
        Object.keys(r2).forEach((k) => {
          const k2 = parseInt(k, 10);
          const m = window.resolveKoMatch(b, round2, k2);
          const valid = [m.home && m.home.code, m.away && m.away.code].filter(Boolean);
          if (!valid.includes(r2[k])) delete r2[k];
        });
      }
    });
  };

  const clearAll = () => {
    if (!confirm("Reset every group to FIFA-rank order and clear all knockout picks?")) return;
    setState((s) => ({ ...s, bracket: rtfEnsureBracket(null) }));
    setSub(RTF_GROUPS_SUB);
  };

  // Auto-fill everything: groups by FIFA rank, Lucky-8 by FIFA rank, then all
  // knockout rounds in order so later rounds resolve against earlier picks.
  const autoFillAll = () => {
    writeBracket((b) => {
      const natByCode = {};
      window.NATIONS.forEach((n) => { natByCode[n.code] = n; });

      // Fill all 12 groups
      RTF_GROUP_LETTERS.forEach((letter) => {
        const teams = window.GROUPS[letter];
        b.groups[letter] = teams.slice().sort((a, b) => a.rank - b.rank).map((t) => t.code);
      });

      // Fill Lucky-8: top 8 of all 3rd-placed teams by FIFA rank
      const thirds = RTF_GROUP_LETTERS
        .map((g) => b.groups[g] && b.groups[g][2])
        .filter(Boolean)
        .map((code) => natByCode[code])
        .filter(Boolean)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 8);
      b.lucky3rds = thirds.map((t) => t.code);

      // Fill all knockout rounds
      ["r32", "r16", "qf", "sf", "final"].forEach((round) => {
        const slots = round === "final" ? 1 : window.KO_ROUND_SIZES[round];
        for (let i = 0; i < slots; i++) {
          const m = window.resolveKoMatch(b, round, i);
          if (!m || !m.home || !m.away) continue;
          const homeRank = (natByCode[m.home.code] && natByCode[m.home.code].rank) || 99;
          const awayRank = (natByCode[m.away.code] && natByCode[m.away.code].rank) || 99;
          b.advances[round][i] = homeRank <= awayRank ? m.home.code : m.away.code;
        }
      });
    });
    setSub(RTF_FINAL_SUB);
  };

  // Auto-fill all knockout rounds by picking the higher-ranked (lower FIFA rank
  // number) team in each match. Works in order so later rounds resolve correctly
  // once earlier picks are in place. Requires groups + Lucky-8 to be done first.
  const autoFillKnockouts = () => {
    writeBracket((b) => {
      const natByCode = {};
      window.NATIONS.forEach((n) => { natByCode[n.code] = n; });
      ["r32", "r16", "qf", "sf", "final"].forEach((round) => {
        const slots = round === "final" ? 1 : window.KO_ROUND_SIZES[round];
        for (let i = 0; i < slots; i++) {
          const m = window.resolveKoMatch(b, round, i);
          if (!m || !m.home || !m.away) continue;
          const homeRank = (natByCode[m.home.code] && natByCode[m.home.code].rank) || 99;
          const awayRank = (natByCode[m.away.code] && natByCode[m.away.code].rank) || 99;
          b.advances[round][i] = homeRank <= awayRank ? m.home.code : m.away.code;
        }
      });
    });
    setSub(RTF_FINAL_SUB);
  };

  // ——— Navigation ———
  // Groups are pre-seeded by FIFA rank, so they're always complete — the gate
  // is now only the Lucky-8 before the knockouts unlock.
  const luckyDone = rtfLuckyDone(bracket);

  const goPrev = () => {
    if (sub === RTF_GROUPS_SUB) { onBack(); return; }
    setSub((s) => s - 1);
  };
  const goNext = () => {
    if (sub === RTF_SUB_COUNT - 1) { onNext(); return; }
    if (sub === RTF_LUCKY_SUB && !luckyDone) return;
    setSub((s) => s + 1);
  };

  const nextLabel =
    sub === RTF_GROUPS_SUB ? "Lock groups · pick the Lucky 8 →"
    : sub === RTF_LUCKY_SUB ? (luckyDone ? "On to R32 →" : `Pick ${8 - (bracket.lucky3rds || []).length} more 3rd${(bracket.lucky3rds || []).length === 7 ? "" : "s"}`)
    : sub === RTF_KO_START ? "On to R16 →"
    : sub === RTF_KO_START + 1 ? "On to Quarters →"
    : sub === RTF_KO_START + 2 ? "On to Semis →"
    : sub === RTF_KO_START + 3 ? "Pick a champion →"
    :              "Confirm →";

  const subTitle =
    sub === RTF_GROUPS_SUB ? "Group stage"
    : sub === RTF_LUCKY_SUB ? "Best 3rd-Placed"
    : sub === RTF_KO_START ? "Round of 32"
    : sub === RTF_KO_START + 1 ? "Round of 16"
    : sub === RTF_KO_START + 2 ? "Quarterfinals"
    : sub === RTF_KO_START + 3 ? "Semifinals"
    :              "Final";

  const subCount = (() => {
    if (sub === RTF_GROUPS_SUB) return "12 groups · pre-seeded by FIFA rank";
    if (sub === RTF_LUCKY_SUB) return `${(bracket.lucky3rds || []).length}/8 picked`;
    const round = ["r32", "r16", "qf", "sf", "final"][sub - RTF_KO_START];
    return `${rtfRoundCount(bracket, round)}/${window.KO_ROUND_SIZES[round]} picked`;
  })();

  // Progress meter — 48 group cells + 8 lucky + 31 knockout = 87 total.
  const totalPicks = 48 + 8 + 16 + 8 + 4 + 2 + 1;
  const madePicks =
    RTF_GROUP_LETTERS.reduce((n, g) => n + ((bracket.groups[g] || []).filter(Boolean).length), 0)
    + (bracket.lucky3rds || []).length
    + ["r32", "r16", "qf", "sf", "final"].reduce((n, r) => n + rtfRoundCount(bracket, r), 0);
  const pct = (madePicks / totalPicks) * 100;

  const nextDisabled = sub === RTF_LUCKY_SUB && !luckyDone;
  const nextTitle = sub === RTF_LUCKY_SUB && !luckyDone
    ? "Pick your 8 advancing 3rds to unlock the knockouts"
    : "";

  return (
    <div className="step-screen">
      <div className="step-scroll stagger" ref={scrollRef}>
        {/* Every round leads with its OWN title. The shared "Road to the Final"
            intro is gone (you've met it on the prior screens) and the global
            actions live at the BOTTOM of the pane — see .rtf-actions-bottom
            below the progress strip — so nothing ever pushes the round content
            down on entry. The pane simply opens at the top. */}
        <div className="rtf-body" key={sub}>
          {sub >= RTF_LUCKY_SUB && (
            <div className="rtf-subhead">
              <h3 className="rtf-subtitle">{subTitle}</h3>
              <span className="rtf-subcount">{subCount}</span>
            </div>
          )}

          {sub === RTF_GROUPS_SUB ? (
            <AllGroupsBoard
              bracket={bracket}
              nationCode={nationCode}
              onSetGroup={setGroup}
            />
          ) : sub === RTF_LUCKY_SUB ? (
            <BestThirdsBoard
              bracket={bracket}
              nationCode={nationCode}
              onSetLucky={setLucky}
            />
          ) : sub === RTF_FINAL_SUB ? (
            <FinalStage
              bracket={bracket}
              nationCode={nationCode}
              onPick={(code) => setAdvance("final", 0, code)}
            />
          ) : (
            <KnockoutBoard
              round={["r32", "r16", "qf", "sf"][sub - RTF_KO_START]}
              bracket={bracket}
              nationCode={nationCode}
              onPick={(round, idx, code) => setAdvance(round, idx, code)}
            />
          )}
        </div>

        <RtfProgressStrip
          sub={sub}
          setSub={setSub}
          bracket={bracket}
          luckyDone={luckyDone}
        />

        {/* Global actions: pinned to the bottom of the scroll so they never
            push the round title down. Reachable with a short scroll; the per-
            group Auto-fill/Clear still live up in the group header. */}
        <div className="rtf-head-actions rtf-actions-bottom">
          <button className="btn ghost sm pts-info-btn" onClick={() => setPtsInfoOpen(true)} title="How points work">
            ℹ Points
          </button>
          <button className="btn ghost sm" onClick={() => onNext()}>Skip to confirm</button>
          <button className="btn ghost sm rtf-autofill-btn" onClick={autoFillAll} title="Keep FIFA-rank groups, pick the top 8 third-placed teams, and fill every knockout match with the higher-ranked side">
            ⚡ Auto-fill all
          </button>
          {luckyDone && (
            <button className="btn ghost sm rtf-autofill-btn" onClick={autoFillKnockouts} title="Pick the higher-ranked team in every remaining knockout match">
              ⚡ Auto-fill knockouts
            </button>
          )}
          {madePicks > 0 && <button className="btn ghost sm" onClick={clearAll}>Clear</button>}
        </div>
      </div>

      <div className="step-foot">
        <button className="pill ghost sm" onClick={goPrev}>← Back</button>
        <div className="foot-meter" title={`${madePicks} of ${totalPicks} picks made`}>
          <div className="fm-bar"><div className="fm-fill" style={{ width: `${pct}%` }}></div></div>
        </div>
        <button
          className="pill primary"
          onClick={goNext}
          disabled={nextDisabled}
          title={nextTitle}
        >{nextLabel}</button>
      </div>

      {ptsInfoOpen && <PointsInfoModal onClose={() => setPtsInfoOpen(false)} />}
    </div>
  );
}

// ——— Progress strip: a single Groups cell + a Lucky-8 cell + knockout rounds ———
function RtfProgressStrip({ sub, setSub, bracket, luckyDone }) {
  const koCells = [
    { key: "lucky", subIdx: RTF_LUCKY_SUB,    label: "3rds", done: luckyDone, locked: false },
    { key: "r32",   subIdx: RTF_KO_START,     label: "R32",  done: rtfRoundDone(bracket, "r32"),   locked: !luckyDone },
    { key: "r16",   subIdx: RTF_KO_START + 1, label: "R16",  done: rtfRoundDone(bracket, "r16"),   locked: !luckyDone },
    { key: "qf",    subIdx: RTF_KO_START + 2, label: "QF",   done: rtfRoundDone(bracket, "qf"),    locked: !luckyDone },
    { key: "sf",    subIdx: RTF_KO_START + 3, label: "SF",   done: rtfRoundDone(bracket, "sf"),    locked: !luckyDone },
    { key: "final", subIdx: RTF_FINAL_SUB,    label: "🏆",   done: rtfRoundDone(bracket, "final"), locked: !luckyDone },
  ];
  return (
    <div className="rtf-progress">
      <div className="rtf-progress-row">
        <span className="rtf-prog-label">Groups</span>
        <div className="rtf-prog-cells">
          <button
            className={"rtf-dot grp wide done" + (sub === RTF_GROUPS_SUB ? " active" : "")}
            title="All 12 groups"
            onClick={() => setSub(RTF_GROUPS_SUB)}
          >All 12 groups ✓</button>
        </div>
      </div>
      <div className="rtf-progress-row">
        <span className="rtf-prog-label">Knockouts</span>
        <div className="rtf-prog-cells">
          {koCells.map((c) => {
            const active = sub === c.subIdx;
            return (
              <button
                key={c.key}
                className={"rtf-dot ko" + (active ? " active" : "") + (c.done ? " done" : "") + (c.locked ? " locked" : "")}
                onClick={() => { if (!c.locked) setSub(c.subIdx); }}
                disabled={c.locked}
                title={c.locked ? "Pick your Lucky 8 first" : c.label}
              >{c.label}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ——— Group ladder (redesigned: pool on top, solid ladder below) ———
const RTF_SLOT_META = [
  { medal: "🥇", rank: "1st", cls: "q1", badge: "through", badgeText: "Through" },
  { medal: "🥈", rank: "2nd", cls: "q2", badge: "through", badgeText: "Through" },
  { medal: "🥉", rank: "3rd", cls: "q3", badge: "maybe",   badgeText: "Best-3rd?" },
  { medal: "▪",  rank: "4th", cls: "q4", badge: "out",     badgeText: "Out" },
];

// All 12 groups on a single screen — pre-seeded by FIFA rank, reorder-only.
function AllGroupsBoard({ bracket, nationCode, onSetGroup }) {
  return (
    <div className="rtf-allgroups">
      <div className="rtf-subhead">
        <h3 className="rtf-subtitle">Group stage</h3>
        <span className="rtf-subcount">12 groups · pre-seeded by FIFA rank</span>
      </div>

      <div className="rtf-ag-cue">
        <span className="rtf-ag-cue-ico" aria-hidden="true">⚽</span>
        <p>
          <strong>Every group is already filled in FIFA-rank order.</strong> Just reorder
          the upsets — drag a team (or tap ▲▼) to set who finishes 1st → 4th. The top two
          go through; the best eight 3rd-placed teams sneak in after.
        </p>
        <span className="rtf-ag-legend">
          <i><b className="lg-thru" />Top 2 through</i>
          <i><b className="lg-maybe" />3rd · maybe</i>
          <i><b className="lg-out" />4th · out</i>
        </span>
      </div>

      <div className="rtf-ag-grid">
        {RTF_GROUP_LETTERS.map((letter) => (
          <GroupCard
            key={letter}
            letter={letter}
            teams={window.GROUPS[letter]}
            ordering={bracket.groups[letter]}
            nationCode={nationCode}
            onSet={(o) => onSetGroup(letter, o)}
          />
        ))}
      </div>
    </div>
  );
}

// One compact, reorder-only group ladder. Always shows four seated teams.
function GroupCard({ letter, teams, ordering, nationCode, onSet }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const fifa = teams.slice().sort((a, b) => a.rank - b.rank).map((t) => t.code);
  const ord = (Array.isArray(ordering) && ordering.length === 4) ? ordering : fifa;
  const teamByCode = (code) => teams.find((t) => t.code === code) || null;
  const isFifaOrder = ord.join("|") === fifa.join("|");

  const moveSlot = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j > 3) return;
    const next = ord.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onSet(next);
  };
  const resetFifa = () => onSet(fifa.slice());

  // drag-drop reorder (desktop). Touch devices use the ▲▼ controls.
  const onDragStart = (i, e) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(i)); } catch (_) {}
  };
  const onDragOver = (i, e) => {
    if (dragFrom === null || dragFrom === i) return;
    e.preventDefault();
    if (dragOver !== i) setDragOver(i);
  };
  const onDrop = (i, e) => {
    e.preventDefault();
    const from = dragFrom;
    setDragFrom(null); setDragOver(null);
    if (from === null || from === i) return;
    const next = ord.slice();
    [next[from], next[i]] = [next[i], next[from]];
    onSet(next);
  };
  const onDragEnd = () => { setDragFrom(null); setDragOver(null); };

  return (
    <div className="rtf-gcard">
      <div className="rtf-gcard-head">
        <h4 className="rtf-gcard-title">Group {letter}</h4>
        <button
          className="rtf-gcard-reset"
          onClick={resetFifa}
          disabled={isFifaOrder}
          title="Reset this group to FIFA-rank order"
        >↻ FIFA</button>
      </div>

      <div className="rtf-gcard-ladder">
        {ord.map((code, s) => {
          const m = RTF_SLOT_META[s];
          const team = teamByCode(code);
          if (!team) return null;
          const mine = team.code === nationCode;
          return (
            <div
              key={code}
              className={
                "rtf-grow " + m.cls
                + (mine ? " mine" : "")
                + (dragFrom === s ? " dragging" : "")
                + (dragOver === s ? " drop-target" : "")
              }
              draggable
              onDragStart={(e) => onDragStart(s, e)}
              onDragOver={(e) => onDragOver(s, e)}
              onDrop={(e) => onDrop(s, e)}
              onDragEnd={onDragEnd}
            >
              <span className="rtf-grow-rail" aria-hidden="true"></span>
              <span className="rtf-grow-pos">{m.rank}</span>
              <span className="rtf-grow-flag">{team.flag}</span>
              <span className="rtf-grow-name">{team.name}</span>
              <span className="rtf-grow-rank">#{team.rank}</span>
              {mine && <span className="rtf-grow-x2" title="Your nation — points ×2">×2</span>}
              <span className="rtf-grow-ctrls">
                <button className="rtf-iconbtn" onClick={() => moveSlot(s, -1)} disabled={s === 0} aria-label={`Move ${team.name} up`}>▲</button>
                <button className="rtf-iconbtn" onClick={() => moveSlot(s, 1)} disabled={s === 3} aria-label={`Move ${team.name} down`}>▼</button>
              </span>
              <span className="rtf-grow-grip" aria-hidden="true">⠿</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ——— Best 8 of 12 third-placed teams ———
// Shows each group's 3rd-placed team as a card; tap to toggle "advances".
// Exactly 8 must be picked before the next sub-step unlocks. Auto-fill picks
// the top 8 by FIFA rank.
function BestThirdsBoard({ bracket, nationCode, onSetLucky }) {
  const lucky = bracket.lucky3rds || [];
  const thirds = RTF_GROUP_LETTERS
    .map((g) => {
      const code = bracket.groups[g] && bracket.groups[g][2];
      const team = code && window.NATIONS.find((n) => n.code === code);
      return { group: g, team };
    })
    .filter((t) => t.team);

  const toggle = (code) => {
    if (lucky.includes(code)) {
      onSetLucky(lucky.filter((c) => c !== code));
    } else if (lucky.length < 8) {
      onSetLucky([...lucky, code]);
    }
  };

  const autoFill = () => {
    const top8 = thirds
      .slice()
      .sort((a, b) => a.team.rank - b.team.rank)
      .slice(0, 8)
      .map((t) => t.team.code);
    onSetLucky(top8);
  };

  const clear = () => onSetLucky([]);

  const remaining = 8 - lucky.length;

  return (
    <div className="rtf-thirds">
      <div className="rtf-thirds-head">
        <div className="rtf-thirds-status">
          <span className={"rtf-thirds-count" + (remaining === 0 ? " done" : "")}>
            {lucky.length}<em>/8</em>
          </span>
          <span className="rtf-thirds-hint">
            {remaining === 0
              ? "Your eight 3rds. They'll be seeded into the knockouts by FIFA rank."
              : `Pick ${remaining} more 3rd-placed team${remaining === 1 ? "" : "s"} to advance.`}
          </span>
        </div>
        <div className="rtf-thirds-actions">
          <button className="btn ghost sm" onClick={autoFill}>Auto-fill by FIFA rank</button>
          {lucky.length > 0 && <button className="btn ghost sm" onClick={clear}>Clear</button>}
        </div>
      </div>

      <div className="rtf-thirds-grid">
        {thirds.map(({ group, team }) => {
          const picked = lucky.includes(team.code);
          const mine = team.code === nationCode;
          const full = !picked && lucky.length >= 8;
          return (
            <button
              key={team.code}
              className={"rtf-third" + (picked ? " picked" : "") + (mine ? " mine" : "") + (full ? " full" : "")}
              onClick={() => toggle(team.code)}
              disabled={full}
              title={`Group ${group} 3rd · ${team.name} · FIFA #${team.rank}${picked ? " · advances" : full ? " · locked out" : " · tap to advance"}`}
            >
              <span className="rtf-t3-grp">{group}</span>
              <span className="rtf-t3-state" aria-hidden="true">{picked ? "✓" : full ? "" : "+"}</span>
              {mine && <span className="rtf-t3-star" title="Your nation — points ×2">★</span>}
              <span className="rtf-t3-flag">{team.flag}</span>
              <span className="rtf-t3-name">{team.name}</span>
              <span className="rtf-t3-rank">#{team.rank}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ——— Knockout board: sided layout (top half | center | bottom half) ———
// Each round is split down the middle so the player can see which side of the
// draw their picks live on. The center column shows a small trophy + arrows
// hinting at the funnel toward the final.
function KnockoutBoard({ round, bracket, nationCode, onPick }) {
  const size = window.KO_ROUND_SIZES[round];
  const half = size / 2;
  const top = [], bottom = [];
  for (let i = 0; i < half; i++) top.push(i);
  for (let i = half; i < size; i++) bottom.push(i);

  const sizeClass = "rtf-bracket-" + round;
  const ptsPerPick = RTF_KO_PTS[round];

  const renderMatch = (idx) => {
    const m = window.resolveKoMatch(bracket, round, idx);
    const picked = (bracket.advances[round] || {})[idx] || null;
    return (
      <KoMatchCard
        key={idx}
        home={m.home}
        away={m.away}
        picked={picked}
        nationCode={nationCode}
        ptsPerPick={ptsPerPick}
        onPick={(code) => onPick(round, idx, code)}
      />
    );
  };

  return (
    <div className={"rtf-bracket " + sizeClass}>
      <div className="rtf-side rtf-side-top">
        <div className="rtf-side-label">Top half</div>
        <div className="rtf-side-list">{top.map(renderMatch)}</div>
      </div>
      <div className="rtf-bracket-mid" aria-hidden="true">
        <span className="rtf-mid-arrow">→</span>
        <span className="rtf-mid-trophy">🏆</span>
        <span className="rtf-mid-arrow">←</span>
      </div>
      <div className="rtf-side rtf-side-bottom">
        <div className="rtf-side-label">Bottom half</div>
        <div className="rtf-side-list">{bottom.map(renderMatch)}</div>
      </div>
    </div>
  );
}

// ——— Single knockout match card ———
// Each team button carries a "+N pts" tag that lights up green when you back
// it (doubled gold for your home nation).
function KoMatchCard({ home, away, picked, nationCode, ptsPerPick, onPick }) {
  const renderSide = (team, side) => {
    if (!team) {
      return (
        <div className={"kom-team empty " + side}>
          <span className="kom-flag">·</span>
          <span className="kom-name">TBD</span>
        </div>
      );
    }
    const isPicked = picked === team.code;
    const mine = team.code === nationCode;
    const pts = mine ? ptsPerPick * 2 : ptsPerPick;
    return (
      <button
        className={"kom-team " + side + (isPicked ? " picked" : "") + (mine ? " mine" : "")}
        onClick={() => onPick(team.code)}
      >
        <span className="kom-flag">{team.flag}</span>
        <div className="kom-meta">
          <span className="kom-name">{team.code}</span>
          <span className="kom-rank">#{team.rank}</span>
        </div>
        <span className={"kom-pts" + (isPicked ? " active" : "")}>
          {isPicked ? "✓ +" : "+"}{pts}
        </span>
      </button>
    );
  };
  return (
    <div className={"kom-card" + (picked ? " has-pick" : "")}>
      {renderSide(home, "home")}
      <span className="kom-vs">vs</span>
      {renderSide(away, "away")}
    </div>
  );
}

// ——— Final + champion reveal ———
function FinalStage({ bracket, nationCode, onPick }) {
  const m = window.resolveKoMatch(bracket, "final", 0);
  const picked = (bracket.advances.final || {})[0] || null;
  const champ = picked ? window.NATIONS.find((n) => n.code === picked) : null;

  return (
    <div className="rtf-final">
      <div className="rtf-final-card">
        <div className="rtf-final-head">The Final · Jul 19 · New York New Jersey Stadium</div>
        <KoMatchCard
          home={m.home}
          away={m.away}
          picked={picked}
          nationCode={nationCode}
          ptsPerPick={RTF_KO_PTS.final}
          onPick={(code) => onPick(code)}
        />
      </div>

      {champ ? (
        <div className={"rtf-champion" + (champ.code === nationCode ? " mine" : "")}>
          <div className="rtfc-trophy" aria-hidden="true">🏆</div>
          <div className="rtfc-eyebrow">Your champion</div>
          <div className="rtfc-name">{champ.flag} {champ.name}</div>
          <div className="rtfc-blurb">
            +16 pts if they lift it.
            {champ.code === nationCode && <> Doubled for your home nation → <strong>+32 pts</strong>.</>}
            {" "}Locks in when you hit Confirm.
          </div>
        </div>
      ) : (
        <div className="rtf-champion empty">
          <div className="rtfc-trophy ghost" aria-hidden="true">🏆</div>
          <div className="rtfc-blurb">Tap your winner above to crown your champion.</div>
        </div>
      )}
    </div>
  );
}

window.Predict = Predict;
