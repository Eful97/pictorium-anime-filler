#!/usr/bin/env node
/**
 * to-pictorium-snapshot.mjs — convert this own filler DB into the Pictorium
 * anime-filler snapshot format (schemaVersion 2).
 *
 * Usage:
 *   node to-pictorium-snapshot.mjs [--input db.json] [--output anime-filler-own-map.json]
 *
 * Only titles carrying a positive `tmdbId` can be emitted: Pictorium indexes
 * classifications by TMDB id (and MAL id). Every title must cover exactly
 * `1..totalEpisodes` with positive, unique, gap-free episode numbers; anything
 * else is skipped with a reason instead of being guessed (fail-closed).
 *
 * Output contract mirrors `scripts/build-anime-filler-map.mjs` in Pictorium:
 *   { meta: { schemaVersion: 2, statusCodes: [...], counts, ... },
 *     records: [{ m, t, n, ranges: [[start, end, status]], partial }] }
 *
 * Exit codes:
 *   0  snapshot written
 *   1  no record could be emitted
 *   2  input could not be read or parsed
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const SCHEMA_VERSION = 2;
export const STATUS_CODES = ["manga", "anime", "filler", "mixed"];
export const SOURCE_LICENSE = "CC BY-SA 4.0";
export const SOURCE_LICENSE_URL = "https://creativecommons.org/licenses/by-sa/4.0/";
export const SOURCE_URL = "https://github.com/Eful97/pictorium-anime-filler";

const STATUS_SET = new Set(STATUS_CODES);

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/** Map one db episode row to a Pictorium status code, or null when ambiguous. */
export function mapEpisodeStatus(episode) {
  if (!isPlainObject(episode)) return null;
  if (episode.status === "filler" || episode.status === "mixed") {
    return episode.status;
  }
  if (episode.status === "canon") {
    if (episode.kind === "manga-canon") return "manga";
    if (episode.kind === "anime-canon") return "anime";
  }
  return null;
}

/**
 * Validate one title and return `{ record }` or `{ reason, detail }`.
 * Enforced: positive tmdbId, positive totalEpisodes, 1..N coverage with
 * unique positive numbers, and a recognizable status for every row.
 */
export function convertTitle(title) {
  if (!isPlainObject(title)) return { reason: "invalid-title" };
  const tmdbId = title.tmdbId;
  if (!isPositiveInteger(tmdbId)) return { reason: "no-tmdb-id" };
  // The Pictorium banner is episode-based: a film/OVA side has no TV episode
  // numbering, so it is never emitted as a series record.
  if ((title.tmdbSide ?? "tv") !== "tv") return { reason: "tmdb-movie-side" };

  const total = title.totalEpisodes;
  if (!isPositiveInteger(total)) {
    return { reason: "invalid-total-episodes", detail: String(total) };
  }
  if (!Array.isArray(title.episodes) || title.episodes.length === 0) {
    return { reason: "no-episodes" };
  }

  const byNumber = new Map();
  for (const episode of title.episodes) {
    if (!isPlainObject(episode) || !isPositiveInteger(episode.number)) {
      return { reason: "invalid-episode-number", detail: JSON.stringify(episode) };
    }
    if (byNumber.has(episode.number)) {
      return { reason: "duplicate-episode-number", detail: String(episode.number) };
    }
    const status = mapEpisodeStatus(episode);
    if (status === null) {
      return {
        reason: "ambiguous-status",
        detail: `episode ${episode.number}: ${episode.status}/${episode.kind}`,
      };
    }
    byNumber.set(episode.number, status);
  }

  for (let number = 1; number <= total; number += 1) {
    if (!byNumber.has(number)) {
      return { reason: "coverage-gap", detail: `missing episode ${number} of ${total}` };
    }
  }
  if (byNumber.size !== total) {
    return {
      reason: "out-of-range-episodes",
      detail: `${byNumber.size} rows for ${total} declared episodes`,
    };
  }

  const ranges = [];
  for (let number = 1; number <= total; number += 1) {
    const status = byNumber.get(number);
    const last = ranges[ranges.length - 1];
    if (last && last[2] === status && last[1] === number - 1) {
      last[1] = number;
    } else {
      ranges.push([number, number, status]);
    }
  }

  return {
    record: {
      m: isPositiveInteger(title.malId) ? title.malId : null,
      t: tmdbId,
      n: total,
      ranges,
      partial: false,
    },
  };
}

/**
 * Build the full snapshot from a parsed db object.
 * @returns {{ snapshot: object, records: object[], skipped: object[], warnings: object[] }}
 */
export function buildSnapshot(db, { generatedAt = new Date().toISOString(), inputSha256 = null } = {}) {
  if (!isPlainObject(db) || !Array.isArray(db.titles)) {
    throw new Error("input DB must be an object with a titles[] array");
  }

  const tmdbCounts = new Map();
  for (const title of db.titles) {
    if (isPlainObject(title) && isPositiveInteger(title.tmdbId)) {
      tmdbCounts.set(title.tmdbId, (tmdbCounts.get(title.tmdbId) ?? 0) + 1);
    }
  }

  const records = [];
  const skipped = [];
  const warnings = [];
  const malSeen = new Set();

  for (const title of db.titles) {
    const slug = isPlainObject(title) && typeof title.slug === "string" ? title.slug : "(unknown)";
    const result = convertTitle(title);
    if (!result.record) {
      skipped.push({ slug, reason: result.reason, ...(result.detail ? { detail: result.detail } : {}) });
      continue;
    }
    if (tmdbCounts.get(result.record.t) > 1) {
      skipped.push({
        slug,
        reason: "duplicate-tmdb-id",
        detail: `TMDB ${result.record.t} is shared by ${tmdbCounts.get(result.record.t)} titles`,
      });
      continue;
    }
    if (result.record.m !== null && malSeen.has(result.record.m)) {
      warnings.push({
        slug,
        code: "duplicate-mal-id",
        detail: `MAL ${result.record.m} already used; emitted without m`,
      });
      result.record.m = null;
    } else if (result.record.m !== null) {
      malSeen.add(result.record.m);
    }
    records.push(result.record);
  }

  records.sort((a, b) => (a.m ?? Number.MAX_SAFE_INTEGER) - (b.m ?? Number.MAX_SAFE_INTEGER) || a.t - b.t);
  skipped.sort(
    (a, b) =>
      (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0) ||
      (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0),
  );

  const counts = {
    sourceAnime: db.titles.length,
    records: records.length,
    skipped: skipped.length,
    episodes: 0,
    manga: 0,
    anime: 0,
    filler: 0,
    mixed: 0,
    partial: 0,
    ranges: 0,
    tmdbTargets: new Set(records.map((record) => record.t)).size,
    multiRun: 0,
    withTvdb: 0,
    declaredCountMismatches: warnings.length,
  };

  for (const record of records) {
    counts.episodes += record.n;
    counts.ranges += record.ranges.length;
    if (record.partial) counts.partial += 1;
    for (const [, , status] of record.ranges) {
      const length = record.ranges.find((r) => r[2] === status) ? 0 : 0;
      void length;
    }
    for (const [start, end, status] of record.ranges) {
      counts[status] += end - start + 1;
    }
  }

  const attribution =
    `Anime filler classification data from the "pictorium-anime-filler" own database ` +
    `(${SOURCE_URL}), licensed under ${SOURCE_LICENSE} (${SOURCE_LICENSE_URL}). ` +
    `Changes: per-episode canon/filler/mixed rows were mapped to manga/anime/filler/mixed ` +
    `codes (canon + manga-canon => manga, canon + anime-canon => anime), range-compressed on ` +
    `absolute numbering 1..n, and titles without a TMDB id or without exact 1..n coverage were ` +
    `excluded and listed in meta.skipped. This is attribution, not legal certification.`;

  const snapshot = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      sourceRepo: "pictorium-anime-filler (local)",
      sourceRevision: inputSha256 ? `db.json@sha256:${inputSha256}` : "unpinned",
      sourceSnapshotDate: generatedAt.slice(0, 10),
      sourceLicense: SOURCE_LICENSE,
      sourceLicenseUrl: SOURCE_LICENSE_URL,
      sourceUrl: SOURCE_URL,
      sourceSha256: inputSha256,
      generatedAt,
      attribution,
      statusCodes: STATUS_CODES,
      counts,
      skipped,
      warnings,
    },
    records,
  };

  const integrityErrors = validateSnapshot(snapshot);
  if (integrityErrors.length > 0) {
    throw new Error(`generated snapshot failed validation: ${integrityErrors.slice(0, 5).join("; ")}`);
  }

  return { snapshot, records, skipped, warnings };
}

/** Structural validation of the emitted snapshot (same invariants as Pictorium). */
export function validateSnapshot(snapshot) {
  const errors = [];
  if (!isPlainObject(snapshot)) return ["snapshot is not an object"];
  const { meta, records } = snapshot;
  if (!isPlainObject(meta)) return ["missing meta"];
  if (meta.schemaVersion !== SCHEMA_VERSION) errors.push(`meta.schemaVersion must be ${SCHEMA_VERSION}`);
  if (!Array.isArray(meta.statusCodes) || meta.statusCodes.join(",") !== STATUS_CODES.join(",")) {
    errors.push(`meta.statusCodes must be [${STATUS_CODES.join(", ")}]`);
  }
  if (!Array.isArray(records)) return [...errors, "records must be an array"];

  const totals = { manga: 0, anime: 0, filler: 0, mixed: 0, episodes: 0, ranges: 0, partial: 0 };
  const tmdb = new Set();
  for (const [index, record] of records.entries()) {
    const label = `records[${index}]`;
    if (!isPositiveInteger(record.t)) {
      errors.push(`${label}.t must be a positive integer`);
      continue;
    }
    if (record.m !== null && !isPositiveInteger(record.m)) errors.push(`${label}.m must be null or a positive integer`);
    if (!isPositiveInteger(record.n)) {
      errors.push(`${label}.n must be a positive integer`);
      continue;
    }
    if (typeof record.partial !== "boolean") errors.push(`${label}.partial must be boolean`);
    if (record.partial) totals.partial += 1;
    if (tmdb.has(record.t)) errors.push(`${label}.t ${record.t} is duplicated`);
    tmdb.add(record.t);
    if (!Array.isArray(record.ranges) || record.ranges.length === 0) {
      errors.push(`${label}.ranges must be a non-empty array`);
      continue;
    }
    let expected = 1;
    for (const range of record.ranges) {
      if (!Array.isArray(range) || range.length !== 3) {
        errors.push(`${label}.ranges entry must be [start, end, status]`);
        continue;
      }
      const [start, end, status] = range;
      if (!isPositiveInteger(start) || !isPositiveInteger(end) || end < start) {
        errors.push(`${label}.ranges [${start},${end}] is invalid`);
        continue;
      }
      if (!STATUS_SET.has(status)) {
        errors.push(`${label}.ranges status ${JSON.stringify(status)} is invalid`);
        continue;
      }
      if (start !== expected) errors.push(`${label}.ranges do not cover 1..${record.n} (gap at ${expected})`);
      expected = end + 1;
      totals.ranges += 1;
      totals[status] += end - start + 1;
    }
    if (expected !== record.n + 1) errors.push(`${label}.ranges do not cover 1..${record.n}`);
    totals.episodes += record.n;
  }

  const counts = meta.counts;
  if (!isPlainObject(counts)) {
    errors.push("missing meta.counts");
  } else {
    if (counts.records !== records.length) errors.push(`meta.counts.records ${counts.records} != ${records.length}`);
    if (!Number.isInteger(counts.sourceAnime) || counts.sourceAnime < records.length + (meta.skipped?.length ?? 0)) {
      errors.push("meta.counts.sourceAnime is missing or smaller than records + skipped");
    }
    if (counts.episodes !== totals.episodes) errors.push(`meta.counts.episodes ${counts.episodes} != ${totals.episodes}`);
    if (counts.manga !== totals.manga) errors.push(`meta.counts.manga ${counts.manga} != ${totals.manga}`);
    if (counts.anime !== totals.anime) errors.push(`meta.counts.anime ${counts.anime} != ${totals.anime}`);
    if (counts.filler !== totals.filler) errors.push(`meta.counts.filler ${counts.filler} != ${totals.filler}`);
    if (counts.mixed !== totals.mixed) errors.push(`meta.counts.mixed ${counts.mixed} != ${totals.mixed}`);
    if (counts.ranges !== totals.ranges) errors.push(`meta.counts.ranges ${counts.ranges} != ${totals.ranges}`);
    if (counts.partial !== totals.partial) errors.push(`meta.counts.partial ${counts.partial} != ${totals.partial}`);
    if (counts.tmdbTargets !== tmdb.size) errors.push(`meta.counts.tmdbTargets ${counts.tmdbTargets} != ${tmdb.size}`);
  }

  return errors;
}

function main(argv) {
  const inputPath = path.resolve(argv[2] ?? "db.json");
  const outputPath = path.resolve(argv[3] ?? "anime-filler-own-map.json");

  let raw;
  try {
    raw = fs.readFileSync(inputPath, "utf8");
  } catch (error) {
    console.error(`INVALID INPUT: cannot read ${inputPath}: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  let db;
  try {
    db = JSON.parse(raw);
  } catch (error) {
    console.error(`INVALID INPUT: ${inputPath} is not valid JSON: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const inputSha256 = crypto.createHash("sha256").update(raw).digest("hex");
  let result;
  try {
    result = buildSnapshot(db, { inputSha256 });
  } catch (error) {
    console.error(`INVALID OUTPUT: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (result.records.length === 0) {
    console.error("INVALID OUTPUT: no title could be converted (all skipped)");
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(outputPath, `${JSON.stringify(result.snapshot)}\n`, "utf8");
  const { counts } = result.snapshot.meta;
  console.log(
    `OK ${path.relative(process.cwd(), outputPath)}: ${counts.records} records, ` +
      `${counts.episodes} episodes, ${counts.ranges} ranges, skipped=${counts.skipped} ` +
      `(manga=${counts.manga} anime=${counts.anime} filler=${counts.filler} mixed=${counts.mixed})`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv);
}
