# CMCEN / RCMCE

CMCEN is the Canadian Military Communications and Electronics Network web
application. It provides public bilingual content, events, retirement and Last
Post notices, account management, submissions, moderation, media management,
analytics, audit logging, and an administrator work zone.

The application is a single Express service. Browser assets are served directly
from `server/public/`, application records are stored in MongoDB, and uploaded
media is stored in MinIO or another S3-compatible object store.

## Requirements

- Node.js 20 or newer
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
npm run check      # syntax-check server, browser, and migration JavaScript
npm test           # currently aliases the syntax check
```

There is not yet a unit or integration test suite. `npm test` verifies syntax,
not application behavior.

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

The retained migration tool imports retirement messages, Last Post notices,
media, metadata, and available WordPress comments from the current public site.
It is dry-run by default:

```sh
node server/scripts/migration/migrate-current-site-content.js --limit=3
node server/scripts/migration/migrate-current-site-content.js --apply
```

Read [docs/MIGRATION INFO.md](docs/MIGRATION%20INFO.md) before using `--apply`.

## Documentation

- [API routes](docs/API%20ROUTES.md)
- [OpenAPI schema](api/schema/openapi.yaml)
- [Migration guide](docs/MIGRATION%20INFO.md)
- [Notifications](docs/NOTIFICATIONS.md)
- [Page builder](docs/PAGE_BUILDER.md)
- [Role editor](docs/ROLE_EDITOR.md)
- [Recent changelog](docs/CHANGELOG_LAST_WEEK.md)

When an endpoint changes, update both `docs/API ROUTES.md` and
`api/schema/openapi.yaml` in the same change.
