# Pilot original-source link repair

Prepared locally from main `9055b99e28048fbb820b284e1bbe8664d53c4d30`.
No canonical database query or write, upload, publication, deployment or email
is part of this preparation. Applying the repair needs separate owner approval.

## Exact scope and verified evidence

`server/data/archive-review/pilot-source-links-2026-10-02.json` pins exactly the
existing 20 documents from `wordpress-pilot-20260929`: 10 Retirements and 10 Last
Posts, with 40 original IDs, 20 English and 20 French canonical permalinks.
Destination IDs come from the retained applied-pilot identities. Language and
translation pairing come from the original reviewed pilot source records.

Retirement URLs were read from each exact WordPress REST post ID and checked
against the retained slug. Last Post (`lp`) has no public equivalent REST item
endpoint here. Its URLs were read from page canonical links and checked against
the body post ID, retained slug and HTML language. Unqualified French Last Post
ID URLs redirect to English; French URLs were therefore taken from the actual
English page's French language-switch link, fetched and verified against the
original French ID. No translation URL was constructed from a slug or ID.
The mapping records verification URLs, methods and hashes of retained metadata.

The missing links originated in the pilot preparation payload: it retained IDs,
languages and slugs but omitted URLs. The existing model/API/UI already support
`legacy.sourceRecords[].url`; no application endpoint or schema change is needed.

## Future import preparation

Retain verified public metadata as `post-ID.json` with `id`, `slug`, `status`
and `link`. Last Post metadata may instead be extracted from independently
verified page canonical/post-ID/language evidence, as above. Do not assume a
French ID redirect reached French. The explicit local preparation mode checks
ID/language/slug matches, safe source URLs, missing metadata and existing URL
conflicts. It has no network, DB, storage or email access:

```sh
node scripts/migration/import-content.js --retain-source-links \
  --input /private/run/batch-unpinned.json \
  --metadata-root /private/run/verified-source-metadata \
  --output /private/run/batch-with-source-links.json
```

Run before identity pinning and `--prepare`; regenerate the reviewed identity
plan because provenance changed. New package freezing requires matched source
records with retained URLs, so skipping this step fails before media access
instead of silently repeating the pilot omission. The frozen package retains
the URLs. Existing frozen/applied manifests are not rewritten. Never
rewrite an already-applied import package or import these 20 records again.

## Offline preparation versus fresh destination dry run

The local retained-payload preview plans 20 record updates / 40 URL additions.
It is not a fresh snapshot of the canonical database and cannot authorize apply:

```sh
node scripts/migration/repair-pilot-source-links.js \
  --snapshot /private/run/retained-pilot-url-fields.json \
  --output /private/run/retained-pilot-preview.json
```

After owner authorization for destination verification, run inside the intended
application's existing environment, without loading or printing a secrets file:

```sh
node scripts/migration/repair-pilot-source-links.js \
  --expected-origin https://staging.cefamily.ca \
  --expected-database VERIFIED_CANONICAL_DB_NAME \
  --output /private/run/fresh-pilot-link-plan.json
```

Dry run is the default. It only reads the pinned documents' provenance fields.
Missing documents, different origin/batch/IDs/languages, missing/duplicate source
records, or conflicting existing URLs stop the entire preflight. Valid existing
URLs and `sourceUrl` aliases are preserved and skipped. Each planned update
sets only `legacy.sourceRecords.INDEX.url`; no whole document, legacy object or
source-record array is replaced. The writer uses the native Mongo driver, so
timestamps are not automatically changed.

## Required owner approval boundary

Before any apply, the owner must explicitly approve this exact data repair,
verify staging's OVH148.113.244.179 canonical database identity, retain a
restorable protected backup, and review the fresh conflict-free dry-run plan.
No bulk import, database replacement, migration receipt modification or media
operation is required. Coordinate an operator window and keep the plan/journal.

In particular, Balleux `b5327e1bad13362898e17e2b` and Dianne
`d460b7277355c3eb8991a20a` are now published with original September 14 and
September 4 publication dates respectively. Dianne's `photoUrl` and
`photoDisplayUrl` are empty to use the shared fallback crest. Preserve those
changes and all other owner edits. The repair does not write status, publication
dates, text, media, ownership, comments, edit timestamps or registry fields.
Todd Young and Li remain Draft with empty photo fields after the owner's crest
cleanup; preserve those values too.

Example authorization deliberately disables apply:

```json
{
  "allowApply": false,
  "approvedBy": "OWNER",
  "backupReference": "RESTORABLE_PROTECTED_BACKUP",
  "targetOrigin": "https://staging.cefamily.ca",
  "targetDatabase": "VERIFIED_CANONICAL_DB_NAME",
  "planDigest": "DIGEST_FROM_FRESH_REVIEWED_DESTINATION_DRY_RUN",
  "destinationVerifiedAt": "FRESH_UTC_TIMESTAMP"
}
```

Only after separate owner approval, use `--apply --authorization FILE --journal
NEW_FILE` with the same expected origin/database arguments. Authorization must
match the actual database and freshly regenerated plan digest; verification must
be at most 15 minutes old. Each update atomically checks original source records,
IDs, origin and batch. A concurrent provenance change stops the run, potentially
after earlier records completed; retain the journal and generate a new dry run.
Unrelated editorial edits cannot be overwritten because their fields are absent
from the update. A repeat dry run skips already valid URLs.

## Journal and rollback preparation

Apply creates an exclusive mode-0600 journal and fsyncs reversible `prepared`
intent before each update, then verifies the URL readback and fsyncs `applied`.
It retains each URL field's prior existence/value and before/after source records
using BSON-aware JSON. Keep all journals when resuming an interrupted repair.

```sh
node scripts/migration/repair-pilot-source-links.js \
  --rollback-journal /private/run/link-repair-journal.jsonl \
  --output /private/run/rollback-instructions.json
```

This only produces local, owner-reviewable Mongo update instructions; it cannot
apply rollback. Instructions restore only the added URL fields (`$unset` when
previously absent, `$set` for prior null/blank) and require an exact post-write
provenance match. Later owner URL/provenance changes block rollback. The owner
must separately authorize rollback and verify origin/database before executing
any generated instructions. A `prepared` event lacking `applied` is uncertain
after a crash: inspect that document and the backup explicitly before deciding
whether a write occurred; the automatic rollback plan excludes it.
