# Server Routes

All routes are mounted by `server/server.js`. Paths below include the full `/api` prefix used by clients.

## Authentication and Account Routes

Defined in `auth.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Public | Create a new subscriber account from registration form fields. |
| `POST` | `/api/login` | Public | Authenticate with username and password, returning a JWT. |
| `GET` | `/api/me` | Bearer token | Return the authenticated user's profile plus computed permissions. |
| `GET` | `/api/contributor-check` | Contributor or higher | Confirm the current user can submit contributor-level content. |
| `GET` | `/api/admin-check` | Administrator | Confirm administrator-only access. |

`POST /api/register` expects identity, address, affiliation, email, `password`, and `passwordConfirmation` fields. It normalizes the email to lowercase and creates the user with the `subscriber` role.

`POST /api/login` expects `username` and `password`. A successful response returns `{ token }`; failed credentials return `401`.

## Admin Routes

Defined in `admin.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/admin/users` | Administrator | List users. Optional `query` parameter filters by username or account name. |
| `PATCH` | `/api/admin/users/:userId/role` | Administrator | Update a user's role after validating it against the shared role config. |

`PATCH /api/admin/users/:userId/role` expects a JSON body with `role`. Valid roles are defined in `server/config/roles.js`.

## Diagnostic Routes

Defined in `diagnostics.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/data` | Public | Public API smoke-test response. |
| `GET` | `/api/protected_data` | Bearer token | Authenticated API smoke-test response. |

## Upload Routes

Defined in `uploads.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/upload` | Bearer token | Upload one `image` multipart file to object storage and return its public CDN URL. |
| `GET` | `/api/image/:key` | Bearer token | Generate a 15-minute signed URL for an object-storage image key. |

`POST /api/upload` expects `multipart/form-data` with an `image` file field. It returns the generated object key and CDN URL.

## Translation Routes

Defined in `translations.js`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/translations.json` | Public | Return the public English/French translation dictionary. |
| `GET` | `/translations.js` | Public | Return the browser translation runtime generated from the JSON dictionary. |
| `GET` | `/api/translations` | Editor or higher | Return translation rows for the management page. |
| `PATCH` | `/api/translations/:key` | Editor or higher | Update an existing translation key's English and/or French value. |

`PATCH /api/translations/:key` expects one or both string fields: `{ "en": "...", "fr": "..." }`. Version one only edits existing keys.

## Search Routes

Defined in `search.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/search` | Public | Search public site content across published events, published retirement messages, and public static pages. |

`GET /api/search` accepts `q` for the search query and optional `lang` as `en` or `fr`. Responses use the shared search protocol:

```json
{
  "query": "ceremony",
  "total": 2,
  "results": [
    {
      "type": "event",
      "sourceId": "mongo-id-or-page-path",
      "title": "Result title",
      "summary": "Short result summary",
      "url": "/calendar.html",
      "date": "2026-06-24T00:00:00.000Z"
    }
  ]
}
```

Future content types, such as articles, should return the same result fields so the frontend does not need a new rendering path.

## Event Routes

Defined in `events.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/events` | Public | List up to 100 published current or future events. |
| `GET` | `/api/events/:id` | Public | Load one published event for the public detail page. Submitter and review fields are not returned. |
| `POST` | `/api/events` | Contributor or higher | Create an event submission. Depending on permissions and payload, it may be saved as pending or published. |
| `GET` | `/api/events/review` | Review/publish permission | List reviewable events. Optional `status` query accepts `pending`, `rejected`, or `published`. |
| `GET` | `/api/events/mine` | Bearer token with draft permission | List events created by the authenticated user. |
| `GET` | `/api/events/:id/edit` | Owner or reviewer | Load a full event record for editing. |
| `PATCH` | `/api/events/:id` | Owner or reviewer | Update an event and resubmit or republish based on permissions. |
| `PATCH` | `/api/events/:eventId/review` | Review/publish permission | Publish or reject a pending event. Body `action` must be `publish` or `reject`. |

Event create and update bodies use localized objects for `title`, `description`, `location`, and `registration`, with `en` and `fr` string properties. Events also validate city, region, organizing entity, event type, timezone, date fields, submitter details, and publication permission where required.

`PATCH /api/events/:eventId/review` expects `{ "action": "publish" }` or `{ "action": "reject", "rejectionReason": "..." }`.

## Retirement Message Routes

Defined in `retirement-messages.js`.

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/retirement-messages` | Retirement-message submit permission | Submit a retirement message for review. Validates retiree details, MOSID/role, submitter details, message length, language, member review confirmation, and publication acknowledgement. |

`POST /api/retirement-messages` expects `retiree`, `message`, `messageLanguage`, optional `photoUrl`, `submitter`, `memberReviewConfirmed`, and `publicationConsentConfirmed`. `messageLanguage` must be `en` or `fr`; the message must be at least 100 characters.

`PATCH /api/retirement-messages/:messageId/review` expects `{ "action": "publish", "messages": { "en": "...", "fr": "..." } }` or `{ "action": "reject", "rejectionReason": "..." }`. Publishing requires both English and French messages to be at least 100 characters.

## Route Module Mounts

| Module | Mount Path |
| --- | --- |
| `auth.js` | `/api` |
| `diagnostics.js` | `/api` |
| `uploads.js` | `/api` |
| `translations.js` | `/`, `/api/translations` |
| `admin.js` | `/api/admin` |
| `events.js` | `/api/events` |
| `retirement-messages.js` | `/api/retirement-messages` |
| `search.js` | `/api/search` |
