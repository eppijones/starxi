// STAR XI — opaque, stable team handle (never the raw Clerk/guest userId).
// Used so the leaderboard can offer a "drill into this team" link without ever
// exposing account ids. sha256("starxi-team:" + uid), truncated.
const crypto = require("crypto");
function teamToken(uid) {
  return crypto.createHash("sha256").update("starxi-team:" + String(uid)).digest("hex").slice(0, 16);
}
module.exports = { teamToken };
