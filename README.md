# Harness Studio

**A self-hosted platform for evaluating vision-language and computer-use agents against real browser tasks.**

Harness Studio runs AI agents through browser-based UI challenges ("gyms"), captures everything they do — screenshots, action timelines, logs, and model conversations — and turns the results into replayable sessions, reports, and leaderboards. It ships as a small fleet of services you can stand up with a single `docker compose up`.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.26-00ADD8.svg?logo=go&logoColor=white)](api/go.mod)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white)](execution-api/pyproject.toml)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react&logoColor=black)](frontend/package.json)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose-2496ED.svg?logo=docker&logoColor=white)](docker-compose.yml)

---

## Table of contents

- [Why Harness Studio](#why-harness-studio)
- [Features](#features)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Core concepts](#core-concepts)
- [API reference](#api-reference)
- [Project structure](#project-structure)
- [Development and testing](#development-and-testing)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Why Harness Studio

Benchmarking computer-use agents is painful: you need to drive a real browser, run many tasks in parallel, capture enough evidence to debug a failure, and compare models on cost and accuracy over time. Harness Studio packages that whole loop — orchestration, execution, artifact capture, replay, and analytics — into one self-hostable stack so you can focus on the agents and the tasks, not the plumbing.

It is built for ML and evaluation engineers, agent developers, and teams who need a private, reproducible harness for vision-language model (VLM) and computer-use evaluation.

## Features

- **Gym and task catalog** — Organize evaluation tasks into gyms, with metadata, auth/RBAC, and a catalog importer for bulk loading.
- **Batch execution pipeline** — Create a batch and the system fans it out into per-task iterations, dispatched through Celery to isolated workers (`concurrency=1`, one task per child) with lease-based recovery for crashed runs.
- **Rich artifact capture** — Each iteration records screenshots, an `action_timeline.json`, logs, the full model conversation, task responses, and verification results via Playwright.
- **Live Monitor** — Replay a run frame-by-frame from its captured timeline, streamed live over Server-Sent Events with no frontend polling.
- **Reports and analytics** — Generate JSON, CSV, and Excel reports per batch, plus token/cost usage summaries, CSV export, and a model/gym leaderboard.
- **Admin model registry** — Manage providers and models from the UI: adapter keys, cost and capability metadata, timeouts, connectivity tests, default-model selection, and core runtime config.
- **Pluggable adapters** — Built-in adapter keys for deterministic local runs, text-only models, OpenAI / Anthropic / Gemini computer-use protocols, an LLM grader, and embeddings.
- **Secret-safe by design** — Provider records store secret *references* (e.g. `OPENAI_API_KEY`), never raw API keys, in the database.
- **One compose stack** — All application services run from a single `docker-compose.yml`; public ingress (Caddy/Nginx) is configured separately at the server level.

## Architecture

Harness Studio is a set of focused services that communicate over HTTP, PostgreSQL, and Redis. The Go API is the only public surface for the frontend; Python services are internal.

```mermaid
flowchart TB
    user([User / Browser])
    ingress["Caddy / Nginx<br/>(server-level ingress)"]
    gym([Target gym URL<br/>browser task])

    subgraph app["Docker Compose application stack"]
        fe["frontend<br/>React + Vite"]
        api["api<br/>Go / Gin — public + control API"]
        exec["execution-api<br/>Python / FastAPI — dispatch + cancel"]
        we["worker-execution<br/>Celery"]
        wm["worker-maintenance<br/>Celery"]
        ws["worker-scheduler<br/>Celery beat"]
        art["artifact-service<br/>Python / FastAPI"]
        rep["report-service<br/>Python / FastAPI"]
        pg[("PostgreSQL<br/>source of truth")]
        rd[("Redis<br/>broker + event streams")]
    end

    user --> ingress --> fe
    fe -->|REST + SSE| api
    api -->|dispatch| exec
    api --> pg
    api -->|live events| rd
    api -->|proxy artifacts| art
    api -->|create reports| rep
    exec -->|enqueue| rd
    we -->|claim iterations| rd
    wm -->|recover leases| rd
    ws -->|schedule| rd
    we -->|run agent| gym
    we -->|upload artifacts| art
    we --> pg
    rep --> art
    rep -->|report.ready| rd
    art --> pg
    rep --> pg
```

### Service boundaries

| Service | Stack | Responsibility |
|---|---|---|
| `frontend` | React 19, TypeScript, Vite, Tailwind | UI; talks **only** to the Go API |
| `api` | Go 1.26, Gin, pgx, JWT | Public + control APIs, health/readiness, auth/RBAC, proxies internal services |
| `execution-api` | Python 3.11+, FastAPI, Celery | Task names, routing, dispatch, cancellation, worker contracts |
| `worker-execution` | Celery | Claims and runs one iteration at a time; heartbeats its lease; emits live events |
| `worker-maintenance` | Celery | Recovers expired leases and re-enqueues retryable iterations |
| `worker-scheduler` | Celery beat | Periodic maintenance scheduling |
| `artifact-service` | Python, FastAPI | Owns artifact files on local disk + Postgres metadata; archive limits |
| `report-service` | Python, FastAPI, openpyxl | Report job lifecycle, JSON/CSV/Excel generation, `report.ready` events |
| `PostgreSQL` | — | Durable application truth |
| `Redis` | — | Broker and event/SSE delivery |
| `Caddy` / `Nginx` | — | Public ingress at the server level, **outside** the app compose stack |

The frontend never reads local artifact paths directly — public artifact routes are exposed only through the Go API, which proxies the internal `artifact-service`.

## Quick start

### Prerequisites

- **Docker** and **Docker Compose** (the only requirement to run the full stack).
- For working on individual services outside compose: **Go 1.26+**, **Node 20+**, and **Python 3.11+**.

### Run the stack

```sh
# 1. Clone (replace with your fork/repo URL)
git clone https://github.com/your-org/harness-studio.git
cd harness-studio

# 2. Create your local environment file
cp .env.example .env

# 3. Validate and launch
docker compose config
docker compose up --build
```

### Default endpoints

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Go API health | http://localhost:8080/health |
| Execution API health | http://localhost:8090/internal/health |
| Artifact service health | http://localhost:8091/internal/health |
| Report service health | http://localhost:8092/internal/health |

### Default local admin

```
Email:    test@example.com
Password: Test@$1234
```

The bootstrap admin password is hashed before storage. **These are local development credentials only — rotate them and set a real `JWT_SECRET` before exposing the stack anywhere.**

## Configuration

All configuration is via environment variables; copy `.env.example` to `.env` and adjust. Key settings:

| Variable | Purpose | Default |
|---|---|---|
| `FRONTEND_PORT` / `API_PORT` | Host ports for the UI and Go API | `3000` / `8080` |
| `EXECUTION_API_PORT` / `ARTIFACT_SERVICE_PORT` / `REPORT_SERVICE_PORT` | Internal service ports | `8090` / `8091` / `8092` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://harness:...@postgres:5432/harness` |
| `REDIS_URL` / `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Redis + Celery wiring | `redis://redis:6379/{0,1,2}` |
| `ARTIFACT_ROOT` | On-disk artifact directory | `/data/artifacts` |
| `ARCHIVE_MAX_FILES` | Max files per batch archive | `1000` |
| `LEASE_SECONDS` / `HEARTBEAT_SECONDS` / `MAX_ATTEMPTS` | Worker lease, heartbeat, retry budget | `60` / `5` / `2` |
| `DEFAULT_MODEL_ADAPTER_KEY` | Adapter used when none is specified | `text_only` |
| `JWT_SECRET` | Auth signing secret — **change this** | `local-dev-secret-change-me` |
| `CORS_ORIGIN` | Allowed frontend origins | `http://localhost:3000,...` |
| `BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD` | First admin account | `test@example.com` / `Test@$1234` |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` | Provider keys, referenced by `secretRef` | *(empty)* |

> **Secrets policy:** Do not store raw API keys in PostgreSQL. Provider and runtime/embedding config store `secretRef` names (such as `OPENAI_API_KEY`) that resolve to environment variables at runtime.

## Core concepts

**Gyms and tasks.** A *gym* is a collection of *tasks* — individual browser challenges an agent must complete. You can create them in the UI or bulk-import a catalog with `scripts/import_turing_gyms.py`.

**Batches and iterations.** A *batch* runs a selection of tasks against one or more models. The API creates durable `batches`, `executions`, and `iterations` rows, then asks `execution-api` to dispatch one Celery task per runnable iteration. Each iteration moves `pending → executing → passed/failed`, with the batch run page updating live over SSE.

**Artifacts.** Every iteration writes a scoped artifact tree through the internal `artifact-service`:

```text
iterations/{iterationId}/
  screenshots/
  logs/
  conversation/
  task_responses/
  timeline/        # action_timeline.json
  verification/
```

**Live Monitor.** Open a running or completed iteration and choose **Open Live Monitor** to replay its captured timeline and browse the files it produced.

**Reports and analytics.** Generate a report for a batch (JSON, CSV, and Excel) and explore token/cost usage and a model/gym leaderboard. The deterministic local adapter emits usage data so analytics can be verified end-to-end before wiring real providers.

**Model registry.** Admins manage providers and models from `/admin`: create/edit providers, add/disable models, set a provider-scoped default, edit core runtime config, and run connectivity tests. Adding a model under an existing provider/protocol is config-only; a new provider/protocol requires an adapter in `execution-api/app/adapters`.

Supported adapter keys: `local`, `text_only`, `openai_responses_computer`, `anthropic_computer_use`, `gemini_computer_use`, `llm_grader`, and `embedding`.

## API reference

All public routes are served by the Go API. A condensed map:

**Artifacts**

```text
GET /api/iterations/{id}/files       # artifact metadata list
GET /api/iterations/{id}/timeline    # action_timeline.json document
GET /api/iterations/{id}/screenshot  # screenshot bytes (defaults to kind=after)
GET /api/artifacts/{id}              # raw artifact bytes
GET /api/artifacts/{id}/metadata     # artifact metadata
GET /api/batches/{id}/archive        # ZIP of the batch's artifacts
```

**Reports and analytics**

```text
POST /api/reports                 # create a generic report job
GET  /api/reports/{id}            # report job status
POST /api/batches/{id}/report     # create and run a batch report
GET  /api/batches/{id}/report     # latest batch report job
GET  /api/usage/summary           # token/cost summary
GET  /api/usage/export/csv        # token usage CSV export
GET  /api/usage/filters           # available usage filters
GET  /api/leaderboard             # model/gym aggregate metrics
```

**Model registry**

```text
GET    /api/models                   # authenticated read
GET    /api/model-providers          # authenticated read
POST   /api/model-providers          # admin: create provider
PUT    /api/model-providers/{id}     # admin: edit provider
POST   /api/model-providers/{id}/test
POST   /api/models                   # admin: create model
PUT    /api/models/{id}              # admin: edit model
POST   /api/models/{id}/default      # admin: set default model
POST   /api/models/{id}/test
DELETE /api/models/{id}              # admin: soft-disable
GET/PUT /api/admin/runtime-config
GET/PUT /api/admin/embedding-config
```

## Project structure

```text
harness-studio/
├── api/                 # Go public + control API (Gin)
│   ├── app/             # config, events, http, models, repositories, services, utils
│   ├── cmd/api/         # entrypoint
│   └── openapi/         # API specs
├── execution-api/       # Python FastAPI + Celery workers
│   └── app/adapters/    # model adapters (base, cua, registry)
├── artifact-service/    # Python FastAPI artifact store
├── report-service/      # Python FastAPI report generation
├── frontend/            # React + TypeScript + Vite UI
│   └── src/pages/       # Batches, Gyms, Tasks, Reports, Leaderboard, Models, Admin, ...
├── deploy/              # Caddy / Nginx ingress examples
├── scripts/             # catalog importer, smoke tests
├── docs/                # design and feature notes
├── docker-compose.yml   # the application stack
└── Makefile             # common dev/test targets
```

## Development and testing

Common targets (see the `Makefile` for the full list):

```sh
make up                      # docker compose up --build
make down                    # docker compose down
make api-build               # go build ./...
make api-test                # go test ./...
make api-vet                 # go vet ./...
make execution-api-test      # pytest in execution-api
make artifact-service-test   # pytest in artifact-service
make report-service-test     # pytest in report-service
make frontend-lint           # eslint
make frontend-build          # type-check + vite build
make frontend-e2e            # Playwright end-to-end tests
make smoke                   # curl all health endpoints
```

### End-to-end verification

```sh
make e2e-phase1-7
```

This gate builds and tests every service, validates the compose config, starts the stack, and runs `scripts/smoke_phase1_7.py`, which logs in as the local admin and exercises the full path: health/auth/catalog, a real worker iteration, artifact capture (screenshots, logs, conversation, response, verification, timeline), screenshot and batch-archive downloads, report creation with JSON/CSV/XLSX downloads, token-usage summary/CSV/leaderboard, provider/model creation and testing, runtime config writes, and default-model selection.

> If Docker reports an `input/output error` reading image blobs, restart Docker (or prune/repair its image store) and rerun. The unit/build portions can run independently while Docker recovers.

## Deployment

The application compose stack is self-contained. For production, put **Caddy or Nginx** in front as the public entry point and proxy to the services — example configs live in [`deploy/`](deploy/). See [`deploy/README.md`](deploy/README.md) for details.

The stack declares named volumes for stateful services:

- `postgres-data`
- `redis-data`

Back up PostgreSQL and the `./data/artifacts` directory separately; they are not covered by container lifecycle.

## Roadmap

Harness Studio currently ships a deterministic local runner and stubbed provider calls so the full pipeline can be verified without credentials. Planned and in-progress work:

- Full provider API calls behind the existing computer-use adapters.
- Studio / QC review workflows.
- Expanded grading and verification contracts.

Provider calls remain stubbed until real API credentials and adapter implementations are configured.

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, the quality gate (evidence before assertions — run the checks and read the output), and pull-request expectations. By contributing you agree to license your work under AGPL-3.0.

## Security

Do not open public issues for security vulnerabilities. Never commit real API keys — providers reference secrets by name (`secretRef`), and `.env` is git-ignored. Always change `JWT_SECRET` and the bootstrap admin credentials before deploying.

## License

Harness Studio is licensed under the **GNU Affero General Public License v3.0** (AGPL-3.0). See [LICENSE](LICENSE) for the full text.

The AGPL's network clause (section 13) means that **if you run a modified version of Harness Studio as a network service, you must make the modified source code available to its users.** If this does not fit your needs, please reach out about alternative licensing.

© 2026 Harness Studio contributors.
