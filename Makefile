.PHONY: dev-backend dev-frontend test build smoke

dev-backend:
	cd backend && uv run uvicorn app.main:app --reload --port 8000

dev-frontend:
	cd frontend && npm run dev

test:
	cd backend && uv run ruff check . && uv run pytest -q
	cd frontend && npm run lint

build:
	cd frontend && npm run build

smoke:
	cd backend && uv run python -m app.smoke
