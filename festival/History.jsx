// DREAM XI '26 — Screen 6: History & records

function History({ onBack }) {
  return (
    <div className="screen stagger">
      <div>
        <div className="eyebrow">Records & history</div>
        <h2 className="title">Ninety-six years of summer.</h2>
        <p className="lede" style={{ marginTop: 4 }}>
          Twenty-two tournaments, eight champions. Here's the canon — and the
          records your Dream XI is chasing this summer.
        </p>
      </div>

      {/* Records to watch */}
      <h3 className="section-h3">Records to watch in '26</h3>
      <div className="rec-grid">
        {window.RECORDS_TO_WATCH.map((r, i) => (
          <div key={i} className="rec-card">
            <div className="rec-icon" aria-hidden>{r.icon}</div>
            <div className="rec-title">{r.title}</div>
            <p className="rec-body">{r.body}</p>
          </div>
        ))}
      </div>

      {/* Titles by nation */}
      <h3 className="section-h3">Most titles</h3>
      <div className="titles-grid">
        {window.TITLES_BY_NATION.map(t => (
          <div key={t.nat} className={"title-row" + (t.titles >= 4 ? " elite" : "")}>
            <span className="t-flag">{t.flag}</span>
            <div className="t-name">
              {t.nat}
              <small>{t.years}</small>
            </div>
            <div className="t-stars">
              {Array.from({ length: t.titles }).map((_, i) => (
                <span key={i} className="t-star">★</span>
              ))}
            </div>
            <div className="t-num">{t.titles}</div>
          </div>
        ))}
      </div>

      {/* Past tournaments table */}
      <h3 className="section-h3">Every final, 1930 → 2022</h3>
      <div className="card flat past-card">
        <table className="past-tbl">
          <thead>
            <tr>
              <th>Year</th>
              <th>Host</th>
              <th>Champion</th>
              <th>Runner-up</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            {window.PAST_WORLD_CUPS.slice().reverse().map(w => (
              <tr key={w.yr}>
                <td><strong>{w.yr}</strong></td>
                <td>{w.host}</td>
                <td className="champ">{w.winner}</td>
                <td className="runner">{w.runner}</td>
                <td className="score">{w.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="past-key">* after extra time · (p) won on penalties</div>
      </div>

      {/* Top scorers */}
      <h3 className="section-h3">All-time top scorers</h3>
      <div className="card flat scorers-card">
        {window.TOP_SCORERS.map((s, i) => (
          <div key={i} className="scorer-row">
            <div className="sc-rank">#{s.rank}</div>
            <div className="sc-flag">{s.flag}</div>
            <div className="sc-name">
              {s.name}
              {s.active && <span className="sc-active">active in '26</span>}
              <small>{s.era} · {s.games} games</small>
            </div>
            <div className="sc-goals">{s.goals}</div>
            <div className="sc-bar-wrap" aria-hidden>
              <div className="sc-bar" style={{ width: `${(s.goals / 16) * 100}%` }}></div>
            </div>
          </div>
        ))}
        <div className="scorers-note">
          Miroslav Klose's 16 has stood since 2014. Three active players are within range.
        </div>
      </div>

      {/* Knockout calendar for 2026 */}
      <h3 className="section-h3">2026 calendar after the group stage</h3>
      <div className="ko-grid">
        {window.KNOCKOUT_ROUNDS.map(r => (
          <div key={r.name} className="ko-card">
            <div className="ko-name">{r.name}</div>
            <div className="ko-dates">{r.dates}</div>
          </div>
        ))}
      </div>

      <div className="cta-row" style={{ marginTop: 26 }}>
        <button className="btn ghost" onClick={onBack}>← Back</button>
        <span className="disclaimer" style={{ margin: 0 }}>
          Data from public records. Independent fan project; not affiliated with FIFA.
        </span>
      </div>
    </div>
  );
}

window.History = History;
