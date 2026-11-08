# Contributing

This is a **standalone data repository**, consumed by Pictorium through the
generated `anime-filler-own-map.json` snapshot. Changes here never write to the
Pictorium repository: the snapshot is copied (or vendored/submoduled) by the
consumer, and the two licensed files stay separate — CC BY-SA 4.0 here, CC BY
4.0 for Pictorium's existing snapshot.

All contributions are accepted under **CC BY-SA 4.0**. By submitting a pull
request or issue content, you agree that your contribution may be published
under that license. Never copy AFL (Anime Filler List) HTML or SkipTheFiller
pages into this repository.

## Two ways to contribute

### A. Pull request (one series)

Edit **exactly one** file, `titles/<slug>.json`, per pull request. Never edit
the generated `db.json` by hand.

1. Locate the title file by its content title/slug. Do not invent a corrected
   slug; the 41 `slug-needs-rename` rows keep the original slug until review.
2. Fill `episodes[]` so it covers exactly `1..totalEpisodes`, gap-free, using:

   ```json
   { "number": 1, "status": "canon", "kind": "manga-canon", "title": "Episode title (optional)", "airDate": "2024-01-01" }
   ```

   `number` is an **absolute, 1-based** episode number. `status` is `canon`,
   `filler`, or `mixed`; `kind` is `manga-canon`, `anime-canon`, `mixed`, or
   `filler`. Do not use zero-based numbering, duplicates, or gaps.
3. Pin the origin with `source` and `sourceRevision`, and cite the attribution in
   the PR description (page URL/revision, dataset version, retrieval date).
4. Keep `provenance.contamination.aflHtml` and `skipthefillerPages` `false`.
5. Rebuild the aggregate, then validate:

   ```bash
   node build-db.mjs
   node build-db.mjs --check
   node validate-db.mjs db.json
   node --test
   ```

6. Set `review.status` to `verified` **only after** the maintainer's
   second-signal check. Otherwise leave `needs-review` and explain what is
   pending.
7. For a partial/ongoing run, state the declared window explicitly and keep
   `totalEpisodes` consistent with what is actually classified. Flag it rather
   than padding with invented rows.

PRs must use `.github/pull_request_template.md`. One series per PR; split
unrelated changes.

### B. Issue request (Add series)

If you do not have the mapping yet, request the series with the
[Add-series issue form](../../issues/new?template=add-series.yml). The local helper
`create_title_issues.py` follows the same rules:

- use **only the series title** from `anime_filler.md`;
- optionally suggest **N** from TMDB: sum of regular-season `episode_count`
  values with **season 0/specials excluded**;
- **never precompile filler or mixed ranges** in the request;
- one series per issue;
- skip titles already in the helper's `VERIFIED` set — currently Claymore,
  Ouran High School Host Club, Rave Master, Kirby: Right Back at Ya!, Handa-kun,
  Nadia: The Secret of Blue Water, Gurren Lagann, and Sket Dance;
- skip films, OVAs, OADs, specials, and movies (`SKIP_WORDS`); they are not
  series requests.

The maintainer curates the ranges and identity before any row is added.

## Vocabulary (schema v1)

| `status` | Meaning |
|---|---|
| `canon` | Manga-canon family, including what `anime_filler.md` labels "Anime Canon". |
| `filler` | Not in the manga / filler episodes. |
| `mixed` | Mixed Canon/Filler episodes. |

`anime_filler.md` preserves a distinct **Anime Canon** split: `status` stays
`canon`, and `kind` records `manga-canon` or `anime-canon`. Do not emit
`status: "anime"` in schema v1.

## Numbering and N gate

- Episode numbers are **absolute and 1-based**: `1..N`, no gaps, no duplicates.
- `totalEpisodes` must equal the declared run length covered by `episodes[]`.
- **TMDB N gate:** N is the sum of regular seasons' episode counts; **season 0 is
  excluded**. Record the TMDB TV id and the retrieval date. N is a suggestion in
  issue requests; the maintainer rechecks it before merge.
- Ranges plus N must describe the same run, or the request must declare an
  ongoing/partial window explicitly.

## Maintainer checks before merge

- Series identity: correct franchise/season, not a film/OVA/special.
- TMDB TV id and regular-season episode sum (season 0 excluded).
- Source + revision cited; attribution and license confirmed.
- Absolute numbering covers `1..N` gap-free; `status`/`kind` vocabulary valid.
- No AFL or SkipTheFiller content; contamination flags remain `false`.
- `db.json` stays at **364 titles** unless the dataset is deliberately expanded
  (then update the validator constant and tests).
- `db.json` is current: `node build-db.mjs --check` passes (no hand edit).
- `node validate-db.mjs db.json` and `node --test` pass.
- Contribution accepted under CC BY-SA 4.0 and license boundary preserved.

## Out of scope

- No direct edits to the Pictorium repository, `SLUG_RUNS` changes, or merging
  the two filler artifacts into one licensed file from this repository.
- No episode-row import from untrusted, unlicensed or AFL/SkipTheFiller sources.
- No guessed MAL/TMDB ids and no blind slug renames.
