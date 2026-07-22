# CMCENDev Agent Instructions

This file is for Codex and other coding agents working in this repository.
Keep it safe to commit: do not put API keys, passwords, tokens, private URLs
that include credentials, certificates, or production secrets here.

## Project Shape

- App root: repository root.
- Server app: `server/`
- Static frontend files: `server/public/`
- Express entrypoint: `server/server.js`
- Docker demo image: root `Dockerfile`
- MongoDB is configured with `MONGO_URI` from environment variables.
- Local secrets live in `server/.env`. Example placeholders live in the root
  `.env.example`.

## Safety Rules

- Never commit real secrets.
- Do not print `.env` contents in final responses.
- Do not overwrite user changes unless explicitly asked.
- Prefer targeted changes over broad rewrites.
- Use `rg` for searching.
- Use `apply_patch` for manual edits.
- Before changing authentication, MFA, roles, permissions, deployment, or data
  models, read the relevant route/model/middleware files first.

## Endpoint Change Requirements

These requirements are mandatory. They are not optional.

- ALWAYS update `docs/API ROUTES.md` and the OpenAPI schema under
  `api/schema/` each time you add a new endpoint or modify an existing endpoint.
- Ensure any new permissions are added to the permission set for roles.
- Ensure new endpoint actions and sensitive operations are tracked in audit
  logs.

## Local Development

Install and run from the authoritative `server/` package:

```sh
cd server
npm ci
cp ../.env.example .env
npm run start:dev
```

Notes:

- The server waits for MongoDB before listening.
- If startup hangs after dotenv output, verify MongoDB connectivity and `MONGO_URI`.
- Default port is `3000` unless `PORT` is set.
- Static pages are served from `server/public/`.

Useful checks from `server/`:

```sh
npm run check
npm test
```

`npm test` runs syntax checks and the Mongo-backed API integration suite. The
integration runner starts an ephemeral MongoDB process and may require local
permission to bind a loopback port.

## Docker Demo Suite

The demo suite is built with the root `Dockerfile`.

Known production-like/staging hostname:

- `cmcen.staging.corebot.ca`

Important deployment note:

- If frontend assets change but the backend route still returns `Cannot POST`
  or `Cannot PATCH`, the running container is likely an older image/process.
  Rebuild and redeploy the Docker image so `server/routes/*.js` is refreshed.

Docker build/deploy commands:

```sh
# TODO: add exact build command
# TODO: add exact image tag convention
# TODO: add exact registry/Forgejo package target if used
```

## Forgejo Workflow

Forgejo instance:

- URL: `https://git.corebot.ca`
- Bot/user account: `Codex`
- Repository: `Eric/CMCENDev`
- Repository URL: `https://git.corebot.ca/Eric/CMCENDev`
- User remote: `origin`
- Codex remote: `codex`
- Codex SSH alias: `git-corebot-codex`
- Forgejo SSH port for Git: `2222`
- Codex remote URL: `ssh://git@git-corebot-codex/Eric/CMCENDev.git`
- `tea` login name: `corebot`
- Target branch for PRs: `main`
- PR assignees for major changes: `Bray` and `Eric`.
- Commit signing: GPG/signoff not required yet.

TODO: teach Codex:

- How to open PRs on Forgejo from this machine, for example web UI, `tea`, API,
  or another CLI
- Required PR title/body format
- How to authenticate without exposing tokens in this file

Branch naming:

```text
feat/<change>
fix/<change>
bug/<change>
```

Use short kebab-case change descriptions, for example:

```text
feat/add-passkey-support
fix/totp-rename-route
bug/login-mfa-choice
```

Commit messages:

```text
feat: add passkey support
fix: repair totp rename route
chore: update agent instructions
deprecate: remove old mfa demo flow
```

For major changes, use this flow:

1. Create a new branch from the current base branch.
2. Commit the change.
3. Push the branch to the `codex` remote.
4. Open a PR to `main`.
5. Assign the PR to `Bray` and `Eric` with `tea --add-assignees`.

After committing, push the commit to the appropriate remote branch before
reporting completion. Open PRs to `main`; do not push directly to `main` unless
explicitly asked.

Expected safe pattern:

```sh
git status --short
git diff --check
git add <changed-files>
git commit -m "<concise message>"
git push codex <branch>
tea pulls create --login corebot --repo Eric/CMCENDev --head <branch> --base main --title "<title>" --description "<body>"
tea pulls edit <pr-number> --login corebot --repo Eric/CMCENDev --add-assignees Bray,Eric
```

Do not place Forgejo tokens or passwords here. Store them in the local Git
credential helper, environment variables, or a secret manager.

Preferred credential handling:

- Use SSH for Git push/pull when possible.
- Store the private SSH key outside the repo, for example `~/.ssh/`.
- Add only the public SSH key to the Forgejo `Codex` account.
- Use the `codex` Git remote for Codex pushes.
- Leave the user's `origin` remote untouched.
- Use macOS Keychain or a password manager for key passphrases and API tokens.
- If an API token is needed for PR creation, keep it outside the repo and load
  it at runtime from a secure local store.
- `tea` is configured with login `corebot` for Forgejo API access.

## Komodo Build And Deploy

Komodo deployment details are not documented yet.

TODO: teach Codex:

- Komodo server URL, without embedded credentials
- Project/resource names
- Build resource name
- Deploy resource name
- Whether deploys are triggered by Git push, webhook, CLI, or API
- Safe command sequence for staging
- Safe command sequence for production
- Required health checks after deployment
- Rollback procedure

Safe placeholder flow:

```sh
# 1. Commit and push to Forgejo
# 2. Trigger Komodo build
# 3. Trigger Komodo deploy
# 4. Check health endpoint
# 5. Smoke test login/MFA/account page
```

Never store Komodo API keys in this file.

## Authentication And MFA Notes

- Login route: `server/routes/auth.js`
- MFA routes: `server/routes/mfa.js`
- Auth middleware: `server/middleware/auth.js`
- User model: `server/models/User.js`
- Account MFA UI: `server/public/dashboard-mfa.js`
- Login UI: `server/public/login.html`

TOTP:

- TOTP is based on the shared secret in MongoDB and current time.
- TOTP is not hostname-bound. Codes should work across localhost and staging
  when both instances use the same MongoDB user document.
- Do not regenerate a TOTP secret for an account that already has enabled TOTP
  unless the user intentionally resets MFA.

Passkeys/WebAuthn:

- Passkeys are hostname/RP-bound.
- `RP_ID` and `RP_ORIGIN` environment settings matter for staging/production.
- Localhost passkeys and staging passkeys may not be interchangeable.

## Environment Variables

Required or commonly used values are documented in `.env.example`, including:

```sh
MONGO_URI=
JWT_SECRET=
PORT=
APP_BASE_URL=
MINIO_ENDPOINT=
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET_NAME=
CDN_PUBLIC_BASE_URL=
RP_NAME=
RP_ID=
RP_ORIGIN=
TOTP_WINDOW=
CONFIG_TOKEN=
```

Use `.env.example` for placeholders only. Use `.env` or deployment secrets for
real values.

## Documentation Gaps

- Add exact registry image tags and publish commands.
- Add Komodo resource names, deployment commands, health checks, and rollback.
- Add unit and integration tests beyond the current syntax-check suite.
