// STAR XI — Match Centre: every World Cup fixture with kickoff time + live/final
// score, straight from /api/results (football-data). Group stage by matchday,
// then the knockout rounds. Refreshable daily through the tournament.

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
const MC_TIME = { hour: "2-digit", minute: "2-digit" };
function mcDateKey(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return ""; } }
function mcIsToday(iso) {
  try { return mcDateKey(iso) === new Date().toISOString().slice(0, 10); } catch (e) { return false; }
}
const MC_KO_ORDER = ["LAST_32", "LAST_16", "QUARTER_FINALS", "SEMI_FINALS", "THIRD_PLACE", "FINAL"];
const MC_KO_LABEL = {
  LAST_32: "Round of 32", LAST_16: "Round of 16", QUARTER_FINALS: "Quarter-finals",
  SEMI_FINALS: "Semi-finals", THIRD_PLACE: "Third-place play-off", FINAL: "Final",
};
const MC_LIVE = { IN_PLAY: true, PAUSED: true };

function McMatch({ m }) {
  const home = mcTeam(m.home), away = mcTeam(m.away);
  const live = MC_LIVE[m.status];
  const done = m.status === "FINISHED";
  const hasScore = m.score && m.score.home != null && m.score.away != null;
  let when;
  try { when = new Date(m.utcDate).toLocaleTimeString([], MC_TIME); } catch (e) { when = ""; }
  return (
    <div className={"mc-match" + (live ? " live" : "") + (mcIsToday(m.utcDate) ? " today" : "")}>
      <div className="mc-status">
        {live ? <span className="mc-livedot" /> : null}
        {live ? "LIVE" : done ? "FT" : when}
      </div>
      <div className="mc-teams">
        <span className="mc-team home"><span className="mc-tn">{home.name}</span> <span className="mc-fl">{home.flag}</span></span>
        <span className="mc-score">{hasScore ? `${m.score.home} – ${m.score.away}` : "v"}</span>
        <span className="mc-team away"><span className="mc-fl">{away.flag}</span> <span className="mc-tn">{away.name}</span></span>
      </div>
    </div>
  );
}

function McGroupByDate({ matches }) {
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
          {d.items.map((m) => <McMatch key={m.id} m={m} />)}
        </div>
      ))}
    </>
  );
}

function MatchCentre({ onBack }) {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const p = window.fetchLiveResults ? await window.fetchLiveResults() : null;
    setPayload(p);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const matches = (payload && payload.matches) || [];
  const group = matches.filter((m) => m.stage === "GROUP_STAGE");
  const byMd = [1, 2, 3].map((md) => ({ md, items: group.filter((m) => m.matchday === md) }));
  const ko = MC_KO_ORDER.map((st) => ({ st, items: matches.filter((m) => m.stage === st) })).filter((r) => r.items.length);
  const configured = payload && payload.configured !== false;

  return (
    <div className="step-screen">
      <div className="step-scroll stagger">
        <div className="mc-screen">
          <div className="mc-head">
            <h2 className="mc-title">Match Centre</h2>
            <button className="lb-refresh" onClick={load} title="Refresh">↻</button>
          </div>

          {loading && !payload ? (
            <div className="empty-state">Loading fixtures…</div>
          ) : !configured || matches.length === 0 ? (
            <div className="lb-soft">
              <div className="lb-soft-emoji">📅</div>
              <h3>Fixtures load at kickoff</h3>
              <p>The full World Cup schedule and live scores appear here once the results feed is live.</p>
            </div>
          ) : (
            <>
              <div className="mc-section-label">Group stage</div>
              {byMd.map((g) => (
                <div className="mc-block" key={g.md}>
                  <div className="mc-block-head">Matchday {g.md}</div>
                  <McGroupByDate matches={g.items} />
                </div>
              ))}

              {ko.length > 0 && <div className="mc-section-label">Knockouts</div>}
              {ko.map((r) => (
                <div className="mc-block" key={r.st}>
                  <div className="mc-block-head">{MC_KO_LABEL[r.st] || r.st}</div>
                  <McGroupByDate matches={r.items} />
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
