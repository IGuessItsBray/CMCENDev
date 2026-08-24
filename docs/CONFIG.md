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

## MinIO and S3-Compatible Object Storage

CMCEN stores uploaded media in MinIO or another S3-compatible service.

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
MINIO_ENDPOINT=http://127.0.0.1:9000
```

Same Docker network:

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

Browser-accessible MinIO or object-storage origin.

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
directly from MinIO.

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

## Public Footer and Legal Contacts

The footer and the public legal pages use the following non-secret variables.
They should name the organization that operates the website and provide
monitored request-handling addresses.

```dotenv
FOOTER_ADDRESS_LABEL=Address:
FOOTER_ADDRESS_LINE_1=Communications & Electronics Association: Care of C&E Branch Office
FOOTER_ADDRESS_LINE_2=Forde Building, Rm 217,
FOOTER_ADDRESS_LINE_3=9 Byng Ave,
FOOTER_ADDRESS_LINE_4=Kingston, ON, K7K 5L3
FOOTER_EMAIL_LABEL=Email:
FOOTER_EMAIL=support@cmcen.ca
LEGAL_CONTACT_EMAIL=legal@cmcen.ca
PRIVACY_CONTACT_EMAIL=privacy@cmcen.ca
SUPPORT_CONTACT_EMAIL=support@cmcen.ca
SECURITY_CONTACT_EMAIL=security@cmcen.ca
```

`FOOTER_ADDRESS_LABEL` and `FOOTER_EMAIL_LABEL` set the two footer labels.
`FOOTER_ADDRESS_LINE_1` through `FOOTER_ADDRESS_LINE_4` are displayed as
separate lines beneath the address label. `FOOTER_EMAIL` is displayed as a
clickable mailto link beneath the email label.

`LEGAL_CONTACT_EMAIL` receives Terms, copyright, account-closure, and legal
notices. `PRIVACY_CONTACT_EMAIL` receives privacy requests and complaints.
`SUPPORT_CONTACT_EMAIL` receives general website and account support requests.
`SECURITY_CONTACT_EMAIL` receives website and account-security concerns. When
`FOOTER_EMAIL` is unset, the footer falls back to `SUPPORT_CONTACT_EMAIL`.
These addresses are public and must be actively monitored. Do not put any
credentials in these values.

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
```

These are deployment metadata rather than normal operator configuration.

They generally should not be manually defined in `server/.env`.

CI or deployment infrastructure may provide them automatically.

## Local Development Example

A typical local configuration using the repository development Compose stack
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

MINIO_ACCESS_KEY=cmcen
MINIO_SECRET_KEY=<local-development-password>
MINIO_BUCKET_NAME=cmcen
MINIO_ENDPOINT=http://127.0.0.1:9000
MINIO_PUBLIC_ENDPOINT=http://127.0.0.1:9000

SMTP_HOST=smtp-relay.gmail.com
SMTP_PORT=587
SMTP_SECURE=starttls
SMTP_REQUIRE_TLS=true

DISABLE_EMAIL_SENDING=true
ENABLE_API_DOCS=true
```

Do not copy development credentials into staging or production.

## Docker Compose Deployment Example

When CMCEN, MongoDB, and MinIO share a Docker network, internal service names
may be used:

```dotenv
MONGO_URI=mongodb://mongo:27017/cmcen
MINIO_ENDPOINT=http://minio:9000
```

The repository's complete `compose.yml` supplies these internal values to the
CMCEN container automatically. Keep the remaining CMCEN configuration in
`server/.env`, and keep Compose-stack settings such as `CMCEN_IMAGE`, MinIO root
credentials, and Plausible's `BASE_URL` and secret in the ignored root `.env`
created from `compose.env.example`.

The Compose stack creates the configured MinIO bucket and uses the same MinIO
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
