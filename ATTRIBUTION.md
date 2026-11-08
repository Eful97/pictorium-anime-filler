# Attribution and license boundary

This repository is a separate, private own-filler database. It is **not** a copy
of the existing Pictorium filler snapshot and must not be merged into it.

## Own data

The compilation and, once populated, the episode status classifications in this
repository are released by the repository owner under **CC BY-SA 4.0** (see
`LICENSE`). The owner states that this own data is verified and publishable under
that license. This statement does not cover third-party material, which remains
under its own terms below.

## No AFL / SkipTheFiller content claimed

**No rows in this repository are claimed to originate from Anime Filler List
(AFL) or SkipTheFiller.** The contamination flags in `db.json` are `false` for
`aflHtml` and `skipthefillerPages`, and no AFL HTML or SkipTheFiller page content
is stored here.

If a future contribution ever imports such material, it must be explicitly
recorded, attributed, and reviewed — and this statement must be revised. The
private filler DB is not a scrape of those sites.

## Attribution placeholders

The current `db.json` has **zero episode rows**. Titles, slugs, declared totals,
and diagnostic flags were derived read-only from local audit inputs. No Fandom
article text, Crucible export rows, or episode mappings are included yet.

When rows are imported, replace each placeholder with concrete facts. Do not
publish with unresolved placeholders.

### Fandom

- Status: **placeholder — no Fandom text included yet**
- Article title:
- Article URL:
- Revision ID / permalink:
- Retrieved at (UTC):
- Author attribution (page history / contributors):
- License declared by the page (verify at import time):
- Material used (episode list, ranges, titles):

Fandom wikis commonly license text under a Creative Commons
Attribution-ShareAlike license, but the exact license and attribution
requirements must be verified per page before import. Record the verification
date here.

### Crucible

- Status: **placeholder — no Crucible rows included yet**
- Dataset / product name:
- URL or local export identifier:
- Version / revision / export date:
- Retrieved at (UTC):
- License or permission basis:
- Material used:

The audited `out_json` input may be derived from Crucible or another curated
export. Treat it as an input to verify, not as a license grant. Record the exact
provenance before importing rows.

### `anime_filler.md` range list

- Status: **placeholder — preferred range source, no rows imported yet**
- Local input: `anime_filler.md` (human-readable range list)
- Original source / compiler:
- URL or export identifier:
- Retrieved at (UTC):
- License or permission basis:
- Material used (Manga Canon / Anime Canon / Mixed / Filler ranges, Totale):

The md file is the preferred range source for future imports because it preserves
the anime-canon split that `out_json` collapses. Its own provenance and license
still need to be pinned before any range is copied into `db.json`.

## License boundary vs the existing Pictorium snapshot

| Artifact | License | Relationship |
|---|---|---|
| This own filler DB (`pictorium-anime-filler`) | CC BY-SA 4.0 | Separate artifact |
| Existing Pictorium anime filler snapshot | CC BY 4.0 (separate) | Never merged into this DB |

Rules:

1. Do not merge both datasets into one file and present it under a single
   license.
2. Keep this repository's CC BY-SA 4.0 notices with the own DB.
3. Keep the existing snapshot's CC BY 4.0 notices with that snapshot.
4. Downstream consumers that combine the two must preserve both sets of notices
   and comply with both licenses.
5. Third-party material keeps its own attribution and license; it is not
   relicensed by this repository.

## Reporting attribution or licensing problems

Open an issue in this repository (once it exists) with the title, field, and
source at fault. Do not publish disputed material until the maintainer resolves
the attribution or removes the row.
