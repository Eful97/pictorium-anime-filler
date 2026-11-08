#!/usr/bin/env node
/**
 * build-db.mjs — assemble the own filler DB from per-title source files.
 *
 * Source layout:
 *   meta.json          { "meta": {...}, "coverage": {...} }
 *   titles/<slug>.json one title object per file
 *   db.json            generated aggregate (committed, never edited by hand)
 *
 * Usage:
 *   node build-db.mjs           # write db.json
 *   node build-db.mjs --check   # read-only: fail when db.json is stale
 *
 * Exit codes:
 *   0  db.json written / already current
 *   1  invalid source files, duplicate identity, or stale db.json in --check
 *   2  source unreadable or unparsable
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TITLES_DIR = "titles";
export const META_FILE = "meta.json";
export const DB_FILE = "db.json";

const here = path.dirname(fileURLToPath(import.meta.url));

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * Load and validate all source files. Returns the aggregate object or throws
 * with a message listing every problem.
 */
export function loadSource(rootDir = here) {
  const errors = [];
  const metaPath = path.join(rootDir, META_FILE);
  let metaDoc;
  try {
    metaDoc = readJson(metaPath);
  } catch (error) {
    throw new Error(`cannot read ${META_FILE}: ${error.message}`);
  }
  if (!isPlainObject(metaDoc) || !isPlainObject(metaDoc.meta) || !isPlainObject(metaDoc.coverage)) {
    throw new Error(`${META_FILE} must contain "meta" and "coverage" objects`);
  }

  const titlesDir = path.join(rootDir, TITLES_DIR);
  let files;
  try {
    files = fs.readdirSync(titlesDir).filter((name) => name.endsWith(".json")).sort();
  } catch (error) {
    throw new Error(`cannot read ${TITLES_DIR}/: ${error.message}`);
  }
  if (files.length === 0) throw new Error(`${TITLES_DIR}/ contains no .json file`);

  const titles = [];
  const slugs = new Map();
  const malIds = new Map();
  const tmdbIds = new Map();

  for (const file of files) {
    const stem = file.slice(0, -".json".length);
    let title;
    try {
      title = readJson(path.join(titlesDir, file));
    } catch (error) {
      errors.push(`${TITLES_DIR}/${file}: not valid JSON (${error.message})`);
      continue;
    }
    if (!isPlainObject(title)) {
      errors.push(`${TITLES_DIR}/${file}: must be a JSON object`);
      continue;
    }
    if (typeof title.slug !== "string" || title.slug.trim() === "") {
      errors.push(`${TITLES_DIR}/${file}: slug must be a non-empty string`);
      continue;
    }
    if (title.slug !== stem) {
      errors.push(`${TITLES_DIR}/${file}: slug "${title.slug}" does not match the filename`);
      continue;
    }
    if (slugs.has(title.slug)) {
      errors.push(`${TITLES_DIR}/${file}: duplicate slug "${title.slug}"`);
      continue;
    }
    slugs.set(title.slug, file);

    for (const [key, seen] of [
      ["malId", malIds],
      ["tmdbId", tmdbIds],
    ]) {
      const value = title[key];
      if (value === null || value === undefined) continue;
      if (!isPositiveInteger(value)) {
        errors.push(`${TITLES_DIR}/${file}: ${key} must be null or a positive integer`);
        continue;
      }
      if (seen.has(value)) {
        errors.push(`${TITLES_DIR}/${file}: duplicate ${key} ${value} (already in ${seen.get(value)})`);
        continue;
      }
      seen.set(value, file);
    }

    titles.push(title);
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));

  titles.sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return { meta: metaDoc.meta, titles, coverage: metaDoc.coverage };
}

export function serializeDb(db) {
  return `${JSON.stringify({ meta: db.meta, titles: db.titles, coverage: db.coverage }, null, 2)}\n`;
}

function main(argv) {
  const check = argv.includes("--check");
  const root = process.cwd();
  const dbPath = path.join(root, DB_FILE);

  let db;
  try {
    db = loadSource(root);
  } catch (error) {
    console.error(`INVALID SOURCE:\n${error.message}`);
    process.exitCode = check ? 1 : 2;
    return;
  }

  const next = serializeDb(db);

  if (check) {
    let current;
    try {
      current = fs.readFileSync(dbPath, "utf8");
    } catch (error) {
      console.error(`INVALID INPUT: cannot read ${DB_FILE}: ${error.message}`);
      process.exitCode = 2;
      return;
    }
    if (current !== next) {
      console.error(`${DB_FILE} is stale: run "node build-db.mjs" and commit the result`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK ${DB_FILE}: up to date (${db.titles.length} titles)`);
    return;
  }

  fs.writeFileSync(dbPath, next, "utf8");
  console.log(`OK ${DB_FILE}: wrote ${db.titles.length} titles from ${TITLES_DIR}/`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === path.resolve(fileURLToPath(import.meta.url))) {
  main(process.argv);
}
