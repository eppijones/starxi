// DREAM XI '26 — SUMMER EDITION — festive extras
// ConfettiBurst: a one-shot confetti shower for the final-whistle reveal.

const CONFETTI_COLORS = [
  "#FFC02E", // sunshine
  "#FF5A1F", // sunset orange
  "#FF2E7E", // festival pink
  "#14B866", // grass
  "#03B8AE", // teal
  "#2F6BFF", // electric blue
  "#FFFFFF",
];

function ConfettiBurst({ count = 90, run = true }) {
  const pieces = React.useMemo(() => {
    return Array.from({ length: count }).map((_, i) => {
      const color = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      const left = Math.random() * 100;
      const delay = Math.random() * 0.9;
      const dur = 2.2 + Math.random() * 1.9;
      const size = 7 + Math.random() * 8;
      const round = Math.random() > 0.6;
      const drift = (Math.random() - 0.5) * 160;
      return { color, left, delay, dur, size, round, drift, i };
    });
  }, [count, run]);

  if (!run) return null;

  return (
    <div className="confetti-layer" aria-hidden="true">
      {pieces.map(p => (
        <span
          key={p.i}
          className="confetti-pc"
          style={{
            left: p.left + "%",
            width: p.round ? p.size : p.size * 0.7,
            height: p.round ? p.size : p.size * 1.4,
            borderRadius: p.round ? "50%" : "2px",
            background: p.color,
            "--dur": p.dur + "s",
            "--delay": p.delay + "s",
            marginLeft: p.drift + "px",
          }}
        ></span>
      ))}
    </div>
  );
}

window.ConfettiBurst = ConfettiBurst;
