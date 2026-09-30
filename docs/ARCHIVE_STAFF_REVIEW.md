# Imported archive staff review

This is the final human review of imported WordPress content. The import team
prepares source-to-destination mappings, media, and **draft** records. A staff
reviewer compares each draft with the original, corrects public copy and
placement, records four checks, and publishes it. Archive Review meeting
decisions are separate context and do not substitute for this verification.

Assign the `archive.verify` permission through a custom role to the specific
reviewer accounts. It grants access to `/archive-staff-review` and its dedicated
API only. It does not grant general news management, moderation, page editing,
media administration, or user management. The workspace lists imported drafts
and previously published imported records; only unscheduled drafts can be
edited, checked, or published. Do not give reviewers the broad `news.manage`,
`content.review`, or `pages.manage` permissions solely for this work.

The queue supports news articles (including newsletters), retirement messages,
Last Posts, events, comments, pages, and imported document-library entries.
Each record needs trusted importer-written `legacy.source` set to
`https://cmcen-rcmce.ca`, its positive `sourcePostIds` (or comment/document
source ID), and published-source status. The original article imports with
verified `migrationSource` remain eligible. Preserve source URLs and complete
source snapshots in `legacy.sourceUrls` / `legacy.sourceRecords` so reviewers can
compare them. Without a source link or snapshot, the completeness check cannot
be saved. Originally unapproved comments need an explicit
`legacy.importReview.decision=preserve-as-draft` to enter the queue; preservation
alone is not publication approval. A reviewer must record a publication note
before marking checks complete for such a comment.

News and page drafts have native preview links in the review workspace. Those
preview endpoints grant `archive.verify` access only to eligible imported
drafts; general editors retain their existing preview access.

The four checks are source completeness, translation accuracy, categorization,
and media/links/layout. An absent French version is visible and requires a note
before the translation check can be marked complete. Do not invent text to fill
it; the existing migration policy permits an English-only record when the
source has no genuine French counterpart. Any draft correction makes earlier
checks stale. Publishing requires all checks against the current draft version,
an explicit publication date choice for applicable records, and writes an audit
entry. Public-facing corrections also create content revisions for the content
types already supported by that revision history.

Imported documents use `ArchiveDocument` records. An importer creates them as
drafts with the legacy identity, a media `fileKey` under `documents/`, metadata,
and a stable source ID. Publication adds them to the public document-library
response. Existing bundled library entries stay published and are not moved
into this workflow. Media URLs resolve through the deployment's configured
public media base, including S3-compatible Garage storage.

Draft document metadata is absent from the public library response. The
`/documents/*` media redirect does not check document status: a file already
uploaded to public storage can still be opened by someone who knows its key.
Do not treat a draft media file as confidential.

Import scripts must reconcile the ledger before creating or updating a draft.
Once staff have corrected, verified, or published a record, a rerun must not
overwrite those changes. Preserve the original source snapshot separately from
editable destination fields, and record any newly found source differences for
review. This workflow does not run imports, copy files, assign reviewer accounts,
or modify a staging database by itself.
