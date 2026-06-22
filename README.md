# CMCEN — Docker Setup Guide

This guide explains how to build and run your application using Docker.

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your machine

---

## Build the Image

From the root directory of your project, run:

```bash
docker build -t CMCEN .
```

---

## Run the Container

### Option 1: Using an environment file (Recommended)

If you have a `.env` file inside the `server/` folder:

```bash
docker run -p 3000:3000 --env-file ./server/.env -d CMCEN
```

### Option 2: Using the baked-in `.env`

If your `.env` was included during the build via your `Dockerfile`:

```bash
docker run -p 3000:3000 -d CMCEN
```

---

## Useful Commands

| Action | Command |
|---|---|
| List running containers | `docker ps` |
| Stop a container | `docker stop <container_id>` |
| View container logs | `docker logs -f <container_id>` |

---

## Admin Scripts

Utility scripts live in `server/scripts/` and are run from inside the `server/` directory. They all require a valid `MONGO_URI` in your `server/.env`.

```bash
cd server
```

---

### `test-db.js` — Test database connection

Verifies that your MongoDB connection string is correct and lists all collections in the database.

```bash
node scripts/test-db.js
```

---

### `test-auth.js` — Test register & login flow

Registers a randomly-named test user and immediately logs in, printing the JWT token on success. Requires the server to be running on `localhost:3000`.

```bash
node scripts/test-auth.js
```

---

### `list-users.js` — List all users

Prints a table of all registered users with their username, email, account name, role, content areas, and creation date.

```bash
node scripts/list-users.js
```

---

### `list-events.js` — List all events

Prints a summary table of all events. Pass `--full` to also dump the complete record for each event.

```bash
node scripts/list-events.js
node scripts/list-events.js --full
```

---

### `set-user-role.js` — Update a user's role

Sets a user's role by username. For the `author` role, you can optionally provide a comma-separated list of content areas.

```bash
node scripts/set-user-role.js <username> <role> [contentAreas]
```

**Examples:**

```bash
# Promote a user to admin
node scripts/set-user-role.js johndoe administrator

# Set a user as an author with specific content areas
node scripts/set-user-role.js janedoe author "news,events"
```

Valid roles are defined in `server/config/roles.js`.

Available Roles:
 - subscriber
 - contributor
 - author
 - editor
 - administrator

---

## Notes

- Ensure your `server.js` loads environment variables via `dotenv`:

  ```js
  require('dotenv').config();
  ```

  This should appear at the **top** of your `server.js` file before any other imports.