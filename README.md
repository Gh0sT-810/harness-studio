# Harness Studio

Phase 6 establishes the self-hosted harness foundation, core metadata model, execution pipeline, artifact service, Live Monitor, reports, leaderboard, and token usage monitoring:

- React + TypeScript frontend shell
- Go public/control API with `GET /health`
- PostgreSQL as the source of truth
- Redis for broker/events readiness
- One app-level Docker Compose stack
- Server-level Caddy/Nginx examples outside the app compose
- Auth/RBAC bootstrap, catalog metadata, batch metadata, execution snapshots, and batch snapshot reads
- Python execution-api, Celery dispatch, execution worker, maintenance worker, heartbeat/lease recovery, and deterministic local runner
- Internal artifact-service over local disk and Postgres metadata
- Playwright screenshot/timeline/log artifact capture
- Live Monitor playback from timeline artifacts and SSE events
- Internal report-service for persisted report jobs and artifact-backed JSON/CSV/Excel batch reports
- Token usage summaries, CSV export, and leaderboard aggregate APIs

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
- `artifact-service` owns local artifact files and metadata; Go proxies public artifact APIs.
- `report-service` owns report job lifecycle, report generation, `report.ready` events, and generated report artifact writes.
- Full provider adapters and Studio/QC workflows are later phases.

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
- Artifact service health: `http://localhost:8091/internal/health`
- Report service health: `http://localhost:8092/internal/health`

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
make artifact-service-test
make report-service-test
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

## Phase 5 Artifact And Live Monitor Smoke

Phase 5 stores worker artifacts under `./data/artifacts` through the internal `artifact-service`; the frontend never reads local paths directly.

Expected per-iteration scope:

```text
iterations/{iterationId}/
  screenshots/
  logs/
  conversation/
  task_responses/
  timeline/
  verification/
```

Creating a batch against a reachable gym URL should produce screenshots, `action_timeline.json`, logs, conversation, response, and verification artifacts. Open the batch run page and choose `Open Live Monitor` on an iteration to replay the captured timeline and browse files.

Public artifact routes are exposed only through the Go API:

```text
GET /api/iterations/{id}/files       # artifact metadata list
GET /api/iterations/{id}/timeline    # action_timeline.json document
GET /api/iterations/{id}/screenshot  # screenshot bytes, defaults to kind=after
GET /api/artifacts/{id}              # raw artifact bytes
GET /api/artifacts/{id}/metadata     # artifact metadata
GET /api/batches/{id}/archive        # ZIP of artifacts whose metadata.batchId matches the batch
```

The internal `artifact-service` owns writes, metadata, local path validation, and archive limits (`ARCHIVE_MAX_FILES`). Workers upload artifacts with `metadata.batchId`, `metadata.executionId`, and `metadata.iterationId` so the Go API can expose snapshots and batch archives without leaking local paths.

## Phase 6 Reports And Analytics Smoke

Phase 6 adds an internal `report-service` that persists `reports.report_jobs`, reads batch execution data, writes generated JSON/CSV/Excel report files through `artifact-service`, and publishes `report.ready` events to the batch Redis stream.

Public report and analytics routes are exposed only through the Go API:

```text
POST /api/reports                 # create a generic report job
GET  /api/reports/{id}            # fetch report job status
POST /api/batches/{id}/report     # create and run a batch report
GET  /api/batches/{id}/report     # latest batch report job
GET  /api/usage/summary           # token/cost summary
GET  /api/usage/export/csv        # token usage CSV export
GET  /api/usage/filters           # available usage filters
GET  /api/leaderboard             # model/gym aggregate metrics
```

Batch snapshots now include report readiness (`status`, `reportJobId`, `artifactId`, timestamps, and `error`) instead of a static placeholder. Token usage is ready for provider adapters through `execution-api` repository helpers; adapters should persist usage after model calls return usage payloads.

## Volumes

The compose stack declares named volumes for Postgres and Redis:

- `postgres-data`
- `redis-data`

Backups for PostgreSQL and `./data/artifacts` should be handled separately.
