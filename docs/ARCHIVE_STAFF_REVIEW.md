# Imported archive staff review

The import team prepares source-to-destination mappings, media, and **draft**
records. Staff edit and publish ordinary imported articles and submissions in
the regular Content Workspace using its imported-origin filter. The source
details expand on demand. Staff can choose the original, current, or a custom
publication date. The public view marks archived articles. Archive Review
meeting decisions are separate context and do not publish content.

Existing editors use their normal content permissions. `archive.verify` remains
available for the specialized verification API and its saved checks; it does
not grant general news management, moderation, page editing, media
administration, or user management. Imported Pages and ArchiveDocuments have
their specialized review view linked from Pages administration. Editors with
`pages.manage` can access only these two types there.

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

News and page drafts have native preview links. The archive preview endpoints
grant `archive.verify` access only to eligible imported drafts; general editors
retain their existing preview access.

The specialized verification API records source completeness, translation
accuracy, categorization, and media/links/layout. An absent French version
requires a note before its translation check can be marked complete. Do not
invent text to fill it; the migration policy permits an English-only record
when the source has no genuine French counterpart. Any correction makes prior
specialized checks stale. That API's publish action requires current checks and
an explicit original, current, or custom date choice. The ordinary Content
Workspace uses its existing editing and publication permissions. Both paths
record audits and preserve supported content revisions. The original date is
shown only when source provenance supports it; an absent date is never replaced
by import time.

The ordinary bilingual article editor shows one preview when the EN and FR
figure image matches, keeps separate alt text and captions, and lets editors
choose different images. The cover remains a separate article field. The
specialized image chooser reads existing `MediaAsset` records with
`archive.verify` and applies a selection only when that draft is saved. It
does not scan storage, upload, delete, or replace images across records.

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
