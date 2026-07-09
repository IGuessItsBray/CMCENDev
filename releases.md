Release: alpha-0.0.1
Date: 2026-07-09

Summary
-------
alpha-0.0.1 is an early-feature release documenting the initial admin and CMS tooling present in the repository. This release bundles: account notifications (rejection/feedback flow), a full Admin Work Zone including role editor and media management, a page builder for structured pages, event/calendar support, retirement message workflows, centralized audit logging, and migration tooling used to bootstrap initial data.

Supported features
------------------
1) Notifications
- Purpose: Account notifications surface rejected submissions and actionable feedback to users; retirement comments can be edited in-place.
- Client: server/public/notifications.html, server/public/notifications.js
- Server endpoints used: GET /api/notifications, PATCH /api/retirement-messages/comments/:id
- Key behavior: highlights comment by ?comment=<id>, shows localized labels, disables submit button during requests, refreshes list after successful edit.
- i18n & accessibility: uses translate(...) keys (server/data/translations.json), role=status and aria-live usage.

2) Role editor & Admin Work Zone
- Purpose: Admin UI to list users, manage custom roles/permissions, assign roles, manage media and content, and promote developers.
- Client: server/public/admin-users.js (+ AdminUsersView component), server/public/admin-users.html
- Server endpoints (admin):
  - GET /api/admin/roles, POST /api/admin/roles, PATCH /api/admin/roles/:id, DELETE /api/admin/roles/:id
  - GET /api/admin/users, GET /api/admin/users/:id, PATCH /api/admin/users/:id, PATCH /api/admin/users/:id/developer
  - GET/POST/DELETE /api/admin/media
- Permissions: Controlled by server/config/permissions.js (PERMISSION_CATALOG) and server/config/roles.js (USER_ROLES, ROLE_LEVELS).
- Key utilities: adminApiJson() wrapper for auth & 403 handling; syncAssignedCustomRoles() maps user.customRoleIds to role objects for UI rendering.

3) Page Builder (CMS pages)
- Purpose: Create and manage pages composed of typed blocks (heading, text, image, callout, button, divider) with localization and fine-grained access control.
- Model: server/models/Page.js (PageSchema, PageBlockSchema, LocalizedStringSchema, PageAccessSchema).
- Block fields: localized text/body/caption/alt, mediaKey/mediaUrl, url, variant, heading level.
- Slug: normalized from title if missing; unique constraint enforced by model.
- Access control: audience (public/authenticated/restricted), roles (built-in), customRoles (ObjectId refs), permissions (normalized against PERMISSION_CATALOG).
- Client: server/public/page.html and pages-admin.js for admin editing workflows.

4) Events / Calendar
- Purpose: Support event submissions and calendar listings for members and admins.
- Server: server/routes/events.js provides event CRUD and listing endpoints consumed by the frontend.
- Admin flows: events appear in admin content lists and can be deleted from the Admin Work Zone; client files include server/public/event.html and related admin list pages.
- Key behavior: events use localized title/summary and publishing workflows consistent with other content types.

5) Retirement messages
- Purpose: Members submit retirement (memorial) messages; admins review, reject, or publish them. Retirement comments are surfaced as notifications.
- Server: server/routes/retirement-messages.js (submission, comments, moderation endpoints).
- Client pages: server/public/retirements.html, server/public/retirement-message.html, server/public/submit-retirement.html and the notifications UI which links to comment edits.
- Admin flows: Admins can review and delete retirement messages via the Admin Work Zone; comment edits use PATCH endpoints used by notifications client.

6) Audit logging
- Purpose: Record key system events (security, login, publishing, deletion, role changes) for traceability and compliance.
- Model: server/models/AuditLog.js defines audit event schema (actor, action, target, metadata, timestamps).
- Service: server/services/audit-log.js exposes helpers to write audit entries from routes and services.
- UI: server/public/audit-log.js and server/public/audit-log.html render paginated audit entries for authorized users; permission key audit.view gates access.

7) Media library
- Admin media listing, upload and delete flows in the Admin Work Zone.
- API: /api/admin/media supports limit/cursor pagination; deletion is guarded when media is attached to content (server returns attachedPosts info).
- Client: admin-users.js implements media pagination and UI messaging when deletion fails due to attachments.

8) Permissions and role utilities
- PERMISSION_CATALOG centralizes permission keys, labels, groups, and descriptions (server/config/permissions.js).
- Utility functions: normalizePermissionKeys(), getUserPermissions(user) (merges built-in flags and custom role permissions), hasMinimumRole().
- Legacy mapping: LEGACY_PERMISSION_KEYS maps earlier flag names to the canonical keys for backward compatibility.

9) Translations
- Translations live in server/data/translations.json and are used via translate(...) in client-side code. A translations-admin UI exists for editing strings.

10) Auth, MFA and account management
- Routes: server/routes/auth.js and server/routes/mfa.js implement login, token, and MFA flows.
- Notes: TOTP and passkey (WebAuthn) considerations are documented in the repo instructions; demo seed scripts configure sample users.

11) Migration tools
- Purpose: Scripts to parse external data dumps and seed the database for initial deployment or demo data.
- Key scripts:
  - server/scripts/migration/parse-wordpress-dumps.js — parser for WordPress XML/exports to transform into Page, Event, and RetirementMessage documents.
  - server/scripts/seed-demo-users.js, seed-demo-community.js — seed sample users and community content for local dev.
  - server/scripts/list-events.js and server/scripts/list-retirement-messages.js — helpers to inspect migrated or seeded content.
- Usage: run migration scripts locally to transform external exports into documents compatible with our models; follow script comments for required input and environment variables.

12) First successful data migration
- Summary: An initial test migration was completed using server/scripts/migration/parse-wordpress-dumps.js to import a representative WordPress export into the application's Page and RetirementMessage collections.
- Verification: The migration run was validated by inspecting results with server/scripts/list-retirement-messages.js and server/scripts/list-events.js and by viewing imported pages/events in the admin UI.
- Notes: The migration demonstrated field mapping for localized strings, mediaKey/mediaUrl extraction, and preservation of dates and authorship metadata. Operators should test their specific exports and adjust parse-wordpress-dumps.js mappings as needed.

Developer & operator notes
--------------------------
- Important files & places to inspect:
  - Admin UI: server/public/admin-users.js, server/public/pages-admin.js
  - Pages & migration: server/models/Page.js, server/scripts/migration/parse-wordpress-dumps.js
  - Permissions & roles: server/config/permissions.js, server/config/roles.js
  - Notifications: server/public/notifications.js
  - Events & retirements: server/routes/events.js, server/routes/retirement-messages.js
  - Audit: server/models/AuditLog.js, server/services/audit-log.js, server/public/audit-log.js
- Adding permissions: add to PERMISSION_CATALOG and update UI lists rendering permissionCatalog.
- Adding page block types: update PageBlockSchema enum and client editors/renderers.
- Slug collisions: Page.slug is unique at the DB level; migration runs should normalize titles and detect duplicates before insert.
- Tests: server/package.json test script is a placeholder; adding unit and integration tests for migration scripts and admin flows is recommended before production deployment.

Known limitations & TODOs
------------------------
- No CI-run E2E tests for admin and migration flows yet.
- Role deletion currently removes roles client-side; server enforcement and orphan cleanup need audit and tests.
- Migration scripts are functional but require more ergonomic configuration and logging for large exports (streaming, error reports, dry-run mode).
- Consider a post-migration audit step that records imported counts and anomalies into an AuditLog entry for traceability.

Contributors and contacts
-------------------------
- Primary maintainers: repository owners and listed authors in README.

Next steps / roadmap
--------------------
- Add automated tests and CI for admin and migration pipelines.
- Harden server-side enforcement for role/media deletion and publish workflows.
- Improve migration tooling: add dry-run, mapping config, and better logging; store migration provenance in AuditLog.
- Expand page builder editor UX and add WYSIWYG options for non-technical content authors.

Release notes prepared by: codebase scan and migration exercise (2026-07-09)
