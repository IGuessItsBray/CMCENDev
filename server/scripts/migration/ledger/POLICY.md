# Archive migration policy

Confirmed by the operator on 29 September 2026 after stakeholder review.
This supersedes earlier requirements to finish missing translations or obtain
stakeholder classification decisions before preparing archive drafts.

The operator subsequently clarified that the quick meeting choices and notes are
context only, not migration instructions. Bring all real archival content over
as drafts and hand-pick it later. Do not exclude, hold, merge or edit a record
because of those saved choices. This includes the trivia article and both DWD
invitations previously marked for exclusion. Preserve the saved decision history.

- Preserve real historical content and original source evidence. Organize it
  using the best supported editorial judgment; record source-to-destination IDs,
  language pairings, consolidations and unresolved questions.
- Import everything as drafts. Review and publish individual completed records
  separately; neither a saved Archive Review decision nor an import publishes.
  Missing French alone does not prevent an English archive record being complete.
- Subsequent operator clarification: the current import includes only source
  records originally published in WordPress. Keep the 296 original drafts and
  28 private source records outside all current batches for separate review at
  the end. Their comments and assets are not imported solely on their behalf;
  shared assets required by eligible published records remain eligible. An
  unpublished language counterpart must not enter through a published sibling.
- Pair genuine English/French counterparts where they exist. Inspect actual text:
  a language-switcher relationship does not prove that the French body is French.
  If French is absent or simply duplicates English, keep English only and leave
  French empty. Preserve the redundant source's provenance in the ledger. Do not
  invent translations, erase genuine French-only material, or silently discard
  substantive differences in partially translated sources.
- Retain memorial posts, DWD invitations, funeral invitations and related member
  material as supporting content linked at the bottom of the corresponding
  retirement or Last Post page. They must not appear as standalone entries in
  news, retirement or Last Post feeds. Confirm the member association; ambiguous
  or missing parent records remain drafts for research, not guessed links.
- Staff can improve the archive and add missing translations after launch.
  Preserve originals while checking content, pairing, category, media/documents,
  member associations and destination rendering before publication. Existing
  privacy, account-ownership and access controls still apply.
- Preserve original content during transfer; editorial curation comes later.
  Check that storage/import constraints do not silently truncate source content.
  This is a fidelity requirement, not adoption of the superseded meeting notes.

## Execution order

Account preparation precedes content import so registered authors/comments can
retain ownership. See [account audit and activation requirements](ACCOUNTS.md).

1. Account for all real archival content, including records previously marked
   exclude or research in meeting notes. Those notes are not import filters or
   approval gates. Keep known synthetic test data separate from the real archive.
2. Prepare the source-to-destination plan, grouping bilingual records and linking
   supporting member content to its parent. Keep uncertain associations visible.
3. Verify that imports support empty French fields and that supporting content
   can be linked without appearing in feeds. Implement any required application
   support before importing those records; this policy does not establish that
   the current application already supports that presentation.
4. Copy and verify media/documents, import bounded draft batches, and check the
   resulting pages against original evidence. Record publication separately as
   completed records are approved.

The operator supplied 15 saved VPS decisions on 29 September, then superseded
their use as migration instructions. [Meeting notes](MEETING_DECISIONS.md) retain
that context only. No clarification of the two invitation exclusions is needed:
retain both under the supporting-content policy. No database changes were made.
# Migration drafts and submission approval

`pending` denotes a user submission awaiting administrator approval. It must
not be used as the holding state for migrated archival content or comments.
The content preflight requires a distinct `draft` state and must remain blocked
where the destination model or editorial workflow does not support it. Adding
an enum value alone does not establish an editable, publishable draft workflow.
This destination holding state does not make original WordPress drafts eligible
for import; deferred source drafts and private records remain excluded.
