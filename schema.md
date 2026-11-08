# Schema and invariants

`db.json` is the machine-readable own filler database for the private
`pictorium-anime-filler` repository. It is a **separate artifact** from the
existing Pictorium filler snapshot: the own DB is CC BY-SA 4.0, the snapshot is
CC BY 4.0, and they are never merged into a single licensed file.

**Hard separation:** this is a standalone private data repository. **No Pictorium
integration is performed in this task** — no snapshot regeneration, no
`SLUG_RUNS` edit, and no vendored copy committed to the Pictorium repository.
Vendoring or submodule consumption is a future consumer decision, documented in
`README.md` only as an option.

Current status: **364 titles, 19,625 episode rows imported from
`anime_filler.md`, 20 rows with MAL/TMDB ids, everything `needs-review`**. No
source revision is pinned (`sourceRevision` is `null`) and no MAL/TMDB id is
verified upstream.

## Source priority for future imports

When a title has a table in `anime_filler.md`, that Markdown file is the
**preferred range source** over the audited `out_json` dataset. It preserves the
Manga Canon / Anime Canon / Mixed Canon/Filler / Filler split plus a `Totale`
line, while `out_json` collapses anime-canon into its `canonNumbers` set in the
row data (anime canon survives only as a per-row `subtype` hint, and 4,559 rows
have no subtype at all). `out_json` remains useful as a cross-check for declared
totals and for titles without an md table, but it is not the primary range
source. `anime_filler.md` is the imported range source; `out_json` remains a
cross-check only.

## Top-level shape

```json
{
  "meta": { ... },
  "titles": [ ... ],
  "coverage": { "alreadyCovered": [] }
}
```

### `meta`

| Field | Type | Required value |
|---|---|---|
| `schemaVersion` | integer | `1` |
| `kind` | string | `"pictorium-own-filler-db"` |
| `statusCodes` | string[] | exactly `["canon", "filler", "mixed"]` |
| `sources` | array | Source descriptors; currently `anime_filler.md` (markdown) |
| `licenseBoundary.ownDb` | string | `"CC BY-SA 4.0"` |
| `licenseBoundary.existingSnapshot` | string | `"CC BY 4.0 (separate)"` |
| `contamination.aflHtml` | boolean | `false` |
| `contamination.skipthefillerPages` | boolean | `false` |

### `titles[]`

| Field | Type | Notes |
|---|---|---|
| `slug` | string | Original internal slug, verbatim. Unique. Never invented. |
| `title` | string | Content title coherent with the source rows. Unique in this scaffold. |
| `malId` | integer \| null | Not guessed. `null` until verified. |
| `tmdbId` | integer \| null | Not guessed. `null` until verified. |
| `totalEpisodes` | integer >= 0 | Declared episode count. |
| `source` | string \| null | Provider/dump identifier, only after source + license are confirmed. |
| `sourceRevision` | string \| null | Revision/version of the pinned source. |
| `episodes` | array | Empty is valid. Non-empty rows are strict `1..totalEpisodes` lists, except titles carrying a raw-numbering review flag (see below). |
| `updatedAt` | ISO string | Last edit timestamp. |
| `review.status` | string | `needs-review` or `verified`. |
| `review.flags` | string[] | Diagnostic flags; see below. |
| `provenance.plannedSource` | string | Planned origin, currently a TBD placeholder. |
| `provenance.contamination` | object | Both booleans must be `false`. |

### `episodes[]` (when populated)

```json
{ "number": 1, "status": "canon", "kind": "manga-canon" }
```

| Field | Type | Notes |
|---|---|---|
| `number` | integer | Absolute episode number. Strict rows are 1-based (`1..totalEpisodes`); flagged raw rows preserve the source number verbatim (may be 0 or outside the declared total). |
| `status` | string | `canon`, `filler`, or `mixed` — the schema v1 classification. |
| `kind` | string | Informational source split: `manga-canon`, `anime-canon`, `mixed`, or `filler`. Never used as the classification code. |

`status` vocabulary for schema v1:

- `canon` — the manga-canon family, including what `anime_filler.md` labels
  "Anime Canon".
- `filler`
- `mixed` — Mixed Canon/Filler.

`kind` preserves the `anime_filler.md` split (notably `anime-canon`) as
metadata; do not emit `anime` as an episode `status`. Do not substitute `kind`
for `status`.

**Raw-numbering rows (flag-gated):** `anime_filler.md` tables keep their source
numbering. Titles whose `review.flags` contain `numbering-zero-based`,
`numbering-offset-start`, `partial-unknownRanges`, `md-zero-based-ranges`, a
`md-range-*` flag, or `md-duplicate-range-numbers` are validated structurally
only: `number` must be a non-negative integer, `status`/`kind` must be valid.
For every other title the strict `1..totalEpisodes` gap-free, unique, positive
rule applies.

## Invariants (enforced by `validate-db.mjs`)

1. `meta.kind`, `meta.schemaVersion`, `meta.statusCodes` are exact.
2. Both contamination flags are `false`, in `meta` and in every
   `provenance.contamination`.
3. `titles` has exactly **364** entries (the scaffold baseline; bump the
   validator constant deliberately if the dataset grows).
4. Slugs are unique; non-null MAL/TMDB ids are unique.
5. `episodes: []` is valid for any `totalEpisodes`.
6. Non-empty `episodes` must:
   - use a non-empty string `kind` and a valid `status`;
   - on titles without a raw-numbering review flag: positive integer
     `number`, no duplicates, within `1..totalEpisodes`, covering every
     number in `1..totalEpisodes` with no gaps;
   - on titles carrying a raw-numbering review flag: non-negative integer
     `number`; source numbering, bounds, gaps and duplicates are reviewed via
     the flag instead of being enforced.
7. `review.status` is `needs-review` or `verified`.
8. No row is `verified` without a pinned `source` + `sourceRevision` and a
   second-signal review.

## Diagnostic flags

Original audit flags:

| Flag | Meaning | Current count |
|---|---|---|
| `slug-needs-rename` | Internal slug disagrees with the content title; original slug kept verbatim. | 41 |
| `numbering-zero-based` | Source rows start at 0. | 6 |
| `numbering-offset-start` | Source rows start above 1. | 2 |
| `partial-unknownRanges` | Declared total is the classified count while larger ranges are unknown. | 12 |
| `no-episodes-extracted` / `source-not-pinned` | Baseline for otherwise unflagged rows. | 306 rows (generic only) |

Markdown cross-check flags (diagnostic; imported rows keep these flags):

| Flag | Meaning | Current count |
|---|---|---|
| `md-split-available` | Title has a table in `anime_filler.md`. | 364 |
| `md-no-table` | Title's md entry says "Nessuna tabella". | 0 db rows (8 md-only headings) |
| `md-total-mismatch:<md>vs<json>` | md `Totale` differs from `out_json` total. | 0 |
| `md-range-sum-mismatch:<sum>vs<total>` | Expanded range counts do not sum to md `Totale`. | 2 |
| `md-range-coverage-gap:<n>` | Expanded ranges do not cover the full declared run. | 12 |
| `md-range-out-of-bounds:<n>` | Ranges include numbers outside the declared run. | 12 |
| `md-duplicate-range-numbers:<n>` | A number appears more than once across md segments. | 2 |
| `md-zero-based-ranges` | md ranges include episode 0. | 6 |
| `md-title-not-found` | No md heading matches the db content title. | 0 |

Import and identity flags (2026-11-08):

| Flag | Meaning | Current count |
|---|---|---|
| `episodes-from-md` | Episode rows were expanded from the title's `anime_filler.md` table. | 364 |
| `ids-unverified-upstream` | MAL/TMDB ids came from AniZip/search, not an upstream-confirmed mapping. | 20 |
| `tmdb-sum-mismatch:<tmdb>vs<db>` | TMDB regular-season sum differs from the declared `totalEpisodes`. | 9 |
| `tmdb-id-from-search` | TMDB id resolved via verified search instead of AniZip. | 1 |

`md-split-available` and `episodes-from-md` are present on every title because
the whole DB now comes from the md tables; they are not evidence of a
normalized episode list.

The eight "Nessuna tabella" md headings are **not** db titles:
`Dragon Ball OVAs`, `Ghost in the Shell: SAC_2045`, `Initial D Third Stage`,
`Magia Record: Puella Magi Madoka Magica Side Story`, `RWBY: Ice Queendom`,
`Shaman King`, `SHY`, `The One Piece`. They are reported as diagnostics only and
must not be added as empty rows without a source/identity decision.

## Markdown diagnostic summary (2026-11-08)

- 372 `###` headings; 364 with tables; 8 with "Nessuna tabella".
- 364 table titles; all 364 match an `out_json` content title exactly after
  whitespace/case normalization.
- md totals vs `out_json` totals: **0 mismatches**.
- Range segments vs `Totale`: **2 mismatches** (Pokémon Advanced Generation
  `191 vs 190`; Pokémon: Original series `272 vs 270`).
- Coverage gaps: **12** titles. Out-of-bounds numbers: **12** titles.
- Zero-based md ranges: **6** (Another, Assassination Classroom, Deadman
  Wonderland, Fate/stay night [UBW], Highschool DxD, No Game, No Life).
- Duplicate numbers across segments: **2** titles (the two Pokémon entries).
- Parse errors: **0**.

The six zero-based titles have md and `out_json` totals that agree, so the drift
is in range numbering, not in the declared total. Do not "fix" slugs or totals
from this diagnostic; flags exist to force review before import.

## Validation

```bash
node validate-db.mjs db.json
node --test schema.test.mjs
```

- Exit `0`: valid.
- Exit `1`: schema/invariant violations, printed one per line.
- Exit `2`: file unreadable or invalid JSON.

Both commands are offline, use only the Node.js standard library, and have no
network access.

## Licensing boundary

- Own DB content: CC BY-SA 4.0 (see `LICENSE`).
- Existing Pictorium snapshot: CC BY 4.0, kept separate (see
  `ATTRIBUTION.md`).
- Third-party material (Fandom, Crucible, or other sources) keeps its own
  attribution and license; record it in `source`, `sourceRevision`, and
  `ATTRIBUTION.md` before importing any row.
