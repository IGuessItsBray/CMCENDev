# Remaining editorial archive inventory

Prepared 28 September 2026 from the saved English/French post and page snapshots,
the existing news ledger and review catalogues, the WordPress SQL export, and
the reviewed Corebot retirement/Last Post source-ID map. This is a provisional
inventory, not an import approval or a live whole-site crawl.

## Reconciliation

All 680 original ledger records remain accounted for. Among its 529 remaining
candidates, 58 belong to the separate migration, 415 are provisional editorial
candidates, 45 need a scope decision, and 11 already have review entries.

The broader inventory contains 4,391 distinct source IDs:

| Queue                                                      | Source records |
| ---------------------------------------------------------- | -------------: |
| Retirement, Last Post, or event migration                  |          2,955 |
| Already represented in review, outside that separate scope |             83 |
| Provisional editorial candidates to prepare                |          1,226 |
| Scope/functional-page/placeholder decisions                |            127 |

Existing reviews are linked, not duplicated or marked complete. Saved meeting
decisions and current VPS content were not read. The separate-migration queue
is a handoff list, not a claim that those records have been migrated.

## Proposed editorial groups

| Group                                                  | Source records |
| ------------------------------------------------------ | -------------: |
| General news                                           |            703 |
| Newsletters                                            |             40 |
| Document-led news                                      |            109 |
| Heritage and history                                   |             45 |
| Institutional pages                                    |            226 |
| Biographies                                            |             41 |
| Special content: exhibits, document viewers and tables |             62 |

These are source records, **not unique bilingual articles or final meeting
decisions**. They comprise 565 English, 556 French and 105 language-unclassified
records. Existing catalogue/ledger pairings are retained; unresolved French
records are not labelled French-only. The export lacks the WordPress translation
relationship tables, so complete bilingual reconciliation remains outstanding.

There are 59 preparation batches of up to 25 source groups, including the 127 scope
questions. After checking the live language switcher and reconciling counterparts,
829 remaining review items are included in the local Archive Review catalogue under
seven broad selector options, not 59 options. All 1,353 original source IDs remain
accounted for across the existing and remaining catalogues. Deployment is separate.
Start with scope decisions, then newsletters/history, general news, and pages.
Reconcile pages and biographies against existing static site content before
creating duplicate destinations. Functional login/account pages need a
replace-or-exclude decision, not automatic archival import.

## Local handoff

The ignored directory `server/scripts/migration/output/remaining-archive-20260928/`
contains:

- `inventory.tsv`: sortable source register with queue, rationale and existing review links.
- `inventory.json`: source IDs, URLs, language, document/internal links and layout flags.
- `proposed-batches.json`: proposed groupings and required checks.
- `duplicate-candidates.json`: 61 groups sharing normalized body text; not approved merges.
- `shared-documents.json`: 90 shared document-link groups; bytes not verified.
- `README.md`: scope and limitations.
- `prepare-remaining-archive.py`: local builder; requires the separately retained private SQL audit files.

Back up these local files separately; they are not recoverable from Git. No SQL
dump, private account metadata, source bodies, or credentials are included in
this tracked checkpoint.

## Remaining validation

Event-like news headlines remain scope questions: an invitation and a historical
event report may need different destinations. Source categories are evidence,
not destination taxonomy. Similar text, dates, titles or shared documents alone
do not authorize merges or translation pairing.

Reconcile navigation, internal-link destinations, restricted-content rules,
documents and media before claiming complete coverage. A published SQL status
does not prove unrestricted public access. Plugin layouts, orders, registrations
and account data are outside this editorial inventory. All imports, publication,
ownership assignments and saved review decisions remain unchanged.
