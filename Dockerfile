FROM node:24-slim

# Install curl for the HEALTHCHECK
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

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

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:3000/api/data || exit 1

CMD ["node", "server.js"]
