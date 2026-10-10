# Staff notice rank editing

Retirement and Last Post staff detail editors have exactly two rank dropdowns:
English and French. A catalogue selection on either side sets the verified
counterpart. Clearing either clears both authored ranks. Rank options always
remain in their respective languages when the surrounding interface changes.
Trade/specialty fields are separate and unchanged by this rank change.

The single shared source is `server/public/person-rank-options.js`, loaded by
the staff workspace and required by the server's rank validation service.
It reuses the existing public retirement list and EN/FR labels where sound,
adds Master Sailor, and corrects the two naval sub-lieutenant counterparts in
this staff catalogue. The existing public form catalogue/behavior is unchanged.

Verified sources:

- [CAF rank table in English](https://www.canada.ca/en/services/defence/caf/military-identity-system/rank-appointment-insignia.html)
- [CAF rank table in French](https://www.canada.ca/fr/services/defense/fac/systeme-identite-militaire/insignes-grade-fonction.html)
- [Navy ranks and current junior-rank naming](https://www.canada.ca/en/services/defence/caf/military-identity-system/navy-ranks.html)
- [Navy ranks in French](https://www.canada.ca/fr/services/defense/fac/systeme-identite-militaire/grades-marine.html)

Army/Air Force Captain and Captain (Navy), and Lieutenant versus Lieutenant
(Navy), are distinct choices. No service branch is inferred from a name or
equivalent rank level. Only explicit, unambiguous Army/Air Force abbreviations
in the shared source are recognized; ambiguous/historical naval abbreviations
are retained rather than expanded. The standard French catalogue labels reuse
the existing project forms; feminine, retired, appointment, foreign and custom
wording outside that catalogue is not converted automatically.

Each existing out-of-catalogue value appears as a retained option in its own
dropdown, with a short explanation. Its counterpart remains exactly authored
(or empty when unavailable). Existing conflicting bilingual values also remain
unchanged until a catalogue selection. Choosing a retained custom option after
a catalogue selection restores the original pair. This fallback preserves
existing values but does not add free-form authoring or guess a new translation.

Recognized EN-only values show the verified French counterpart; saving may
populate it while preserving the original English/legacy spelling. Merely
opening the editor writes nothing. Unchanged saves preserve the certificate
legacy rank; an explicit rank change updates the compatibility field to the
selected English value. Public submission forms and older clients keep their
current payload behavior. No migration or automatic backfill is performed.

For a changed catalogue selection, the UI sends `ranks.catalogueId` with its
exact EN/FR strings. The same shared catalogue validates this input on all
existing notice create/edit endpoints. A mismatched/unknown selection returns
400; the token is not stored. Historical/custom payloads without a selection
token retain existing string/length validation and permissions.
