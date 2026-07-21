# Server Routes

All routes are mounted by `server/server.js`. Paths below include the full `/api` prefix used by clients (when applicable).

## Authentication and Account Routes

Defined in `auth.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Public | Create a new subscriber account from registration form fields. |
| `POST` | `/api/login` | Public | Authenticate with username and password. If the account has 2FA enabled the response may indicate `twoFactorRequired` and return a temporary token and available methods. |
| `GET` | `/api/me` | Bearer token | Return the authenticated user's profile plus computed permissions and notification summary. |
| `GET` | `/api/notifications` | Bearer token | Return a compact notification summary (rejected events, retirement messages, comments) with links. |
| `PATCH` | `/api/profile` | Bearer token | Update editable profile fields (address, name, rank, preferredLanguage, etc.). |
| `GET` | `/api/contributor-check` | Contributor or higher | Confirm the current user can submit contributor-level content. |
| `GET` | `/api/admin-check` | User management | Confirm administrator/developer user-management access. |

Notes:
- `POST /api/login` may return `{ twoFactorRequired: true, methods: [...], tempToken }` when TOTP or WebAuthn is configured for the account.
- `PATCH /api/profile` validates required profile/address fields when provided and returns the updated profile.

## Multi-factor (MFA) Routes

Defined in `mfa.js` (mounted at `/api/mfa`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/mfa/webauthn/register/options` | Bearer token | Generate WebAuthn registration options for a new passkey. |
| `POST` | `/api/mfa/webauthn/register/verify` | Bearer token | Verify WebAuthn registration response and store credential. |
| `POST` | `/api/mfa/webauthn/authenticate/options` | Temp/full auth | Generate WebAuthn authentication options for a login/auth flow. |
| `POST` | `/api/mfa/webauthn/authenticate/verify` | Temp/full auth | Verify WebAuthn authentication response; issues full JWT if completing a temp flow. |
| `GET` | `/api/mfa/webauthn/credentials` | Bearer token | List registered passkeys for the account. |
| `PATCH` | `/api/mfa/webauthn/credentials/:credentialID` | Bearer token | Rename a passkey (nickname). |
| `DELETE` | `/api/mfa/webauthn/credentials/:credentialID` | Bearer token | Delete a passkey (guards against removing the last MFA method). |
| `POST` | `/api/mfa/webauthn/cleanup` | Bearer token | Cleanup invalid/empty credentials and return updated list. |
| `POST` | `/api/mfa/totp/setup` | Bearer token | Initialize a TOTP secret and return otpauth URL and QR data. |
| `GET` | `/api/mfa/totp/status` | Bearer token | Return TOTP status (enabled/pending/appName). |
| `GET` | `/api/mfa/totp/qrcode` | Bearer token | Regenerate the TOTP QR code for current secret. |
| `POST` | `/api/mfa/totp/verify` | Temp/full auth | Verify a TOTP token; completes temp login flow when applicable. |
| `PATCH` | `/api/mfa/totp` | Bearer token | Rename the authenticator app name. |
| `DELETE` | `/api/mfa/totp` | Bearer token | Disable TOTP for the account (guards against removing last method). |

## Admin Routes

Defined in `admin.js` and `site-config.js` (site-config mounted at `/api/admin/site-config`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/media` | User management | List uploaded images with metadata and attachment counts. Optional `limit` and `cursor` args. |
| `DELETE` | `/api/admin/media/:key` | User management | Delete an unattached object; returns `409` if attached to posts. |
| `POST` | `/api/admin/site-config/access` | Developer | Track that a developer requested site-config access before token verification. |
| `POST` | `/api/admin/site-config/verify` | Developer + config token | Verify site configuration token to unlock edits. |
| `GET` | `/api/admin/site-config` | Developer + config token | Read editable environment-backed site config values. |
| `PATCH` | `/api/admin/site-config` | Developer + config token | Update site config keys; changed keys are recorded to audit log. |
| `GET` | `/api/admin/users` | User management | List users with roles, custom roles, content areas and summaries. Supports `query`. |
| `GET` | `/api/admin/users/:userId` | User management | Detailed admin profile for one user. |
| `PATCH` | `/api/admin/users/:userId` | User management | Update role and content area assignments (JSON payload). |
| `PATCH` | `/api/admin/users/:userId/role` | User management | Role-only update endpoint for scripts. |
| `PATCH` | `/api/admin/users/:userId/developer` | User management | Promote to developer after interactive confirmation. |
| `GET` | `/api/admin/roles` | User management | List custom roles and permission catalog. |
| `POST` | `/api/admin/roles` | User management | Create a custom role. |
| `PATCH` | `/api/admin/roles/:roleId` | User management | Update a custom role. |
| `DELETE` | `/api/admin/roles/:roleId` | User management | Delete a custom role (removed from assigned users). |

Notes:
- Admin API wrapper `adminApiJson()` is used client-side to centralize auth and 403 handling.

## Audit Log Routes

Defined in `audit-logs.js` (mounted at `/api/audit-logs`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/audit-logs` | `canViewAuditLog` permission | Query audit log entries with optional filters: `action`, `targetType`, `user`. |

## Upload Routes

Defined in `uploads.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/upload` | Bearer token | Upload one `image` multipart file to object storage and return its object key and CDN URL. |
| `GET` | `/api/image/:key` | Bearer token + `canViewMediaLibrary` | Generate a short-lived signed URL for an object-storage image key. |

Public object URLs prefer `CDN_PUBLIC_BASE_URL` when configured and otherwise use `MINIO_ENDPOINT` plus `MINIO_BUCKET_NAME`.

## Translation Routes

Defined in `translations.js`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/translations.json` | Public | Return the public English/French translation dictionary. |
| `GET` | `/translations.js` | Public | Return the browser translation runtime generated from the JSON dictionary. |
| `GET` | `/api/translations` | Editor or higher | Return translation rows for the management page. |
| `PATCH` | `/api/translations/:key` | Editor or higher | Update an existing translation key's English and/or French value. |

## Content Option Routes

Defined in `content-options.js`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/trade-options.js` | Public | Return the browser runtime generated from shared trade option config. |
| `GET` | `/api/content-options` | Public | Return account trade options and retirement trade role groups as JSON. |

## Search Routes

Defined in `search.js` (mounted at `/api/search`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/search` | Public | Search public site content across published events, retirement messages, and public pages. |

Responses follow the shared search protocol used by the frontend.

## Page Routes

Defined in `pages.js` (page shell and API-presence).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/pages/:slug` | Public | Serve the page shell (client fetches content via `/api/pages/:slug`). |
| `GET` | `/api/pages/:slug` | Public (optional auth) | Return one published page; honors page.access rules (public/authenticated/restricted). |
| `GET` | `/api/admin/pages` | `canManagePages` | Admin list (summary) including navigation items, groups, built-in roles, custom roles, and permission catalog. |
| `POST` | `/api/admin/pages` | `canManagePages` | Create a page (provide title/slug/blocks/access). |
| `GET` | `/api/admin/pages/:pageId` | `canManagePages` | Get full page payload. |
| `PATCH` | `/api/admin/pages/:pageId` | `canManagePages` | Update page content, blocks, or access. |
| `PATCH` | `/api/admin/pages/:pageId/status` | `canManagePages` | Change page status: draft/published/archived (publishing sets publishedBy/publishedAt). |
| `DELETE` | `/api/admin/pages/:pageId` | `canManagePages` | Delete a page and any linked navigation items. |

Navigation items:
| `POST` | `/api/admin/navigation-items` | `canManageNavigation` | Create navigation item (link or group). |
| `PATCH` | `/api/admin/navigation-items/:itemId` | `canManageNavigation` | Update navigation item. |
| `DELETE` | `/api/admin/navigation-items/:itemId` | `canManageNavigation` | Delete navigation item (group deletes child links).

## Event Routes

Defined in `events.js` (mounted at `/api/events`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/events` | Public | List published current/future events (limit applied). |
| `GET` | `/api/events/:id` | Public | Get one published event. |
| `POST` | `/api/events` | Contributor or higher | Submit an event (may be pending or published depending on permissions). |
| `GET` | `/api/events/review` | `canReviewAndPublish` | List review queue for events. |
| `GET` | `/api/events/mine` | Bearer token | List events created by the current user. |
| `GET` | `/api/events/:id/edit` | Owner or reviewer | Load full event for editing. |
| `PATCH` | `/api/events/:id` | Owner or reviewer | Update an event. |
| `PATCH` | `/api/events/:eventId/review` | `canReviewAndPublish` | Publish or reject a pending event. |

## Retirement Message Routes

Defined in `retirement-messages.js` (mounted at `/api/retirement-messages`).

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/retirement-messages` | `canSubmitRetirementMessages` | Submit retirement message for review. |
| `GET` | `/api/retirement-messages` | Public | List published retirement messages (with comment counts). |
| `GET` | `/api/retirement-messages/:messageId` | Public | Get one published retirement message with localized messages. |
| `GET` | `/api/retirement-messages/review` | `canReviewAndPublish` | List retirement messages by review status (pending/rejected/published). |
| `PATCH` | `/api/retirement-messages/:messageId/review` | `canReviewAndPublish` | Publish or reject a retirement message (publishing requires en & fr messages >=100 chars). |
| `GET` | `/api/retirement-messages/:messageId/edit` | Owner or reviewer | Load full retirement message for editing. |
| `PATCH` | `/api/retirement-messages/:messageId` | Owner or reviewer | Update and resubmit or publish the retirement message. |

Comments on retirement messages:
| `GET` | `/api/retirement-messages/:messageId/comments` | Public | List published comments for a message. |
| `POST` | `/api/retirement-messages/:messageId/comments` | Bearer token | Create a comment (may be published or pending per permissions). |
| `GET` | `/api/retirement-messages/comments/:commentId/edit` | Bearer token | Load one comment for editing (owner or reviewer). |
| `PATCH` | `/api/retirement-messages/comments/:commentId` | Bearer token | Update a comment (owner or reviewer). |
| `GET` | `/api/retirement-messages/comments/review` | `canReviewAndPublish` | List comment review queue. |
| `PATCH` | `/api/retirement-messages/comments/:commentId/review` | `canReviewAndPublish` | Publish or reject a pending comment. |

## Translations, content options, diagnostics

- See earlier sections for translations and content-options endpoints used by the frontend. Diagnostics expose `/api/data` and `/api/protected_data` for smoke tests.

## Route Module Mounts (server/server.js)

| Module | Mount Path |
| --- | --- |
| `auth.js` | `/api` |
| `mfa.js` | `/api/mfa` |
| `diagnostics.js` | `/api` |
| `uploads.js` | `/api` |
| `admin.js` | `/api/admin` |
| `site-config.js` | `/api/admin/site-config` |
| `audit-logs.js` | `/api/audit-logs` |
| `events.js` | `/api/events` |
| `retirement-messages.js` | `/api/retirement-messages` |
| `search.js` | `/api/search` |
| `pages.js` | mounted at root for `/pages/*` and `/api/pages/*`, plus `/api/admin/pages` |

---

If any routes are missing from this file please run `rg "router\.(get|post|patch|delete)" server/routes` to discover additional endpoints and update this document.
