# Changelog: Past Week

Date range: 2026-07-14 through 2026-07-21  
Source: git history through commit `f965a44` on 2026-07-21.

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
