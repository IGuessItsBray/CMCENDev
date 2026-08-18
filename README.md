# CMCEN / RCMCE

CMCEN is the Canadian Military Communications and Electronics Network web
application. It provides public bilingual content, events, retirement and Last
Post notices, account management, submissions, moderation, media management,
analytics, audit logging, and an administrator work zone.

The application is a single Express service. Browser assets are served directly
from `server/public/`, application records are stored in MongoDB, and uploaded
media is stored in MinIO or another S3-compatible object store.

## Requirements

- Node.js 24.x (run `nvm install` once, then `nvm use`, from the repository root)
- npm 10 or newer
- MongoDB 7 or newer, or a compatible managed MongoDB service
- MinIO, or another S3-compatible object store with an existing writable bucket
- Docker, only when building or running the container image
- An SMTP relay, only when email verification and password-reset delivery are
  required

## Repository Layout

| Path | Purpose |
| --- | --- |
| `server/server.js` | Express entrypoint |
| `server/public/` | Static HTML, CSS, and browser JavaScript |
| `server/routes/` | API route modules |
| `server/models/` | Mongoose models |
| `server/services/` | Shared application services |
| `server/scripts/migration/` | Current-site WordPress migration tools |
| `api/schema/openapi.yaml` | OpenAPI schema |
| `docs/` | Developer and operational documentation |

The authoritative Node manifest and lockfile are in `server/`. Run npm commands
from that directory.

## Local Setup

1. Install dependencies:

   ```sh
   nvm install
   nvm use
   cd server
   npm ci
   ```

2. Create the local environment file from the repository root:

   ```sh
   cp .env.example server/.env
   ```

3. Start MongoDB and create or choose a database. The example configuration
   uses `mongodb://127.0.0.1:27017/cmcen`.

4. Start MinIO and create the bucket named by `MINIO_BUCKET_NAME`. The configured
   access key must be able to read, write, list, and delete objects in that
   bucket. Configure the bucket or CDN for public reads when browser-facing
   media URLs should be public.

5. Set a strong `JWT_SECRET`, MinIO credentials, and any environment-specific
   passkey settings in `server/.env`.

6. Start the application:

   ```sh
   npm run start:dev
   ```

   The default URL is `http://localhost:3000`.

## Environment

The complete development template is [.env.example](.env.example). Important
settings include:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Signs access, refresh, and temporary authentication tokens |
| `PORT` | No | HTTP port; defaults to `3000` |
| `APP_BASE_URL` | Recommended | Absolute application URL used in generated links |
| `PLAUSIBLE_DOMAIN` | No | Website domain configured in the self-hosted Plausible instance; both Plausible settings are required to enable tracking |
| `PLAUSIBLE_API_URL` | No | Self-hosted Plausible event endpoint, normally `https://<plausible-host>/api/event` |
| `MINIO_ENDPOINT` | Yes | Internal S3-compatible endpoint |
| `MINIO_ACCESS_KEY` | Yes | Object-storage access key |
| `MINIO_SECRET_KEY` | Yes | Object-storage secret key |
| `MINIO_BUCKET_NAME` | Yes | Existing media bucket |
| `MINIO_PUBLIC_ENDPOINT` | Recommended | Browser-accessible object-storage origin; the bucket is appended automatically |
| `CDN_PUBLIC_BASE_URL` | No | Preferred full public media/CDN base URL, including any bucket path |
| `RP_ID` | Production MFA | WebAuthn relying-party domain |
| `RP_ORIGIN` | Production MFA | Exact WebAuthn application origin |
| `CONFIG_TOKEN` | Site config | Additional token for protected site-config operations |
| `SMTP_HOST` | Email | SMTP relay host |
| `SMTP_PORT` | Email | SMTP relay port |
| `MAIL_FROM` | Email | Sender address |
| `ENABLE_API_DOCS` | No | Set to `true` only in trusted development environments |

Do not commit `server/.env` or real credentials.

## Commands

Run these from `server/`:

```sh
npm start          # production-style local start
npm run start:dev  # restart automatically when source files change
npm run check      # runtime, syntax, and lint checks across all JavaScript
npm run lint       # lint all JavaScript
npm run format:check # report formatting differences without changing files
npm run format     # apply formatting deliberately
npm test           # syntax checks plus Mongo-backed API integration tests
npm run test:integration       # integration tests only
npm run test:integration:watch # rerun integration tests while editing
```

The integration suite starts a temporary MongoDB instance, uses Supertest to
exercise the Express application without opening an HTTP port, and deletes the
temporary database after the run. See [docs/TESTING.md](docs/TESTING.md) for
coverage, conventions, and remaining test layers.

## Docker

Build from the repository root. The image installs the locked server
dependencies and does not copy an environment file into the image.

```sh
docker build -t cmcen:local .
docker run --rm --name cmcen \
  --env-file server/.env \
  -p 3000:3000 \
  cmcen:local
```

MongoDB and MinIO must be reachable from inside the container. When they run on
the host, use host-accessible endpoints rather than `127.0.0.1` in the container
environment. The image health check calls `GET /api/data` every 30 seconds.

## Migration Tools

The workbook importer is the sole retained migration tool. It imports reviewed
retirement messages and Last Post notices, their bilingual content, media, and
available comments from the versioned workbook:

```sh
node server/scripts/migration/import-workbook-inventory.js \
  --input=./scripts/migration/import/cmcen_export_latest.xlsx \
  --limit=3
```

Read [docs/MIGRATION INFO.md](docs/MIGRATION%20INFO.md) before using `--apply`.

## Documentation

- [API routes](docs/API%20ROUTES.md)
- [OpenAPI schema](api/schema/openapi.yaml)
- [Migration guide](docs/MIGRATION%20INFO.md)
- [Notifications](docs/NOTIFICATIONS.md)
- [Page builder](docs/PAGE_BUILDER.md)
- [Role editor](docs/ROLE_EDITOR.md)
- [Testing](docs/TESTING.md)
- [Recent changelog](docs/CHANGELOG_LAST_WEEK.md)

When an endpoint changes, update both `docs/API ROUTES.md` and
`api/schema/openapi.yaml` in the same change.
