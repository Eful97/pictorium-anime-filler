# pictorium-anime-filler

Standalone anime **canon / filler / mixed** episode database, used by
[Pictorium](https://github.com/Eful97/Pictorium) to draw the filler banner on
anime episode thumbnails.

It is a **separate artifact** from Pictorium's existing anime filler snapshot
(CC BY 4.0): the two are never merged into one licensed file. Pictorium's
resolver reads them as two snapshots and applies its own precedence.

> **Status: data imported, review pending.**
> `db.json` is generated from 364 per-title source files and holds 19,625
> episode rows. All titles are `needs-review`: `sourceRevision` is `null`, ids
> are resolved from title search but not verified upstream, and known numbering
> anomalies are flagged instead of guessed. Treat it as a best-effort aid, not
> an authoritative source.

## What it provides

- 364 titles, **19,625 episode rows**, 19,622 declared `totalEpisodes`.
- Per-episode classification:
  - `status`: `canon` | `filler` | `mixed`
  - `kind`: `manga-canon` | `anime-canon` | `mixed` | `filler`
- Identity: **300 MAL ids / 258 TMDB ids** (257 TV + 1 film), flagged
  `ids-unverified-upstream`.
- A generated **Pictorium `schemaVersion 2` snapshot** with
  `manga`/`anime`/`filler`/`mixed` ranges on absolute numbering:
  currently **244 records / 14,535 episodes / 2,247 ranges**.

## Using it with Pictorium

Pictorium's filler banner is driven by `/meta`, which appends
`fill=manga|anime|filler|mixed` to an episode thumbnail URL. The resolver in
`src/lib/anime-filler.ts` is a static, server-only snapshot lookup keyed by
TMDB id (and MAL id).

Generate the snapshot from this repository:

```bash
node to-pictorium-snapshot.mjs   # writes anime-filler-own-map.json
```

Then in Pictorium:

1. Copy `anime-filler-own-map.json` into `src/generated/` next to the existing
   `anime-filler-map.json` (CC BY 4.0). Keep them **separate**.
2. Load both snapshots in `src/lib/anime-filler.ts` with explicit precedence:
   the established CC BY 4.0 snapshot first, this one as a fallback for TMDB ids
   it does not cover. Do not merge records at runtime: the current index marks
   duplicate ids as ambiguous (`null`).
3. Enable the **Filler banner** toggle in Pictorium's miniature settings.

Only titles that satisfy both conditions are emitted:

- a TV TMDB id (`tmdbSide: "tv"`); film/OVA pages are skipped;
- episode rows covering exactly `1..totalEpisodes` with positive, unique,
  gap-free numbers.

Everything else is listed in the snapshot's `meta.skipped` with a reason. This
is intentional: a missing banner is better than a wrong one.

## Source of truth

```
meta.json                 top-level meta + coverage
titles/<slug>.json        one title object per file (edit this)
db.json                   generated aggregate; never edit by hand
```

`node build-db.mjs` validates unique slugs and unique non-null MAL/TMDB ids,
sorts titles by slug, and rewrites `db.json`. `node build-db.mjs --check` fails
when `db.json` is stale (CI-friendly).

## Validate

Requirements: Node.js (tested with v26.4.0). No dependencies, no network.

```bash
node build-db.mjs           # regenerate db.json
node build-db.mjs --check   # fail if db.json is stale
node validate-db.mjs db.json
node --test                 # validator + build suites (23 tests)
```

The validator exits `0` for a valid database, `1` for schema/invariant
violations, and `2` when the input cannot be read or parsed.

## Contributing

- Read [`CONTRIBUTING.md`](CONTRIBUTING.md).
- Request a missing series with the
  [Add-series issue form](../../issues/new?template=add-series.yml): title plus
  a TMDB regular-season episode count suggestion only; never precompiled filler
  or mixed ranges.
- Submit a mapping for **one series** with the
  [pull request template](.github/pull_request_template.md): edit
  `titles/<slug>.json`, keep ranges and N on the same run, cite source and
  revision, and leave `node build-db.mjs --check`, the validator and the tests
  green.

Contributions are accepted under CC BY-SA 4.0.

## Id resolution tools

The id fields can be rebuilt with the checked-in scripts (network access is only
used by `fill-ids.mjs` and `verify-tmdb-ids.mjs`):

| Script | Purpose |
|---|---|
| `fill-ids.mjs` | AniList `Page.media(search:)` title match + Fribb `anime-list-full.json` for MAL↔TMDB ids. |
| `refine-id-report.mjs` | Applies season/format rules: TMDB only for season 1, relaxed OVA/ONA, movie/array normalization. |
| `apply-id-report.mjs` | Writes the final decisions into `titles/<slug>.json`, with global deduplication. |
| `verify-tmdb-ids.mjs` | Compares each TV id's regular-season sum with `totalEpisodes` and records `tmdb-sum-*` flags. |

`id-report.json` keeps every decision, the chosen AniList/Fribb ids and the
unresolved titles.

## Known limitations

- **64 titles have no id**: film/OVA/special compilations, franchise pages that
  span multiple TMDB series (Pokémon groupings, Monogatari, JoJo TV) and fan
  edits. They are left `null` on purpose.
- **42 MAL-only titles**: the match is a later TMDB season, so the TMDB id is
  withheld (`tmdb-id-later-season`) to avoid shifted episode numbering.
- Numbering anomalies are flagged, not silently fixed: 6 zero-based runs,
  12 coverage gaps, 2 range-sum mismatches, 2 duplicate-number sets.
- 41 `slug-needs-rename` titles keep their original slug verbatim.
- All ids are unverified upstream; TMDB sums are recorded per title
  (140 exact, 117 mismatched, mostly multi-season franchise pages).

## Licensing and attribution

- **This database: CC BY-SA 4.0** — full legal code in [`LICENSE`](LICENSE);
  attribution and changes in [`NOTICE`](NOTICE) and
  [`ATTRIBUTION.md`](ATTRIBUTION.md).
- **Pictorium's existing snapshot: CC BY 4.0, kept separate.** The two artifacts
  must never be merged into a single licensed file.
- **Ids**: resolved via AniList title search and
  [Fribb/anime-lists](https://github.com/Fribb/anime-lists). Ids are factual
  identifiers; Fribb's own upstream terms remain under review (documented in
  Pictorium's anime id-mapping notes).
- Episode ranges derive from the local `anime_filler.md` list. No Anime Filler
  List (AFL) HTML or SkipTheFiller page content is included
  (`contamination` flags are `false`).

### Before opening the repository publicly

The code and documentation are ready to be public, but the **data provenance is
not yet fully pinned**. Before publishing as an authoritative public dataset:

1. Pin the origin, revision and license of `anime_filler.md` and record it in
   `source` / `sourceRevision` and `ATTRIBUTION.md`.
2. Verify MAL/TMDB ids against their upstream sources; almost every title still
   carries `ids-unverified-upstream`.
3. Review the flagged numbering anomalies and the `slug-needs-rename` set.
4. Keep the CC BY-SA 4.0 (this DB) and CC BY 4.0 (Pictorium snapshot) notices
   separate in any redistribution.

## License boundary

| Artifact | License | Relationship |
|---|---|---|
| This database (`pictorium-anime-filler`) | CC BY-SA 4.0 | Separate artifact |
| Pictorium existing anime filler snapshot | CC BY 4.0 | Never merged into this DB |

Downstream consumers that combine the two must preserve both sets of notices and
comply with both licenses.
