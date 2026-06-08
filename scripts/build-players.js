// Rebuilds window.PLAYERS in festival/data.js from the verified 26-man squad
// JSON files in /tmp/wc2026/<NAT>.json. Preserves the original marquee ids +
// editorial hype; everyone else gets a collision-safe `{nat}-{lastname}` id and
// their club as hype. Run: node scripts/build-players.js
const fs = require("fs");

// ── 1. Load current data.js for GROUPS (flags) + original marquee records ──
global.window = {};
require("../festival/data.js");
const NATION = {};
window.NATIONS.forEach(n => { NATION[n.code] = { name: n.name, flag: n.flag, group: n.group }; });

const origMarquee = {};            // id -> {name,pos,hype,nat}
window.PLAYERS.filter(p => !p.id.includes("-")).forEach(p => {
  origMarquee[p.id] = { name: p.name, pos: p.pos, hype: p.hype, nat: p.nat };
});
const origIds = new Set(Object.keys(origMarquee));

// ── 2. Transliteration + slug for id generation ──
const XLIT = { "ı":"i","İ":"i","ş":"s","Ş":"s","ç":"c","Ç":"c","ğ":"g","Ğ":"g","ü":"u","Ü":"u","ö":"o","Ö":"o","ø":"o","Ø":"o","å":"a","Å":"a","æ":"ae","ð":"d","þ":"th","ñ":"n","ł":"l" };
function slug(s) {
  let out = "";
  for (const ch of s) out += (XLIT[ch] != null ? XLIT[ch] : ch);
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function lastToken(name) {
  const parts = name.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// ── 3. Build per-nation, preserving marquee, generating ids ──
const POS_ORDER = { GK: 0, DF: 1, MF: 2, FW: 3 };
const groupOrder = Object.keys(window.GROUPS);             // A..L
const natOrder = [];
groupOrder.forEach(g => window.GROUPS[g].forEach(t => natOrder.push(t.code)));

const usedIds = new Set();
function uniqueId(base) {
  let id = base, i = 2;
  while (usedIds.has(id)) id = base + (i++);
  usedIds.add(id);
  return id;
}

const out = [];                  // { nat, players: [...] }
const marqueeSeen = new Set();
const warnings = [];

natOrder.forEach(nat => {
  const file = `/tmp/wc2026/${nat}.json`;
  if (!fs.existsSync(file)) { warnings.push(`MISSING FILE: ${nat}`); return; }
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const meta = NATION[nat];
  const players = data.players.map(p => {
    // resolve marquee: explicit tag if it's an original id, else fallback by lastname+pos
    let mid = (p.marqueeId && origIds.has(p.marqueeId)) ? p.marqueeId : null;
    if (!mid) {
      const cand = [...origIds].filter(id => origMarquee[id].nat === nat &&
        slug(lastToken(origMarquee[id].name)) === slug(lastToken(p.name)) &&
        origMarquee[id].pos === p.pos && !marqueeSeen.has(id));
      if (cand.length === 1) { mid = cand[0]; warnings.push(`fallback-matched ${nat} ${p.name} -> ${mid}`); }
    }
    if (mid) {
      marqueeSeen.add(mid);
      usedIds.add(mid);
      const o = origMarquee[mid];
      return { id: mid, name: o.name, nat, flag: meta.flag, pos: o.pos, form: p.form, hype: o.hype };
    }
    const id = uniqueId(`${nat.toLowerCase()}-${slug(lastToken(p.name)) || slug(p.name)}`);
    return { id, name: p.name, nat, flag: meta.flag, pos: p.pos, form: p.form, hype: p.club };
  });
  players.sort((a, b) => (POS_ORDER[a.pos] - POS_ORDER[b.pos]) || (b.form - a.form) || a.name.localeCompare(b.name));
  out.push({ nat, name: meta.name, players });
});

// ── 4. Report marquee preservation ──
const dropped = [...origIds].filter(id => !marqueeSeen.has(id));
console.log("Nations:", out.length, "| Total players:", out.reduce((s, n) => s + n.players.length, 0));
console.log("Marquee preserved:", marqueeSeen.size, "/", origIds.size);
console.log("Marquee DROPPED (player not in their 26):", dropped.map(id => `${id}(${origMarquee[id].name})`).join(", ") || "none");
console.log("\nWarnings (" + warnings.length + "):");
warnings.forEach(w => console.log("  " + w));

// ── 5. Emit the PLAYERS array literal ──
const esc = s => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
let body = "window.PLAYERS = [\n";
out.forEach(({ nat, name, players }) => {
  body += `  // ——— ${name} (${nat}) ———\n`;
  players.forEach(p => {
    body += `  { id: "${esc(p.id)}", name: "${esc(p.name)}", nat: "${p.nat}", flag: "${p.flag}", pos: "${p.pos}", form: ${p.form}, hype: "${esc(p.hype)}" },\n`;
  });
});
body += "];";

// ── 6. Splice into festival/data.js (replace lines 116..1570, the PLAYERS block) ──
const src = fs.readFileSync("festival/data.js", "utf8").split("\n");
let start = src.findIndex(l => l.startsWith("window.PLAYERS = ["));
let end = start;
while (!src[end].startsWith("];")) end++;
const newSrc = [...src.slice(0, start), ...body.split("\n"), ...src.slice(end + 1)].join("\n");
fs.writeFileSync("festival/data.js", newSrc);
console.log(`\nReplaced data.js lines ${start + 1}..${end + 1} with ${body.split("\n").length} lines.`);
