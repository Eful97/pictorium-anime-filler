# pictorium-anime-filler

Episode-level **canon / filler / mixed** classifications for anime, used by
[Pictorium](https://github.com/Eful97/Pictorium) to draw the filler banner on
episode thumbnails.

## Status

- **261 anime** supported, all with MAL and TMDB ids.
- **16,023 episode rows**.
- **248 anime** are emitted in the Pictorium snapshot; the other 13 are skipped
  because their episode numbering needs review.
- Every title is `needs-review`: ids are resolved but not verified upstream.

The complete list is in [SUPPORTED.md](SUPPORTED.md).

## Use with Pictorium

```bash
node to-pictorium-snapshot.mjs   # writes anime-filler-own-map.json
```

Copy the snapshot into Pictorium's `src/generated/` as a **separate file** next
to its CC BY 4.0 snapshot, and load it as the **preferred source** in
`src/lib/anime-filler.ts` (the CC BY 4.0 snapshot is the fallback). Never merge
the two files at runtime. Then enable the Filler banner in the miniature
settings.

Pictorium refreshes this snapshot at runtime by default (every 24 hours) from
the public raw URL; set `PICTORIUM_FILLER_OWN_URL=off` to disable it.

Only anime with a TV TMDB id and exact `1..totalEpisodes` coverage are emitted.

## Files

```
meta.json            database meta + coverage
titles/<slug>.json   one anime per file (edit this)
db.json              generated aggregate; never edit by hand
SUPPORTED.md         full list of supported anime
anime-filler-own-map.json   generated Pictorium snapshot
```

## Commands

```bash
node build-db.mjs           # regenerate db.json
node build-db.mjs --check   # fail if db.json is stale
node validate-db.mjs db.json
node --test                 # 23 tests
```

## Contributing

- **Request an anime:** open the “Add series” issue.
- **Fix or add one:** edit `titles/<slug>.json` and open a pull request.

That's all — details in [CONTRIBUTING.md](CONTRIBUTING.md). Contributions are
accepted under CC BY-SA 4.0.

## License

This database is **CC BY-SA 4.0** (see `LICENSE` and `NOTICE`).

**You may reuse it, in whole or in part — but you must state where it comes
from.** Any copy, extract, adaptation or derivative database has to credit the
source with the project name, the repository URL and the license link:

> Data from **pictorium-anime-filler** —
> https://github.com/Eful97/pictorium-anime-filler — licensed under
> CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).
> Changes: <describe what you changed>.

In italiano: il database si può usare e riutilizzare, ma **devi indicare da dove
proviene** — nome del progetto, URL del repository e link alla licenza
CC BY-SA 4.0, segnalando le eventuali modifiche.

Pictorium's existing filler snapshot is **CC BY 4.0** and stays a separate file:
the two are never merged. Episode ranges derive from `anime_filler.md`, whose
provenance and license are still unpinned; treat this dataset as best-effort, not
authoritative.
