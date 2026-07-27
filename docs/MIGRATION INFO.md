# Current-Site Migration

The migration tool copies retirement messages and Last Post notices from the
public WordPress site into CMCEN. It can import message content, source images,
media metadata, and approved comments while preserving available author names
and timestamps.

The combined entrypoint is:

```text
server/scripts/migration/migrate-current-site-content.js
```

It runs these workers in order:

1. `scrape-current-retirements.js`
2. `scrape-current-last-posts.js`

## Sources

- Retirement list: `https://cmcen-rcmce.ca/retirements/retirements-list/`
- French retirement list: `https://cmcen-rcmce.ca/fr/departs-a-la-retraite/liste-des-departs-a-la-retraite/`
- Last Post archive: `https://cmcen-rcmce.ca/last-post-years-archive/`
- French Last Post archive: `https://cmcen-rcmce.ca/fr/dernier-appel-archives-des-annees/`
- WordPress REST API and the linked public detail pages

The retirement worker follows the public table links and resolves their
WordPress records. The Last Post worker follows `/lp/...` archive links,
preferring REST records and falling back to public page HTML where necessary.

## Bilingual Source Inventory

Build the read-only inventory before importing content. It follows both English
and French archive pages, records each source detail page, pairs translations
from alternate-language links when available, and uses the documented Last Post
URL convention as a verified fallback. Records without a confident partner are
left in `unpaired` for review; the import must not guess a translation.

```sh
node server/scripts/migration/build-bilingual-source-inventory.js --limit=3
node server/scripts/migration/build-bilingual-source-inventory.js
```

The full manifest is written to
`server/scripts/migration/output/bilingual-source-inventory.json`. Review the
`summary`, `pairs`, and `unpaired` sections before an apply run. The inventory
does not write to MongoDB or MinIO.

### Resumable Batches

Use batches for the full public crawl. Each batch checkpoints source records to
disk, retries transient source failures with backoff, and spaces requests to
avoid throttling. Repeat the resume command until the manifest reports
`complete: true`.

```sh
node server/scripts/migration/build-bilingual-source-inventory.js \
  --batch-size=25 \
  --checkpoint-every=5 \
  --delay-ms=350

node server/scripts/migration/build-bilingual-source-inventory.js \
  --batch-size=25 \
  --checkpoint-every=5 \
  --delay-ms=350 \
  --resume
```

The checkpoint is stored beside the inventory manifest by default. Do not
discard it until the completed manifest has been reviewed.

## Bilingual Import Dry Run

The manifest-driven import dry run turns completed inventory pairs into unified
English/French import candidates without writing to MongoDB, MinIO, or the CDN.
It also collects approved legacy comments, flags English-only records, identity
fields requiring review, empty page content, missing image URLs, source fetch
failures, and comment-fetch failures.

```sh
node server/scripts/migration/dry-run-bilingual-import.js \
  --input=server/scripts/migration/output/production-bilingual-source-inventory.json \
  --limit=3
```

The dry run writes both a final manifest and a checkpoint after every candidate.
Resume an interrupted batch with the same input and limit:

```sh
node server/scripts/migration/dry-run-bilingual-import.js \
  --input=server/scripts/migration/output/production-bilingual-source-inventory.json \
  --limit=3 \
  --resume
```

The resulting manifest is still read-only. Do not use an apply step until its
content, comment, identity, and placeholder-image reports have been reviewed.

`--apply` is intentionally rejected until the dry-run importer and its manifest
have been fully reviewed.

## Requirements

Install the application dependencies first:

```sh
cd server
npm ci
cd ..
```

Both dry-run and apply modes require network access to the source site. Apply
mode additionally requires a configured `server/.env` with:

- `MONGO_URI`
- `MINIO_ENDPOINT`
- `MINIO_BUCKET_NAME`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_PUBLIC_ENDPOINT`, set to the browser-facing origin such as
  `http://cdn.corebot.ca`; the bucket name is appended automatically

`CDN_PUBLIC_BASE_URL` or `CDN_BASE_URL` can instead provide the complete public
base URL, including the bucket path. Never use the internal `MINIO_ENDPOINT`
hostname in persisted media URLs outside local development.

The target MinIO bucket must already exist.

## Dry Run

Always begin with a limited dry run. It fetches and maps source content without
writing to MongoDB or MinIO:

```sh
node server/scripts/migration/migrate-current-site-content.js --limit=3
```

Run an unlimited dry run after reviewing the sample:

```sh
node server/scripts/migration/migrate-current-site-content.js
```

Separate limits are available when the two archives need different samples:

```sh
node server/scripts/migration/migrate-current-site-content.js \
  --retirement-limit=3 \
  --last-post-limit=2
```

Progress is reported as `x/y` during source collection and import processing.

## Apply

`--apply` writes to MongoDB and MinIO:

```sh
node server/scripts/migration/migrate-current-site-content.js \
  --apply \
  --limit=3 \
  --public-media-base-url=http://cdn.corebot.ca/cmcen-demo
```

After validating the limited batch and manifests, run the full import:

```sh
node server/scripts/migration/migrate-current-site-content.js \
  --apply \
  --public-media-base-url=http://cdn.corebot.ca/cmcen-demo
```

The public media override includes the bucket path and takes precedence over
the container's MinIO variables. Apply mode stops before writing if its public
URL would otherwise resolve through the same endpoint used for internal MinIO
uploads. It prints the resolved public media base URL at startup for review.

The importers use legacy source identifiers for upserts so rerunning the same
source should update existing migrated records rather than intentionally create
duplicates. Back up the target database and bucket before a production apply.

## Content Modes

Use `--content` to narrow a run:

```sh
node server/scripts/migration/migrate-current-site-content.js --content=all
node server/scripts/migration/migrate-current-site-content.js --content=messages
node server/scripts/migration/migrate-current-site-content.js --content=comments
node server/scripts/migration/migrate-current-site-content.js --content=retirements
node server/scripts/migration/migrate-current-site-content.js --content=last-posts
```

| Mode | Retirement messages | Retirement comments | Last Post notices | Last Post comments |
| --- | --- | --- | --- | --- |
| `all` | Yes | Yes | Yes | When readable |
| `messages` | Yes | No | Yes | No |
| `comments` | No | Yes | No | When readable |
| `retirements` | Yes | No | No | No |
| `last-posts` | No | No | Yes | No |

WordPress may reject anonymous REST reads for Last Post comments. Those failures
do not stop the message migration; each affected item records a
`commentFetchError` in the manifest.

## Imported Data

The migration creates or updates:

- `RetirementMessage` and `LastPostMessage` records
- `MediaAsset` records containing UUID, upload context, source link, inferred
  subject name, original file metadata, dimensions, format, and generated
  variants
- Original images and `thumb`, `medium`, `large`, and `hero` WebP variants
- `RetirementComment` and readable `LastPostComment` records
- Ghost users representing legacy owners and original comment authors

Original comment timestamps are preserved when WordPress provides them.

When a legacy post has no source image, returns HTTP 404, or contains image data
that cannot be fully decoded, the importer downloads the canonical CMCEN crest
fallback from the configured CDN and continues. The broken legacy URL,
fallback CDN URL, and fallback reason remain in the media asset metadata.

Other failures are isolated to the affected post. The importer records the post
as `skipped: true` with `failedStage` and `error` fields in the manifest, logs
the numbered skip, and continues with the next item. Startup failures such as
missing configuration or an unavailable database still stop the run.

## Output

Generated manifests are written to `server/scripts/migration/output/`, which is
ignored by Git:

- `current-retirement-scrape-manifest.json`
- `current-last-post-scrape-manifest.json`

Review the manifests for skipped records, missing images, comment access errors,
and mapped source identifiers before and after apply runs.

## Placeholder Image Replacement

The cleanup command finds known legacy crest, Canada flag/statue, TD Insurance,
and Jimmy placeholder images. It defaults to a read-only manifest and changes
all matching published retirement and Last Post image fields to
`https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp` only when run with
`--apply`. Every applied replacement is audit logged.

```sh
node server/scripts/migration/replace-placeholder-images.js
node server/scripts/migration/replace-placeholder-images.js --apply
```

## Individual Workers

The workers can be run directly for focused diagnosis:

```sh
node server/scripts/migration/scrape-current-retirements.js --limit=3
node server/scripts/migration/scrape-current-last-posts.js --limit=3
```

They accept the same `--apply` and `--limit` behavior as the combined tool. The
combined entrypoint is preferred for normal migration runs.
