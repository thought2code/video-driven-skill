# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Video Driven Skill is a two-service app (Java backend + React frontend) that transforms screen recordings into runnable automation skill packages.

### Services

| Service | Directory | Dev command | Port |
|---------|-----------|-------------|------|
| Backend (Spring Boot) | `backend/` | `./mvnw spring-boot:run -DskipTests` | 8080 |
| Frontend (Vite + React) | `frontend/` | `npm run dev` | 3000 |

The Vite dev server proxies `/api` and `/ws` to the backend at `localhost:8080` (configured in `frontend/vite.config.js`).

### Startup order

Start the backend first — the frontend proxies API calls to it. The backend creates its SQLite DB and data directories automatically on first run at `~/video-driven-skill/`.

### Lint & format

- **Backend**: `cd backend && ./mvnw spotless:check` (Google Java Format). Auto-fix with `./mvnw spotless:apply`.
- **Frontend**: No dedicated lint script configured; use `npm run build` to catch TypeScript/build errors.

### Tests

- **Backend**: `cd backend && ./mvnw test` (no test sources currently present).
- **Frontend**: No test framework configured.

### Build

- **Backend**: `cd backend && ./mvnw -DskipTests package` produces a fat JAR in `target/`.
- **Frontend**: `cd frontend && npm run build` produces static assets in `dist/`.

### Key gotchas

- The Maven enforcer plugin requires Java 17+. The environment has Java 21, which is compatible.
- The backend uses Spring Boot 4.1 RC1 with the Spring milestone repository configured in the Maven wrapper properties. First-time dependency resolution takes ~20s.
- FFmpeg must be on `PATH` for video frame extraction. The `FFMPEG_PATH` env var can override this.
- AI generation features require `AI_API_KEY`, `AI_BASE_URL`, and `AI_MODEL` env vars (or `.env` file). The app still works without them for upload/extract/edit/run workflows.
- The backend `runner.timeout` defaults to 600 seconds for skill execution.
