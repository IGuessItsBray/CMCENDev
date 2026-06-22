# Docker Setup Guide

This guide explains how to build and run the CMCEN site using Docker.

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

## Notes

- Ensure your `server.js` loads environment variables via `dotenv`:

  ```js
  require('dotenv').config();
  ```

  This should appear at the **top** of your `server.js` file before any other imports.