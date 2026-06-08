.PHONY: compose-config up down api-build api-test api-vet execution-api-test artifact-service-test report-service-test frontend-lint frontend-build frontend-e2e smoke phase1-7-smoke e2e-phase1-7

compose-config:
	docker compose config

up:
	docker compose up --build

down:
	docker compose down

api-build:
	cd api && go build ./...

api-test:
	cd api && go test ./...

api-vet:
	cd api && go vet ./...

execution-api-test:
	cd execution-api && python3 -m pytest -q

artifact-service-test:
	cd artifact-service && python3 -m pytest -q

report-service-test:
	cd report-service && python3 -m pytest -q

frontend-lint:
	cd frontend && npm run lint

frontend-build:
	cd frontend && npm run build

frontend-e2e:
	cd frontend && FRONTEND_E2E_PORT=$${FRONTEND_E2E_PORT:-3101} npm run test:e2e

smoke:
	curl -fsS http://localhost:$${API_PORT:-8080}/health
	curl -fsS http://localhost:$${EXECUTION_API_PORT:-8090}/internal/health
	curl -fsS http://localhost:$${ARTIFACT_SERVICE_PORT:-8091}/internal/health
	curl -fsS http://localhost:$${REPORT_SERVICE_PORT:-8092}/internal/health
	curl -fsS http://localhost:$${FRONTEND_PORT:-3000}/

phase1-7-smoke:
	python3 scripts/smoke_phase1_7.py

e2e-phase1-7: api-build api-vet api-test execution-api-test artifact-service-test report-service-test frontend-lint frontend-build frontend-e2e compose-config
	FRONTEND_PORT=$${FRONTEND_PORT:-3100} docker compose up --build -d --wait
	python3 scripts/smoke_phase1_7.py
