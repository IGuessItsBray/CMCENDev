# Initial 16: bilingual completion plan

No new articles. On 26 September, the operator confirmed importing the five matching French updates and manually publishing some after review. Individual publication states have not been inspected; do not assume these articles are still drafts or rerun the completed batch.

## Result

- Eight existing French counterparts recovered and saved with their original source HTML/API data.
- Five French updates imported (operator-confirmed): poppy update, 32 Signal Regiment additional newsletters, CPO1/CWO September 2025, Association Spring 2022 and Summer 2023.
- Three other French newsletters recovered: Winter 2022, Winter 2023 and Summer 2022 need specific translation repairs and final block alignment.
- Eight block-based translator handoffs prepared where no matching public French article was found.
- Separate six-page French CPO1/CWO PDF included in the completed import. Its body is French; the original contains some English headings/artwork/references. It was preserved without rewriting.

## Article checklist

| Article | Result | Remaining work |
| --- | --- | --- |
| 77 Line Regiment Newsletters | translator-handoff-prepared | Translate the collection title, heading and four issue labels. A French January 2022 issue notice exists, but it is not a translation of this four-issue collection. Decide separately whether original PDFs need translation. |
| Association Newsletter — Fall 2025 | translator-handoff-prepared | Translate the full Fall 2025 Association article, including headings, captions and link labels. Preserve historical names and dates; linked newsletter PDFs are a separate translation scope. |
| 32 SIGNAL REGIMENT – ADDITIONAL NEWSLETTERS! | imported-operator-confirmed | Preserve the French introduction and its explicit English-only PDF notice. Reuse the three existing documents; do not invent translated PDFs. |
| 32 Signal Regiment Dispatches | translator-handoff-prepared | Translate the collection title, introductory text and issue labels. Preserve original issue files; decide document translation separately. |
| CPO1/CWO CORP NEWSLETTER – SEPTEMBER 2025 | imported-operator-confirmed | Imported the recovered French article and separate French PDF. Preserve original PDF bytes; its French body retains an English message heading on page 1. |
| ASSOCIATION NEWSLETTER – SPRING 2025 | translator-handoff-prepared | Translate the full Spring 2025 Association article, headings, captions and link labels. Do not substitute a different year or season. |
| ASSOCIATION NEWSLETTER – WINTER 2023 | source-recovered-needs-alignment | Translate the remaining English BENEFITS section and repair the repeated Tony Charters phrase. Preserve the original separately. |
| ASSOCIATION NEWSLETTER – SUMMER 2023 | imported-operator-confirmed | French URL incorrectly says winter 2022; the source title/body identify Summer 2023. Preserve provenance. Bilingual 5 CMBG passage is present intentionally in both sources. |
| ASSOCIATION NEWSLETTER – SPRING 2023 | translator-handoff-prepared | Translate the full Spring 2023 Association article. The French Autumn 2023 issue is not a counterpart. |
| 741 Communication Squadron Newsletters | translator-handoff-prepared | Translate the collection title and issue labels. The four 1985–1986 scanned newsletters are separate historical documents; do not assume their translation is included in this task. |
| ASSOCIATION NEWSLETTER – WINTER 2022 | source-recovered-needs-alignment | Translate the English membership introduction left in the French source. |
| ASSOCIATION NEWSLETTER – SUMMER 2022 | source-recovered-needs-alignment | Repair the Josée Robidoux sentence and missing Colonel Commandant role wording; review 11 English versus 10 French image occurrences without adding duplicates. |
| ASSOCIATION NEWSLETTER – SPRING 2022 | imported-operator-confirmed | French source imported with aligned blocks and existing media references. |
| AMENDMENT TO POPPY START DATE | imported-operator-confirmed | Proofread the source term “pavot” against the remembrance-context “coquelicot”; no silent correction was made. |
| PROMOTION – CPL AL SAWI AND CAPT ROH – 8 CIS FLT | translator-handoff-prepared | Translate the joint December 2025 promotion report published in January 2026, including both photo captions. Earlier French promotion notices concern different events. |
| DESPATCHES 6.4 MAY 2026 | translator-handoff-prepared | Translate the title, short introduction and PDF link label. Confirm whether a French May 2026 issue exists with the issuing unit before commissioning translation of the PDF. |

## Search conclusion

The expanded search included 1,463 French posts, 108 French Pages and 143 English Pages. The French newsletter landing page points to category 543; it does not contain missing article bodies. The 77 Line January 2022 French notice covers one issue, not the four-issue collection. Different seasons, years and earlier promotion notices were not substituted.

Before commissioning new translations, ask the legacy WordPress administrator or issuing unit for unpublished French drafts, revisions or original bilingual files for the eight unresolved records. If none can be supplied, use the block-based handoffs. This is the remaining search boundary; the public search cannot prove nonexistence.

## Completed batch and local artifacts

The completed transfer bundle remains outside Git at `server/scripts/migration/output/initial16-five-french-drafts-20260926.tgz`. The one-off importer and its focused tests are preserved in `output/checkpoint-20260926/`, rather than shipped as maintained application code. Raw source snapshots, PDFs and generated review packets also remain under ignored `output/`. Back up these artifacts separately; a Git push does not preserve them.

Keep the VPS bundle's `apply-plan.ejson` and `journal.json` as the before/after backup and import evidence. The importer preserved draft status, current covers and existing English copy; publication was subsequently performed by the operator. An intentionally replaced crest exposed a stale cover check based on the old export. The corrected package checks body assets while preserving current cover references and does not restore the deleted crest.

Validation completed locally against all five actual datasets in isolated MongoDB: bilingual block/schema checks, English preservation, draft-state preservation, revision/audit creation, idempotent reruns, missing-history recovery and edit-conflict refusal. Completion on the VPS is operator-reported, not a direct live database inspection.

The Spring 2022 role-change passage is two paragraphs in French and one block in English; the proposed French block retains both paragraphs. The 32 Signal English source repeats one PDF link; the French preserves its own three-link layout. Original source HTML is retained for all eight recovered pairs.
