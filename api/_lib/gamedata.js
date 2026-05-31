// WORLD CUP XI — server-side game data loader.
//
// The tournament dataset (48 nations, 72 fixtures, the Dream XI player pool)
// lives in festival/data.js as a browser classic-script that assigns onto
// `window`. Rather than duplicate ~1500 lines (and risk the two copies drifting),
// we execute that exact file once inside a sandboxed VM with a stub `window`,
// then cache the captured globals for the lifetime of the warm Lambda.
//
// data.js is OUR trusted, version-controlled file (never user input) and does no
// I/O at load — it only builds plain data — so running it in a vm is safe.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let CACHE = null;

function loadGameData() {
  if (CACHE) return CACHE;
  const file = path.join(__dirname, "..", "..", "festival", "data.js");
  const code = fs.readFileSync(file, "utf8");
  // A fresh VM context gets its own standard intrinsics (Object, Array, Math,
  // JSON, Date, ...); we only need to provide the `window` data.js writes to.
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "data.js", timeout: 5000 });
  const w = sandbox.window;
  CACHE = {
    GROUPS: w.GROUPS || {},
    NATIONS: w.NATIONS || [],
    PLAYERS: w.PLAYERS || [],
    FIXTURES: w.FIXTURES || [],
  };
  return CACHE;
}

module.exports = { loadGameData };
