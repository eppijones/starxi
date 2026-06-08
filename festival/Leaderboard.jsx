// WORLD CUP XI — leaderboard screen (global + private mini-leagues).
//
// Talks to the server-scored endpoints:
//   window.wcxiLeaderboard({ code?, limit?, mode?, stage? })  -> ranked table
//   window.wcxiLeagues()                                       -> the player's leagues
//   window.wcxiLeagueDetail(code)                              -> league + member roster
//   window.wcxiCreate/Join/Leave/Rename/RemoveMember/DeleteLeague/ToggleLeagueRtf
//
// Three ranking dimensions the player controls:
//   scope  — Global vs each private league (the chips)
//   stage  — Full tournament | Group stage | Knockouts (the late-join-friendly board)
//   mode   — Combined (Star XI + Road) | Star XI only
//
// Everything degrades gracefully: signed-out players get a sign-in nudge, and
// when storage isn't provisioned yet (local preview / pre-launch) we show a
// friendly "goes live at kickoff" panel instead of an error.

// Shareable deep link for a league. Parsed back on load by the app bootstrap.
function lbInviteUrl(code) {
  var origin = (typeof location !== "undefined" && location.origin) || "https://starxi.io";
  return origin + "/join/" + code;
}

async function lbCopy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
}

function LbRow({ row, mode, stage, tied, onSelect }) {
  const cls = "league-row" + (row.isYou ? " you" : "") + (onSelect ? " clickable" : "");
  // Resolve the Star XI / Road / nation split for the active stage so the
  // sub-line always reflects what the row is actually ranked on.
  let xi, road, nation;
  if (stage === "group") {
    xi = row.xiGroupPts || 0;
    road = (row.groupPts || 0) - xi;
    nation = 0;
  } else if (stage === "knockout") {
    nation = row.nationBonus || 0;
    xi = (row.xiKnockoutPts || 0) - nation; // player KO pts (nation bonus shown separately)
    road = (row.knockoutPts || 0) - (row.xiKnockoutPts || 0);
  } else {
    xi = row.xiPts || 0;
    road = row.predictionPts || 0;
    nation = 0;
  }
  const bits = [];
  if (mode === "combined") {
    if (xi > 0) bits.push(`${xi} XI`);
    if (road > 0) bits.push(`+${road} Road`);
    if (nation > 0) bits.push(`+${nation}🏴 nation`);
    if (row.bullseyes) bits.push(`${row.bullseyes}★`);
  } else {
    if (road > 0) bits.push(`+${road} Road bonus`);
    if (nation > 0) bits.push(`+${nation}🏴 nation`);
    if (row.bullseyes) bits.push(`${row.bullseyes} perfect`);
  }
  const sub = bits.join(" · ");
  const ultimate = mode === "combined" && stage === "all" && row.rank === 1 && row.xiPts > 0 && row.predictionPts > 0;
  return (
    <div
      className={cls}
      onClick={onSelect ? () => onSelect(row) : undefined}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      onKeyDown={onSelect ? (e) => { if (e.key === "Enter") onSelect(row); } : undefined}
    >
      <span className="rank">{row.rank}</span>
      <span className="nm">
        <span className="lb-team-name">{row.name}</span>
        {row.isYou && <span className="lb-you-badge" title="Your team">★ YOU</span>}
        {ultimate && (
          <span className="lb-crown" title="Ultimate champion: tops the table with a strong XI and Road picks">👑</span>
        )}
        {tied && <span className="lb-tie" title="Tied on points — broken by perfect calls (★), then who locked in first">=</span>}
        {sub && <small>{sub}</small>}
      </span>
      <span className="pts">{row.pts}</span>
      {onSelect && <span className="lb-row-caret" aria-hidden="true">›</span>}
    </div>
  );
}

// Light, no-snapshot-needed banter from the current table: who leads and by how
// much (the "biggest mover" idea needs round-over-round history, which we don't
// persist yet — so we lead with the live race instead).
function LbBanter({ data }) {
  const top = (data && data.top) || [];
  if (top.length < 1) return null;
  const leader = top[0];
  const second = top[1];
  let line;
  if (top.length === 1) {
    line = <>🏆 <strong>{leader.isYou ? "You" : leader.name}</strong> {leader.isYou ? "are" : "is"} out in front — invite a rival.</>;
  } else if (leader.pts === second.pts) {
    line = <>🔥 It's all square at the top — <strong>{leader.isYou ? "you" : leader.name}</strong> and <strong>{second.isYou ? "you" : second.name}</strong> tied on {leader.pts}.</>;
  } else {
    const gap = leader.pts - second.pts;
    line = <>🏆 <strong>{leader.isYou ? "You" : leader.name}</strong> lead{leader.isYou ? "" : "s"} by <strong>{gap}</strong> {gap === 1 ? "pt" : "pts"}.</>;
  }
  return <div className="lb-banter">{line}</div>;
}

const LB_STAGES = [
  { key: "all", label: "Full tournament" },
  { key: "group", label: "Group stage" },
  { key: "knockout", label: "Knockouts" },
];

function flagFor(code) {
  const n = code && window.NATIONS && window.NATIONS.find((x) => x.code === code);
  return n ? n.flag : "";
}
// Compact event string for one matchday cell: "⚽2 🅰1 🧤".
function evStr(m) {
  const bits = [];
  if (m.goals) bits.push("⚽" + (m.goals > 1 ? m.goals : ""));
  if (m.assists) bits.push("🅰" + (m.assists > 1 ? m.assists : ""));
  if (m.sheets) bits.push("🧤");
  return bits.join(" ");
}

// The leaderboard drill-down: one team's points itemised per player, per matchday
// (group + knockout), plus the Road-to-the-Final breakdown.
function TeamDetail({ token, code, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    window.wcxiTeam(token, code).then((r) => { if (alive) { setData(r); setLoading(false); } });
    return () => { alive = false; };
  }, [token, code]);

  const d = data;
  const roadGroupPts = d && d.predictionGroupPts || 0;
  const roadKoRounds = (d && d.road && d.road.rounds) || [];
  const perfectGroups = ((d && d.road && d.road.groups) || []).filter((g) => g.perfect).length;
  // The nation's character figure — same artwork as the Live Starting XI card.
  const figSrc = (d && d.nation && window.figureSrc) ? window.figureSrc(d.nation, "male", 0) : null;

  return (
    <div className="td-backdrop" onClick={onClose}>
      <div className="td-sheet" onClick={(e) => e.stopPropagation()}>
        <div className={"td-head" + (figSrc ? " has-figure" : "")}>
          {figSrc && <img className="td-figure" src={figSrc} alt="" aria-hidden="true" />}
          <button className="td-close" onClick={onClose} aria-label="Close">×</button>
          {loading || !d ? (
            <div className="td-title">Loading team…</div>
          ) : d.ok === false ? (
            <div className="td-title">Couldn't load this team.</div>
          ) : (
            <>
              <div className="td-eyebrow">{d.nation ? flagFor(d.nation) + " " + d.nation : "Star XI"}{d.lateEntry ? " · late entry" : ""}</div>
              <div className="td-title">
                {d.name}{d.isYou && <span className="lb-you-badge">★ YOU</span>}
              </div>
              <div className="td-total"><strong>{d.total}</strong> pts</div>
              <div className="td-splits">
                <span><b>{d.xiPts}</b> Star XI</span>
                <span><b>{d.predictionPts}</b> Road</span>
                {d.nationBonus > 0 && <span><b>{d.nationBonus}</b> 🏴 nation</span>}
                {d.bullseyes > 0 && <span><b>{d.bullseyes}</b> ★ perfect</span>}
              </div>
            </>
          )}
        </div>

        {d && d.ok !== false && !loading && (
          <div className="td-body">
            {d.played === 0 && (
              <div className="td-note">⚽ Scoring opens at kickoff — here's the team that's locked in.</div>
            )}
            {(d.orphanPicks || []).length > 0 && (
              <div className="td-note warn">⚠️ {d.orphanPicks.length} pick(s) left the squad pool and can't score.</div>
            )}

            <div className="td-section-label">⚽ Star XI — points by matchday</div>
            <div className="td-xi">
              {(d.xi || []).map((p) => {
                const scored = (p.byMd || []).filter((m) => m.pts !== 0 || m.goals || m.assists || m.sheets);
                return (
                  <div className={"td-player" + (p.total > 0 ? " has-pts" : "")} key={p.id}>
                    <span className="td-pos">{p.pos || "—"}</span>
                    <span className="td-pname">
                      {p.name || p.id}{p.nat ? " " + flagFor(p.nat) : ""}
                    </span>
                    <span className="td-pmds">
                      {scored.length === 0
                        ? <span className="td-md-zero">—</span>
                        : scored.map((m) => (
                            <span className={"td-md" + (m.isCap ? " cap" : "")} key={m.md} title={m.isCap ? "Captain ×2" : ""}>
                              <b>{m.label}</b> {evStr(m)} <em>{m.pts > 0 ? "+" + m.pts : m.pts}</em>{m.isCap ? " ©" : ""}
                            </span>
                          ))}
                    </span>
                    <span className="td-ptotal">{p.total}</span>
                  </div>
                );
              })}
            </div>

            <div className="td-section-label">🗺️ Road to the Final</div>
            <div className="td-road">
              <div className="td-road-row"><span>Group tables</span><span>{roadGroupPts} pts{perfectGroups ? ` · ${perfectGroups}★ perfect` : ""}</span></div>
              {["r32", "r16", "qf", "sf", "final"].map((rk) => {
                const r = roadKoRounds.find((x) => x.round === rk);
                const lbl = { r32: "Round of 32", r16: "Round of 16", qf: "Quarter-finals", sf: "Semi-finals", final: "Final / Champion" }[rk];
                return (
                  <div className="td-road-row" key={rk}>
                    <span>{lbl}</span>
                    <span>{r ? `${r.hits}/${r.total} · ${r.points} pts` : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LbTable({ data, loading, onRefresh, mode, onModeChange, stage, onStageChange, leagueRtfEnabled, onSelectTeam }) {
  if (loading && !data) {
    return <div className="empty-state">Loading the table…</div>;
  }
  if (!data) {
    return <div className="empty-state">Couldn't load the table. Try again.</div>;
  }
  if (data.configured === false) {
    return (
      <div className="lb-soft">
        <div className="lb-soft-emoji">🏆</div>
        <h3>Leaderboards go live at kickoff</h3>
        <p>
          Once the tournament server is switched on, you'll see the global table
          and your private mini-leagues here, scored automatically from real
          results. Your entry is already saved.
        </p>
      </div>
    );
  }
  if (data.ok === false) {
    return (
      <div className="lb-soft">
        <div className="lb-soft-emoji">📡</div>
        <h3>Table unavailable right now</h3>
        <p>The leaderboard couldn't be reached. It'll be back shortly.</p>
        <button className="btn ghost sm" onClick={onRefresh}>↻ Retry</button>
      </div>
    );
  }

  const top = data.top || [];
  const you = data.you || null;
  const youInTop = !!(you && top.some((r) => r.isYou));
  const played = data.played || 0;
  const activeMode = data.mode || mode;
  const activeStage = data.stage || stage;
  const rtfLocked = leagueRtfEnabled === false;

  return (
    <div className="lb-table-wrap">
      <div className="lb-meta">
        <span>
          <strong>{data.total}</strong> {data.total === 1 ? "player" : "players"}
        </span>
        <span className="lb-dot">·</span>
        <span>
          {played > 0
            ? <><strong>{played}</strong> matches played</>
            : "no matches played yet"}
        </span>
        <button className="lb-refresh" onClick={onRefresh} title="Refresh">↻</button>
      </div>

      {/* Stage switcher — full tournament / group / knockouts */}
      <div className="lb-stage-tabs">
        {LB_STAGES.map((s) => (
          <button
            key={s.key}
            className={"lb-stage-tab" + (activeStage === s.key ? " sel" : "")}
            onClick={() => onStageChange(s.key)}
          >{s.label}</button>
        ))}
      </div>

      {activeStage === "knockout" && (
        <div className="lb-stage-note">
          🏟️ Scores from the Round of 32 onward — so anyone who joined mid-tournament competes here on a level field.
        </div>
      )}

      {/* Nudge: you have no Road-to-Final picks but others might */}
      {you && you.predictionPts === 0 && activeMode !== "xionly" && !rtfLocked && (
        <div className="lb-rtf-nudge">
          <span className="lb-rtf-nudge-icon">🗺️</span>
          <span>Fill in your <strong>Road to the Final</strong> picks to score bonus points and compete fully.</span>
        </div>
      )}

      {top.length === 0 ? (
        <div className="empty-state">
          No entries here yet. Be the first to lock one in.
        </div>
      ) : (
        <div className="lb-rows">
          {top.map((r, i) => (
            <LbRow
              key={r.rank + ":" + r.name}
              row={r}
              mode={activeMode}
              stage={activeStage}
              tied={i > 0 && top[i - 1].pts === r.pts}
              onSelect={onSelectTeam}
            />
          ))}
          {/* Pin the player's own row when they're outside the visible top N. */}
          {you && !youInTop && (
            <>
              <div className="lb-gap">⋯</div>
              <LbRow row={you} mode={activeMode} stage={activeStage} onSelect={onSelectTeam} />
            </>
          )}
        </div>
      )}

      {top.length > 0 && (
        <p className="lb-tap-hint">Tap any team to see its points, player by player.</p>
      )}

      <p className="lb-legend">
        Total = your <strong>Star XI</strong> + <strong>Road to the Final</strong> bonuses.
        {" "}<span className="lb-legend-tie">Ties break on perfect calls (★), then who locked in first.</span>
      </p>
    </div>
  );
}

// One league's card in the manage view: invite tools + roster + (owner) admin.
function LbLeagueCard({ league, onChanged, onLeft }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(league.name);

  const owner = !!league.owner;

  const loadDetail = useCallback(async () => {
    setLoading(true);
    const r = await window.wcxiLeagueDetail(league.code);
    setLoading(false);
    if (r && r.ok && r.league) setDetail(r.league);
  }, [league.code]);

  useEffect(() => { if (open && !detail) loadDetail(); }, [open, detail, loadDetail]);

  const copy = async (key, text) => {
    if (await lbCopy(text)) { setCopied(key); setTimeout(() => setCopied(null), 1600); }
  };
  const rename = async () => {
    const nm = newName.trim();
    if (!nm || nm === league.name) { setRenaming(false); return; }
    setBusy(true);
    const r = await window.wcxiRenameLeague(league.code, nm);
    setBusy(false);
    setRenaming(false);
    if (r && r.ok) onChanged && onChanged();
  };
  const removeMember = async (token, name) => {
    if (!confirm(`Remove ${name} from ${league.name}?`)) return;
    setBusy(true);
    const r = await window.wcxiRemoveMember(league.code, token);
    setBusy(false);
    if (r && r.ok) { await loadDetail(); onChanged && onChanged(); }
  };
  const toggleRtf = async () => {
    setBusy(true);
    const r = await window.wcxiToggleLeagueRtf(league.code);
    setBusy(false);
    if (r && r.ok) onChanged && onChanged();
  };
  const del = async () => {
    if (!confirm(`Delete "${league.name}" for everyone? This can't be undone.`)) return;
    setBusy(true);
    const r = await window.wcxiDeleteLeague(league.code);
    setBusy(false);
    if (r && r.ok) onChanged && onChanged();
  };
  const leave = async () => {
    if (!confirm(`Leave "${league.name}"?`)) return;
    setBusy(true);
    const r = await window.wcxiLeaveLeague(league.code);
    setBusy(false);
    if (r && r.ok) onLeft && onLeft(league.code);
  };

  const members = (detail && detail.members) || [];
  const solo = league.memberCount <= 1;

  return (
    <div className={"lb-lg-card" + (open ? " open" : "")}>
      <div className="lb-lg-top" onClick={() => setOpen((v) => !v)}>
        <div className="lb-lg-id">
          <span className="lb-lg-name">{league.name}</span>
          <small>
            {league.memberCount} {league.memberCount === 1 ? "member" : "members"}
            {owner ? " · you own this" : ""}
            {league.roadToFinalEnabled === false ? " · Star XI only" : ""}
          </small>
        </div>
        <button
          className={"lb-code" + (copied === "code" ? " ok" : "")}
          onClick={(e) => { e.stopPropagation(); copy("code", league.code); }}
          title="Copy join code"
        >{copied === "code" ? "✓ copied" : league.code}</button>
        <span className="lb-lg-caret">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="lb-lg-body">
          {/* Invite tools */}
          <div className="lb-invite">
            <button
              className={"btn ghost sm" + (copied === "link" ? " ok" : "")}
              disabled={busy}
              onClick={() => copy("link", lbInviteUrl(league.code))}
            >{copied === "link" ? "✓ Link copied" : "🔗 Copy invite link"}</button>
            <button
              className={"btn ghost sm" + (copied === "code2" ? " ok" : "")}
              disabled={busy}
              onClick={() => copy("code2", league.code)}
            >{copied === "code2" ? "✓ Code copied" : "📋 Copy code"}</button>
          </div>

          {solo && (
            <div className="lb-invite-cta">
              🎉 It's just you so far — share the link above and the league comes alive.
            </div>
          )}

          {/* Roster */}
          <div className="lb-roster">
            <div className="eyebrow">Members</div>
            {loading && !detail ? (
              <div className="lb-roster-loading">Loading members…</div>
            ) : (
              members.map((m) => (
                <div className="lb-roster-row" key={m.token}>
                  <span className="lb-roster-name">
                    {m.you ? "You" : m.name}
                    {m.owner && <span className="lb-owner-badge" title="League owner">👑</span>}
                  </span>
                  {owner && !m.you && (
                    <button
                      className="lb-kick"
                      disabled={busy}
                      onClick={() => removeMember(m.token, m.name)}
                      title={`Remove ${m.name}`}
                    >Remove</button>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Owner admin */}
          {owner ? (
            <div className="lb-admin">
              {renaming ? (
                <div className="lb-admin-rename">
                  <input
                    className="lb-input sm"
                    value={newName}
                    maxLength={40}
                    autoFocus
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") rename(); if (e.key === "Escape") setRenaming(false); }}
                  />
                  <button className="btn gold sm" disabled={busy} onClick={rename}>Save</button>
                  <button className="btn ghost sm" disabled={busy} onClick={() => { setRenaming(false); setNewName(league.name); }}>Cancel</button>
                </div>
              ) : (
                <div className="lb-admin-row">
                  <button className="btn ghost sm" disabled={busy} onClick={() => { setNewName(league.name); setRenaming(true); }}>✎ Rename</button>
                  <button
                    className={"lb-rtf-toggle" + (league.roadToFinalEnabled !== false ? " on" : " off")}
                    disabled={busy}
                    onClick={toggleRtf}
                    title={league.roadToFinalEnabled !== false ? "Road-to-the-Final scoring ON" : "Road-to-the-Final scoring OFF"}
                  >{league.roadToFinalEnabled !== false ? "🗺️ Road on" : "🗺️ Road off"}</button>
                  <span className="grow" />
                  <button className="lb-danger" disabled={busy} onClick={del}>Delete league</button>
                </div>
              )}
            </div>
          ) : (
            <div className="lb-admin-row">
              <span className="grow" />
              <button className="lb-leave" disabled={busy} onClick={leave}>Leave league</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LbManage({ leagues, onChanged, onCreated, onJoined, onLeft, onClose }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(null);
  const [newCode, setNewCode] = useState(null); // freshly-created league

  const create = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    const r = await window.wcxiCreateLeague(name.trim() || "My League");
    setBusy(false);
    if (r && r.ok) { setName(""); setNewCode(r.code); onCreated && onCreated(r.code); }
    // Leagues are account-only: a guest is nudged to sign up (which auto-claims
    // their team), then they can come back and create.
    else if (r && (r.needsAccount || r.error === "needs_account")) {
      setMsg("Sign up to start a league — your team comes with you.");
      window.clerkOpenSignUp && window.clerkOpenSignUp();
    }
    else setMsg("Couldn't create the league. Try again.");
  };
  const join = async () => {
    if (busy) return;
    const c = code.trim();
    if (!c) return;
    setBusy(true); setMsg(null);
    const r = await window.wcxiJoinLeague(c);
    setBusy(false);
    if (r && r.ok) { setCode(""); onJoined && onJoined(r.code); }
    else if (r && r.error === "no_such_league") setMsg("No league with that code.");
    else setMsg("Couldn't join. Check the code and try again.");
  };
  const copy = async (key, text) => {
    if (await lbCopy(text)) { setCopied(key); setTimeout(() => setCopied(null), 1600); }
  };

  return (
    <div className="lb-manage">
      <div className="lb-manage-grid">
        <div className="lb-form card flat">
          <div className="eyebrow">Start a league</div>
          <p className="lb-form-note">Create a private table and share the link with friends.</p>
          <input
            className="lb-input"
            placeholder="League name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button className="btn gold sm" disabled={busy} onClick={create}>Create league</button>

          {newCode && (
            <div className="lb-new-code-reveal">
              <div className="lb-new-code-label">League created! Share to invite friends:</div>
              <button
                className={"lb-new-code-btn" + (copied === "nl" ? " copied" : "")}
                onClick={() => copy("nl", lbInviteUrl(newCode))}
                title="Copy invite link"
              >
                <span className="lb-new-code-val">{newCode}</span>
                <span className="lb-new-code-copy">{copied === "nl" ? "✓ link copied" : "🔗 copy link"}</span>
              </button>
              <div className="lb-new-code-hint">Anyone with the link drops straight into your league.</div>
            </div>
          )}
        </div>

        <div className="lb-form card flat">
          <div className="eyebrow">Join a league</div>
          <p className="lb-form-note">Got a code or link from a friend? Drop it in.</p>
          <input
            className="lb-input mono"
            placeholder="e.g. 7KQ4P"
            value={code}
            maxLength={8}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && join()}
          />
          <button className="btn ghost sm" disabled={busy} onClick={join}>Join league</button>
        </div>
      </div>

      {msg && <div className="lb-msg">{msg}</div>}

      {leagues.length > 0 && (
        <div className="lb-mylist">
          <div className="eyebrow" style={{ marginBottom: 8 }}>Your leagues</div>
          {leagues.map((l) => (
            <LbLeagueCard key={l.code} league={l} onChanged={onChanged} onLeft={onLeft} />
          ))}
        </div>
      )}

      <div className="lb-manage-foot">
        <button className="btn ghost sm" onClick={onClose}>← Back to table</button>
      </div>
    </div>
  );
}

function Leaderboard({ onEditPicks, onBack, embedded }) {
  const auth = useClerkAuth();
  const [scope, setScope] = useState({ kind: "global", code: null }); // or {kind:"league",code} | {kind:"manage"}
  const [lbMode, setLbMode] = useState("combined"); // "combined" | "xionly"
  const [lbStage, setLbStage] = useState("all");     // "all" | "group" | "knockout"
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [leagues, setLeagues] = useState([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState(null); // { token } for the drill-down
  const reqIdRef = useRef(0);
  const joinHandledRef = useRef(false);

  const copyCode = async (c) => {
    if (await lbCopy(lbInviteUrl(c))) { setCodeCopied(true); setTimeout(() => setCodeCopied(false), 1800); }
  };

  const refreshLeagues = useCallback(async () => {
    if (!auth.signedIn) { setLeagues([]); return; }
    const r = await window.wcxiLeagues();
    setLeagues((r && r.ok && r.leagues) || []);
  }, [auth.signedIn]);

  useEffect(() => { refreshLeagues(); }, [refreshLeagues]);

  // Deep-link join: starxi.io/join/CODE (or ?join=CODE) stashes a code on the
  // window; once signed in, auto-join it and jump to that league's table.
  useEffect(() => {
    if (!auth.signedIn || joinHandledRef.current) return;
    const pending = window.__STARXI_JOIN;
    if (!pending) return;
    joinHandledRef.current = true;
    window.__STARXI_JOIN = null;
    (async () => {
      const r = await window.wcxiJoinLeague(pending);
      await refreshLeagues();
      if (r && r.ok) setScope({ kind: "league", code: r.code });
    })();
  }, [auth.signedIn, refreshLeagues]);

  // The global table is public; only league scopes need a signed-in caller.
  const loadTable = useCallback(async () => {
    if (scope.kind === "manage") return;
    if (scope.kind === "league" && !auth.signedIn) return;
    const myReq = ++reqIdRef.current;
    setLoading(true);
    const opts = scope.kind === "league"
      ? { code: scope.code, limit: 100, mode: lbMode, stage: lbStage }
      : { limit: 100, mode: lbMode, stage: lbStage };
    const r = await window.wcxiLeaderboard(opts);
    if (myReq !== reqIdRef.current) return; // a newer request superseded this one
    setData(r);
    setLoading(false);
  }, [auth.signedIn, scope, lbMode, lbStage]);

  useEffect(() => { loadTable(); }, [loadTable]);

  // Signing out while inside a league/manage scope falls back to the public global table.
  useEffect(() => {
    if (!auth.signedIn && scope.kind !== "global") setScope({ kind: "global", code: null });
  }, [auth.signedIn, scope.kind]);

  if (!auth.loaded) {
    const body = <div className="empty-state" style={{ padding: 24, textAlign: "center" }}>…</div>;
    if (embedded) return <div className="lb-embed">{body}</div>;
    return (
      <div className="step-screen">
        <div className="step-scroll" style={{ display: "grid", placeItems: "center" }}>
          {body}
        </div>
      </div>
    );
  }

  const goManage = () => setScope({ kind: "manage", code: null });
  const afterLeagueChange = async (code, switchTo) => {
    await refreshLeagues();
    if (switchTo && code) setScope({ kind: "league", code });
  };
  const afterManageChange = async () => {
    await refreshLeagues();
    setData(null); // force the table to recompute (rename / RTF / membership)
  };
  const afterLeft = async (code) => {
    await refreshLeagues();
    setScope({ kind: "global", code: null });
  };

  const activeLeague = scope.kind === "league" ? leagues.find((l) => l.code === scope.code) : null;

  const screen = (
        <div className="lb-screen">
          <div className="lb-head">
            <h2 className="lb-title">
              {scope.kind === "manage"
                ? "Mini-leagues"
                : scope.kind === "league" && data && data.name
                  ? data.name
                  : "Global table"}
            </h2>
            {scope.kind === "league" && scope.code && (
              <button
                className={"lb-code-chip" + (codeCopied ? " copied" : "")}
                onClick={() => copyCode(scope.code)}
                title="Copy invite link"
              >
                <span className="lb-code-chip-label">{codeCopied ? "Link copied" : "Invite link"}</span>
                <span className="lb-code-chip-val">{scope.code}</span>
                <span className="lb-code-chip-icon">{codeCopied ? "✓" : "🔗"}</span>
              </button>
            )}
          </div>

          <div className="lb-scopes">
            <button
              className={"lb-scope" + (scope.kind === "global" ? " sel" : "")}
              onClick={() => setScope({ kind: "global", code: null })}
            >🌍 Global</button>
            {auth.signedIn ? (
              <>
                {leagues.map((l) => (
                  <button
                    key={l.code}
                    className={"lb-scope" + (scope.kind === "league" && scope.code === l.code ? " sel" : "")}
                    onClick={() => setScope({ kind: "league", code: l.code })}
                    title={`${l.memberCount} members`}
                  >
                    {l.name}<small>{l.memberCount}</small>
                  </button>
                ))}
                <button
                  className={"lb-scope add" + (scope.kind === "manage" ? " sel" : "")}
                  onClick={goManage}
                >＋ League</button>
              </>
            ) : (
              <button className="lb-scope add" onClick={() => window.clerkOpenSignIn()}>
                🔐 Your leagues
              </button>
            )}
          </div>

          {/* Signed-out: the global table is public; nudge them to claim a rank. */}
          {!auth.signedIn && (
            <div className="lb-signin-cta">
              {window.__STARXI_JOIN ? (
                <>👋 You've been invited to a league — <button className="lb-link" onClick={() => window.clerkOpenSignIn()}>sign in</button> to join and play.</>
              ) : (
                <>👀 This is the public global table. <button className="lb-link" onClick={() => window.clerkOpenSignIn()}>Sign in</button> to find your own rank and start private leagues with friends.</>
              )}
            </div>
          )}

          {scope.kind === "manage" ? (
            <LbManage
              leagues={leagues}
              onChanged={afterManageChange}
              onCreated={(code) => afterLeagueChange(code, true)}
              onJoined={(code) => afterLeagueChange(code, true)}
              onLeft={afterLeft}
              onClose={() => setScope({ kind: "global", code: null })}
            />
          ) : (
            <LbTable
              data={data}
              loading={loading}
              onRefresh={loadTable}
              mode={lbMode}
              onModeChange={(m) => setLbMode(m)}
              stage={lbStage}
              onStageChange={(s) => setLbStage(s)}
              leagueRtfEnabled={activeLeague ? activeLeague.roadToFinalEnabled : true}
              onSelectTeam={(row) => row && row.token && setSelectedTeam({ token: row.token })}
            />
          )}
        </div>
  );

  const teamModal = selectedTeam ? (
    <TeamDetail
      token={selectedTeam.token}
      code={scope.kind === "league" ? scope.code : null}
      onClose={() => setSelectedTeam(null)}
    />
  ) : null;

  // Embedded (inside the Live screen's leagues slot): just the panel + modal,
  // no step-screen chrome or footer. Otherwise the full leaderboard page.
  if (embedded) return <div className="lb-embed">{screen}{teamModal}</div>;

  return (
    <div className="step-screen">
      <div className="step-scroll stagger">{screen}</div>
      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>← Back to my entry</button>
        <span className="grow"></span>
        <button className="pill ghost sm" onClick={onEditPicks}>Edit my entry</button>
      </div>
      {teamModal}
    </div>
  );
}

window.Leaderboard = Leaderboard;
