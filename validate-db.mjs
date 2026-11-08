#!/usr/bin/env node
/**
 * validate-db.mjs — offline validator for the private Pictorium own-filler DB.
 *
 * Usage:
 *   node validate-db.mjs db.json
 *
 * Exit codes:
 *   0  valid database
 *   1  invalid database (schema/invariant violation)
 *   2  input could not be read or parsed
 *
 * No dependencies, no network access.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIND = "pictorium-own-filler-db";
export const SCHEMA_VERSION = 1;
export const STATUS_CODES = ["canon", "filler", "mixed"];
export const REVIEW_STATUSES = ["needs-review", "verified"];
export const EXPECTED_TITLE_COUNT = 364;

/**
 * Flags that declare a title's `episodes[]` as RAW anime_filler.md range rows
 * (zero-based runs, offset starts, partial/unknown runs, out-of-bounds or
 * duplicated md ranges) instead of a normalized 1..N list. Flagged rows are
 * validated structurally; the strict 1..N gate applies only to unflagged rows.
 */
export const RAW_NUMBERING_FLAGS = [
  "numbering-zero-based",
  "numbering-offset-start",
  "partial-unknownRanges",
  "md-zero-based-ranges",
];
export const RAW_NUMBERING_FLAG_PREFIXES = [
  "md-range-",
  "md-duplicate-range-numbers",
];

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function sameStringArray(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function contaminationIsClean(value) {
  return (
    isPlainObject(value) &&
    value.aflHtml === false &&
    value.skipthefillerPages === false
  );
}

function hasRawNumberingFlags(review) {
  if (!isPlainObject(review) || !Array.isArray(review.flags)) return false;
  return review.flags.some(
    (flag) =>
      RAW_NUMBERING_FLAGS.includes(flag) ||
      RAW_NUMBERING_FLAG_PREFIXES.some((prefix) => flag.startsWith(prefix))
  );
}

/**
 * Validate a parsed database object.
 * @param {unknown} db
 * @returns {string[]} list of human-readable errors (empty when valid)
 */
export function validateDatabase(db) {
  const errors = [];
  const err = (message) => errors.push(message);

  if (!isPlainObject(db)) {
    return ["root: db.json must be a JSON object"];
  }

  // ---- meta -------------------------------------------------------------
  const meta = db.meta;
  if (!isPlainObject(meta)) {
    err("meta: missing or not an object");
  } else {
    if (meta.kind !== KIND) {
      err(`meta.kind: expected "${KIND}", got ${JSON.stringify(meta.kind)}`);
    }
    if (meta.schemaVersion !== SCHEMA_VERSION) {
      err(
        `meta.schemaVersion: expected ${SCHEMA_VERSION}, got ${JSON.stringify(
          meta.schemaVersion
        )}`
      );
    }
    if (!sameStringArray(meta.statusCodes, STATUS_CODES)) {
      err(
        `meta.statusCodes: expected exactly ${JSON.stringify(
          STATUS_CODES
        )}, got ${JSON.stringify(meta.statusCodes)}`
      );
    }
    if (!Array.isArray(meta.sources)) {
      err("meta.sources: must be an array");
    }
    if (!isPlainObject(meta.licenseBoundary)) {
      err("meta.licenseBoundary: missing or not an object");
    } else {
      if (meta.licenseBoundary.ownDb !== "CC BY-SA 4.0") {
        err('meta.licenseBoundary.ownDb: must be "CC BY-SA 4.0"');
      }
      if (meta.licenseBoundary.existingSnapshot !== "CC BY 4.0 (separate)") {
        err(
          'meta.licenseBoundary.existingSnapshot: must be "CC BY 4.0 (separate)"'
        );
      }
    }
    if (!contaminationIsClean(meta.contamination)) {
      err(
        "meta.contamination: aflHtml and skipthefillerPages must both be false"
      );
    }
  }

  // ---- coverage ---------------------------------------------------------
  if (!isPlainObject(db.coverage)) {
    err("coverage: missing or not an object");
  } else if (!Array.isArray(db.coverage.alreadyCovered)) {
    err("coverage.alreadyCovered: must be an array");
  }

  // ---- titles -----------------------------------------------------------
  const titles = db.titles;
  if (!Array.isArray(titles)) {
    err("titles: missing or not an array");
    return errors;
  }
  if (titles.length !== EXPECTED_TITLE_COUNT) {
    err(
      `titles: expected ${EXPECTED_TITLE_COUNT} entries, got ${titles.length}`
    );
  }

  const slugs = new Map();
  const malIds = new Map();
  const tmdbIds = new Map();

  titles.forEach((title, index) => {
    const label = `titles[${index}]${
      isPlainObject(title) && typeof title.slug === "string"
        ? ` (slug "${title.slug}")`
        : ""
    }`;

    if (!isPlainObject(title)) {
      err(`${label}: must be an object`);
      return;
    }

    if (typeof title.slug !== "string" || title.slug.trim() === "") {
      err(`${label}: slug must be a non-empty string`);
    } else if (slugs.has(title.slug)) {
      err(
        `${label}: duplicate slug "${title.slug}" (first at titles[${slugs.get(
          title.slug
        )}])`
      );
    } else {
      slugs.set(title.slug, index);
    }

    if (typeof title.title !== "string" || title.title.trim() === "") {
      err(`${label}: title must be a non-empty string`);
    }

    if (title.tmdbSide !== undefined && title.tmdbSide !== null) {
      if (title.tmdbSide !== "tv" && title.tmdbSide !== "movie") {
        err(`${label}: tmdbSide must be "tv", "movie", or null`);
      }
      if (!isPositiveInteger(title.tmdbId)) {
        err(`${label}: tmdbSide requires a positive tmdbId`);
      }
    }

    for (const idKey of ["malId", "tmdbId"]) {
      const value = title[idKey];
      if (value === null) continue;
      if (!isPositiveInteger(value)) {
        err(`${label}: ${idKey} must be null or a positive integer`);
        continue;
      }
      const seen = idKey === "malId" ? malIds : tmdbIds;
      if (seen.has(value)) {
        err(
          `${label}: duplicate ${idKey} ${value} (first at titles[${seen.get(
            value
          )}])`
        );
      } else {
        seen.set(value, index);
      }
    }

    const totalValid = isNonNegativeInteger(title.totalEpisodes);
    if (!totalValid) {
      err(`${label}: totalEpisodes must be a non-negative integer`);
    }

    if (title.source !== null && (typeof title.source !== "string" || title.source.trim() === "")) {
      err(`${label}: source must be null or a non-empty string`);
    }
    if (
      title.sourceRevision !== null &&
      (typeof title.sourceRevision !== "string" || title.sourceRevision.trim() === "")
    ) {
      err(`${label}: sourceRevision must be null or a non-empty string`);
    }
    if (typeof title.updatedAt !== "string" || Number.isNaN(Date.parse(title.updatedAt))) {
      err(`${label}: updatedAt must be a parseable ISO date string`);
    }

    // review
    if (!isPlainObject(title.review)) {
      err(`${label}: review must be an object`);
    } else {
      if (!REVIEW_STATUSES.includes(title.review.status)) {
        err(
          `${label}: review.status must be one of ${REVIEW_STATUSES.join(
            "|"
          )}, got ${JSON.stringify(title.review.status)}`
        );
      }
      if (!Array.isArray(title.review.flags)) {
        err(`${label}: review.flags must be an array`);
      } else if (
        title.review.flags.some(
          (flag) => typeof flag !== "string" || flag.trim() === ""
        )
      ) {
        err(`${label}: review.flags entries must be non-empty strings`);
      }
      if (title.review.status === "verified") {
        if (typeof title.source !== "string" || title.source.trim() === "") {
          err(`${label}: verified rows require a pinned source`);
        }
        if (
          typeof title.sourceRevision !== "string" ||
          title.sourceRevision.trim() === ""
        ) {
          err(`${label}: verified rows require a pinned sourceRevision`);
        }
      }
    }

    // provenance
    if (!isPlainObject(title.provenance)) {
      err(`${label}: provenance must be an object`);
    } else {
      if (typeof title.provenance.plannedSource !== "string") {
        err(`${label}: provenance.plannedSource must be a string`);
      }
      if (!contaminationIsClean(title.provenance.contamination)) {
        err(
          `${label}: provenance.contamination: aflHtml and skipthefillerPages must both be false`
        );
      }
    }

    // episodes: empty is valid. Non-empty rows are either a strict normalized
    // 1..N list or a raw anime_filler.md range declared by review flags.
    if (!Array.isArray(title.episodes)) {
      err(`${label}: episodes must be an array`);
      return;
    }
    if (title.episodes.length === 0) return;
    if (!totalValid || title.totalEpisodes === 0) {
      err(`${label}: non-empty episodes require a positive totalEpisodes`);
      return;
    }

    const rawNumbering = hasRawNumberingFlags(title.review);
    const seenNumbers = new Set();
    title.episodes.forEach((episode, episodeIndex) => {
      const epLabel = `${label}.episodes[${episodeIndex}]`;
      if (!isPlainObject(episode)) {
        err(`${epLabel}: must be an object`);
        return;
      }
      const number = episode.number;
      if (rawNumbering) {
        if (!isNonNegativeInteger(number)) {
          err(
            `${epLabel}: number must be a non-negative integer in flagged raw rows`
          );
          return;
        }
      } else {
        if (!isPositiveInteger(number)) {
          err(
            `${epLabel}: number must be a positive integer (zero-based numbering is invalid)`
          );
          return;
        }
        if (number > title.totalEpisodes) {
          err(
            `${epLabel}: number ${number} exceeds totalEpisodes ${title.totalEpisodes}`
          );
        }
        if (seenNumbers.has(number)) {
          err(`${epLabel}: duplicate episode number ${number}`);
        }
        seenNumbers.add(number);
      }
      if (!STATUS_CODES.includes(episode.status)) {
        err(
          `${epLabel}: status must be one of ${STATUS_CODES.join(
            "|"
          )}, got ${JSON.stringify(episode.status)}`
        );
      }
      if (typeof episode.kind !== "string" || episode.kind.trim() === "") {
        err(`${epLabel}: kind must be a non-empty string`);
      }
      if (episode.title !== undefined && typeof episode.title !== "string") {
        err(`${epLabel}: title must be a string when present`);
      }
      if (
        episode.airDate !== undefined &&
        episode.airDate !== null &&
        !(
          typeof episode.airDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(episode.airDate)
        )
      ) {
        err(`${epLabel}: airDate must be null or a YYYY-MM-DD string`);
      }
    });

    if (rawNumbering) return;

    const missing = [];
    for (let number = 1; number <= title.totalEpisodes; number += 1) {
      if (!seenNumbers.has(number)) missing.push(number);
    }
    if (missing.length > 0) {
      const preview = missing.slice(0, 10).join(", ");
      err(
        `${label}: episodes must cover 1..${
          title.totalEpisodes
        } gap-free; missing ${missing.length}${
          missing.length > 10 ? ` (first: ${preview}, ...)` : ` (${preview})`
        }`
      );
    }
  });

  return errors;
}

function main(argv) {
  const file = argv[2] ?? "db.json";
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    console.error(`INVALID INPUT: cannot read ${file}: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  let db;
  try {
    db = JSON.parse(text);
  } catch (error) {
    console.error(`INVALID INPUT: ${file} is not valid JSON: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  const errors = validateDatabase(db);
  if (errors.length > 0) {
    console.error(`INVALID ${file}: ${errors.length} error(s)`);
    for (const message of errors) console.error(` - ${message}`);
    process.exitCode = 1;
    return;
  }

  const episodeRows = db.titles.reduce(
    (sum, title) => sum + title.episodes.length,
    0
  );
  console.log(
    `OK ${file}: ${db.titles.length} titles, ${episodeRows} episode rows, schemaVersion ${db.meta.schemaVersion}`
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv);
}
