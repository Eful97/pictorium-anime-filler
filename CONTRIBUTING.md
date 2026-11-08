# Contributing

Thanks for helping! There are two ways to contribute: request an anime, or fix
and add one yourself.

All contributions are accepted under **CC BY-SA 4.0**. Please do not copy Anime
Filler List (AFL) HTML or SkipTheFiller pages.

## Request an anime

Open the **Add series** issue form and fill in:

- the anime title;
- MAL and/or TMDB id, if you know them;
- the episode count;
- a source link, if you have one.

One anime per issue. Films, OVAs and specials can be requested too — just say so.

## Fix or add an anime (pull request)

1. Edit **one** file: `titles/<slug>.json`. If it does not exist, create it with
   a unique lowercase slug (for example `frieren-beyond-journeys-end.json`).
   Never edit `db.json`: it is generated.
2. Fill `episodes` so the numbers are exactly `1..totalEpisodes`, with no gaps
   and no duplicates:

   ```json
   { "number": 1, "status": "canon", "kind": "manga-canon" }
   ```

   - `status`: `canon`, `filler`, `mixed`
   - `kind`: `manga-canon`, `anime-canon`, `mixed`, `filler`
   - `title` and `airDate` are optional.
3. Set `malId` and `tmdbId` if known (`"tmdbSide": "tv"`); otherwise leave them
   `null`.
4. Run:

   ```bash
   node build-db.mjs
   node validate-db.mjs db.json
   node --test
   ```

5. Open the pull request with **one anime only**. Leave `review.status` as
   `needs-review`.

If you add episode ranges, mention the source in the PR description.

That's it. The full data contract is in [schema.md](schema.md).
