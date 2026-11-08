import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EXPECTED_TITLE_COUNT,
  validateDatabase,
} from "./validate-db.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(here, "db.json");
const validatorPath = path.join(here, "validate-db.mjs");

const baseline = JSON.parse(readFileSync(dbPath, "utf8"));

function clone() {
  return structuredClone(baseline);
}

function errorsAfter(mutate) {
  const db = clone();
  mutate(db);
  return validateDatabase(db);
}

function expectError(errors, pattern) {
  assert.ok(
    errors.some((message) => pattern.test(message)),
    `expected an error matching ${pattern}, got:\n${errors.join("\n")}`
  );
}

test("baseline db.json is valid", () => {
  assert.equal(baseline.titles.length, EXPECTED_TITLE_COUNT);
  assert.deepEqual(validateDatabase(clone()), []);
});

test("empty episodes are valid even with a declared totalEpisodes", () => {
  const errors = errorsAfter((db) => {
    db.titles[0].totalEpisodes = 999;
    db.titles[0].episodes = [];
  });
  assert.deepEqual(errors, []);
});

test("non-empty episodes covering 1..N are valid", () => {
  const errors = errorsAfter((db) => {
    const title = db.titles[0];
    title.totalEpisodes = 3;
    title.episodes = [
      { n: 1, type: "canon" },
      { n: 2, type: "mixed" },
      { n: 3, type: "filler" },
    ];
  });
  assert.deepEqual(errors, []);
});

test("duplicate slugs are rejected", () => {
  const errors = errorsAfter((db) => {
    db.titles[1].slug = db.titles[0].slug;
  });
  expectError(errors, /duplicate slug/);
});

test("episode gaps are rejected", () => {
  const errors = errorsAfter((db) => {
    const title = db.titles[0];
    title.totalEpisodes = 4;
    title.episodes = [
      { n: 1, type: "canon" },
      { n: 2, type: "canon" },
      { n: 4, type: "filler" },
    ];
  });
  expectError(errors, /must cover 1\.\.4 gap-free; missing 1/);
});

test("zero-based episode numbering is rejected", () => {
  const errors = errorsAfter((db) => {
    const title = db.titles[0];
    title.totalEpisodes = 3;
    title.episodes = [
      { n: 0, type: "canon" },
      { n: 1, type: "canon" },
      { n: 2, type: "filler" },
    ];
  });
  expectError(errors, /positive integer.*zero-based/);
});

test("contamination=true is rejected in meta and in per-title provenance", () => {
  const metaErrors = errorsAfter((db) => {
    db.meta.contamination.aflHtml = true;
  });
  expectError(metaErrors, /meta\.contamination/);

  const titleErrors = errorsAfter((db) => {
    db.titles[0].provenance.contamination.skipthefillerPages = true;
  });
  expectError(titleErrors, /provenance\.contamination/);
});

test("a wrong titles count is rejected", () => {
  const errors = errorsAfter((db) => {
    db.titles.pop();
  });
  expectError(errors, /expected 364 entries, got 363/);
});

test("episode type must stay canon|filler|mixed (anime-canon is not a v1 type)", () => {
  const errors = errorsAfter((db) => {
    const title = db.titles[0];
    title.totalEpisodes = 1;
    title.episodes = [{ n: 1, type: "anime" }];
  });
  expectError(errors, /type must be one of canon\|filler\|mixed/);
});

test("verified rows require a pinned source and sourceRevision", () => {
  const errors = errorsAfter((db) => {
    const title = db.titles[0];
    title.review.status = "verified";
    title.totalEpisodes = 1;
    title.episodes = [{ n: 1, type: "canon" }];
  });
  expectError(errors, /verified rows require a pinned source/);
  expectError(errors, /verified rows require a pinned sourceRevision/);
});

test("CLI rejects an invalid database with exit code 1 and a message", () => {
  const tmpDir = mkdtempSync(path.join(here, ".tmp-cli-"));
  try {
    const invalid = clone();
    invalid.titles[1].slug = invalid.titles[0].slug;
    const invalidPath = path.join(tmpDir, "db.json");
    writeFileSync(invalidPath, JSON.stringify(invalid), "utf8");

    const result = spawnSync(process.execPath, [validatorPath, invalidPath], {
      cwd: here,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /INVALID .*: 1 error\(s\)/);
    assert.match(result.stderr, /duplicate slug/);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("CLI accepts db.json with exit code 0", () => {
  const result = spawnSync(process.execPath, [validatorPath, dbPath], {
    cwd: here,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^OK /);
  assert.match(result.stdout, /364 titles/);
});

test("CLI reports an unreadable file as non-zero with a message", () => {
  const missing = path.join(here, "definitely-missing-db.json");
  const result = spawnSync(process.execPath, [validatorPath, missing], {
    cwd: here,
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INVALID INPUT: cannot read/);
});
