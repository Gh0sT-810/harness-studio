# Contributing to Harness Studio

Thanks for your interest in improving Harness Studio. This guide covers how to set up a dev environment, the quality bar we hold changes to, and how to get a pull request merged.

By contributing, you agree that your contributions are licensed under the project's [AGPL-3.0 license](LICENSE).

## Ways to contribute

- Report bugs and request features via issues (please search first to avoid duplicates).
- Improve documentation — the README, `docs/`, and inline comments.
- Fix bugs or implement features, ideally tied to an open issue.
- Add or extend model adapters under `execution-api/app/adapters`.

For anything large or architectural, please open an issue to discuss the approach before investing in a big PR.

## Development setup

### Prerequisites

- **Docker** and **Docker Compose** — to run the full stack.
- **Go 1.26+** — for `api`.
- **Node 20+** — for `frontend`.
- **Python 3.11+** — for `execution-api`, `artifact-service`, and `report-service`.

### Run the stack

```sh
cp .env.example .env
docker compose config
docker compose up --build
```

The frontend is at http://localhost:3000 and the Go API health check at http://localhost:8080/health. Default local admin credentials are in the [README](README.md#default-local-admin) — they are for local development only.

## Quality gate

**Evidence before assertions.** Do not claim a check passed unless you ran it and read the output. Run the checks relevant to the area you touched, and include the results in your PR description.

### Go API (`api/`)

```sh
cd api
go build ./...
go vet ./...
go test ./...
```

### Python services (`execution-api/`, `artifact-service/`, `report-service/`)

```sh
cd <service>
python3 -m pytest -q
```

### Frontend (`frontend/`)

```sh
cd frontend
npm run lint
npm run build
npm run test:e2e   # Playwright
```

### Compose / deployment changes

```sh
docker compose config
```

Then run the service smoke checks once containers are up:

```sh
make smoke
```

### Full end-to-end gate

Before submitting a substantial change, run the full local verification gate:

```sh
make e2e-phase1-7
```

This builds and tests every service, validates the compose config, starts the stack, and runs `scripts/smoke_phase1_7.py` across the full execution → artifact → report → analytics → registry path.

The `Makefile` exposes individual targets (`make api-test`, `make frontend-lint`, `make report-service-test`, and so on) if you only need to run part of the gate.

## Coding guidelines

- **Respect service boundaries.** The frontend talks only to the Go API. Python services are internal and reached through the Go API. PostgreSQL is the source of truth; Redis handles broker/event delivery. Keep these contracts intact.
- **Match existing style.** Follow the conventions already present in each service (Go idioms in `api`, typed React components in `frontend`, typed FastAPI handlers in the Python services).
- **Never store raw secrets.** Provider and runtime config store `secretRef` names, not API keys. Do not commit `.env` or real credentials.
- **Adapters:** adding a model under an existing provider/protocol should be config-only. A new provider/protocol needs an adapter under `execution-api/app/adapters` plus tests.

## Pull request process

1. **Fork** the repository and create a feature branch from the default branch (e.g. `feature/live-monitor-zoom` or `fix/lease-recovery`).
2. **Make focused commits** with clear messages describing what changed and why.
3. **Run the relevant quality gate** and confirm it passes.
4. **Open a pull request** that:
   - describes the change and the motivation,
   - links any related issue,
   - lists the checks you ran and their results,
   - includes screenshots or recordings for UI changes.
5. **Respond to review feedback.** Keep the PR up to date with the base branch.

### Sign-off (DCO)

We use the [Developer Certificate of Origin](https://developercertificate.org/). Sign off each commit to certify you have the right to submit it under the project's license:

```sh
git commit -s -m "Your message"
```

This appends a `Signed-off-by: Your Name <you@example.com>` trailer to the commit.

## Reporting security issues

Please do not file public issues for security vulnerabilities. See the [Security](README.md#security) section of the README for how to report them privately.

## Code of conduct

Be respectful, constructive, and inclusive. Assume good faith, keep discussion focused on the work, and help make this a welcoming project for contributors of all backgrounds.
