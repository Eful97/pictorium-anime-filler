# Schema and invariants

`db.json` is the machine-readable own filler database for
`pictorium-anime-filler`. It is a **separate artifact** from the existing
Pictorium filler snapshot: this DB is CC BY-SA 4.0, the snapshot is CC BY 4.0,
and they are never merged into a single licensed file.

**Hard separation:** this repository contains data only. Pictorium consumes it
through the generated `anime-filler-own-map.json` snapshot (see
`to-pictorium-snapshot.mjs`); nothing here writes to the Pictorium repository,
and the two snapshots stay separate files with separate licenses.

Current status: **261 titles, 16,023 episode rows imported from
`anime_filler.md`, all with MAL and TMDB ids, everything `needs-review`**. Only
anime with both ids are kept in the database. No source revision is pinned
(`sourceRevision` is `null`) and no id is verified upstream.

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
| `title` | string | Content title coherent with the source rows. Unique in this db. |
| `malId` | integer \| null | Not guessed. `null` until verified. |
| `tmdbId` | integer \| null | Not guessed. `null` until verified. |
| `tmdbSide` | `"tv" \| "movie" \| null` | Optional. Set when `tmdbId` is known: `tv` for series ids usable by the episode banner, `movie` for film/OVA pages. |
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
3. `titles` has exactly **261** entries (the current baseline; bump the
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
| `slug-needs-rename` | Internal slug disagrees with the content title; original slug kept verbatim. | 5 |
| `numbering-zero-based` | Source rows start at 0. | 6 |
| `numbering-offset-start` | Source rows start above 1. | 2 |
| `partial-unknownRanges` | Declared total is the classified count while larger ranges are unknown. | 7 |
| `no-episodes-extracted` / `source-not-pinned` | Baseline for otherwise unflagged rows. | 243 rows (generic only) |

Markdown cross-check flags (diagnostic; imported rows keep these flags):

| Flag | Meaning | Current count |
|---|---|---|
| `md-split-available` | Title has a table in `anime_filler.md`. | 261 |
| `md-no-table` | Title's md entry says "Nessuna tabella". | 0 db rows (8 md-only headings) |
| `md-total-mismatch:<md>vs<json>` | md `Totale` differs from `out_json` total. | 0 |
| `md-range-sum-mismatch:<sum>vs<total>` | Expanded range counts do not sum to md `Totale`. | 0 |
| `md-range-coverage-gap:<n>` | Expanded ranges do not cover the full declared run. | 7 |
| `md-range-out-of-bounds:<n>` | Ranges include numbers outside the declared run. | 7 |
| `md-duplicate-range-numbers:<n>` | A number appears more than once across md segments. | 0 |
| `md-zero-based-ranges` | md ranges include episode 0. | 6 |
| `md-title-not-found` | No md heading matches the db content title. | 0 |

Import and identity flags (2026-11-08):

| Flag | Meaning | Current count |
|---|---|---|
| `episodes-from-md` | Episode rows were expanded from the title's `anime_filler.md` table. | 261 |
| `ids-unverified-upstream` | MAL/TMDB ids came from AniList search or the CC BY 4.0 snapshot, not an upstream-confirmed mapping. | 261 (all with MAL + TMDB) |
| `id-from-anilist-fribb` | Ids resolved by AniList title search + Fribb `anime-list-full.json`. | 241 |
| `id-from-pictorium-primary` | TMDB id taken from Pictorium's CC BY 4.0 snapshot; episode rows stay from the own source. | 4 |
| `id-episode-mismatch:<ani>vs<db>` | AniList entry episode count differs from the db page (franchise/multi-season page). | 125 |
| `tmdb-id-later-season:<n>` | TMDB id withheld because the match is season `n` (local 1-based numbering would be offset). MAL kept. | 4 |
| `id-format-relaxed` | OVA/ONA page accepted for a TV-shaped title when the episode count matches. | 2 |
| `id-ambiguous` / `id-not-found` / `id-format-mismatch` | Unresolved by the resolver; ids stay `null`. | 0 / 0 / 0 |
| `mal-id-duplicate-of:<slug>` / `tmdb-id-duplicate-of:<slug>` | Id already owned by a canonical title; this page keeps `null`. | 0 |
| `tmdb-id-rejected-relaxed:<sum>vs<db>` | Relaxed OVA/ONA match whose TMDB series has a different length; TMDB id removed. | 0 |
| `tmdb-sum-match:<n>` / `tmdb-sum-mismatch:<sum>vs<db>` | TMDB regular-season sum compared with `totalEpisodes`. | 141 / 116 |
| `tmdb-id-from-search` | TMDB id resolved via verified search instead of AniZip. | 1 |

`md-split-available` and `episodes-from-md` are present on every title because
the whole DB now comes from the md tables; they are not evidence of a
normalized episode list.

The eight "Nessuna tabella" md headings are **not** db titles:
`Dragon Ball OVAs`, `Ghost in the Shell: SAC_2045`, `Initial D Third Stage`,
`Magia Record: Puella Magi Madoka Magica Side Story`, `RWBY: Ice Queendom`,
`Shaman King`, `SHY`, `The One Piece`. They are reported as diagnostics only and
must not be added as empty rows without a source/identity decision.

## Markdown diagnostic summary (2026-11-08, source-level)

Counts below describe the `anime_filler.md` source, before the database was
pruned to mapped titles.

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
node build-db.mjs           # regenerate db.json from meta.json + titles/
node build-db.mjs --check   # fail when db.json is stale
node validate-db.mjs db.json
node --test                 # validator + build suites
```

- Exit `0`: valid.
- Exit `1`: schema/invariant violations, printed one per line; `build-db.mjs
  --check` exits `1` when `db.json` is stale.
- Exit `2`: file unreadable or invalid JSON.

All commands are offline, use only the Node.js standard library, and have no
network access.

## Source layout

`db.json` is a generated aggregate. The editable source of truth is:

- `meta.json` — top-level `meta` and `coverage` objects;
- `titles/<slug>.json` — one title object per file, filename equal to `slug`.

`node build-db.mjs` validates unique slugs and unique non-null MAL/TMDB ids,
sorts titles by slug, and rewrites `db.json`. Never edit `db.json` by hand.
`to-pictorium-snapshot.mjs` emits the Pictorium `schemaVersion 2` snapshot
(`manga`/`anime`/`filler`/`mixed` ranges) from the same source data.

## Licensing boundary

- Own DB content: CC BY-SA 4.0 (see `LICENSE`).
- Existing Pictorium snapshot: CC BY 4.0, kept separate (see
  `ATTRIBUTION.md`).
- Third-party material (Fandom, Crucible, or other sources) keeps its own
  attribution and license; record it in `source`, `sourceRevision`, and
  `ATTRIBUTION.md` before importing any row.
