#!/usr/bin/env node
/**
 * apply-id-report.mjs — write id-report.json into titles/<slug>.json.
 *
 * Authoritative for every title present in the report: ids not present in the
 * final decision are cleared (so a refined report removes earlier wrong ids).
 * Titles not in the report (the ids that existed before the resolver ran) are
 * left untouched and get `tmdbSide: "tv"` when missing.
 *
 * Usage:
 *   node apply-id-report.mjs [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLES_DIR = path.join(here, "titles");
const REPORT_FILE = path.join(here, "id-report.json");

const CLEAR_FLAGS = new Set([
  "id-from-anilist-fribb",
  "ids-unverified-upstream",
  "id-ambiguous",
  "id-not-found",
  "id-format-mismatch",
  "id-format-relaxed",
]);

function clearIdFlags(flags) {
  return new Set(
    flags.filter(
      (flag) =>
        !CLEAR_FLAGS.has(flag) &&
        !flag.startsWith("id-episode-mismatch:") &&
        !flag.startsWith("tmdb-id-later-season:"),
    ),
  );
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  const byFile = new Map(report.items.map((item) => [item.file, item]));
  const allFiles = fs.readdirSync(TITLES_DIR).filter((name) => name.endsWith(".json")).sort();

  // Ids already owned by titles outside the report (the pre-existing 20) win.
  const usedMal = new Map();
  const usedTmdb = new Map();
  for (const file of allFiles) {
    if (byFile.has(file)) continue;
    const title = JSON.parse(fs.readFileSync(path.join(TITLES_DIR, file), "utf8"));
    if (title.malId != null) usedMal.set(title.malId, file);
    if (title.tmdbId != null) usedTmdb.set(title.tmdbId, file);
  }

  let written = 0;
  let malOnly = 0;
  let unresolved = 0;

  for (const file of allFiles) {
    const filePath = path.join(TITLES_DIR, file);
    const title = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const item = byFile.get(file);

    if (!item) {
      if (title.tmdbId != null && title.tmdbSide == null) title.tmdbSide = "tv";
      if (!dryRun) fs.writeFileSync(filePath, `${JSON.stringify(title, null, 2)}\n`, "utf8");
      continue;
    }

    const flags = clearIdFlags(title.review.flags ?? []);
    title.malId = null;
    title.tmdbId = null;
    title.tmdbSide = null;

    if (item.status === "matched" || item.status === "matched-mal-only") {
      const chosen = item.chosen ?? {};
      if (chosen.malId != null && !usedMal.has(chosen.malId)) {
        title.malId = chosen.malId;
        usedMal.set(chosen.malId, file);
      } else if (chosen.malId != null) {
        flags.add(`mal-id-duplicate-of:${usedMal.get(chosen.malId).replace(/\.json$/, "")}`);
      }
      if (chosen.tmdbId != null && !usedTmdb.has(chosen.tmdbId)) {
        title.tmdbId = chosen.tmdbId;
        title.tmdbSide = chosen.tmdbSide;
        usedTmdb.set(chosen.tmdbId, file);
      } else if (chosen.tmdbId != null) {
        flags.add(`tmdb-id-duplicate-of:${usedTmdb.get(chosen.tmdbId).replace(/\.json$/, "")}`);
      }
      flags.add("id-from-anilist-fribb");
      flags.add("ids-unverified-upstream");
      if (item.formatRelaxed || chosen.relaxedFormat) flags.add("id-format-relaxed");
      if (chosen.episodes != null && chosen.episodes !== title.totalEpisodes) {
        flags.add(`id-episode-mismatch:${chosen.episodes}vs${title.totalEpisodes}`);
      }
      if (chosen.tmdbSide === "tv" && chosen.seasonTmdb !== 1) {
        flags.add(`tmdb-id-later-season:${chosen.seasonTmdb ?? "unknown"}`);
      }
      if (item.status === "matched-mal-only") malOnly += 1;
      else written += 1;
    } else if (item.status === "ambiguous") {
      flags.add("id-ambiguous");
      unresolved += 1;
    } else if (item.status === "format-mismatch") {
      flags.add("id-format-mismatch");
      unresolved += 1;
    } else {
      flags.add("id-not-found");
      unresolved += 1;
    }

    title.review.flags = [...flags];
    if (!dryRun) fs.writeFileSync(filePath, `${JSON.stringify(title, null, 2)}\n`, "utf8");
  }

  console.log(
    `${dryRun ? "DRY RUN" : "applied"}: tmdb=${written} mal-only=${malOnly} unresolved=${unresolved}`,
  );
}

main();
