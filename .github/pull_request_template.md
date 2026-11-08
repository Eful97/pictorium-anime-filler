## Checklist

- [ ] **One series only** — this PR changes exactly one title in `db.json`.
- [ ] **Absolute numbering** — episode numbers are 1-based and `episodes[]` covers
      exactly `1..totalEpisodes` with no gaps or duplicates.
- [ ] **TMDB regular-season sum verified** — N is the sum of regular seasons'
      `episode_count`, season 0/specials excluded. TMDB TV id and retrieval date:
      `...`
- [ ] **Ranges + N cover the same run** — or this PR declares an ongoing/partial
      window explicitly and keeps `totalEpisodes` consistent with the classified
      rows.
- [ ] **Source + revision cited** — `source` and `sourceRevision` are pinned, and
      `ATTRIBUTION.md` is updated with URL/revision/retrieval date and license.
- [ ] **No AFL / SkipTheFiller content** — no AFL HTML or SkipTheFiller page
      copies; both contamination flags remain `false`.
- [ ] **Validator and tests green** — output of `node validate-db.mjs db.json`
      and `node --test schema.test.mjs` attached below.
- [ ] **License accepted** — contribution is offered under CC BY-SA 4.0, and the
      CC BY 4.0 snapshot boundary is preserved (no merged licensed file).
- [ ] **Review status** — `review.status` is `verified` only after a second-signal
      check; otherwise it stays `needs-review` with the pending flags listed.
- [ ] **No invented identity** — no guessed MAL/TMDB ids and no blind slug rename;
      unresolved `slug-needs-rename` rows keep their original slug.
- [ ] **Schema v1 types** — `type` is `canon`, `filler`, or `mixed`; anime-canon
      is carried as md metadata, not as a v1 `type`.
- [ ] **No Pictorium integration here** — no Pictorium repository edits,
      snapshot regeneration, `SLUG_RUNS` change, or vendored copy in this PR.

## Validation output

```text
paste node validate-db.mjs db.json and node --test schema.test.mjs output here
```

## Notes for the maintainer

<!-- identity checks, season split, source/license caveats, partial windows -->
