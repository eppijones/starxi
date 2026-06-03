// STAR XI '26 — global music player (Minimal variant from the design bundle)
//
// Bottom-right corner: a transparent music icon + a clear mute toggle.
// Tapping the icon opens a glass popover with transport + volume.
// Audio engine is a single <audio> element shared across the whole app.

// Order = default rotation (autoplay walks the list, loops back to top).
// First track plays first; Trophy Parade also has a special trigger when the
// user lands on the summary step.
const TRACKS = [
  { title: "Gol de Esperança",  artist: "STAR XI Anthems", src: "assets/audio/gol-de-esperanca.mp3" },
  { title: "Kickoff in Gold",   artist: "STAR XI Anthems", src: "assets/audio/kickoff-in-gold.mp3" },
  { title: "Aço Bilhete Leve",  artist: "STAR XI Anthems", src: "assets/audio/aco-bilhete-leve.mp3" },
  { title: "Stadium Citrus",    artist: "STAR XI Anthems", src: "assets/audio/stadium-citrus.mp3" },
  { title: "Stadium Tamborim",  artist: "STAR XI Anthems", src: "assets/audio/stadium-tamborim.mp3" },
  { title: "Trophy Parade",     artist: "STAR XI Anthems", src: "assets/audio/trophy-parade.mp3" },
];

const SUMMARY_STEP = "confirm";
const TROPHY_TITLE = "Trophy Parade";

const MP_ICO = {
  note:  (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M9 18a3 3 0 1 1-2-2.83V6.2a1 1 0 0 1 .76-.97l9-2.25A1 1 0 0 1 18 4v10a3 3 0 1 1-2-2.83V8.28l-7 1.75V18Z"/></svg>,
  play:  (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.78-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z"/></svg>,
  pause: (s = 20) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>,
  prev:  (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M7 6a1 1 0 0 1 2 0v4.4l8.3-5.27A1 1 0 0 1 19 6v12a1 1 0 0 1-1.7.72L9 13.6V18a1 1 0 0 1-2 0V6Z"/></svg>,
  next:  (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor"><path d="M17 6a1 1 0 0 0-2 0v4.4L6.7 5.13A1 1 0 0 0 5 6v12a1 1 0 0 0 1.7.72L15 13.6V18a1 1 0 0 0 2 0V6Z"/></svg>,
  vol:   (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" stroke="none"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 6a8 8 0 0 1 0 12"/></svg>,
  mute:  (s = 18) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" stroke="none"/><path d="m17 9 5 5M22 9l-5 5"/></svg>,
  close: (s = 16) => <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>,
};

function mpFmt(t) {
  if (!t || isNaN(t)) return "0:00";
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m + ":" + String(s).padStart(2, "0");
}

function MpEq({ playing, color = "#fff", h = 16 }) {
  const bars = [0, 1, 2, 3];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2.5, height: h }}>
      {bars.map(i => (
        <span key={i} style={{
          width: 3, height: h, background: color, borderRadius: 2,
          transformOrigin: "bottom", display: "block",
          animation: playing ? `mpEqBar 0.9s ease-in-out ${i * 0.14}s infinite` : "none",
          transform: playing ? undefined : "scaleY(0.3)",
          opacity: playing ? 1 : 0.5,
        }} />
      ))}
    </div>
  );
}

function MusicPlayer({ step }) {
  const audioRef = useRef(null);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.2);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [engaged, setEngaged] = useState(false);
  const [open, setOpen] = useState(false);
  // Tracks whether the user has ever interacted with the mute/volume button.
  // The mute button pulses while music is playing AND this is false, hinting
  // "you can mute here." Stops pulsing after first interaction.
  const [muteHinted, setMuteHinted] = useState(false);

  // Find the topright slot that StepShell renders. When available the two
  // action buttons are portaled there so they share row 2 with History,
  // giving a consistent 3+3 icon grid on mobile.
  const [mpSlot, setMpSlot] = useState(null);
  useEffect(() => {
    const slot = document.getElementById('shell-mp-slot');
    setMpSlot(slot || null);
  }, []);

  // ——— Summary-step: jump to Trophy Parade ———
  // Ref starts null so a fresh mount already on the summary step still fires.
  const prevStep = useRef(null);
  useEffect(() => {
    if (step === SUMMARY_STEP && prevStep.current !== SUMMARY_STEP) {
      const tIdx = TRACKS.findIndex(t => t.title === TROPHY_TITLE);
      if (tIdx !== -1) setIdx(tIdx);
    }
    prevStep.current = step;
  }, [step]);

  // The player WANTS to be playing unless the user explicitly pauses. We track
  // that intent in a ref so async callbacks always read the latest value
  // without re-subscribing. Mute does NOT clear intent (muted audio is still
  // "playing"); only the pause button does.
  const wantPlayRef = useRef(true);

  // ——— Build the audio element once; make playback start no matter what ———
  // Browsers block autoplay-with-sound on a fresh visit until the user has
  // interacted with the page. So we use a two-pronged start:
  //   1. Optimistic autoplay once the audio is buffered (works when the browser
  //      already remembers engagement on this origin — e.g. a refresh).
  //   2. A one-time GLOBAL first-gesture fallback: the moment the user clicks,
  //      taps, presses a key, or scrolls ANYWHERE, we start the music. This is
  //      the only reliable way around the autoplay block, so the player is
  //      effectively "always on" the instant the visitor does anything.
  // A watchdog also resumes playback if the browser pauses us while we still
  // intend to play (e.g. returning to a backgrounded tab), but never fights an
  // explicit user pause.
  useEffect(() => {
    const a = new Audio();
    a.src = TRACKS[0].src;
    a.volume = 0.2;
    a.preload = "auto";
    a.loop = false;
    audioRef.current = a;
    let active = true;

    const onTime = () => setCur(a.currentTime);
    const onMeta = () => setDur(a.duration || 0);
    const onEnd  = () => setIdx(p => (p + 1) % TRACKS.length);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("ended", onEnd);

    // Attempt to start playback. Resolves true on success, false if blocked.
    const kick = () => {
      if (!active) return Promise.resolve(false);
      return a.play()
        .then(() => { if (active) { setPlaying(true); setEngaged(true); } return true; })
        .catch(() => false);
    };

    // One-time global gesture unlock — fires on the user's very first
    // interaction, then detaches itself once playback actually starts.
    const GESTURES = ["pointerdown", "touchstart", "keydown", "click", "scroll"];
    const detachGestures = () =>
      GESTURES.forEach(e => window.removeEventListener(e, onGesture, true));
    const onGesture = () => {
      if (!active || !wantPlayRef.current) return;
      kick().then(ok => { if (ok) detachGestures(); });
    };
    GESTURES.forEach(e => window.addEventListener(e, onGesture, true));

    // Optimistic autoplay once the element is ready.
    const tryAutoplay = () => {
      a.removeEventListener("canplay", tryAutoplay);
      kick().then(ok => { if (ok) detachGestures(); });
    };
    a.addEventListener("canplay", tryAutoplay);
    if (a.readyState >= 3) tryAutoplay();

    // Watchdog: if the browser pauses us while we still intend to play (tab
    // backgrounding, audio-focus loss, etc.), nudge it back. Guarded by
    // wantPlayRef so a deliberate pause is respected, and by a.ended /
    // a.seeking so the load()/ended transitions don't trigger a fight.
    const onPause = () => {
      if (!active || !wantPlayRef.current || a.ended || a.seeking) return;
      kick();
    };
    a.addEventListener("pause", onPause);

    return () => {
      active = false;
      detachGestures();
      a.pause();
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("canplay", tryAutoplay);
      a.removeEventListener("pause", onPause);
    };
  }, []);

  // ——— Swap source when track changes; resume if already playing ———
  // Waits for canplay before calling play() — calling it synchronously right
  // after load() races the network fetch and the play promise can silently
  // resolve while still paused.
  useEffect(() => {
    const a = audioRef.current; if (!a) return;
    // Resume on the new track if we were playing, OR if intent says we want to
    // (covers next/prev clicked before autoplay had unblocked).
    const wasPlaying = !a.paused || playing || wantPlayRef.current;
    a.src = TRACKS[idx].src;
    a.load();
    setCur(0);
    if (!wasPlaying) return;
    let done = false;
    const start = () => {
      if (done) return; done = true;
      a.removeEventListener("canplay", start);
      a.play().then(() => setPlaying(true)).catch(() => {});
    };
    a.addEventListener("canplay", start);
    return () => { done = true; a.removeEventListener("canplay", start); };
  }, [idx]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);
  useEffect(() => { if (audioRef.current) audioRef.current.muted = muted; }, [muted]);

  const play = () => {
    const a = audioRef.current; if (!a) return;
    wantPlayRef.current = true;
    a.play().then(() => { setPlaying(true); setEngaged(true); }).catch(() => {});
  };
  // Explicit user pause — clears intent so the watchdog leaves it stopped.
  const pause = () => { const a = audioRef.current; if (a) { wantPlayRef.current = false; a.pause(); setPlaying(false); } };
  const toggle = () => { const a = audioRef.current; if (!a) return; a.paused ? play() : pause(); };
  const next = () => { wantPlayRef.current = true; setEngaged(true); setIdx(p => (p + 1) % TRACKS.length); };
  const prev = () => { wantPlayRef.current = true; setEngaged(true); setIdx(p => (p - 1 + TRACKS.length) % TRACKS.length); };
  const seek = (frac) => { const a = audioRef.current; if (a && a.duration) { a.currentTime = frac * a.duration; setCur(a.currentTime); } };
  // Mark mute as hinted on first interaction so the pulse stops.
  const toggleMute = () => { setMuted(m => !m); setMuteHinted(true); };

  const track = TRACKS[idx];
  const pct = dur ? (cur / dur) * 100 : 0;
  const accent = "var(--nation, #0B7A3E)";

  // Pulse rules:
  //   Music icon  — only when autoplay was blocked (!engaged) so user knows to click to start.
  //   Volume/mute — when music is playing and user hasn't touched the mute control yet.
  const musicIconPulse = !engaged && !open;
  const muteBtnPulse   = playing && !muteHinted;

  // Two compact shell-util buttons portaled into #shell-mp-slot on mobile.
  const slotButtons = (
    <>
      <button
        className="shell-util shell-util-music"
        onClick={() => { if (!engaged) play(); setOpen(o => !o); }}
        title="Music player"
        aria-label="Music player"
        aria-expanded={open}
      >
        {playing && !muted ? <MpEq playing={true} h={14} /> : MP_ICO.note(16)}
      </button>
      <button
        className={"shell-util shell-util-mute" + (muted ? " on" : "")}
        onClick={toggleMute}
        title={muted ? "Unmute" : "Mute"}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? MP_ICO.mute(16) : MP_ICO.vol(16)}
      </button>
    </>
  );

  return (
    <>
    <div className={"mp-root" + (mpSlot ? " mp-has-slot" : "")} style={{
      position: "fixed", right: 28, bottom: 18, zIndex: 80,
      display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 12,
    }}>
      {open && (
        <div style={{
          width: 288, padding: "16px 16px 18px", borderRadius: 20,
          background: "rgba(255,255,255,0.13)",
          border: "1.5px solid rgba(255,255,255,0.5)",
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
          boxShadow: "0 22px 50px rgba(0,0,0,0.32)", color: "#fff",
          animation: "mpPopIn 220ms cubic-bezier(.2,.8,.2,1)",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.22em", opacity: 0.78, textTransform: "uppercase" }}>Now Playing</span>
            <button className="mp-btn" onClick={() => setOpen(false)} style={{ opacity: 0.7, width: 22, height: 22 }}>{MP_ICO.close(14)}</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <MpEq playing={playing && !muted} h={20} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display, Anton), sans-serif", fontSize: 20, lineHeight: 1, letterSpacing: "0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track.title}</div>
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 3, letterSpacing: "0.04em" }}>{track.artist}</div>
            </div>
          </div>

          <div
            onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); seek((e.clientX - r.left) / r.width); }}
            style={{ height: 4, borderRadius: 99, background: "rgba(255,255,255,0.25)", cursor: "pointer", marginBottom: 6 }}
          >
            <div style={{ width: pct + "%", height: "100%", borderRadius: 99, background: "#fff" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.7, marginBottom: 12, fontVariantNumeric: "tabular-nums" }}>
            <span>{mpFmt(cur)}</span><span>{mpFmt(dur)}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginBottom: 16 }}>
            <button className="mp-btn" onClick={prev} style={{ opacity: 0.85 }}>{MP_ICO.prev(20)}</button>
            <button className="mp-btn" onClick={toggle} style={{ width: 46, height: 46, borderRadius: 99, background: "#fff", color: accent }}>
              {playing ? MP_ICO.pause(22) : MP_ICO.play(22)}
            </button>
            <button className="mp-btn" onClick={next} style={{ opacity: 0.85 }}>{MP_ICO.next(20)}</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button className="mp-btn" onClick={toggleMute} style={{ width: 22, height: 22, opacity: 0.9 }}>
              {muted ? MP_ICO.mute(18) : MP_ICO.vol(18)}
            </button>
            <input
              className="mp-range" type="range" min="0" max="100"
              value={muted ? 0 : Math.round(volume * 100)}
              onChange={(e) => { const v = +e.target.value / 100; setVolume(v); if (muted && v > 0) toggleMute(); setMuteHinted(true); }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 10, opacity: 0.7, width: 30, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{muted ? 0 : Math.round(volume * 100)}%</span>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Music icon — opens the popover. Pulses only as a fallback when
            autoplay was blocked and the user hasn't started playback yet. */}
        <button
          onClick={() => { if (!engaged) play(); setOpen(o => !o); }}
          title="Music"
          aria-label="Music player"
          style={{
            width: 52, height: 52, borderRadius: 99, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
            background: "rgba(255,255,255,0.10)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            transition: "background 160ms", position: "relative",
            animation: musicIconPulse ? "mpHintPulse 2.2s ease-in-out infinite" : "none",
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
          onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.10)"}
        >
          {playing && !muted ? <MpEq playing={true} h={16} /> : MP_ICO.note(20)}
        </button>

        {/* Volume / mute — pulses while music is playing to hint it's here. */}
        <button
          onClick={toggleMute}
          title={muted ? "Unmute" : "Mute"}
          aria-label={muted ? "Unmute" : "Mute"}
          style={{
            width: 52, height: 52, borderRadius: 99, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: muted ? accent : "#fff",
            background: muted ? "#fff" : "rgba(255,255,255,0.10)",
            border: "1.5px solid rgba(255,255,255,0.5)",
            backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
            transition: "all 160ms",
            animation: muteBtnPulse ? "mpHintPulse 2.2s ease-in-out infinite" : "none",
          }}
        >
          {muted ? MP_ICO.mute(20) : MP_ICO.vol(20)}
        </button>
      </div>
    </div>
    {mpSlot && ReactDOM.createPortal(slotButtons, mpSlot)}
    </>
  );
}

window.MusicPlayer = MusicPlayer;
