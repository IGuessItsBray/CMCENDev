# API Routes

## Archive publication dates

The event, retirement, Last Post and comment review endpoints, and the news
publication endpoint, accept `publicationDateChoice: "original" | "now" | "custom"` for
publish actions. Imported/archive records require an explicit choice; ordinary
new content defaults to now. The custom choice requires `customPublishedAt`, a
valid date no later than the current time. Existing-content update endpoints that transition a
record to published apply the same date-choice validation.
The original date is resolved from stored source provenance, never the import
timestamp or a client-supplied title/year. Missing/invalid choices or an
unavailable original date return 400. An imported comment without an explicit
source date has no original public date option.

`GET /api/admin/content` includes `publicationDate: { isArchive,
originalPublishedAt }` for the shared confirmation dialog. Missing dates are null.
Archive items also include `archiveSourceIds`, `archiveSourceUrls`, and
`archiveSourceLinks: [{ url, language }]` for reviewer comparison. Links use
saved URLs on the legacy domain; `language` is `en` or `fr` only when an
individual source record identifies it, and is empty otherwise. Missing or
unsafe URLs yield an empty link list.
The typed `originalPublishedAt` and `publicationDateChoice` fields preserve the
choice across scheduling and later republication. `publishedAt` controls display
and chronological ordering; audit/review times still record the actual action.
An imported archive event draft can be published/scheduled by a reviewer; ordinary
event drafts still use their existing submission workflow. Cancellation keeps the
draft or pending status. No date backfill or data rewrite is required for the pilot.

Account deletion through `DELETE /api/profile` or `DELETE /api/admin/users/:userId`
also removes private legacy profile data. The migration map retains a source-ID
tombstone without its email hash or Mongo user ID, preventing silent reimport.

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

`GET /page-content/{filename}` is public and serves the bundled JSON files in
`server/public/page-content/`. The shared handler recursively resolves `imageKey`
values into sibling `image` URLs and `fileKey` into `fileUrl` using the
existing media configuration (`CDN_PUBLIC_BASE_URL`, then its documented
fallbacks). Existing URLs and bundled placeholder images without an `imageKey`
remain unchanged. New page images should use storage keys such as
`images/leadership/portraits/example.jpg`; do not add per-page media routes.
The matching objects must exist in every deployment's bucket before rollout.
This applies to public page-content JSON, not database-backed content.
Unknown filenames return 404. The response uses
`Cache-Control: no-cache` so deployment-specific URLs are revalidated.

`GET /images/{key}` and `GET /documents/{key}` (also HEAD) redirect public
object keys, retaining their `images/` or `documents/` prefix, to the configured
media base with HTTP 302 and `Cache-Control: no-cache`. Static HTML uses these
same-origin links for images, favicons, and downloads. Invalid path segments
return 400; a missing absolute HTTP(S) media base returns 503. This route never
signs storage requests or grants access to private objects.
Bundled artwork uses `/assets/images/`. The old `/images/logo.png` and decorative
leadership frame URLs redirect to their bundled replacements for compatibility.

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
| `routes/my-submissions.js`      | `/api/my-submissions`      |
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

## Personal submissions

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/my-submissions` | Authenticated | Paginated summaries of the signed-in user's events, retirement messages, Last Post notices, and comments. |
| `GET` | `/api/my-submissions/:type/:id` | Authenticated owner | Read a submission's public copy, status, rejection feedback, and permitted personal links. |

Ownership is enforced with `createdBy` (or comment `author`) for every role, including administrators. Hidden records are excluded; another user's, hidden, invalid, or missing detail returns `404`. Responses use `Cache-Control: no-store` and explicit field lists, excluding reviewer identities, internal notes, consent records, contact details, RSVP attendees, and revision history.

Personal summaries include `submittedAt` and `rejectedAt` (review date only while rejected); they omit staff edit and publication attribution. Admin-only `/api/admin/content` includes `publishedAt`, `publishedByName`, `lastEditedAt`, `lastEditedBy`, `hiddenAt`, and `hiddenByName`. Picture replacement/removal counts as an edit. Hiding has its own timestamp and actor, separate from edits; restoration clears the current hiding metadata. Missing legacy metadata remains null/empty. Public pages show only the publication date.

List filters: `type=all|event|retirementMessage|lastPost|comment`, `status=all|draft|pending|scheduled|published|rejected`, `limit=1..48` (default 12), and the opaque `cursor` returned as `nextCursor`. Unknown or malformed filters return `400`. The response is `{ items, hasMore, nextCursor }`. Rejected submissions appear first, followed by newest submission date, with stable ID/type tie-breaks. Pending excludes scheduled items; scheduled means stored pending with a publication time. Use a cursor only with its original filters. The detail response is `{ item }`, adding `content`, `feedback`, `scheduledPublishAt`, `editUrl`, and `publicUrl` to the summary.

Personal edit links include `personal=1`, keeping publishing controls out of the correction forms and labelling their submit action “Resubmit for review”. Scheduled/published items have no personal edit action. Comment links require a published parent. Comment corrections in personal mode send `submitForReview: true` to the existing PATCH route, which enforces owner + pending/rejected state and keeps the result pending even for staff.

The personal dashboard uses `editUrl` as edit eligibility: rejected submissions open directly as correction forms inside the detail modal, loading the existing type-specific `/edit` endpoint and submitting to its existing PATCH route. Other statuses are read-only in this modal. Retirement and Last Post corrections edit the original-language message and preserve the other language for translation review. The standalone personal edit links remain available for existing entry points.

Event, retirement, and Last Post correction forms also send `submitForReview: true` to their existing PATCH routes. This optional boolean enforces ownership without a reviewer override (`404`), requires an editable, unscheduled state (`409`), and disallows `publishNow` except `false` (`400`). Existing validation, bilingual merging, and auditing still apply; omitting the flag retains existing behavior. Submission detail includes the attached image reference and retirement date/role where available.

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
| `GET`    | `/api/member-benefits/td-insurance`                     | Authenticated                                                    | Return the TD Insurance member-offer destination after recording the access. The shared footer uses it only after sign-in, so the campaign URL is not embedded in public client code.                                                                |
| `PUT`    | `/api/subscriptions/weekly-brief`                       | Authenticated                                                    | Explicitly opt in to or withdraw from the Friday weekly email brief. Opt-in requires `subscribed: true` and `expressConsent: true`; consent and withdrawal are audited.                                                                               |
| `PUT`    | `/api/subscriptions/news-announcements`                 | Authenticated                                                    | Explicitly opt in to or withdraw from occasional news-announcement emails.                                                                                                                                                                            |
| `GET`    | `/api/subscriptions/weekly-brief/unsubscribe?token=...` | Public opaque email token                                        | Immediately unsubscribe from the weekly brief without requiring sign-in. Tokens are retained for at least 60 days after their email is sent.                                                                                                          |
| `POST`   | `/api/subscriptions/weekly-brief/unsubscribe?token=...` | Public opaque email token                                        | Supports RFC 8058 one-click unsubscribe requests from email clients.                                                                                                                                                                                  |
| `POST`   | `/api/ghost/upgrade`                                    | Authenticated                                                    | Upgrade/merge a ghost account into the current authenticated account.                                                                                                                                                                                 |
| `PATCH`  | `/api/profile`                                          | Authenticated                                                    | Update the caller's editable profile fields. `currentUnit` accepts 256 characters; optional `biography` accepts 10,000 plain-text characters; `websiteUrl` and `socialLinks.facebook` accept HTTP(S) URLs without embedded credentials, up to 2,048 characters, or empty strings to clear. These fields are returned by `/api/me` but are not public. |
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

## Archive Review

All routes require an authenticated user with the exact `developer` role and return `Cache-Control: no-store`. Review decisions never mutate articles, media or publication state. See [Archive Review](ARCHIVE_REVIEW.md).

Discovery batches support `type=disposition` and `category=unassigned`. Disposition choices are `preserve`, `exclude`, `research`, `custom`, and `defer`; exclusion records a decision without removing the item. Sources may be French-only (`sources.en=null`), and optional `relatedSources` contain separate supporting records rather than translations. Destination lookup currently covers news articles only.
Missing-translation (`discovery`) items also offer `translate` to request a new French translation.

| Method | Route                                                       | Purpose                                                                                                                                                                                    |
| ------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET`  | `/api/admin/archive-review`                                 | Batch summaries and decision counts.                                                                                                                                                       |
| `GET`  | `/api/admin/archive-review/:batchId/items`                  | Lightweight queue; filters `state`, `type`, `category`, `search` (max 200 characters), and numeric `offset`; pages of 50 with `nextOffset`. Defaults are `all`, empty search and offset 0. |
| `GET`  | `/api/admin/archive-review/:batchId/items/:itemId`          | Source snapshots, issue, allowed choices, evidence hash, saved decision/history and current destination presence/French-content flag.                                                      |
| `PUT`  | `/api/admin/archive-review/:batchId/items/:itemId/decision` | Save `{choice, note, revision, catalogueHash}`. Note max 4,000 characters, required for custom choice. Initial revision is 0; later saves use the returned revision.                       |

Unknown batches/items return 404, invalid inputs 400, missing authentication 401 and other roles 403. PUT returns 409 for changed evidence or concurrent saves. Successful saves atomically append actor/time/notes/history and write `archive_review.decision_saved` to the audit log. Evidence changes reopen items as pending while retaining saved history. The response includes the saved `decision` and derived `state` (`pending`, `approved`, `reviewed`, `deferred`); approval records intent for later work, not application or publication.

## Imported Archive Staff Review

Regular editors handle imported articles and submissions in the Content Workspace with `origin=imported`; ordinary content permissions apply. The specialized `/archive-staff-review` workspace remains for imported Pages and ArchiveDocuments. Its API also preserves the existing verification checks and history for all imported types. `archive.verify` grants access to all its routes; `pages.manage` grants access only to the Page and ArchiveDocument routes and the type list. Neither permission grants other content management. Server-side archive access is limited to records with WordPress source identity and a published original source; preserved, originally unapproved comments also require an explicit `legacy.importReview.decision=preserve-as-draft`. Only unscheduled imported drafts can be corrected, verified, or published there. Source URLs and retained source snapshots are displayed for comparison. All responses use `Cache-Control: no-store`.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/archive-staff-review/types` | Supported types and required check keys. |
| `GET` | `/api/admin/archive-staff-review/media` | Search existing `MediaAsset` images with `search` and numeric `cursor` (25 per page). Requires `archive.verify`; returns only selection metadata. Does not scan storage, upload, or grant media administration. |
| `GET` | `/api/admin/archive-staff-review/:type` | Imported draft or published queue; `status=draft\|published\|all`, numeric `offset`, pages of 50. Each item includes current-revision `checksCompleted` (0–4) and news `layout`. |
| `GET` | `/api/admin/archive-staff-review/:type/:id` | Editable public fields, immutable source evidence, publication date options, and saved verification. |
| `PATCH` | `/api/admin/archive-staff-review/:type/:id` | Correct whitelisted public fields with `{expectedUpdatedAt, changes}`. Newsletter figure selections may use `mediaSelections: [{language, index, key}]` referencing existing images; unaffected rich blocks, alt text, captions, provenance, and pair IDs are preserved. Source identity, submitter/consent, access rules, and status are not editable. Changes invalidate saved checks and are revisioned and audited. |
| `PUT` | `/api/admin/archive-staff-review/:type/:id/verification` | Save `{expectedUpdatedAt, checks, note}`; checks are `source`, `translation`, `categorization`, `media`. A note may record absent French or follow-up. |
| `POST` | `/api/admin/archive-staff-review/:type/:id/publish` | Publish only when all four checks refer to the current draft. All types require `{expectedUpdatedAt, publicationDateChoice}`: `original`, `now`, or `custom` with `customPublishedAt` (valid date no later than now). The original option appears only when source provenance supplies a date. Publishes immediately and audits the reviewer. |

Missing authentication returns 401, missing permission 403, unknown or ineligible records 404, invalid input 400, and stale drafts or incomplete checks 409. Imported documents use the `ArchiveDocument` collection and appear in `/page-content/document-library.json` only after publication; the bundled document catalogue remains public and unchanged.

## Admin Users, Roles, Media, Moderation

Mounted at `/api/admin`.

| `GET` | `/api/admin/subscriptions` | Authenticated + `canManageSubscriptions` | List weekly/news subscribers and sent newsletter history. |
| `GET` | `/api/admin/subscriptions/export.csv` | Authenticated + `canManageSubscriptions` | Export subscribed members to CSV. |
| `POST` | `/api/admin/subscriptions/news-blasts` | Authenticated + `canManageSubscriptions` | Send a news blast only to express news-announcement subscribers; action is audited. Returns `202` without creating a delivery when `DISABLE_EMAIL_SENDING=true`. |
| `GET` | `/api/admin/email` | Authenticated + `canManageEmail` | Read effective emergency-stop/configuration status, category switches, and up to 100 recent metadata-only delivery attempts. |
| `PATCH` | `/api/admin/email/controls` | Authenticated + `canManageEmail` | Set one of `account`, `operational`, `weekly`, or `news` with a boolean `enabled`; audited. Defaults are off. |
| `POST` | `/api/admin/email/test` | Authenticated + `canManageEmail`; three per hour per administrator | Send fixed plain-text test mail only to an address in server-side `EMAIL_TEST_RECIPIENTS`. The global emergency stop still applies. |

| Method   | Path                                         | Access                                                                        | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/admin/review-counts`                   | Authenticated + `canReviewAndPublish`                                         | Return review counts for submissions still awaiting a decision. Scheduled Events, Last Post notices, and retirement messages are excluded.                                                                                                                                                                                                                                                                                                     |
| `GET`    | `/api/admin/content`                         | Authenticated + `canReviewAndPublish`, or `canManageNews` for `newsArticle` only | List staff-only workspace records with editable metadata, submission contact, and publication-authorization details. Event records include RSVP enablement and deadline settings. Query: `type=all\|event\|retirementMessage\|lastPost\|newsArticle\|comment`, `status=all\|draft\|pending\|scheduled\|published\|rejected\|hidden`, `translation=all\|missing-any\|missing-en\|missing-fr` for public copy that has a missing translation (comments are excluded from translation-only results), case-insensitive `search` across the title, name, and public text, `limit` 1-100, an opaque `cursor` returned by the prior page, and optional `id` for one record. `scheduled` is a workspace-only view of pending Events, Last Post notices, retirement messages, and draft news articles with a scheduled publication date; `pending` and `draft` exclude their scheduled records. Responses include `hasMore` and `nextCursor` for Load more pagination; when `type=all`, results are limited to the caller’s permitted content types. Each record includes lifecycle state, the original state for removed content, and a rejection reason when applicable. |
| `GET`    | `/api/admin/content/:contentType/:contentId/revisions` | Authenticated + `canReviewAndPublish`, or `canManageNews` for `newsArticle` only | List the last 100 staff-authored revisions, including private editorial-note changes, for an event, retirement message, Last Post notice, comment, or news story. Revision snapshots exclude submitter contact details. |
| `PATCH` | `/api/admin/content/:contentType/:contentId/editorial-note` | Authenticated + `canReviewAndPublish`, or `canManageNews` for `newsArticle` only | Save `{ language: "en" or "fr", note: string }` (maximum 2000 characters); empty text clears it. Notes are private and returned as `editorialNotes` on authenticated workspace items. Changes retain revision and audit history; public content is unchanged. |
| `GET`    | `/api/admin/roles`                           | Authenticated + `canManageRoles`                                              | List custom roles and permission catalog.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `POST`   | `/api/admin/roles`                           | Authenticated + `canManageRoles`                                              | Create custom role.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `PATCH`  | `/api/admin/roles/:roleId`                   | Authenticated + `canManageRoles`                                              | Update custom role.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `DELETE` | `/api/admin/roles/:roleId`                   | Authenticated + `canManageRoles`                                              | Delete custom role and remove it from users.                                                                                                                                                                                                                                                                                                                                                                                                  |
| `GET`    | `/api/admin/media`                           | Authenticated + `canViewMediaLibrary`                                         | List media assets with linked event, retirement, and Last Post usage. Query: `limit`, `cursor`, `sort=newest\|oldest\|name\|size\|orphaned`, `type=all\|retirement\|last-post\|event\|page\|upload\|migration\|unattached`, and `search` (file or image name).                                                                                                                                                                                |
| `PATCH` | `/api/admin/media/:key` | Authenticated + `canViewMediaLibrary` + `canUploadMedia` | Set internal `displayName` (trimmed, nonblank, 1–120 characters, no control characters); reject other fields. Names appear and are searchable in Media Library and article image pickers. Storage keys, IDs, URLs, alt text, captions and content references remain unchanged. Records `media.name_changed`; existing assets retain their filename fallback. |
| `POST`   | `/api/admin/media/bulk-delete`               | Authenticated + `canDeleteMedia`                                              | Delete selected unattached media assets by JSON body `keys`; attached assets are skipped and reported.                                                                                                                                                                                                                                                                                                                                        |
| `DELETE` | `/api/admin/media/:key`                      | Authenticated + `canDeleteMedia`                                              | Delete unattached media by key.                                                                                                                                                                                                                                                                                                                                                                                                               |
| `GET`    | `/api/admin/users`                           | Authenticated + `canReadUsers`                                                | List sanitized rows by descending account ID (newest first). Query: literal case-insensitive `query` (first 120 characters), `limit` from 1-100, built-in `role`, `accountType=member\|invited\|ghost`, and `cursor` from the previous response's `nextCursor`. Keep filters unchanged between pages; empty `nextCursor` ends pagination. Invalid cursor/filter returns 400. `includeOptions=false` omits role/content-area catalogs; defaults preserve existing clients. |
| `GET`    | `/api/admin/users/export`                    | Authenticated + `canReadUsers`                                                | Export user records as CSV or PDF. Query: `format=csv\|pdf`, optional `includeRoles`, and optional `includeAccountTypes`. Legacy `@cmcen.local` attribution accounts are excluded.                                                                                                                                                                                                                                                            |
| `POST`   | `/api/admin/users`                           | Authenticated + `canProvisionUsers`                                           | Provision an invited account and email a seven-day activation link. Body: `firstName`, `lastName`, `email`, a built-in non-developer `role`, and optional plain-text `message` (up to 2,000 characters). When supplied, `message` replaces the standard account-creation wording and is used again if the invitation is resent. `internal_beta` requires developer access. Custom roles and content areas are not assigned during invitation. |
| `GET`    | `/api/admin/users/:userId`                   | Authenticated + `canReadUsers`                                                | Get sanitized account detail, including private `user.profile` fields and preserved `user.legacyAccount` source data when present. Reads log `user.profile_viewed` without profile values. `includePosts=false` skips content queries and omits `posts` (`user.postSummary` is null); `includeOptions=false` omits role/content-area catalogs. Both default to true. Missing or malformed user IDs return 404. Credentials are not returned. |
| `PATCH`  | `/api/admin/users/:userId`                   | Authenticated + `canManageUsers`                                              | Update another member's role, custom roles, and content areas. A caller cannot alter their own built-in role or custom-role assignments through this endpoint.                                                                                                                                                                                                                                                                                 |
| `PATCH`  | `/api/admin/users/:userId/profile`           | Authenticated + `canManageUsers`                                              | Update allowlisted profile and address fields with model validation. Name edits update account name; changes are audited by field name. Credentials, roles, and email are excluded. |
| `PATCH`  | `/api/admin/users/:userId/email`             | Authenticated + `users.email.edit` (`canEditUserEmail`); no self-correction | Correct another member's email after office verification (`email`, `officeVerified: true`). Enforces unique email/username, updates an email-based username, invalidates reset/verification tokens and sessions, and audits the old/new address. The Users panel also requires `users.read`. Administrators do not receive email-edit permission by default; developers inherit it through the existing all-permissions rule. No email is sent or online verification gate added. |
| `DELETE` | `/api/admin/users/:userId`                   | Authenticated + `canDeleteAnyUser` + current MFA confirmation                 | Delete another account. Body must choose `keep_and_anonymize` (preserve events, retirement messages, comments, and Last Post notices without account attribution) or `delete_all`. Accepts a current TOTP code or a passkey assertion verified within the prior five minutes.                                                                                                                                                                 |
| `PATCH`  | `/api/admin/users/:userId/role`              | Authenticated + `canManageUsers`; `internal_beta` changes require a developer | Update another member's built-in role only. A caller cannot change their own role. `internal_beta` identifies beta-software members and has subscriber-level site permissions.                                                                                                                                                                                                                                                                 |
| `POST`   | `/api/admin/users/:userId/invitation/resend` | Authenticated + `canProvisionUsers`; Internal Beta requires a developer       | Rotate an invited member's activation token, extend it by seven days, retry delivery, and record the result.                                                                                                                                                                                                                                                                                                                                  |
| `PATCH`  | `/api/admin/users/:userId/developer`         | Authenticated + `canManageUsers` + current user must be `developer`           | Promote an `administrator` account to developer after explicit `DEVELOPER` confirmation. Subscriber and other non-administrator accounts cannot be promoted directly.                                                                                                                                                                                                                                                                         |
| `PATCH`  | `/api/admin/events/:eventId`                 | Authenticated + `canReviewAndPublish`                                         | Partially edit an event without resubmitting it. Changes are audited.                                                                                                                                                                                                                                                                                                                                    |
| `PATCH`  | `/api/admin/news/:articleId`                 | Authenticated + `canReviewAndPublish`                                         | Partially edit a news story’s bilingual title/content or image URLs without changing its publication state. Changes are audited.                                                                                                                                                                                                                                                                |
| `PATCH`  | `/api/admin/retirement-messages/:messageId`  | Authenticated + `canReviewAndPublish`                                         | Partially edit retirement metadata, messages, and photo URLs without resubmitting it. Legacy rank, name, and role fields may be blank. Changes are audited.                                                                                                                                                                                                                                      |
| `PATCH`  | `/api/admin/last-posts/:lastPostId`          | Authenticated + `canReviewAndPublish`                                         | Partially edit Last Post internal title/slug, deceased metadata, messages, or image URLs without resubmitting it. Legacy rank and name fields may be blank. Changes are audited.                                                                                                                                                                                                                                          |
| `PATCH`  | `/api/admin/comments/:commentId`  | Authenticated + `canReviewAndPublish`                                         | Edit a comment’s text without changing its lifecycle state. Changes are audited.                                                                                                                                                                                                                                                                                                                                                       |
| `DELETE` | `/api/admin/events/:eventId`                 | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Permanently delete an event and its RSVPs. Audit and revision history are retained. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                                                                                                                                                                                  |
| `DELETE` | `/api/admin/retirement-messages/:messageId`  | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a retirement message. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                                                                                                                                                                      |
| `DELETE` | `/api/admin/last-posts/:lastPostId`          | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a Last Post notice. Administrator deletion also removes an attached, unshared image and its generated variants.                                                                                                                                                                                                                                                                                                                        |
| `DELETE` | `/api/admin/comments/:commentId`  | Authenticated + `canDeleteContent`, or original owner + `canDeleteOwnContent` | Delete a comment.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `PATCH`  | `/api/admin/events/:eventId/hide`            | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending event from public view without deleting the record or attached media. Pending events must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/events/:eventId/restore`         | Authenticated + `canRestoreContent` | Restore a removed event to the status it had immediately before removal. |
| `PATCH`  | `/api/admin/retirement-messages/:messageId/hide` | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending retirement message from public view without deleting it, its comments, or attached media. Pending messages must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/retirement-messages/:messageId/restore` | Authenticated + `canRestoreContent` | Restore a removed retirement message to its previous status. |
| `PATCH`  | `/api/admin/last-posts/:lastPostId/hide`     | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending Last Post notice from public view without deleting the record or attached media. Pending notices must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/last-posts/:lastPostId/restore`  | Authenticated + `canRestoreContent` | Restore a removed Last Post notice to its previous status. |
| `PATCH`  | `/api/admin/comments/:commentId/hide` | Authenticated + `canHideContent`, or original owner + `canDeleteOwnContent` | Remove a non-pending comment from public view without deleting its record. Pending comments must be published, rejected, or deleted. An optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/admin/comments/:commentId/restore` | Authenticated + `canRestoreContent` | Restore a removed comment to its previous status. |

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

Banner payload fields: `title`, `text.en`, `text.fr`, `color`, `textColor`, `startsAt`, `endsAt`, `countdownAt`, `placement`, `screenPosition`, `enabled`, `dismissible`, `scrolling`, `icon`, `order`. `text.en` and `text.fr` render pasted `http://` and `https://` URLs as safe, clickable links.

`icon` accepts `none`, `info`, or `warning`; other values return 400. All banner responses and audit snapshots include the choice. Existing records and API creates without an icon retain the warning icon, and PATCH requests that omit `icon` preserve the saved value. New drafts in the new administration editor start with `none`. The editor preview and public banner share the same icon renderer.

Dates are optional in the API; `null` removes a date. In the new editor, Enabled now and Schedule are mutually exclusive. Schedule requires a future start date and automatically submits `enabled: true` with that date; the legacy API flag permits delivery, while the start/end dates control its actual visibility. Turning Schedule off submits `enabled: false` and clears the schedule dates. Enabling now removes a future start restriction and may retain an optional end date. Cards show Scheduled before the start, Enabled during the delivery window, and Disabled after the end or when manually disabled. Turning Countdown off clears its target date. `dismissible` (default `true`) allows visitors to hide that banner revision for 24 hours on their browser. `scrolling` (default `false`) enables moving text with pause/resume controls and a static reduced-motion presentation. Both options must be JSON booleans when supplied; invalid types return 400. GET responses include both options. Legacy records retain static, dismissible behavior, and PATCH requests that omit either new option preserve its saved value. `screenPosition` accepts `header` or `below-header`.

## Translations

| Method  | Path                     | Access                                  | Purpose                               |
| ------- | ------------------------ | --------------------------------------- | ------------------------------------- |
| `GET`   | `/api/translations`      | Authenticated + `canManageTranslations` | Return translation rows for admin UI. |
| `PATCH` | `/api/translations/:key` | Authenticated + `canManageTranslations` | Update existing translation key.      |

## Search

Mounted at `/api/search`.

| Method | Path          | Access | Purpose                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/search` | Public | Search published news stories, events, retirement messages, Last Post notices, and public pages other than Home. Query: `q`, optional `lang` (`en` or `fr`). Every query term must match somewhere in a result. Results are ranked by title relevance before body-text matches; exact, leading, and singular/plural leading title matches rank first. Static public-page text is indexed once per server process. Only results with a canonical relative `url` are returned. |

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
| `POST` | `/api/admin/professional-awards/:awardId/recipients` | Authenticated + `canReviewAndPublish` | Add an audited recipient record. The payload supports recipient name/postnominals, year, role, medallion number for the Colonel-in-Chief Commendation, or amount for the C&E Branch Bursary. This does not create or publish a news article. |
| `PATCH` | `/api/admin/professional-awards/:awardId/recipients/:recipientId` | Authenticated + `canReviewAndPublish` | Update a recipient record. The latest Subaltern and Member of the Year are featured automatically. This is audited. |

Recipient creation returns `{ message, award }` with the updated award. It no longer returns a top-level `newsArticleId`. Existing news articles and legacy recipient article links are preserved when adding or editing individual recipients.

`POST /api/admin/professional-awards/:awardId/recipients/:recipientId/news`
requires both `canReviewAndPublish` and `canManageNews`. This optional action
returns `{ newsArticleId }` for `/dashboard-next?area=articles&id=<id>`. It creates an audited
private draft with suggested bilingual copy and the recipient photo (or default
crest), or reopens the linked article without changing it. A unique recipient
source prevents duplicate drafts on retries and concurrent requests. A missing
recipient returns `404`; a linked article that no longer exists returns `409`.

Defined in `routes/pages.js`, mounted at root.

| Method   | Path                                  | Access                                | Purpose                                                                                                                                                   |
| -------- | ------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/pages/:slug`                        | Public                                | Serve custom page shell.                                                                                                                                  |
| `GET`    | `/api/navigation`                     | Public with optional auth             | Return visible dynamic navigation.                                                                                                                        |
| `GET`    | `/api/sitemap`                        | Public with optional auth             | Return generated sitemap sections and links from public HTML files plus published custom pages. Excludes non-public utility/admin shells. |
| `GET`    | `/api/pages/:slug`                    | Public with optional auth             | Return page content if access rules allow it.                                                                                                             |
| `GET`    | `/api/admin/pages/:pageId/preview`    | Authenticated + `canManagePages`, or `archive.verify` for an imported draft only | Preview page by ID. General page managers retain access regardless of publication status. |
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
| `POST`  | `/api/events/:id/rsvp`                | Authenticated non-owner               | Create or update the caller’s accept/decline RSVP for a published RSVP-enabled event before its deadline. Event owners cannot RSVP to their own event. The stored rank, name, unit/status, email, and phone are copied from the account profile. |
| `DELETE` | `/api/events/:id/rsvp`                | Authenticated non-owner               | Cancel the caller’s RSVP for a published RSVP-enabled event. Cancellation is available after the RSVP deadline and completed cancellations are audit logged. |
| `GET`   | `/api/events/:id/rsvps`               | Authenticated + `canManageEventRsvps` | List RSVP responses and attendee profile snapshots. Views are audit logged. |
| `GET`   | `/api/events/:id/rsvps.csv`           | Authenticated + `canManageEventRsvps` | Download accept/decline responses as CSV. Exports are audit logged. |
| `PATCH` | `/api/events/:eventId/review-content` | Authenticated reviewer, or owner of a pending/rejected event | Update the title, location, description, and registration text for one language. Reviewers may update pending, published, or removed (hidden) events; editing a removed event preserves its hidden status until it is explicitly restored. Owners, including owners who also have reviewer permissions, may update their pending or rejected events. Updating a rejected event sends it back to the review queue and clears its rejection feedback. The saved public-field revision and audit entry record the before/after values. |
| `PATCH` | `/api/events/:eventId/review`         | Authenticated + `canReviewAndPublish` | Publish, schedule, cancel a scheduled publication, or reject an event. A publish action may include a future `scheduledPublishAt` timestamp to keep it pending until the server publishes it; `cancel-schedule` leaves it pending. |

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

Mounted at `/api/news`. Articles are persisted as MongoDB `NewsArticle` records.
See [NEWSLETTERS.md](NEWSLETTERS.md) for the staff workflow.

News records support `layout: "standard" | "newsletter"` (default `standard`).
These are backward-compatible storage formats, not public article types. The
shared editor always saves structured articles (`layout: "newsletter"`), converting
legacy plain text on save. The `category` field accepts `news`, `newsletter`,
`unit-updates`, `history-heritage`, or `museum-foundation`. It controls public labels
independently of formatting and archive status. Omitted categories preserve the
existing value, falling back to `newsletter` for legacy structured articles and
`news` for legacy plain text. Category changes are revision-tracked.
Structured article bodies use `newsletterBlocks: { en: [], fr: [] }`, with up
to 200 heading, paragraph, list, figure or document blocks per language. Paragraphs
and list items contain text, strong, emphasis, link and line-break nodes (up to six
nested levels). Figures retain URL, alt text, dimensions, responsive variants and
caption. HTML is never interpreted. Links allow HTTP/S, mailto or root-relative
site paths; images and variants require HTTPS. Each language is limited to 20,000
visible text characters and 200,000 serialized characters. Inline images and their
variants participate in media usage and deletion protection.
`newsletter` metadata contains `author` and `issue` (240 characters), `kicker`
(120), `date` (valid YYYY-MM-DD), `language` (`en` or `fr`), `sourceUrl`
(HTTP/S, up to 2000 characters), `headerCrest` and `archived` (booleans). A newsletter requires
title and body in its original language; an unavailable translation can be empty.
Standard news retains the bilingual requirement. PATCH preserves omitted layout,
blocks and metadata. Text, block and metadata edits are revision-tracked.
Historical articles in every category require their original date. `publishedAt` remains the site's
publication timestamp; public `displayDate`, listing order and search dates use
the original date for historical issues. Historical issues remain searchable and
listed, but are excluded from `/api/news/feed`. New newsletters do not receive an
archive notice by default.
Article responses include `category`, `layout`, `newsletter`, `newsletterBlocks`, `displayDate`
and a localized plain-text `excerpt`. Newsletter `content` is derived plain text
for search and summaries; edit `newsletterBlocks` instead.

Staff create drafts in the dashboard's Articles section. Submissions contains
member/contributor content separately, using the same underlying workspace and
existing permissions. `GET /api/admin/content` accepts
`scope=all|submissions|articles` (default `all`), intersected with the selected type
and caller permissions. Submissions excludes NewsArticle; Articles includes only
NewsArticle.
Use `origin=imported` to show imported archive records only. Returned items
include source URLs and source IDs for the collapsed provenance view.

`GET /api/news/media` requires `canManageNews` and lists registered images for
article selection, exposing only key, URL, dimensions, variants and names. It
accepts `limit` (1–60, default 24), numeric offset `cursor`, and `search` (up to 120
characters); returns `media` and `nextCursor`. It grants no media deletion or
administrative media access. Uploads retain `canUploadMedia` via `/api/upload`.

`GET /api/news/:articleId/preview` requires authentication and `canManageNews`, or `archive.verify` for an imported draft only,
returns the same article shape including unpublished content, and sets
`Cache-Control: no-store`. Public reads still return only published records.

Standard news stories require English and French titles and body content;
newsletters require their original language. Articles have an optional uploaded
image and a `published`, `draft` or `hidden` status.
Stories without an uploaded image use the canonical CMCEN crest at
`https://cdn.corebot.ca/cmcen-demo/images/crest/large.webp`; that shared asset
is never removed when a story is deleted.
The `canManageNews` (`news.manage`) permission is granted to editors and above
and is available to custom roles. Creates, edits, publication-state changes,
and deletions are recorded in the audit log. The public homepage feed combines
published non-historical articles with published Last Post notices and featured
public custom pages in reverse publish order.

| Method   | Path                   | Access                          | Purpose                                                                                                                                              |
| -------- | ---------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/news`            | Public                          | List published articles, including historical newsletters, ordered by `displayDate`. Query: `limit` from 1-48. Cards use the optional 16:9 image display derivative. |
| `GET`    | `/api/news/feed`       | Public                          | List the newest combined published news, Last Post, and featured public custom-page items. Query: `limit` from 1-24.                                 |
| `GET`    | `/api/news/:articleId` | Public                          | Read one published news story as a full article page.                                                                                                |
| `GET`    | `/api/news/manage`     | Authenticated + `canManageNews` | List news stories, including drafts, for the publishing workspace.                                                                                   |
| `POST`   | `/api/news`            | Authenticated + `canManageNews` | Create a standard story or newsletter. The API publishes immediately unless `status: "draft"` is supplied; the staff editor explicitly creates drafts. An upload may include the 16:9 `imageDisplayUrl` crop. |
| `PATCH`  | `/api/news/:articleId` | Authenticated + `canManageNews` | Update article text, newsletter blocks/metadata, image, or publish status. Editing a removed article preserves its removed state until explicitly restored. An optional `revisionNote` is recorded with changed fields. |
| `PATCH`  | `/api/news/:articleId/hide` | Authenticated + `canManageNews` | Remove a published news story from public feeds and its public article page without deleting it or its media. The story can be restored to published state; an optional `reason` is retained in the audit log. |
| `PATCH`  | `/api/news/:articleId/restore` | Authenticated + `canManageNews` | Restore a removed news story to its previous published state. |
| `DELETE` | `/api/news/:articleId` | Authenticated + `canDeleteContent` | Permanently delete a news story and remove its unshared uploaded image. Audit and revision history are retained. |

`PATCH /api/news/:articleId/publication` requires `canManageNews` and accepts
`{ action: "publish", scheduledPublishAt?: "<future timestamp>" }` or
`{ action: "cancel-schedule" }`. The article must be a draft. Publish without a
date makes it public immediately; a future date schedules it (or replaces its
schedule). Cancellation returns it to an unscheduled draft. Publication requires
both languages for standard stories or the original language for newsletters;
each action is audited. Invalid actions/dates return `400`;
non-drafts, cancellation without a schedule, or concurrent changes return `409`.

News responses include nullable `scheduledPublishAt`. Scheduled news remains a
private draft until the existing server publication job publishes it. In Articles,
`status=scheduled` includes these articles and `status=draft` excludes
them. Saving edits to a scheduled draft preserves its date; immediate publication
clears the schedule. Existing articles need no data migration: missing schedule
fields are treated as unscheduled. The optional `sourceAwardRecipientId` has a
partial unique index so existing news articles remain compatible.

## Last Post Notices

Mounted at `/api/last-posts`.

| Method  | Path                                        | Access                                | Purpose                                                                                                                                                                                                                       |
| ------- | ------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/last-posts`                           | Authenticated + `canCreateDrafts`     | Submit a Last Post notice. Chain-of-command consent is required. It enters the review queue by default; `publishNow: true` is allowed only for users with `canReviewAndPublish`. Notice text is limited to 30,000 characters. |
| `GET`   | `/api/last-posts/mine`                      | Authenticated + `canCreateDrafts`     | List the current user's non-hidden Last Post notices for the content workspace. |
| `GET`   | `/api/last-posts/review`                    | Authenticated + `canReviewAndPublish` | List pending Last Post notices.                                                                                                                                                                                               |
| `GET`   | `/api/last-posts/:messageId/edit`           | Authenticated owner or reviewer       | Get the full Last Post edit payload. Hidden notices return not found to a non-reviewer owner. |
| `PATCH` | `/api/last-posts/:messageId`                | Authenticated owner or reviewer       | Update a Last Post notice and submit it again for review, including deceased-member details, image, internal title, and slug. Owners may update pending or rejected notices only; published notices require site staff, and hidden notices return not found to a non-reviewer owner. |
| `PATCH` | `/api/last-posts/:messageId/review-content` | Authenticated reviewer, or owner of a pending/rejected notice | Update one language of a notice. Reviewers may update pending, published, or removed (hidden) notices; editing a removed notice preserves its hidden status until it is explicitly restored. Owners, including owners who also have reviewer permissions, may update their pending or rejected notices. Updating a rejected notice sends it back to the review queue and clears its rejection feedback. The saved public-field revision and audit entry record the before/after values. |
| `PATCH` | `/api/last-posts/:messageId/review`         | Authenticated + `canReviewAndPublish` | Publish, schedule, cancel a scheduled publication, or reject a pending notice. Publication requires English and French messages; a future `scheduledPublishAt` keeps it pending until publication, and `cancel-schedule` leaves it pending. |
| `GET`   | `/api/last-posts`                           | Public                                | List published notices. Query: `limit`, `cursor`.                                                                                                                                                                             |
| `GET`   | `/api/last-posts/:messageId`                | Public                                | Get one published notice.                                                                                                                                                                                                     |
| `GET`   | `/api/last-posts/:messageId/preview`        | Authenticated + `canReviewAndPublish` | Get the public detail shape for a saved draft or pending notice. Responses are not cached. |

## Retirement Messages and Comments

Mounted at `/api/retirement-messages`.

| Method | Path | Access | Purpose |
| ------- | ----------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `POST` | `/api/retirement-messages` | Authenticated + `canSubmitRetirementMessages` | Submit retirement message. Message text is limited to 30,000 characters. Submitter contact details are copied from the authenticated profile; the request supplies only the submitter relationship. When an optional `certificateRequest` is supplied, the server also creates a separate pending, generic certificate-request record linked to this retirement message. The server derives the member's rank and MOSID/role from the retirement submission; every certificate field is required except the C&E Branch enrollment date. | When `MAIL_TO_BRANCH` is configured, the server emails the complete normalized submission and canonical public photo URL to the internal branch mailbox for Power Automate processing. | It enters the review queue by default; `publishNow: true` is allowed only for users with `canBypassReviewStages`. |
| `GET` | `/api/retirement-messages/mine` | Authenticated + `canSubmitRetirementMessages` | List the current user's non-hidden retirement messages for the content workspace. |
| `GET` | `/api/retirement-messages` | Public | List published retirement messages. Query: `q` searches the published retiree name, rank, post-nominals, trade/role, and message text; `year` filters by retirement year; `limit` is 1-48; `cursor` continues the same filtered result set. Responses exclude submitter and review data. |
| `GET` | `/api/retirement-messages/review` | Authenticated + `canReviewAndPublish` | List retirement-message review queue. |
| `GET` | `/api/comments/review` | Authenticated + `canReviewAndPublish` | List comment review queue. |
| `PATCH` | `/api/comments/:commentId/review` | Authenticated + `canReviewAndPublish` | Publish or reject a comment. Scheduled publication is not supported for comments. |
| `GET` | `/api/comments/:commentId/edit` | Authenticated owner or reviewer | Get comment edit payload. |
| `PATCH` | `/api/comments/:commentId` | Authenticated owner or reviewer | Update comment. Optional boolean `submitForReview: true` restricts the operation to the owner of a pending/rejected comment and submits it as pending regardless of staff permissions. Invalid flag types return `400`; unavailable resubmission states return `409`. |
| `GET` | `/api/retirement-messages/:messageId/edit` | Authenticated owner or reviewer | Get full retirement-message edit payload. |
| `PATCH` | `/api/retirement-messages/:messageId` | Authenticated owner or reviewer | Update retirement message while preserving its original submitter contact record and the other language's existing text; message text is limited to 30,000 characters. Missing legacy contact fields are filled from the authenticated profile, and the request may update the relationship. An optional complete `certificateRequest` creates a separate pending certificate-request record linked to the retirement message. It enters the review queue by default; `publishNow: true` is allowed only for users with `canBypassReviewStages`. |
| `GET` | `/api/comments/on/:parentType/:parentId` | Public | List published comments for a message. |
| `POST` | `/api/comments/on/:parentType/:parentId` | Authenticated | Create comment. |
| `GET` | `/api/retirement-messages/:messageId` | Public | Get one published retirement message. |
| `GET` | `/api/retirement-messages/:messageId/preview` | Authenticated + `canReviewAndPublish` | Get the public detail shape for a saved draft or pending message. Responses are not cached. |
| `PATCH` | `/api/retirement-messages/:messageId/review-content` | Authenticated reviewer, or owner of a pending/rejected message | Update one language of a retirement message. Text may be shortened or cleared entirely, with a maximum of 30,000 characters. Reviewers may update pending, published, or removed (hidden) messages; editing a removed message preserves its hidden status until it is explicitly restored. Owners, including owners who also have reviewer permissions, may update their pending or rejected messages. Updating a rejected message sends it back to the review queue and clears its rejection feedback. The saved public-field revision and audit entry record the before/after values. |
| `PATCH` | `/api/retirement-messages/:messageId/review` | Authenticated + `canReviewAndPublish` | Publish, schedule, cancel a scheduled publication, or reject a retirement message. A publish action may include a future `scheduledPublishAt` timestamp to keep it pending until publication; `cancel-schedule` leaves it pending. |

## Maintenance

To rediscover route definitions:

```sh
rg -n "router\\.(get|post|patch|delete|put)|app\\.(get|post|patch|delete|put)" server/routes server/server.js
```

Retirement messages, Last Post notices, and their comment models support `draft`.
New user submissions still default to `pending`. The staff Content Workspace
Draft filter includes retirement messages, Last Post notices and retirement
comments; staff metadata and translation edits preserve draft status. Personal
submission update endpoints reject drafts with 409, preventing accidental
submission or publication. Existing reviewer permissions and audit history apply.
Review endpoints allow explicit publication of drafts; rejection remains a
pending-submission action. Scheduling and cancelling retirement/Last Post
publication preserve the draft state. Unscheduled drafts remain private and
outside approval queues. Existing publication validation remains in force.
Comments share one model (`Comment`) and one Content Workspace type (`comment`).
Each stores `parentType` and `parentId`. Supported parents are registered in
`server/config/comment-targets.js`; the workspace receives `commentTypes` from
`GET /api/admin/content` and shows their checkboxes when Comments is selected.
`parentTypes` is a comma-separated filter: omitted means all, empty means none.
The review count `comments` includes all pending comments and excludes drafts.

- `GET /api/comments/review`: staff queue, default pending; accepts draft,
  published, or rejected through `status`.
- `PATCH /api/comments/:commentId/review`: publish drafts/pending comments or
  reject pending comments with a reason. Comments cannot be scheduled.
  Imported comments require `publicationDateChoice: "original" | "now" | "custom"`.
  Originally unapproved WordPress comments have no original public date.
- `GET /api/comments/:commentId/edit` and `PATCH /api/comments/:commentId`:
  owner/staff access to the existing personal correction workflow.
- `GET` / `POST /api/comments/on/:parentType/:parentId`: published comments or
  authenticated submission on a published parent. Unknown parent types are rejected.
- `PATCH /api/admin/comments/:commentId`: staff body correction, preserving
  attribution, source IDs, and status, with revision and audit history.
- `PATCH /api/admin/comments/:commentId/hide` and `/restore`, and
  `DELETE /api/admin/comments/:commentId`: existing staff/owner permissions apply.

The separate comment models and routes are replaced, without runtime aliases.
Before deploying against an existing database, stop app writes and run from
`server/` with its `MONGO_URI` configured:

```sh
node scripts/migration/consolidate-comments.js
node scripts/migration/consolidate-comments.js --apply
```

The first command is read-only. The second copies both old collections into
`comments`, preserving IDs, timestamps, accounts, complete text, and legacy
metadata; it also relabels revision/audit content types. Conflicts stop the copy.
The original collections remain as a backup and are not used by the new app.
No emails are sent and no publication statuses change. Run this before reopening
writes; rerunning after staff edits will refuse to overwrite changed records.

Published WordPress archive imports can retain missing historical submitter and
consent data when their stored provenance explicitly records
`submissionMetadata: historically-unknown`, `originalStatus: publish`, the
WordPress source namespace and numeric source post IDs. The staff content API
exposes `historicalSubmissionUnknown` and the workspace explains these unknowns.
Public submission routes do not accept this provenance or bypass their normal
submitter/consent checks. Missing historical consent is never marked confirmed.
Comment workspace content includes `originalApproval` when preserved from
WordPress. A value of `0` is labelled as originally unapproved, independently
of its current draft status. Importing such a comment requires an explicit
preservation decision in the preflight evidence and does not publish it.

Archival content length contract: retirement and Last Post message text
supports 30,000 characters per language. Retirement comment creation, owner
editing and staff correction support 2–10,000 characters. Last Post comment
storage also supports 10,000 characters. Importers must preserve complete text
and reject overflow instead of truncating.

## Adopt a Display catalogue

- `GET /api/adopt-displays`: public `{ displays: [...] }`, published records only.
- `GET /api/admin/adopt-displays`: all drafts and published records.
- `POST /api/admin/adopt-displays`: create a draft by default; returns `201` and `{ display }`.
- `PATCH /api/admin/adopt-displays/:displayId`: update supplied fields, including `published`.
- `DELETE /api/admin/adopt-displays/:displayId`: delete the record; does not delete image assets.

Every admin operation requires authentication and `adopt_displays.manage`
(`canManageAdoptDisplays`). No existing staff role is granted this permission;
developers retain their existing all-permissions access. Assign access through
the role manager when staff ownership is agreed. Image uploads use `/api/upload`
and separately require `media.upload`; draft and published image references are
tracked by the media library and protect attached assets from deletion.

Records use MongoDB document IDs; display numbers are optional and may repeat.
`title`, `description`, `adoptionAmount`, `availability`, `recognition`, and
`expiry` are `{ en, fr }` text fields. At least one title is required. Optional
`displayNumber` and `imageUrl` are strings; `published` is a boolean. Amount,
availability and expiry are staff-authored descriptions, without automatic
expiry or adoption/payment rules. PATCH leaves omitted fields unchanged.
Invalid payloads return `400`; invalid or missing IDs return `404`; denied
operations return `401`/`403`. Creates, edits and deletes write audit records.
Public responses exclude staff IDs. The bilingual public page is
`/foundation-adopt`; the staff editor is `/dashboard-next?area=adopt`.

The historical review JSON under `server/data/adopt-review/` remains ignored and
excluded from Docker. No automatic import or publication occurs.
