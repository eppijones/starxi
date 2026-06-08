// STAR XI — Fixtures: every World Cup fixture with kickoff time + live/final
// score, straight from /api/results (football-data). Group stage by matchday,
// then the knockout rounds. Refreshable daily through the tournament.
//
// Times render in the VIEWER'S local timezone (via toLocaleTimeString), with the
// zone spelled out once up top + a per-game countdown so nobody has to do the
// timezone math in their head.

// tla -> flag, from our NATIONS (football-data uses URY for our URU).
function mcFlag(tla) {
  if (!window.__MC_FLAG) {
    const f = {};
    (window.NATIONS || []).forEach((n) => { f[n.code] = n.flag; });
    if (f.URU) f.URY = f.URU;
    window.__MC_FLAG = f;
  }
  return (tla && window.__MC_FLAG[tla]) || "";
}
function mcTeam(t) {
  if (!t || !t.tla) return { flag: "", name: "TBD", tbd: true };
  return { flag: mcFlag(t.tla), name: t.name || t.tla, tbd: false };
}
const MC_DAY = { weekday: "short", month: "short", day: "numeric" };
const MC_TIME = { hour: "numeric", minute: "2-digit" };
function mcDateKey(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return ""; } }
function mcIsToday(iso) {
  try { return mcDateKey(iso) === new Date().toISOString().slice(0, 10); } catch (e) { return false; }
}

// The viewer's local timezone abbreviation ("CEST", "GMT+2", "EDT"…), resolved
// once. Tells people, unambiguously, what zone the kickoff times are shown in.
let _mcTz;
function mcTz() {
  if (_mcTz !== undefined) return _mcTz;
  try {
    const parts = new Intl.DateTimeFormat([], { hour: "numeric", timeZoneName: "short" }).formatToParts(new Date());
    const p = parts.find((x) => x.type === "timeZoneName");
    _mcTz = (p && p.value) || "";
  } catch (e) { _mcTz = ""; }
  return _mcTz;
}

// "in 3d 4h" / "in 5h 20m" / "in 45m" until kickoff, or null once it's started.
function mcCountdown(iso, now) {
  let t; try { t = new Date(iso).getTime(); } catch (e) { return null; }
  if (!t || isNaN(t)) return null;
  const diff = t - now;
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const mm = mins % 60;
  if (d > 0) return "in " + d + "d " + h + "h";
  if (h > 0) return "in " + h + "h " + mm + "m";
  if (mm > 0) return "in " + mm + "m";
  return "kickoff";
}

const MC_KO_ORDER = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
const MC_KO_LABEL = {
  LAST_32: "Round of 32", LAST_16: "Round of 16", QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals", THIRD_PLACE: "Third-place play-off", FINAL: "Final",
};
const MC_LIVE = { IN_PLAY: true, PAUSED: true };

function McMatch({ m, now }) {
  const home = mcTeam(m.home), away = mcTeam(m.away);
  const live = MC_LIVE[m.status];
  const done = m.status === "FINISHED";
  const hasScore = m.score && m.score.home != null && m.score.away != null;
  let when = "";
  try { when = new Date(m.utcDate).toLocaleTimeString([], MC_TIME); } catch (e) { when = ""; }
  const cd = (!live && !done) ? mcCountdown(m.utcDate, now) : null;
  return (
    <div className={"mc-match" + (live ? " live" : "") + (mcIsToday(m.utcDate) ? " today" : "")}>
      <div className="mc-status">
        <span className="mc-time">{live ? <><span className="mc-livedot" />LIVE</> : done ? "FT" : when}</span>
        {cd && <span className="mc-cd">{cd}</span>}
        {!live && !done && when && mcTz() && <span className="mc-tz">{mcTz()}</span>}
      </div>
      <div className="mc-teams">
        <span className="mc-team home"><span className="mc-tn">{home.name}</span> <span className="mc-fl">{home.flag}</span></span>
        <span className={"mc-vs" + (hasScore ? " has-score" : "")}>{hasScore ? `${m.score.home}–${m.score.away}` : "v"}</span>
        <span className="mc-team away"><span className="mc-fl">{away.flag}</span> <span className="mc-tn">{away.name}</span></span>
      </div>
    </div>
  );
}

function McGroupByDate({ matches, now }) {
  // sort by time, then bucket by calendar day for readable headers
  const sorted = matches.slice().sort((a, b) => new Date(a.utcDate) - new Date(b.utcDate));
  const days = [];
  sorted.forEach((m) => {
    const k = mcDateKey(m.utcDate);
    let d = days.find((x) => x.k === k);
    if (!d) { d = { k, label: (() => { try { return new Date(m.utcDate).toLocaleDateString([], MC_DAY); } catch (e) { return k; } })(), items: [] }; days.push(d); }
    d.items.push(m);
  });
  return (
    <>
      {days.map((d) => (
        <div className="mc-day" key={d.k}>
          <div className={"mc-day-label" + (mcIsToday(d.items[0].utcDate) ? " today" : "")}>{mcIsToday(d.items[0].utcDate) ? "Today · " : ""}{d.label}</div>
          {d.items.map((m) => <McMatch key={m.id} m={m} now={now} />)}
        </div>
      ))}
    </>
  );
}

function MatchCentre({ onBack }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const load = useCallback(async () => {
    setLoading(true);
    const p = window.fetchLiveResults ? await window.fetchLiveResults() : null;
    setPayload(p);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  // Keep the countdowns ticking without hammering the network.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const matches = (payload && payload.matches) || [];
  const group = matches.filter((m) => m.stage === "GROUP_STAGE");
  const byMd = [1, 2, 3].map((md) => ({ md, items: group.filter((m) => m.matchday === md) }));
  const ko = MC_KO_ORDER.map((st) => ({ st, items: matches.filter((m) => m.stage === st) })).filter((r) => r.items.length);
  const configured = payload && payload.configured !== false;
  const hasMatches = configured && matches.length > 0;

  return (
    <div className="step-screen">
      <div className="step-scroll stagger">
        <div className="mc-screen">
          <div className="mc-head">
            <h2 className="mc-title">Fixtures</h2>
            <button className="lb-refresh" onClick={load} title="Refresh">↻</button>
          </div>

          {loading && !payload ? (
            <div className="empty-state">Loading fixtures…</div>
          ) : !hasMatches ? (
            <div className="lb-soft">
              <div className="lb-soft-emoji">📅</div>
              <h3>Fixtures load at kickoff</h3>
              <p>The full World Cup schedule and live scores appear here once the results feed is live.</p>
            </div>
          ) : (
            <>
              <div className="mc-tznote">
                🕑 Kickoff times in your local time{mcTz() ? <> · <strong>{mcTz()}</strong></> : null}
              </div>

              <div className="mc-section-label">Group stage</div>
              {byMd.map((g) => (
                <div className="mc-block" key={g.md}>
                  <div className="mc-block-head">Matchday {g.md}</div>
                  <McGroupByDate matches={g.items} now={now} />
                </div>
              ))}

              {ko.length > 0 && <div className="mc-section-label">Knockouts</div>}
              {ko.map((r) => (
                <div className="mc-block" key={r.st}>
                  <div className="mc-block-head">{MC_KO_LABEL[r.st] || r.st}</div>
                  <McGroupByDate matches={r.items} now={now} />
                </div>
              ))}
            </>
          )}
        </div>
      </div>
      <div className="step-foot">
        <button className="pill ghost sm" onClick={onBack}>← Back</button>
      </div>
    </div>
  );
}

window.MatchCentre = MatchCentre;
