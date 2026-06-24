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

The `server/scripts/admin.js` script provides utilities for user management, event inspection, authentication, and diagnostics. Run all commands from the `server/` directory:

```bash
cd server
```

---

### User Management

#### List all users
```bash
node admin.js list-users
```
Displays a table of all registered users with details.

#### Search users
```bash
node admin.js search <query>
```
Searches by username, email, or name. **Requires server running on `localhost:3000`.**

**Example:**
```bash
node admin.js search johndoe
```

#### Set user role (direct database)
```bash
node admin.js set-role <username> <role> [contentAreas]
```
Updates a user's role directly in the database. **No server needed.**

**Arguments:**
- `<username>` — Username to update
- `<role>` — One of: `subscriber`, `contributor`, `author`, `editor`, `admin`
- `[contentAreas]` — *Optional* comma-separated content areas (authors only)

**Examples:**
```bash
# Set as author with specific content areas
node admin.js set-role johndoe author science,health

# Promote to admin (clears content areas automatically)
node admin.js set-role johndoe admin
```

#### Promote user (via API)
```bash
node admin.js promote <userId> <role>
```
Updates a user's role through the API. **Requires server running on `localhost:3000`.**

**Arguments:**
- `<userId>` — MongoDB user ID
- `<role>` — New role to assign

**Example:**
```bash
node admin.js promote 64a1b2c3d4e5f6g7h8i9j0k1 author
```

---

### Events

#### List all events
```bash
# Summary table
node admin.js list-events

# Full details for every event
node admin.js list-events --full
```

---

### Auth & Tokens

#### Generate admin JWT token
```bash
node admin.js token
```
Generates a 24-hour admin JWT token. Useful for testing API calls in Postman or curl.

---

### Diagnostics

#### Test database connection
```bash
node admin.js test-db
```
Confirms MongoDB connection and lists all collections. **No server needed.**

#### Test auth flow
```bash
node admin.js test-auth
```
Registers a throwaway test user and logs in. **Requires server running on `localhost:3000`.**

#### Test full upload flow
```bash
node admin.js test-upload
```
Complete smoke test: register → login → upload image. **Requires server running on `localhost:3000`.**

---

## Notes

- Ensure your `server.js` loads environment variables via `dotenv`:

  ```js
  require('dotenv').config();
  ```

  This should appear at the **top** of your `server.js` file before any other imports.