# WordPress Posts Migration

This toolkit migrates selected WordPress post data into the MongoDB app.

## Source Files

Default source paths assume the phpMyAdmin exports are in `~/Downloads`:

- `wp_posts-3.sql`
- `wp_postmeta-3.sql`
- `wp_comments-3.sql`
- `a.csv`

## Flow

```sh
node server/scripts/migration/parse-wordpress-dumps.js
node server/scripts/migration/download-wordpress-images.js --limit 10
node server/scripts/migration/upload-wordpress-images.js
node server/scripts/migration/import-retirement-messages.js
```

The upload and import scripts are dry-run by default. Add `--apply` to write to
MinIO or MongoDB.

## Outputs

Generated files are written to `server/scripts/migration/output/` by default:

- `wordpress-migration-manifest.json`
- `wordpress-migration-summary.json`
- `wordpress-migration-review.json`
- `wordpress-image-download-manifest.json`
- `wordpress-image-local-manifest.json`
- `wordpress-image-upload-manifest.json`

## Apply Commands

```sh
node server/scripts/migration/download-wordpress-images.js
node server/scripts/migration/upload-wordpress-images.js --apply
node server/scripts/migration/import-retirement-messages.js --apply
node server/scripts/migration/verify-wordpress-migration.js
```

## Live Retirement Scrape

Use this path when importing directly from the current public CMCEN WordPress
site instead of phpMyAdmin export files.

The scraper starts from the public retirement list and follows each table link
back through WordPress REST. If that page cannot produce retirement links, it
falls back to the WordPress retirement category scan.

```text
https://cmcen-rcmce.ca/retirements/retirements-list/
```

It uses the WordPress REST API to import retirement messages, source photos,
generated media variants, media asset records, and approved WordPress comments.

### Dry Run

Run this first. It reads from WordPress, builds a local manifest, and does not
write to MongoDB or MinIO.

```sh
node server/scripts/migration/scrape-current-retirements.js
```

To test only a small slice:

```sh
node server/scripts/migration/scrape-current-retirements.js --limit=3
```

### Apply

This writes to MongoDB and MinIO/CDN:

```sh
node server/scripts/migration/scrape-current-retirements.js --apply
```

To apply only a limited test batch:

```sh
node server/scripts/migration/scrape-current-retirements.js --apply --limit=3
```

### What It Creates Or Updates

- `RetirementMessage` documents, upserted by `legacy.source` and
  `legacy.wordpressPostId`.
- `MediaAsset` documents for retirement photos.
- Original image objects plus `thumb`, `medium`, `large`, and `hero` WebP
  variants in MinIO.
- `RetirementComment` documents for approved WordPress comments, upserted by
  `legacy.wordpressCommentId`.
- A ghost `User` named `LegacyImport` for retirement message ownership fields:
  `createdBy`, `updatedBy`, `reviewedBy`, and `publishedBy`.
- Ghost `User` documents for original WordPress comment authors, so imported
  comments display with the original commenter names.

### Required Environment

The script loads `server/.env`. For `--apply`, these values must be set:

- `MONGO_URI`
- `MINIO_ENDPOINT`
- `MINIO_BUCKET_NAME`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`

The CDN URL is built through `server/services/media-library.js`, using
`CDN_PUBLIC_BASE_URL`, `CDN_BASE_URL`, or `MINIO_ENDPOINT/MINIO_BUCKET_NAME`.

### Output

The dry-run and apply modes both write:

```text
server/scripts/migration/output/current-retirement-scrape-manifest.json
```

The manifest includes the WordPress post IDs, mapped retiree fields, retirement
dates parsed from article text, source image URLs, media keys, and imported
comment summaries.

## Retirement Media Linking

Use this reconciliation script when retirement messages already exist and media
assets already exist, but the admin media manager shows images as unattached or
the retirement message needs its media reference repaired.

### Dry Run

```sh
node server/scripts/migration/link-retirement-media.js
```

This scans MongoDB, matches retirement messages to `MediaAsset` records, and
writes a local report. It does not update the database.

### Apply

```sh
node server/scripts/migration/link-retirement-media.js --apply
```

This updates matched retirement messages by:

- setting `photoUrl` to the matched media asset URL
- setting `legacy.mediaAssetKey`
- setting `legacy.mediaLinkedAt`

### Matching Rules

The script matches in this order:

- existing `legacy.mediaAssetKey`
- current `photoUrl` resolved to a media object key
- WordPress post ID embedded in imported media paths like
  `legacy/current-site/retirements/{postId}-{slug}/original.jpg`
- retirement title against media asset display names

### Output

The script writes:

```text
server/scripts/migration/output/retirement-media-link-manifest.json
```

The manifest reports how many retirement messages were scanned, matched,
changed, and left unmatched.

## Live Last Post Scrape

Use this path when importing Last Post notices directly from the current public
CMCEN WordPress site.

The scraper pulls Last Post links from the years archive:

```text
https://cmcen-rcmce.ca/last-post-years-archive/
```

It follows `/lp/...` links from that archive, resolves WordPress REST records
when available, and otherwise parses the public Last Post detail HTML directly.
If the archive cannot be scanned, it falls back to the WordPress Last Post
category `lp-category`. It imports Last Post notice content and source photos.
It also imports approved WordPress comments using the real WordPress post IDs
exposed on the `/lp/...` pages when WordPress permits anonymous REST comment
reads; blocked comment endpoints are recorded per item in the manifest as
`commentFetchError`.

### Dry Run

```sh
node server/scripts/migration/scrape-current-last-posts.js
```

To test only a small slice:

```sh
node server/scripts/migration/scrape-current-last-posts.js --limit=3
```

### Apply

This writes to MongoDB and MinIO/CDN:

```sh
node server/scripts/migration/scrape-current-last-posts.js --apply
```

### Output

The dry-run and apply modes both write:

```text
server/scripts/migration/output/current-last-post-scrape-manifest.json
```

## Current Site Migration

Use this script for the combined live-site migration. It runs the retirement
and Last Post importers in order, including media upload metadata and approved
WordPress comments.

### Dry Run

```sh
node server/scripts/migration/migrate-current-site-content.js
```

Useful limited dry run:

```sh
node server/scripts/migration/migrate-current-site-content.js --limit=3
```

Separate limits can be used when one archive needs a smaller sample:

```sh
node server/scripts/migration/migrate-current-site-content.js --retirement-limit=3 --last-post-limit=3
```

### Apply

This writes to MongoDB and MinIO/CDN:

```sh
node server/scripts/migration/migrate-current-site-content.js --apply
```

### Content Modes

```sh
node server/scripts/migration/migrate-current-site-content.js --content=messages
node server/scripts/migration/migrate-current-site-content.js --content=comments
node server/scripts/migration/migrate-current-site-content.js --content=retirements
node server/scripts/migration/migrate-current-site-content.js --content=last-posts
```

The default `--content=all` imports messages and comments together. Comments
are imported under ghost users named after the original WordPress commenters,
with original publish timestamps preserved when WordPress provides them.
