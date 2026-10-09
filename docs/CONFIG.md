# CMCEN Configuration Guide

This document describes the environment variables used by CMCEN / RCMCE,
their purpose, and how they should be configured for development, staging, and
production deployments.

The canonical environment-variable template is:

```text
.env.example
```

For local development, copy it to:

```text
server/.env
```

Do not commit `server/.env`.

Real credentials, passwords, tokens, private infrastructure addresses, and
production secrets must be supplied through local secret storage or deployment
configuration.

## Configuration Precedence

CMCEN reads configuration from environment variables.

For local development, variables are normally loaded from:

```text
server/.env
```

For containerized and production deployments, configuration should be supplied
through the container runtime, Komodo stack, secret manager, or equivalent
deployment environment.

`.env.example` is documentation and a template only. It must never contain real
secrets.

## Application Configuration

### `NODE_ENV`

Controls the application runtime environment.

Typical values:

```text
development
production
```

Development:

```dotenv
NODE_ENV=development
```

Production:

```dotenv
NODE_ENV=production
```

Production mode may affect security-sensitive application behavior such as
secure cookies.

### `PORT`

Port on which the Express application listens.

Example:

```dotenv
PORT=3000
```

The normal default is `3000`.

When running multiple local instances, a different port may be used:

```dotenv
PORT=3001
```

### `APP_BASE_URL`

The public URL used to reach the application.

Local example:

```dotenv
APP_BASE_URL=http://localhost:3000
```

Production example:

```dotenv
APP_BASE_URL=https://cmcen.example.ca
```

This value is used when the application needs to generate absolute URLs,
including links sent through email.

The URL should not normally include a trailing slash.

## Developer-only database backups

Set these in `server/.env` (the application does not load `config/.env`):

```dotenv
BACKUP_ENCRYPTION_PASSWORD=
BACKUP_DIRECTORY=
BACKUP_POSTGRES_URI=
BACKUP_CLICKHOUSE_URL=
BACKUP_CLICKHOUSE_DATABASE=
PLAUSIBLE_DATABASE_URL=
PLAUSIBLE_CLICKHOUSE_DATABASE_URL=
```

### Setup and use

1. Generate a strong password (for example, `openssl rand -base64 48`) and set
   `BACKUP_ENCRYPTION_PASSWORD` in `server/.env`. Save a secure recovery copy.
2. Leave `BACKUP_DIRECTORY` blank for the default private directory, or choose
   a private persistent path writable by the application. If overriding the
   path in Docker, mount persistent storage at that path as well.
3. Set the optional PostgreSQL and ClickHouse connections below when those
   analytics services are installed. URL-encode special characters in URI
   usernames/passwords. Use credentials authorized to read/export the selected
   databases; configuring browser analytics URLs alone does not include them.
4. Restart the application after changing environment values. Sign in with the
   built-in `developer` role and open **Administration → Backups**. Administrators
   and accounts with custom roles cannot access this tool, even if a custom role
   contains `backups.manage`.
5. Check the readiness summary, choose **Back up now**, and download all files
   from the completed backup. Verify a recovery using the instructions below.
6. Enable automatic backups, choose **Daily**, **Weekly**, or **Custom**, set a
   local backup time and time zone, and choose **Save schedule**. Weekly selects
   one weekday; Custom selects any combination of weekdays. Frequency is saved
   by the tool, not in an environment variable.

| Frequency | Days |
| --- | --- |
| Daily | Every day at the chosen time |
| Weekly | One chosen weekday at the chosen time |
| Custom | One or more chosen weekdays at the chosen time |

The default is disabled, with Daily at 02:00 in `America/Toronto` offered when
setting up a schedule. The next scheduled run is displayed with its time zone.

Connection patterns (replace the uppercase placeholders before use):

| Database | Native/local host | Supplied Compose network |
| --- | --- | --- |
| PostgreSQL | `postgresql://BACKUP_USER:URL_ENCODED_PASSWORD@127.0.0.1:5432/ANALYTICS_DATABASE` | `postgresql://BACKUP_USER:URL_ENCODED_PASSWORD@plausible-db:5432/ANALYTICS_DATABASE` |
| ClickHouse HTTP | `http://BACKUP_USER:URL_ENCODED_PASSWORD@127.0.0.1:8123` | `http://BACKUP_USER:URL_ENCODED_PASSWORD@plausible-events-db:8123` |

Native/local examples assume the databases are reachable on those host ports;
the supplied Compose stack does not publish database ports. Use HTTPS for
ClickHouse connections across untrusted networks. ClickHouse exports use HTTP
and do not require a CLI on the application host.

### Encryption, storage, and scope

`BACKUP_ENCRYPTION_PASSWORD` must contain at least 16 characters. Use a strong,
unique password and keep a separate secure recovery copy. It is never returned
by the API. Changing it affects new backups only; retain old passwords for old
backups. Files use AES-256-GCM with a fresh salt and IV and a scrypt-derived key.
`BACKUP_DIRECTORY` defaults to `server/data/backups`, must be outside
`server/public`, and must be writable by the application. The Compose stack
persists the default directory in `cmcen-backups`. Do not point it at media
storage or expose it through a web server. No automatic retention deletion runs;
monitor disk space and copy completed backups to secure off-host storage.

MongoDB is always included using `MONGO_URI`. Optionally set
`BACKUP_POSTGRES_URI` to a PostgreSQL connection URI for the analytics database
and `BACKUP_CLICKHOUSE_URL` to its HTTP endpoint (credentials may be in the URL).
For separately hosted services, use their reachable private database endpoints;
do not substitute the public Plausible dashboard URL. Alternatively, share the
analytics service's `DATABASE_URL` as `PLAUSIBLE_DATABASE_URL` and its
`CLICKHOUSE_DATABASE_URL` as `PLAUSIBLE_CLICKHOUSE_DATABASE_URL` in this app's
`server/.env`. The backup-specific settings take precedence. These values must
be provided to the CMCEN process; it cannot read another service's environment.
The panel separately identifies configured reporting and database backup
connections, so a working analytics dashboard is not reported as unavailable
merely because backup credentials are absent. Readiness indicates configured
connections; an actual export verifies database access.

For the supplied Compose stack these endpoints are `plausible-db:5432` and
`http://plausible-events-db:8123`; use your actual analytics database name and
credentials, not the application MongoDB name. `BACKUP_CLICKHOUSE_DATABASE`
uses an explicit value first, then the database name in the ClickHouse URI path,
and finally `plausible_events_db`. Shared ClickHouse database URIs use their path
as the database name and send HTTP queries to the root endpoint. Empty optional
backup and shared connection values skip that database; configured connections
must all succeed before a backup is published.
Plausible's browser tracking/share URLs do not provide database credentials.
ClickHouse uses HTTP schema queries and per-table Native exports, including
internal storage tables; view definitions are saved without exporting view
results. This covers the selected database's definitions/data, not server users,
configuration, external storage, or uploaded media.

### Scheduling and operation

Open Administration → Backups as a **developer** to run a backup, download
encrypted files, or configure a calendar schedule. It is persisted alongside
backups. Saving selects the next future occurrence. A manual backup before the
next scheduled run does not shift its time; a manual backup after a missed run
also covers that overdue occurrence. Failed scheduled attempts advance to the
next occurrence rather than retrying every minute. The server checks once per
minute and attempts one overdue backup after restarting without replaying all
missed dates. Nonexistent local times during spring-forward are skipped for that
day; repeated fall-back times run only at the first occurrence. A weekly time
skipped by daylight saving resumes the following week. The application must
stay running. Existing interval schedules and API requests (60–525600 minutes)
remain supported until resaved through the calendar UI. A shared directory lock
prevents concurrent runs and schedule changes. Use one scheduler deployment or
share the same directory between replicas. After a process crash, first confirm
all backup processes have stopped, then remove only `.lock` and abandoned hidden
`.backup-*.partial` directories; the lock deliberately does not expire during a
long backup. Also remove abandoned `cmcen-backup-*` credential directories from
the host's temporary directory after confirming no backup is using them.

Native host installations need MongoDB Database Tools (`mongodump`) and, for
PostgreSQL, `pg_dump` at least as new as the database server. Docker includes both.
Each dump/query has a 30-minute timeout. Credentials are not placed in process
arguments or logs, and plaintext dump files are not written to backup storage.
Database exports run sequentially and do not form one consistent snapshot across
databases or MongoDB/ClickHouse tables. Pause writes for coordinated recovery
points. Schedule changes, starts, completions, failures, and downloads are audited.

### Recovery

To recover, download all files from one completed backup and run from `server/`
with the corresponding password in `server/.env`:

```sh
node scripts/decrypt-backup.js /secure/mongo.enc /secure/mongo.archive.gz
node scripts/decrypt-backup.js /secure/postgres.enc /secure/postgres.dump
node scripts/decrypt-backup.js /secure/clickhouse-schema.enc /secure/clickhouse-schema.json
node scripts/decrypt-backup.js /secure/clickhouse-000000.enc /secure/clickhouse-000000.native
```

Decryption verifies authentication before publishing a mode-0600 output and
never overwrites an existing output. Treat decrypted files as sensitive. Restore
MongoDB with `mongorestore --archive=/secure/mongo.archive.gz --gzip` and PostgreSQL
with `pg_restore --dbname=RECOVERY_DATABASE /secure/postgres.dump`, targeting
isolated recovery databases first. For ClickHouse, inspect the decrypted schema
JSON, recreate the database and storage tables using `databaseSchema` and each
`create_table_query`, then insert each mapped Native file with
`clickhouse-client --query 'INSERT INTO recovery_db.table FORMAT Native' < table.native`.
Recreate dependent views last and account for UUIDs, materialized-view targets,
replication paths, and dependencies in the saved definitions; this is an operator
recovery workflow, not an automatic restore endpoint. Verify a recovery before
using it to replace live data.

## MongoDB

### `MONGO_URI`

MongoDB connection URI used by CMCEN.

Local example:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/cmcen
```

When using the development Docker Compose stack:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/cmcen
```

When CMCEN and MongoDB run as containers on the same Docker network:

```dotenv
MONGO_URI=mongodb://mongo:27017/cmcen
```

Authenticated deployments may include credentials and an authentication
database in the URI.

MongoDB credentials are secrets and must not be committed.

## JWT Configuration

### `JWT_SECRET`

Secret used to sign authentication tokens.

Example template:

```dotenv
JWT_SECRET=
```

Every real environment must use a strong, cryptographically random value.

Do not reuse development secrets in production.

Changing this value may invalidate existing tokens.

### `JWT_ACCESS_TOKEN_TTL`

Lifetime of normal access tokens.

Default example:

```dotenv
JWT_ACCESS_TOKEN_TTL=1h
```

Use a duration format accepted by the application's JWT implementation.

### `JWT_REFRESH_TOKEN_TTL_DAYS`

Refresh-token lifetime expressed in days.

Example:

```dotenv
JWT_REFRESH_TOKEN_TTL_DAYS=30
```

The application constrains this value to a reasonable supported range.

## Passkeys and WebAuthn

### `RP_NAME`

Human-readable relying-party name presented during WebAuthn operations.

Example:

```dotenv
RP_NAME=CMCEN
```

### `RP_ID`

WebAuthn relying-party ID.

Local development:

```dotenv
RP_ID=localhost
```

Production:

```dotenv
RP_ID=cmcen.example.ca
```

Do not include:

```text
https://
```

or a path.

Passkeys are bound to the relying-party domain. Credentials created for one
RP ID may not work on another.

### `RP_ORIGIN`

Exact origin from which WebAuthn operations are allowed.

Local:

```dotenv
RP_ORIGIN=http://localhost:3000
```

Production:

```dotenv
RP_ORIGIN=https://cmcen.example.ca
```

The scheme, hostname, and port must match the application origin.

## TOTP

### `TOTP_WINDOW`

Controls how many adjacent TOTP time windows may be accepted when validating a
code.

Example:

```dotenv
TOTP_WINDOW=1
```

Increasing this value increases tolerance for clock drift but also increases
the number of simultaneously valid codes.

Use the smallest value appropriate for the deployment.

## Rate Limiting

CMCEN provides configurable limits for general API traffic and
security-sensitive authentication operations.

### Trusted Reverse Proxies

`TRUST_PROXY` is a comma-separated list of explicit proxy IP addresses or CIDRs.
It defaults to empty: forwarded client-IP and protocol headers are ignored.
For a proxy on the same host, an example is `TRUST_PROXY=127.0.0.1,::1`.
Use only the actual proxy peers for each deployment; boolean values, hop counts,
named subnet aliases, and catch-all `/0` networks are rejected at startup.
The proxy must overwrite forwarded headers supplied by clients. Keep direct
application access restricted to that proxy; the Compose port already binds
to loopback by default. Production refresh cookies remain Secure independently
of forwarded protocol headers.

### Limiter Storage

Each limiter keeps at most 10,000 hashed identity keys, expires idle state on
an unreferenced timer at least once per minute, and rejects new identities with
429 when full. Active counters are never evicted to admit another identity.
These are per-process controls and reset on restart. Multiple replicas need a
shared limiter at ingress to enforce deployment-wide budgets in addition to
these local protections.

### Login Attempts

```dotenv
LOGIN_RATE_LIMIT_WINDOW_SECONDS=900
LOGIN_RATE_LIMIT_MAX=20
LOGIN_ACCOUNT_RATE_LIMIT_WINDOW_SECONDS=900
LOGIN_ACCOUNT_RATE_LIMIT_MAX=5
```

Source-IP and trimmed, lowercase username limits run before database lookup,
password hashing, or rejected-login audit writes. The account limit is shared
across source IPs; successful requests also consume the budget.

### Guest Access Requests

```dotenv
GHOST_REQUEST_RATE_LIMIT_WINDOW_SECONDS=900
GHOST_REQUEST_RATE_LIMIT_MAX=5
GHOST_REQUEST_EMAIL_RATE_LIMIT_WINDOW_SECONDS=3600
GHOST_REQUEST_EMAIL_RATE_LIMIT_MAX=3
```

Both limits run before guest creation or email delivery. Requests for members,
existing guests, and unknown valid addresses return the same response shape.
Member accounts receive an unusable random verification token and are unchanged.
Email delivery happens after the response, so SMTP timing/failures cannot expose
account presence. Database work has a common minimum response time of 250 ms;
this is a practical timing mitigation, not a constant-time database guarantee.

### General API

```dotenv
API_RATE_LIMIT_WINDOW_SECONDS=60
API_RATE_LIMIT_MAX=300
```

These settings define the general API request window and maximum requests
allowed during that period.

### Password-Reset Requests

Client-IP limit:

```dotenv
PASSWORD_RESET_REQUEST_RATE_LIMIT_WINDOW_SECONDS=900
PASSWORD_RESET_REQUEST_RATE_LIMIT_MAX=5
```

Email-address limit:

```dotenv
PASSWORD_RESET_REQUEST_EMAIL_RATE_LIMIT_WINDOW_SECONDS=3600
PASSWORD_RESET_REQUEST_EMAIL_RATE_LIMIT_MAX=3
```

These controls reduce abuse of the password-reset workflow.

### Password-Reset Confirmation

```dotenv
PASSWORD_RESET_CONFIRM_RATE_LIMIT_WINDOW_SECONDS=900
PASSWORD_RESET_CONFIRM_RATE_LIMIT_MAX=5
```

### MFA Verification

```dotenv
MFA_VERIFICATION_RATE_LIMIT_WINDOW_SECONDS=300
MFA_VERIFICATION_RATE_LIMIT_MAX=5
```

Authentication rate limits should not be disabled merely to work around failed
tests or user errors.

## S3-Compatible Object Storage

CMCEN uses Garage for new deployments and can use any compatible S3 service.
The `MINIO_*` variable names are retained for compatibility with existing
deployments; they also configure Garage. The repository's `compose.yml` starts
Garage. New isolated environments should use their own disposable Garage
instance and bucket, never the live Garage credentials or media bucket.

### `MINIO_ACCESS_KEY`

Object-storage access key.

```dotenv
MINIO_ACCESS_KEY=
```

This is a secret.

### `MINIO_SECRET_KEY`

Object-storage secret key.

```dotenv
MINIO_SECRET_KEY=
```

This is a secret.

### `MINIO_BUCKET_NAME`

Bucket used for uploaded media.

Example:

```dotenv
MINIO_BUCKET_NAME=cmcen
```

The bucket must already exist unless deployment tooling creates it separately.

The configured credentials must have the permissions required by the
application.

### `MINIO_ENDPOINT`

Internal endpoint used by the CMCEN server to communicate with object storage.

Local:

```dotenv
MINIO_ENDPOINT=http://127.0.0.1:3900
```

Garage on the same Docker network:

```dotenv
MINIO_ENDPOINT=http://garage:3900
```

Legacy MinIO on the same Docker network:

```dotenv
MINIO_ENDPOINT=http://minio:9000
```

Remote storage:

```dotenv
MINIO_ENDPOINT=https://storage.example.ca
```

This endpoint only needs to be reachable by the server.

It does not necessarily need to be browser-accessible.

### `MINIO_PUBLIC_ENDPOINT`

Browser-accessible object-storage origin.

Example:

```dotenv
MINIO_PUBLIC_ENDPOINT=https://media.example.ca
```

Do not configure this with private network addresses that visitors cannot
reach.

When omitted, the application may fall back to `MINIO_ENDPOINT`.

### `CDN_PUBLIC_BASE_URL`

Preferred public URL for browser-facing media.

Example:

```dotenv
CDN_PUBLIC_BASE_URL=https://cdn.example.ca/cmcen
```

Use this when media is served through a reverse proxy or CDN instead of
directly from object storage.

This is the preferred CDN variable for new deployments.

### `CDN_BASE_URL`

Legacy or fallback CDN URL.

Example:

```dotenv
CDN_BASE_URL=
```

Leave this empty unless an existing deployment depends on it.

Prefer:

```text
CDN_PUBLIC_BASE_URL
```

for new configurations.

## Bootstrap / Development Admin

### `ADMIN_USER`

Optional administrative bootstrap/development username.

```dotenv
ADMIN_USER=
```

### `ADMIN_PASSWORD`

Optional administrative bootstrap/development password.

```dotenv
ADMIN_PASSWORD=
```

Do not configure weak credentials in staging or production.

If these variables are no longer required by the active bootstrap workflow,
they may eventually be removed after confirming that no deployment depends on
them.

## SMTP

CMCEN uses Nodemailer-based outbound email.

The current deployment model uses the Google Workspace SMTP relay with
STARTTLS.

### `SMTP_HOST`

Example:

```dotenv
SMTP_HOST=smtp-relay.gmail.com
```

### `SMTP_PORT`

Current configuration:

```dotenv
SMTP_PORT=587
```

### `SMTP_SECURE`

Current CMCEN deployments use:

```dotenv
SMTP_SECURE=starttls
```

This is intentional.

Do not change it to a boolean without first reviewing the application's SMTP
configuration handling.

### `SMTP_REQUIRE_TLS`

Controls whether TLS negotiation is required.

Recommended:

```dotenv
SMTP_REQUIRE_TLS=true
```

### `SMTP_HELO_NAME`

Optional hostname used in the SMTP EHLO/HELO greeting.

Example:

```dotenv
SMTP_HELO_NAME=mail.example.ca
```

Configure this when the SMTP relay expects or benefits from a stable host
identity.

### `MAIL_FROM`

Sender displayed to recipients.

Example:

```dotenv
MAIL_FROM=CMCEN <notifications@example.ca>
```

Do not place an inline comment after this value.

### `MAIL_REPLY_TO`

Reply-To address applied to outbound mail.

Example:

```dotenv
MAIL_REPLY_TO=support@example.ca
```

## Mail Routing

CMCEN supports separate routing addresses for different mail workflows.

### `MAIL_TO_SUPPORT`

Technical support, website errors, and operational alerts.

```dotenv
MAIL_TO_SUPPORT=
```

### `MAIL_TO_FORMS`

Primary destination for general form submissions.

```dotenv
MAIL_TO_FORMS=
```

### `MAIL_CC_FORMS`

Optional CC destination for form submissions.

```dotenv
MAIL_CC_FORMS=
```

Where supported, multiple recipients may be comma-separated.

### `MAIL_TO_MOS`

Optional Master of Signals or equivalent workflow mailbox.

```dotenv
MAIL_TO_MOS=
```

### `MAIL_TO`

Generic fallback recipient.

```dotenv
MAIL_TO=
```

### `MAIL_TO_ADMIN`

Internal administrative mailbox.

```dotenv
MAIL_TO_ADMIN=
```

This is used by the retirement-submission notification workflow as an internal
administrative destination.

### `MAIL_TO_BRANCH`

Internal branch mailbox.

```dotenv
MAIL_TO_BRANCH=
```

This is used by the retirement-submission workflow and signed-in member contact
form as their primary internal destination.

### `DISABLE_EMAIL_SENDING`

Controls whether CMCEN hands any outbound email to SMTP. When set to `true`,
the underlying workflows continue but no message is delivered. Use this for
safe local development and notification testing.

Default:

```dotenv
DISABLE_EMAIL_SENDING=false
```

For local testing:

```dotenv
DISABLE_EMAIL_SENDING=true
```

The Admin → Email panel has separate persisted switches for account access
messages, operational notifications, automatic weekly briefs, and manual news
announcements. New switches default to off. `DISABLE_EMAIL_SENDING=true` remains
the server-level emergency stop and overrides every switch and test send.

### `EMAIL_TEST_RECIPIENTS`

Comma-separated addresses permitted for the Admin → Email test action. An empty
value disables test sends. Keep this allowlist in server configuration rather
than the browser or repository. The action requires `canManageEmail`, is limited
to three requests per administrator per hour, and cannot bypass the emergency
stop. Test messages contain only fixed plain text.

```dotenv
EMAIL_TEST_RECIPIENTS=
```

## CASL Sender Configuration

CMCEN subscription and bulk-email functionality uses sender-identification
configuration for CASL compliance.

### `CASL_SENDER_NAME`

Legal or operating sender name.

Example:

```dotenv
CASL_SENDER_NAME=Canadian Military Communications and Electronics Network
```

### `CASL_SENDER_MAILING_ADDRESS`

Physical mailing address included where required.

Example:

```dotenv
CASL_SENDER_MAILING_ADDRESS=
```

Use the appropriate official mailing address for the deployment.

### `CASL_SENDER_CONTACT`

Monitored sender contact.

Example:

```dotenv
CASL_SENDER_CONTACT=privacy@example.ca
```

The subscription system should not be considered fully configured until all
required CASL sender-identification fields are populated.

## Plausible Analytics

Self-hosted Plausible Community Edition is optional.

CMCEN does not require Plausible for normal application functionality.

Analytics are enabled only when both Plausible values are configured.

### `PLAUSIBLE_DOMAIN`

CMCEN hostname registered as a Plausible site.

Example:

```dotenv
PLAUSIBLE_DOMAIN=cmcen.example.ca
```

This value must contain only the hostname.

Correct:

```text
cmcen.example.ca
```

Incorrect:

```text
https://cmcen.example.ca
```

### `PLAUSIBLE_API_URL`

Public browser-accessible Plausible event endpoint.

Example:

```dotenv
PLAUSIBLE_API_URL=https://analytics.example.ca/api/event
```

This value must include the scheme.

The endpoint should normally end in:

```text
/api/event
```

The browser must be able to reach this address.

Do not configure an internal Docker or private-network address here.

### `PLAUSIBLE_SHARE_URL`

Optional Plausible shared-dashboard URL displayed in the administrator
Analytics workspace. When it is a valid `http` or `https` URL, users with
`analytics.view` see the Plausible dashboard instead of the legacy CMCEN visit
dashboard.

Copy the complete embed/share URL from Plausible, including its `auth` and
`embed=true` query parameters. CMCEN controls the `theme` parameter so the
dashboard follows the current site light/dark mode. Its authorization value is
sensitive: anyone with the URL can access the shared dashboard. Store it only
in deployment configuration; do not commit it.

Example:

```dotenv
PLAUSIBLE_SHARE_URL=https://analytics.example.ca/share/cmcen.example.ca?auth=replace-with-share-token&embed=true&theme=system
```

This setting is independent of `PLAUSIBLE_DOMAIN` and `PLAUSIBLE_API_URL`, so
it may be enabled without browser event tracking.

### Disabling Plausible

Leave either or both values empty:

```dotenv
PLAUSIBLE_DOMAIN=
PLAUSIBLE_API_URL=
PLAUSIBLE_SHARE_URL=
```

CMCEN will not initialize Plausible tracking.

## API Documentation

### `ENABLE_API_DOCS`

Controls whether the application exposes its Swagger/OpenAPI documentation
interface.

Disabled:

```dotenv
ENABLE_API_DOCS=false
```

Enabled:

```dotenv
ENABLE_API_DOCS=true
```

Keep this disabled on public or untrusted deployments unless exposing the API
documentation is intentional.

## Deployment Metadata

The application may inspect Git commit information from deployment-provided
environment variables such as:

```text
COMMIT_SHA
GIT_COMMIT
RENDER_GIT_COMMIT
VERCEL_GIT_COMMIT_SHA
RELEASE_VERSION
```

These are deployment metadata rather than normal operator configuration.

They generally should not be manually defined in `server/.env`.

CI or deployment infrastructure may provide them automatically.

`GET /api/version` returns `commit`, `shortCommit`, and `releaseVersion`.
`RELEASE_VERSION` identifies the running release tag (for example `v0.3.0`);
the server normalizes a missing `v` prefix. Without deployment metadata, the
server reads the current Git commit and an exact release tag on that commit.
Missing metadata returns empty strings rather than the unrelated package version.

Release image builds embed `COMMIT_SHA` and `RELEASE_VERSION` using Docker build
arguments. Ordinary Docker builds automatically read the checkout's HEAD and
branch refs into a small `build-commit.json` file. Git configuration, history,
logs, and hooks remain excluded. Runtime metadata takes precedence over the
embedded commit, which takes precedence over runtime Git detection.
Worktrees and source archives must supply `--build-arg COMMIT_SHA=<full commit SHA>`;
image builds fail if neither the checkout nor an argument identifies the commit.
The footer shows the release on `cmcen-rcmce.ca` and `cefamily.ca` (including
their `www` aliases), and a seven-character commit on all other hosts.

## Local Development Example

A typical local configuration using only the MongoDB service from the
repository development Compose stack and a separate disposable Garage instance
may look like:

```dotenv
NODE_ENV=development
PORT=3000
APP_BASE_URL=http://localhost:3000

MONGO_URI=mongodb://127.0.0.1:27017/cmcen

JWT_SECRET=<generate-a-local-secret>
JWT_ACCESS_TOKEN_TTL=1h
JWT_REFRESH_TOKEN_TTL_DAYS=30

RP_NAME=CMCEN
RP_ID=localhost
RP_ORIGIN=http://localhost:3000
TOTP_WINDOW=1

MINIO_ACCESS_KEY=<garage-development-access-key>
MINIO_SECRET_KEY=<garage-development-secret-key>
MINIO_BUCKET_NAME=cmcen
MINIO_ENDPOINT=http://127.0.0.1:3900
MINIO_PUBLIC_ENDPOINT=http://127.0.0.1:3900

SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_REQUIRE_TLS=true

DISABLE_EMAIL_SENDING=true
ENABLE_API_DOCS=true
```

Do not copy development credentials into staging or production.

## Garage Docker Compose Deployment Example

When CMCEN, MongoDB, and Garage share a Docker network, internal service names
may be used:

```dotenv
MONGO_URI=mongodb://mongo:27017/cmcen
MINIO_ENDPOINT=http://garage:3900
```

The repository's complete `compose.yml` supplies these internal values to the
CMCEN container automatically. Keep the remaining CMCEN configuration in
`server/.env`, and keep Compose-stack settings such as `CMCEN_IMAGE`, Garage
credentials, and Plausible's `BASE_URL` and secret in the ignored root `.env`
created from `compose.env.example`.

The Compose stack creates the configured Garage bucket and uses the same Garage
credentials for CMCEN. `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
`MINIO_BUCKET_NAME`, `MONGO_URI`, and `MINIO_ENDPOINT` in `server/.env` are
therefore overridden while that stack is running.

Public browser-facing URLs must still use addresses reachable by end users:

```dotenv
APP_BASE_URL=https://cmcen.example.ca
MINIO_PUBLIC_ENDPOINT=https://media.example.ca
CDN_PUBLIC_BASE_URL=https://cdn.example.ca/cmcen
```

Do not use Docker service names in browser-facing URLs.

## Production Configuration

Production should normally configure at least:

```text
NODE_ENV
PORT
APP_BASE_URL
MONGO_URI
JWT_SECRET
JWT_ACCESS_TOKEN_TTL
JWT_REFRESH_TOKEN_TTL_DAYS
RP_NAME
RP_ID
RP_ORIGIN
TOTP_WINDOW
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
MINIO_BUCKET_NAME
MINIO_ENDPOINT
MINIO_PUBLIC_ENDPOINT or CDN_PUBLIC_BASE_URL
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_REQUIRE_TLS
MAIL_FROM
MAIL_REPLY_TO
CASL_SENDER_NAME
CASL_SENDER_MAILING_ADDRESS
CASL_SENDER_CONTACT
```

Mail-routing variables should additionally be configured for whichever
workflows are enabled.

Plausible variables are optional.

`ENABLE_API_DOCS` should normally remain:

```dotenv
ENABLE_API_DOCS=false
```

unless there is an explicit operational reason to expose the API documentation.

## Secret Management

The following values must be treated as secrets:

```text
MONGO_URI
JWT_SECRET
MINIO_ACCESS_KEY
MINIO_SECRET_KEY
ADMIN_PASSWORD
```

Other values may also contain sensitive internal information depending on the
deployment.

Do not:

* commit real secrets;
* put production credentials in `.env.example`;
* paste production secrets into documentation;
* expose internal service URLs unnecessarily;
* include secrets in logs;
* include secrets in pull-request descriptions.

Use local `.env` files, Komodo secrets/environment configuration, or an
approved secret manager instead.

## Changing Configuration

When adding a new environment variable:

1. Add it to `.env.example`.
2. Document it in this file.
3. Add a safe default where appropriate.
4. Do not add a real credential as an example.
5. Update deployment configuration where required.
6. Update tests if the variable affects testable behavior.
7. Include all related changes in the same pull request.

When removing or renaming an environment variable, verify all active
deployments before removing compatibility with the previous name.

Environment-variable renames may be breaking deployment changes and should not
be performed silently.
