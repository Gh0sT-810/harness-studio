.PHONY: compose-config up down api-test api-vet frontend-lint frontend-build smoke

compose-config:
	docker compose config

up:
	docker compose up --build

down:
	docker compose down

api-test:
	cd api && go test ./...

api-vet:
	cd api && go vet ./...

frontend-lint:
	cd frontend && npm run lint

frontend-build:
	cd frontend && npm run build

smoke:
	curl -fsS http://localhost:$${API_PORT:-8080}/health
	curl -fsS http://localhost:$${FRONTEND_PORT:-3000}/
