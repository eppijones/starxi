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

// ISO 3166-1 alpha-2 → STAR XI nation code. Only the 48 nations playing
// this summer are mapped; visitors from elsewhere just get the random reel.
const ISO_TO_CODE = {
  AR: "ARG", DZ: "ALG", AU: "AUS", AT: "AUT", BE: "BEL", BA: "BIH",
  BR: "BRA", CA: "CAN", CV: "CPV", CO: "COL", HR: "CRO", CW: "CUW",
  CZ: "CZE", CD: "COD", EC: "ECU", EG: "EGY", GB: "ENG", FR: "FRA",
  DE: "GER", GH: "GHA", HT: "HAI", IR: "IRN", IQ: "IRQ", CI: "CIV",
  JP: "JPN", JO: "JOR", MX: "MEX", MA: "MAR", NL: "NED", NZ: "NZL",
  NO: "NOR", PA: "PAN", PY: "PAR", PT: "POR", QA: "QAT", SA: "KSA",
  SN: "SEN", ZA: "RSA", KR: "KOR", ES: "ESP", SE: "SWE", CH: "SUI",
  TN: "TUN", TR: "TUR", US: "USA", UY: "URU", UZ: "UZB",
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

// ——— Skin-tone variants ———
// Decouples the character's skin tone from the nation kit, so any fan can
// represent any nation. FOUR swatches, light → deep. Each nation's ORIGINAL
// render maps to whichever swatch is nearest its natural skin (window.SKIN_BASE_TONES,
// from carachters/scripts/assign_base_tones.py) — that swatch is the pre-selected
// default and loads the pristine original figure. The other three swatches load
// generated variants on disk at assets/figures-webp/<slug>_<g>_tone<N>.webp.
// Generated via fal.ai nano-banana-pro edit (2K). All 48 nations have variants.
const TONE_NATIONS = new Set(Object.keys(FIG_SLUG));
// Swatch colours (display only; the real skin is baked into each variant
// image). Mirrors the descriptors in carachters/scripts/skin_tone_config.mjs
// (keep in sync). Tones 1 & 2 de-yellowed (were too golden). Order light → deep.
const SKIN_TONES = [
  { id: 1, color: "#E2BFA4" },
  { id: 2, color: "#BC8068" },
  { id: 3, color: "#8A5636" },
  { id: 4, color: "#5C3A24" },
];

// Each figure's base swatch (1..4). The pre-selected default = this tone, and
// selecting it loads the original figure (not a generated variant). Falls back
// to 1 if the map hasn't loaded or the figure is unknown.
function baseToneFor(code, gender) {
  const slug = FIG_SLUG[code];
  const g = gender === "female" ? "f" : "m";
  const map = (typeof window !== "undefined" && window.SKIN_BASE_TONES) || {};
  return map[`${slug}_${g}`] || 1;
}

// Resolve the swatch a figure should show. pick === 0 means "follow the base
// default"; an explicit pick (1..4) is honoured as-is and persists across
// nation/gender switches so the player keeps their chosen tone.
function resolveTone(code, gender, pick) {
  return pick === 0 ? baseToneFor(code, gender) : pick;
}

const EASE = "cubic-bezier(0.4,0,0.2,1)";
const DUR = 600;
const AUTOPLAY_MS = 1150;

// Tournament kickoff — Group A opener, Mexico City, Jun 11 2026.
// Mirrors the constant in app.jsx so the landing ticker stays in sync with
// the locked-in screen's countdown strip.
const KICKOFF_MS = Date.UTC(2026, 5, 11, 16, 0, 0);

// All character webps are authored 1120x1500 with consistent margin, so a
// naive bbox-centre is identical for every figure — yet the *visible* body
// drifts (out-stretched arms, props) and some characters are 9% shorter than
// others. window.FIGURE_BOUNDS (see festival/figure-bounds.js) holds the
// alpha-centroid + body-height per slug; we compose a tiny per-figure
// transform on top of object-fit:contain so every character ends up balanced
// under the logo and roughly the same height.
//
// IMG_FIT_FRAC: with the wrapper box at aspect 0.6667 and the image at
// 1120/1500 ≈ 0.747, object-fit:contain fills the box width and renders the
// image at 0.6667 * 1500/1120 = ~0.8927 of the box height (the extra space
// sits at the top as letterbox — object-position:bottom centre pins the
// figure to the bottom).
const IMG_FIT_FRAC = (2/3) * (1500/1120);
// Target body height as a fraction of box height. Picked just above the
// median body so the scale factor stays in a tight 0.94–1.05 range — large
// enough to even out the silhouettes, small enough to avoid any visible
// up-scaling artefacts in the WebP.
const TARGET_BODY_FRAC = 0.80;

function figureTransform(slug) {
  const b = (typeof window !== "undefined" && window.FIGURE_BOUNDS) ? window.FIGURE_BOUNDS[slug] : null;
  if (!b) return null;
  // cx is fraction of canvas width — same in box-percent because the image
  // fills box width under contain. fy is feet Y as fraction of canvas height;
  // multiplied by IMG_FIT_FRAC and offset for the top letterbox to get a
  // box-percent for the transform-origin.
  const cxPct  = b.cx * 100;
  const feetPct = (1 - IMG_FIT_FRAC + b.fy * IMG_FIT_FRAC) * 100;
  // Translate to nudge the centroid onto box centre; scale to normalise body
  // height. Both happen around the (cxPct, feetPct) origin so feet stay put.
  const dxPct = (0.5 - b.cx) * 100;
  const s = TARGET_BODY_FRAC / (b.bh * IMG_FIT_FRAC);
  return {
    transformOrigin: `${cxPct}% ${feetPct}%`,
    transform: `translate3d(${dxPct}%, 0, 0) scale(${s.toFixed(4)})`,
  };
}

// Fisher-Yates — used to randomise the order each pass through all 96 figures.
function shuffleArr(src) {
  const out = src.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
  }
  return out;
}

const GRAIN = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.08'/></svg>`
);

function figureSrc(code, gender, tone) {
  const slug = FIG_SLUG[code];
  if (!slug) return null;
  const g = gender === "female" ? "f" : "m";
  // Skin-tone variant: only when this nation has variants AND the requested tone
  // is NOT the figure's base tone (the base tone is served by the original file
  // below — no variant is generated for it). Variants are normalised to the same
  // 1120x1500 canvas as the base, so the per-figure transform/bounds line up.
  if (tone && TONE_NATIONS.has(code) && tone !== baseToneFor(code, gender)) {
    return `assets/figures-webp/${slug}_${g}_tone${tone}.webp`;
  }
  // WebP at display resolution (~1500px tall, ~80KB each) — the 4800px source
  // PNGs were ~7MB apiece, which cratered carousel smoothness because the GPU
  // was re-uploading 17-megapixel textures on every swap.
  return `assets/figures-webp/${slug}_${g}.webp`;
}

// ——— Top-right: auth only ———
function LandingTopRight() {
  const auth = typeof window.useClerkAuth === "function" ? window.useClerkAuth() : { loaded: false, signedIn: false };
  const btnRef = useRef(null);

  useEffect(() => {
    if (auth.signedIn && btnRef.current && window.Clerk) {
      window.Clerk.mountUserButton(btnRef.current, { afterSignOutUrl: "/" });
      const el = btnRef.current;
      return () => { try { window.Clerk.unmountUserButton(el); } catch (e) {} };
    }
  }, [auth.signedIn]);

  const GLASS = {
    background: "rgba(255,255,255,0.10)",
    backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
    border: "1px solid rgba(255,255,255,0.22)",
    borderRadius: 999,
  };

  if (!auth.loaded) return null;

  return (
    <div style={{ position: "absolute", top: "calc(20px + env(safe-area-inset-top, 0px))", right: "calc(16px + env(safe-area-inset-right, 0px))", zIndex: 60, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      {auth.signedIn ? (
        <div ref={btnRef} style={{ minWidth: 32, minHeight: 32 }} />
      ) : (
        <React.Fragment>
          <button
            onClick={() => window.clerkOpenSignIn && window.clerkOpenSignIn()}
            style={{
              ...GLASS,
              display: "flex", alignItems: "center", gap: 7,
              padding: "9px 16px", cursor: "pointer",
              color: "#fff", fontSize: 11, fontWeight: 700,
              letterSpacing: "0.16em", textTransform: "uppercase",
              boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
              transition: "background 160ms, transform 120ms",
              border: "1px solid rgba(255,255,255,0.30)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.20)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; e.currentTarget.style.transform = "none"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" y1="12" x2="3" y2="12" />
            </svg>
            Log in
          </button>
        </React.Fragment>
      )}
    </div>
  );
}

function Welcome({ state, setState, onNext, onHistory }) {
  // The carousel cycles every one of the 96 figures (48 nations × M/F). Each
  // "pass" is a Fisher-Yates shuffle of the full 96, so no figure repeats
  // until every other one has shown. When we near the end of a pass we append
  // a fresh shuffle, so the reel loops forever without a hard wrap.
  const ALL_PAIRS = useMemo(() => {
    const out = [];
    Object.keys(FIG_SLUG).forEach((c) => {
      out.push({ code: c, gender: "male" });
      out.push({ code: c, gender: "female" });
    });
    return out;
  }, []);
  const PASS_LEN = ALL_PAIRS.length; // 96

  const [deck, setDeck] = useState(() => shuffleArr(ALL_PAIRS));
  const [activeIndex, setActiveIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pickGender, setPickGender] = useState(state.gender || "male");
  // Skin tone: per-gender map { male: 0|1..4, female: 0|1..4 }.
  // 0 = follow the nation's base default (loads the original, pre-selected
  // figure — its natural swatch is highlighted in the menu); 1..4 = explicit.
  // Each gender is INDEPENDENT — changing the Man tone does not affect the
  // Woman tone and vice versa. Both default to 0 (base default).
  const [pickTones, setPickTones] = useState(() => {
    if (state.tones && typeof state.tones === "object") return state.tones;
    // Migrate legacy single-value state.tone → male only; female stays at default.
    return { male: state.tone || 0, female: 0 };
  });
  // Derived: the active tone for the currently-selected gender.
  const pickTone = pickTones[pickGender] || 0;
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 640);
  // Autoplay always runs on entry; we only freeze when the player actively
  // picks a nation from the picker in this session. A persisted nation from
  // a prior visit doesn't stop the reel — it just colours the action stack.
  const [pickedInSession, setPickedInSession] = useState(false);

  const selectedNation = state.nation; // existing app state — country CODE

  // resize tracking
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Kickoff ticker (1Hz). Cheap — only the small top-right node re-renders
  // anything visible; the carousel & ghost word read other state.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const koMs = Math.max(0, KICKOFF_MS - nowMs);
  const koLive = koMs === 0;
  const koDays = Math.floor(koMs / 86400000);
  const koHrs  = Math.floor((koMs % 86400000) / 3600000);
  const koMins = Math.floor((koMs % 3600000) / 60000);
  const koSecs = Math.floor((koMs % 60000) / 1000);

  // ——— Geo-open ———
  // First-visit kindness: ask /api/geo for the visitor's country and, if it's
  // one of the 48 playing this summer, jump the reel to start on that nation.
  // Cached in localStorage so a returning fan from Norway lands on Norway with
  // no async flash. Strictly cosmetic — autoplay continues from there, and a
  // user who actively picks (pickedInSession) takes over.
  const geoJumpedRef = useRef(false);
  useEffect(() => {
    if (geoJumpedRef.current || pickedInSession) return;

    const jumpTo = (code) => {
      if (!code) return false;
      const idx = deck.findIndex((it) => it.code === code);
      if (idx < 0) return false;
      geoJumpedRef.current = true;
      setActiveIndex(idx);
      return true;
    };

    // 1) Synchronous warm-start from a previously resolved country.
    let cached = null;
    try { cached = window.localStorage.getItem("starxi.geoCode"); } catch (e) {}
    if (cached && jumpTo(cached)) return;

    // 2) Fresh fetch — ~50ms on Vercel, soft-fails everywhere else.
    let alive = true;
    fetch("/api/geo", { credentials: "omit" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive || !d || !d.country) return;
        let code = ISO_TO_CODE[d.country];
        // GB carries two qualified sides — England by default, Scotland when
        // the region header confirms it.
        if (d.country === "GB" && d.region && /SCT|SC/i.test(d.region)) code = "SCO";
        if (!code) return;
        try { window.localStorage.setItem("starxi.geoCode", code); } catch (e) {}
        jumpTo(code);
      })
      .catch(() => {});
    return () => { alive = false; };
    // Intentionally run once on mount — deck is captured fresh on first render
    // and contains every nation, so findIndex always resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pre-decode the next few upcoming figures so each frame swap is paint-only
  // — `img.decode()` resolves once the bitmap is GPU-ready, killing the
  // "jump on first show" that happens when an <img> first hits the carousel
  // still parsing the file.
  useEffect(() => {
    for (let k = 0; k < 6; k++) {
      const it = deck[activeIndex + k];
      if (!it) continue;
      const src = figureSrc(it.code, it.gender, it.code === selectedNation ? resolveTone(it.code, it.gender, pickTone) : 0);
      if (!src) continue;
      const im = new Image();
      im.decoding = "async";
      im.src = src;
      if (im.decode) im.decode().catch(() => {});
    }
  }, [activeIndex, deck, pickTones, selectedNation]);

  // When we're within half a pass of the deck's end, append a fresh shuffle
  // so the reel never has to wrap (and the next 96 contain every figure once).
  useEffect(() => {
    if (deck.length - activeIndex <= Math.floor(PASS_LEN / 2)) {
      setDeck((prev) => prev.concat(shuffleArr(ALL_PAIRS)));
    }
  }, [activeIndex, deck.length, ALL_PAIRS, PASS_LEN]);

  // Autoplay always runs while the user hasn't actively picked a nation in
  // this session — so revisits with persisted nation still feel alive.
  useEffect(() => {
    if (!playing || pickedInSession) return;
    const id = setInterval(() => setActiveIndex((p) => p + 1), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing, pickedInSession]);

  // When the player actively picks a nation, freeze the reel on it. If the
  // picked nation+gender already sits in the upcoming deck, jump to it;
  // otherwise append the entry and jump to the new last index.
  useEffect(() => {
    if (!pickedInSession || !selectedNation) return;
    const idx = deck.findIndex((d) => d.code === selectedNation && d.gender === pickGender);
    if (idx >= 0) {
      setActiveIndex(idx);
    } else {
      const appendAt = deck.length;
      setDeck((prev) => prev.concat([{ code: selectedNation, gender: pickGender }]));
      setActiveIndex(appendAt);
    }
  }, [pickedInSession, selectedNation, pickGender, deck]);

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

  // No modular wrap — the deck is monotonically growing (a chain of shuffles).
  // The four named roles map directly to absolute deck indices.
  const center = activeIndex;
  const left   = activeIndex - 1;
  const right  = activeIndex + 1;
  const back   = activeIndex + 2;

  // ——— GPU-only transitions ———
  // We only animate properties the compositor can handle without layout/paint:
  // transform (translate + scale), opacity, filter. The wrapper sits at a fixed
  // size; each role's offset & scale is encoded entirely in `transform`. That's
  // the single biggest perf win — left/bottom/height animations are dropped.
  const TR = `transform ${DUR}ms ${EASE}, opacity ${DUR}ms ${EASE}`;

  // Role descriptors. Horizontal offsets are in vw so the side figures keep a
  // consistent "% of screen width" from centre on every aspect ratio. Vertical
  // tweaks are in vh. With transform-origin at bottom-centre, scaling alone
  // keeps the feet on the same baseline as the centre figure — no dy needed
  // for the sides. Blur is dropped: it's the single most expensive composited
  // filter; the smaller scale + opacity already reads as depth.
  const slots = isMobile ? {
    center: { dxvw: 0,    dyvh: 0,   s: 1.00, op: 1,    z: 20 },
    left:   { dxvw: -28,  dyvh: 0,   s: 0.30, op: 0.55, z: 10 },
    right:  { dxvw:  28,  dyvh: 0,   s: 0.30, op: 0.55, z: 10 },
    back:   { dxvw: 0,    dyvh: -6,  s: 0.24, op: 0.32, z: 5  },
    off:    { dxvw: 0,    dyvh: -10, s: 0.18, op: 0,    z: 1  },
  } : {
    center: { dxvw: 0,    dyvh: 0,   s: 1.00, op: 1,    z: 20 },
    left:   { dxvw: -28,  dyvh: 0,   s: 0.40, op: 0.55, z: 10 },
    right:  { dxvw:  28,  dyvh: 0,   s: 0.40, op: 0.55, z: 10 },
    back:   { dxvw: 0,    dyvh: -8,  s: 0.34, op: 0.32, z: 5  },
    off:    { dxvw: 0,    dyvh: -12, s: 0.25, op: 0,    z: 1  },
  };

  const slotFor = (i) =>
    i === center ? slots.center :
    i === left   ? slots.left   :
    i === right  ? slots.right  :
    i === back   ? slots.back   :
    slots.off;

  const baseStyle = {
    position: "absolute",
    left: "50%",
    bottom: isMobile ? "12%" : "6%",
    height: isMobile ? "82%" : "94%",
    aspectRatio: "0.6667 / 1",
    transformOrigin: "50% 100%",
    transition: TR,
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  };

  const roleStyle = (i) => {
    const s = slotFor(i);
    // Only mark the visible-or-incoming items as will-change. Marking all 20
    // would keep every figure in its own compositor layer permanently, which
    // is more layer-management overhead than it's worth.
    const active = s.op > 0;
    return {
      ...baseStyle,
      zIndex: s.z,
      opacity: s.op,
      transform: `translate3d(calc(-50% + ${s.dxvw}vw), ${s.dyvh}vh, 0) scale(${s.s})`,
      willChange: active ? "transform, opacity" : "auto",
    };
  };

  const active = deck[activeIndex] || deck[0];
  const activeCode = active.code;
  const activeNation = window.NATIONS.find((n) => n.code === activeCode) || window.NATIONS[0];
  const bg = NATION_BG[activeCode] || "#15161B";

  // Keep body + .app background in sync with the nation colour so no dark bleed
  // shows around/below the landing div on any viewport size.
  useEffect(() => {
    document.body.style.background = bg;
    const app = document.querySelector(".app");
    if (app) app.style.background = bg;
    return () => {
      document.body.style.background = "";
      const a = document.querySelector(".app");
      if (a) a.style.background = "";
    };
  }, [bg]);

  const ghost = NATION_NICK[activeCode] || activeNation.name.toUpperCase();
  const factParts = [
    activeNation.group ? `GROUP ${activeNation.group}` : null,
    activeNation.rank ? `FIFA #${activeNation.rank}` : null,
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
    setPickedInSession(true);
    setPickerOpen(false);
  };
  const setGender = (g) => {
    setPickGender(g);
    setState((s) => ({ ...s, gender: g }));
  };
  const setTone = (t) => {
    setPickTones((prev) => {
      const next = { ...prev, [pickGender]: t };
      setState((s) => ({ ...s, tones: next }));
      return next;
    });
  };

  return (
    <div className="starxi-landing" style={{
      backgroundColor: bg,
      transition: `background-color ${DUR}ms ${EASE}`,
      fontFamily: "Inter, sans-serif",
      position: "relative", width: "100%", overflow: "hidden",
      height: "100vh", minHeight: 560,
      // Promote the whole landing to a layer so the bg color transition is
      // GPU-rasterised instead of triggering full-page repaints.
      willChange: "background-color",
      contain: "layout paint",
    }}>
      {/* grain */}
      <div style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 50, opacity: 0.4,
        backgroundImage: `url("${GRAIN}")`, backgroundSize: "200px 200px", backgroundRepeat: "repeat"
      }} />

      {/* ghost nickname — vertically centred on the viewport, behind the figure */}
      <div style={{
        position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
        pointerEvents: "none", userSelect: "none", zIndex: 2
      }}>
        <span style={{
          fontFamily: "Anton, sans-serif", fontSize: `${ghostSize}px`, fontWeight: 900,
          color: "#fff", opacity: 1, lineHeight: 1, textTransform: "uppercase",
          letterSpacing: "-0.02em", whiteSpace: "nowrap"
        }}>{ghost}</span>
      </div>

      {/* brand — top center (shared lockup; identical on every screen) */}
      <BrandLockup />

      {/* top-right: log in */}
      <LandingTopRight />

      {/* carousel — every deck wrapper stays mounted so CSS transitions are
          never torn by mid-flight React mount/unmount. Only items within the
          visible window get an actual <img src>; everything else renders an
          empty wrapper at "off" role (opacity 0, scale 0.25 — essentially
          free in the compositor). The wrapper keys are the absolute deck
          index, so each item keeps the same DOM node across renders. */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3,
        contain: "layout paint",
      }}>
        {deck.map((it, i) => {
          const inWindow = i >= activeIndex - 2 && i <= activeIndex + 4;
          const src = inWindow ? figureSrc(it.code, it.gender, it.code === selectedNation ? resolveTone(it.code, it.gender, pickTone) : 0) : null;
          const isCenter = i === center;
          const slug = FIG_SLUG[it.code] + "_" + (it.gender === "female" ? "f" : "m");
          const fix = src ? figureTransform(slug) : null;
          return (
            <div key={i} style={roleStyle(i)}>
              {src && (
                <img
                  src={src}
                  draggable="false"
                  alt={it.code}
                  loading="eager"
                  decoding="async"
                  fetchpriority={isCenter ? "high" : "low"}
                  style={{
                    width: "100%", height: "100%",
                    objectFit: "contain", objectPosition: "bottom center",
                    filter: isCenter ? "drop-shadow(0 30px 40px rgba(0,0,0,0.28))" : "none",
                    // Per-figure transform centres the alpha-centroid under
                    // the logo and normalises body height. Origin lives at
                    // the figure's feet so feet stay locked to the baseline.
                    transformOrigin: fix ? fix.transformOrigin : "50% 100%",
                    transform: fix ? fix.transform : "translateZ(0)",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* bottom-left: nation name + group/fact */}
      <div style={{
        position: "absolute", bottom: "calc(18px + env(safe-area-inset-bottom, 0px))", left: "calc(16px + env(safe-area-inset-left, 0px))", zIndex: 60, maxWidth: 540, pointerEvents: "none"
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
        position: "absolute", left: "calc(16px + env(safe-area-inset-left, 0px))",
        bottom: isMobile ? "calc(96px + env(safe-area-inset-bottom, 0px))" : 144, zIndex: 60,
        display: "flex", flexDirection: "column", alignItems: "stretch", gap: 9,
        width: "min(330px, 80vw)"
      }}>
        {pickedInSession && selectedNation && (
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

            {/* skin-tone swatches — only for nations with variants on disk.
                The swatch nearest this figure's natural skin is pre-selected and
                loads the original render; the others load generated variants. */}
            {TONE_NATIONS.has(selectedNation) && (() => {
              const effTone = resolveTone(selectedNation, pickGender, pickTone);
              return (
              <div style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 10px", borderRadius: 999,
                border: "2px solid rgba(255,255,255,0.85)",
                background: "rgba(255,255,255,0.14)",
                backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
                boxShadow: "0 14px 34px rgba(0,0,0,0.22)"
              }}>
                <span style={{
                  color: "#fff", fontSize: 9, fontWeight: 800, letterSpacing: "0.14em",
                  textTransform: "uppercase", opacity: 0.85, whiteSpace: "nowrap"
                }}>Skin</span>
                {SKIN_TONES.map((t) => {
                  const on = effTone === t.id;
                  return (
                    <button key={t.id} onClick={() => setTone(t.id)} title={"Tone " + t.id}
                      style={{
                        width: 26, height: 26, borderRadius: 999, cursor: "pointer", padding: 0, flex: "0 0 auto",
                        background: t.color,
                        border: on ? "2.5px solid #fff" : "2px solid rgba(255,255,255,0.3)",
                        boxShadow: on ? "0 0 0 2px rgba(0,0,0,0.22)" : "none",
                        transition: "transform 120ms, border-color 120ms",
                        transform: on ? "scale(1.14)" : "scale(1)"
                      }} />
                  );
                })}
              </div>
              );
            })()}

            <div style={{ position: "relative" }}>
              {/* left-pointing chevrons, outside the button to the right */}
              <div aria-hidden="true" style={{
                position: "absolute", right: -36, top: "50%", transform: "translateY(-50%)",
                display: "flex", flexDirection: "row", alignItems: "center",
                pointerEvents: "none"
              }}>
                {[0, 1, 2].map((i) => (
                  <svg key={i} width="14" height="26" viewBox="0 0 14 26" fill="none"
                    style={{
                      marginLeft: i === 0 ? 0 : -5,
                      animation: `hintChev 1.6s ease-in-out ${(2 - i) * 0.18}s infinite`,
                      filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.28))"
                    }}>
                    <path d="M11 3 L3 13 L11 23" stroke="#fff" strokeWidth="3"
                          strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ))}
              </div>

              <button onClick={onNext}
                style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                  padding: "14px 24px", borderRadius: 999, cursor: "pointer",
                  border: "2px solid #fff", background: "#fff", color: bg,
                  fontSize: 15, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase",
                  boxShadow: "0 14px 34px rgba(0,0,0,0.28)", transition: "transform 140ms"
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.02)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}>
                Build my Star XI
              </button>
            </div>
          </React.Fragment>
        )}

        {/* Hint: when no nation is picked yet, draw three down-chevrons above
            the CTA and run a soft halo pulse on the button itself. Disappears
            the moment the user picks a nation — the rest of the journey is
            self-explanatory after that. */}
        {!(pickedInSession && selectedNation) && (
          <div aria-hidden="true" style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            marginBottom: 2, pointerEvents: "none"
          }}>
            {[0, 1, 2].map((i) => (
              <svg key={i} width="46" height="14" viewBox="0 0 46 14" fill="none"
                style={{
                  marginTop: i === 0 ? 0 : -6,
                  animation: `hintChev 1.6s ease-in-out ${i * 0.18}s infinite`,
                  filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.28))"
                }}>
                <path d="M3 3 L23 11 L43 3" stroke="#fff" strokeWidth="3"
                      strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ))}
          </div>
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
          {pickedInSession && selectedNation ? "Change nation" : "Pick your nation"}
        </button>
      </div>

      {/* picker overlay */}
      {pickerOpen && (
        <div onClick={closePicker} style={{
          position: "absolute", inset: 0, zIndex: 100, display: "flex",
          alignItems: "flex-end", justifyContent: "center", paddingBottom: 64,
          background: "rgba(0,0,0,0.35)"
        }}>
          <div onClick={(e) => e.stopPropagation()} style={{
            position: "relative", width: "min(1500px, 96%)", maxHeight: "72vh",
            display: "flex", flexDirection: "column",
            borderRadius: 22, overflow: "hidden",
            animation: "pickerIn 240ms cubic-bezier(0.2,0.8,0.2,1)",
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(17,18,23,0.97)",
            backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
            boxShadow: "0 -20px 60px rgba(0,0,0,0.5)"
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
                <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
                  {filtered.map((n) => {
                    const isSel = n.code === selectedNation;
                    return (
                      <button key={n.code} title={n.name} onClick={() => setNation(n.code)}
                        onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.13)"; }}
                        onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                        style={{
                          display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                          padding: "8px 4px 6px", borderRadius: 9, cursor: "pointer",
                          border: isSel ? "2px solid #fff" : "1.5px solid rgba(255,255,255,0.12)",
                          background: isSel ? "#fff" : "rgba(255,255,255,0.06)",
                          transition: "background 140ms, border-color 140ms"
                        }}>
                        <span style={{ fontSize: 17, lineHeight: 1, fontFamily: '"Twemoji Country Flags", "Inter", system-ui, sans-serif' }}>{n.flag}</span>
                        <span style={{
                          fontFamily: "Anton, sans-serif", fontSize: 9, letterSpacing: "0.03em",
                          color: isSel ? "#14141A" : "#fff", textTransform: "uppercase",
                          textAlign: "center", lineHeight: 1.2, wordBreak: "break-word"
                        }}>{n.name}</span>
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
        @keyframes pickerIn { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes hintChev {
          0%   { opacity: 0.15; transform: translateY(-4px); }
          50%  { opacity: 1;    transform: translateY(0); }
          100% { opacity: 0.15; transform: translateY(4px); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes hintChev { 0%,100% { opacity: 0.6; transform: none; } }
        }
      `}</style>
    </div>
  );
}

// Expose the nation maps so the step shell can wash the field + show the ghost
// nickname on every screen, matching the landing.
window.NATION_BG = NATION_BG;
window.NATION_NICK = NATION_NICK;
window.FIG_SLUG = FIG_SLUG;
window.figureSrc = figureSrc;
window.figureTransform = figureTransform;
window.Welcome = Welcome;
