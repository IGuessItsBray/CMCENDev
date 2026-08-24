# Changelog: August 17-23, 2026

Date range: 2026-08-17 through 2026-08-23
Source: git history after commit `94d7cbc` through `174817b`.

This entry summarizes the changes added after the previous August 10-16
snapshot. Commits landed from August 17 through August 21; no commits were found
for August 22 or August 23.

## Summary

Recent work expanded public content and admin publishing workflows, added CASL
email subscriptions and a notification center, introduced the visual page
builder and editorial/staff workspaces, improved Plausible analytics and Docker
deployment support, and tightened release automation, media handling,
invitation delivery, accessibility, and mobile UI behavior.

## Added

- Added news stories and search, a beta notice, public accessibility guidance,
  member partnership footer links, and a member contact form.
- Added CASL email subscriptions with refined consent details and related
  subscription integration work.
- Added workbook migration tooling and later consolidated the migration helpers.
- Added self-hosted Plausible analytics documentation and embedded Plausible
  dashboard support.
- Added a notification center with optimized badge loading.
- Added release preparation and publishing workflows, automatic release tagging,
  generated changelogs, and Docker image publishing to Forgejo Packages.
- Added a full-stack Docker Compose deployment and ensured the changelog is
  included in the production image.
- Added protected content edit routes, a developer changelog, organized
  translation editing, permission-aware admin dashboard tools, editorial and
  staff workspaces, contributor resubmission support, content navigation
  shortcuts, event-submission workspace handling, freeform page publishing, and
  the visual page builder.

## Changed

- Moved account details into their own dashboard accordion and added animated
  account accordions.
- Collapsed media attachment lists and improved calendar/media manager
  presentation.
- Reworked public and admin content flows around the consolidated review and
  editorial workspaces.
- Updated repository process documentation for PR naming, contributor guidance,
  automatic release tagging, and project configuration.
- Removed legacy site configuration behavior as part of the newer analytics and
  deployment workflow.
- Parallelized the integration suite.

## Fixed

- Fixed invitation delivery diagnostics, invitation delivery panel behavior,
  SMTP HELO parsing, and SMTP security-mode handling.
- Fixed footer contact and policy links plus public contact email links.
- Fixed banner link clickability and retirement detail stylesheet cache
  behavior.
- Fixed retirement photo and crest rendering, including native aspect ratio,
  transparent crest frames, contained crest images, and workbook placeholder
  crest reuse.
- Fixed SheetJS dependency handling by updating the security dependency,
  copying the vendored package before install, and installing from the CDN.
- Fixed dashboard loading skeleton alignment.
- Fixed release and CI workflow issues around git-cliff usage, release
  changelog generation, workflow YAML, release PR assignment, and tag
  publishing tokens.
- Fixed server/client logging exposure by redacting server output and silencing
  client consoles.
- Fixed mobile layouts, desktop notification bell alignment, retirement and
  Last Post message linkification, content/translation editing, legacy
  attribution account visibility, and admin user-list sizing.

## Admin And CMS Notes

- Admin users now have broader content workspace tools for editorial review,
  staff workflows, contributor resubmissions, event submissions, translations,
  protected content editing, and page publishing.
- The visual page builder and freeform publishing work give admins a more
  flexible path for managing public pages.
- Dashboard tools are more permission-aware, notification-aware, and organized
  around expandable account sections.
- Public content management expanded around news, member contact, accessibility,
  footer partnerships, and retirement/Last Post message presentation.

## Developer Notes

- Release engineering was expanded with PR-title validation, squash-merge
  template configuration, generated changelogs, release preparation, release
  publishing, automatic tagging, and Forgejo package image publishing.
- Docker deployment now has full-stack Compose support and production image
  inclusion for the changelog artifact.
- Plausible integration now includes both a self-hosting guide and embedded
  dashboard support.
- Security and operations work included logging redaction, SheetJS dependency
  remediation, SMTP handling fixes, and updated project/agent documentation.

## Commit Reference

- `174817b` - Prepare v0.1.0-rc.1
- `5ddc6e2` - Include changelog in production image
- `86ee9df` - Add staff workspace and contributor resubmission
- `56118e3` - Move event submissions into workspace
- `5abf96b` - Add visual page builder
- `38104ac` - Support freeform page publishing
- `8b24ed8` - Embed permission-aware admin tools
- `7fa8cba` - Consolidate review submissions in workspace
- `b96b87c` - Add editorial workspace
- `2876f7b` - Add developer changelog
- `deb83e1` - Add protected content edit routes
- `93a6e98` - Organize admin translation editor
- `81c696a` - Add member contact form
- `6f6eafe` - Embed Plausible dashboard
- `4f590e6` - Add full-stack Compose deployment
- `cafe0aa` - Add notification center
- `85a1fe4` - Publish Docker images to Forgejo Packages
- `86fdd65` - Add release preparation workflow
- `10c4c15` - Add self-hosted Plausible analytics
- `914ea05` - Collapse media attachment lists
- `61df666` - Polish calendar and media manager
- `6f880fd` - Add workbook migration tools
- `af1372c` - Add CASL email subscriptions
- `a3269ae` - Add news stories and search
- `5b468c7` - Improve accessibility controls
- `9581482` - Customize invitation message
- `23fe605` - Add invitation delivery diagnostics

---

# Changelog: July 21-22, 2026

Date range: 2026-07-21 through 2026-07-22
Source: git history from commit `f8866ab` through `c351bd5`.

This entry summarizes the changes added after the previous July 14-21 snapshot.

## Summary

Recent work extended the admin and CMS toolset, added a current-site migration
workflow, improved media metadata handling, refined MFA and login-adjacent UI,
added refresh-token support, and tightened banner, retirement, analytics, and
submission-review behavior.

## Added

- Added a site migration console and supporting current-site migration scripts,
  including progress reporting while migration posts are collected.
- Added expanded admin user and media tools for richer management workflows.
- Added audit-log export and related audit-log UI refinements.
- Added a public sitemap.
- Added reporting for unique analytics visitors.
- Added refresh-token support for authentication.
- Added a Last Post archive plus a separate Last Post submission and review
  workflow.
- Added retirement live import tooling.
- Added dashboard submission counts and dedicated buttons for individual review
  queues.

## Changed

- Replaced the default browser modal with a custom branded shared modal.
- Refreshed the dashboard MFA configuration visuals.
- Hardened API administration routes.
- Continued normalizing admin documentation, shared styles, Work Zone tabs, and
  shared admin picker components.
- Improved banner placement options, including above/below-header placement,
  sticky behavior, and preview font consistency.
- Moved analytics purge controls under site configuration.
- Updated media CDN URL handling to derive the CDN base from MinIO environment
  settings.
- Added media upload metadata capture and isolated migration tooling for current
  site work.

## Fixed

- Fixed media library refresh behavior after deleting images.
- Fixed banner language switching, banner caching during navigation, and
  non-scrolling banner text centering.
- Fixed crashes caused by orphaned retirement comments.
- Fixed retirement post-nominal duplication and added pagination.
- Fixed analytics country normalization, country capture, fallback order,
  filters, purge behavior, and public upload signing.
- Fixed user update saves by replacing deprecated Mongoose update usage.
- Fixed hero button hover visibility, pointer cursor behavior, and dashboard
  dark-mode page-height changes.

## Admin And CMS Notes

- Admins now have more direct tools for media, users, audit exports, migration,
  analytics, submissions, Last Post reviews, banners, and site configuration.
- The current-site migration workflow includes visible progress feedback and
  isolated scripts for safer operation.
- MFA and dashboard presentation received visual polish without changing the
  core TOTP/passkey behavior documented elsewhere.

## Developer Notes

- New or heavily changed backend areas include migration scripts, API
  administration routes, auth refresh-token handling, media routes, audit log
  export behavior, analytics services, retirement/comment handling, and Last
  Post submission/review routes.
- New or heavily changed frontend areas include migration/admin screens, media
  management, dashboard MFA styling, shared modals, banner utilities, analytics
  views, audit-log export UI, and dashboard review shortcuts.

## Commit Reference

- `c351bd5` - Merge migration tools into main
- `ab25418` - Isolate current site migration tools
- `5a9f93f` - Show progress while collecting migration posts
- `26f3ce7` - Show migration progress counts
- `616c1b8` - Add custom branded shared modal
- `a2143fd` - Add current site migration script
- `e74a07a` - Refresh media after deleting images
- `f990dc2` - Refresh dashboard MFA configuration visuals
- `be2f9cb` - Capture media upload metadata
- `d6f3cf0` - Sync admin docs and styles
- `cdb0ff4` - Export and refine audit logs
- `e2efd54` - Expand admin user and media tools
- `403f63d` - Add public sitemap
- `9ef8a55` - Add site migration console
- `283d3a2` - Report unique analytics visitors
- `4e0317f` - Implement refresh tokens
- `7c9d7c2` - Localize banner admin editor
- `ce43b0e` - Add Last Post submission and review workflow
- `418c488` - Add Last Post archive
- `885108b` - Add retirement live import tooling
- `82b2083` - Harden API administration routes
- `af33c04` - Add banner placement, sticky banners, and preview font alignment
- `6b9a9d1` - Fix crash on orphaned retirement comments
- `06a369c` - Cache banner in tab while navigating

---

# Changelog: July 14-21, 2026

Date range: 2026-07-14 through 2026-07-21  
Source: git history through commit `f965a44` on 2026-07-21.

This is a dated historical snapshot. For current setup, routes, and migration
instructions, use the repository README and the other documents in this folder.

## Summary

This week focused on improving the admin and CMS workflow, adding analytics and media-management capabilities, introducing scheduled site banners, and tightening several user-facing bugs around submissions, retirements, analytics, navigation, and UI polish.

## Added

- Added a website analytics dashboard with a new analytics permission, visit model, analytics routes, admin tab, and frontend reporting UI.
- Added analytics capture helpers and server-side analytics services for visits, referrers, device/browser details, countries, and dashboard summaries.
- Added direct bulk media uploads from the admin UI, including shared upload helpers and improved media-management controls.
- Added media metadata and responsive variants for uploaded assets, including model updates, upload-route processing, page rendering support, and page-builder integration.
- Added scheduled banners/timers with a new `Timer` model, timer API routes, admin management screen, public banner rendering, placement support, scheduling windows, countdown data, color controls, and related permissions.
- Added clean extensionless page URLs and redirects from `.html` paths to cleaner routes.
- Added dashboard counts and dedicated dashboard buttons for pending submission review types.
- Added a cancel-editing action for event editing and standardized event editing tabs with the rest of the admin area.
- Added shared admin color and date/time picker assets used by banner and admin workflows.
- Added a public `/api/version` endpoint and frontend footer display for the running build commit.
- Added a CDN-hosted crest favicon across public pages.

## Changed

- Overhauled the page builder experience with a larger editor update, richer page/block configuration, improved rendering behavior, and significant styling updates.
- Moved analytics data purge controls out of the analytics page and into Site Configuration, keeping destructive maintenance actions with other site-level settings.
- Normalized Admin Work Zone tab behavior and labels across analytics, audit logs, timers, translations, and related admin screens.
- Polished role-management presentation and footer credit styling.
- Updated media CDN handling so media URLs can derive their CDN base from MinIO-related environment configuration.
- Updated public pages to use shared banner/timer utilities and consistent frontend utility loading.

## Fixed

- Fixed dashboard dark-mode styling so toggling dark mode no longer affects page height.
- Fixed retirement message post-nominal duplication and added pagination to retirement listings.
- Fixed user update saves by replacing deprecated Mongoose update behavior with safer model update handling.
- Fixed hero button visibility on hover and added expected pointer cursor behavior for buttons.
- Fixed analytics filters, country capture, country normalization, country fallback order, and analytics purge behavior.
- Fixed public upload signing behavior used by media and page workflows.
- Fixed banner language switching so banner text follows the active language.
- Fixed non-scrolling banner text alignment so it remains centered.

## Admin And CMS Notes

- Admin users now have more direct paths to review specific submission categories from the dashboard.
- Page builder work is now broader and more visual, with better support for media-aware page content.
- Banner administration is available through the timers admin UI and supports scheduling, ordering, placement, colors, and countdown timing.
- Site Configuration now owns analytics purge controls.
- Admin tabs are more consistent across the Work Zone.

## Developer Notes

- New or heavily changed backend areas include `server/routes/analytics.js`, `server/services/analytics.js`, `server/models/AnalyticsVisit.js`, `server/routes/timers.js`, `server/models/Timer.js`, `server/routes/uploads.js`, `server/routes/pages.js`, and `server/services/media-library.js`.
- New or heavily changed frontend areas include `server/public/analytics.js`, `server/public/timers-admin.js`, `server/public/timers.js`, `server/public/pages-admin.js`, `server/public/page.js`, `server/public/dashboard.js`, `server/public/color-picker.js`, and `server/public/date-time-picker.js`.
- Permissions were extended for analytics and timers/banner administration.
- Translation keys were updated for new dashboard, timer, retirement pagination, and admin labels.

## Commit Reference

- `f965a44` - Show running build version
- `f8866ab` - Add shared admin pickers
- `6a9b5bd` - Normalize admin work zone tabs
- `b0159ac` - Fix banner language switching and banner text alignment
- `66796eb` - Add scheduled banners and clean page URLs
- `b68c40d` - Move analytics purge under site config
- `feb459f` - Set CDN crest favicon
- `8569d88` - Derive media CDN base from MinIO env
- `1b6886c` - Fix analytics country fallback order
- `561fd76` - Add submission counts and dashboard review buttons
- `aa80829` - Fix hero button hover visibility and button cursors
- `02e762d` - Fix analytics country normalization
- `b929cf2` - Fix analytics country capture and purge
- `f3346ee` - Add media metadata and responsive variants
- `2865653` - Fix analytics filters and public upload signing
- `b19e6c9` - Overhaul page builder experience
- `2ca2c45` - Polish admin roles and footer credit
- `78f5a11` - Add direct bulk media uploads
- `51463d3` - Add website analytics dashboard
- `ce2f95d` - Fix dashboard dark-mode page height
- `95f5881` - Fix retirement post-nominal duplication and add pagination
- `a9115c3` - Fix user update saves and deprecated Mongoose usage
- `02f01e2` - Add cancel editing for events and standardize tabs
