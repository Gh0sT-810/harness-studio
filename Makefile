.PHONY: compose-config up down api-build api-test api-vet execution-api-test frontend-lint frontend-build frontend-e2e smoke

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

frontend-lint:
	cd frontend && npm run lint

frontend-build:
	cd frontend && npm run build

frontend-e2e:
	cd frontend && npm run test:e2e

smoke:
	curl -fsS http://localhost:$${API_PORT:-8080}/health
	curl -fsS http://localhost:$${EXECUTION_API_PORT:-8090}/internal/health
	curl -fsS http://localhost:$${FRONTEND_PORT:-3000}/
