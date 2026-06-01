// STAR XI — Landing: full-bleed nation carousel + picker
// Pick your nation, pick your figure (man/woman), confirm.

// Bold flat colour per nation — full-bleed background.
const NATION_BG = {
  MEX: "#1B7A3D", RSA: "#0E7A4A", KOR: "#C8102E", CZE: "#11457E",
  CAN: "#D32436", BIH: "#1A3A8C", QAT: "#7A1431", SUI: "#D8232A",
  BRA: "#1E9E4A", MAR: "#B81B2C", HAI: "#10248C", SCO: "#1C2C5E",
  USA: "#1C2C7A", PAR: "#C8102E", AUS: "#00674A", TUR: "#D11A1A",
  GER: "#2B2B30", CUW: "#00339A", CIV: "#C25A12", ECU: "#16357E",
  NED: "#E2620E", JPN: "#11235E", SWE: "#1B58A6", TUN: "#B11118",
  BEL: "#C8102E", EGY: "#B21320", IRN: "#138047", NZL: "#1B1B20",
  ESP: "#C60B1E", CPV: "#163E8C", KSA: "#0E6B3B", URU: "#2766A8",
  FRA: "#1C2C7A", SEN: "#138047", IRQ: "#0C6E3B", NOR: "#BA0C2F",
  ARG: "#2E7CC2", ALG: "#0B6E3A", AUT: "#C01124", JOR: "#1A6E3F",
  POR: "#B81B2C", COD: "#1F6FC2", UZB: "#1A53A0", COL: "#16357E",
  ENG: "#34588C", CRO: "#C21527", GHA: "#15803D", PAN: "#C0142B",
};

// Streetwear / stadium nicknames — the giant ghost word behind the scene.
const NATION_NICK = {
  ARG: "LA ALBICELESTE", BRA: "SELEÇÃO", FRA: "LES BLEUS", ENG: "THREE LIONS",
  GER: "DIE MANNSCHAFT", ESP: "LA ROJA", POR: "A SELEÇÃO", NED: "ORANJE",
  BEL: "RED DEVILS", CRO: "VATRENI", URU: "LA CELESTE", MEX: "EL TRI",
  USA: "THE YANKS", CAN: "LES ROUGES", NOR: "LØVENE", SEN: "TERANGA LIONS",
  MAR: "ATLAS LIONS", JPN: "SAMURAI BLUE", KOR: "TAEGUK WARRIORS", SWE: "BLÅGULT",
  EGY: "THE PHARAOHS", IRN: "TEAM MELLI", AUS: "SOCCEROOS", SUI: "LA NATI",
  AUT: "DAS TEAM", COL: "LOS CAFETEROS", GHA: "BLACK STARS", SCO: "TARTAN ARMY",
  ALG: "LES FENNECS", CIV: "LES ÉLÉPHANTS", TUR: "AY-YILDIZ", NZL: "ALL WHITES",
  ECU: "LA TRI", PAR: "LA ALBIRROJA", QAT: "AL ANNABI", BIH: "ZMAJEVI",
  CZE: "NÁRODNÍ TÝM", HAI: "LES GRENADIERS", TUN: "EAGLES OF CARTHAGE",
  KSA: "GREEN FALCONS", CPV: "TUBARÕES AZUIS", CUW: "BLUE WAVE",
  IRQ: "LIONS OF MESOPOTAMIA", JOR: "AL NASHAMA", COD: "LES LÉOPARDS",
  UZB: "WHITE WOLVES", PAN: "LOS CANALEROS", RSA: "BAFANA BAFANA",
};

// Map nation code → file slug under assets/figures/<slug>_[m|f].png
const FIG_SLUG = {
  ALG: "algeria", ARG: "argentina", AUS: "australia", AUT: "austria",
  BEL: "belgium", BIH: "bosnia", BRA: "brazil", CAN: "canada",
  CPV: "cape_verde", COL: "colombia", CRO: "croatia", CUW: "curacao",
  CZE: "czechia", COD: "dr_congo", ECU: "ecuador", EGY: "egypt",
  ENG: "england", FRA: "france", GER: "germany", GHA: "ghana",
  HAI: "haiti", IRN: "iran", IRQ: "iraq", CIV: "ivory_coast",
  JPN: "japan", JOR: "jordan", MEX: "mexico", MAR: "morocco",
  NED: "netherlands", NZL: "new_zealand", NOR: "norway", PAN: "panama",
  PAR: "paraguay", POR: "portugal", QAT: "qatar", KSA: "saudi_arabia",
  SCO: "scotland", SEN: "senegal", RSA: "south_africa", KOR: "south_korea",
  ESP: "spain", SWE: "sweden", SUI: "switzerland", TUN: "tunisia",
  TUR: "turkiye", USA: "united_states", URU: "uruguay", UZB: "uzbekistan",
};

const EASE = "cubic-bezier(0.4,0,0.2,1)";
const DUR = 600;
const AUTOPLAY_MS = 1150;

const GRAIN = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.08'/></svg>`
);

function figureSrc(code, gender) {
  const slug = FIG_SLUG[code];
  if (!slug) return null;
  return `assets/figures/${slug}_${gender === "female" ? "f" : "m"}.png`;
}

function Welcome({ state, setState, onNext, onHistory }) {
  // Deck — shuffle through the 8 most iconic nations first as the autoplay reel,
  // alternating male / female. The picker can target any of the 48.
  const REEL_CODES = ["BRA","ENG","FRA","GER","CAN","ARG","ESP","NED","MEX","JPN"];
  const DECK = useMemo(() => {
    const d = [];
    REEL_CODES.forEach((c, i) => d.push({ code: c, gender: i % 2 === 0 ? "male" : "female" }));
    REEL_CODES.forEach((c, i) => d.push({ code: c, gender: i % 2 === 0 ? "female" : "male" }));
    return d;
  }, []);
  const N = DECK.length;

  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickGender, setPickGender] = useState(state.gender || "male");
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 640);

  const selectedNation = state.nation; // existing app state — country CODE

  // resize tracking
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // pre-cache reel images
  useEffect(() => {
    REEL_CODES.forEach((c) => ["male","female"].forEach((g) => {
      const src = figureSrc(c, g);
      if (src) { const im = new Image(); im.src = src; }
    }));
  }, []);

  // autoplay — runs until you pick a nation
  useEffect(() => {
    if (!playing || selectedNation) return;
    const id = setInterval(() => setActiveIndex((p) => (p + 1) % N), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing, selectedNation, N]);

  // when a nation is locked in, freeze the carousel on it
  useEffect(() => {
    if (!selectedNation) return;
    let idx = DECK.findIndex((d) => d.code === selectedNation && d.gender === pickGender);
    if (idx < 0) {
      // not in default reel — extend the deck with the picked nation
      idx = DECK.length;
      DECK.push({ code: selectedNation, gender: pickGender });
    }
    setActiveIndex(idx);
  }, [selectedNation, pickGender, DECK]);

  // Esc closes the picker and clears the selection
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        setPickerOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openPicker = useCallback(() => {
    setQuery("");
    setPickerOpen(true);
  }, []);
  const closePicker = useCallback(() => setPickerOpen(false), []);

  const center = activeIndex;
  const left  = (activeIndex + N - 1) % N;
  const right = (activeIndex + 1) % N;
  const back  = (activeIndex + 2) % N;

  const TR = `transform ${DUR}ms ${EASE}, filter ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}, left ${DUR}ms ${EASE}, bottom ${DUR}ms ${EASE}, height ${DUR}ms ${EASE}`;

  const roleStyle = (i) => {
    const base = { position: "absolute", aspectRatio: "0.6667 / 1", transition: TR, willChange: "transform, filter, opacity" };
    if (i === center) return { ...base,
      transform: "translateX(-50%) scale(1)", filter: "blur(0px)", opacity: 1, zIndex: 20,
      left: "50%", height: isMobile ? "74%" : "100%", bottom: isMobile ? "11%" : "0%" };
    if (i === left) return { ...base,
      transform: "translateX(-50%) scale(1)", filter: "blur(2px)", opacity: 0.6, zIndex: 10,
      left: isMobile ? "14%" : "22%", height: isMobile ? "20%" : "36%", bottom: isMobile ? "30%" : "6%" };
    if (i === right) return { ...base,
      transform: "translateX(-50%) scale(1)", filter: "blur(2px)", opacity: 0.6, zIndex: 10,
      left: isMobile ? "86%" : "78%", height: isMobile ? "20%" : "36%", bottom: isMobile ? "30%" : "6%" };
    if (i === back) return { ...base,
      transform: "translateX(-50%) scale(1)", filter: "blur(5px)", opacity: 0.4, zIndex: 5,
      left: "50%", height: isMobile ? "15%" : "30%", bottom: isMobile ? "30%" : "6%" };
    return { ...base,
      transform: "translateX(-50%) scale(0.85)", filter: "blur(6px)", opacity: 0, zIndex: 1,
      left: "50%", height: isMobile ? "14%" : "24%", bottom: isMobile ? "30%" : "6%" };
  };

  const active = DECK[activeIndex] || DECK[0];
  const activeCode = active.code;
  const activeNation = window.NATIONS.find((n) => n.code === activeCode) || window.NATIONS[0];
  const bg = NATION_BG[activeCode] || "#15161B";
  const ghost = NATION_NICK[activeCode] || activeNation.name.toUpperCase();
  const factParts = [
    activeNation.group ? `GROUP ${activeNation.group}` : null,
    activeNation.note ? activeNation.note.toUpperCase() : null,
  ].filter(Boolean);

  // fit the ghost word to viewport width
  const [ghostSize, setGhostSize] = useState(180);
  React.useLayoutEffect(() => {
    const ctx = document.createElement("canvas").getContext("2d");
    const fit = () => {
      ctx.font = "100px \"Anton\", sans-serif";
      const w = ctx.measureText(ghost).width || 1;
      const target = window.innerWidth * 0.92;
      let size = 100 * target / w;
      size = Math.min(size, window.innerHeight * 0.46, 300);
      size = Math.max(size, 40);
      setGhostSize(size);
    };
    fit();
    const raf = requestAnimationFrame(fit);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
    window.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); cancelAnimationFrame(raf); };
  }, [ghost]);

  // picker — filter all 48
  const filtered = useMemo(() => {
    const list = [...window.NATIONS].sort((a, b) => a.rank - b.rank);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) => n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q));
  }, [query]);

  const setNation = (code) => {
    setState((s) => ({ ...s, nation: code, gender: pickGender }));
    setPickerOpen(false);
  };
  const setGender = (g) => {
    setPickGender(g);
    setState((s) => ({ ...s, gender: g }));
  };

  return (
    <div className="starxi-landing" style={{
      backgroundColor: bg,
      transition: `background-color ${DUR}ms ${EASE}`,
      fontFamily: "Inter, sans-serif",
      position: "relative", width: "100%", overflow: "hidden",
      height: "100vh", minHeight: 560,
    }}>
      {/* grain */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50, opacity: 0.4,
        backgroundImage: `url("${GRAIN}")`, backgroundSize: "200px 200px", backgroundRepeat: "repeat"
      }} />

      {/* ghost nickname */}
      <div style={{
        position: "absolute", inset: "0", display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none", userSelect: "none", zIndex: 2, top: "10%"
      }}>
        <span style={{
          fontFamily: "Anton, sans-serif", fontSize: `${ghostSize}px`, fontWeight: 900,
          color: "#fff", opacity: 1, lineHeight: 1, textTransform: "uppercase",
          letterSpacing: "-0.02em", whiteSpace: "nowrap"
        }}>{ghost}</span>
      </div>

      {/* brand — top center */}
      <div style={{
        position: "absolute", top: 18, left: "50%", transform: "translateX(-50%)",
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        zIndex: 60
      }}>
        <svg width="42" viewBox="0 0 200 210" fill="none" style={{ marginBottom: 7, filter: "drop-shadow(0 2px 14px rgba(0,0,0,0.42))" }}>
          <path d="M48,24 L152,24 Q166,24 166,48 Q166,110 146,148 Q126,184 100,196 Q74,184 54,148 Q34,110 34,48 Q34,24 48,24 Z"
                stroke="#fff" strokeWidth="7" strokeLinejoin="round" />
          <g transform="translate(100,110) scale(0.9) translate(-100,-110)">
            <path d="M48,24 L152,24 Q166,24 166,48 Q166,110 146,148 Q126,184 100,196 Q74,184 54,148 Q34,110 34,48 Q34,24 48,24 Z"
                  stroke="#fff" strokeWidth="3" fill="none" />
          </g>
          <polygon points="100,37 103.41,47.31 114.27,47.36 105.52,53.79 108.82,64.14 100,57.8 91.18,64.14 94.48,53.79 85.73,47.36 96.59,47.31" fill="#fff" />
          <g fill="#fff">
            <polygon points="55,80 75,80 117,148 97,148" />
            <polygon points="97,80 117,80 75,148 55,148" />
            <polygon points="125,80 145,80 145,148 125,148" />
          </g>
        </svg>
        <div style={{
          fontFamily: "Anton, sans-serif", fontSize: "clamp(24px,3vw,36px)",
          color: "#fff", letterSpacing: "0.05em", lineHeight: 1,
          textShadow: "0 2px 22px rgba(0,0,0,0.38)"
        }}>STAR XI</div>
        <div style={{
          color: "#fff", opacity: 0.78, letterSpacing: "0.26em", marginTop: 6,
          textShadow: "0 2px 16px rgba(0,0,0,0.4)",
          fontSize: 11, fontWeight: 600, textTransform: "uppercase"
        }}>World Cup 2026 Edition</div>
      </div>

      {/* fan tagline — top right */}
      <div style={{
        position: "absolute", top: 28, right: 16, display: "flex", alignItems: "center",
        gap: 8, zIndex: 60
      }}>
        <span style={{
          width: 7, height: 7, borderRadius: 99, background: "#fff",
          animation: "livepulse 1.7s ease-in-out infinite"
        }} />
        <span style={{
          color: "#fff", opacity: 0.82, letterSpacing: "0.16em", fontSize: 11, fontWeight: 700,
          textTransform: "uppercase", whiteSpace: "nowrap"
        }}>Made by fans, for the fans</span>
      </div>

      {/* carousel */}
      <div style={{ position: "absolute", inset: 0, zIndex: 3 }}>
        {DECK.map((it, i) => {
          const src = figureSrc(it.code, it.gender);
          if (!src) return null;
          const role = i === center ? "c" : "o";
          return (
            <div key={`${it.code}_${it.gender}_${i}`} style={roleStyle(i)}>
              <img src={src} draggable="false" alt={it.code}
                style={{
                  width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom center",
                  filter: role === "c" ? "drop-shadow(0 30px 40px rgba(0,0,0,0.28))" : "none"
                }} />
            </div>
          );
        })}
      </div>

      {/* bottom-left: nation name + group/fact */}
      <div style={{
        position: "absolute", bottom: 18, left: 16, zIndex: 60, maxWidth: 540, pointerEvents: "none"
      }}>
        <p style={{
          color: "#fff", margin: 0, marginBottom: 8, fontFamily: "Anton, sans-serif",
          fontWeight: 400, fontSize: "clamp(36px, 6vw, 64px)", lineHeight: 1,
          letterSpacing: "0.01em", textTransform: "uppercase"
        }}>{(activeNation.name || "").toUpperCase()}</p>
        <p style={{
          color: "#fff", opacity: 0.9, margin: 0, fontSize: "clamp(11px,1.5vw,14px)",
          fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap"
        }}>
          {factParts.map((p, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ width: 4, height: 4, borderRadius: 99, background: "rgba(255,255,255,0.65)" }} />}
              <span>{p}</span>
            </React.Fragment>
          ))}
        </p>
      </div>

      {/* bottom-left actions */}
      <div style={{
        position: "absolute", left: 16, bottom: isMobile ? 96 : 144, zIndex: 60,
        display: "flex", flexDirection: "column", alignItems: "stretch", gap: 9,
        width: "min(330px, 80vw)"
      }}>
        {selectedNation && (
          <React.Fragment>
            <div style={{
              display: "flex", gap: 6, padding: 6, borderRadius: 999,
              border: "2px solid rgba(255,255,255,0.85)",
              background: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              boxShadow: "0 14px 34px rgba(0,0,0,0.22)"
            }}>
              {[["male","MAN"], ["female","WOMAN"]].map(([key, lbl]) => {
                const on = pickGender === key;
                return (
                  <button key={key} onClick={() => setGender(key)}
                    style={{
                      flex: 1, padding: "11px 12px", borderRadius: 999, border: "none", cursor: "pointer",
                      fontSize: 14, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                      color: on ? bg : "#fff", background: on ? "#fff" : "transparent",
                      transition: "background 200ms, color 200ms"
                    }}>{lbl}</button>
                );
              })}
            </div>

            <button onClick={onNext}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "15px 24px", borderRadius: 999, cursor: "pointer",
                border: "2px solid #fff", background: "#fff", color: bg,
                fontSize: 16, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                boxShadow: "0 14px 34px rgba(0,0,0,0.28)", transition: "transform 140ms"
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
              Build my Star XI →
            </button>
          </React.Fragment>
        )}

        <button onClick={openPicker}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            padding: "14px 24px", borderRadius: 999, cursor: "pointer",
            border: "2px solid rgba(255,255,255,0.85)",
            background: "rgba(255,255,255,0.12)",
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            color: "#fff", fontSize: 15, fontWeight: 700, letterSpacing: "0.14em",
            textTransform: "uppercase", transition: "background 160ms"
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
          </svg>
          {selectedNation ? "Change nation" : "Pick your nation"}
        </button>
      </div>

      {/* picker overlay */}
      {pickerOpen && (
        <div onClick={closePicker} style={{
          position: "absolute", inset: 0, zIndex: 100, display: "flex",
          alignItems: "flex-end", justifyContent: "center", padding: 14, paddingBottom: 132,
          background: "rgba(0,0,0,0.18)"
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "relative", width: "min(1500px, 96%)", maxHeight: "94vh",
            display: "flex", flexDirection: "column",
            borderRadius: 22, overflow: "hidden",
            animation: "pickerIn 240ms cubic-bezier(0.2,0.8,0.2,1)",
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(17,18,23,0.92)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 30px 70px rgba(0,0,0,0.5)"
          }}>
            <div style={{
              position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.22,
              backgroundImage: `url("${GRAIN}")`, backgroundSize: "200px 200px"
            }} />
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", padding: "10px 12px 6px", justifyContent: "space-between", alignItems: "center" }}>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search 48 nations…"
                  style={{
                    flex: 1, marginRight: 10, padding: "8px 14px", borderRadius: 999,
                    border: "1.5px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.06)", color: "#fff",
                    fontSize: 13, outline: "none"
                  }}
                />
                <button onClick={closePicker} aria-label="Close" style={{
                  color: "#fff", opacity: 0.85, background: "rgba(0,0,0,0.25)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                  width: 32, height: 32, borderRadius: 999, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>

              <div style={{ padding: "0 14px 14px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 6 }}>
                  {filtered.map((n) => {
                    const isSel = n.code === selectedNation;
                    return (
                      <button key={n.code} title={n.name} onClick={() => setNation(n.code)}
                        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
                        onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                          padding: "8px 1px 6px", borderRadius: 9, cursor: "pointer",
                          border: isSel ? "2px solid #fff" : "1.5px solid rgba(255,255,255,0.12)",
                          background: isSel ? "#fff" : "rgba(255,255,255,0.06)",
                          transition: "background 140ms, border-color 140ms"
                        }}>
                        <span style={{ fontSize: 17, lineHeight: 1 }}>{n.flag}</span>
                        <span style={{
                          fontFamily: "Anton, sans-serif", fontSize: 10, letterSpacing: "0.04em",
                          color: isSel ? "#14141A" : "#fff", textTransform: "uppercase"
                        }}>{n.code}</span>
                      </button>
                    );
                  })}
                </div>
                {filtered.length === 0 && (
                  <p style={{
                    color: "rgba(255,255,255,0.7)", textAlign: "center", padding: "22px 0", fontSize: 13
                  }}>No nations match “{query}”.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes livepulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.7); } }
        @keyframes pickerIn { from { transform: translateY(16px) scale(0.985); } to { transform: translateY(0) scale(1); } }
      `}</style>
    </div>
  );
}

window.Welcome = Welcome;
