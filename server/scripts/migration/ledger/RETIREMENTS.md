# Retirement coverage and stakeholder decisions

Recorded 27 September 2026. The migration goal is a full ledger of legacy-site
content, with every source accounted for by a destination, a documented merge,
or an explicit reviewed decision. Exclusion from the news batch does not mean
exclusion from the overall migration. The current inventory is not yet a
complete whole-site ledger.

## Content distinction

Retirement notices normally represent one person: career text, optionally a
portrait and links. Standalone Depart with Dignity (DWD) invitations are a
different content type and must not automatically enter the retirement section.
Stakeholders must decide their destination or disposition; no exclusion,
merging, publication or import is authorized by this note.

## Outstanding records

| Source ID | Content | Next action |
| --- | --- | --- |
| 357822 | CWO Couture standalone DWD invitation | Stakeholder discussion: historical news/event, associated invitation, or explicit exclusion. Do not treat absence from the retirement listing as a missing retirement notice. |
| 345318 | BGen Denis Boucher standalone DWD invitation image | Same policy discussion; retirement notice 345110 already appears in the retirement listing. Preserve the separate invitation source pending a decision. |
| 346556 | WO Anthony Kuhmayer retirement notice | Missing from the legacy retirement listing. Check destination inventory before preparing a retirement import. |
| 293738 | Maj Richard Monette retirement notice | Reconcile with listed notice 293729; normalized text differs only by expanded first names. Additional source 293742 has matching normalized text but was not in the English listing. Preserve source mappings; do not import three retirements. |

## Evidence and limits

All 117 retirement-category entries in the saved 670-entry news-feed inventory
were found under the same WordPress IDs in the live 912-entry retirement
listing (all 19 pages checked). Four additional retirement-related news posts
are recorded above. Comparison used the 25 September news snapshot and live
27 September retirement pages; it was not a new full news crawl or an exhaustive
semantic review of every news body. French coverage and destination/VPS
presence were not verified.

Full source URLs, downloaded evidence and the audit report are retained locally
under `server/scripts/migration/output/retirement-news-reconciliation-20260927/`.
The four corresponding news-ledger review records also carry these actions.
These four cases are included in the retirement-discovery-2026-09-27 admin review batch.
