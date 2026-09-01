# API Routes

Source of truth: `server/server.js` and `server/routes/*.js`.

Generated companion schema: `api/schema/openapi.yaml`.

When `ENABLE_API_DOCS=true`, view the rendered Swagger UI at `/api-docs`. The raw schema is served at `/api-docs/openapi.yaml`. Leave this flag unset outside trusted development environments.

## Conventions

- JSON APIs generally return `{ error: string }` on failure.
- Every request receives an `X-Request-ID` response header. Server failures (`5xx`), malformed requests (`400`/`413`), rate limits (`429`), and dropped client connections are logged to the server console with that ID, method, path, status, duration, and source IP. `5xx` API failures also create a `diagnostic.request_failed` audit entry; query strings and request bodies are never recorded by this diagnostic layer.
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
| `routes/audit-logs.js`          | `/api/audit-logs`          |
| `routes/events.js`              | `/api/events`              |
| `routes/news.js`                | `/api/news`                |
| `routes/last-posts.js`          | `/api/last-posts`          |
| `routes/retirement-messages.js` | `/api/retirement-messages` |
| `routes/search.js`              | `/api/search`              |
| `routes/analytics.js`           | `/api/analytics`           |
| `routes/timers.js`              | `/api`                     |
| `routes/pages.js`               | root                       |
| `routes/translations.js`        | root                       |
| `routes/content-options.js`     | root                       |
| `routes/branding.js`            | root                       |
| `routes/contact.js`             | `/api/contact`             |

## Public and System

| Method | Path                   | Access        | Purpose                                                          |
| ------ | ---------------------- | ------------- | ---------------------------------------------------------------- |
| `GET`  | `/api/version`         | Public        | Return running build commit metadata: `{ commit, shortCommit }`. |
| `GET`  | `/changelog.md`        | Public        | Return the repository changelog in Markdown for the developer page. |
| `GET`  | `/api/data`            | Public        | Smoke-test response.                                             |
| `GET`  | `/api/protected_data`  | Authenticated | Authenticated smoke-test response.                               |
| `GET`  | `/trade-options.js`    | Public        | Browser runtime for shared trade option config.                  |
| `GET`  | `/api/content-options` | Public        | JSON trade options and retirement trade groups.                  |
| `GET`  | `/api/branding`        | Public        | JSON branding catalogue: supported fonts, official light and dark colour tokens, and theming metadata. |
| `GET`  | `/translations.json`   | Public        | Translation dictionary.                                          |
| `GET`  | `/translations.js`     | Public        | Browser translation runtime generated from the dictionary.       |

## Auth and Account

| Method   | Path                                                    | Access                                                           | Purpose                                                                                                                                                                                                                                               |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/ghost/request`                                    | Public                                                           | Start ghost-account claim flow.                                                                                                                                                                                                                       |
| `POST`   | `/api/ghost/confirm`                                    | Public                                                           | Confirm ghost-account claim token. A secure session is issued only when `sessionCookieConsent: true` is included.                                                                                                                                     |
| `GET`    | `/api/invitations/activate?token=...`                   | Public                                                           | Validate an invitation link and return the prefilled invited name and email.                                                                                                                                                                          |
| `POST`   | `/api/register`                                         | Public                                                           | Register a new user account. Invitation activation issues a secure session only when `sessionCookieConsent: true` is included; matched, rejected, and server-failed activation attempts are audited without recording the invitation token.                 |
| `POST`   | `/api/login`                                            | Public                                                           | Login with username/password; rejected credential attempts are audited without retaining the password. The client must send `sessionCookieConsent: true` before the API issues a session cookie. Otherwise it returns `sessionCookieConsentRequired: true` without a token or cookie. May then return the MFA temp-token flow. |
| `POST`   | `/api/session/refresh`                                  | Refresh-token cookie                                             | Exchange a valid refresh cookie for a new access token.                                                                                                                                                                                               |
| `POST`   | `/api/session/logout`                                   | Refresh-token cookie                                             | Revoke the refresh session and clear its cookie.                                                                                                                                                                                                      |
| `POST`   | `/api/email-verification/confirm`                       | Public                                                           | Confirm email verification token. A secure session is issued only when `sessionCookieConsent: true` is included.                                                                                                                                      |
| `POST`   | `/api/password-reset/request`                           | Public; rate limited                                             | Request password reset email. Limited by source IP (5 per 15 minutes) and submitted email (3 per hour).                                                                                                                                               |
| `POST`   | `/api/password-reset/confirm`                           | Public; rate limited                                             | Complete password reset with token. Limited by source IP (5 per 15 minutes).                                                                                                                                                                          |
| `GET`    | `/api/me`                                               | Authenticated                                                    | Return current user, permissions, and lightweight notification counts for the header badge. Full notification entries load from `/api/notifications` only when the bell opens.                                                                        |
| `GET`    | `/api/member-benefits/td-insurance`                     | Authenticated                                                    | Return the TD Insurance member-offer destination after recording the access. The shared footer uses it only after sign-in, so the campaign URL is not embedded in public client code.                                                                |
| `GET`    | `/api/notifications`                                    | Authenticated                                                    | Return current rejected action items and unread externally reviewed approvals for the shared header bell, including type, outcome, direct destination, and `readThrough` snapshot. Rejected Events, Retirement Messages, and Last Post notices link to their original submit form in edit mode.                    |
| `POST`   | `/api/notifications/read`                               | Authenticated                                                    | Mark informational approval results through the supplied `readThrough` snapshot as read for the current account; rejected action items remain visible until resolved.                                                                                   |
| `PUT`    | `/api/subscriptions/weekly-brief`                       | Authenticated                                                    | Explicitly opt in to or withdraw from the Friday weekly email brief. Opt-in requires `subscribed: true` and `expressConsent: true`; consent and withdrawal are audited.                                                                               |
| `PUT`    | `/api/subscriptions/news-announcements`                 | Authenticated                                                    | Explicitly opt in to or withdraw from occasional news-announcement emails.                                                                                                                                                                            |
| `GET`    | `/api/subscriptions/weekly-brief/unsubscribe?token=...` | Public opaque email token                                        | Immediately unsubscribe from the weekly brief without requiring sign-in. Tokens are retained for at least 60 days after their email is sent.                                                                                                          |
| `POST`   | `/api/subscriptions/weekly-brief/unsubscribe?token=...` | Public opaque email token                                        | Supports RFC 8058 one-click unsubscribe requests from email clients.                                                                                                                                                                                  |
| `POST`   | `/api/ghost/upgrade`                                    | Authenticated                                                    | Upgrade/merge a ghost account into the current authenticated account.                                                                                                                                                                                 |
| `PATCH`  | `/api/profile`                                          | Authenticated                                                    | Update editable profile fields.                                                                                                                                                                                                                       |
| `DELETE` | `/api/profile`                                          | Authenticated + `canDeleteOwnAccount` + current MFA confirmation | Delete the current account; associated content is retained and anonymized. Accepts a current TOTP code or a passkey assertion verified within the prior five minutes.                                                                                 |
| `GET`    | `/api/contributor-check`                                | Authenticated + `canCreateDrafts`                                | Confirm contributor content access.                                                                                                                                                                                                                   |
| `GET`    | `/api/admin-check`                                      | Authenticated + user admin access                                | Confirm admin user-management access.                                                                                                                                                                                                                 |

## Contact

| Method | Path | Access | Purpose |
| ------ | ---- | ------ | ------- |
| `POST` | `/api/contact` | Authenticated; rate limited | Send a member contact request to `MAIL_TO_BRANCH`. The server copies the member's current account name, email, phone, rank, unit, company, and address into the email; clients submit only `subject` (maximum 160 characters) and `message` (maximum 10,000 characters). The member email is used as the reply-to address and the submission is audited. |

## MFA

Mounted at `/api/mfa`.

| Method   | Path                                          | Access                                    | Purpose                                                                                                                   |
| -------- | --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `POST`   | `/api/mfa/webauthn/register/options`          | Authenticated                             | Generate passkey registration options.                                                                                    |
| `POST`   | `/api/mfa/webauthn/register/verify`           | Authenticated                             | Verify and store new passkey credential.                                                                                  |
| `POST`   | `/api/mfa/webauthn/authenticate/options`      | Authenticated or temp token               | Generate passkey authentication options.                                                                                  |
| `POST`   | `/api/mfa/webauthn/authenticate/verify`       | Authenticated or temp token; rate limited | Verify passkey auth; rejected verification attempts are audited without retaining credential material. Completes login when using temp token. Limited to 5 verification attempts per account per 5 minutes. |
| `POST`   | `/api/mfa/totp/setup`                         | Authenticated                             | Create a pending TOTP secret with a server-assigned authenticator name and QR data.                                       |
| `GET`    | `/api/mfa/totp/status`                        | Authenticated                             | Return TOTP enabled/pending status.                                                                                       |
| `GET`    | `/api/mfa/totp/qrcode`                        | Authenticated                             | Return QR code for pending/current TOTP setup.                                                                            |
| `POST`   | `/api/mfa/totp/verify`                        | Authenticated or temp token; rate limited | Verify TOTP; rejected verification attempts are audited without retaining the code. Completes login when using temp token. Limited to 5 verification attempts per account per 5 minutes.         |
| `DELETE` | `/api/mfa/totp`                               | Authenticated                             | Disable active TOTP (guarded against removing the last MFA method) or cancel a pending setup.                             |
| `GET`    | `/api/mfa/webauthn/credentials`               | Authenticated                             | List registered passkeys.                                                                                                 |
| `PATCH`  | `/api/mfa/webauthn/credentials/:credentialID` | Authenticated                             | Rename a passkey.                                                                                                         |
| `DELETE` | `/api/mfa/webauthn/credentials/:credentialID` | Authenticated                             | Delete a passkey, guarded against removing the last MFA method.                                                           |
| `POST`   | `/api/mfa/webauthn/cleanup`                   | Authenticated                             | Remove invalid/empty passkey records.                                                                                     |

## Analytics

Mounted at `/api/analytics`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/client-config/plausible` | Public | Return enabled self-hosted Plausible configuration for the official tracker package, or `{ "enabled": false }` when it is not configured. |

| Method | Path                   | Access                                                | Purpose                                                                                                                                                                 |
| ------ | ---------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/analytics`       | Authenticated + `canViewAnalytics` (`analytics.view`) | Return visit totals, unique visitor totals, pages, sources, devices, browsers, countries, unique visitors by role, and recent visits. Query: `range=7d\|30d\|90d\|all`. |
| `GET`  | `/api/analytics/embed` | Authenticated + `canViewAnalytics` (`analytics.view`) | Return configured Plausible shared-dashboard embed details, or `enabled: false`. |
| `POST` | `/api/analytics/visit` | Public with optional auth                             | Record a page visit. Body includes `path`, `fullPath`, `title`, `referrer`, `locale`, `timeZone`. Always returns `204`.                                                 |

## Audit Log

Mounted at `/api/audit-logs`.

| Method | Path                         | Access                                           | Purpose                                                                                              |
| ------ | ---------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/audit-logs`            | Authenticated + `canViewAuditLog` (`audit.view`) | List audit entries. Query: `action`, `targetType`, `user`, `startDate`, `endDate`.                   |
| `GET`  | `/api/audit-logs/export.csv` | Authenticated + `canViewAuditLog` (`audit.view`) | Export matching audit entries as CSV. Query: `action`, `targetType`, `user`, `startDate`, `endDate`. |

## Admin Users, Roles, Media, Moderation

Mounted at `/api/admin`.

| `GET` | `/api/admin/subscriptions` | Authenticated + `canManageSubscriptions` | List weekly/news subscribers and sent newsletter history. |
| `GET` | `/api/admin/subscriptions/export.csv` | Authenticated + `canManageSubscriptions` | Export subscribed members to CSV. |
| `POST` | `/api/admin/subscriptions/news-blasts` | Authenticated + `canManageSubscriptions` | Send a news blast only to express news-announcement subscribers; action is audited. Returns `202` without creating a delivery when `DISABLE_EMAIL_SENDING=true`. |

| Method   | Path                                         | Access                                                                        | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/review-counts`                   | Authenticated + `canReviewAndPublish`                                         | Return pending review counts.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `GET`    | `/api/admin/content`                         | Authenticated + `canReviewAndPublish`, or `canManageNews` for `newsArticle` only | List staff-only workspace records with editable metadata, submission contact, and publication-authorization details. Event records include RSVP enablement and deadline settings. Query: `type=all\|event\|retirementMessage\|lastPost\|newsArticle\|retirementComment`, `status=all\|draft\|pending\|published\|rejected\|hidden`, `translation=all\|missing-any\|missing-en\|missing-fr` for public copy that has a missing translation (comments are excluded from translation-only results), case-insensitive `search` across the title, name, and public text, `limit` 1-100, an opaque `cursor` returned by the prior page, and optional `id` for one record. Responses include `hasMore` and `nextCursor` for Load more pagination; when `type=all`, results are limited to the caller’s permitted content types. Each record includes lifecycle state, the original state for removed content, and a rejection reason when applicable. |
| `GET`    | `/api/admin/content/:contentType/:contentId/revisions` | Authenticated + `canReviewAndPublish`, or `canManageNews` for `newsArticle` only | List the last 100 staff-authored public-content revisions for an event, retirement message, Last Post notice, retirement comment, or news story. Revision snapshots exclude submitter contact details. |
| `GET`    | `/api/admin/roles`                           | Authenticated + `canManageRoles`                                              | List custom roles and permission catalog.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/admin/roles`                           | Authenticated + `canManageRoles`                                              | Create custom role.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `PATCH`  | `/api/admin/roles/:roleId`                   | Authenticated + `canManageRoles`                                              | Update custom role.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `DELETE` | `/api/admin/roles/:roleId`                   | Authenticated + `canManageRoles`                                              | Delete custom role and remove it from users.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/media`                           | Authenticated + `canViewMediaLibrary`                                         | List media assets with linked event, retirement, and Last Post usage. Query: `limit`, `cursor`, `sort=newest\|oldest\|name\|size\|orphaned`, `type=all\|retirement\|last-post\|event\|page\|upload\|migration\|unattached`, and `search` (file or image name).                                                                                                                                                                                |
| `POST`   | `/api/admin/media/bulk-delete`               | Authenticated + `canDeleteMedia`                                              | Delete selected unattached media assets by JSON body `keys`; attached assets are skipped and reported.                                                                                                                                                                                                                                                                                                                                        |
| `DELETE` | `/api/admin/media/:key`                      | Authenticated + `canDeleteMedia`                                              | Delete unattached media by key.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/admin/users`                           | Authenticated + `canReadUsers`                                                | List lightweight user rows. Query: `query`, `limit` from 1-100. Post summaries and editable detail load from the user detail endpoint.                                                                                                                                                                                                                                                                                                        |
| `GET`    | `/api/admin/users/export`                    | Authenticated + `canReadUsers`                                                | Export user records as CSV or PDF. Query: `format=csv\|pdf`, optional `includeRoles`, and optional `includeAccountTypes`. Legacy `@cmcen.local` attribution accounts are excluded.                                                                                                                                                                                                                                                            |
| `POST`   | `/api/admin/users`                           | Authenticated + `canProvisionUsers`                                           | Provision an invited account and email a seven-day activation link. Body: `firstName`, `lastName`, `email`, a built-in non-developer `role`, and optional plain-text `message` (up to 2,000 characters). When supplied, `message` replaces the standard account-creation wording and is used again if the invitation is resent. `internal_beta` requires developer access. Custom roles and content areas are not assigned during invitation. |
| `GET`    | `/api/admin/users/:userId`                   | Authenticated + `canReadUsers`                                                | Get one user admin detail.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `PATCH`  | `/api/admin/users/:userId`                   | Authenticated + `canManageUsers`                                              | Update another member's role, custom roles, and content areas. A caller cannot alter their own built-in role or custom-role assignments through this endpoint.                                                                                                                                                                                                                                                                                 |
| `DELETE` | `/api/admin/users/:userId`                   | Authenticated + `canDeleteAnyUser` + current MFA confirmation                 | Delete another account. Body must choose `keep_and_anonymize` (preserve events, retirement messages, comments, and Last Post notices without account attribution) or `delete_all`. Accepts a current TOTP code or a passkey assertion verified within the prior five minutes.                                                                                                                                                                 |
| `PATCH`  | `/api/admin/users/:userId/role`              | Authenticated + `canManageUsers`; `internal_beta` changes require a developer | Update another member's built-in role only. A caller cannot change their own role. `internal_beta` identifies beta-software members and has subscriber-level site permissions.                                                                                                                                                                                                                                                                 |
| `POST`   | `/api/admin/users/:userId/invitation/resend` | Authenticated + `canProvisionUsers`; Internal Beta requires a developer       | Rotate an invited member's activation token, extend it by seven days, retry delivery, and record the result.                                                                                                                                                                                                                                                                                                                                  |
| `PATCH`  | `/api/admin/users/:userId/developer`         | Authenticated + `canManageUsers` + current user must be `developer`           | Promote an `administrator` account to developer after explicit `DEVELOPER` confirmation. Subscriber and other non-administrator accounts cannot be promoted directly.                                                                                                                                                                                                                                                                         |
| `PATCH`  | `/api/admin/events/:eventId`                 | Authenticated + `canReviewAndPublish`                                         | Partially edit an event without resubmitting it. Changes are audited.                                                                                                                                                                                                                                                                                                                                    |
| `PATCH`  | `/api/admin/news/:articleId`                 | Authenticated + `canReviewAndPublish`                                         | Partially edit a news story’s bilingual title/content or image URLs without changing its publication state. Changes are audited.                                                                                                                                                                                                                                                                |
| `PATCH`  | `/api/admin/retirement-messages/:messageId`  | Authenticated + `canReviewAndPublish`                                         | Partially edit retirement metadata, messages, and photo URLs without resubmitting it. Legacy rank, name, and role fields may be blank. Changes are audited.                                                                                                                                                                                                                                      |
| `PATCH`  | `/api/admin/last-posts/:lastPostId`          | Authenticated + `canReviewAndPublish`                                         | Partially edit Last Post internal title/slug, deceased metadata, messages, or image URLs without resubmitting it. Legacy rank and name fields may be blank. Changes are audited.                                                                                                                                                                                                                                          |
| `PATCH`  | `/api/admin/retirement-comments/:commentId`  | Authenticated + `canReviewAndPublish`                                         | Edit a retirement comment’s text without changing its lifecycle state. Changes are audited.                                                                                                                                                                                                                                                                                                                                                       |
| `DELETE` | `/api/admin/events/:eventId`                 | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete an event. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                                                                                                                                                                                  |
| `DELETE` | `/api/admin/retirement-messages/:messageId`  | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a retirement message. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                                                                                                                                                                      |
| `DELETE` | `/api/admin/last-posts/:lastPostId`          | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a Last Post notice. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                                                                                                                                                                        |
| `DELETE` | `/api/admin/retirement-comments/:commentId`  | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a retirement comment.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `PATCH`  | `/api/admin/events/:eventId/hide`            | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending event from public view without deleting the record or attached media. Pending events must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/events/:eventId/restore`         | Authenticated + `canRestoreContent` | Restore a removed event to the status it had immediately before removal. |
| `PATCH`  | `/api/admin/retirement-messages/:messageId/hide` | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending retirement message from public view without deleting it, its comments, or attached media. Pending messages must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/retirement-messages/:messageId/restore` | Authenticated + `canRestoreContent` | Restore a removed retirement message to its previous status. |
| `PATCH`  | `/api/admin/last-posts/:lastPostId/hide`     | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending Last Post notice from public view without deleting the record or attached media. Pending notices must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/last-posts/:lastPostId/restore`  | Authenticated + `canRestoreContent` | Restore a removed Last Post notice to its previous status. |
| `PATCH`  | `/api/admin/retirement-comments/:commentId/hide` | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending retirement comment from public view without deleting its record. Pending comments must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/retirement-comments/:commentId/restore` | Authenticated + `canRestoreContent` | Restore a removed retirement comment to its previous status. |

## Uploads and Media

Mounted at `/api`.

| Method | Path              | Access                                | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------ | ----------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/upload`     | Authenticated + `canUploadMedia`      | Multipart image upload using field `image`. The server validates and re-encodes every stored image as metadata-free WebP before it reaches object storage, then creates variants and a media asset with UUID, upload source context, inferred source name, file metadata, and safe rendering metadata. Retirement and Last Post forms send `displayAspectRatio=4:3`; news stories send `displayAspectRatio=16:9`. Both may supply `displayCropX` and `displayCropY` values from 0 to 1; the response then includes `display`, a server-rendered crop for compact cards, while `url` continues to identify the full original for detail pages. Optional `cdnSlug` creates a stable destination such as `images/branch-crest/large.webp`; it must be unique, lowercase, and use letters, numbers, and single hyphens. Other optional fields: `uploadSource`, `uploadContext`, `sourceId`, `sourceModel`, `sourceField`, `sourceUrl`, `sourceSlug`, `sourceName`. |
| `POST` | `/api/upload-url` | Authenticated + `canUploadMedia`      | Retired; always returns `410 Gone`. Direct-to-storage uploads are disabled because they bypass mandatory metadata removal. Use `POST /api/upload`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GET`  | `/api/image/:key` | Authenticated + `canViewMediaLibrary` | Create short-lived signed download URL for an object key.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

## Banners

Mounted at `/api` from `routes/timers.js`. “Timers” is the legacy code/model name; UI-facing language is Banners.

| Method   | Path                         | Access                                              | Purpose                                             |
| -------- | ---------------------------- | --------------------------------------------------- | --------------------------------------------------- |
| `GET`    | `/api/timers/active`         | Public with optional auth                           | Return active banners. Query: `scope=global\|home`. |
| `GET`    | `/api/admin/timers`          | Authenticated + `canManageTimers` (`timers.manage`) | List all banners for admin.                         |
| `POST`   | `/api/admin/timers`          | Authenticated + `canManageTimers`                   | Create banner.                                      |
| `PATCH`  | `/api/admin/timers/:timerId` | Authenticated + `canManageTimers`                   | Update banner.                                      |
| `DELETE` | `/api/admin/timers/:timerId` | Authenticated + `canManageTimers`                   | Delete banner.                                      |

Banner payload fields: `title`, `text.en`, `text.fr`, `color`, `textColor`, `startsAt`, `endsAt`, `countdownAt`, `placement`, `enabled`, `order`. `text.en` and `text.fr` render pasted `http://` and `https://` URLs as safe, clickable links.

## Translations

| Method  | Path                     | Access                                  | Purpose                               |
| ------- | ------------------------ | --------------------------------------- | ------------------------------------- |
| `GET`   | `/api/translations`      | Authenticated + `canManageTranslations` | Return translation rows for admin UI. |
| `PATCH` | `/api/translations/:key` | Authenticated + `canManageTranslations` | Update existing translation key.      |

## Search

Mounted at `/api/search`.

| Method | Path          | Access | Purpose                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/search` | Public | Search published news stories, events, retirement messages, Last Post notices, and public pages other than Home. Query: `q`, optional `lang` (`en` or `fr`). Results are ranked by title relevance before body-text matches; exact, leading, and singular/plural leading title matches rank first. Only results with a canonical relative `url` are returned. |

## Site Discovery and Metadata

Defined in `routes/seo.js`, mounted at root. These routes are intentionally public and do not expose account or administrative URLs. Known AI crawler identities are blocked server-side and listed in `robots.txt`; conventional search-engine crawlers remain permitted on public pages.

| Method | Path                | Access | Purpose                                                                                           |
| ------ | ------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| `GET`  | `/robots.txt`       | Public | Provide crawler directives and the absolute XML sitemap location.                                 |
| `GET`  | `/sitemap.xml`      | Public | List public static pages plus published custom pages whose audience is public.                    |
| `GET`  | `/site.webmanifest` | Public | Provide browser and installable-web-app metadata, including the CMCEN theme and application icon. |
| `GET`  | `/llms.txt`         | Public | State that AI systems are not authorized to crawl or use CMCEN content; this grants no access.    |

## Pages and Navigation

## Professional Awards

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/professional-awards` | Public | List published professional awards, including application links and recipient records. |
| `GET` | `/api/admin/professional-awards` | Authenticated + `canReviewAndPublish` | List all professional awards for Content Management. |
| `POST` | `/api/admin/professional-awards` | Authenticated + `canReviewAndPublish` | Create a professional award with instructions, nomination/application links, and recipients. Creation is audited. |
| `PATCH` | `/api/admin/professional-awards/:awardId` | Authenticated + `canReviewAndPublish` | Update an award and its links or recipient archive. Changes are audited. |
| `DELETE` | `/api/admin/professional-awards/:awardId` | Authenticated + `canDeleteContent` | Permanently delete an award. This is audited. |
| `POST` | `/api/admin/professional-awards/:awardId/recipients` | Authenticated + `canReviewAndPublish` | Add a recipient record. The payload supports recipient name/postnominals, role, medallion number for the Colonel-in-Chief Commendation, or amount for the C&E Branch Bursary. It also publishes an audited congratulatory news story dated when the recipient was added, so it appears in the homepage news feed and opens as a full news article. |
| `PATCH` | `/api/admin/professional-awards/:awardId/recipients/:recipientId` | Authenticated + `canReviewAndPublish` | Update a recipient record. The latest Subaltern and Member of the Year are featured automatically. This is audited. |


Defined in `routes/pages.js`, mounted at root.

| Method   | Path                                  | Access                                | Purpose                                                                                                                                                   |
| -------- | ------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/pages/:slug`                        | Public                                | Serve custom page shell.                                                                                                                                  |
| `GET`    | `/api/navigation`                     | Public with optional auth             | Return visible dynamic navigation.                                                                                                                        |
| `GET`    | `/api/sitemap`                        | Public with optional auth             | Return generated sitemap sections and links from public HTML files plus published custom pages. Excludes non-public utility/admin shells. |
| `GET`    | `/api/pages/:slug`                    | Public with optional auth             | Return page content if access rules allow it.                                                                                                             |
| `GET`    | `/api/admin/pages/:pageId/preview`    | Authenticated + `canManagePages`      | Preview page by ID regardless of publication status.                                                                                                      |
| `GET`    | `/api/admin/pages`                    | Authenticated + `canManagePages`      | List admin page summaries plus navigation/admin metadata.                                                                                                 |
| `GET`    | `/api/admin/pages/media`              | Authenticated + `canManagePages`      | List media picker assets for page editor.                                                                                                                 |
| `POST`   | `/api/admin/pages`                    | Authenticated + `canManagePages`      | Create page.                                                                                                                                              |
| `GET`    | `/api/admin/pages/:pageId`            | Authenticated + `canManagePages`      | Get full page editor payload.                                                                                                                             |
| `PATCH`  | `/api/admin/pages/:pageId`            | Authenticated + `canManagePages`      | Update page content/access/blocks, including free-grid block layout: `column`, `row`, `span` (1–12), and `rowSpan`; divider blocks always use one row.    |
| `PATCH`  | `/api/admin/pages/:pageId/status`     | Authenticated + `canManagePages`      | Set status: `draft`, `published`, or `archived`. When publishing a public page, users with `canFeaturePagesOnHome` may set `featureOnHome: true` to include it in the homepage news feed. |
| `DELETE` | `/api/admin/pages/:pageId`            | Authenticated + `canManagePages`      | Delete page and linked navigation.                                                                                                                        |
| `POST`   | `/api/admin/navigation-items`         | Authenticated + `canManageNavigation` | Create navigation item or group. Draft pages may be attached; they remain hidden publicly until published. Page-linked items may omit `route`; the public navigation response derives it from the page slug. Rejects duplicate links to the same page within one header. |
| `PATCH`  | `/api/admin/navigation-items/:itemId` | Authenticated + `canManageNavigation` | Update navigation item/group, including moving a page link to another header. Rejects duplicate links to the same page within one header.                  |
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
| `GET`   | `/api/events/mine`                    | Authenticated + `canCreateDrafts`     | List the current user's non-hidden events. Removed (hidden) events are not exposed to their original submitter.                                                                                                                     |
| `GET`   | `/api/events/:id`                     | Public (optional authentication)      | Get one published event. When a signed-in caller has already responded to an RSVP-enabled event, the event includes their response only as `myRsvp.response`.                                                                         |
| `GET`   | `/api/events/:id/calendar.ics`        | Public                                | Download one published event as an iCalendar (`.ics`) entry. Optional `lang=en\|fr` selects localized public text; unpublished and removed events return not found.                                                               |
| `GET`   | `/api/events/:id/edit`                | Authenticated owner or reviewer       | Get full event edit payload. Hidden events return not found to a non-reviewer owner; reviewers retain access for moderation and restoration.                                                                                        |
| `PATCH` | `/api/events/:id`                     | Authenticated owner or reviewer       | Update event while preserving its original submitter record. Owners may update draft, pending, or rejected events only; published events require site staff, and hidden events return not found to a non-reviewer owner. Descriptions and registration instructions are limited to 10,000 characters per language. |
| `POST`  | `/api/events/:id/rsvp`                | Authenticated non-owner               | Create or update the caller’s accept/decline RSVP for a published RSVP-enabled event before its deadline. Event owners cannot RSVP to their own event. The stored rank, name, unit/status, email, and phone are copied from the account profile; the event owner receives a site notification. |
| `DELETE` | `/api/events/:id/rsvp`                | Authenticated non-owner               | Cancel the caller’s RSVP for a published RSVP-enabled event. Cancellation is available after the RSVP deadline and completed cancellations are audit logged. |
| `GET`   | `/api/events/:id/rsvps`               | Authenticated + `canManageEventRsvps` | List RSVP responses and attendee profile snapshots. Views are audit logged. |
| `GET`   | `/api/events/:id/rsvps.csv`           | Authenticated + `canManageEventRsvps` | Download accept/decline responses as CSV. Exports are audit logged. |
| `PATCH` | `/api/events/:eventId/review-content` | Authenticated reviewer, or owner of a pending/rejected event | Update the title, location, description, and registration text for one language. Reviewers may update pending, published, or removed (hidden) events; editing a removed event preserves its hidden status until it is explicitly restored. Owners, including owners who also have reviewer permissions, may update their pending or rejected events. Updating a rejected event sends it back to the review queue and clears its rejection notification. The saved public-field revision and audit entry record the before/after values. |
| `PATCH` | `/api/events/:eventId/review`         | Authenticated + `canReviewAndPublish` | Publish or reject event.                                                                                                                                                                                                           |

`GET /api/events` accepts optional `from` and `to` query parameters in
`YYYY-MM-DD` form. They must be supplied together, define an inclusive range
of at most 370 days, and return published events that start in or overlap that
range. Calls without those parameters retain the upcoming-events behaviour.
Optional `eventType`, `organizingEntity`, and `provinceRegion` parameters use
their published event-option values and are combined when more than one is
supplied.

Events can enable account-only RSVPs with `rsvpEnabled: true` and an optional
`rsvpDeadline` in `YYYY-MM-DD` form. The deadline closes at the end of that
UTC date and cannot be after the event starts. A responder can change their
own response until the deadline and can cancel it afterward; only members with
the `canManageEventRsvps` permission can see responder contact details or
download the CSV. Administrators have that permission by default.

## News Stories

Mounted at `/api/news`.

News stories are editorial content with mandatory English and French titles and
body content, an optional uploaded image, and a `published` or `draft` status.
Stories without an uploaded image use the canonical CMCEN crest at
`https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp`; that shared asset
is never removed when a story is deleted.
The `canManageNews` (`news.manage`) permission is granted to editors and above
and is available to custom roles. Creates, edits, publication-state changes,
and deletions are recorded in the audit log. The public homepage feed combines
published news stories with published Last Post notices in reverse publish
order.

| Method   | Path                   | Access                          | Purpose                                                                                                                                              |
| -------- | ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/news`            | Public                          | List published news stories. Query: `limit` from 1-48. Cards use the optional 16:9 image display derivative.                                         |
| `GET`    | `/api/news/feed`       | Public                          | List the newest combined published news, Last Post, and featured public custom-page items. Query: `limit` from 1-24.                                 |
| `GET`    | `/api/news/:articleId` | Public                          | Read one published news story as a full article page.                                                                                                |
| `GET`    | `/api/news/manage`     | Authenticated + `canManageNews` | List news stories, including drafts, for the publishing workspace.                                                                                   |
| `POST`   | `/api/news`            | Authenticated + `canManageNews` | Create a bilingual news story. It publishes immediately unless `status: "draft"` is supplied. An upload may include the 16:9 `imageDisplayUrl` crop. |
| `PATCH`  | `/api/news/:articleId` | Authenticated + `canManageNews` | Update the complete bilingual story, image, or publish status. Editing a removed story preserves its removed state until it is explicitly restored. An optional `revisionNote` is recorded with changed fields. |
| `PATCH`  | `/api/news/:articleId/hide` | Authenticated + `canManageNews` | Remove a published news story from public feeds and its public article page without deleting it or its media. The story can be restored to published state; an optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/news/:articleId/restore` | Authenticated + `canManageNews` | Restore a removed news story to its previous published state. |
| `DELETE` | `/api/news/:articleId` | Authenticated + `canManageNews` | Delete a news story and remove its unshared uploaded image. |

## Last Post Notices

Mounted at `/api/last-posts`.

| Method  | Path                                        | Access                                | Purpose                                                                                                                                                                                                                       |
| ------- | ------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/last-posts`                           | Authenticated + `canCreateDrafts`     | Submit a Last Post notice. Chain-of-command consent is required. It enters the review queue by default; `publishNow: true` is allowed only for users with `canReviewAndPublish`. Notice text is limited to 10,000 characters. |
| `GET`   | `/api/last-posts/mine`                      | Authenticated + `canCreateDrafts`     | List the current user's non-hidden Last Post notices for the content workspace. |
| `GET`   | `/api/last-posts/review`                    | Authenticated + `canReviewAndPublish` | List pending Last Post notices.                                                                                                                                                                                               |
| `GET`   | `/api/last-posts/:messageId/edit`           | Authenticated owner or reviewer       | Get the full Last Post edit payload. Hidden notices return not found to a non-reviewer owner. |
| `PATCH` | `/api/last-posts/:messageId`                | Authenticated owner or reviewer       | Update a Last Post notice and submit it again for review, including deceased-member details, image, internal title, and slug. Owners may update pending or rejected notices only; published notices require site staff, and hidden notices return not found to a non-reviewer owner. |
| `PATCH` | `/api/last-posts/:messageId/review-content` | Authenticated reviewer, or owner of a pending/rejected notice | Update one language of a notice. Reviewers may update pending, published, or removed (hidden) notices; editing a removed notice preserves its hidden status until it is explicitly restored. Owners, including owners who also have reviewer permissions, may update their pending or rejected notices. Updating a rejected notice sends it back to the review queue and clears its rejection notification. The saved public-field revision and audit entry record the before/after values. |
| `PATCH` | `/api/last-posts/:messageId/review`         | Authenticated + `canReviewAndPublish` | Publish or reject a pending notice. Publication requires English and French messages.                                                                                                                                         |
| `GET`   | `/api/last-posts`                           | Public                                | List published notices. Query: `limit`, `cursor`.                                                                                                                                                                             |
| `GET`   | `/api/last-posts/:messageId`                | Public                                | Get one published notice.                                                                                                                                                                                                     |

## Retirement Messages and Comments

Mounted at `/api/retirement-messages`.

| Method | Path | Access | Purpose |
| ------- | ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/retirement-messages` | Authenticated + `canSubmitRetirementMessages` | Submit retirement message. Message text is limited to 10,000 characters. Submitter contact details are copied from the authenticated profile; the request supplies only the submitter relationship. When an optional `certificateRequest` is supplied, the server also creates a separate pending, generic certificate-request record linked to this retirement message. The server derives the member's rank and MOSID/role from the retirement submission; every certificate field is required except the C&E Branch enrollment date. | When `MAIL_TO_BRANCH` is configured, the server emails the complete normalized submission and canonical public photo URL to the internal branch mailbox for Power Automate processing. | It enters the review queue by default; `publishNow: true` is allowed only for users with `canBypassReviewStages`. |
| `GET` | `/api/retirement-messages/mine` | Authenticated + `canSubmitRetirementMessages` | List the current user's non-hidden retirement messages for the content workspace. |
| `GET` | `/api/retirement-messages` | Public | List published retirement messages. Query: `q` searches the published retiree name, rank, post-nominals, trade/role, and message text; `year` filters by retirement year; `limit` is 1-48; `cursor` continues the same filtered result set. Responses exclude submitter and review data. |
| `GET` | `/api/retirement-messages/review` | Authenticated + `canReviewAndPublish` | List retirement-message review queue. |
| `GET` | `/api/retirement-messages/comments/review` | Authenticated + `canReviewAndPublish` | List comment review queue. |
| `PATCH` | `/api/retirement-messages/comments/:commentId/review` | Authenticated + `canReviewAndPublish` | Publish or reject comment. |
| `GET` | `/api/retirement-messages/comments/:commentId/edit` | Authenticated owner or reviewer | Get comment edit payload. |
| `PATCH` | `/api/retirement-messages/comments/:commentId` | Authenticated owner or reviewer | Update comment. |
| `GET` | `/api/retirement-messages/:messageId/edit` | Authenticated owner or reviewer | Get full retirement-message edit payload. |
| `PATCH` | `/api/retirement-messages/:messageId` | Authenticated owner or reviewer | Update retirement message while preserving its original submitter contact record and the other language's existing text; message text is limited to 10,000 characters. Missing legacy contact fields are filled from the authenticated profile, and the request may update the relationship. An optional complete `certificateRequest` creates a separate pending certificate-request record linked to the retirement message. It enters the review queue by default; `publishNow: true` is allowed only for users with `canBypassReviewStages`. |
| `GET` | `/api/retirement-messages/:messageId/comments` | Public | List published comments for a message. |
| `POST` | `/api/retirement-messages/:messageId/comments` | Authenticated | Create comment. |
| `GET` | `/api/retirement-messages/:messageId` | Public | Get one published retirement message. |
| `PATCH` | `/api/retirement-messages/:messageId/review-content` | Authenticated reviewer, or owner of a pending/rejected message | Update one language of a retirement message. Reviewers may update pending, published, or removed (hidden) messages; editing a removed message preserves its hidden status until it is explicitly restored. Owners, including owners who also have reviewer permissions, may update their pending or rejected messages. Updating a rejected message sends it back to the review queue and clears its rejection notification. The saved public-field revision and audit entry record the before/after values. |
| `PATCH` | `/api/retirement-messages/:messageId/review` | Authenticated + `canReviewAndPublish` | Publish or reject retirement message. |

## Maintenance

To rediscover route definitions:

```sh
rg -n "router\\.(get|post|patch|delete|put)|app\\.(get|post|patch|delete|put)" server/routes server/server.js
```
