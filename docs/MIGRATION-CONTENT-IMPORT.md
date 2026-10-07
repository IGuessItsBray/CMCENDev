# Additive archive content imports

`server/scripts/migration/import-content.js` is an operator tool for reviewed
retirement and Last Post archive groups. It never loads `.env`, sends email,
creates accounts, publishes records or updates existing editorial content.
Dry run is the default. The code is implemented locally; no staging import,
upload, registry initialization or deployment has been performed.

## Prepare once, then keep the frozen manifest

### Retain verified original-source permalinks before identity pinning

Use `import-content.js --retain-source-links --input BATCH --metadata-root DIR
--output NEW_BATCH` to copy verified WordPress `link` values into matched
`legacy.sourceRecords[].url`. Metadata files are `post-ID.json`; missing or
conflicting ID/language/slug/URL evidence stops preparation. This mode is local
only. Regenerate the reviewed identity plan after adding URLs, then freeze the
package. See [Pilot original-source link repair](PILOT-SOURCE-LINK-REPAIR.md) for
verification, the guarded existing-pilot repair and its separate apply boundary.

### Optional automatic source selection before identity pinning

```sh
node scripts/migration/import-content.js --select-media \
  --input /private/run/batch-unpinned.json --media-root /private/run/media \
  --metadata-root /private/run/attachment-metadata \
  --output /private/run/batch-best-media.json
```

This is a local preparation step with optional read-only public image/metadata
fetches, never a Garage write. It reuses the original pilot's `original_image`
selection, then tries the largest declared same-attachment rendition. Metadata
must name the known source URL, and the decoded image must have valid type,
dimensions and matching appearance under a deterministic pixel check. Missing,
ambiguous, unsupported or conflicting candidates preserve the known source and
record a flag; no guessed suffix rewrites or enlargement is used.

Metadata may be embedded as `wordpressMetadata` on a media entry, supplied as
`media-ID.json` files in the optional directory, or fetched from the public
WordPress attachment endpoint for an explicit `wordpressMediaId`. No attachment
search or per-image AI decision is made. Chosen bytes are written only as new
local content-addressed files. The output is a batch with updated placeholders
and a selection report; original bodies remain untouched. It records the known
and chosen URLs/checksums, decoded dimensions, attachment ID and fallback flags.

Use this output when creating the reviewed identity plan, then run `--prepare`.
An old identity plan is deliberately rejected after media selection changes its
payload/bytes. Never run this step against a frozen manifest or after apply has
started. Explicitly reused live media is preserved and flagged; upgrading such
assets needs a separate reviewed replacement plan, backup and owner approval.

The existing reviewed batch package contains `batch.json`, `identity-plan.json`
and verified local media. From `server/` with Node 24:

```sh
node scripts/migration/import-content.js --prepare \
  --input /private/run/batch.json \
  --identity-plan /private/run/identity-plan.json \
  --media-root /private/run/media \
  --output /private/run/frozen-manifest.json
```

Preparation has no database or storage access. It checks pinned identities,
source fingerprints, language review, unchanged copy, schema validity and local
asset bytes. It freezes cast BSON identities/dates/defaults, timestamps for new
assets, media references, group membership and dependencies. Output is created
only after every referenced archive asset in display copy, nested blocks,
covers, attachments and comments is present in both the package and that
group's declared dependencies. Omitted dependencies stop preparation; the
frozen manifest repeats this check before destination access. Retained
`originalBody` source evidence is excluded from display-reference resolution.
Output is created
exclusively; an earlier manifest is not overwritten. Do not re-prepare a manifest
after an apply attempt: resume with the exact frozen file. Its digest identifies
the operator-approved plan. No prepared record is marked imported.

## Read-only destination check

Run inside the intended application's existing environment, using the explicit
origin and database name. Never source or print a secrets file.

```sh
node scripts/migration/import-content.js \
  --input /private/run/frozen-manifest.json --media-root /private/run/media \
  --expected-origin https://staging.cefamily.ca --expected-database VERIFIED_DB_NAME
```

The default checks canonical IDs/source IDs across news, retirements, Last Posts
and events; slugs; comment IDs, parents and authors; current user-ID mappings;
registry state; media record identities; stored and public object bytes. It
does not reserve claims, create indexes/collections, acquire locks, upload
objects or create a journal. An explicit `--output` writes a local report only.
An existing object that differs, foreign record, changed partial import,
missing completed dependency or broken completion receipt stops the run.

Source collisions are conservatively blocked even when a legacy record predates
the registry. An old applied report/current baseline can guide batch selection,
but this writer does not invent a completed receipt for merely existing curated
content. Exactly identical partial records can be adopted without updates only
after all dependencies are verified. Existing completed groups are skipped while
preserving later editorial changes.

## Live prerequisites and owner authorization

No live apply is authorized by this documentation. Before a separately approved
rollout, verify:

- The actual origin, database, S3 endpoint/bucket and public media origin.
- Exclusive operator access for the run: no concurrent manual/legacy import or
  editorial changes to unfinished groups. This writer supports standalone Mongo
  using single-document atomic claims and sequential verified inserts. No
  replica-set or infrastructure change is required. Both repository Compose
  configurations remain unchanged. Actual VPS topology remains unqueried; the
  prepared owner-run topology flags are informational, not an apply gate.
- Current dry-run results, account maps and immutable source identities; a
  restorable owner-protected backup and retained frozen manifest/media package.
- Scope approval, source review and all original unapproved-comment decisions.
  Drafts remain unscheduled and historical consent stays unknown.
- Deployment of the reviewed code; no older empty-destination pilot wrapper.

An owner creates an authorization JSON file with these fields. This sample
deliberately disables apply:

```json
{
  "allowApply": false,
  "approvedBy": "OWNER",
  "backupReference": "VERIFIED_BACKUP_REFERENCE",
  "targetOrigin": "https://staging.cefamily.ca",
  "targetDatabase": "VERIFIED_DB_NAME",
  "manifestDigest": "DIGEST_FROM_PREPARATION",
  "destinationVerifiedAt": "FRESH_OWNER_VERIFICATION_TIMESTAMP",
  "storageTarget": {
    "endpointOrigin": "VERIFIED_S3_ORIGIN",
    "bucket": "VERIFIED_BUCKET",
    "publicOrigin": "VERIFIED_PUBLIC_ORIGIN"
  }
}
```

Only after explicit owner approval, set `allowApply:true` and pass `--apply`,
`--authorization /private/run/authorization.json` and
`--journal /private/run/journal.jsonl` alongside the same input/media/origin/
database arguments. The timestamp must be within 15 minutes. Those assertions
do not replace the writer's fresh checks and per-write rechecks. Endpoint,
bucket, origin, database and manifest must exactly match the authorization.
`--apply=false` is rejected rather than interpreted as apply.

## Durable state and interrupted runs

Canonical `legacy.sourcePostIds` and comment WordPress IDs remain the content
provenance. Four dedicated registry collections add durable completion:

| Collection          | Meaning                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `migrationclaims`   | Unique `_id` per source origin + post/comment ID, across content types; pending is not imported. |
| `migrationgroups`   | Original bilingual group, frozen digest, expected IDs, verified step list, pending or complete.  |
| `migrationreceipts` | Verified dependency identities and actor, created after final readback before group completion.  |
| `migrationlocks`    | Non-expiring exclusive lock per target origin, acquired by unique `_id` insert.                  |

Explicit apply ensures the unique media-key index; duplicate legacy keys stop
before objects are copied. Source/claim/group/receipt identities use Mongo's
unique `_id` indexes. Imports are bounded to 1,000 groups per manifest and process
one group sequentially at a time. Collision reads are bounded rather than loading
whole inventories; already-completed groups never create duplicate writes.

An apply reserves group/source/comment claims as **pending**, then conditionally
copies only missing objects. Existing bytes are never overwritten; both storage
and public bytes must match before any content or comment insert. Each record is
inserted only if absent, then read back exactly, checkpointed in the pending
group and journaled with fsync. Before completion, all documents and media are
checked again. Source claims complete sequentially, then an immutable receipt is
inserted/adopted, and finally the group is marked complete by one atomic update.
No group is complete merely because its content document was inserted.

Storage reads recognize only explicit S3 `NoSuchKey` as object absence.
`NoSuchBucket`, ambiguous HTTP 404 responses and other destination errors abort
the check; they cannot authorize an upload to a missing or misrouted bucket.

A crash can leave some draft documents, pending checkpoints, complete claims or
a receipt without a complete group. The same frozen manifest re-verifies every
step and adopts only exact matching records; it never trusts a step flag alone.
A write that succeeded before its progress/journal write is inferred from exact
readback. Only a complete group backed by its claims and receipt appears in the
completion index. A crash after group completion but before journal fsync is
recovered from the canonical registry without replacing content. Journal rows
contain identifiers/digests only; duplicate logical event IDs are harmless.
Retain/back up the journal and manifest outside transient task/container paths.

The target lock does not expire. Caught failures release it; hard termination
leaves it in place and blocks all cooperative runs, even another source or batch.
After separately confirming the old process has stopped, an owner may authorize
recovery with `lockRecovery: {"priorWriterStopped":true,"abandonedToken":"EXACT_OLD_TOKEN"}`
in the fresh authorization file. A single compare-and-set swaps that exact token.
Never confirm recovery while the old process may still run. Token checks before
each write detect ownership changes, but cannot atomically fence a different
document write against an incorrect live-process takeover.

For completed groups, body, publication and media display-name edits remain
untouched. Source IDs, target IDs, comment parent/author provenance and dependency
presence must still reconcile. Missing records or objects require repair review;
the importer never silently recreates deleted completed data. Changed unfinished
payload/group digests, conflicting claims or foreign comment parents are held.
New unfinished media records must also exactly match their frozen document,
including URL and metadata. Completed assets and explicitly reused live assets
keep their existing curator-edit behavior.

There is no multi-document or object/database transaction and no automatic
rollback. Partial drafts can be visible in staff tools while a group is pending;
they must not be edited or published until verified completion. Conditional immutable
object keys and post-copy verification make orphan objects safe to reuse; no
automatic rollback deletes them. A subsequent external/manual object deletion
is a repair incident, not permission to reimport. Other legacy writers that do
not use this registry must not run concurrently. The lock coordinates this
importer only; arbitrary admin/manual writes can race between readback and the
completion update. Such changes are detected on subsequent verification, not
prevented atomically. No claim of isolation from external writers is made.

The maintained writer reuses the original WordPress pilot's fixed identities,
media-first conditional copies, insert-only records, exact readback and record
journal (`output/wordpress-pilot-20260929/import.cjs`). Initial16's retained
before/after plan and missing-history recovery informed frozen-manifest resume
(`output/initial16-five-french-drafts-20260926/import.cjs`). These ignored scripts
were inspected locally and remain unchanged. Empty-destination checks and
article replacement from those bounded jobs are not reused for this additive run.

## Verification

The read-only completion index lists only groups backed by complete source
claims and a matching receipt. Pending groups are excluded. With the intended
deployment environment already supplied, run from `server`:

```sh
node scripts/migration/list-content-imports.js \
  --source-origin https://cmcen-rcmce.ca \
  --expected-origin https://staging.cefamily.ca \
  --expected-database '<verified canonical database name>'
```

This command reports identifiers, media keys and verification dates; it does
not load `.env`, expose document bodies or create registry records. Historical
imports without this registry need separate provenance reconciliation and are
not retroactively marked complete by this command.

Focused integration tests use a disposable local standalone Mongo and synthetic
loopback object/public storage, never application `.env`, staging or Corebot.
Coverage includes dry-run non-mutation, owner/target/storage assertions,
standalone apply, interruption after every individual durable write and
reservation/object/readback/completion boundary, journal recovery, concurrency,
non-expiring locks and explicit stopped-writer recovery,
changed manifests, reused media/comments, collision refusal and curator edits.
The scale test imports and reruns 100 groups with one shared object.

```sh
node --test test/migration-content-package.test.js
node --test test/integration/content-import.test.js
npm test
```

## Preserve notice and event body formatting

Notice and event bodies can retain a bounded `formattedBody.en/fr` envelope:
`{version: 1, text, blocks}`. The existing `messages` or `description` copy must
exactly match the plain text derived from the blocks. Retirement's primary
`message` also follows its selected language. Raw source HTML is provenance,
never executable display content. Article/newsletter bodies keep their existing
format and editor. Public submission forms keep their existing plain-text controls. Staff retirement/Last Post editing offers one formatted message field per language with basic text marks, named safe links and paragraph alignment. There are no insertion/reorder/delete controls for blocks, headings, lists, images or documents. Event authoring remains unchanged. Schema and rendering accept only paragraph/inline text; images/PDFs are descriptive safe links, never embedded. The converter retains verified original image targets and readable alt/caption/filename labels at their original position. No assets or links are automatically removed.

`server/scripts/migration/convert-body.py` reads JSON from stdin and writes JSON
to stdout. A single conversion accepts `html`, `sourceOrigin` and a `media` map
from exact source image URL to verified retained HTTPS original. `--batch` makes
a new preparation from a batch, optionally consuming `bodyMediaMap`, verifies
each retained source body hash and adds `convertedBlocks` plus matching plain
copy. It never connects to storage or a database. Missing image mappings,
unsafe markup, unsupported styles/shortcodes and conflicting visible email
labels/recipients produce review issues. Do not infer a corrected recipient.
Keep the exact EN/FR originals and hashes, and review the new rendered result.

Preflight binds converted blocks to each language's prepared envelope and plain
copy. Rebuild source-bound review evidence, media dependencies, metadata and
frozen manifest digests after an approved preparation changes. Never edit an
already frozen payload, journal, runtime package or partially executed batch
in place. The paused ten-draft preparation requires a replacement reviewed
package; its existing artifacts are not authorizations to write new content.
The separately retained Event import extension must be reconciled with this
preflight and include `public/body-content.js` and `services/formatted-body.js`
in its guarded runtime dependencies before producing a new Event package.
This preservation change does not add Event execution support to the operator.

`lib/formatted-body-repair.js` is a proposal builder only. Supply a fresh record,
the exact original imported plain baseline (including resolved media URLs),
and hash-bound conversions. It skips staff-edited languages, existing rich
content, missing baselines and conversion conflicts. Proposed filters bind
record ID, updatedAt, exact source records, plain baseline and absence of rich
content. No repair is executed: require a fresh backup, reviewed exact diff,
compare-and-swap, content revision and explicit apply authorization. Reviewed
status, publication state, comments and unrelated staff fields are preserved.
Check both languages independently, including records already reviewed.

Public rendering builds DOM nodes from validated blocks and retains the existing
safe plain-body fallback for older records. Plain edits invalidate formatting
for that language, so stale imported content cannot override staff text. Inline
image/PDF references participate in media attachment and deletion protection.
