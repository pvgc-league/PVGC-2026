/**
 * _season-hcp.cjs — Reads DEFAULT_HCP straight out of a season's constants file.
 *
 * The constants files are ESM with extensionless imports, so plain `require` can't
 * load them and adding a build step to a one-line push script isn't worth it. This
 * pulls just the DEFAULT_HCP literal out of the source text instead.
 *
 * The point is that push scripts never carry their own copy of the handicaps.
 * push2026.cjs used to, and it drifted from league_2026.js by 8 players — re-running
 * it would have silently reset them to pre-season values.
 */
const fs = require("fs");
const path = require("path");

function loadDefaultHcp(year) {
  const file = path.join(__dirname, "..", "src", "constants", `league_${year}.js`);
  if (!fs.existsSync(file)) throw new Error(`No constants file for ${year}: ${file}`);

  const src = fs.readFileSync(file, "utf8");
  const m = src.match(/DEFAULT_HCP\s*=\s*(\{[\s\S]*?\n\};)/);
  if (!m) throw new Error(`No DEFAULT_HCP found in league_${year}.js`);

  const body = m[1].replace(/;$/, "").replace(/\/\/[^\n]*/g, "");
  const hcp = eval("(" + body + ")"); // build-time only, reading our own source

  const teams = Object.keys(hcp);
  if (teams.length !== 18) throw new Error(`Expected 18 teams in league_${year}.js, got ${teams.length}`);
  for (const [t, pair] of Object.entries(hcp)) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(v => typeof v !== "number")) {
      throw new Error(`Team ${t} handicap is malformed: ${JSON.stringify(pair)}`);
    }
  }
  return hcp;
}

module.exports = { loadDefaultHcp };
