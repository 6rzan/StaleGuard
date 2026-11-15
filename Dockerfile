# Stage 1: build the frontend bundle.
FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: backend serving the API and the built frontend.
FROM python:3.12-slim
# Pick up Debian security fixes published after the base image was built.
RUN apt-get update && apt-get upgrade -y && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir uv==0.13.5
ENV UV_PYTHON_DOWNLOADS=never \
    UV_COMPILE_BYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev
COPY backend/ ./
# main.py serves <repo root>/frontend/dist, i.e. /app/frontend/dist here.
COPY --from=frontend /src/frontend/dist /app/frontend/dist
ENV PATH="/app/backend/.venv/bin:$PATH"
# Unprivileged user. The data dir exists in the image so a fresh named volume inherits its owner.
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app     && mkdir -p /app/backend/data && chown app:app /app/backend/data
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
