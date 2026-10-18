# Multi-Stage Production Dockerfile for ROOTLINE OMNI
# Stage 1: Build React/Vite Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: Python 3.12 Non-Root Runner
FROM python:3.12-slim AS runner
WORKDIR /app

# Security: Install minimal runtime dependencies & create non-root user
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 appuser

# Install Python dependencies
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code and compiled frontend assets
COPY backend/ ./backend/
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Switch to non-root user
USER appuser

# Environment defaults
ENV PYTHONUNBUFFERED=1 \
    PORT=8000 \
    FALKORDB_HOST=falkordb \
    FALKORDB_PORT=6379 \
    ROOTLINE_GRAPH=rootline

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
