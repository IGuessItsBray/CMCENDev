# News migration ledger

Temporary checklist for the legacy migration. No import or publication is performed by this inventory.

Goal: account for all legacy-site content, including source-to-destination mappings, merges and explicit stakeholder decisions. This news inventory is one part of that ledger, not a complete whole-site inventory. See [retirement coverage and DWD stakeholder decisions](RETIREMENTS.md); standalone invitations are not automatically retirement notices.

The [Last Post reconciliation](LAST_POSTS.md) records 14 individual news notices/tributes: 11 person-level matches in the dedicated archive and three unresolved. Related funeral notices, memorial gatherings and tributes remain separate stakeholder decisions; a person match does not prove all source content is preserved.

## Discovery and stakeholder review rules

[Heritage Moments discovery](HERITAGE_MOMENTS.md) records nine English articles
(four already in the news ledger, five newly accounted for) and 14 French
archive entries, including language and possible test/duplicate issues.

[Parent Heritage discovery](HERITAGE.md) expands coverage to 22 English and
26 French archive records, with overlap recorded and placeholder content held
outside migration pending documented disposition.

Recorded 27 September 2026:

- Discover English and French sources, including French-only material. Check available language-switcher links, public inventories and internal links; record confirmed counterparts separately from possible matches and unresolved searches. Similar titles or shared media alone do not establish a translation pair.
- Preserve each language's source URL and content independently. Flag differences, incomplete translations and conflicting facts for review rather than silently choosing one language as authoritative. “Not found” does not mean a translation does not exist.
- Inventory content found through body links, newsletter links, category tags and archives, not only navigation menus. Heritage Moments is a pending investigation: compare the reportedly blank navigation destination with the populated category archive described by the operator; their relationship is not yet verified.
- Record legacy categories as source metadata, not as decisions about the new site's structure. Staff/stakeholders decide how ambiguous archival material should be organized and presented. Leave proposed destination/category unresolved and capture the specific question and source evidence for the meeting.
- Discovery does not authorize imports, publication, merging or exclusion. Maintain separate discovery, language-pairing, stakeholder-decision and migration-verification states. Preserve every source's eventual disposition, including sources consolidated into one destination.

- 680 source records: 670 from the 67-page news feed, plus 10 newsletters outside the feed.
- 16 records marked verified. The original operator confirmations cover 13 in the initial transfer and 3 in the pilot.
- 529 remaining candidates: 23 newsletter-format records and 506 other news records.
- 133 records excluded for now; 2 personal-memorial records held for separate review.
- 132 unique document links among included records; 4 links occur in multiple records.

Current priority: [complete French for the initial 16 imports](INITIAL16.md). The five new candidates below are deferred.

Counts describe the saved 25 September inventory. A public API count/latest-post check on 26 September still returned 1,525 English posts and the same latest post. This does not prove that every older page is unchanged. The French post inventory was collected on 26 September.

## Deferred next batch — not imported

| Source | Translation check | Review note |
| --- | --- | --- |
| [MCEM LUNCH AND LEARN](https://cmcen-rcmce.ca/mcem-lunch-and-learn/) | [Explicit French counterpart](https://cmcen-rcmce.ca/fr/dejeuner-conference-du-mcem/) | Preserve as a historical news notice; the 15 September event has passed. Names, date, time and venue agree. |
| [PRESENTATION OF THE MOS VETERAN APPRECIATION SCROLL TO SIGNALMAN ANDRUSHKO](https://cmcen-rcmce.ca/presentation-of-the-mos-veteran-appreciation-scroll-to-signalman-andrushko/) | [Explicit French counterpart](https://cmcen-rcmce.ca/fr/remise-du-master-of-signals-veteran-appreciation-scroll-au-signaleur-andrushko/) | Explicit counterpart; birthday, date and named presenters agree. French contains source typos/acronym inconsistencies; flag for editorial review. Preserve the source photo. |
| [DESPATCHES 26.3 APRIL 2026](https://cmcen-rcmce.ca/despatches-26-3-april-2026/) | Unresolved; no confirmed counterpart | Document-led article. Verify the April PDF and its language before import. |
| [DESPATCHES 26.2 MARCH 2026](https://cmcen-rcmce.ca/despatches-26-2-march-2026/) | Unresolved; no confirmed counterpart | Document-led article. Verify the March PDF and its language before import. |
| [Despatches from 32 Signal Regiment (January)](https://cmcen-rcmce.ca/despatches-from-32-signal-regiment-january/) | Unresolved; no confirmed counterpart | Document-led article. Verify the January PDF and its language before import. |

## Using the ledger

This folder retains the compact progress checkpoint: `confirmed-imports.json` records the original two imports and `INITIAL16.md` records French completion and remaining work. The operator confirmed five matching French updates imported on 26 September and manually published some afterward. Specific publication states were not inspected.

The complete generated `news-ledger.json`, its builder and a copy of this progress folder are retained locally under `server/scripts/migration/output/checkpoint-20260926/`. They are excluded from Git along with source snapshots and transfer bundles. Source IDs and URLs identify records; English/French pairs remain one article. A matching document URL is only a reuse hint, not proof of identical bytes or duplicate article content.

Import progress and review status are separate. All newly inventoried records are scraped, not ready. Record unresolved translations, shared-document conflicts and unsupported layouts before advancing a batch. A review approval alone never advances a record to imported or verified.

After an actual apply, record its destination IDs and batch in the ledger; mark verified only after database and Garage/public-media checks pass. Preserve the import journal and payload hashes with the batch. Do not infer success from a dry run. For existing imports, original English batch verification does not certify French completion or complete source-document coverage.

Rebuild from the saved snapshot with:

```sh
python3 server/scripts/migration/output/checkpoint-20260926/build-news-ledger.py \
  --snapshot server/scripts/migration/output/news-ledger-20260926 \
  --ledger-dir server/scripts/migration/output/checkpoint-20260926/ledger
```

The builder preserves existing per-record migration/review fields and refreshes source inventory fields. These local artifacts must be backed up separately before moving machines or deleting the checkout; they cannot be recovered from this PR. This is not a live crawler or a permanent application feature. The remaining source snapshots are under `output/news-ledger-20260926/` and `output/initial16-bilingual-20260926/`.
