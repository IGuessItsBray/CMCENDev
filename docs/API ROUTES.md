# API Routes

Source of truth: `server/server.js` and `server/routes/*.js`.

Generated companion schema: `api/schema/openapi.yaml`.

When `ENABLE_API_DOCS=true`, view the rendered Swagger UI at `/api-docs`. The raw schema is served at `/api-docs/openapi.yaml`. Leave this flag unset outside trusted development environments.

## Conventions

- JSON APIs generally return `{ error: string }` on failure.
- Every `/api` endpoint is rate limited by source IP (300 requests per minute by default). Responses include `RateLimit-*` headers; throttled requests return `429` with `Retry-After`. Sensitive password-reset and MFA verification routes have stricter limits listed below.
- Authenticated routes expect `Authorization: Bearer <jwt>`.
- MFA temp-flow routes may also accept a temp token through `x-temp-token`, `tempToken` in the JSON body, or `tempToken` in the query string.
- Permission names below use the legacy flag used in middleware, with the catalog key in parentheses where helpful.
- Public routes may still use optional auth to personalize access or analytics.

## Mounts

| Module                          | Mount                      |
| ------------------------------- | -------------------------- |
| `server/server.js`              | root                       |
| `routes/auth.js`                | `/api`                     |
| `routes/mfa.js`                 | `/api/mfa`                 |
| `routes/diagnostics.js`         | `/api`                     |
| `routes/uploads.js`             | `/api`                     |
| `routes/admin.js`               | `/api/admin`               |
| `routes/site-config.js`         | `/api/admin/site-config`   |
| `routes/audit-logs.js`          | `/api/audit-logs`          |
| `routes/events.js`              | `/api/events`              |
| `routes/last-posts.js`          | `/api/last-posts`          |
| `routes/retirement-messages.js` | `/api/retirement-messages` |
| `routes/search.js`              | `/api/search`              |
| `routes/analytics.js`           | `/api/analytics`           |
| `routes/timers.js`              | `/api`                     |
| `routes/pages.js`               | root                       |
| `routes/translations.js`        | root                       |
| `routes/content-options.js`     | root                       |

## Public and System

| Method | Path                   | Access        | Purpose                                                          |
| ------ | ---------------------- | ------------- | ---------------------------------------------------------------- |
| `GET`  | `/api/version`         | Public        | Return running build commit metadata: `{ commit, shortCommit }`. |
| `GET`  | `/api/data`            | Public        | Smoke-test response.                                             |
| `GET`  | `/api/protected_data`  | Authenticated | Authenticated smoke-test response.                               |
| `GET`  | `/trade-options.js`    | Public        | Browser runtime for shared trade option config.                  |
| `GET`  | `/api/content-options` | Public        | JSON trade options and retirement trade groups.                  |
| `GET`  | `/translations.json`   | Public        | Translation dictionary.                                          |
| `GET`  | `/translations.js`     | Public        | Browser translation runtime generated from the dictionary.       |

## Auth and Account

| Method   | Path                                  | Access                                                           | Purpose                                                                                                                                                               |
| -------- | ------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/ghost/request`                  | Public                                                           | Start ghost-account claim flow.                                                                                                                                       |
| `POST`   | `/api/ghost/confirm`                  | Public                                                           | Confirm ghost-account claim token. A secure session is issued only when `sessionCookieConsent: true` is included.                                                    |
| `GET`    | `/api/invitations/activate?token=...` | Public                                                           | Validate an invitation link and return the prefilled invited name and email.                                                                                          |
| `POST`   | `/api/register`                       | Public                                                           | Register a new user account. Invitation activation issues a secure session only when `sessionCookieConsent: true` is included.                                      |
| `POST`   | `/api/login`                          | Public                                                           | Login with username/password; the client must send `sessionCookieConsent: true` before the API issues a session cookie. Otherwise it returns `sessionCookieConsentRequired: true` without a token or cookie. May then return the MFA temp-token flow. |
| `POST`   | `/api/session/refresh`                | Refresh-token cookie                                             | Exchange a valid refresh cookie for a new access token.                                                                                                               |
| `POST`   | `/api/session/logout`                 | Refresh-token cookie                                             | Revoke the refresh session and clear its cookie.                                                                                                                      |
| `POST`   | `/api/email-verification/confirm`     | Public                                                           | Confirm email verification token. A secure session is issued only when `sessionCookieConsent: true` is included.                                                    |
| `POST`   | `/api/password-reset/request`         | Public; rate limited                                             | Request password reset email. Limited by source IP (5 per 15 minutes) and submitted email (3 per hour).                                                               |
| `POST`   | `/api/password-reset/confirm`         | Public; rate limited                                             | Complete password reset with token. Limited by source IP (5 per 15 minutes).                                                                                          |
| `GET`    | `/api/me`                             | Authenticated                                                    | Return current user, permissions, and notification summary.                                                                                                           |
| `GET`    | `/api/notifications`                  | Authenticated                                                    | Return compact notification list.                                                                                                                                     |
| `POST`   | `/api/ghost/upgrade`                  | Authenticated                                                    | Upgrade/merge a ghost account into the current authenticated account.                                                                                                 |
| `PATCH`  | `/api/profile`                        | Authenticated                                                    | Update editable profile fields.                                                                                                                                       |
| `DELETE` | `/api/profile`                        | Authenticated + `canDeleteOwnAccount` + current MFA confirmation | Delete the current account; associated content is retained and anonymized. Accepts a current TOTP code or a passkey assertion verified within the prior five minutes. |
| `GET`    | `/api/contributor-check`              | Authenticated + `canCreateDrafts`                                | Confirm contributor content access.                                                                                                                                   |
| `GET`    | `/api/admin-check`                    | Authenticated + user admin access                                | Confirm admin user-management access.                                                                                                                                 |

## MFA

Mounted at `/api/mfa`.

| Method   | Path                                          | Access                                    | Purpose                                                                                                                   |
| -------- | --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/mfa/webauthn/register/options`          | Authenticated                             | Generate passkey registration options.                                                                                    |
| `POST`   | `/api/mfa/webauthn/register/verify`           | Authenticated                             | Verify and store new passkey credential.                                                                                  |
| `POST`   | `/api/mfa/webauthn/authenticate/options`      | Authenticated or temp token               | Generate passkey authentication options.                                                                                  |
| `POST`   | `/api/mfa/webauthn/authenticate/verify`       | Authenticated or temp token; rate limited | Verify passkey auth; completes login when using temp token. Limited to 5 verification attempts per account per 5 minutes. |
| `POST`   | `/api/mfa/totp/setup`                         | Authenticated                             | Create a pending TOTP secret with a server-assigned authenticator name and QR data.                                       |
| `GET`    | `/api/mfa/totp/status`                        | Authenticated                             | Return TOTP enabled/pending status.                                                                                       |
| `GET`    | `/api/mfa/totp/qrcode`                        | Authenticated                             | Return QR code for pending/current TOTP setup.                                                                            |
| `POST`   | `/api/mfa/totp/verify`                        | Authenticated or temp token; rate limited | Verify TOTP; completes login when using temp token. Limited to 5 verification attempts per account per 5 minutes.         |
| `DELETE` | `/api/mfa/totp`                               | Authenticated                             | Disable active TOTP (guarded against removing the last MFA method) or cancel a pending setup.                             |
| `GET`    | `/api/mfa/webauthn/credentials`               | Authenticated                             | List registered passkeys.                                                                                                 |
| `PATCH`  | `/api/mfa/webauthn/credentials/:credentialID` | Authenticated                             | Rename a passkey.                                                                                                         |
| `DELETE` | `/api/mfa/webauthn/credentials/:credentialID` | Authenticated                             | Delete a passkey, guarded against removing the last MFA method.                                                           |
| `POST`   | `/api/mfa/webauthn/cleanup`                   | Authenticated                             | Remove invalid/empty passkey records.                                                                                     |

## Analytics

Mounted at `/api/analytics`.

| Method | Path                   | Access                                                | Purpose                                                                                                                                                                 |
| ------ | ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/analytics`       | Authenticated + `canViewAnalytics` (`analytics.view`) | Return visit totals, unique visitor totals, pages, sources, devices, browsers, countries, unique visitors by role, and recent visits. Query: `range=7d\|30d\|90d\|all`. |
| `POST` | `/api/analytics/visit` | Public with optional auth                             | Record a page visit. Body includes `path`, `fullPath`, `title`, `referrer`, `locale`, `timeZone`. Always returns `204`.                                                 |

## Audit Log

Mounted at `/api/audit-logs`.

| Method | Path                         | Access                                           | Purpose                                                                                              |
| ------ | ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/audit-logs`            | Authenticated + `canViewAuditLog` (`audit.view`) | List audit entries. Query: `action`, `targetType`, `user`, `startDate`, `endDate`.                   |
| `GET`  | `/api/audit-logs/export.csv` | Authenticated + `canViewAuditLog` (`audit.view`) | Export matching audit entries as CSV. Query: `action`, `targetType`, `user`, `startDate`, `endDate`. |

## Admin Users, Roles, Media, Moderation

Mounted at `/api/admin`.

| Method   | Path                                        | Access                                                                        | Purpose                                                                                                                                                                                                                                                                       |
| -------- | ------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/review-counts`                  | Authenticated + `canReviewAndPublish`                                         | Return pending review counts.                                                                                                                                                                                                                                                 |
| `GET`    | `/api/admin/roles`                          | Authenticated + `canManageRoles`                                              | List custom roles and permission catalog.                                                                                                                                                                                                                                     |
| `POST`   | `/api/admin/roles`                          | Authenticated + `canManageRoles`                                              | Create custom role.                                                                                                                                                                                                                                                           |
| `PATCH`  | `/api/admin/roles/:roleId`                  | Authenticated + `canManageRoles`                                              | Update custom role.                                                                                                                                                                                                                                                           |
| `DELETE` | `/api/admin/roles/:roleId`                  | Authenticated + `canManageRoles`                                              | Delete custom role and remove it from users.                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/media`                          | Authenticated + `canViewMediaLibrary`                                         | List media assets with linked event, retirement, and Last Post usage. Query: `limit`, `cursor`, `sort=newest\|oldest\|name\|size\|orphaned`, `type=all\|retirement\|last-post\|event\|page\|upload\|migration\|unattached`, and `search` (file or image name).                |
| `POST`   | `/api/admin/media/bulk-delete`              | Authenticated + `canDeleteMedia`                                              | Delete selected unattached media assets by JSON body `keys`; attached assets are skipped and reported.                                                                                                                                                                        |
| `DELETE` | `/api/admin/media/:key`                     | Authenticated + `canDeleteMedia`                                              | Delete unattached media by key.                                                                                                                                                                                                                                               |
| `GET`    | `/api/admin/users`                          | Authenticated + `canReadUsers`                                                | List lightweight user rows. Query: `query`, `limit` from 1-100. Post summaries and editable detail load from the user detail endpoint.                                                                                                                                        |
| `POST`   | `/api/admin/users`                          | Authenticated + `canProvisionUsers`                                           | Provision an invited account and email a seven-day activation link. Body: `firstName`, `lastName`, `email`, and optional non-developer `role`, `customRoleIds`, `contentAreas`.                                                                                               |
| `GET`    | `/api/admin/users/:userId`                  | Authenticated + `canReadUsers`                                                | Get one user admin detail.                                                                                                                                                                                                                                                    |
| `PATCH`  | `/api/admin/users/:userId`                  | Authenticated + `canManageUsers`                                              | Update role, custom roles, and content areas.                                                                                                                                                                                                                                 |
| `DELETE` | `/api/admin/users/:userId`                  | Authenticated + `canDeleteAnyUser` + current MFA confirmation                 | Delete another account. Body must choose `keep_and_anonymize` (preserve events, retirement messages, comments, and Last Post notices without account attribution) or `delete_all`. Accepts a current TOTP code or a passkey assertion verified within the prior five minutes. |
| `PATCH`  | `/api/admin/users/:userId/role`             | Authenticated + `canManageUsers`                                              | Update built-in role only.                                                                                                                                                                                                                                                    |
| `PATCH`  | `/api/admin/users/:userId/developer`        | Authenticated + `canManageUsers` + current user must be `developer`           | Promote an `administrator` account to developer after explicit `DEVELOPER` confirmation. Subscriber and other non-administrator accounts cannot be promoted directly.                                                                                                         |
| `DELETE` | `/api/admin/events/:eventId`                | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete an event. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                 |
| `DELETE` | `/api/admin/retirement-messages/:messageId` | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a retirement message. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                     |
| `DELETE` | `/api/admin/last-posts/:lastPostId`         | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a Last Post notice. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                       |
| `DELETE` | `/api/admin/retirement-comments/:commentId` | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a retirement comment.                                                                                                                                                                                                                                                  |

## Site Config

Mounted at `/api/admin/site-config`.

| Method   | Path                                              | Access                                                 | Purpose                                                                                                                                                                                            |
| -------- | ------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/admin/site-config/access`                   | Authenticated + `canAccessSiteConfig`                  | Audit/log site-config access attempt.                                                                                                                                                              |
| `POST`   | `/api/admin/site-config/verify`                   | Authenticated + `canAccessSiteConfig` + token          | Verify token gate for config access.                                                                                                                                                               |
| `GET`    | `/api/admin/site-config`                          | Authenticated + `canAccessSiteConfig` + verified token | Read available protected site operations.                                                                                                                                                          |
| `POST`   | `/api/admin/site-config/migrations/:migrationKey` | Authenticated + `canManageSiteConfig` + verified token | Run `retirement`, `comments`, or `lastPost` migration in `dry-run` or `apply` mode with an optional `limit` from 1-1000. Streams newline-delimited JSON progress events and writes audit metadata. |
| `DELETE` | `/api/admin/site-config/analytics`                | Authenticated + `canManageSiteConfig` + verified token | Purge analytics history.                                                                                                                                                                           |

## Uploads and Media

Mounted at `/api`.

| Method | Path              | Access                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/api/upload`     | Authenticated + `canUploadMedia`      | Multipart image upload using field `image`. The server validates and re-encodes every stored image as metadata-free WebP before it reaches object storage, then creates variants and a media asset with UUID, upload source context, inferred source name, file metadata, and safe rendering metadata. Retirement and Last Post forms send `displayAspectRatio=4:3` with optional `displayCropX` and `displayCropY` values from 0 to 1; the response then includes `display`, a server-rendered 4:3 crop for compact cards, while `url` continues to identify the full original for message pages. Optional `cdnSlug` creates a stable destination such as `images/branch-crest/large.webp`; it must be unique, lowercase, and use letters, numbers, and single hyphens. Other optional fields: `uploadSource`, `uploadContext`, `sourceId`, `sourceModel`, `sourceField`, `sourceUrl`, `sourceSlug`, `sourceName`. |
| `POST` | `/api/upload-url` | Authenticated + `canUploadMedia`      | Retired; always returns `410 Gone`. Direct-to-storage uploads are disabled because they bypass mandatory metadata removal. Use `POST /api/upload`. |
| `GET`  | `/api/image/:key` | Authenticated + `canViewMediaLibrary` | Create short-lived signed download URL for an object key.                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Banners

Mounted at `/api` from `routes/timers.js`. “Timers” is the legacy code/model name; UI-facing language is Banners.

| Method   | Path                         | Access                                              | Purpose                                             |
| -------- | ---------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `GET`    | `/api/timers/active`         | Public with optional auth                           | Return active banners. Query: `scope=global\|home`. |
| `GET`    | `/api/admin/timers`          | Authenticated + `canManageTimers` (`timers.manage`) | List all banners for admin.                         |
| `POST`   | `/api/admin/timers`          | Authenticated + `canManageTimers`                   | Create banner.                                      |
| `PATCH`  | `/api/admin/timers/:timerId` | Authenticated + `canManageTimers`                   | Update banner.                                      |
| `DELETE` | `/api/admin/timers/:timerId` | Authenticated + `canManageTimers`                   | Delete banner.                                      |

Banner payload fields: `title`, `text.en`, `text.fr`, `color`, `textColor`, `startsAt`, `endsAt`, `countdownAt`, `placement`, `enabled`, `order`.

## Translations

| Method  | Path                     | Access                                  | Purpose                               |
| ------- | ------------------------ | --------------------------------------- | ------------------------------------- |
| `GET`   | `/api/translations`      | Authenticated + `canManageTranslations` | Return translation rows for admin UI. |
| `PATCH` | `/api/translations/:key` | Authenticated + `canManageTranslations` | Update existing translation key.      |

## Search

Mounted at `/api/search`.

| Method | Path          | Access | Purpose                                                                                                                                                                                   |
| ------ | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/search` | Public | Search published events, retirement messages, Last Post notices, and public pages other than Home, including the Retirement Messages collection and Last Post archive. Query: `q`, optional `lang` (`en` or `fr`). Results are ranked by title relevance before body-text matches; exact, leading, and singular/plural leading title matches rank first. Only results with a canonical relative `url` are returned. |

## Site Discovery and Metadata

Defined in `routes/seo.js`, mounted at root. These routes are intentionally public and do not expose account or administrative URLs. Known AI crawler identities are blocked server-side and listed in `robots.txt`; conventional search-engine crawlers remain permitted on public pages.

| Method | Path                | Access | Purpose                                                                                       |
| ------ | ------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `GET`  | `/robots.txt`       | Public | Provide crawler directives and the absolute XML sitemap location.                            |
| `GET`  | `/sitemap.xml`      | Public | List public static pages plus published custom pages whose audience is public.               |
| `GET`  | `/site.webmanifest` | Public | Provide browser and installable-web-app metadata, including the CMCEN theme and application icon. |
| `GET`  | `/llms.txt`         | Public | State that AI systems are not authorized to crawl or use CMCEN content; this grants no access. |

## Pages and Navigation

Defined in `routes/pages.js`, mounted at root.

| Method   | Path                                  | Access                                | Purpose                                                                                                                                                   |
| -------- | ------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/pages/:slug`                        | Public                                | Serve custom page shell.                                                                                                                                  |
| `GET`    | `/api/navigation`                     | Public with optional auth             | Return visible dynamic navigation.                                                                                                                        |
| `GET`    | `/api/sitemap`                        | Public with optional auth             | Return generated sitemap sections and links from public HTML files plus published custom pages. Excludes Site Config and non-public utility/admin shells. |
| `GET`    | `/api/pages/:slug`                    | Public with optional auth             | Return page content if access rules allow it.                                                                                                             |
| `GET`    | `/api/admin/pages/:pageId/preview`    | Authenticated + `canManagePages`      | Preview page by ID regardless of publication status.                                                                                                      |
| `GET`    | `/api/admin/pages`                    | Authenticated + `canManagePages`      | List admin page summaries plus navigation/admin metadata.                                                                                                 |
| `GET`    | `/api/admin/pages/media`              | Authenticated + `canManagePages`      | List media picker assets for page editor.                                                                                                                 |
| `POST`   | `/api/admin/pages`                    | Authenticated + `canManagePages`      | Create page.                                                                                                                                              |
| `GET`    | `/api/admin/pages/:pageId`            | Authenticated + `canManagePages`      | Get full page editor payload.                                                                                                                             |
| `PATCH`  | `/api/admin/pages/:pageId`            | Authenticated + `canManagePages`      | Update page content/access/blocks.                                                                                                                        |
| `PATCH`  | `/api/admin/pages/:pageId/status`     | Authenticated + `canManagePages`      | Set status: `draft`, `published`, or `archived`.                                                                                                          |
| `DELETE` | `/api/admin/pages/:pageId`            | Authenticated + `canManagePages`      | Delete page and linked navigation.                                                                                                                        |
| `POST`   | `/api/admin/navigation-items`         | Authenticated + `canManageNavigation` | Create navigation item or group.                                                                                                                          |
| `PATCH`  | `/api/admin/navigation-items/:itemId` | Authenticated + `canManageNavigation` | Update navigation item/group.                                                                                                                             |
| `DELETE` | `/api/admin/navigation-items/:itemId` | Authenticated + `canManageNavigation` | Delete navigation item/group.                                                                                                                             |

## Certificate Requests

Mounted at `/api/certificate-requests`.

Certificate request fulfillment is separate from editorial review because the
records include private mailing and family information. Access requires
`canManageCertificateRequests` (`certificates.manage`), granted by default to
editors and other review staff, and available for assignment through custom
roles. Staff must confirm each requested certificate was printed before a
request becomes ready to mail, then separately confirm the completed package
was mailed. Both transitions record the acting user, timestamp, and audit entry.

| Method  | Path                                                     | Access                                         | Purpose                                                                                                                                                                             |
| ------- | -------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/certificate-requests/count`                        | Authenticated + `canManageCertificateRequests` | Return `pending`, `readyToMail`, and total actionable request counts for the dashboard.                                                                                             |
| `GET`   | `/api/certificate-requests`                              | Authenticated + `canManageCertificateRequests` | List actionable requests by default. Query: `status=pending\|ready_to_mail\|mailed\|printed\|actionable\|all`.                                                                      |
| `PATCH` | `/api/certificate-requests/:certificateRequestId/status` | Authenticated + `canManageCertificateRequests` | Confirm printing with every certificate key: `{ "status": "ready_to_mail", "printedCertificateKeys": ["member", "family:0"] }`; then confirm mailing with `{ "status": "mailed" }`. |

## Events

Mounted at `/api/events`.

| Method  | Path                                  | Access                                | Purpose                                                                                                                                                                                                                            |
| ------- | ------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/api/events`                         | Public                                | List published upcoming events, or published events overlapping a requested `from`/`to` calendar range. Results can be filtered by event type, organizing entity, and province or region.                                          |
| `POST`  | `/api/events`                         | Authenticated + `canCreateDrafts`     | Submit an event. Descriptions and registration instructions are limited to 10,000 characters per language. Submitter details are copied from the authenticated profile; users with review/bypass permissions may publish directly. |
| `GET`   | `/api/events/review`                  | Authenticated + `canReviewAndPublish` | List event review queue.                                                                                                                                                                                                           |
| `GET`   | `/api/events/mine`                    | Authenticated                         | List current user's events.                                                                                                                                                                                                        |
| `GET`   | `/api/events/:id`                     | Public                                | Get one published event.                                                                                                                                                                                                           |
| `GET`   | `/api/events/:id/edit`                | Authenticated owner or reviewer       | Get full event edit payload.                                                                                                                                                                                                       |
| `PATCH` | `/api/events/:id`                     | Authenticated owner or reviewer       | Update event while preserving its original submitter record. Descriptions and registration instructions are limited to 10,000 characters per language.                                                                             |
| `PATCH` | `/api/events/:eventId/review-content` | Authenticated + `canReviewAndPublish` | Update the title, location, description, and registration text for one language on a pending event; the event stays in the review queue.                                                                                           |
| `PATCH` | `/api/events/:eventId/review`         | Authenticated + `canReviewAndPublish` | Publish or reject event.                                                                                                                                                                                                           |

`GET /api/events` accepts optional `from` and `to` query parameters in
`YYYY-MM-DD` form. They must be supplied together, define an inclusive range
of at most 370 days, and return published events that start in or overlap that
range. Calls without those parameters retain the upcoming-events behaviour.
Optional `eventType`, `organizingEntity`, and `provinceRegion` parameters use
their published event-option values and are combined when more than one is
supplied.

## Last Post Notices

Mounted at `/api/last-posts`.

| Method  | Path                                        | Access                                | Purpose                                                                               |
| ------- | ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `POST`  | `/api/last-posts`                           | Authenticated + `canCreateDrafts`     | Submit a Last Post notice. Chain-of-command consent is required. It enters the review queue by default; `publishNow: true` is allowed only for users with `canReviewAndPublish`. Notice text is limited to 10,000 characters. |
| `GET`   | `/api/last-posts/review`                    | Authenticated + `canReviewAndPublish` | List pending Last Post notices.                                                       |
| `PATCH` | `/api/last-posts/:messageId/review-content` | Authenticated + `canReviewAndPublish` | Update one language of a pending notice; it stays in the review queue.                |
| `PATCH` | `/api/last-posts/:messageId/review`         | Authenticated + `canReviewAndPublish` | Publish or reject a pending notice. Publication requires English and French messages. |
| `GET`   | `/api/last-posts`                           | Public                                | List published notices. Query: `limit`, `cursor`.                                     |
| `GET`   | `/api/last-posts/:messageId`                | Public                                | Get one published notice.                                                             |

## Retirement Messages and Comments

Mounted at `/api/retirement-messages`.

| Method | Path | Access | Purpose |
| ------- | ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/retirement-messages` | Authenticated + `canSubmitRetirementMessages` | Submit retirement message. Message text is limited to 10,000 characters. Submitter contact details are copied from the authenticated profile; the request supplies only the submitter relationship. When an optional `certificateRequest` is supplied, the server also creates a separate pending, generic certificate-request record linked to this retirement message. The server derives the member's rank and MOSID/role from the retirement submission; every certificate field is required except the C&E Branch enrollment date. | When `MAIL_TO_BRANCH` is configured, the server emails the complete normalized submission and canonical public photo URL to the internal branch mailbox for Power Automate processing. | It enters the review queue by default; `publishNow: true` is allowed only for users with `canBypassReviewStages`. |
| `GET` | `/api/retirement-messages` | Public | List published retirement messages. |
| `GET` | `/api/retirement-messages/review` | Authenticated + `canReviewAndPublish` | List retirement-message review queue. |
| `GET` | `/api/retirement-messages/comments/review` | Authenticated + `canReviewAndPublish` | List comment review queue. |
| `PATCH` | `/api/retirement-messages/comments/:commentId/review` | Authenticated + `canReviewAndPublish` | Publish or reject comment. |
| `GET` | `/api/retirement-messages/comments/:commentId/edit` | Authenticated owner or reviewer | Get comment edit payload. |
| `PATCH` | `/api/retirement-messages/comments/:commentId` | Authenticated owner or reviewer | Update comment. |
| `GET` | `/api/retirement-messages/:messageId/edit` | Authenticated owner or reviewer | Get full retirement-message edit payload. |
| `PATCH` | `/api/retirement-messages/:messageId` | Authenticated owner or reviewer | Update retirement message while preserving its original submitter contact record; message text is limited to 10,000 characters. Missing legacy contact fields are filled from the authenticated profile, and the request may update the relationship. An optional complete `certificateRequest` creates a separate pending certificate-request record linked to the retirement message. It enters the review queue by default; `publishNow: true` is allowed only for users with `canBypassReviewStages`. |
| `GET` | `/api/retirement-messages/:messageId/comments` | Public | List published comments for a message. |
| `POST` | `/api/retirement-messages/:messageId/comments` | Authenticated | Create comment. |
| `GET` | `/api/retirement-messages/:messageId` | Public | Get one published retirement message. |
| `PATCH` | `/api/retirement-messages/:messageId/review-content` | Authenticated + `canReviewAndPublish` | Update one language of a pending retirement message; it stays in the review queue. |
| `PATCH` | `/api/retirement-messages/:messageId/review` | Authenticated + `canReviewAndPublish` | Publish or reject retirement message. |

## Maintenance

To rediscover route definitions:

```sh
rg -n "router\\.(get|post|patch|delete|put)|app\\.(get|post|patch|delete|put)" server/routes server/server.js
```
