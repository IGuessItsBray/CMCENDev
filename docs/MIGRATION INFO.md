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
- Last Post archive: `https://cmcen-rcmce.ca/last-post-years-archive/`
- WordPress REST API and the linked public detail pages

The retirement worker follows the public table links and resolves their
WordPress records. The Last Post worker follows `/lp/...` archive links,
preferring REST records and falling back to public page HTML where necessary.

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

When a legacy post has no source image, or its source image returns HTTP 404,
the importer downloads the `jimmy-crest.webp` fallback from the configured CMCEN
CDN and continues. The broken legacy URL, fallback CDN URL, and fallback reason
remain in the media asset metadata. Other HTTP and network failures still stop
the run so infrastructure problems are visible.

## Output

Generated manifests are written to `server/scripts/migration/output/`, which is
ignored by Git:

- `current-retirement-scrape-manifest.json`
- `current-last-post-scrape-manifest.json`

Review the manifests for skipped records, missing images, comment access errors,
and mapped source identifiers before and after apply runs.

## Individual Workers

The workers can be run directly for focused diagnosis:

```sh
node server/scripts/migration/scrape-current-retirements.js --limit=3
node server/scripts/migration/scrape-current-last-posts.js --limit=3
```

They accept the same `--apply` and `--limit` behavior as the combined tool. The
combined entrypoint is preferred for normal migration runs.
