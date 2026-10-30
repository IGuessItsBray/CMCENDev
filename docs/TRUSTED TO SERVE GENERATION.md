# Trusted to Serve certificate generation

The staff-only Administration → Certificate Requests view
(`/dashboard-next?area=certificates`) includes its own clearly labelled Trusted
to Serve section for student awards to members on course, with a small form for
separate first/surname fields, optional post-nominals, a full English heading
rank, English/French body ranks, presentation date, and explicit
French pronoun/article wording. It generates reviewed downloads;
it does not add a nomination/approval system or public duplicate request form.
All API calls require `certificates.manage`. Generated PDFs are private/no-store,
held in memory, and never change retirement fulfillment state. Download requires
acknowledgement that staff checked the entered details. Editing any input clears
that acknowledgement. Staff open the downloaded PDF to check and print it.
Branch staff enter approved student details received by instructor email.
The authenticated standalone Certificate Requests page uses the same staff
controller. No award controls appear on the public retirement listing or public
retirement-message page, and no public instructor submission or nomination
workflow is added. The existing `certificates.manage` permission protects the
staff worklist and award generation endpoint.
The dashboard has no embedded PDF viewer or preview-only buttons. Existing
inline API responses remain available, but the staff workflow is download-only.

## Original sources and one-time master preparation

The supplied editable PPTX is `20251029-UU-1000-CE_trusted_to_serve_student.pptx`,
SHA-256 `6658f4f75531f48d21217e2566aa4bfa2e0062afe799ae7ed94db101ba4601dd`.
The official matching PDF export is SHA-256
`3df6945e9a3408328c1ed4fb13e4bdb1e01ebf160573c427e2943373926e7282`.
Both originals remain unchanged. Production needs only the prepared private
master, not PowerPoint, Adobe or LibreOffice.

`server/scripts/prepare-trusted-to-serve-master.js` accepts only this exact PDF
hash and page size. Its source-specific recipe removes 67 complete text objects
using variable-font resources F2/F3/F4, retaining the six title text objects and
ten fixed date-label/signatory objects (83 total original text objects). This
removes both complete body paragraphs, both dedication regions, central name and
presentation date. It also removes Image33/Image37/Image39/Image43 drawing
operators and resource references, including soft-mask raster shadows containing
the old recipient/date. It deletes the unused variable font resources and copies
only reachable page content into a fresh PDF, discarding orphaned source objects
and document metadata. No opaque cover rectangles are drawn. A different source
hash/layout is rejected rather than edited approximately.

That initial preparation produced SHA-256
`93e03bd0fcb7e702defddb36c96d16c68011e5c8d70e0115206fdff68c569a36`.
It retained the original title, crest, fixed shadows and signatures, with the
original 792.24 × 612 pt page geometry. A 2× raster comparison of source/master
found **zero differing pixels among 1,394,440 pixels outside the complete variable
text/shadow regions**. PDFKit extraction of the master contained only the fixed
titles, date label and signatory labels. The old recipient is absent.

To reproduce preparation from the approved original (new destination only):

```sh
cd server
node scripts/prepare-trusted-to-serve-master.js /private/original-export.pdf /private/new-master.pdf
```

## Branch-leader update

The current master at `server/private/certificates/trusted-to-serve-master.pdf`
has SHA-256 `5c2e17d8997c2f54c76db75c9a139859a54a82e192d17941d3040e64a9370a6e`.
It replaces the previous branch leader with **Major-General Justin P. Thibert,
CD** and the owner-supplied blue PNG signature. Existing Branch Leader / Chef de
la Branche titles, Renay Groves, artwork and variable certificate regions remain
unchanged. The same update is included in both retirement masters. The supplied
signature is scaled 5% larger than the first review version and lowered to
overlap the signature line naturally, while clearing the printed text.

`scripts/update-certificate-branch-leader.js` is a one-time recipe for the exact
previous masters, with source hashes and signature hash guards. It removes old
name/signature drawing operations and inactive objects, embeds the supplied
signature pixels with only surrounding near-transparent padding cropped, and
sets the new name in the existing Bell MT style. It preserves the original PNG
as a private source asset. It does not generate or reconstruct signature strokes.
No covering rectangles or runtime PDF-editing service are used. In the retirement
sources, Groves's footer used unembedded Bell MT fragments (`FXF2` in the member
name, and `FXF6` in the family name/English title), causing reader-dependent font
substitution and mixed typography. Those three footer lines are now rebuilt in
embedded Bell MT with unchanged wording. Groves's signature image is unchanged.

```sh
node scripts/update-certificate-branch-leader.js /private/previous-masters /private/new-masters
```

Use a new output directory; the script refuses unknown or already-updated
masters and never overwrites its source files. At 2× resolution, before/after
comparisons of all three masters showed zero changed pixels outside the
approved signatory regions (including Groves's retirement footer text). Short and long accented synthetic outputs
were also rendered to verify that signatures clear names and variable wording.

This is a one-time verified-source preparation recipe, not a general-purpose PDF
text editor. Replacing the source requires a new reviewed recipe/hash/master.

## Runtime rendering and wording

`services/trusted-to-serve-documents.js` uses existing pdf-lib/fontkit/sharp
dependencies. It uses the bundled private Script MT Bold and Bell MT Italic
fonts by default; no font mount or environment setup is needed. Optional path
overrides retain exact-family and embedding checks. The embedded Imprint MT Shadow title subset stays fixed,
so the full title font is not required at runtime. All ten recipient occurrences
are rebuilt. The large heading tries full rank + first name(s) + surname at the original font size first. If measured font width exceeds the printable band, it uses the shared catalogue’s recognized rank abbreviation before reducing the font size (minimum 18 pt); the complete names and post-nominals remain intact. Ranks without a known abbreviation retain their full spelling. The heading includes
optional post-nominals after a comma. The nine body/dedication mentions use only
the corresponding EN/FR body rank + explicitly entered surname. No name is split
or guessed. These occurrences comprise: four in English body text, three in French, the central headline,
and one in each dedication. Both complete paragraphs are laid out again, with
centered measured word wrapping, shared bilingual body font sizing, explicit
minimum sizes and bounds that keep text above the recipient/signature regions.
Text that cannot fit legibly or contains unsupported glyphs returns 422.

The body/dedication text comes from the supplied PPTX. The English possessive
before “outstanding contributions” is corrected; award claims are otherwise
unchanged. French grammar is explicitly reviewed: Il/Elle (including un futur /
une future leader), and au/du, à la/de la, à l’/de l’, or à/de before the printed
rank. Names never determine grammar. The staff member must select a valid form
for the entered French rank; for example Aviateur uses à l’/de l’, avoiding the
source's “du Avr” wording. No other free-text award claims are accepted.

The central name/date retain Script MT Bold and matching colors. Their old raster
shadows are replaced with newly rendered transparent glyph-outline shadows using
the source's 3 pt blur/distance and 43.137% opacity, produced locally in Node.
The remaining artwork is preserved directly from the official PDF master.
The presentation date is required and formatted deterministically as MMM D, YYYY;
it is never copied from a retirement/release date or defaulted to today.

The four supplied fonts are included under `server/private/certificates/fonts`
and copied into the ordinary app image, outside all public/static routes. No
system-wide font installation is needed. Their bytes and embedded copyright
metadata are unchanged; see `fonts/NOTICE.md`. No separate licence document was
supplied and distribution/server-use rights have not been independently verified.

## Local review and validation

```sh
cd server
node scripts/preview-trusted-to-serve.js /tmp/cmcen-award-proofs
node --test test/trusted-to-serve-documents.test.js test/trusted-to-serve-controller.test.js
```

The preview script creates short and long accented synthetic recipients with
explicit grammatical selections. Review the new award samples before deployment;
retirement output approval does not approve the award output. Portable tests
exercise the master, ten replacements, grammar/date validation, measured bounds,
unsupported text and error recovery. Bundled-font tests run without environment
configuration, including in CI, exercising actual subsets and rebuilt shadows. Route tests verify
authorization, review acknowledgement, private responses, repeated generation,
audits and unchanged request/fulfillment data.

Local browser QA exercised the rendered input form and explicit wording selections.
Controller tests cover download actions, busy controls, repeated clicks, error
recovery and private URL cleanup. Generated sample PDFs were rendered through
PDFKit with rebuilt recipient mentions and unchanged fixed artwork outside the
variable regions. Staff should check downloaded files in their normal PDF reader
before printing.

Heading rank abbreviations use the shared catalogue IDs and the official [English CAF rank table](https://www.canada.ca/en/services/defence/caf/military-identity-system/rank-appointment-insignia.html) and [French CAF rank table](https://www.canada.ca/fr/services/defense/fac/systeme-identite-militaire/insignes-grade-fonction.html). S1/S2/S3 follow the current sailor terminology confirmed in [CAF Personnel Instruction 01/23](https://www.canada.ca/en/department-national-defence/corporate/policies-standards/canadian-forces-military-personnel-instructions/performance-and-competency-evaluation-pace.html). Civilian and Recruit retain their full labels. Body rank inputs remain explicitly reviewed EN/FR text.
