// STAR XI '26 — main app shell + routing

const STEPS = [
  { id: "welcome", num: "01", label: "Pick" },
  { id: "dreamxi", num: "02", label: "Star XI" },
  { id: "predict", num: "03", label: "Road" },
  { id: "confirm", num: "04", label: "Confirm" },
  { id: "live",    num: "05", label: "Live" },
];

// Empty bracket scaffold — kept here so DEFAULT_STATE, hydrate, and the reset
// path all use the same shape. Predict.jsx has its own ensureBracket() helper
// that normalises partial loads back to this layout.
function emptyBracket() {
  return {
    groups: {},
    advances: { r32: {}, r16: {}, qf: {}, sf: {}, final: {} },
  };
}

const DEFAULT_STATE = {
  nation: null,
  bracket: emptyBracket(),
  picks: [],
  formation: "4-3-3",
  captain: null,
  captainPlus: false,
  captainByMd: {},
  swaps: [],
  teamName: "",
  submitted: false,
  submittedAt: null,
};

// Tournament kickoff — Group A opener, Mexico City, Jun 11 2026.
const KICKOFF = new Date("2026-06-11T16:00:00Z");

// ——— Helpers used by the redesigned summary screen ———
// Order picks into formation slots GK → DF → MF → FW so the numbered "Starting
// XI" list reads like a real team sheet (1 = keeper, 2..5 = defence, etc.).
function orderXi(picks, formation) {
  const byPos = { GK: [], DF: [], MF: [], FW: [] };
  (picks || []).forEach((id) => {
    const p = window.PLAYERS.find((x) => x.id === id);
    if (p) byPos[p.pos].push(p);
  });
  return [...byPos.GK, ...byPos.DF, ...byPos.MF, ...byPos.FW];
}

// Which matchday is "current" for the player's nation? Falls back to MD1 when
// no fixtures have been played yet (pre-launch); otherwise the next unfinished
// game's matchday. Also returns the opponent for that match.
function nationMatchdayStatus(code, statusById) {
  if (!code) return { matchday: 1, opponent: null, played: 0, total: 3 };
  const fxs = (window.FIXTURES || [])
    .filter((f) => f.home.code === code || f.away.code === code)
    .sort((a, b) => a.matchday - b.matchday);
  const played = fxs.filter(
    (f) => statusById && statusById[f.id] === "FINISHED"
  ).length;
  const next =
    fxs.find((f) => !statusById || statusById[f.id] !== "FINISHED") ||
    fxs[fxs.length - 1] ||
    null;
  const opponent = next
    ? next.home.code === code
      ? next.away
      : next.home
    : null;
  return {
    matchday: next ? next.matchday : 3,
    opponent,
    played,
    total: fxs.length || 3,
    nextFixture: next || null,
  };
}

// Abbreviate to "F. Lastname" style, matching the existing data convention.
// "James Rodriguez" → "J. Rodriguez"  "Giorgian De Arrascaeta" → "G. De Arrascaeta"
// Falls back to "F. L." only if "F. Lastname" is still over the hard limit.
function abbreviateName(name, limit = 13) {
  if (!name || name.length <= limit) return name;
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  // First pass: abbreviate first name to initial
  const short = parts[0][0] + ". " + parts.slice(1).join(" ");
  if (short.length <= limit) return short;
  // Second pass: also abbreviate last word
  const shorterParts = [parts[0][0] + "."].concat(parts.slice(1, -1)).concat(parts[parts.length - 1][0] + ".");
  return shorterParts.join(" ");
}

// ——— Hero share card ———
// The screen's centerpiece: a clean, screenshot-friendly Starting XI lineup
// card in the brand v2 language. Nation lockup, big "STARTING XI" headline,
// numbered list with a captain badge, and the player's character figure as the
// visual anchor — designed to read at a glance on social.
function XIShareCard({ state, nation, captain, matchday, opponent, formation, onShare, shareLoading, cardRef }) {
  const xi = useMemo(() => orderXi(state.picks || [], formation), [state.picks, formation]);
  const capId = state.captainPlus ? null : state.captain;
  const captainByMd = state.captainPlus ? (state.captainByMd || {}) : {};
  const slug = nation && window.FIG_SLUG ? window.FIG_SLUG[nation.code] : null;
  const gender = state.gender || "male";
  const tone = state.tone || 0;
  const figSrc =
    nation && window.figureSrc
      ? window.figureSrc(nation.code, gender, tone)
      : null;
  const figXform =
    slug && window.figureTransform
      ? window.figureTransform(slug + "_" + (gender === "female" ? "f" : "m"))
      : null;

  // The visible "squad number" we print is the formation slot index (1..11),
  // not a real shirt number — keeps the card readable for any nation without
  // sourcing real numbers from FIFA.
  const teamName = (state.teamName && state.teamName.trim()) || null;

  return (
    <section className="xishare" ref={cardRef} aria-label="Starting XI share card">
      <header className="xs-head">
        <div className="xs-mark" aria-hidden="true">
          <img src="brand/star-xi-white.png" alt="" />
        </div>
        <span className="xs-tournament-pill">World Cup 2026</span>
      </header>

      <div className="xs-titles">
        <div className="xs-eyebrow">
          {nation ? nation.name : "Your Star XI"}
        </div>
        <h1 className="xs-title">
          Starting <span className="xs-title-xi">XI</span>
        </h1>
        {teamName && <div className="xs-team-name">{teamName}</div>}
      </div>

      <div className="xs-body">
        <ol className="xs-lineup">
          {xi.length === 0 && (
            <li className="xs-empty">No Star XI picked. Add one to fill this card.</li>
          )}
          {xi.map((p, i) => {
            const isCap = capId === p.id;
            const mwBadges = [1, 2, 3].filter(mw => captainByMd[mw] === p.id);
            return (
              <li key={p.id} className={"xs-row" + (isCap || mwBadges.length ? " is-cap" : "")}>
                <span className="xs-num">{i + 1}</span>
                <span className="xs-name">{abbreviateName(p.name)}</span>
                {isCap && <span className="xs-cap" title="Captain">C</span>}
                {mwBadges.map(mw => (
                  <span key={mw} className="xs-cap" title={`Captain GW${mw}`}>GW{mw}</span>
                ))}
              </li>
            );
          })}
        </ol>

        <div className="xs-figure-wrap" aria-hidden="true">
          {figSrc && (
            <div className="xs-figure-scaler">
              <img className="xs-figure" src={figSrc} alt="" style={figXform || undefined} />
            </div>
          )}
        </div>
      </div>

      <footer className="xs-foot">
        <div className="xs-subs">
          <div className="xs-subs-label">Formation</div>
          <div className="xs-subs-list">{formation}</div>
        </div>
        {onShare && (
          <button className="xs-share-btn" onClick={onShare} disabled={shareLoading}>
            {shareLoading ? "Saving…" : "↗ Download XI"}
          </button>
        )}
      </footer>
    </section>
  );
}

// ——— Live Center ———
// Tournament status + your running total. Pre-launch this is a countdown card
// with a stat block showing what's at stake; once the group stage starts it
// flips to a live state with matches-played and the player's running points.
function LiveCenter({ state, nation, kickoffMs, now, liveResults, liveSim }) {
  const ms = Math.max(0, kickoffMs - now);
  const live = ms === 0;
  const days = Math.floor(ms / 86400000);
  const hrs = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  const secs = Math.floor((ms % 60000) / 1000);

  const totalMatches = (window.FIXTURES || []).length || 72;
  const played = liveResults ? liveResults.played || 0 : 0;
  const liveNow = liveResults ? liveResults.live || 0 : 0;

  // Prefer the fully-assembled live sim (results + derived bracket + player
  // events) passed down from the poller, so the player's own Star XI, knockout
  // and nation-bonus points match the leaderboard. Fall back to results-only.
  const sim = useMemo(
    () => liveSim || {
      results: (liveResults && liveResults.results) || {},
      bracket: null,
      playerEvents: null,
    },
    [liveSim, liveResults]
  );
  const tally = useMemo(() => window.tallyUser(state, sim), [state, sim]);

  return (
    <section className="live-center" aria-label="Live Center">
      <div className="lc-head">
        <h2 className="lc-title">
          {live ? <span className="lc-livedot" /> : null}
          Live Center
        </h2>
        <div className="lc-sub">
          {live
            ? "tournament in progress"
            : "scoring opens at kickoff · Jun 11, 2026"}
        </div>
      </div>

      <div className="lc-grid">
        <div className="lc-stat lc-stat-hero">
          <div className="lc-stat-l">Total points</div>
          <div className="lc-stat-n">{tally.total}</div>
          <div className="lc-stat-sub">
            {tally.xiPts} Star XI · {tally.predictionPts} Road
          </div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-l">Matches played</div>
          <div className="lc-stat-n">
            {played}
            <em>/{totalMatches}</em>
          </div>
          <div className="lc-stat-sub">
            {liveNow > 0 ? `${liveNow} live now` : "group stage"}
          </div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-l">Bullseyes</div>
          <div className="lc-stat-n">{tally.bullseyes}</div>
          <div className="lc-stat-sub">perfect groups + champion</div>
        </div>
        <div className="lc-stat">
          <div className="lc-stat-l">
            {nation ? `${nation.flag} 2× boost` : "Nation boost"}
          </div>
          <div className="lc-stat-n">{nation ? "ON" : "—"}</div>
          <div className="lc-stat-sub">
            {nation
              ? "doubles every Road point from your nation"
              : "pick a nation to enable"}
          </div>
        </div>
      </div>

      {!live ? (
        <div className="lc-countdown" aria-label="time to kickoff">
          <span className="lc-cd-lead">Kickoff in</span>
          <span className="lc-cd-unit">
            <b>{days}</b>d
          </span>
          <span className="lc-cd-unit">
            <b>{String(hrs).padStart(2, "0")}</b>h
          </span>
          <span className="lc-cd-unit">
            <b>{String(mins).padStart(2, "0")}</b>m
          </span>
          <span className="lc-cd-unit">
            <b>{String(secs).padStart(2, "0")}</b>s
          </span>
        </div>
      ) : (
        <div className="lc-countdown live">
          <span className="lc-cd-lead">● matchdays scoring now</span>
          <span className="lc-cd-tail">updates every 60s</span>
        </div>
      )}
    </section>
  );
}

// ——— Leagues preview ———
// A compact table showing where you sit in a chosen scope (global or one of
// your private mini-leagues). The full leaderboard screen is one tap away;
// this block is the "are my friends beating me" glance from home base.
function LeaguesPreview({ auth, onLeaderboard }) {
  const [leagues, setLeagues] = useState([]);
  const [scope, setScope] = useState({ kind: "global", code: null });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const reqIdRef = useRef(0);

  useEffect(() => {
    if (!auth.signedIn) {
      setLeagues([]);
      return;
    }
    if (!window.wcxiLeagues) return;
    window.wcxiLeagues().then((r) => {
      setLeagues((r && r.ok && r.leagues) || []);
    });
  }, [auth.signedIn]);

  useEffect(() => {
    if (!auth.signedIn || !window.wcxiLeaderboard) return;
    const myReq = ++reqIdRef.current;
    setLoading(true);
    window
      .wcxiLeaderboard(
        scope.kind === "league"
          ? { code: scope.code, limit: 6 }
          : { limit: 6 }
      )
      .then((r) => {
        if (myReq !== reqIdRef.current) return;
        setData(r);
        setLoading(false);
      });
  }, [auth.signedIn, scope]);

  if (!auth.loaded) return null;

  // Signed-out — invite to sign in. Doesn't block the rest of the home base;
  // the player can still browse their XI + countdown.
  if (!auth.signedIn) {
    return (
      <section className="leagues-card" aria-label="Leagues">
        <div className="leagues-head">
          <h2 className="leagues-title">Leagues</h2>
          <div className="leagues-sub">play your friends</div>
        </div>
        <div className="leagues-empty">
          <p>Sign in to track your rank against friends and start a mini-league.</p>
          <button
            className="btn gold sm"
            onClick={() => window.clerkOpenSignIn && window.clerkOpenSignIn()}
          >
            Sign in
          </button>
        </div>
      </section>
    );
  }

  const top = (data && data.top) || [];
  const you = data && data.you;
  const youInTop = !!(you && top.some((r) => r.isYou));
  const softUnconfigured = data && data.configured === false;

  return (
    <section className="leagues-card" aria-label="Leagues">
      <div className="leagues-head">
        <h2 className="leagues-title">Leagues</h2>
        <button className="leagues-jump" onClick={onLeaderboard}>
          Full table →
        </button>
      </div>

      <div className="leagues-scopes">
        <button
          className={"leagues-scope" + (scope.kind === "global" ? " sel" : "")}
          onClick={() => setScope({ kind: "global", code: null })}
        >
          🌍 Global
        </button>
        {leagues.map((l) => (
          <button
            key={l.code}
            className={
              "leagues-scope" +
              (scope.kind === "league" && scope.code === l.code ? " sel" : "")
            }
            onClick={() => setScope({ kind: "league", code: l.code })}
            title={`${l.memberCount} members`}
          >
            {l.name}
            <small>{l.memberCount}</small>
          </button>
        ))}
        <button
          className="leagues-scope add"
          onClick={onLeaderboard}
          title="Create or join a mini-league"
        >
          ＋ League
        </button>
      </div>

      {softUnconfigured ? (
        <div className="leagues-empty">
          <p>Leaderboards go live at kickoff. Your entry is already saved.</p>
        </div>
      ) : loading && !data ? (
        <div className="leagues-empty">Loading the table…</div>
      ) : top.length === 0 ? (
        <div className="leagues-empty">
          <p>No entries here yet. Be the first to lock one in.</p>
        </div>
      ) : (
        <div className="leagues-rows">
          {top.slice(0, 5).map((r) => (
            <div
              key={r.rank + ":" + r.name}
              className={"leagues-row" + (r.isYou ? " you" : "")}
            >
              <div className="lr-rank">{r.rank}</div>
              <div className="lr-nm">
                {r.isYou ? "You" : r.name}
                <small>
                  {r.predictionPts ? `+${r.predictionPts} Road` : "Star XI only"}
                  {r.bullseyes ? ` · ${r.bullseyes} perfect` : ""}
                </small>
              </div>
              <div className="lr-pts">{r.pts}</div>
            </div>
          ))}
          {you && !youInTop && (
            <>
              <div className="leagues-gap">⋯</div>
              <div className="leagues-row you">
                <div className="lr-rank">{you.rank}</div>
                <div className="lr-nm">
                  You
                  <small>
                    {you.predictionPts ? `+${you.predictionPts} Road` : "Star XI only"}
                  </small>
                </div>
                <div className="lr-pts">{you.pts}</div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ——— Live / locked screen ———
// After you submit, your entry is locked in. The screen is built around a
// shareable Starting XI card (the social-media keepsake), a Live Center with
// running scores + tournament status, and a Leagues preview pulling from the
// /api leaderboards. The expandable LockedBracket review sits below.
function TournamentLive({ state, onEditPicks, onLeaderboard, onHistory }) {
  const auth = useClerkAuth();
  const nation = state.nation ? window.NATIONS.find(n => n.code === state.nation) : null;
  const bracket = state.bracket || { groups: {}, advances: { r32:{}, r16:{}, qf:{}, sf:{}, final:{} } };
  const picks = state.picks || [];
  const formation = state.formation || "4-3-3";

  const GROUP_LETTERS = "ABCDEFGHIJKL".split("");
  const groupsDone = GROUP_LETTERS.filter(g => {
    const o = (bracket.groups || {})[g];
    return o && o.length === 4 && o.every(Boolean);
  }).length;
  const koPickCounts = ["r32", "r16", "qf", "sf", "final"].map(r => {
    const round = (bracket.advances || {})[r] || {};
    return Object.keys(round).filter(k => round[k]).length;
  });
  const koTotalMade = koPickCounts.reduce((a, c) => a + c, 0);
  const totalPicks = 48 + 16 + 8 + 4 + 2 + 1;
  const madePicks =
    GROUP_LETTERS.reduce((n, g) => n + ((bracket.groups[g] || []).filter(Boolean).length), 0)
    + koTotalMade;

  const champCode = ((bracket.advances || {}).final || {})[0] || null;
  const champion = champCode ? window.NATIONS.find(n => n.code === champCode) : null;

  const captain = state.captain ? window.PLAYERS.find(p => p.id === state.captain) : null;

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ——— Real live results ———
  // Poll the /api/results proxy every 60s; degrades to null when not configured
  // (local preview / pre-launch). Drives both the Live Center stat block and
  // the per-nation matchday/opponent shown on the share card.
  const [liveResults, setLiveResults] = useState(null);
  const [liveSim, setLiveSim] = useState(null);
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const [resultsPayload, statsPayload] = await Promise.all([
        window.fetchLiveResults(),
        window.fetchPlayerStats ? window.fetchPlayerStats() : Promise.resolve(null),
      ]);
      if (!alive) return;
      setLiveResults(resultsPayload ? window.buildLiveResults(resultsPayload) : null);
      setLiveSim(
        resultsPayload && window.assembleLiveSim
          ? window.assembleLiveSim(resultsPayload, statsPayload, {
              FIXTURES: window.FIXTURES, PLAYERS: window.PLAYERS, NATIONS: window.NATIONS,
            })
          : null
      );
    };
    pull();
    const t = setInterval(pull, 60000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const matchdayStatus = useMemo(
    () => nationMatchdayStatus(
      nation ? nation.code : null,
      liveResults ? liveResults.statusById : null
    ),
    [nation, liveResults]
  );

  const [shareLoading, setShareLoading] = useState(false);
  const [roadOpen, setRoadOpen] = useState(false);
  const cardRef = React.useRef(null);

  // Countdown to kickoff — for the "Edit entry" button label
  const msToKickoff = Math.max(0, KICKOFF.getTime() - now);
  const kdDays = Math.floor(msToKickoff / 86400000);
  const kdHrs  = Math.floor((msToKickoff % 86400000) / 3600000);
  const kdMins = Math.floor((msToKickoff % 3600000) / 60000);

  const doShare = async () => {
    const el = cardRef.current;
    if (!el || !window.html2canvas) return;
    setShareLoading(true);
    try {
      // Capture at 4× pixel density for crisp output at any zoom level
      const raw = await window.html2canvas(el, {
        scale: 4,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        logging: false,
        ignoreElements: (node) => node.classList && node.classList.contains("xs-share-btn"),
      });

      const teamSlug = (state.teamName && state.teamName.trim().replace(/\s+/g, "-").toLowerCase()) || "star-xi";
      const fileName = teamSlug + "-starting-xi.png";

      // Convert canvas to blob for both share and download paths
      const blob = await new Promise((res) => raw.toBlob(res, "image/png"));
      const file = new File([blob], fileName, { type: "image/png" });

      // iOS Safari: use Web Share API with files so user can save to Photos
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Star XI" });
      } else {
        // Desktop / Android: standard blob download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 100);
      }
    } catch (e) {
      console.warn("Share image failed:", e);
    } finally {
      setShareLoading(false);
    }
  };

  if (!state.submitted) {
    return (
      <div className="step-screen">
        <div className="step-scroll stagger" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="math-card" style={{ textAlign: "center", maxWidth: 560 }}>
            <div className="eyebrow">Not locked in yet</div>
            <h3>Submit your entry to go live.</h3>
            <p>Build your Star XI (predictions optional), then hit <strong>Submit</strong> on the Confirm step. Your live scores appear here once you're in.</p>
            <div className="cta-row" style={{ marginTop: 18, justifyContent: "center" }}>
              <button className="btn gold" onClick={onEditPicks}>Finish my picks <span>→</span></button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const live = now >= KICKOFF.getTime();

  return (
    <div className="step-screen">
      <div className="step-scroll stagger summary-screen">
        <div className="live-layout">
          {/* Left column: Live Center + Leagues + Road opener */}
          <div className="live-left">
            <LiveCenter
              state={state}
              nation={nation}
              kickoffMs={KICKOFF.getTime()}
              now={now}
              liveResults={liveResults}
              liveSim={liveSim}
            />
            <LeaguesPreview auth={auth} onLeaderboard={onLeaderboard} />
            {/* Road to the Final — opens as a full-screen modal */}
            <button className="road-opener" onClick={() => setRoadOpen(true)}>
              <span className="ro-chev">▸</span>
              <span className="ro-title">Your Road to the Final</span>
              <span className="ro-meta">{madePicks}/{totalPicks} picks · tap to review</span>
            </button>
          </div>
          {/* Right column: Starting XI share card */}
          <div className="live-right">
            <XIShareCard
              state={state}
              nation={nation}
              captain={captain}
              formation={formation}
              matchday={matchdayStatus.matchday}
              opponent={matchdayStatus.opponent}
              onShare={doShare}
              shareLoading={shareLoading}
              cardRef={cardRef}
            />
          </div>
        </div>
      </div>

      <div className="step-foot">
        <button
          className={"pill ghost sm" + (live ? " disabled-entry" : "")}
          onClick={!live ? onEditPicks : undefined}
          disabled={live}
          title={live ? "Locked — tournament is live" : "Edit your picks"}
        >
          ← Edit entry
          {!live && (
            <span className="entry-timer">
              {kdDays}d {String(kdHrs).padStart(2,"0")}h {String(kdMins).padStart(2,"0")}m
            </span>
          )}
        </button>
        <button
          className="pill ghost sm"
          onClick={onHistory}
          title="World Cup history & records"
        >📖 History</button>
      </div>

      {/* Road to the Final — full-screen modal, portalled to body to escape the
          `transform` on .step-screen which would otherwise confine position:fixed */}
      {roadOpen && ReactDOM.createPortal(
        <div className="road-modal-backdrop" onClick={() => setRoadOpen(false)}>
          <div className="road-modal" onClick={e => e.stopPropagation()}>
            <div className="road-modal-head">
              <span className="road-modal-title">Your Road to the Final</span>
              <span className="road-modal-meta">{madePicks}/{totalPicks} picks</span>
              <button className="road-modal-x" onClick={() => setRoadOpen(false)}>×</button>
            </div>
            <div className="road-modal-body">
              <LockedBracket
                bracket={bracket}
                nationCode={nation ? nation.code : null}
                live={live}
                champion={champion}
                groupsDone={groupsDone}
                madePicks={madePicks}
                totalPicks={totalPicks}
                initialOpen={true}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Your Road to the Final — expandable card on the left panel, full modal via road-opener.
// In modal mode (initialOpen=true) the toggle is hidden by CSS and content is always shown.
// Two tabs split Groups+Lucky8 from Knockouts so the modal never needs to scroll far.
function LockedBracket({ bracket, nationCode, live, champion, groupsDone, madePicks, totalPicks, initialOpen }) {
  const [open, setOpen] = useState(initialOpen || false);
  const [tab, setTab] = useState("groups");
  const GROUP_LETTERS = "ABCDEFGHIJKL".split("");
  const ROUND_LABELS = window.KO_ROUND_LABELS;
  const lucky = bracket.lucky3rds || [];
  const headTail = `${madePicks}/${totalPicks} picks · live scoring at knockouts`;

  return (
    <section className="locked-fixtures">
      <button
        className={"lf-toggle" + (open ? " open" : "")}
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="lf-chev">{open ? "▾" : "▸"}</span>
        <span className="lf-toggle-title">Your Road to the Final: groups + knockouts</span>
        <span className="lf-toggle-meta">{headTail}</span>
      </button>

      {open && (
        <div className="lf-body">
          {/* Tab switcher */}
          <div className="lf-tabs-bar">
            <button
              className={"lf-tab" + (tab === "groups" ? " sel" : "")}
              onClick={() => setTab("groups")}
            >
              Groups <span className="lf-tab-count">{groupsDone}/12</span>
            </button>
            <button
              className={"lf-tab" + (tab === "knockouts" ? " sel" : "")}
              onClick={() => setTab("knockouts")}
            >
              Knockouts
            </button>
          </div>

          {tab === "groups" && (
            <>
          <div className="lb-section">
            <div className="lb-section-head">Group ladders <span>{groupsDone}/12 set</span></div>
            <div className="lb-groups">
              {GROUP_LETTERS.map(g => {
                const o = (bracket.groups || {})[g] || [];
                const set = o.filter(Boolean).length === 4;
                const thirdCode = o[2];
                const thirdAdvances = thirdCode && lucky.includes(thirdCode);
                return (
                  <div key={g} className={"lb-group" + (set ? " done" : "")}>
                    <div className="lb-group-head">Group {g}</div>
                    <ol className="lb-group-list">
                      {[0,1,2,3].map(i => {
                        const code = o[i];
                        const team = code && window.NATIONS.find(n => n.code === code);
                        const mine = team && team.code === nationCode;
                        // The 3rd-placed slot wears an extra class when the
                        // player included this team in their Lucky 8.
                        const luckyHit = i === 2 && team && thirdAdvances;
                        return (
                          <li key={i} className={"lb-grp-row" + (i < 2 ? " thru" : "") + (i === 2 ? " wild" : "") + (luckyHit ? " lucky" : "") + (mine ? " mine" : "")}>
                            <span className="lb-pos">{i+1}</span>
                            {team ? (
                              <>
                                <span className="lb-flag">{team.flag}</span>
                                <span className="lb-nm">{team.name}</span>
                              </>
                            ) : (
                              <span className="lb-nm empty">—</span>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                );
              })}
            </div>
          </div>

          {lucky.length > 0 && (
            <div className="lb-section">
              <div className="lb-section-head">Your Lucky 8: 3rds advancing <span>{lucky.length}/8 picked</span></div>
              <div className="lb-lucky">
                {lucky.map(code => {
                  const team = window.NATIONS.find(n => n.code === code);
                  if (!team) return null;
                  const mine = team.code === nationCode;
                  return (
                    <span key={code} className={"lb-lucky-pill" + (mine ? " mine" : "")}>
                      <span className="lb-flag">{team.flag}</span>
                      <span className="lb-nm">{team.name}</span>
                      <span className="lb-rk">#{team.rank}</span>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
            </>
          )}

          {tab === "knockouts" && (
            <>
          <div className="lb-section">
            <div className="lb-section-head">Knockout picks</div>
            <div className="lb-rounds">
              {["r32","r16","qf","sf","final"].map((round, ri) => {
                const size = window.KO_ROUND_SIZES[round];
                const picks = (bracket.advances || {})[round] || {};
                const prevRound = ["r32","r16","qf","sf","final"][ri - 1];
                const prevPicks = prevRound ? ((bracket.advances || {})[prevRound] || {}) : null;
                // For rounds after r32, show H2H matchups derived from previous round's advancers
                const showH2H = prevPicks !== null;
                return (
                  <div key={round} className="lb-round">
                    <div className="lb-round-head">{ROUND_LABELS[round]}</div>
                    <div className="lb-round-list">
                      {showH2H ? (
                        // Show H2H matchups: prev round pairs → winner highlighted
                        Array.from({ length: size }).map((_, i) => {
                          const winnerCode = picks[i];
                          const winner = winnerCode && window.NATIONS.find(n => n.code === winnerCode);
                          const teamACode = prevPicks[i * 2];
                          const teamBCode = prevPicks[i * 2 + 1];
                          const teamA = teamACode && window.NATIONS.find(n => n.code === teamACode);
                          const teamB = teamBCode && window.NATIONS.find(n => n.code === teamBCode);
                          const hasMatchup = teamA || teamB;
                          return (
                            <div key={i} className={"lb-matchup" + (hasMatchup ? "" : " empty")}>
                              {hasMatchup ? (
                                <>
                                  <div className={"lb-matchup-team" + (winner && winner.code === teamACode ? " won" : "") + (teamA && teamA.code === nationCode ? " mine" : "")}>
                                    {teamA ? <><span className="lb-flag">{teamA.flag}</span><span className="lb-nm">{teamA.name}</span></> : <span className="lb-nm empty">—</span>}
                                  </div>
                                  <span className="lb-matchup-vs">vs</span>
                                  <div className={"lb-matchup-team" + (winner && winner.code === teamBCode ? " won" : "") + (teamB && teamB.code === nationCode ? " mine" : "")}>
                                    {teamB ? <><span className="lb-flag">{teamB.flag}</span><span className="lb-nm">{teamB.name}</span></> : <span className="lb-nm empty">—</span>}
                                  </div>
                                </>
                              ) : (
                                <span className="lb-nm empty">—</span>
                              )}
                            </div>
                          );
                        })
                      ) : (
                        // r32: flat list of advancing teams
                        Array.from({ length: size }).map((_, i) => {
                          const code = picks[i];
                          const team = code && window.NATIONS.find(n => n.code === code);
                          const mine = team && team.code === nationCode;
                          return (
                            <div key={i} className={"lb-pick" + (team ? " set" : " empty") + (mine ? " mine" : "")}>
                              {team ? (
                                <><span className="lb-flag">{team.flag}</span><span className="lb-nm">{team.name}</span></>
                              ) : (
                                <span className="lb-nm empty">—</span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {champion && (
            <div className={"lb-champion" + (champion.code === nationCode ? " mine" : "")}>
              <span className="lbc-trophy">🏆</span>
              <span>Your champion: <strong>{champion.flag} {champion.name}</strong></span>
              <span className="lbc-pts">+{champion.code === nationCode ? 32 : 16} if they lift it</span>
            </div>
          )}

          <p className="lf-foot">
            {live
              ? "Knockout scoring fires when the group stage finishes. Group placings settle, then each round you backed correctly pays out (R16 +1, QF +2, SF +4, Final +8, Champion +16). 2× on your nation."
              : "Live knockout scoring lands once the group stage ends and the draw is seeded. ★ = your nation. Every Road point you earn from them is doubled."}
          </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// MATCH-WATCH (temporary): enable via ?watch=1 in the URL (friendly NOR–SWE test).
function matchWatchEnabled() {
  try {
    return new URLSearchParams(window.location.search).has("watch");
  } catch (e) {
    return false;
  }
}

function App() {
  const initial = window.loadState();
  const watchOn = matchWatchEnabled();
  const [state, setState] = useState({ ...DEFAULT_STATE, ...(initial?.state || {}) });
  const RESTORABLE = ["welcome", "dreamxi", "predict", "confirm", "live"];
  const savedStep = RESTORABLE.includes(initial?.step) ? initial.step : "welcome";
  // A league invite deep link (starxi.io/join/CODE) lands straight on the
  // leaderboard so the invite + auto-join flow is the first thing they see.
  const pendingJoin = typeof window !== "undefined" && !!window.__STARXI_JOIN;
  const [step, setStep] = useState(
    pendingJoin ? "leaderboard" : watchOn ? "matchwatch" : savedStep
  );

  useEffect(() => {
    window.saveState({ state, step });
  }, [state, step]);

  const goTo = (id) => {
    setStep(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ——— Auth-gated lock-in ———
  // Players build their whole entry anonymously; we only require a Clerk
  // sign-in at the "Lock in" moment, then persist the entry server-side.
  const auth = useClerkAuth();
  const pendingSubmit = useRef(false);
  const doSubmit = () => {
    setState(s => {
      const next = { ...s, submitted: true, submittedAt: s.submittedAt || Date.now() };
      // displayName: prefer the squad name the player typed, fall back to Clerk identity.
      const displayName = (s.teamName && s.teamName.trim()) || auth.displayName || null;
      if (window.wcxiSaveEntry) {
        Promise.resolve().then(() => window.wcxiSaveEntry(next, displayName));
      }
      return next;
    });
    goTo("live");
  };
  const submit = () => {
    if (!auth.signedIn) {
      pendingSubmit.current = true;
      // Open sign-up: this is the registration moment. Clerk's modal
      // lets existing users switch to sign-in from within the same flow.
      window.clerkOpenSignUp ? window.clerkOpenSignUp() : window.clerkOpenSignIn();
      return;
    }
    doSubmit();
  };
  // Finish a deferred lock-in once the player completes the Clerk flow.
  // Also: if the user signs in and already has a locally-submitted entry,
  // navigate to live immediately (handles sign-out → sign-in on same device).
  useEffect(() => {
    if (!auth.signedIn) return;
    if (pendingSubmit.current) {
      pendingSubmit.current = false;
      doSubmit();
      return;
    }
    if (state.submitted) {
      goTo("live");
    }
  }, [auth.signedIn]);

  // ——— Sign-out redirect ———
  // When the user signs out, return them to the landing screen.
  const wasSignedIn = useRef(null);
  useEffect(() => {
    if (!auth.loaded) return;
    if (wasSignedIn.current === true && !auth.signedIn) {
      goTo("welcome");
    }
    wasSignedIn.current = auth.signedIn;
  }, [auth.loaded, auth.signedIn]);

  // ——— Cross-device hydrate ———
  // When a returning player signs in on a fresh device (no local draft yet),
  // pull their locked entry back from the server so it follows them everywhere.
  // We never clobber in-progress local work — only hydrate when local is empty.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (!auth.loaded || !auth.signedIn || hydratedRef.current) return;
    if (!window.wcxiLoadEntry) return;
    hydratedRef.current = true;
    window.wcxiLoadEntry().then((res) => {
      const e = res && res.entry;
      if (!e) return;
      // Don't clobber local work: only hydrate when there's no local draft and
      // nothing has been locked in locally yet.
      if (state.submitted) return;
      const localHasProgress = !!(
        state.nation ||
        (state.picks && state.picks.length) ||
        (state.bracket && state.bracket.groups && Object.keys(state.bracket.groups).length)
      );
      if (localHasProgress) return;
      setState({
        nation: e.nation != null ? e.nation : null,
        bracket: e.bracket || emptyBracket(),
        picks: e.picks || [],
        formation: e.formation || "4-3-3",
        captain: e.captain != null ? e.captain : null,
        captainPlus: !!e.captainPlus,
        captainByMd: e.captainByMd || {},
        swaps: e.swaps || [],
        submitted: true,
        submittedAt: e.submittedAt || Date.now(),
      });
      goTo("live");
    });
  }, [auth.loaded, auth.signedIn]);
  const reset = () => {
    if (!confirm("Start over? This wipes your nation, Road picks and Star XI.")) return;
    // Re-build a fresh state object (don't reuse DEFAULT_STATE — its nested
    // `bracket` would otherwise be shared across resets).
    setState({ ...DEFAULT_STATE, bracket: emptyBracket() });
    goTo("welcome");
  };

  const currentIdx = STEPS.findIndex(s => s.id === step);

  // The chosen nation's flat colour washes the whole app shell once a nation is
  // locked in — same palette as the welcome carousel, so the brand stays
  // consistent across steps. The giant ghost nickname only lives on the landing
  // carousel; inside the flow it would just add noise behind already-busy UI.
  const NATION_BG = window.NATION_BG || {};
  const themed = step !== "welcome" && !!state.nation;
  const nationColor = themed ? (NATION_BG[state.nation] || null) : null;
  const ghost = null;

  return (
    <div
      className={"app" + (themed ? " themed" : "")}
      style={nationColor ? { "--nation": nationColor } : undefined}
    >
      <MusicPlayer step={step} />
      {step === "welcome" ? (
        <Welcome
          state={state} setState={setState}
          onNext={() => goTo("dreamxi")}
          onHistory={() => goTo("history")}
        />
      ) : (
        <StepShell
          step={step} steps={STEPS} currentIdx={currentIdx}
          goTo={goTo} reset={reset} ghost={ghost}
          matchWatchEnabled={watchOn}
        >
          {step === "dreamxi" && (
            <DreamXI state={state} setState={setState}
              onNext={() => goTo("predict")}
              onSkip={() => goTo("confirm")}
              onBack={() => goTo("welcome")} />
          )}
          {step === "predict" && (
            <Predict state={state} setState={setState}
              onNext={() => goTo("confirm")} onBack={() => goTo("dreamxi")} />
          )}
          {step === "confirm" && (
            <Confirm state={state} setState={setState}
              onSubmit={submit} onBack={() => goTo("predict")}
              signedIn={auth.signedIn} />
          )}
          {step === "live" && (
            <TournamentLive state={state}
              onEditPicks={() => goTo("dreamxi")}
              onLeaderboard={() => goTo("leaderboard")}
              onHistory={() => goTo("history")} />
          )}
          {step === "leaderboard" && (
            <Leaderboard
              onEditPicks={() => goTo("dreamxi")}
              onBack={() => goTo(state.submitted ? "live" : "welcome")} />
          )}
          {step === "history" && (
            <History onBack={() => goTo(state.submitted ? "live" : "welcome")} />
          )}
          {watchOn && step === "matchwatch" && (
            <MatchWatch
              entryState={state}
              useEntryState={(state.picks || []).length >= 11}
              onBack={() => goTo(state.submitted ? "live" : "dreamxi")}
            />
          )}
        </StepShell>
      )}
    </div>
  );
}

// ——— Error boundary ———
// A single render error anywhere in the tree would otherwise white-screen the
// whole app. This catches it and shows a recoverable fallback instead. The
// entry is already saved in localStorage, so "Start over" never loses picks
// the user has committed — it just re-mounts the app from clean state.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // Surface to the console; a monitoring hook (e.g. Sentry) can attach here.
    console.error("STAR XI render error:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="app-error-screen">
          <div className="app-error-card">
            <img className="app-error-mark" src="brand/star-xi-white.png" alt="STAR XI" />
            <h1>Something went wrong</h1>
            <p>Your picks are saved. Reloading usually fixes it.</p>
            <div className="app-error-actions">
              <button className="pill primary" onClick={() => window.location.reload()}>
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary><App /></ErrorBoundary>
);
