# Phase 1-7 Traceability Matrix

Generated from the current codebase and refreshed `graphify-out/GRAPH_REPORT.md`.

## Graphify Evidence

- Corpus: 164 files.
- Graph: 966 nodes, 1,792 edges.
- Key refreshed communities now include:
  - Go API controllers, services, repositories, event envelopes, and migrations.
  - Python `execution-api`, Celery routes/tasks, iteration repository, and adapter registry.
  - `artifact-service` routes/repository/store.
  - `report-service` repository, report reader/generator, and Redis ready events.
  - Frontend admin model registry, runtime config, live monitor, reports, usage, and leaderboard surfaces.

## Phase Matrix

| Phase | Required capability | Current evidence | E2E status |
| --- | --- | --- | --- |
| 1 | Compose foundation, Postgres, Redis, Go health, React shell, server-level proxy docs, health checks | `docker-compose.yml`, `api/cmd/api/main.go`, `frontend`, `Makefile`, `scripts/smoke_phase1_7.py` | Implemented; smoke covers API health and clean stack entry points |
| 2 | Auth/RBAC bootstrap, catalog schemas, gyms/tasks/batches/executions/iterations, snapshots | `api/db/migrations/0001_phase2_core.sql`, `api/app/services/auth_service.go`, `api/app/repositories/store.go`, `scripts/smoke_phase1_7.py` | Implemented; smoke logs in, creates gym/task/batch, and validates snapshot |
| 3 | Redis Streams, event envelopes, Go SSE, normalized frontend live state, snapshot fallback | `api/app/events/envelope.go`, `api/app/services/event_service.go`, `api/app/http/controllers/batch_controller.go`, `frontend/src/lib/live-batch-store.ts`, `scripts/smoke_phase1_7.py` | Implemented; smoke validates SSE framing and snapshot availability |
| 4 | Python `execution-api`, Celery, worker execution, atomic claim, heartbeat/lease, cancellation, maintenance recovery | `execution-api/app/tasks/execution.py`, `execution-api/app/tasks/maintenance.py`, `execution-api/app/repositories/iterations.py`, `execution-api/app/verification.py`, `docker-compose.yml` | Implemented; tests cover scheduler config, lease recovery, cancellation hydration, adapter output, and verification contracts |
| 5 | Artifact service, artifact metadata, screenshot/log/timeline APIs, Live Monitor playback | `artifact-service/app/routes/internal.py`, `api/app/http/controllers/artifact_controller.go`, `frontend/src/components/live-monitor/*`, `scripts/smoke_phase1_7.py` | Implemented; smoke validates generated files, timeline, screenshot, and archive |
| 6 | Report service, report artifacts, leaderboard, token usage summary and CSV export | `report-service/app/reports/batch.py`, `report-service/app/repository.py`, `api/app/services/analytics_service.go`, `scripts/smoke_phase1_7.py` | Implemented with documented synchronous `/run` tradeoff; smoke validates report JSON/CSV/XLSX, usage, CSV export, and leaderboard |
| 7 | Admin model registry, adapter keys/capabilities, model costs/timeouts/default flags, runtime config screens | `api/db/migrations/0004_phase7_model_registry_admin.sql`, `api/app/services/catalog_service.go`, `api/app/services/execution_service.go`, `execution-api/app/adapters/registry.py`, `frontend/src/pages/admin/RuntimeConfig.tsx`, `scripts/smoke_phase1_7.py` | Implemented; runtime default model affects batch creation, provider tests validate adapter/baseURL/secretRef, and worker uses adapter output/usage |

## Residual Boundaries

1. `make e2e-phase1-7` passes on the rebuilt local stack.
2. Provider-backed adapters (`openai_responses_computer`, `anthropic_computer_use`, `gemini_computer_use`) use the explicit mocked/stub connectivity path unless credentials and real protocol implementations are added.
