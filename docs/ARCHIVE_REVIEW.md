# Archive Review

This is a temporary tool for migrating the legacy site's content, including stakeholder review meetings. It is not a permanent editorial workflow. Keep further changes limited to decisions needed to complete that migration.

The separate [news migration ledger](../server/scripts/migration/ledger/README.md) tracks source discovery and actual imports. Saving a decision here does not mark a ledger record imported or verified.

Current priority is [French completion of the initial 16 imports](../server/scripts/migration/ledger/INITIAL16.md), before adding further news batches. The operator confirmed importing five French updates and manually publishing some after review. The ledger records that confirmation separately from the panel's review decisions; it does not infer individual publication states.

Developers can open **Archive Review** in the admin panel (`/dashboard-next?area=archives`). The first catalogue covers the 16 imported articles audited on 26 September 2026: eight confirmed French counterparts, eight unresolved translations, and six separate translation, attachment, source-URL or image-layout issues.

Select an issue, compare the English and French source snapshots, choose an action, add notes, and save. Custom decisions require a note. Meeting view hides the queue; Previous and Next follow the current filtered list. A selected item remains visible even if it does not match the filters. Sources and attachments open in separate tabs.

Saving records a decision only. It does not import, modify, publish, schedule or delete any article or media. Approving a pairing does not approve the related translation or attachment issues. A later import must independently validate documents and reconcile current destination content; the panel flags existing French content in the current environment.

## Evidence and persistence

The reviewed catalogue is `server/data/archive-review/pilot-2026-09-26.json`. It contains public legacy source text, asset links, source IDs/dates and bilingual audit findings. It is server-side data, available through developer-only endpoints. No database seed or test fixtures are required. Future batches can be appended with unique stable batch/item IDs and the same shape.

This audit searched 1,463 public French WordPress posts and inspected English language-switcher links. Unpublished/deleted posts and independently authored WordPress Pages were outside that inventory. No counterpart found is not proof none exists. PDF text and historical factual accuracy were not certified; snapshot paragraph boundaries do not establish semantic block alignment.

Decisions are stored in the MongoDB `archivereviewdecisions` collection with actor, time, revision, notes and an append-only history. Include that collection in normal database backups. Every successful decision save also writes `archive_review.decision_saved` to the audit log. Concurrent edits return 409; the UI keeps unsaved notes and offers an explicit reload. Changing an item's evidence invalidates its prior approval and returns it to Pending without discarding history.

The interface and all endpoints require the exact `developer` role. Existing editorial permissions and custom roles do not grant archive-review access. Stakeholders can review alongside the developer in a meeting; this feature does not create stakeholder accounts or public sharing.

## Remove after migration

After the migration decisions have been applied and the results verified, preserve the catalogue and a database backup containing `archivereviewdecisions` with the migration records. Then remove the archive-review route mount from `server/server.js`, its sidebar/section/script/style references from `dashboard-next.html`, and its area registration from `dashboard-next.js`. Remove the dedicated archive-review route, service, model, frontend files, catalogue, tests, translation keys and API documentation. Normal article editing does not depend on this tool. Retain the migration evidence and audit history; removing the interface does not require deleting database records.
