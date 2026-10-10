# Notice identity preparation

Original-image selection and new package freezing use the current shared image
limits: 10 MiB, 24 megapixels, 10000 pixels per dimension and one supported raster
frame. Cached originals receive the same checks as fetched candidates. Selection
uses the hardened HTTPS/public-DNS transport with no redirects or HTTP proxies;
a failed candidate is not replaced by a crest. Compliant original bytes and
their checksums remain unchanged. PDF and reused-asset handling remain separate.
Existing completed manifests are not rewritten or automatically reimported.

For a new retirement draft, use `prepareRetirementIdentity` from
`server/scripts/migration/lib/content-import-package.js` before generating its
identity-plan payload digest or freezing the package. Pass the reviewed retiree
fields, retained source records (`language`, `title`) and primary source language.
The helper preserves reviewed names/ranks and parses only the primary name's
suffix. It separates optional post-nominals from dash-separated five-digit MOSID
text, including source suffixes such as `00384-01`. English/French specialties
come from their own retained titles; no translation or rank/name reconciliation
is inferred. Ambiguous suffixes/name mismatches stop for review.

The pure CLI `server/scripts/migration/prepare-notice-identity.js` accepts JSON
stdin `{ retiree, sourceRecords, primaryLanguage }` and emits only prepared
identity JSON. It performs no network/database writes. Source bodies, titles,
dates, links, comments and media still require their existing independent review.
New-package preflight rejects a MOSID in post-nominals, omitted differing
bilingual specialties, or supplied specialties differing from recognized source
title values. Packages that load migration modules in memory must include
`lib/notice-identity.js` with their reviewed `content-preflight.js` overlay.

This prepares new drafts only. Never feed saved staff edits back through title
parsing, regenerate completed frozen packages, or use an import rerun to repair
an existing record. Completed imports continue to preserve saved edits; a record
correction requires a separate exact-scope review using normal audited editing.
