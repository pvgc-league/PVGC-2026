import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizeMatch } from "../../src/lib/persistence.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Loads real season data from a committed archive (archives/league-<year>.json).
 *
 * Replaces the old Excel-workbook fixtures, which were 2025 exports carrying the
 * spreadsheet's manual adjustments. The archive is what the app itself produced,
 * so it round-trips through the persistence layer by construction.
 */
export function loadArchiveFixture(maxWeek = 2, year = 2026) {
  const file = path.join(ROOT, "archives", `league-${year}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing ${file} — regenerate with: node scripts/archive-season.cjs ${year}`);
  }
  const A = JSON.parse(fs.readFileSync(file, "utf8"));

  const results = {};
  for (const [id, raw] of Object.entries(A.weekScores || {})) {
    const idx = id.indexOf("_");
    const week = parseInt(raw.week ?? id.slice(0, idx), 10);
    const mk = raw.matchKey ?? id.slice(idx + 1);
    if (!week || !mk || week > maxWeek) continue;
    (results[week] ||= {})[mk] = normalizeMatch(raw);
  }

  return { league: { results, handicaps: A.league?.handicaps || {} } };
}
