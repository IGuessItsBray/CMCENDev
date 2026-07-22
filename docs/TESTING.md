# Testing

CMCEN uses Node's built-in test runner and Supertest for API integration tests.
The suite exercises the actual Express middleware, route handlers, Mongoose
models, validation, indexes, and audit persistence against an ephemeral real
MongoDB process provided by `mongodb-memory-server`.

## Commands

Run commands from `server/`:

```sh
npm test
npm run test:integration
npm run test:integration:watch
```

`npm test` is the normal local and CI command. It runs JavaScript syntax checks
before integration tests. The integration-only commands are useful while
working on API behavior.

The first Mongo-backed run may download a compatible `mongod` binary. Subsequent
runs use the local cache. The test process needs permission to start the binary
and bind a loopback port.

## Current Coverage

The initial suite covers:

- public health response and controlled API 404 behavior
- invalid credentials and malformed bearer tokens
- login, safe profile serialization, refresh, logout, and session revocation
- subscriber denial on protected audit routes
- audit action/target filtering, CSV escaping, and export audit records
- retirement submission permissions and pending status
- retirement review permissions, bilingual publication, rejection reasons,
  public visibility, and publication audit records
- Last Post submission, bilingual review, publication, and public listing

The suite exposed and now guards against a retirement publication failure caused
by an undefined localization helper.

## Structure

```text
server/test/
  integration/
    api.test.js
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

Keep fixtures explicit and deterministic. Do not call the public WordPress site
from the standard integration suite; migration tests should use checked-in HTML
and REST fixtures so results do not change when the old site changes.

## Remaining Layers

The following are intentionally not part of the first suite:

- MinIO object and image-variant integration tests
- event and page-builder lifecycle coverage
- retirement comment lifecycle coverage
- MFA/WebAuthn and email delivery flows
- migration fixture and idempotency tests
- browser journeys and responsive visual checks

MinIO tests should run against a disposable S3-compatible service, preferably a
Testcontainers MinIO instance. They should verify original objects, generated
variants, `MediaAsset` metadata, attached-media protection, bulk deletion, and
cleanup after partial failures. Keep them in a separately runnable suite until
Docker is a documented CI dependency.

Browser end-to-end tests should be limited to critical wiring such as login,
MFA, submission/review, media management, page publication, audit CSV download,
language switching, and a WebKit pass for Safari-sensitive behavior.

## CI

A CI job should run from `server/` with Node 20 or newer:

```sh
npm ci
npm test
```

Do not inject production credentials. The Mongo-backed suite supplies its own
JWT and object-storage placeholders and does not connect to configured MinIO.
