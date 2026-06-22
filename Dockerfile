FROM node:20-slim

# Install curl for the HEALTHCHECK
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

RUN groupadd -r nodeuser && useradd -r -g nodeuser nodeuser

WORKDIR /usr/src/app/server

# Copy package files and change ownership so the non-root user can run npm install
COPY --chown=nodeuser:nodeuser server/package*.json ./
RUN npm install

# Copy the rest of the application
COPY --chown=nodeuser:nodeuser server/ .

USER nodeuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s \
  CMD curl -f http://localhost:3000/api/data || exit 1

CMD ["node", "server.js"]