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

## Self-hosted Plausible Analytics

CMCEN can send browser analytics directly to a [self-hosted Plausible Community
Edition instance](https://github.com/plausible/community-edition). Analytics are
off by default; no Plausible script is initialized unless both
`PLAUSIBLE_DOMAIN` and `PLAUSIBLE_API_URL` are configured. The application does
not store Plausible credentials, nor does it proxy analytics events.

### Requirements

- A maintained Plausible Community Edition installation. The official Compose
  stack includes Plausible, PostgreSQL, and ClickHouse; run it separately from
  CMCEN.
- Docker Engine and Docker Compose on the analytics host.
- A CPU supporting SSE 4.2 (x86) or NEON (ARM), which ClickHouse requires, and
  at least 2 GB RAM for the Plausible stack. Allocate persistent storage for
  PostgreSQL, ClickHouse, and backups; analytics-event storage grows with site
  traffic.
- A dedicated public DNS name for the analytics service, such as
  `analytics.example.ca`, with HTTPS. When using Plausible's built-in TLS,
  inbound ports 80 and 443 must reach that host. If TLS is terminated by an
  existing reverse proxy, publish the Plausible service only through that proxy.
- Ongoing operational ownership: promptly apply Plausible security upgrades,
  monitor capacity and availability, and test database/volume restores. Do not
  expose the bundled PostgreSQL or ClickHouse services to the public internet.

### Install Plausible Community Edition

Use the current, version-pinned official Community Edition release and its
deployment instructions. In brief, clone the release branch, create its `.env`,
set `BASE_URL` to the analytics URL, and generate a unique secret key:

```sh
git clone -b v3.2.1 --single-branch \
  https://github.com/plausible/community-edition.git plausible-ce
cd plausible-ce
printf 'BASE_URL=https://analytics.example.ca\n' > .env
printf 'SECRET_KEY_BASE=%s\n' "$(openssl rand -base64 48)" >> .env
```

Follow the upstream guide to expose the service with HTTPS, then start it with
`docker compose up -d`. Open `BASE_URL`, create the first Plausible user, and
add the CMCEN public hostname as a site. The site domain must match the value
configured in `PLAUSIBLE_DOMAIN`; enter only the hostname, without `https://`
or a path. Check the upstream release notes before selecting a newer release or
performing an upgrade.

### Configure CMCEN

On the CMCEN host, add these values to `server/.env` and restart the service or
recreate its container:

```dotenv
# Public hostname registered as a site in Plausible (no scheme or path).
PLAUSIBLE_DOMAIN=cmcen.example.ca
# Public HTTPS event endpoint of the self-hosted Plausible instance.
PLAUSIBLE_API_URL=https://analytics.example.ca/api/event
```

`PLAUSIBLE_API_URL` must be a complete `http` or `https` URL that ends in
`/api/event`. Use the browser-accessible analytics URL—not an internal Docker,
VPN, or database address—because events are posted from visitors' browsers.
Leave either setting empty to disable tracking.

After deployment, visit a public CMCEN page and confirm the browser can `POST`
to the configured endpoint without a CORS or TLS error. The expected event API
response is `202 Accepted`; then verify that the pageview appears in the
Plausible dashboard. If the service sits behind a proxy or CDN, preserve the
real visitor IP in `X-Forwarded-For`; otherwise Plausible's bot filtering can
discard events or miscount visitors.

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
- [Plausible Community Edition deployment guide](https://github.com/plausible/community-edition)

When an endpoint changes, update both `docs/API ROUTES.md` and
`api/schema/openapi.yaml` in the same change.
