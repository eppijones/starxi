// DREAM XI '26 — helpers + scoring + simulation engine

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ——— Formations ———
// Slot order on the pitch: GK first, then DF (left→right), then MF, then FW.
window.FORMATIONS = {
  "4-3-3": { GK: 1, DF: 4, MF: 3, FW: 3 },
  "4-4-2": { GK: 1, DF: 4, MF: 4, FW: 2 },
  "3-5-2": { GK: 1, DF: 3, MF: 5, FW: 2 },
};

window.MAX_SWAPS = 3;

// ——— Seeded RNG ———
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// ——— Count-up number hook ———
function useCountUp(target, durMs = 900) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = fromRef.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durMs]);
  return val;
}

// ——— Scoring math ———
// scoreMatch() and scoreEvents() now live in scoring-core.js (loaded before this
// file as plain JS) so the browser and the server-side leaderboard share ONE
// scoring implementation. They are available here as window.scoreMatch /
// window.scoreEvents and as the bare globals the simulation/UI already use.

// ——— Simulation engine ———
// Produces per-match results AND per-matchday player events so Captain+ works.
function simulateTournament(seed = 26) {
  const rng = makeRng(seed);

  const matchResult = (a, b) => {
    const gap = (b.rank - a.rank) / 30;
    const lambdaA = Math.max(0.25, 1.45 + gap * 0.55);
    const lambdaB = Math.max(0.25, 1.45 - gap * 0.55);
    const pois = (lam) => {
      const L = Math.exp(-lam); let k = 0, p = 1;
      while (p > L && k < 9) { k++; p *= rng(); }
      return k - 1;
    };
    return { home: pois(lambdaA), away: pois(lambdaB) };
  };

  const results = {};
  window.FIXTURES.forEach(fx => { results[fx.id] = matchResult(fx.home, fx.away); });

  // Per-player, per-matchday event line.
  // Players tied to nations only score on matchdays their nation played.
  const playerEvents = {};
  window.PLAYERS.forEach(p => {
    const base = (p.form - 7) / 2;
    const goalRate   = (p.pos === "FW" ? 1.2 : p.pos === "MF" ? 0.55 : p.pos === "DF" ? 0.15 : 0) + base * 0.35;
    const assistRate = (p.pos === "MF" ? 0.85 : p.pos === "FW" ? 0.65 : 0.20) + base * 0.25;
    const sheetRate  = (p.pos === "GK" || p.pos === "DF") ? 0.45 + base * 0.1 : 0;

    const sample = (mean) => {
      let k = 0, pp = 1, L = Math.exp(-Math.max(0, mean));
      while (pp > L && k < 6) { k++; pp *= rng(); }
      return Math.max(0, k - 1);
    };

    const byMd = [1, 2, 3].map(() => ({
      goals:   sample(goalRate),
      assists: sample(assistRate),
      sheets:  sample(sheetRate),
    }));
    const total = byMd.reduce((acc, m) => ({
      goals: acc.goals + m.goals,
      assists: acc.assists + m.assists,
      sheets: acc.sheets + m.sheets,
    }), { goals: 0, assists: 0, sheets: 0 });

    playerEvents[p.id] = { byMd, total };
  });

  return { results, playerEvents };
}

// tallyUser() (full per-user result-set) now lives in scoring-core.js so the
// browser and the /api leaderboard score entries identically. It is available
// as window.tallyUser(state, sim) — the same signature callers already use.

// ——— Mini-league + tiebreaker ladder ———
const RIVAL_NAMES = [
  "Sofia M.", "Daniel R.", "Priya K.", "Marcus T.", "Yuki A.",
  "Olivia W.", "Adeola O.", "Hugo D.", "Mei L.", "Jonas B.",
  "Rina S.", "Kofi A.", "Ines V.", "Felipe G.", "Anya P.",
  "Sven L.", "Carmen H.", "Tariq N.", "Helena F.", "Mateo R.",
  "Aisha B.", "Lucas P.", "Greta N.", "Yusuf D.",
];
const RIVAL_HANDLES = [
  "Office Sweep", "Pub Quiz United", "Aunt's pick", "Coworker", "Brother",
  "Dad's WhatsApp", "Uni mates", "5-a-side", "Coach", "Mum's hunch",
  "Cousin", "Roommate", "Trivia FC", "Group chat", "Neighbour",
  "Wife", "Husband", "Boss", "Intern", "Old friend",
  "Sis", "Gym buddy", "Tinder match", "Train regular",
];
function buildLeague(yourTotal, yourPredictionPts, yourXiPts, yourBulls, yourName) {
  const rng = makeRng(7);
  const rivals = RIVAL_NAMES.map((n, i) => {
    const variation = rng();
    const skill = 110 + variation * 280; // higher ceiling now that XI scores more
    const predShare = 0.5 + rng() * 0.35;
    return {
      name: n,
      handle: RIVAL_HANDLES[i],
      pts: Math.round(skill),
      predPts: Math.round(skill * predShare),
      xiPts: Math.round(skill * (1 - predShare)),
      bullseyes: Math.floor(rng() * 7 + (skill > 280 ? 2 : 0)),
      timestamp: 1000 + i,
      isYou: false,
    };
  });
  const you = {
    name: yourName || "You",
    handle: "Your pick",
    pts: yourTotal,
    predPts: yourPredictionPts,
    xiPts: yourXiPts,
    bullseyes: yourBulls,
    timestamp: 1, // earliest by far — final tiebreaker
    isYou: true,
  };
  return [...rivals, you].sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts;
    if (b.bullseyes !== a.bullseyes) return b.bullseyes - a.bullseyes;
    if (b.xiPts !== a.xiPts) return b.xiPts - a.xiPts;
    return a.timestamp - b.timestamp;
  }).map((r, i) => ({ ...r, rank: i + 1 }));
}

// ——— Local persistence ———
const STORE_KEY = "dreamxi26:v1";
function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}
function saveState(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {}
}

// ——— Pick helpers ———
// Count picks per position, given the current picks array.
function countByPos(pickIds) {
  const c = { GK: 0, DF: 0, MF: 0, FW: 0 };
  (pickIds || []).forEach(id => {
    const p = window.PLAYERS.find(x => x.id === id);
    if (p) c[p.pos]++;
  });
  return c;
}
// True if you can still add another player at this position under the formation.
function canPickPosition(pickIds, formation, pos) {
  const limits = window.FORMATIONS[formation];
  const cur = countByPos(pickIds);
  return cur[pos] < limits[pos];
}

// Note: scoreMatch / scoreEvents / tallyUser are exported by scoring-core.js.
Object.assign(window, {
  useCountUp,
  simulateTournament, buildLeague,
  loadState, saveState, makeRng,
  countByPos, canPickPosition,
});
