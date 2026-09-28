# Archive Review

This is a temporary tool for migrating the legacy site's content, including stakeholder review meetings. It is not a permanent editorial workflow. Keep further changes limited to decisions needed to complete that migration.

The separate [news migration ledger](../server/scripts/migration/ledger/README.md) tracks source discovery and actual imports. Saving a decision here does not mark a ledger record imported or verified.

Current priority is [French completion of the initial 16 imports](../server/scripts/migration/ledger/INITIAL16.md), before adding further news batches. The operator confirmed importing five French updates and manually publishing some after review. The ledger records that confirmation separately from the panel's review decisions; it does not infer individual publication states.

Developers can open **Archive Review** in the admin panel (`/dashboard-next?area=archives`). The first catalogue covers the 16 imported articles audited on 26 September 2026: eight confirmed French counterparts, eight unresolved translations, and six separate translation, attachment, source-URL or image-layout issues.

The batch selector also includes 27 September discovery: four retirement/DWD cases, 14 Last Post cases, and 27 Heritage review items representing 48 English/French source IDs. Heritage includes John Doe and all five Learning to Post entries. These remain visible even if a reviewer chooses exclusion. Sources found in French archives are shown in the FR column as provenance, not a claim that their bodies are translated. Related notices and obituaries appear in separate expandable source sections. Destination lookup covers news articles only; absence there is not proof a retirement or Last Post record is missing from the database.

For the meeting, choose Preserve, Exclude from migration, Continue research, Custom or Defer, and describe the intended destination, any merge, and corrections in the notes. Save each item. Decisions persist in the database of the environment used for the meeting, not in Git. Afterward, provide that environment and batch names for reconciliation; a database-backed decision read or export is needed if that environment is inaccessible. Never share credentials. Apply reviewed decisions to a separately validated migration plan and ledger; resolve ambiguous notes, preserve originals, and import as drafts. Publication remains manual. No export or automatic migration action is implemented by this panel.

Select an issue, compare the English and French source snapshots, choose an action, add notes, and save. Custom decisions require a note. Meeting view hides the queue; Previous and Next follow the current filtered list. A selected item remains visible even if it does not match the filters. Sources and attachments open in separate tabs.

Saving records a decision only. It does not import, modify, publish, schedule or delete any article or media. Approving a pairing does not approve the related translation or attachment issues. A later import must independently validate documents and reconcile current destination content; the panel flags existing French content in the current environment.

## Evidence and persistence

The **Comment migration exceptions** batch (`comments-2026-09-28.json`) adds seven decisions from the WordPress/Corebot identity audit: one email-only import, three unmapped source comments, one truncated comment, and two comments whose referenced account is absent from the export. Source IDs, links and redacted evidence are included; private email/account metadata is not. English evidence panels retain original comment language, with no invented French translation. Destination lookup still covers news articles only; use the supplied snapshot evidence for these comments. Preserving the truncated original requires separately addressing the comment length limit before import. These decisions do not establish account ownership, restore accounts, or apply content changes.

The reviewed catalogues are `server/data/archive-review/pilot-2026-09-26.json` and `discovery-2026-09-27.json`. They contain public legacy source text, asset links, source IDs/dates and bilingual audit findings. They are server-side data, available through developer-only endpoints. No database seed or test fixtures are required. Future batches can be appended with unique stable batch/item IDs and the same shape.

This audit searched 1,463 public French WordPress posts and inspected English language-switcher links. Unpublished/deleted posts and independently authored WordPress Pages were outside that inventory. No counterpart found is not proof none exists. PDF text and historical factual accuracy were not certified; snapshot paragraph boundaries do not establish semantic block alignment.

Decisions are stored in the MongoDB `archivereviewdecisions` collection with actor, time, revision, notes and an append-only history. Include that collection in normal database backups. Every successful decision save also writes `archive_review.decision_saved` to the audit log. Concurrent edits return 409; the UI keeps unsaved notes and offers an explicit reload. Changing an item's evidence invalidates its prior approval and returns it to Pending without discarding history.

The interface and all endpoints require the exact `developer` role. Existing editorial permissions and custom roles do not grant archive-review access. Stakeholders can review alongside the developer in a meeting; this feature does not create stakeholder accounts or public sharing.

## Remove after migration

After the migration decisions have been applied and the results verified, preserve the catalogue and a database backup containing `archivereviewdecisions` with the migration records. Then remove the archive-review route mount from `server/server.js`, its sidebar/section/script/style references from `dashboard-next.html`, and its area registration from `dashboard-next.js`. Remove the dedicated archive-review route, service, model, frontend files, catalogue, tests, translation keys and API documentation. Normal article editing does not depend on this tool. Retain the migration evidence and audit history; removing the interface does not require deleting database records.
