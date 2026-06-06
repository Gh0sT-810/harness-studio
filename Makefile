.PHONY: compose-config up down api-build api-test api-vet frontend-lint frontend-build frontend-e2e smoke

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

frontend-lint:
	cd frontend && npm run lint

frontend-build:
	cd frontend && npm run build

frontend-e2e:
	cd frontend && npm run test:e2e

smoke:
	curl -fsS http://localhost:$${API_PORT:-8080}/health
	curl -fsS http://localhost:$${FRONTEND_PORT:-3000}/
