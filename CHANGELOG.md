# Changelog

All notable changes to CMCEN / RCMCE are documented in this file.

This project uses Conventional Commits and git-cliff for changelog generation.

## [0.3.0] - 2026-10-02



### Breaking Changes


- archive: Prepare legacy content as drafts and unify Retirement and Last Post comment moderation. Existing databases with comments in the former collections need the [documented conversion](https://git.corebot.ca/Eric/CMCENDev/src/branch/main/docs/API%20ROUTES.md) before using the new comment routes; old comments remain stored but are otherwise not shown.



### Bug Fixes


- news: Clarify archive and staff article controls

- archive-review: Clarify issues and review choices

- archive: Preserve unknown historical submission metadata

- frontend: Restore calendar month, view, and filters after event details; restore filters and anchors for already loaded Retirement and Last Post cards; release replaced header and picker listeners



### Documentation


- storage: Prefer Garage for new deployments



### Features


- frontend: Reorganize navigation and refine site styling

- admin: Establish admin dashboard and migrate management tools

- content: Unify the staff workspace and let contributors correct and resubmit their own submissions

- association: Add directors page and newsletter archive

- articles: Add database-backed newsletter editing

- media: Refine uploads and reuse the shared crest

- submissions: Show publication, content-edit, and hiding dates separately in staff views

- media: Use deployment-specific image and document URLs as a foundation for portable storage

- admin: Add permission-gated permanent content deletion with confirmation and related-record cleanup

- articles: Unify article editing and categories

- content: Streamline bilingual editing and workspace navigation

- admin: Capture legacy source evidence and review decisions for archive curation

- admin: Add archival discovery review batches

- admin: Add comment migration review exceptions

- migration: Expand archive review and preserve legacy account profiles

- archive: Choose original or new publication dates

- archive: Add restricted staff review workflow

- editorial: Show imported drafts in the Content Workspace and add default-off email controls

- media: Add editable library names with compact pencil controls

- archive: Add content importer and admin controls

- content: Preview saved Retirement and Last Post drafts and clarify publication timing choices



### Maintenance


- Streamline agent guidance

- documents: Move library source files to CDN

- newsletters: Retire temporary newsletter migration artifacts

- ui: Polish public and account pages


## [0.2.0] - 2026-09-18



### Bug Fixes


- search: Improve performance and result ranking

- auth: Preserve session during totp verification



### Features


- benefits: Secure TD Insurance member offer

- content: Add scheduled publication workflow

- banners: Add dismissible site notices

- content: Add bilingual about pages and charter

- content: Migrate legacy governance content

- Migrate Foundation content and isolate calendar styles

- leadership: Add bilingual leadership page

- frontend: Unify public page presentation



### Performance


- assets: Cache versioned static assets



### Refactoring


- content: Centralize editorial review workflow

- frontend: Simplify stylesheet structure


## [0.1.0-rc.3] - 2026-08-31



### Bug Fixes


- frontend: Navigate admin tabs without iframes

- auth: Prevent credential form GET fallbacks

- calendar: Keep event times consistent between list and detail

- search: Return localized static page results

- calendar: Handle missing all-day event end dates

- sitemap: Exclude member-only forms

- security: Hide Express framework header

- i18n: Localize news listing page

- sitemap: Omit dashboard from public sitemap

- last-post: Show crest without portrait

- notifications: Mark one-time alerts on panel close



### Features


- frontend: Unify controls and reset workspace filters

- retirements: Add public archive search

- events: Add public calendar export

- awards: Add professional awards management

- events: Add account-based RSVPs

- awards: Refine awards presentation

- events: Add RSVP management

- legal: Add bilingual legal documents



### Maintenance


- content-workspace: Consolidate placeholder images, confirmation/rejection modal

- formatting: Apply Prettier baseline


## [0.1.0-rc.2] - 2026-08-25



### Bug Fixes


- auth: Improve invitation activation diagnostics

- diagnostics: Expand failure logging

- frontend: Align retirement card titles

- frontend: Align user header actions

- frontend: Restore dark builder icon colors

- frontend: Scroll long mobile banners

- events: Show missing event title validation

- search: Sanitize retirement result snippets

- roles: Prevent unintended contributor admin access

- auth: Redirect signed-in users from registration

- search: Submit global search on Enter

- auth: Revoke access tokens on sign out

- footer: Hide protected contact link from guests

- i18n: Complete French homepage and navigation localization

- accessibility: Make skip link move focus to main content

- assets: Prevent stale client bundles after deployment

- security: Add Content-Security-Policy header

- i18n: Replace remaining English labels on French homepage

- calendar: Preserve event detail language

- sitemap: Exclude protected workspace pages

- frontend: Localize 404 page



### CI


- Prevent duplicate tests after merge



### Features


- pages: Refine visual page builder

- pages: Add branding reference

- content: Improve workspace editing flow

- content-workspace: Manage news stories

- content: Add workspace skeleton loaders

- content: Add workspace image management


## [0.1.0-rc.1] - 2026-08-21



### Bug Fixes


- frontend: Improve mobile layouts

- header: Align desktop notification bell

- content: Linkify retirement and last post messages

- logging: Redact server output and silence client consoles

- editor: Improve content and translation editing

- admin: Hide legacy attribution accounts

- admin: Enlarge users list

- docker: Include changelog in production image



### Documentation


- accessibility: Add public accessibility guidance



### Features


- docker: Add full-stack compose deployment

- footer: Add member partnership links

- analytics: Embed plausible dashboard

- contact: Add member contact form

- translations: Organize admin translation editor

- admin: Add protected content edit routes

- frontend: Add developer changelog

- content: Add editorial workspace

- content: Consolidate review submissions in workspace

- dashboard: Embed permission-aware admin tools

- content-workspace: Add content navigation shortcuts

- pages: Add visual page builder

- content-workspace: Move event submissions into workspace

- content: Add staff workspace and contributor resubmission



### Maintenance


- Remove site config

- Clean workbook import placeholders


## [0.1.0-beta.6] - 2026-08-19



### Bug Fixes


- ci: Use release token for tag publishing


## [0.1.0-beta.5] - 2026-08-19



### Bug Fixes


- ci: Make release PR assignment non-blocking

- dashboard: Align loading skeleton with content



### CI


- release: Tag prepared releases automatically



### Documentation


- agents: Document automatic release tagging


## [0.1.0-beta.4] - 2026-08-19



### CI


- release: Publish Docker images to Forgejo Packages



### Features


- dashboard: Add animated account accordions


## [0.1.0-beta.3] - 2026-08-19



### Bug Fixes


- ci: Repair release workflow yaml



### CI


- release: Add release publishing workflow



### Documentation


- contributing: Add contributor guidelines


## [0.1.0-beta.2] - 2026-08-19



### Bug Fixes


- ci: Use explicit git-cliff action source

- release: Correct changelog release generation

- ci: Harden release preparation workflow



### CI


- release: Add release preparation workflow



### Features


- notifications: Add notification center


## [0.1.0-beta.1] - 2026-08-19

### Internal Beta

This release establishes the automated changelog baseline for CMCEN / RCMCE.

Historical development before this release predates the repository's enforced
Conventional Commit, Conventional PR title, and squash-merge standards and is
not exhaustively listed here.