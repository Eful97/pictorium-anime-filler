#!/usr/bin/env node
/**
 * fill-ids.mjs — resolve missing malId/tmdbId for titles/<slug>.json.
 *
 * Pipeline:
 *   1. AniList GraphQL `Page.media(search:)` resolves the title (romaji/english/
 *      synonyms), episode count, format and year. No API key.
 *   2. Fribb/anime-lists (anime-list-full.json) maps the AniList id to MAL and
 *      TMDB ids. Pass it with --fribb <path> (never committed here).
 *
 * Matching is fail-closed: a title is written only when the name match is
 * unique after episode-count, year and format-family disambiguation. Everything
 * else is reported as ambiguous / not-found and left untouched.
 *
 * Usage:
 *   node fill-ids.mjs --fribb /tmp/anime-list-full.json [--apply] [--limit N]
 *
 * Without --apply nothing is written; the report goes to id-report.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const TITLES_DIR = path.join(here, "titles");
const REPORT_FILE = path.join(here, "id-report.json");
const ANILIST_URL = "https://graphql.anilist.co";
const BATCH_SIZE = 5;
const PER_PAGE = 10;
const BATCH_DELAY_MS = 1200;
const SKIP = /\b(Films?|OVAs?|OADs?|Specials?|Movies?)\b/i;

const MEDIA_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  episodes
  format
  startDate { year }
  isAdult
`;

function norm(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function namesFromTitle(title) {
  const wanted = new Set();
  const add = (value) => {
    const n = norm(value);
    if (n) wanted.add(n);
  };
  add(title.replace(/\(.*?\)/g, " "));
  add(title);
  for (const match of title.matchAll(/\((.*?)\)/g)) add(match[1]);
  return wanted;
}

function searchHints(title) {
  const withoutParens = title.replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const hints = new Set([withoutParens]);
  const stripped = withoutParens.replace(SKIP, " ").replace(/\s+/g, " ").trim();
  if (stripped) hints.add(stripped);
  for (const match of title.matchAll(/\((.*?)\)/g)) hints.add(match[1].trim());
  return [...hints].filter(Boolean);
}

function expectedFormats(title, slug) {
  if (SKIP.test(title)) return new Set(["MOVIE", "OVA", "ONA", "SPECIAL"]);
  if (/-tv$/.test(String(slug ?? ""))) return new Set(["TV", "TV_SHORT"]);
  if (/(^|-)(ova|oad|special)s?(-|$)/.test(String(slug ?? ""))) return new Set(["OVA", "ONA", "SPECIAL"]);
  return new Set(["TV", "TV_SHORT", "ONA"]);
}

function rawTitle(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function rawCandidateNames(media) {
  return [media.title?.romaji, media.title?.english, media.title?.native]
    .map(rawTitle)
    .filter(Boolean);
}

function compact(value) {
  return value.replace(/\s+/g, "");
}

function editDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) rows[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return rows[a.length][b.length];
}

function editSimilarity(a, b) {
  const longest = Math.max(a.length, b.length);
  return longest === 0 ? 1 : 1 - editDistance(a, b) / longest;
}

function containsWords(longer, shorter) {
  return ` ${longer} `.includes(` ${shorter} `);
}

function startsWithBoundary(value, prefix) {
  if (!value || !prefix) return false;
  if (value === prefix) return true;
  return [":", " ", "-"].some((separator) => value.startsWith(`${prefix}${separator}`));
}

function episodesClose(media, totalEpisodes) {
  if (media?.episodes == null) return false;
  const tolerance = Math.max(1, Math.round(totalEpisodes * 0.02));
  return Math.abs(media.episodes - totalEpisodes) <= tolerance;
}

function yearFromTitle(title) {
  const match = title.match(/\(((?:19|20)\d{2})\)/);
  return match ? Number(match[1]) : null;
}

function yearFromSlug(slug) {
  const match = String(slug ?? "").match(/(?:^|-)((?:19|20)\d{2})(?:-|$)/);
  return match ? Number(match[1]) : null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function anilistBatch(queries) {
  const parts = queries.map(
    (query, index) =>
      `q${index}: Page(page: 1, perPage: ${PER_PAGE}) { media(search: ${JSON.stringify(
        query,
      )}, type: ANIME) { ${MEDIA_FIELDS} } }`,
  );
  const body = JSON.stringify({ query: `query { ${parts.join(" ")} }` });

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body,
    });
    if (response.ok) {
      const json = await response.json();
      if (json.errors && !json.data) throw new Error(json.errors.map((e) => e.message).join("; "));
      return queries.map((_, index) => json.data?.[`q${index}`]?.media ?? []);
    }
    if (response.status === 429 || response.status >= 500) {
      const retryAfter = Number(response.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) ? retryAfter * 1000 : 5000 * attempt);
      continue;
    }
    throw new Error(`AniList HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  throw new Error("AniList retries exhausted");
}

// Primary titles only. AniList synonyms on sequel/OVA entries often repeat the
// franchise name and would make every season look like the base series.
function candidateNames(media) {
  const names = new Set();
  for (const value of [media.title?.romaji, media.title?.english, media.title?.native]) {
    const n = norm(value);
    if (n) names.add(n);
  }
  return names;
}

/**
 * Token Jaccard: intersection / union. Extra tokens in a variant ("Season 2",
 * "OVAs", "Gekijou") lower the score, so a base title does not collapse every
 * season/OVA entry into itself. Reordered variants still score 1.0.
 */
function overlapScore(a, b) {
  if (a === b) return 1;
  const left = new Set(a.split(" ").filter(Boolean));
  const right = new Set(b.split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function nameScore(wanted, media) {
  let best = 0;
  for (const left of wanted) {
    for (const right of candidateNames(media)) {
      let score = 0;
      if (left === right) score = 1;
      else if (left.length >= 2 && compact(left) === compact(right)) score = 1;
      else if (left.length >= 1 && (startsWithBoundary(right, left) || startsWithBoundary(left, right))) score = 0.9;
      else if (left.length < 2) score = 0;
      else if (compact(left).length >= 6 && editSimilarity(compact(left), compact(right)) >= 0.9) score = 0.9;
      else if (containsWords(right, left) || containsWords(left, right)) score = 0.76;
      else score = overlapScore(left, right);
      if (score > best) best = score;
    }
  }
  return best;
}

function fribbTmdb(media, indexes) {
  const record = indexes.byAnilist.get(media.id) ?? (media.idMal ? indexes.byMal.get(media.idMal) : null);
  const tmdb = record?.themoviedb_id;
  if (!tmdb || typeof tmdb !== "object") return null;
  return tmdb.tv ?? tmdb.movie ?? null;
}

function earliest(candidates) {
  return [...candidates].sort(
    (a, b) => (a.startDate?.year ?? Number.MAX_SAFE_INTEGER) - (b.startDate?.year ?? Number.MAX_SAFE_INTEGER),
  )[0];
}

function pickCandidate(mediaList, title, totalEpisodes, slug, indexes) {
  const wanted = namesFromTitle(title);
  const formats = expectedFormats(title, slug);
  const year = yearFromTitle(title) ?? yearFromSlug(slug);
  const rawMain = rawTitle(title.replace(/\(.*?\)/g, " "));

  const allScored = (mediaList ?? [])
    .filter(Boolean)
    .map((media) => ({ media, score: nameScore(wanted, media) }))
    .filter(
      ({ media, score }) => score >= 0.75 || (score >= 0.6 && episodesClose(media, totalEpisodes)),
    );
  if (allScored.length === 0) return { status: "not-found" };

  // Prefer the page's expected media family; OVA/ONA is a fallback only when
  // no TV entry exists (e.g. Hellsing Ultimate, Carnival Phantasm).
  let scored = allScored.filter((entry) => formats.has(entry.media.format));
  let relaxed = false;
  if (scored.length === 0) {
    scored = allScored;
    relaxed = true;
  }

  const matched = (entry, evidence) => ({
    status: "matched",
    media: entry.media,
    evidence: [...evidence, ...(relaxed ? ["format-relaxed"] : [])],
    relaxed,
  });
  if (scored.length === 1) return matched(scored[0], ["unique-name"]);

  // Punctuation-sensitive equality discriminates "Negima!" from "Negima!?".
  const rawMatches = scored.filter((entry) => rawCandidateNames(entry.media).includes(rawMain));
  if (rawMatches.length === 1) return matched(rawMatches[0], ["raw-title"]);

  const bestScore = Math.max(...scored.map((entry) => entry.score));
  const best = scored.filter((entry) => entry.score === bestScore);
  if (best.length === 1) return matched(best[0], ["name-score"]);

  const named = scored.map((entry) => entry.media);
  const exactEpisodes = named.filter((media) => media.episodes != null && media.episodes === totalEpisodes);
  if (exactEpisodes.length === 1) return matched({ media: exactEpisodes[0] }, ["episodes-exact"]);

  const withEpisodes = named.filter((media) => episodesClose(media, totalEpisodes));
  if (withEpisodes.length === 1) return matched({ media: withEpisodes[0] }, ["episodes"]);

  if (year !== null) {
    const byYear = named.filter((media) => media.startDate?.year === year);
    if (byYear.length === 1) return matched({ media: byYear[0] }, ["year"]);
  }

  const byFormat = named.filter((media) => formats.has(media.format));
  if (byFormat.length === 1) return matched({ media: byFormat[0] }, ["format"]);

  // A franchise page whose seasons share one TMDB series: the group's episode
  // sum must match the declared page length (Magi 25+25, Nisekoi 20+12, ...).
  const groups = new Map();
  for (const media of named) {
    const tmdb = fribbTmdb(media, indexes);
    if (tmdb == null) continue;
    if (!groups.has(tmdb)) groups.set(tmdb, []);
    groups.get(tmdb).push(media);
  }
  const tolerance = Math.max(1, Math.round(totalEpisodes * 0.02));
  const fits = [...groups.values()].filter((group) => {
    const sum = group.reduce((total, media) => total + (media.episodes ?? 0), 0);
    return Math.abs(sum - totalEpisodes) <= tolerance;
  });
  if (fits.length === 1) return matched({ media: earliest(fits[0]) }, ["episode-sum-tmdb"]);

  // The best-scoring group is the franchise; separate AniList seasons that
  // share one TMDB series are not ambiguous.
  const bestGroup = best.map((entry) => entry.media);
  if (bestGroup.length > 1) {
    const tmdbs = bestGroup.map((media) => fribbTmdb(media, indexes));
    if (tmdbs.every((id) => id !== null) && new Set(tmdbs).size === 1) {
      return matched({ media: earliest(bestGroup) }, ["shared-tmdb"]);
    }
  }

  return { status: "ambiguous", candidates: named };
}

function fribbIndexes(records) {
  const byAnilist = new Map();
  const byMal = new Map();
  for (const record of records) {
    if (record.anilist_id) byAnilist.set(record.anilist_id, record);
    if (record.mal_id) byMal.set(record.mal_id, record);
  }
  return { byAnilist, byMal };
}

function fromFribb(record, media) {
  const tmdb = record?.themoviedb_id ?? null;
  const malId = record?.mal_id ?? media?.idMal ?? null;
  let tmdbId = null;
  let tmdbSide = null;
  if (tmdb && typeof tmdb === "object") {
    const tv = Array.isArray(tmdb.tv) ? tmdb.tv[0] : tmdb.tv;
    const movie = Array.isArray(tmdb.movie) ? tmdb.movie[0] : tmdb.movie;
    if (tv != null) {
      tmdbId = tv;
      tmdbSide = "tv";
    } else if (movie != null) {
      tmdbId = movie;
      tmdbSide = "movie";
    }
  }
  return { malId, tmdbId, tmdbSide };
}

function summarize(media) {
  return {
    anilistId: media.id,
    names: [media.title?.romaji, media.title?.english].filter(Boolean).join(" / "),
    episodes: media.episodes,
    format: media.format,
    year: media.startDate?.year ?? null,
  };
}

async function runPass(titles, hintIndex, fribb, reportMap, updates) {
  const indexes = fribbIndexes(fribb);
  let matched = 0;
  let ambiguous = 0;
  let notFound = 0;

  for (let offset = 0; offset < titles.length; offset += BATCH_SIZE) {
    const batch = titles.slice(offset, offset + BATCH_SIZE);
    const queries = batch.map(({ data }) => searchHints(data.title)[hintIndex] ?? searchHints(data.title)[0]);
    let results;
    try {
      results = await anilistBatch(queries);
    } catch (error) {
      console.error(`batch ${offset} failed: ${error.message}`);
      await sleep(3000);
      continue;
    }

    for (let index = 0; index < batch.length; index += 1) {
      const { file, data } = batch[index];
      const picked = pickCandidate(results[index], data.title, data.totalEpisodes, data.slug, indexes);
      const item = {
        file,
        slug: data.slug,
        title: data.title,
        totalEpisodes: data.totalEpisodes,
        status: picked.status,
      };

      if (picked.status === "matched") {
        const media = picked.media;
        const record = indexes.byAnilist.get(media.id) ?? (media.idMal ? indexes.byMal.get(media.idMal) : null);
        const ids = fromFribb(record, media);
        item.chosen = {
          ...summarize(media),
          ...ids,
          evidence: picked.evidence,
          relaxedFormat: picked.relaxed === true,
        };
        if (ids.malId != null || ids.tmdbId != null) {
          updates.set(file, ids);
          matched += 1;
        } else {
          item.status = "no-fribb-ids";
          notFound += 1;
        }
      } else if (picked.status === "ambiguous") {
        item.candidates = picked.candidates.map(summarize);
        ambiguous += 1;
      } else {
        notFound += 1;
      }
      reportMap.set(file, item);
    }

    const done = Math.min(offset + BATCH_SIZE, titles.length);
    if (done % 25 === 0 || done === titles.length) console.log(`... ${done}/${titles.length}`);
    if (done < titles.length) await sleep(BATCH_DELAY_MS);
  }

  return { matched, ambiguous, notFound };
}

async function main(argv) {
  const apply = argv.includes("--apply");
  const fribbIndex = argv.indexOf("--fribb");
  const fribbPath = fribbIndex !== -1 ? argv[fribbIndex + 1] : null;
  const limitIndex = argv.indexOf("--limit");
  const limit = limitIndex !== -1 ? Number(argv[limitIndex + 1]) : Infinity;
  const onlyIndex = argv.indexOf("--only");
  const only =
    onlyIndex !== -1
      ? new Set(
          argv[onlyIndex + 1]
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
        )
      : null;
  if (!fribbPath) {
    console.error("INVALID INPUT: --fribb <anime-list-full.json> is required");
    process.exitCode = 2;
    return;
  }

  const fribb = JSON.parse(fs.readFileSync(path.resolve(fribbPath), "utf8"));
  const files = fs.readdirSync(TITLES_DIR).filter((name) => name.endsWith(".json")).sort();
  const titles = files.map((name) => ({
    file: name,
    data: JSON.parse(fs.readFileSync(path.join(TITLES_DIR, name), "utf8")),
  }));

  let pending = titles.filter(({ data }) => data.malId == null || data.tmdbId == null);
  if (only) pending = pending.filter(({ data }) => only.has(data.slug));
  pending = pending.slice(0, limit);
  console.log(`pending ${pending.length} of ${titles.length} titles`);

  const updates = new Map();
  const reportMap = new Map();

  await runPass(pending, 0, fribb, reportMap, updates);
  const unresolved = pending.filter(({ file }) => {
    const item = reportMap.get(file);
    return !updates.has(file) && (item?.status === "not-found" || item?.status === "no-fribb-ids");
  });
  if (unresolved.length > 0) await runPass(unresolved, 1, fribb, reportMap, updates);

  const items = [...reportMap.values()];
  const report = {
    generatedAt: new Date().toISOString(),
    counts: {
      pending: pending.length,
      matched: items.filter((item) => item.status === "matched").length,
      ambiguous: items.filter((item) => item.status === "ambiguous").length,
      notFound: items.filter((item) => item.status === "not-found" || item.status === "no-fribb-ids").length,
      written: updates.size,
    },
    items,
  };

  if (apply) {
    for (const item of items) {
      const filePath = path.join(TITLES_DIR, item.file);
      const title = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const flags = new Set(title.review.flags ?? []);
      const ids = updates.get(item.file);
      if (ids) {
        if (ids.malId != null) title.malId = ids.malId;
        if (ids.tmdbId != null) {
          title.tmdbId = ids.tmdbId;
          title.tmdbSide = ids.tmdbSide;
        }
        flags.add("id-from-anilist-fribb");
        flags.add("ids-unverified-upstream");
        const chosen = item.chosen;
        if (chosen?.episodes != null && chosen.episodes !== title.totalEpisodes) {
          flags.add(`id-episode-mismatch:${chosen.episodes}vs${title.totalEpisodes}`);
        }
      } else if (item.status === "ambiguous") {
        flags.add("id-ambiguous");
      } else {
        flags.add("id-not-found");
      }
      title.review.flags = [...flags];
      fs.writeFileSync(filePath, `${JSON.stringify(title, null, 2)}\n`, "utf8");
    }
  }

  fs.writeFileSync(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.counts));
  console.log(`report: ${path.relative(process.cwd(), REPORT_FILE)}${apply ? " (applied)" : " (dry run)"}`);
}

main(process.argv).catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exitCode = 1;
});
