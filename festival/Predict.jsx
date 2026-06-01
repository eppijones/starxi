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

const RTF_GROUP_LETTERS = "ABCDEFGHIJKL".split("");
const RTF_SUB_COUNT     = 18;     // 12 groups + Lucky 8 + R32 + R16 + QF + SF + Final
const RTF_LUCKY_SUB     = 12;
const RTF_KO_START      = 13;
const RTF_FINAL_SUB     = 17;
// Per-round points-per-correct-pick. Matches scoring-core.js.
const RTF_KO_PTS = { r32: 1, r16: 2, qf: 4, sf: 8, final: 16 };

// Normalise whatever the player has saved into a fully-shaped bracket. Used
// both as "load with defaults" and as "empty bracket" (pass null) so we don't
// need a separate emptyBracket helper inside this file.
function rtfEnsureBracket(b) {
  const out = {
    groups: {},
    lucky3rds: [],
    advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} },
  };
  if (!b) return out;
  out.groups = b.groups ? { ...b.groups } : {};
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

// Resume the player where they left off: first incomplete group, then the
// Lucky-8 step, then first incomplete knockout round, otherwise the champion.
function rtfFindStartSub(bracket) {
  for (let i = 0; i < 12; i++) {
    if (!rtfGroupDone(bracket, RTF_GROUP_LETTERS[i])) return i;
  }
  if (!rtfLuckyDone(bracket)) return RTF_LUCKY_SUB;
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
    if (!confirm("Clear all your group + knockout picks?")) return;
    setState((s) => ({ ...s, bracket: rtfEnsureBracket(null) }));
    setSub(0);
  };

  // ——— Navigation ———
  const groupsCompleted = useMemo(
    () => RTF_GROUP_LETTERS.filter((g) => rtfGroupDone(bracket, g)).length,
    [bracket]
  );
  const groupsAllDone = groupsCompleted === 12;
  const luckyDone = rtfLuckyDone(bracket);

  const goPrev = () => {
    if (sub === 0) { onBack(); return; }
    setSub((s) => s - 1);
  };
  const goNext = () => {
    if (sub === RTF_SUB_COUNT - 1) { onNext(); return; }
    if (sub === 11 && !groupsAllDone) return;
    if (sub === RTF_LUCKY_SUB && !luckyDone) return;
    setSub((s) => s + 1);
  };

  const nextLabel =
    sub < 11 ? "Next group →"
    : sub === 11 ? (groupsAllDone ? "Pick the Lucky 8 →" : `Finish ${12 - groupsCompleted} group${groupsCompleted === 11 ? "" : "s"} first`)
    : sub === RTF_LUCKY_SUB ? (luckyDone ? "On to R32 →" : `Pick ${8 - (bracket.lucky3rds || []).length} more 3rd${(bracket.lucky3rds || []).length === 7 ? "" : "s"}`)
    : sub === 13 ? "On to R16 →"
    : sub === 14 ? "On to Quarters →"
    : sub === 15 ? "On to Semis →"
    : sub === 16 ? "Pick a champion →"
    :              "Confirm →";

  const subTitle =
    sub < 12 ? `Group ${RTF_GROUP_LETTERS[sub]}`
    : sub === RTF_LUCKY_SUB ? "Best 3rd-Placed"
    : sub === 13 ? "Round of 32"
    : sub === 14 ? "Round of 16"
    : sub === 15 ? "Quarterfinals"
    : sub === 16 ? "Semifinals"
    :              "Final";

  const subCount = (() => {
    if (sub < 12) return `${sub + 1} of 12 groups`;
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

  const nextDisabled = (sub === 11 && !groupsAllDone) || (sub === RTF_LUCKY_SUB && !luckyDone);
  const nextTitle =
    sub === 11 && !groupsAllDone ? "Finish all 12 group ladders to unlock the Lucky 8"
    : sub === RTF_LUCKY_SUB && !luckyDone ? "Pick your 8 advancing 3rds to unlock the knockouts"
    : "";

  return (
    <div className="step-screen">
      <div className="step-scroll stagger">
        <div className="rtf-head">
          <div className="ph-titles">
            <h2 className="title">Road to the Final</h2>
            <p className="lede">
              Set the group order, pick which 3rds advance, then click your way through to your champion.
              {nationObj && (
                <> Every point earned from <strong>{nationObj.flag} {nationObj.name}</strong> is doubled.</>
              )}
            </p>
          </div>
          <div className="rtf-head-actions">
            <button className="btn ghost sm" onClick={() => onNext()}>Skip to confirm</button>
            {madePicks > 0 && <button className="btn ghost sm" onClick={clearAll}>Clear</button>}
          </div>
        </div>

        <RtfProgressStrip
          sub={sub}
          setSub={setSub}
          bracket={bracket}
          groupsAllDone={groupsAllDone}
          luckyDone={luckyDone}
        />

        <div className="rtf-body" key={sub}>
          <div className="rtf-subhead">
            <h3 className="rtf-subtitle">{subTitle}</h3>
            <span className="rtf-subcount">{subCount}</span>
          </div>

          {sub < 12 ? (
            <GroupBoard
              letter={RTF_GROUP_LETTERS[sub]}
              teams={window.GROUPS[RTF_GROUP_LETTERS[sub]]}
              ordering={bracket.groups[RTF_GROUP_LETTERS[sub]] || [null, null, null, null]}
              nationCode={nationCode}
              onSet={(o) => setGroup(RTF_GROUP_LETTERS[sub], o)}
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
      </div>

      <div className="step-foot">
        <button className="pill ghost sm" onClick={goPrev}>← Back</button>
        <div className="foot-meter" title={`${madePicks} of ${totalPicks} picks made`}>
          <div className="fm-bar"><div className="fm-fill" style={{ width: `${pct}%` }}></div></div>
          <div className="fm-count">{madePicks}<em>/{totalPicks}</em> picks</div>
        </div>
        <button
          className="pill primary"
          onClick={goNext}
          disabled={nextDisabled}
          title={nextTitle}
        >{nextLabel}</button>
      </div>
    </div>
  );
}

// ——— Progress strip: groups row + a Lucky-8 cell + knockout rounds ———
function RtfProgressStrip({ sub, setSub, bracket, groupsAllDone, luckyDone }) {
  const groupCells = RTF_GROUP_LETTERS.map((g, i) => {
    const done = rtfGroupDone(bracket, g);
    const active = sub === i;
    return (
      <button
        key={g}
        className={"rtf-dot grp" + (active ? " active" : "") + (done ? " done" : "")}
        title={`Group ${g}${done ? " (set)" : ""}`}
        onClick={() => setSub(i)}
      >{g}</button>
    );
  });
  const koCells = [
    { key: "lucky", subIdx: RTF_LUCKY_SUB,  label: "3rds", done: luckyDone, locked: !groupsAllDone },
    { key: "r32",   subIdx: RTF_KO_START,   label: "R32",  done: rtfRoundDone(bracket, "r32"),   locked: !groupsAllDone || !luckyDone },
    { key: "r16",   subIdx: RTF_KO_START+1, label: "R16",  done: rtfRoundDone(bracket, "r16"),   locked: !groupsAllDone || !luckyDone },
    { key: "qf",    subIdx: RTF_KO_START+2, label: "QF",   done: rtfRoundDone(bracket, "qf"),    locked: !groupsAllDone || !luckyDone },
    { key: "sf",    subIdx: RTF_KO_START+3, label: "SF",   done: rtfRoundDone(bracket, "sf"),    locked: !groupsAllDone || !luckyDone },
    { key: "final", subIdx: RTF_FINAL_SUB,  label: "🏆",   done: rtfRoundDone(bracket, "final"), locked: !groupsAllDone || !luckyDone },
  ];
  return (
    <div className="rtf-progress">
      <div className="rtf-progress-row">
        <span className="rtf-prog-label">Groups</span>
        <div className="rtf-prog-cells">{groupCells}</div>
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
                title={c.locked ? "Finish your group ladders first" : c.label}
              >{c.label}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ——— Group ladder ———
// Tap a pool team to seat it in the next empty slot. Tap a placed slot to
// clear it. Drag a placed slot onto another to swap (or onto an empty slot to
// move). When three teams are placed, the 4th is dropped in automatically so a
// single tap finishes the group and the player just hits Next.
function GroupBoard({ letter, teams, ordering, nationCode, onSet }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

  const assigned = new Set((ordering || []).filter(Boolean));
  const labels = ["1st", "2nd", "3rd", "4th"];
  const medals = ["🥇", "🥈", "🥉", "·"];

  const handlePool = (code) => {
    if (assigned.has(code)) return;
    const next = ordering.slice();
    const idx = next.findIndex((x) => !x);
    if (idx === -1) return;
    next[idx] = code;
    // Auto-seat the leftover team when only one remains in the pool — saves a
    // pointless tap on the final card.
    if (next.filter(Boolean).length === 3) {
      const leftover = teams.find((t) => !next.includes(t.code));
      const stillEmpty = next.findIndex((x) => !x);
      if (leftover && stillEmpty !== -1) next[stillEmpty] = leftover.code;
    }
    onSet(next);
  };

  const handleSlot = (i) => {
    if (!ordering[i]) return;
    const next = ordering.slice();
    next[i] = null;
    onSet(next);
  };

  const autoRank = () => {
    const sorted = teams.slice().sort((a, b) => a.rank - b.rank).map((t) => t.code);
    onSet(sorted);
  };

  // ——— Drag-drop reorder among the four slots ———
  const onDragStartSlot = (i, e) => {
    if (!ordering[i]) return;
    setDragFrom(i);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", String(i)); } catch (_) {}
  };
  const onDragOverSlot = (i, e) => {
    if (dragFrom === null || dragFrom === i) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== i) setDragOver(i);
  };
  const onDropSlot = (i, e) => {
    e.preventDefault();
    const from = dragFrom;
    setDragFrom(null);
    setDragOver(null);
    if (from === null || from === i) return;
    const next = ordering.slice();
    [next[from], next[i]] = [next[i], next[from]];
    onSet(next);
  };
  const onDragEndSlot = () => {
    setDragFrom(null);
    setDragOver(null);
  };

  const teamByCode = (code) => teams.find((t) => t.code === code) || null;

  return (
    <div className="rtf-group">
      <div className="rtf-podium">
        {labels.map((lab, i) => {
          const code = ordering[i];
          const team = code && teamByCode(code);
          const mine = team && team.code === nationCode;
          const qualifies = i < 2;        // top 2 always advance
          const wildcard = i === 2;       // 3rd-placed — Lucky 8 candidate
          const isDragging = dragFrom === i;
          const isDropTarget = dragOver === i;
          const pts = mine ? 2 : 1;

          return (
            <div
              key={i}
              role="button"
              tabIndex={team ? 0 : -1}
              className={
                "rtf-slot pos-" + (i + 1)
                + (team ? " filled" : " empty")
                + (mine ? " mine" : "")
                + (qualifies ? " qualifies" : "")
                + (wildcard ? " wildcard" : "")
                + (isDragging ? " dragging" : "")
                + (isDropTarget ? " drop-target" : "")
              }
              onClick={() => handleSlot(i)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleSlot(i); }
              }}
              draggable={!!team}
              onDragStart={(e) => onDragStartSlot(i, e)}
              onDragOver={(e) => onDragOverSlot(i, e)}
              onDrop={(e) => onDropSlot(i, e)}
              onDragEnd={onDragEndSlot}
              aria-label={`${lab} place${team ? ": " + team.name : " (empty)"}`}
            >
              <span className="rtf-pos">
                <span className="rtf-pos-medal">{medals[i]}</span>
                <span className="rtf-pos-lab">{lab}</span>
              </span>
              {team ? (
                <>
                  <span className="rtf-flag">{team.flag}</span>
                  <div className="rtf-team-meta">
                    <span className="rtf-name">{team.name}</span>
                    <span className="rtf-rank">FIFA #{team.rank}</span>
                  </div>
                  <span className="rtf-tag">
                    {qualifies ? "Through" : wildcard ? "Best-3rd?" : "Out"}
                  </span>
                  <span className={"rtf-slot-pts" + (mine ? " mine" : "")}>+{pts}</span>
                  <span className="rtf-x" aria-hidden="true">×</span>
                </>
              ) : (
                <>
                  <span className="rtf-empty-hint">tap a team below</span>
                  <span className="rtf-slot-pts ghost">+1</span>
                </>
              )}
            </div>
          );
        })}
      </div>

      <div className="rtf-pool-head">
        <span>Tap a team to seat it · drag a slot to reorder · tap a slot to clear</span>
        <button className="btn ghost sm" onClick={autoRank}>Auto-fill by FIFA rank</button>
      </div>
      <div className="rtf-pool">
        {teams.map((t) => {
          const used = assigned.has(t.code);
          const mine = t.code === nationCode;
          return (
            <button
              key={t.code}
              className={"rtf-pool-team" + (used ? " used" : "") + (mine ? " mine" : "")}
              onClick={() => handlePool(t.code)}
              disabled={used}
            >
              <span className="rtf-flag">{t.flag}</span>
              <div className="rtf-team-meta">
                <span className="rtf-name">{t.name}</span>
                <span className="rtf-rank">#{t.rank} · {t.star}</span>
              </div>
              {mine && <span className="rtf-boost" title="Your nation: every point this team earns is doubled">★ 2×</span>}
            </button>
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
            >
              <div className="rtf-third-head">
                <span className="rtf-third-grp">Group {group} · 3rd</span>
                {mine && <span className="rtf-boost sm">★ 2×</span>}
              </div>
              <div className="rtf-third-body">
                <span className="rtf-flag">{team.flag}</span>
                <div className="rtf-team-meta">
                  <span className="rtf-name">{team.name}</span>
                  <span className="rtf-rank">FIFA #{team.rank}</span>
                </div>
              </div>
              <div className={"rtf-third-tag" + (picked ? " yes" : full ? " no" : "")}>
                {picked ? "✓ Advances" : full ? "Locked out" : "Tap to advance"}
              </div>
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
          <span className="kom-name">{team.name}</span>
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
