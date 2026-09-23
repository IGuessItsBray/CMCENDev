# Staff articles and newsletters

Articles are MongoDB `NewsArticle` records, edited in **Admin → Articles**
(`/dashboard-next?area=articles`). The same model supports standard news stories
and newsletters. Staff need `canManageNews`; contributor events, retirement
messages and Last Post notices remain in **Submissions**, with their existing
review permissions. The two sections share editor and lifecycle utilities while
keeping their lists and unsaved drafts separate.

## Creating and editing articles

Choose **New article**, then **News story** or **Newsletter**. Save the draft
before previewing it, then publish immediately or schedule publication through
the existing publishing controls. Draft and removed article previews require
authentication and `canManageNews`; public article endpoints return only
published records. Removing an article from public view retains its body,
history and media so staff can restore it.

Standard stories require English and French titles and bodies. Newsletters
require their original language and can add a translation later. The interface
follows the site language; an untranslated newsletter retains its source language
and displays an availability notice. Ratings and comments are not included.

The newsletter editor provides ordered heading, paragraph, list, image/caption
and document-link blocks. Staff can move or remove blocks, apply bold/italic
text and links, select registered images, and select document-library links.
Image uploads require `canUploadMedia`. Captions, alt text and responsive image
variants stay with the article. Removing an image from an article clears its
reference; it does not delete the stored asset.

## Storage and rendering

The database is the source of truth for article edits. `layout` selects
`standard` or `newsletter`; `newsletterBlocks.en` and `.fr` hold the structured
body. The server derives newsletter `content` as plain text for search and
summaries. Text is rendered through DOM text nodes, never interpreted as HTML.
Edits record `ContentRevision` snapshots and audit entries. Body images and their
variants participate in Media Manager attachment counts and deletion protection.

Public newsletters use `/newsletter?id=<article-id>` and the shared
`newsletter.html`, `newsletter.js` and `newsletter.css` template. Standard stories
use `/news-story?id=<article-id>`. Private previews add `&preview=1` and read the
authenticated preview API. There is no public issue-JSON loader or default issue.

Images and document files remain in CDN/object storage. Document-library entries
remain in `server/public/page-content/document-library.json`; the article change
does not move that catalog or unrelated static page content into MongoDB.

Historical issues set `newsletter.archived: true` and retain their original
publication date in `newsletter.date`. Public listing order, display dates and
search use that date; `publishedAt` still records publication on this site.
Historical issues remain listed and searchable but do not appear as new items in
the homepage news feed. New newsletters default to non-historical, with no
archive notice.

See [API ROUTES.md](API%20ROUTES.md#news-stories) for payloads, limits and endpoints.

## Importing legacy issues

JSON files under `server/scripts/migration/import/newsletters/` are migration
seeds and source provenance, not live content. New staff articles do not require
JSON files or a code deployment. Changing a seed does not overwrite an existing
article; edit imported content through Articles after import.

For a new legacy seed, first migrate its source images using the shared media
storage configuration, metadata sanitization and WebP renditions. From `server/`
under Node 24:

```sh
node scripts/migration/import-newsletter-media.js --issue=fall-2025
node scripts/migration/import-newsletter-media.js --issue=fall-2025 --apply
```

The first command validates the images without writes. Apply uploads them,
registers MediaAsset records, checks CDN readability and updates the seed JSON.
Existing registered keys are reused. Review source image IDs before reusing them
for different content. Update the migration inventory after successful import.

If explicitly authorized to use the configured MinIO root credentials for a
migration, add `--use-root-credentials` to the apply command. This overrides the
credentials only in the importer process and does not edit `.env`.

Then validate and import the article seeds:

```sh
node scripts/migration/import-newsletter-articles.js
node scripts/migration/import-newsletter-articles.js --apply --actor=STAFF_OBJECT_ID
```

Replace `STAFF_OBJECT_ID` with an existing user ID that has `canManageNews`. The dry
run validates all seeds without database or storage writes. Apply uses the
configured database, imports missing records as historical drafts, records audit
entries and links their registered media. `migrationSource` prevents duplicate
imports; repeat runs retain existing records and edits. The resulting
`import/newsletter-articles.json` maps source URLs to IDs in that database and is
an import report, not a runtime lookup table. IDs can differ between databases.

For the earlier unchanged text-only imported drafts, add `--upgrade-structured`
to the apply command once. It preserves the source blocks, captions and image
variants, records a revision and audit entry, and marks the issues historical.
It refuses to replace published or edited text bodies and skips records that
already have structured blocks.

The running website needs this version of the application to show the new editor.
A fresh database also needs the media records/assets and explicit article import.
Updating the website's code does not import or publish articles; staff review and
publish each imported draft separately through Articles. Check the configured
database and storage destinations before applying a migration.

This checkpoint contains seeds for Fall 2025 and 77 Line Regiment Newsletters.
Both were imported as drafts; remaining issues are tracked in
`server/scripts/migration/import/newsletter-inventory.json`. Fall 2025 preserves
the source's apparent 2026/2025 heading inconsistency and final email spelling
pending editorial review.
