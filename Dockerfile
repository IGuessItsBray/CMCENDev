FROM mongo:7 AS mongo-tools
FROM node:24-slim

# Install health-check and PostgreSQL backup tools.
RUN apt-get update && apt-get install -y curl postgresql-client && rm -rf /var/lib/apt/lists/*
COPY --from=mongo-tools /usr/bin/mongodump /usr/local/bin/mongodump

RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser

WORKDIR /usr/src/app/server

# Install production dependencies from the authoritative server lockfile.
COPY --chown=nodeuser:nodeuser server/package*.json ./
RUN npm ci --omit=dev

# Copy the application and the OpenAPI schema served in development mode.
COPY --chown=nodeuser:nodeuser server/ .
COPY --chown=nodeuser:nodeuser api/schema/ /usr/src/app/api/schema/
# The developer page serves this repository-level file at /changelog.md.
COPY --chown=nodeuser:nodeuser CHANGELOG.md /usr/src/app/CHANGELOG.md
RUN mkdir -p /usr/src/app/server/data/backups && chown nodeuser:nodeuser /usr/src/app/server/data/backups && chmod 700 /usr/src/app/server/data/backups

# HTML in the production image references content-hashed static assets. This
# lets browsers cache CSS and JavaScript indefinitely without seeing stale code
# after a later image deployment.
RUN node scripts/quality/build-static-assets.js --rewrite-html

# Git history is excluded from images; CI supplies the running build identity.
ARG COMMIT_SHA=""
ARG RELEASE_VERSION=""
ENV COMMIT_SHA=${COMMIT_SHA} RELEASE_VERSION=${RELEASE_VERSION}

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:3000/api/data || exit 1

CMD ["node", "server.js"]
