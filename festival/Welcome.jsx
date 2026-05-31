// DREAM XI '26 — Screen 1: Welcome + nation picker

function Welcome({ state, setState, onNext, onHistory }) {
  const [query, setQuery] = useState("");
  const nation = state.nation;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...window.NATIONS].sort((a, b) => a.rank - b.rank);
    if (!q) return list;
    return list.filter(n =>
      n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q)
    );
  }, [query]);

  const chosen = nation ? window.NATIONS.find(n => n.code === nation) : null;

  return (
    <div className="screen stagger">
      <div className="hero-grid">
        <div className="hero-left">
          <h1 className="display">
            Pick your nation. <br/>Play the summer.
          </h1>

          <div className="cta-row">
            <button
              className="btn gold"
              disabled={!nation}
              onClick={onNext}
            >
              {nation ? `Build my Dream XI · ${chosen.flag} ${chosen.name}` : "Pick a nation to start →"}
              {nation && <span>→</span>}
            </button>
          </div>
        </div>

        <aside className="hero-right">
          <div className="flag-picker">
            <div className="fp-head">
              <div className="fp-title">Pick your nation</div>
              <div className="fp-sub">2× boost · all summer</div>
            </div>
            <input
              className="fp-search"
              placeholder="Search 48 nations…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="fp-grid">
              {filtered.map(n => (
                <button
                  key={n.code}
                  className={"flag-chip" + (nation === n.code ? " sel" : "")}
                  onClick={() => setState(s => ({ ...s, nation: n.code }))}
                  title={`${n.name} · Group ${n.group} · #${n.rank}${n.note ? " · " + n.note : ""}`}
                >
                  <span className="em">{n.flag}</span>
                  <span className="nm">{n.code}</span>
                </button>
              ))}
              {filtered.length === 0 && (
                <div style={{ gridColumn: "1/-1", padding: 18, opacity: .5, fontSize: 13 }}>
                  No matches.
                </div>
              )}
            </div>
            <div className="fp-chosen">
              {chosen ? (
                <>
                  <span className="big-flag">{chosen.flag}</span>
                  <div>
                    <div className="nm">{chosen.name}</div>
                    <div className="sub">
                      Group {chosen.group} · #{chosen.rank}
                      {chosen.note && <> · <span style={{ color: "var(--gold)" }}>{chosen.note}</span></>}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <span className="big-flag" style={{ opacity: .35 }}>🏳️</span>
                  <div className="empty">No nation picked yet</div>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

window.Welcome = Welcome;
