# Harness Studio

Phase 1 establishes the self-hosted harness foundation:

- React + TypeScript frontend shell
- Go public/control API with `GET /health`
- PostgreSQL as the source of truth
- Redis for broker/events readiness
- One app-level Docker Compose stack
- Server-level Caddy/Nginx examples outside the app compose

The implementation follows the rules in `.cursor/rules`.

## Service Boundaries

- Go owns product/control APIs and health/readiness checks.
- PostgreSQL owns durable application truth.
- Redis owns broker/event delivery concerns.
- The frontend calls only the Go API.
- Caddy/Nginx owns public ingress at the server level and is not part of this app compose stack.
- Python execution, Celery workers, artifact service, report service, auth, catalog, snapshots, and SSE are later phases.

## Local Setup

```sh
cp .env.example .env
docker compose config
docker compose up --build
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Go API health: `http://localhost:8080/health`

## Commands

```sh
make compose-config
make up
make down
make api-test
make api-vet
make frontend-lint
make frontend-build
make smoke
```

## Volumes

The compose stack declares named volumes for Postgres and Redis:

- `postgres-data`
- `redis-data`

Backups for PostgreSQL and future artifact storage should be handled separately.
