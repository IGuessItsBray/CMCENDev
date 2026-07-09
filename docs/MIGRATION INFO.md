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
node server/scripts/migration/import-last-post-messages.js
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
node server/scripts/migration/import-last-post-messages.js --apply
node server/scripts/migration/verify-wordpress-migration.js
```
