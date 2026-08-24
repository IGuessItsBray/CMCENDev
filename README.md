# CMCEN / RCMCE

CMCEN is the Canadian Military Communications and Electronics Network web
application. It provides public bilingual content, events, retirement and Last
Post notices, account management, submissions, moderation, media management,
analytics, audit logging, and an administrator work zone.

The application itself is a single Express service. Browser assets are served
directly from `server/public/`, application records are stored in MongoDB, and
uploaded media is stored in MinIO or another S3-compatible object store.

Plausible Community Edition can optionally be self-hosted alongside CMCEN to
provide privacy-focused web analytics.

## Architecture

At a high level, CMCEN uses the following services:

```text
                         ┌─────────────────────┐
                         │       Browser       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    CMCEN / Express  │
                         └──────┬────────┬─────┘
                                │        │
                     app data   │        │ uploaded media
                                ▼        ▼
                         ┌───────────┐ ┌───────────┐
                         │  MongoDB  │ │   MinIO   │
                         └───────────┘ └───────────┘

                  Optional browser analytics
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Plausible Community │
                         │       Edition       │
                         └──────┬────────┬─────┘
                                │        │
                                ▼        ▼
                         ┌───────────┐ ┌───────────┐
                         │PostgreSQL │ │ClickHouse │
                         └───────────┘ └───────────┘
```

CMCEN does not depend on Plausible to operate. Analytics are disabled when the
Plausible configuration is absent.

### Data Ownership

Each service has a distinct responsibility:

| Service | Purpose | Required |
| --- | --- | --- |
| CMCEN / Express | Application and API | Yes |
| MongoDB | Application records, users, content, configuration, and related data | Yes |
| MinIO / S3 | Uploaded media and object storage | Yes |
| Plausible CE | Web analytics | No |
| Plausible PostgreSQL | Plausible account and configuration data | Only with Plausible |
| Plausible ClickHouse | Plausible analytics event data | Only with Plausible |

Do not use Plausible's PostgreSQL or ClickHouse databases for CMCEN application
data.

## Requirements

### CMCEN

- Node.js 24.x (`nvm install`, then `nvm use`, from the repository root)
- npm 10 or newer
- MongoDB 7 or newer, or a compatible managed MongoDB service
- MinIO, or another S3-compatible object store with an existing writable bucket
- Docker, when using the local infrastructure stack or container image
- An SMTP relay, only when email verification and password-reset delivery are
  required

### Optional Plausible Analytics

Self-hosted Plausible Community Edition additionally requires:

- Docker Engine and Docker Compose
- A CPU supporting SSE 4.2 or newer on x86, or NEON or newer on ARM
- At least 2 GB of RAM available for Plausible and ClickHouse
- Persistent storage for Plausible's PostgreSQL and ClickHouse data
- A public hostname and HTTPS for production use

Plausible should be considered additional infrastructure rather than a
dependency of the CMCEN application.

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
| `docs/CONFIG.md` | Environment-variable and deployment configuration reference |
| `compose.yml` | Complete CMCEN, MongoDB, MinIO, and Plausible deployment stack |
| `compose.env.example` | Safe template for the complete deployment stack's settings |
| `docs/` | Developer and operational documentation |
| `compose.dev.yml` | Local MongoDB and MinIO infrastructure |

The authoritative Node manifest and lockfile are in `server/`. Run npm commands
from that directory.

## Quick Start

For normal local development:

```sh
nvm install
nvm use

docker compose -f compose.dev.yml up -d

cd server
npm ci
cp ../.env.example .env
npm run start:dev
```

The application is available at:

```text
http://localhost:3000
```

The local infrastructure stack provides MongoDB and MinIO. Plausible is
optional and does not need to be running for CMCEN development.

## Complete Docker Compose Deployment

`compose.yml` runs the complete single-host CMCEN stack from the published
Forgejo package image:

```text
CMCEN, MongoDB, MinIO, Plausible, Plausible PostgreSQL, and ClickHouse
```

It is the supported container run method for an evaluation or a single-host
deployment. It creates persistent Docker volumes for every data-bearing service
and creates the CMCEN MinIO bucket automatically on first start.

The CMCEN image is version-pinned in `compose.env.example`. Choose the intended
published release tag before starting a new deployment; do not use an unpinned
image tag for a persistent deployment.

### Start the Complete Stack

From the repository root:

```sh
cp compose.env.example .env
cp .env.example server/.env
```

Edit `.env` and replace every MinIO and Plausible placeholder. Generate the
Plausible secret with:

```sh
openssl rand -base64 48
```

Then configure `server/.env` according to [docs/CONFIG.md](docs/CONFIG.md).
At minimum, set a strong `JWT_SECRET`, the public `APP_BASE_URL`, and the
browser-accessible `MINIO_PUBLIC_ENDPOINT`. To enable analytics, also set:

```dotenv
PLAUSIBLE_DOMAIN=cmcen.example.ca
PLAUSIBLE_API_URL=https://analytics.example.ca/api/event
```

The complete Compose stack overrides CMCEN's internal MongoDB and MinIO
connection settings. Do not set those internal endpoints to host loopback
addresses in `server/.env`; the Compose service names are used automatically.

Start the services and check their state:

```sh
docker compose pull
docker compose up -d
docker compose ps
```

CMCEN is available at `http://127.0.0.1:3000` by default. Plausible is
available at `http://127.0.0.1:8000`, MinIO's S3 endpoint at
`http://127.0.0.1:9000`, and the MinIO console at `http://127.0.0.1:9001`.

The default loopback bindings are deliberate. In a public deployment, configure
an HTTPS reverse proxy for the CMCEN public URL, the Plausible `BASE_URL`, and
the `MINIO_PUBLIC_ENDPOINT`. Do not expose MongoDB, the MinIO console,
PostgreSQL, or ClickHouse to the public internet. Directly exposing the MinIO
S3 endpoint requires careful access-policy review; this stack makes only the
CMCEN media bucket anonymously readable so browsers can load published media.

Stop the stack without removing data:

```sh
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to delete
all CMCEN, MinIO, Plausible PostgreSQL, and ClickHouse data.

## Local Infrastructure

CMCEN requires MongoDB and S3-compatible object storage.

For development, these can run locally through Docker Compose.

Create `compose.dev.yml` in the repository root:

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    ports:
      - "127.0.0.1:27017:27017"
    volumes:
      - mongo-data:/data/db

  minio:
    image: minio/minio
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${MINIO_ROOT_USER:-cmcen}
      MINIO_ROOT_PASSWORD: ${MINIO_ROOT_PASSWORD:-cmcen-development-only}
    ports:
      - "127.0.0.1:9000:9000"
      - "127.0.0.1:9001:9001"
    volumes:
      - minio-data:/data

volumes:
  mongo-data:
  minio-data:
```

Start the infrastructure:

```sh
docker compose -f compose.dev.yml up -d
```

Check its status:

```sh
docker compose -f compose.dev.yml ps
```

Stop the containers without deleting their data:

```sh
docker compose -f compose.dev.yml down
```

The named Docker volumes preserve MongoDB and MinIO data across container
restarts.

Do not use:

```sh
docker compose -f compose.dev.yml down -v
```

unless you intentionally want to delete the local MongoDB and MinIO volumes.

### Local MinIO

The development MinIO endpoints are:

```text
S3 API:        http://localhost:9000
MinIO Console: http://localhost:9001
```

Create the bucket configured by `MINIO_BUCKET_NAME` before uploading media.

The development credentials in the Compose example are intentionally local-only
defaults. Do not reuse them in staging or production.

## Local Setup

If the infrastructure is already available elsewhere, Docker Compose is not
required.

### 1. Install dependencies

```sh
nvm install
nvm use
cd server
npm ci
```

### 2. Create the environment file

From the repository root:

```sh
cp .env.example server/.env
```

Review [docs/CONFIG.md](docs/CONFIG.md) before filling in environment-specific
values. It documents the supported variables, which values are secrets, and
the differences between local, Docker, staging, and production configuration.

### 3. Configure MongoDB

Start MongoDB and create or choose a database.

The example local configuration uses:

```text
mongodb://127.0.0.1:27017/cmcen
```

### 4. Configure object storage

Start MinIO or another compatible S3 service and create the bucket named by
`MINIO_BUCKET_NAME`.

The configured access key must be able to read, write, list, and delete objects
in that bucket.

Configure the bucket, object-storage gateway, or CDN for public reads when
browser-facing media URLs should be public.

### 5. Configure application secrets

Set a strong `JWT_SECRET`, object-storage credentials, and any
environment-specific passkey settings in `server/.env`.

See [docs/CONFIG.md](docs/CONFIG.md) for the complete configuration reference,
including required values, optional features, environment-specific examples,
and secret-handling requirements.

Never commit `server/.env`.

### 6. Start CMCEN

From `server/`:

```sh
npm run start:dev
```

The default URL is:

```text
http://localhost:3000
```

## Environment

The canonical environment-variable template is
[.env.example](.env.example).

For detailed descriptions of every supported environment variable, expected
formats, development and production examples, secret-handling requirements,
and deployment guidance, see the
[Configuration Guide](docs/CONFIG.md).

Important settings include:

| Variable | Required | Purpose |
| --- | --- | --- |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Signs access, refresh, and temporary authentication tokens |
| `PORT` | No | HTTP port; defaults to `3000` |
| `APP_BASE_URL` | Recommended | Absolute application URL used in generated links |
| `PLAUSIBLE_DOMAIN` | No | Website domain configured in the self-hosted Plausible instance; both Plausible settings are required to enable tracking |
| `PLAUSIBLE_API_URL` | No | Self-hosted Plausible event endpoint, normally `https://<plausible-host>/api/event` |
| `PLAUSIBLE_SHARE_URL` | No | Shared Plausible dashboard URL used in the administrator Analytics workspace; treat its authorization value as a secret |
| `MINIO_ENDPOINT` | Yes | Internal S3-compatible endpoint |
| `MINIO_ACCESS_KEY` | Yes | Object-storage access key |
| `MINIO_SECRET_KEY` | Yes | Object-storage secret key |
| `MINIO_BUCKET_NAME` | Yes | Existing media bucket |
| `MINIO_PUBLIC_ENDPOINT` | Recommended | Browser-accessible object-storage origin |
| `CDN_PUBLIC_BASE_URL` | No | Preferred full public media/CDN base URL, including any bucket path |
| `RP_ID` | Production MFA | WebAuthn relying-party domain |
| `RP_ORIGIN` | Production MFA | Exact WebAuthn application origin |
| `SMTP_HOST` | Email | SMTP relay host |
| `SMTP_PORT` | Email | SMTP relay port |
| `SMTP_SECURE` | Email | SMTP transport security mode; current deployments use `starttls` |
| `MAIL_FROM` | Email | Sender address |
| `DISABLE_EMAIL_SENDING` | Email | Set to `true` to suppress every outbound email while retaining the related workflow. |
| `ENABLE_API_DOCS` | No | Set to `true` only when API documentation should be exposed |
| `PLAUSIBLE_DOMAIN` | No | Public CMCEN hostname registered with Plausible |
| `PLAUSIBLE_API_URL` | No | Public Plausible event API endpoint |

Do not commit `server/.env` or real credentials.

`.env.example` is the canonical configuration template. `docs/CONFIG.md`
documents how each value is used. When configuration behavior changes, update
both files in the same pull request.

## Self-hosted Plausible Analytics

CMCEN supports optional self-hosted Plausible Community Edition analytics.

Analytics are off by default. No Plausible script is initialized unless both:

```text
PLAUSIBLE_DOMAIN
PLAUSIBLE_API_URL
```

are configured.

CMCEN does not store Plausible credentials and does not proxy analytics events.
Visitors' browsers submit analytics events directly to the configured Plausible
instance.

For CMCEN-side Plausible environment-variable configuration, see
[docs/CONFIG.md](docs/CONFIG.md).

### Deployment Model

The complete repository Compose stack includes Plausible, PostgreSQL, and
ClickHouse alongside the CMCEN services. It pins Plausible Community Edition to
the upstream `v3.2.1` release and carries the upstream low-resource ClickHouse
configuration needed for a small deployment.

Set `PLAUSIBLE_BASE_URL` and `PLAUSIBLE_SECRET_KEY_BASE` in the root `.env`
before starting the stack. `PLAUSIBLE_SECRET_KEY_BASE` is a secret and must not
be committed. Use the browser-accessible Plausible URL for `PLAUSIBLE_API_URL`,
not an internal Docker address.

After startup, open the configured Plausible `BASE_URL`, create the first user,
and add the public CMCEN hostname as a site. The site domain must match
`PLAUSIBLE_DOMAIN`; enter the hostname only, without `https://` or a path.

For larger or higher-availability deployments, the analytics services may run
on separate infrastructure. Keep their PostgreSQL and ClickHouse data isolated
from CMCEN's MongoDB data in all cases.

### Configure CMCEN

On the CMCEN host, configure:

```dotenv
# Public CMCEN hostname registered with Plausible.
PLAUSIBLE_DOMAIN=cmcen.example.ca

# Public browser-accessible Plausible event endpoint.
PLAUSIBLE_API_URL=https://analytics.example.ca/api/event

# Optional: replaces the legacy Admin > Analytics dashboard with this shared view.
PLAUSIBLE_SHARE_URL=https://analytics.example.ca/share/cmcen.example.ca?auth=replace-with-share-token&embed=true&theme=system
```

`PLAUSIBLE_API_URL` must be a complete `http` or `https` URL ending in:

```text
/api/event
```

Use the browser-accessible Plausible URL, not an internal Docker, VPN,
PostgreSQL, or ClickHouse address.

Events are sent by visitors' browsers.

Restart or recreate the CMCEN service after changing these values.

See [docs/CONFIG.md](docs/CONFIG.md) for the canonical CMCEN-side definitions
of `PLAUSIBLE_DOMAIN`, `PLAUSIBLE_API_URL`, and `PLAUSIBLE_SHARE_URL`.

### Disable Analytics

Leave either of these settings empty:

```dotenv
PLAUSIBLE_DOMAIN=
PLAUSIBLE_API_URL=
PLAUSIBLE_SHARE_URL=
```

CMCEN will not initialize Plausible analytics.

Plausible is not required for any core CMCEN functionality.

### Verify Analytics

After deployment:

1. Visit a public CMCEN page.
2. Open the browser developer tools.
3. Confirm the browser submits an event to the configured Plausible endpoint.
4. Confirm there are no CORS or TLS errors.
5. Confirm the event endpoint returns the expected successful response.
6. Confirm the pageview appears in the Plausible dashboard.

If Plausible sits behind a reverse proxy or CDN, ensure the proxy preserves the
real visitor address through the appropriate forwarded headers.

### Plausible Upgrades

Do not blindly change the Plausible image version.

Before upgrading:

1. Read the upstream release notes.
2. Read any migration instructions.
3. Back up Plausible's persistent data.
4. Review PostgreSQL or ClickHouse version changes.
5. Update the version-pinned Plausible, PostgreSQL, or ClickHouse images in
   `compose.yml` only when the upstream upgrade instructions require it.
6. Run the applicable upstream upgrade procedure against the persistent
   Compose volumes.
7. Verify the dashboard and event ingestion after the upgrade.

The Plausible services and ClickHouse tuning files in this repository are based
on the matching upstream Community Edition release. Review upstream Compose and
configuration changes as part of every Plausible upgrade.

## Persistent Data And Backups

Container recreation must not be treated as a backup strategy.

Persistent data exists in multiple independent systems.

### MongoDB

MongoDB contains CMCEN application data, including user and content records.

Back up MongoDB using an appropriate MongoDB backup process and periodically
test restoration.

### MinIO

MinIO contains uploaded media.

Back up or replicate the object-storage bucket separately from MongoDB.

A MongoDB backup alone does not preserve uploaded files.

### Plausible

When Plausible is enabled, its PostgreSQL and ClickHouse data must also be
protected.

Plausible analytics backups are independent from CMCEN MongoDB and MinIO
backups.

A complete deployment therefore potentially requires protection of:

```text
MongoDB
MinIO / S3 objects
Plausible PostgreSQL
Plausible ClickHouse
```

Do not delete Docker volumes during routine container updates.

## Commands

Run these from `server/`:

```sh
npm start                    # production-style local start
npm run start:dev            # restart automatically when source files change
npm run check                # runtime, syntax, and lint checks across all JavaScript
npm run lint                 # lint all JavaScript
npm run format:check         # report formatting differences without changing files
npm run format               # apply formatting deliberately
npm test                     # syntax checks plus Mongo-backed API integration tests
npm run test:integration     # integration tests only
npm run test:integration:watch # rerun integration tests while editing
```

The integration suite starts a temporary MongoDB instance, uses Supertest to
exercise the Express application without opening an HTTP port, and deletes the
temporary database after the run.

See [docs/TESTING.md](docs/TESTING.md) for coverage, conventions, and remaining
test layers.

## CMCEN Docker Image

Build the CMCEN application image from the repository root.

The image installs the locked server dependencies and does not copy an
environment file into the image.

```sh
docker build -t cmcen:local .
```

Run it with:

```sh
docker run --rm --name cmcen \
  --env-file server/.env \
  -p 3000:3000 \
  cmcen:local
```

MongoDB and MinIO must be reachable from inside the container.

When they run on the Docker host, do not configure their endpoints as
`127.0.0.1` from inside the CMCEN container. Inside a container,
`127.0.0.1` refers to that container itself.

Use an appropriate Docker network, service DNS name, or host-accessible
endpoint.

The image health check calls:

```text
GET /api/data
```

every 30 seconds.

## Production Deployment

`compose.dev.yml` is intended only for local development. The complete
`compose.yml` stack is suitable for evaluation or a single-host deployment, but
it still requires production operations around it.

The production deployment should provide:

- HTTPS termination;
- appropriate reverse-proxy configuration;
- persistent storage;
- backups and tested restoration procedures;
- secret management outside the repository;
- restricted network exposure;
- monitoring and health checks;
- appropriate CPU, memory, and storage capacity;
- controlled software and database upgrades.

MongoDB databases, MinIO administration interfaces, Plausible PostgreSQL, and
Plausible ClickHouse should not be exposed directly to the public internet.

Only public application endpoints and intentionally public object-storage/CDN
endpoints should be internet-accessible.

The primary CMCEN deployment is managed through the VPS Komodo stack.

Changes merged into `main` automatically trigger redeployment. Normal
development work should therefore be delivered through a pull request rather
than by manually modifying the running deployment.

Production environment configuration should follow
[docs/CONFIG.md](docs/CONFIG.md). Secrets and environment-specific values must
remain outside the repository.

## Migration Tools

The workbook importer is the sole retained migration tool.

It imports reviewed retirement messages and Last Post notices, their bilingual
content, media, and available comments from the versioned workbook:

```sh
node server/scripts/migration/import-workbook-inventory.js \
  --input=./scripts/migration/import/cmcen_export_latest.xlsx \
  --limit=3
```

Read [docs/MIGRATION INFO.md](docs/MIGRATION%20INFO.md) before using `--apply`.

Migration operations can modify application data. Review the migration input,
target database, and command options before applying a migration.

## Development Workflow

All repository changes are made on branches and delivered through pull
requests.

Direct commits to `main` are disabled.

New work should begin from the latest `main` unless the requested work depends
on changes already present on an existing work branch.

Branch names use purpose-oriented Conventional Branch naming, such as:

```text
feat/add-event-filtering
fix/login-redirect
hotfix/authentication-regression
chore/update-documentation
```

Commit messages follow Conventional Commits 1.0.0:

```text
feat(events): add event filtering
fix(auth): repair login redirect
docs: update deployment instructions
chore: update dependencies
```

See `AGENTS.md` for the complete repository workflow, branch naming,
dependency, testing, safety, and pull-request requirements.

## Documentation

Repository documentation includes:

- [Configuration guide](docs/CONFIG.md)
- [API routes](docs/API%20ROUTES.md)
- [OpenAPI schema](api/schema/openapi.yaml)
- [Migration guide](docs/MIGRATION%20INFO.md)
- [Notifications](docs/NOTIFICATIONS.md)
- [Page builder](docs/PAGE_BUILDER.md)
- [Role editor](docs/ROLE_EDITOR.md)
- [Testing](docs/TESTING.md)
- [Recent changelog](docs/CHANGELOG_LAST_WEEK.md)
- [Plausible Community Edition](https://github.com/plausible/community-edition)
- [Plausible Community Edition configuration](https://github.com/plausible/community-edition/wiki/Configuration)

When an endpoint changes, update both:

```text
docs/API ROUTES.md
api/schema/openapi.yaml
```

in the same pull request.

When configuration changes, update both:

```text
.env.example
docs/CONFIG.md
```

in the same pull request.

This includes adding, removing, renaming, changing the meaning of, or changing
the expected format or default behavior of an environment variable.

## Contributing

Contributions to CMCEN / RCMCE are welcome, including contributions created
with AI coding assistants and autonomous coding agents.

This repository is explicitly **AI-agent friendly**.

Before contributing:

1. Read [`CONTRIBUTING.md`](docs/CONTRIBUTING.md).
2. Read [`AGENTS.md`](AGENTS.md) in full.
3. If using an AI coding agent, explicitly ensure it has read and is following
   `AGENTS.md` before allowing it to modify the repository.
4. Follow the repository's branch, Conventional Commit, and pull request naming
   standards.
5. Submit all changes through a pull request targeting `main`.

AI-assisted contributions are held to the same standards as manually written
contributions. The contributor submitting the pull request remains responsible
for reviewing, testing, and validating the submitted changes.

Pull requests are normally squash-merged into `main`. PR titles therefore
become part of the canonical Git history and are used by the automated
changelog and release tooling.

See [`CONTRIBUTING.md`](docs/CONTRIBUTING.md) for the contribution workflow and
[`AGENTS.md`](AGENTS.md) for the complete repository development policy.
