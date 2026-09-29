# Article WordPress identity repair

The original 16 article imports stored their source URL in `migrationSource`
and their numeric WordPress post IDs in `confirmed-imports.json`. The repair
persists those verified IDs directly in `NewsArticle.legacy.sourcePostIds`,
with a stable source namespace and historical `sourceUrls`.

The source namespace `https://cmcen-rcmce.ca` identifies the originating dataset;
it is not a fetch endpoint. Neither matching stored numeric IDs nor this repair
requires WordPress URLs to resolve. URLs remain historical evidence and may
later support redirects. Do not replace source provenance with new-site URLs.

`backfill-article-provenance.js` checks both the known Mongo ID and exact stored
source URL before planning any updates. Missing records, conflicting existing
provenance, and duplicate mappings stop the plan. It backs up the full affected
documents, requires an unchanged snapshot before applying, and updates only
the provenance field with a conditional write. Existing correct provenance is
preserved, including additional source IDs. Content, editorial timestamps,
publication state and accounts are not changed.

The initial repair establishes the 16 confirmed primary source IDs. Additional
language source IDs must be verified against the material actually imported
before being attached; a WPML relationship alone does not prove import.

The private VPS runner copies and verifies the backup outside the container
before applying. Application is not confirmed until the operator shares the
result. No production import is performed by committing these files.
