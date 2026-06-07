# Harness Studio

Phase 4 establishes the self-hosted harness foundation, core metadata model, and the first execution pipeline:

- React + TypeScript frontend shell
- Go public/control API with `GET /health`
- PostgreSQL as the source of truth
- Redis for broker/events readiness
- One app-level Docker Compose stack
- Server-level Caddy/Nginx examples outside the app compose
- Auth/RBAC bootstrap, catalog metadata, batch metadata, execution snapshots, and batch snapshot reads
- Python execution-api, Celery dispatch, execution worker, maintenance worker, heartbeat/lease recovery, and deterministic local runner

The implementation follows the rules in `.cursor/rules`.

## Service Boundaries

- Go owns product/control APIs and health/readiness checks.
- PostgreSQL owns durable application truth.
- Redis owns broker/event delivery concerns.
- The frontend calls only the Go API.
- Caddy/Nginx owns public ingress at the server level and is not part of this app compose stack.
- Python `execution-api` owns Celery task names, routing, dispatch, cancellation, and worker contracts.
- `worker-execution` claims and runs one iteration at a time with `concurrency=1` and `max-tasks-per-child=1`.
- `worker-maintenance` recovers expired leases and re-enqueues retryable iterations.
- Artifact service, report service, full provider adapters, and Studio/QC workflows are later phases.

## Local Setup

```sh
cp .env.example .env
docker compose config
docker compose up --build
```

Default local endpoints:

- Frontend: `http://localhost:3000`
- Go API health: `http://localhost:8080/health`
- Execution API health: `http://localhost:8090/internal/health`

Default local admin:

- Email: `test@example.com`
- Password: `Test@$1234`

The base admin password is hashed before storage. Rotate these credentials outside local development.

## Commands

```sh
make compose-config
make up
make down
make api-build
make api-test
make api-vet
make execution-api-test
make frontend-lint
make frontend-build
make frontend-e2e
make smoke
```

## Phase 4 Execution Smoke

The first execution worker uses a deterministic local runner. Creating a batch through the UI or `POST /api/batches` should:

1. Create durable `execution.batches`, `execution.executions`, and `execution.iterations` rows in Postgres.
2. Have the Go API call `execution-api` at `POST /internal/batches/{id}/dispatch`.
3. Enqueue one Celery task per dispatchable iteration.
4. Have `worker-execution` claim each iteration, heartbeat its lease, publish live Redis Stream events, and complete the iteration as `passed`.
5. Update the batch snapshot page through existing SSE live state.

Run the local stack with:

```sh
docker compose up --build
```

Then create a batch from `http://localhost:3000/batches` and open its run page. The iteration should transition from `pending` to `executing` to `passed` without frontend polling loops.

## Volumes

The compose stack declares named volumes for Postgres and Redis:

- `postgres-data`
- `redis-data`

Backups for PostgreSQL and future artifact storage should be handled separately.
