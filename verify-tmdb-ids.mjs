#!/usr/bin/env node
/**
 * verify-tmdb-ids.mjs — annotate titles with the TMDB regular-season sum.
 *
 * For every title with `tmdbSide: "tv"`, fetch `/tv/{id}` and sum the regular
 * seasons' episode_count (season 0 excluded, same rule as Pictorium). The sum
 * is stored as a review flag, not used to drop ids:
 *   tmdb-sum-match:<sum>
 *   tmdb-sum-mismatch:<sum>vs<db>
 *   tmdb-unverified / tmdb-not-found
 *
 * The API key is read from --env-file (a Pictorium .env) or TMDB_API_KEY.
 * Usage:
 *   node verify-tmdb-ids.mjs --env-file ../Pictorium/.env.local [--dry-run]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLES_DIR = path.join(here, "titles");
const CONCURRENCY = 6;

function readKey(argv) {
  if (process.env.TMDB_API_KEY) return process.env.TMDB_API_KEY.trim();
  const index = argv.indexOf("--env-file");
  if (index === -1) return null;
  const text = fs.readFileSync(path.resolve(argv[index + 1]), "utf8");
  for (const name of ["PICTORIUM_TMDB_KEY", "TMDB_API_KEY", "TMDB_KEY"]) {
    const match = text.match(new RegExp(`^${name}=(.+)$`, "m"));
    if (match) return match[1].trim();
  }
  return null;
}

async function fetchSum(id, key) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(`https://api.themoviedb.org/3/tv/${id}?api_key=${key}&language=en-US`);
    if (response.status === 404) return { state: "not-found" };
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
      continue;
    }
    if (!response.ok) return { state: "unverified" };
    const data = await response.json();
    const sum = (data.seasons ?? [])
      .filter((season) => typeof season.season_number === "number" && season.season_number > 0)
      .reduce((total, season) => total + (season.episode_count ?? 0), 0);
    return { state: "ok", sum, name: data.name };
  }
  return { state: "unverified" };
}

async function main() {
  const argv = process.argv;
  const dryRun = argv.includes("--dry-run");
  const key = readKey(argv);
  if (!key) {
    console.error("INVALID INPUT: --env-file <pictorium .env> or TMDB_API_KEY is required");
    process.exitCode = 2;
    return;
  }

  const files = fs.readdirSync(TITLES_DIR).filter((name) => name.endsWith(".json")).sort();
  const titles = files.map((name) => ({
    file: name,
    data: JSON.parse(fs.readFileSync(path.join(TITLES_DIR, name), "utf8")),
  }));
  const targets = titles.filter(({ data }) => data.tmdbId && (data.tmdbSide ?? "tv") === "tv");
  console.log(`verifying ${targets.length} TV ids against TMDB`);

  let cursor = 0;
  let done = 0;
  const results = [];
  async function worker() {
    while (cursor < targets.length) {
      const entry = targets[cursor];
      cursor += 1;
      const result = await fetchSum(entry.data.tmdbId, key);
      results.push({ entry, result });
      done += 1;
      if (done % 25 === 0) console.log(`... ${done}/${targets.length}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  let match = 0;
  let mismatch = 0;
  let failed = 0;
  for (const { entry, result } of results) {
    const { data } = entry;
    const flags = new Set(data.review.flags ?? []);
    for (const flag of [...flags]) {
      if (flag.startsWith("tmdb-sum-") || flag === "tmdb-unverified" || flag === "tmdb-not-found") flags.delete(flag);
    }
    if (result.state === "ok") {
      const tolerance = Math.max(1, Math.round(data.totalEpisodes * 0.02));
      const relaxed = [...flags].includes("id-format-relaxed");
      if (relaxed && Math.abs(result.sum - data.totalEpisodes) > tolerance) {
        // An OVA/ONA page mapped to a TV series of a different length is not a
        // safe episode-numbering match (e.g. Rohan OVAs -> JoJo series).
        data.tmdbId = null;
        data.tmdbSide = null;
        flags.add(`tmdb-id-rejected-relaxed:${result.sum}vs${data.totalEpisodes}`);
        failed += 1;
      } else if (result.sum === data.totalEpisodes) {
        flags.add(`tmdb-sum-match:${result.sum}`);
        match += 1;
      } else {
        flags.add(`tmdb-sum-mismatch:${result.sum}vs${data.totalEpisodes}`);
        mismatch += 1;
      }
    } else {
      flags.add(result.state === "not-found" ? "tmdb-not-found" : "tmdb-unverified");
      failed += 1;
    }
    data.review.flags = [...flags];
    if (!dryRun) fs.writeFileSync(path.join(TITLES_DIR, entry.file), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  }

  console.log(`${dryRun ? "DRY RUN" : "applied"}: match=${match} mismatch=${mismatch} failed=${failed}`);
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
