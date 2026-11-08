import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DB_FILE, loadSource, serializeDb } from "./build-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const buildPath = path.join(here, "build-db.mjs");

function makeTree(files) {
  const root = mkdtempSync(path.join(here, ".tmp-build-"));
  mkdirSync(path.join(root, "titles"), { recursive: true });
  writeFileSync(
    path.join(root, "meta.json"),
    JSON.stringify({ meta: { schemaVersion: 1 }, coverage: { alreadyCovered: [] } }),
    "utf8",
  );
  for (const [name, value] of Object.entries(files)) {
    writeFileSync(path.join(root, "titles", `${name}.json`), JSON.stringify(value), "utf8");
  }
  return root;
}

function title(slug, overrides = {}) {
  return {
    slug,
    title: slug,
    malId: null,
    tmdbId: null,
    totalEpisodes: 0,
    source: null,
    sourceRevision: null,
    episodes: [],
    updatedAt: "2026-11-08T00:00:00.000Z",
    review: { status: "needs-review", flags: [] },
    provenance: { plannedSource: "TBD", contamination: { aflHtml: false, skipthefillerPages: false } },
    ...overrides,
  };
}

test("source tree reconstructs the committed db.json", () => {
  const db = loadSource(here);
  assert.equal(db.titles.length, 261);
  assert.equal(serializeDb(db), readFileSync(path.join(here, DB_FILE), "utf8"));
});

test("titles are emitted in deterministic slug order", () => {
  const db = loadSource(here);
  const slugs = db.titles.map((entry) => entry.slug);
  assert.deepEqual(slugs, [...slugs].sort());
});

test("a slug that does not match its filename is rejected", () => {
  const root = makeTree({ "alpha": title("beta") });
  try {
    assert.throws(() => loadSource(root), /does not match the filename/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("duplicate TMDB ids across titles are rejected", () => {
  const root = makeTree({
    alpha: title("alpha", { tmdbId: 42 }),
    beta: title("beta", { tmdbId: 42 }),
  });
  try {
    assert.throws(() => loadSource(root), /duplicate tmdbId 42/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--check fails when db.json is stale", () => {
  const root = mkdtempSync(path.join(here, ".tmp-build-"));
  try {
    mkdirSync(path.join(root, "titles"), { recursive: true });
    writeFileSync(
      path.join(root, "meta.json"),
      JSON.stringify({ meta: { schemaVersion: 1 }, coverage: { alreadyCovered: [] } }),
      "utf8",
    );
    writeFileSync(path.join(root, "titles", "alpha.json"), JSON.stringify(title("alpha")), "utf8");
    writeFileSync(path.join(root, DB_FILE), "{}\n", "utf8");

    const result = spawnSync(process.execPath, [buildPath, "--check"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /is stale/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
