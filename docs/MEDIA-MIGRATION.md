# Portable media references

Use `imageKey` (resolved to `image`) or `fileKey` (resolved to `fileUrl`) in
`server/public/page-content/*.json`. The shared page-content route resolves these
recursively. Existing absolute URLs and bundled local files remain supported.
Use `/<object-key>` (under `/images/` or `/documents/`) in static HTML:
the server redirects to the existing
`CDN_PUBLIC_BASE_URL` configuration, including any bucket prefix. Existing media
configuration fallbacks still apply. Do not add per-page routes or hardcode a
deployment hostname. Backend image defaults use `buildPublicMediaUrl`.

All public image keys belong under `images/`; documents belong under `documents/`.
Page-specific subfolders do not require page-specific proxy rules. Bundled design
assets live under `/assets/images/`, outside these media redirects.

The current migration requires these copies on each source-backed deployment:

| Existing source key         | Destination key                    | Objects   |
| --------------------------- | ---------------------------------- | --------- |
| `leadership/portraits/...`  | `images/leadership/portraits/...`  | 14        |
| `association/portraits/...` | `images/association/portraits/...` | 9         |
| `favicon_crest.png`         | `images/favicon_crest.png`         | 1         |
| `documents/...`             | `documents/...`                    | Unchanged |

Keep originals while old links remain in use. Existing objects already under
`images/` retain their keys. On 2026-09-24, all 24 image-prefix copies above were
completed on Corebot MinIO and verified byte-for-byte through its public CDN;
the original objects were also verified unchanged. Verify other deployments
separately.

The organization chart (`ce-family-organization-chart.jpg`), foundation photo
(`foundation-students-pow-exhibit.jpg`), and membership GIF
(`td-insurance-membership.gif`) now use `/images/<filename>` references.
Their sources are still `server/public/images/`; the inventory identifies them
with `sourceFile` instead of a source bucket key. Upload their original bytes
to `images/<filename>`, verify public reads, and register their MediaAsset records
on each deployment before removing the bundled copies. Preserve GIF animation.
The bundled copies are retained until that verification is complete.

The logo and decorative `leadership/princess-anne-laurel-frame.svg` are bundled
in `server/public/assets/images/`. Their old `/images/` URLs redirect to the
bundled files so saved branding references still work. The unused `jimmy.jpg`
was removed after confirming it had no repository references.

## Read-only inventory

From `server/` under Node 24:

```sh
node scripts/migration/plan-media-urls.js \
  --from=https://cdn.corebot.ca/cmcen-demo \
  --to=https://media.cefamily.ca > /tmp/media-plan.json
```

This inventories public source files without connecting to MongoDB. Add
`--database` to scan content collections in the database selected by `MONGO_URI`.
Prefer read-only database credentials for that operation. The plan contains
record IDs, field paths and media URLs, not full content or account records.
Keep database reports private. The tool has no apply mode and performs no writes.
`objectCopies` records explicit source-to-destination keys, including the image
prefix changes above. For portable static references, source keys come from the
known legacy layout and must be verified against the source bucket. Absolute
database references retain their actual source key. Objects already copied to
their destination should be verified and reused, not overwritten blindly.

Database URLs are only proposed for replacement, not automatically converted to
bare object keys: existing API, editor and email contracts expect usable URLs.
The scan covers news, events, retirement and Last Post messages, pages, media
assets, professional awards and navigation. Accounts, queues, audit/revision
history and provenance fields are excluded. Legacy migration input manifests
retain their source URLs; they are not runtime public-page content.

## Before rollout

This initial change establishes portable static media references and migration
planning. It does not migrate article, retirement, Last Post or newsletter
database content, change the storage provider, or authorize shutting down MinIO.
Keep the PR unmerged until the affected Corebot URLs below have been verified:

- 14 leadership portraits at `images/leadership/portraits/`.
- 9 association portraits at `images/association/portraits/`.
- The favicon at `images/favicon_crest.png`.
- The 3 bundled editorial images at their new `images/<filename>` keys.

Corebot storage preparation was completed on 2026-09-24: the 24 prefix copies
and the 3 editorial uploads passed public CDN byte verification. This clears the
initial storage prerequisite; it does not indicate that the PR is merged or that
the broader database/media migration is complete.

The 75 document-library objects retain their existing `documents/library/` keys.
All 75 Corebot CDN URLs returned HTTP 200 during the pre-PR check on 2026-09-24;
no additional Corebot document upload is required. The experimental VPS still
needs those documents copied to Garage and `/documents/*` enabled before its
document links will work after deployment.

Copy rather than rename the source objects so the deployed version continues
working until the new build is live. Verify the deployed media base configuration
and bundled artwork as part of release validation. A successful static build does
not establish that storage is ready.

1. Review the static inventory and the source database's inventory separately.
   Reconcile selected real content and its originals, variants and documents.
   The URL scan is not proof that all bucket objects or historical content were found.
2. Copy the required objects and verify their public reads on each deployment.
   The experimental VPS additionally needs the crest, favicon, association
   portraits and library documents before those pages can switch successfully.
3. Configure public serving once for `/images/*` and `/documents/*`.
   The VPS already serves `/images/*`; document serving still needs configuring.
   Association portraits and the favicon use the image rule after their planned
   copies. Do not add separate public proxy rules for each page.
4. Confirm `CDN_PUBLIC_BASE_URL` points to the verified public service, then
   deploy. Verify both languages, images, document downloads and default news images.
5. Prepare a separate reviewed database update from the dry-run report, with
   backup, concurrency checks and verification. Do not globally replace all
   strings or modify historical source attribution. This change does not update
   existing database records or change stored upload URL contracts.

Keep MinIO and old URLs available until the inventory and checks are reconciled.
No storage, database, DNS, proxy or deployment changes are performed by this code.
