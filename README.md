# Harness Studio

Phase 7 establishes the self-hosted harness foundation, core metadata model, execution pipeline, artifact service, Live Monitor, reports, leaderboard, token usage monitoring, and admin-managed model registry/runtime config:

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
- Admin Model Registry for provider/model CRUD, adapter keys, cost/capability/timeouts, default model selection, and core runtime config

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
- Full provider API calls and Studio/QC workflows are later phases.

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
make e2e-phase1-7
```

## Phase 1-7 Completion Gate

Run the full local verification gate with:

```sh
make e2e-phase1-7
```

This command runs:

- `go build ./...`, `go vet ./...`, and `go test ./...` in `api`.
- `python3 -m pytest -q` in `execution-api`, `artifact-service`, and `report-service`.
- `npm run lint`, `npm run build`, and `npm run test:e2e` in `frontend`.
- `docker compose config`.
- `FRONTEND_PORT=3100 docker compose up --build -d`.
- `python3 scripts/smoke_phase1_7.py`.

The smoke script logs in as the local admin, verifies health/auth/catalog/batch snapshot/SSE, waits for a real worker iteration, validates screenshots/logs/conversation/task response/verification/timeline artifacts, downloads a screenshot and batch archive, creates a report, downloads JSON/CSV/XLSX report artifacts, verifies token usage summary/CSV export/leaderboard, creates and tests a model provider/model, writes runtime config, and proves runtime default model selection by creating a batch without explicit `modelIds`.

If Docker Desktop reports `input/output error` while reading image blobs, restart Docker Desktop or repair/prune its image store, then rerun `make e2e-phase1-7`. The local unit/build portions can still be run independently while Docker recovers.

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

Batch snapshots now include report readiness (`status`, `reportJobId`, `artifactId`, timestamps, and `error`) instead of a static placeholder. Completed report jobs expose all generated format artifacts under `payload.artifacts` (`json`, `csv`, and `xlsx`) while preserving `generatedArtifactId` for the JSON report. Token usage is ready for provider adapters through `execution-api` repository helpers; deterministic local adapters emit usage so analytics surfaces can be verified e2e.

## Phase 7 Model Registry And Runtime Config Smoke

Phase 7 turns the model catalog into an admin-managed registry. Admins can create/edit providers, create/edit/disable models, test registry configuration, set a provider-scoped default model, and edit core runtime config from `/admin`.

Public authenticated reads remain:

```text
GET /api/models
GET /api/model-providers
```

Admin management routes:

```text
POST /api/model-providers
PUT  /api/model-providers/{id}
POST /api/model-providers/{id}/test
POST /api/models
PUT  /api/models/{id}
POST /api/models/{id}/default
POST /api/models/{id}/test
DELETE /api/models/{id}              # soft-disable
GET  /api/admin/runtime-config
PUT  /api/admin/runtime-config
GET  /api/admin/embedding-config
PUT  /api/admin/embedding-config
```

Supported adapter keys are `local`, `text_only`, `openai_responses_computer`, `anthropic_computer_use`, `gemini_computer_use`, `llm_grader`, and `embedding`. Adding a model under an existing provider/protocol is config-only. Adding a new provider/protocol requires adapter code in `execution-api/app/adapters`.

Do not store raw API keys in Postgres. Provider records store `secretRef` values only, such as `OPENAI_API_KEY`, and runtime/embedding config should follow the same policy.

`worker-execution` now loads selected model/provider metadata with each iteration, resolves the adapter key through the worker adapter registry, passes adapter output into the runner result, executes configured verification contracts, and persists usage payloads. Runtime config can set `defaultModelId`; if batch creation omits `modelIds`, the Go API uses that runtime default or falls back to the registry default model. Provider tests validate supported adapter keys, base URL shape, required `secretRef` values for provider-backed adapters, and a mocked connectivity path. Provider calls remain stubbed until real API credentials and adapter implementations are configured.

## Volumes

The compose stack declares named volumes for Postgres and Redis:

- `postgres-data`
- `redis-data`

Backups for PostgreSQL and `./data/artifacts` should be handled separately.
