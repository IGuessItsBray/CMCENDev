# Newsletter articles

`/newsletter?issue=fall-2025` uses the shared `newsletter.html`, `newsletter.js`
and `newsletter.css` template. Issue content lives in
`server/public/page-content/newsletters/<issue>.json`. The default issue is Fall 2025.

To prepare another issue, create its JSON content file with a unique lowercase
hyphenated slug, title, issue label, publication date, author and content language.
Reuse ordered heading, paragraph, list and figure blocks. Inline content supports
plain strings, strong/emphasis, line breaks and links. Text is rendered through
DOM text nodes; HTML strings are never interpreted. Figures reference an image
key and retain their caption. Link PDFs to the existing document library files.

The interface follows the site language. An untranslated issue retains its source
language and displays an availability notice when the interface language differs.
Ratings and comments are outside this template.

Images use the shared media storage configuration, metadata sanitization and
original/thumb/medium/large/hero WebP renditions. From `server/` under Node 24:

```sh
node scripts/migration/import-newsletter-media.js --issue=fall-2025
node scripts/migration/import-newsletter-media.js --issue=fall-2025 --apply
```

The first command validates the images without writes. Apply uploads them,
registers MediaAsset records, checks CDN readability and updates the issue JSON.
Existing registered keys are reused. Review source image IDs before reusing them
for different content. Update the migration inventory after successful import.

If explicitly authorized to use the configured MinIO root credentials for a
migration, add `--use-root-credentials` to the apply command. This overrides the
credentials only in the importer process and does not edit `.env`.

Fall 2025 uses verified CDN images. The article preserves the source's apparent
2026/2025 heading inconsistency and final email spelling pending editorial review.
