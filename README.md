# pictorium-anime-filler

Standalone, private database of anime canon/filler/mixed episode
classifications. It is a **separate artifact** from Pictorium's existing anime
filler snapshot and is **not** merged into it.

**Hard separation:** this repository is standalone private data. **No Pictorium
integration is performed in this task** — no snapshot regeneration, no
`SLUG_RUNS` edit, and no vendored copy committed to the Pictorium repository.
Vendoring or submodule consumption is a **future consumer decision**, documented
below only as an option, not implemented here.

> **Current status: scaffold only.**
> `db.json` contains 364 title stubs derived read-only from local audit inputs.
> **No episode rows have been imported.** Every title is `needs-review`, has no
> pinned source, and has no MAL/TMDB id. The audit found slug/content-title
> mismatches and numbering anomalies that must be resolved before any row is
> trusted.

## Why private

The repository is intended to stay **private** until the data has been reviewed,
sources and attribution are pinned, and the license boundary is confirmed for the
intended distribution. Private visibility does not change the license: recipients
of the data receive it under CC BY-SA 4.0 (see `LICENSE` and `ATTRIBUTION.md`).

## License

- This own filler DB: **CC BY-SA 4.0** (placeholder text in `LICENSE`; full legal
  code to be added before publication).
- Pictorium's existing filler snapshot: **CC BY 4.0, kept separate**. The two
  artifacts are never merged into a single licensed file.
- See `ATTRIBUTION.md` for source attribution placeholders and the explicit
  no-AFL / no-SkipTheFiller claim.

## What is in `db.json`

`db.json` is valid against `validate-db.mjs` and contains:

| Item | Value |
|---|---|
| Schema | `pictorium-own-filler-db`, schemaVersion `1` |
| Status codes | `canon`, `filler`, `mixed` |
| Titles | 364 |
| Episode rows | 0 (none imported) |
| Sum of `totalEpisodes` | 19,622 (declared counts only; not extracted rows) |
| Unique slugs / titles | 364 / 364 |
| Rows with MAL/TMDB ids | 0 |
| Rows with a pinned source | 0 |
| Rows flagged `slug-needs-rename` | 41 |
| Rows flagged `numbering-zero-based` | 6 |
| Rows flagged `numbering-offset-start` | 2 |
| Rows flagged `partial-unknownRanges` | 12 |
| Rows flagged `md-split-available` | 364 |

Each title is derived from the **content title** (`title.title`) in the audited
dataset, while `slug` preserves the original internal slug verbatim. Mismatched
files are flagged; no corrected slug is invented. Flags are explained in
`schema.md`.

## Preferred range source: `anime_filler.md`

For future imports, the human-readable `anime_filler.md` range list is the
**preferred range source over `out_json`**. It preserves the Manga Canon / Anime
Canon / Mixed Canon/Filler / Filler split plus a `Totale` line, while `out_json`
collapses anime-canon into `canonNumbers` and keeps it only as a per-row
`subtype` hint (4,559 rows have no subtype). `out_json` remains a cross-check for
declared totals and for titles without an md table. **No rows are imported from
either source by this scaffold.**

Diagnostic-only md cross-check (no rows imported, `episodes[]` stays empty):
372 `###` headings, 364 with tables, 8 "Nessuna tabella"; 0 md-vs-JSON total
mismatches; 2 range-sum mismatches; 12 coverage gaps; 6 zero-based md range sets;
0 parse errors. Details and flags are in `schema.md`.

## Future consumption (option, not part of this task)

If a future consumer decision adopts this DB, the supported options are:

1. **Vendored copy:** copy `db.json` into the consuming repository (or its build
   context), commit the copy, and read it as a local file during build. Record
   the source commit/tag of this repository in the vendoring commit.
2. **Private submodule:** add this repository as a Git submodule and check it out
   in CI with a **read-only deploy key** or a CI token scoped to this repository.
   The build reads the checked-out `db.json`; no runtime request to GitHub is
   made.

Do not expose this repository, deploy keys, or tokens to clients, poster URLs, or
runtime logs. **No vendoring, submodule, snapshot regeneration, or other
Pictorium write is performed by this scaffold.**

## Repository layout

```
README.md                              this file
LICENSE                                CC BY-SA 4.0 placeholder
ATTRIBUTION.md                         attribution placeholders + license boundary
CONTRIBUTING.md                        contribution workflow (PR and issue request)
db.json                                364 title stubs, zero episode rows
schema.md                              schema, invariants, flags, md diagnostics
validate-db.mjs                        offline validator (node stdlib only)
schema.test.mjs                        node:test suite for the validator
.github/ISSUE_TEMPLATE/add-series.yml  Add-series issue form
.github/ISSUE_TEMPLATE/config.yml      issue template configuration
.github/pull_request_template.md       one-series PR checklist
```

## Validate locally

Requirements: Node.js (tested with v26.4.0). No dependencies, no network.

```bash
node validate-db.mjs db.json
node --test schema.test.mjs
```

The validator exits `0` for a valid database, `1` for schema/invariant
violations, and `2` when the input cannot be read or parsed.

## Contributing

- Read [`CONTRIBUTING.md`](CONTRIBUTING.md) for the full workflow.
- Request a missing series with the
  [Add-series issue form](../../issues/new?template=add-series.yml): title plus a
  TMDB regular-season episode count suggestion only; never precompiled filler or
  mixed ranges.
- Submit a mapping for **one series** with the
  [pull request template](.github/pull_request_template.md): ranges plus N cover
  the same run, source and revision cited, validator and tests green.

The workflow mirrors the local helper `create_title_issues.py`: titles-only
requests, TMDB N suggestion only, no precompiled ranges, `VERIFIED` titles
skipped, and films/OVAs/specials/movies excluded from series requests.

## Create the GitHub repository later (DO NOT RUN in this task)

The following commands are **documentation only**. They were **not executed**
while producing this scaffold, and no GitHub repository, remote, git history, or
push exists yet. Run them only after an explicit decision to publish.

```bash
cd pictorium-anime-filler
git init
git add .
git commit -m "chore: scaffold own anime filler DB"
gh auth login
gh repo create pictorium-anime-filler --private --source=. --remote=origin --push
```

**DO NOT RUN in this task.** Creating the repository, authenticating `gh`, and
pushing are out of scope for the scaffold. This task also performed **no GitHub
operations and no Pictorium repository writes**.

## Before importing episode rows

1. Confirm the source and its license for each title, then set `source` and
   `sourceRevision` (never invent ids).
2. Prefer the `anime_filler.md` table for ranges; keep the anime-canon split as
   metadata, but use `type: canon` in schema v1.
3. Resolve the 41 `slug-needs-rename` flags by review; do not rename blindly.
4. Normalize 1-based numbering and fill coverage gaps, or keep `totalEpisodes`
   consistent with what is actually classified and keep the
   `partial-unknownRanges` flag.
5. Fill `episodes` so it covers exactly `1..totalEpisodes` with no gaps or
   duplicates, using `{n,title?,airDate?,type}`.
6. Set `review.status` to `verified` only after the maintainer's second-signal
   check, and update `updatedAt`.
7. Run `node validate-db.mjs db.json` and `node --test schema.test.mjs`.

See `schema.md` and `CONTRIBUTING.md` for the full contract.
