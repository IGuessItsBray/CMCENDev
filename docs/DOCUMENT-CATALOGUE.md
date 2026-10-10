# Database document catalogue

The public library and article picker continue to request `/page-content/document-library.json`, but published cards now come only from `ArchiveDocument`. JSON retains bilingual interface labels and the original seed evidence; changing the seed does not overwrite staff data. Site search queries published bilingual metadata directly and links to the corresponding library card. It does not read file bodies or require reindexing. An open library tab retains its fetched response until reload.

No staff upload/create screen or API is included. The existing authorized document interface provides read-only ordinary catalogue metadata and an expandable **Used on N pages** list. Its document queue defaults to All; other imported queues retain Drafts. Existing legacy imported drafts keep their existing correction/publication workflow. Ordinary catalogue files and records do not require that workflow.

## One-time migration proposal

`server/scripts/migration/migrate-document-catalogue.js` defaults to preview. It never loads `.env`, uploads files, modifies file bytes, sends mail, or runs automatically. The input is the 76 original cards plus eight verified additions and their retained receipts. Original bilingual title, description, date/language label, organization, type, related page and file key survive. The Foundation annual-report placeholder is explicitly `unavailable`, without an invented file or WordPress ID. Seed entries retain their existing public visibility. No publication timestamp is invented; historical display labels remain exact.

Catalogue IDs are unique strings. Genuine numeric legacy IDs remain unique when present; new ordinary entries do not invent those IDs. Existing records are matched by catalogue ID, deterministic insertion ID and exact canonical file key. Multiple matches, changed seed evidence, conflicting identities or different metadata/visibility stop preview. Exact matching published dynamic records may adopt catalogue identity, retaining their original DB ID, source IDs, provenance and former `archive-ID` anchor as an alias. Completed seeds are preserved on rerun even after staff changes; unrelated dynamic records remain untouched.

Preview using an explicitly supplied EJSON snapshot containing `documents` and `indexes`:

```sh
node scripts/migration/migrate-document-catalogue.js --snapshot /private/review/snapshot.json --output /private/review/plan.json
```

This is not a live destination check. For a separately authorized destination preview, supply `MONGO_URI` through the operator environment and an exact `--database` name. No credentials belong in repository files or command history. The preview reports proposed inserts/adoptions/preservations, conflicts, unavailable entries and legacy index replacement. A genuinely absent collection has no documents/indexes; preview does not create it. Apply creates its reviewed indexes before inserting records. Only NamespaceNotFound is treated as absence; connection and permission errors still stop the operation.

Only after exact destination review and separate rollout approval may an operator use `--apply --expected-plan SHA256 --backup NEW_PRIVATE_PATH`. Apply refuses a changed destination or a conflicted plan, writes/fsyncs an exclusive private before-image including index definitions, converts an existing nonpartial unique `sourceId` index to partial uniqueness, and creates the catalogue ID index. It then inserts or conditionally adopts exact matches without editing content fields/status; reruns preserve completed seeds. There is no cross-record transaction: stop on failure, retain the backup and preview, inspect actual state and generate a fresh preview before any retry. Do not blindly restore/overwrite staff records. Use a maintenance window without concurrent catalogue/import writers during index conversion and apply.

## Rollout sequence

1. Review the patch and retained eight-file upload receipts; obtain a fresh destination preview. Reconcile existing dynamic records and resolve every conflict without overwriting staff changes.
2. After separate approval, place public library/picker reads and catalogue/import writes behind maintenance coverage. Keep the old process from serving seeded records: its static-plus-dynamic reader would duplicate cards, and its old schema/index setup is incompatible with ordinary records. Retain/verify the scoped backup, apply the reviewed migration with exclusive writer access and read back all IDs, original order, metadata, visibility, placeholder and indexes. File uploads are not part of this operation.
3. Deploy/start the DB reader/search patch only after the destination contains the complete reviewed catalogue. Keep maintenance coverage until library filters, picker labels/URLs, search anchors and authorized usage references pass. The reader returns 503 if any of the 84 seed identities is missing or if the DB is unavailable; it never serves an empty/partial migration as a successful library. Presence checks include intentional draft records, while the public response still includes published records only. Original cards retain their order, followed by the approved additions and independent dynamic records.
4. Keep original seed/receipt evidence. Future ordinary catalogue additions can use bounded operator inserts without a website deployment; a staff upload/metadata interface remains deferred pending a separate product decision.

Do not roll back to the old reader against the seeded collection without a separately reviewed compatible data/reader plan. On an interrupted apply, remain in maintenance, inspect the saved before-image and actual state, generate a fresh preview and resume only that reviewed plan. Reruns preserve completed seeds and staff edits; they do not blindly replay the original inserts. There is no automatic deploy-time migration or stale JSON fallback.

## Usage boundaries

Usage is computed on demand from current structured articles/pages, formatted event/notice bodies, and explicitly public static landing pages. Relative storage paths and current configured storage URLs normalize to a file key; historical URLs/names normalize only through retained verified receipts. Repeated links and bilingual mentions on one parent count once. Historical `legacy.originalBody` is not a current reference. Restricted pages are filtered by the existing page access rule, and draft titles/counts appear only where the requester may inspect the corresponding editor/review surface. The catalogue card itself does not count as a use. These counts do not grant access to confidential files; existing document storage is public.
