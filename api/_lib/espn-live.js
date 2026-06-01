// MATCH-WATCH — ESPN public scoreboard/summary (friendlies not on football-data free tier).

const SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard";

function yyyymmdd(isoDate) {
  return String(isoDate || "").replace(/-/g, "");
}

function findNorSweEvent(events) {
  return (events || []).find((e) => {
    const n = String(e.name || "").toLowerCase();
    return (
      (n.includes("norway") && n.includes("sweden")) ||
      n.includes("sweden at norway") ||
      n.includes("norway at sweden")
    );
  });
}

function mapEspnStatus(type) {
  const state = type && type.state;
  const name = (type && type.name) || "";
  if (state === "post" || name.includes("FULL")) return "FINISHED";
  if (name.includes("HALF")) return "PAUSED";
  if (state === "in" || name.includes("HALF") || name.includes("LIVE")) {
    return name.includes("HALF") && !name.includes("FIRST") && !name.includes("SECOND")
      ? "PAUSED"
      : "IN_PLAY";
  }
  if (state === "pre") return "SCHEDULED";
  return type && type.description ? String(type.description) : "TIMED";
}

function parseEspnGoal(ev) {
  const text = String(ev.text || "");
  if (!text.startsWith("Goal!")) return null;
  const m = text.match(
    /Goal!\s+.+?\s+\d+,\s+.+?\s+\d+\.\s+(.+?)\s+\(([^)]+)\)/
  );
  if (!m) return null;
  const scorer = m[1].trim();
  const teamLabel = m[2].trim();
  let teamTla = null;
  if (/norway/i.test(teamLabel)) teamTla = "NOR";
  else if (/sweden/i.test(teamLabel)) teamTla = "SWE";

  let minute = null;
  const clock = ev.clock;
  if (clock && clock.displayValue) {
    const n = parseInt(String(clock.displayValue).replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) minute = n;
  }

  let assist = null;
  const am = text.match(/Assist[s]?:\s*([^.(]+)/i);
  if (am) assist = am[1].trim();

  return {
    minute,
    injuryTime: null,
    type: "REGULAR",
    teamTla,
    teamName: teamLabel,
    scorer,
    assist,
    score: null,
    rawText: text,
  };
}

async function fetchEspnNorSwe(isoDate) {
  const dates = yyyymmdd(isoDate);
  const boardUrl = dates
    ? `${SCOREBOARD}?dates=${dates}`
    : SCOREBOARD;
  const boardRes = await fetch(boardUrl, {
    headers: { accept: "application/json" },
  });
  if (!boardRes.ok) return null;
  const board = await boardRes.json();
  const event = findNorSweEvent(board.events);
  if (!event) return null;

  const comp = (event.competitions || [])[0] || {};
  const statusType = (comp.status && comp.status.type) || {};
  const homeC = (comp.competitors || []).find((c) => c.homeAway === "home");
  const awayC = (comp.competitors || []).find((c) => c.homeAway === "away");

  let goals = [];
  try {
    const sumRes = await fetch(
      `${SCOREBOARD.replace("scoreboard", "summary")}?event=${event.id}`,
      { headers: { accept: "application/json" } }
    );
    if (sumRes.ok) {
      const sum = await sumRes.json();
      goals = (sum.keyEvents || [])
        .filter((ev) => {
          const t = ev.type;
          const id = typeof t === "object" ? t.type || t.text : t;
          return id === "goal" || (ev.text || "").startsWith("Goal!");
        })
        .map(parseEspnGoal)
        .filter(Boolean);
    }
  } catch (e) {
    /* summary optional */
  }

  const linescore = comp.status && comp.status.period;
  const halfHome = linescore === 2 ? null : null; // ESPN HT in header sometimes

  return {
    source: "espn",
    eventId: event.id,
    match: {
      id: event.id,
      utcDate: event.date || comp.date,
      status: mapEspnStatus(statusType),
      minute: comp.status && comp.status.displayClock
        ? parseInt(String(comp.status.displayClock).replace(/[^\d]/g, ""), 10) || null
        : null,
      injuryTime: null,
      lastUpdated: new Date().toISOString(),
      competition: (event.season && event.season.slug) || "international-friendly",
      stage: "FRIENDLY",
      home: {
        tla: (homeC && homeC.team && homeC.team.abbreviation) || "NOR",
        name: (homeC && homeC.team && homeC.team.displayName) || "Norway",
      },
      away: {
        tla: (awayC && awayC.team && awayC.team.abbreviation) || "SWE",
        name: (awayC && awayC.team && awayC.team.displayName) || "Sweden",
      },
      score: {
        home: homeC ? parseInt(homeC.score, 10) : null,
        away: awayC ? parseInt(awayC.score, 10) : null,
        halfHome: null,
        halfAway: null,
        winner: null,
        duration: null,
      },
      statusDetail: statusType.description || statusType.shortDetail,
    },
    goals,
  };
}

module.exports = { fetchEspnNorSwe, parseEspnGoal };
