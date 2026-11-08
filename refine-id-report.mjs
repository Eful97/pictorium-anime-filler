#!/usr/bin/env node
/**
 * refine-id-report.mjs — apply Fribb season/format rules to id-report.json.
 *
 * Rules:
 * - A TV TMDB id is written only when the matched AniList entry is TMDB
 *   season 1 (`season.tmdb === 1`). Later seasons keep the MAL id but not the
 *   TMDB id, because local `1..n` numbering would be offset.
 * - A movie TMDB id is written when the title expects a film/OVA and Fribb
 *   carries a `themoviedb_id.movie` (scalar or array).
 * - A match whose AniList format is outside the title's expected family
 *   (e.g. a TV series chosen for an "OADs" page) is rejected entirely.
 *
 * Usage:
 *   node refine-id-report.mjs --fribb /tmp/anime-list-full.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPORT_FILE = path.join(here, "id-report.json");
const SKIP = /\b(Films?|OVAs?|OADs?|Specials?|Movies?)\b/i;

function expectedFormats(title, slug) {
  if (SKIP.test(title)) return new Set(["MOVIE", "OVA", "ONA", "SPECIAL"]);
  if (/-tv$/.test(String(slug ?? ""))) return new Set(["TV", "TV_SHORT"]);
  if (/(^|-)(ova|oad|special)s?(-|$)/.test(String(slug ?? ""))) return new Set(["OVA", "ONA", "SPECIAL"]);
  return new Set(["TV", "TV_SHORT", "ONA"]);
}

function episodesClose(chosen, totalEpisodes) {
  if (chosen?.episodes == null) return false;
  const tolerance = Math.max(1, Math.round(totalEpisodes * 0.02));
  return Math.abs(chosen.episodes - totalEpisodes) <= tolerance;
}

function scalar(value) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function main(argv) {
  const index = argv.indexOf("--fribb");
  if (index === -1) {
    console.error("INVALID INPUT: --fribb <anime-list-full.json> is required");
    process.exitCode = 2;
    return;
  }
  const fribb = JSON.parse(fs.readFileSync(path.resolve(argv[index + 1]), "utf8"));
  const byAnilist = new Map(fribb.filter((record) => record.anilist_id).map((record) => [record.anilist_id, record]));

  const report = JSON.parse(fs.readFileSync(REPORT_FILE, "utf8"));
  for (const item of report.items) {
    if (item.status !== "matched" || !item.chosen) continue;
    const chosen = item.chosen;
    const formats = expectedFormats(item.title, item.slug);
    if (!formats.has(chosen.format)) {
      if (!(chosen.relaxedFormat && episodesClose(chosen, item.totalEpisodes))) {
        item.status = "format-mismatch";
        item.reason = `AniList format ${chosen.format} does not match the page type`;
        continue;
      }
      item.formatRelaxed = true;
    }

    const record = byAnilist.get(chosen.anilistId);
    const malId = record?.mal_id ?? chosen.malId ?? null;
    const tmdb = record?.themoviedb_id;
    // Fribb omits `season` on single-season series: treat that as season 1.
    const seasonTmdb = record?.season?.tmdb ?? 1;
    let tmdbId = null;
    let tmdbSide = null;
    if (tmdb && typeof tmdb === "object") {
      const tv = scalar(tmdb.tv);
      const movie = scalar(tmdb.movie);
      if (tv != null) {
        tmdbSide = "tv";
        if (seasonTmdb === 1) tmdbId = tv;
      } else if (movie != null) {
        tmdbSide = "movie";
        tmdbId = movie;
      }
    }

    item.chosen = { ...chosen, malId, tmdbId, tmdbSide, seasonTmdb };
    if (malId == null && tmdbId == null) {
      item.status = "no-fribb-ids";
    } else if (tmdbId == null && tmdbSide === "tv" && seasonTmdb !== 1) {
      item.status = "matched-mal-only";
    }
  }

  const items = report.items;
  report.counts = {
    pending: items.length,
    matched: items.filter((item) => item.status === "matched" || item.status === "matched-mal-only").length,
    tmdb: items.filter((item) => item.chosen?.tmdbId != null).length,
    malOnly: items.filter((item) => item.status === "matched-mal-only").length,
    ambiguous: items.filter((item) => item.status === "ambiguous").length,
    notFound: items.filter((item) => ["not-found", "no-fribb-ids", "format-mismatch"].includes(item.status)).length,
    formatMismatch: items.filter((item) => item.status === "format-mismatch").length,
  };

  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.counts));
}

main(process.argv);
