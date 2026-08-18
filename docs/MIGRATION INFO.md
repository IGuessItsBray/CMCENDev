# Reviewed Workbook Migration

The reviewed bilingual workbook is the sole source of truth for the legacy
content migration. It is committed with the importer at:

```text
server/scripts/migration/import/cmcen_export_latest.xlsx
```

The importer reads the `Inventory`, `English Messages`, `French Messages`, and
`Media & Comments` sheets. Before any work begins, it validates record IDs,
source post IDs, and translation groups.

## Dry Run

Run this from `server/`. It validates the full workbook but processes only the
requested sample, writing no database or storage changes.

```sh
node scripts/migration/import-workbook-inventory.js \
  --input=./scripts/migration/import/cmcen_export_latest.xlsx \
  --limit=10
```

The manifest is written to:

```text
server/scripts/migration/output/workbook-inventory-import-manifest.json
```

## Apply

Apply mode downloads image sources, writes the original plus responsive WebP
variants to MinIO, then upserts messages and parsed comments. Re-running the
same workbook is idempotent: matching legacy records are updated rather than
duplicated.

```sh
node scripts/migration/import-workbook-inventory.js \
  --input=./scripts/migration/import/cmcen_export_latest.xlsx \
  --apply \
  --public-media-base-url=https://cdn.corebot.ca/cmcen-demo
```

Fully bilingual records are published. Single-language records are imported as
pending so they do not appear publicly before translation. Non-image attachments
are recorded in the manifest and skipped.

CMCEN crest, Jimmy statue, and TD Insurance placeholder images are never
uploaded. They reuse `https://cdn.corebot.ca/cmcen-demo/images/branch-crest/large.webp`
instead. Records with no usable image use that same branch crest fallback;
unit-specific crests and normal photos continue through the media import.

## Requirements

Apply mode requires `MONGO_URI`, the MinIO credentials and bucket, and a public
CDN URL. Use an externally reachable CDN URL; never persist the internal MinIO
endpoint in public media fields.
