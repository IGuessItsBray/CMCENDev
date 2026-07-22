# Testing

CMCEN uses Node's built-in test runner and Supertest for API integration tests.
The suite exercises the actual Express middleware, route handlers, Mongoose
models, validation, indexes, and audit persistence against an ephemeral real
MongoDB process provided by `mongodb-memory-server`.

## Commands

Run commands from `server/`:

```sh
npm test
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:integration:watch
```

`npm test` is the normal local and CI command. It runs JavaScript syntax checks,
unit tests, OpenAPI contract checks, and Mongo-backed integration tests. The
individual commands are useful while working on one layer.

The first Mongo-backed run may download a compatible `mongod` binary. Subsequent
runs use the local cache. The test process needs permission to start the binary
and bind a loopback port.

## Current Coverage

The suite covers:

- public health response and controlled API 404 behavior
- invalid credentials and malformed bearer tokens
- login, safe profile serialization, refresh, logout, and session revocation
- built-in and custom-role authorization across audit, content review, page,
  and developer-only configuration routes
- rejection of otherwise valid sessions after the user is deleted
- audit action, target, user, and date-range filtering; CSV escaping; IPv4 and
  IPv6 tracking; and export audit records
- retirement submission permissions and pending status
- retirement review permissions, bilingual publication, rejection reasons,
  public visibility, and publication audit records
- Last Post submission, bilingual review, publication, and public listing
- bilingual event submission, review, publication, and public retrieval
- bilingual page creation and publication permissions
- retirement comment moderation and author publication behavior
- TOTP setup and verification, including audit-log secret redaction
- image upload processing, generated variants, media metadata, orphan deletion,
  attached-media protection, and mixed-result bulk deletion
- uniqueness and repeated-transition integrity checks
- OpenAPI parsing, operation IDs, responses, and critical route coverage

The suite exposed and now guards against a retirement publication failure caused
by an undefined localization helper.

## Structure

```text
server/test/
  contract/
    openapi.test.js
  integration/
    api.test.js
  unit/
    media-url.test.js
```

`server.js` exports `app` for Supertest and starts MongoDB/listening only when it
is executed directly. Tests set isolated environment values before importing
the application.

Each test creates only the users and content it needs. All MongoDB collections
are cleared before every case, and test files run serially to avoid shared-state
collisions. Never point the suite at a development, staging, or production
database.

## Adding A Test

Prefer assertions against both the HTTP response and persisted state. For a
write endpoint, verify the response status, stored document, linked documents,
and expected audit record. For protected endpoints, include at least one allowed
role and one denied role.

Keep fixtures explicit and deterministic. Do not call public or production
services from the standard suite.

## Remaining Layers

The following remain intentionally separate from the standard suite:

- a real disposable MinIO process and partial-upload cleanup failures
- complete WebAuthn ceremonies, password reset, and email delivery
- browser journeys and responsive visual checks

Current media integration tests exercise multipart uploads, image processing,
`MediaAsset` persistence, attachment checks, and the exact S3 commands through
a test double. A future storage suite should run the same flows against a
disposable S3-compatible service, preferably a Testcontainers MinIO instance.
Keep it separately runnable until Docker is a documented CI dependency.

Browser end-to-end tests should be limited to critical wiring such as login,
MFA, submission/review, media management, page publication, audit CSV download,
language switching, and a WebKit pass for Safari-sensitive behavior.

## CI

Forgejo Actions runs `.forgejo/workflows/tests.yml` whenever a pull request is
opened, updated, reopened, or marked ready for review against `main`. The job
requires a Forgejo runner with the `ubuntu-latest` label and runs from `server/`
with Node 20:

```sh
npm ci
npm test
```

Do not inject production credentials. The suite supplies its own JWT and
object-storage placeholders, suppresses outbound email, and does not connect to
configured MinIO.
