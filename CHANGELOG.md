# Changelog

All notable changes to CMCEN / RCMCE are documented in this file.

This project uses Conventional Commits and git-cliff for changelog generation.

## [0.4.0] - 2026-10-09



### Breaking Changes


- security: Address security audit findings — Bray Delaire



### Bug Fixes


- devs: Render changelog hyperlinks — Bray Delaire

- media: Preserve full-size detail portraits — Eric

- media: Open stored originals from the media library — Eric

- admin: Allow developer blank descriptive saves — Eric

- ui: Preserve archive comments and improve review readability — Eric

- content: Improve bilingual notices and staff navigation — Eric

- content: Preserve numbers within retirement notice prose — Eric

- ui: Retire beta branding and improve account setup (#376) — Eric

- content: Preserve notice formatting and legacy attachment links — Eric

- content: Simplify notice controls and preserve fixed layout — Eric

- content: Make notice link labels editable — Eric

- release: Credit changelog contributors — Bray Delaire

- footer: Repair public links — Bray Delaire

- admin: Use a mobile navigation drawer — Bray Delaire

- footer: Embed checkout commit in container builds — Bray Delaire



### Features


- foundation: Add managed Adopt a Display catalogue (#362) — Eric

- articles: Add shared review flags and notes — Eric

- backups: Add developer-only encrypted database backups — Bray Delaire

- footer: Show running release or development commit — Bray Delaire

- backups: Add calendar schedules and shared analytics connections — Bray Delaire



### Maintenance


- docker: Replace minio compose stack with garage — Bray Delaire

- ci: Build Docker images only for releases — Bray Delaire


## [0.3.0] - 2026-10-02



### Breaking Changes


- archive: Prepare legacy content as drafts and unify Retirement and Last Post comment moderation. Existing databases with comments in the former collections need the [documented conversion](https://git.corebot.ca/Eric/CMCENDev/src/branch/main/docs/API%20ROUTES.md) before using the new comment routes; old comments remain stored but are otherwise not shown. — Eric



### Bug Fixes


- news: Clarify archive and staff article controls — Eric

- archive-review: Clarify issues and review choices — Eric

- archive: Preserve unknown historical submission metadata — Eric

- frontend: Restore calendar month, view, and filters after event details; restore filters and anchors for already loaded Retirement and Last Post cards; release replaced header and picker listeners — Eric



### Documentation


- storage: Prefer Garage for new deployments — Eric



### Features


- frontend: Reorganize navigation and refine site styling — Eric

- admin: Establish admin dashboard and migrate management tools — Eric

- content: Unify the staff workspace and let contributors correct and resubmit their own submissions — Eric

- association: Add directors page and newsletter archive — Eric

- articles: Add database-backed newsletter editing — Eric

- media: Refine uploads and reuse the shared crest — Eric

- submissions: Show publication, content-edit, and hiding dates separately in staff views — Eric

- media: Use deployment-specific image and document URLs as a foundation for portable storage — Eric

- admin: Add permission-gated permanent content deletion with confirmation and related-record cleanup — Eric

- articles: Unify article editing and categories — Eric

- content: Streamline bilingual editing and workspace navigation — Eric

- admin: Capture legacy source evidence and review decisions for archive curation — Eric

- admin: Add archival discovery review batches — Eric

- admin: Add comment migration review exceptions — Eric

- migration: Expand archive review and preserve legacy account profiles — Eric

- archive: Choose original or new publication dates — Eric

- archive: Add restricted staff review workflow — Eric

- editorial: Show imported drafts in the Content Workspace and add default-off email controls — Eric

- media: Add editable library names with compact pencil controls — Eric

- archive: Add content importer and admin controls — Eric

- content: Preview saved Retirement and Last Post drafts and clarify publication timing choices — Eric



### Maintenance


- Streamline agent guidance — Eric

- documents: Move library source files to CDN — Eric

- newsletters: Retire temporary newsletter migration artifacts — Eric

- ui: Polish public and account pages — Eric


## [0.2.0] - 2026-09-18



### Bug Fixes


- search: Improve performance and result ranking — Eric

- auth: Preserve session during totp verification — Eric



### Features


- benefits: Secure TD Insurance member offer — Eric

- content: Add scheduled publication workflow — Eric

- banners: Add dismissible site notices — Eric

- content: Add bilingual about pages and charter — Eric

- content: Migrate legacy governance content — Eric

- Migrate Foundation content and isolate calendar styles — Eric

- leadership: Add bilingual leadership page — Eric

- frontend: Unify public page presentation — Eric



### Performance


- assets: Cache versioned static assets — Eric



### Refactoring


- content: Centralize editorial review workflow — Eric

- frontend: Simplify stylesheet structure — Eric


## [0.1.0-rc.3] - 2026-08-31



### Bug Fixes


- frontend: Navigate admin tabs without iframes

- auth: Prevent credential form GET fallbacks — Eric

- calendar: Keep event times consistent between list and detail — Bray Delaire

- search: Return localized static page results — Bray Delaire

- calendar: Handle missing all-day event end dates — Bray Delaire

- sitemap: Exclude member-only forms — Bray Delaire

- security: Hide Express framework header — Bray Delaire

- i18n: Localize news listing page — Bray Delaire

- sitemap: Omit dashboard from public sitemap — Bray Delaire

- last-post: Show crest without portrait — Eric

- notifications: Mark one-time alerts on panel close — Eric



### Features


- frontend: Unify controls and reset workspace filters — Eric

- retirements: Add public archive search — Bray Delaire

- events: Add public calendar export — Bray Delaire

- awards: Add professional awards management — Bray Delaire

- events: Add account-based RSVPs — Bray Delaire

- awards: Refine awards presentation — Eric

- events: Add RSVP management — Eric

- legal: Add bilingual legal documents — Eric



### Maintenance


- content-workspace: Consolidate placeholder images, confirmation/rejection modal — Eric

- formatting: Apply Prettier baseline — Eric


## [0.1.0-rc.2] - 2026-08-25



### Bug Fixes


- auth: Improve invitation activation diagnostics — Bray Delaire

- diagnostics: Expand failure logging — Bray Delaire

- frontend: Align retirement card titles — Bray Delaire

- frontend: Align user header actions — Bray Delaire

- frontend: Restore dark builder icon colors — Bray Delaire

- frontend: Scroll long mobile banners — Bray Delaire

- events: Show missing event title validation — Eric

- search: Sanitize retirement result snippets — Eric

- roles: Prevent unintended contributor admin access — Bray Delaire

- auth: Redirect signed-in users from registration — Bray Delaire

- search: Submit global search on Enter — Bray Delaire

- auth: Revoke access tokens on sign out — Eric

- footer: Hide protected contact link from guests — Bray Delaire

- i18n: Complete French homepage and navigation localization — Eric

- accessibility: Make skip link move focus to main content — Eric

- assets: Prevent stale client bundles after deployment — Eric

- security: Add Content-Security-Policy header — Eric

- i18n: Replace remaining English labels on French homepage — Eric

- calendar: Preserve event detail language — Eric

- sitemap: Exclude protected workspace pages — Eric

- frontend: Localize 404 page — Eric



### CI


- Prevent duplicate tests after merge — Bray Delaire



### Features


- pages: Refine visual page builder

- pages: Add branding reference — Bray Delaire

- content: Improve workspace editing flow — Eric

- content-workspace: Manage news stories — Eric

- content: Add workspace skeleton loaders — Eric

- content: Add workspace image management — Eric


## [0.1.0-rc.1] - 2026-08-21



### Bug Fixes


- frontend: Improve mobile layouts — Bray Delaire

- header: Align desktop notification bell — Bray Delaire

- content: Linkify retirement and last post messages — Bray Delaire

- logging: Redact server output and silence client consoles — Bray Delaire

- editor: Improve content and translation editing — Eric

- admin: Hide legacy attribution accounts — Bray Delaire

- admin: Enlarge users list — Bray Delaire

- docker: Include changelog in production image — Bray Delaire



### Documentation


- accessibility: Add public accessibility guidance — Bray Delaire



### Features


- docker: Add full-stack compose deployment — Bray Delaire

- footer: Add member partnership links — Bray Delaire

- analytics: Embed plausible dashboard — Bray Delaire

- contact: Add member contact form — Bray Delaire

- translations: Organize admin translation editor — Eric

- admin: Add protected content edit routes — Bray Delaire

- frontend: Add developer changelog — Bray Delaire

- content: Add editorial workspace — Eric

- content: Consolidate review submissions in workspace — Eric

- dashboard: Embed permission-aware admin tools — Bray Delaire

- content-workspace: Add content navigation shortcuts — Eric

- pages: Add visual page builder — Bray Delaire

- content-workspace: Move event submissions into workspace — Eric

- content: Add staff workspace and contributor resubmission — Eric



### Maintenance


- Remove site config — Eric

- Clean workbook import placeholders — Bray Delaire


## [0.1.0-beta.6] - 2026-08-19



### Bug Fixes


- ci: Use release token for tag publishing — Bray Delaire


## [0.1.0-beta.5] - 2026-08-19



### Bug Fixes


- ci: Make release PR assignment non-blocking — Bray Delaire

- dashboard: Align loading skeleton with content — Eric



### CI


- release: Tag prepared releases automatically — Bray Delaire



### Documentation


- agents: Document automatic release tagging — Bray Delaire


## [0.1.0-beta.4] - 2026-08-19



### CI


- release: Publish Docker images to Forgejo Packages — Bray Delaire



### Features


- dashboard: Add animated account accordions — Eric


## [0.1.0-beta.3] - 2026-08-19



### Bug Fixes


- ci: Repair release workflow yaml — Bray Delaire



### CI


- release: Add release publishing workflow — Bray Delaire



### Documentation


- contributing: Add contributor guidelines — Bray Delaire


## [0.1.0-beta.2] - 2026-08-19



### Bug Fixes


- ci: Use explicit git-cliff action source — Bray Delaire

- release: Correct changelog release generation — Bray Delaire

- ci: Harden release preparation workflow — Bray Delaire



### CI


- release: Add release preparation workflow — Bray Delaire



### Features


- notifications: Add notification center — Eric


## [0.1.0-beta.1] - 2026-08-19

### Internal Beta

This release establishes the automated changelog baseline for CMCEN / RCMCE.

Historical development before this release predates the repository's enforced
Conventional Commit, Conventional PR title, and squash-merge standards and is
not exhaustively listed here.
