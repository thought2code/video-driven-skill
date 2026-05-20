<p align="center">
  <strong>English</strong> · <a href="README.zh-CN.md">简体中文</a>
</p>

<h1 align="center">Video Driven Skill</h1>

<p align="center">
  <strong>Automate from how you actually work.</strong>
</p>
<p align="center">
  Turn screen recordings into skills you can run, edit, and reuse.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> · <a href="#features">Features</a> · <a href="#architecture">Architecture</a> · <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Java-17-orange?logo=openjdk&logoColor=white" alt="Java 17">
  <img src="https://img.shields.io/badge/Spring_Boot-4.1-6DB33F?logo=springboot&logoColor=white" alt="Spring Boot 4.1">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white" alt="Vite 8">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4">
  <img src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" alt="SQLite">
  <img src="https://img.shields.io/badge/FFmpeg-007808?logo=ffmpeg&logoColor=white" alt="FFmpeg">
  <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License">
</p>

---

## Overview

Video Driven Skill is an open-source automation studio that transforms **screen recordings** into **runnable, editable skill packages**. Upload a video, extract key frames, annotate intent, let a multimodal AI model draft the skill — then refine, run, version, archive, and export it.

The project is designed for teams and individuals who want automation to start from **how work is actually performed**, not from a blank script editor.

> **Workflow:** Record the process → Pick the frames that matter → Annotate intent → Generate a skill → Review & run → Export & deploy

---

## Features

- **Video-to-Skill Pipeline** — Upload an operation recording and automatically convert it into a structured skill package with `SKILL.md`, `package.json`, scripts, and variables.
- **Smart Frame Extraction** — Auto-extract key frames via FFmpeg, or manually capture the moments that matter.
- **Visual Annotation** — Mark up frames with arrows, notes, and corrections to tell the AI exactly what to do.
- **Multimodal AI Generation** — Leverages any OpenAI-compatible vision model to generate browser, Android, iOS, or desktop automation code.
- **In-Browser Code Editor** — Review, edit, and refine generated code with syntax highlighting and variable management.
- **Incremental Regeneration** — Regenerate the full skill or just a selected code range, with diff review between versions.
- **Local Skill Runner** — Run skills directly with streamed logs and optional screenshots.
- **Skill Repository** — Browse, search, import, export (ZIP), and drag-to-reorder your skill collection.
- **Knowledge Base** — Attach reference images, documents, and notes to each skill for richer context.
- **Archive System** — Preserve videos, frames, and requirements for building future skills from past material.

---

## Quick Start

### Docker (recommended)

First, install [Docker](https://docs.docker.com/get-docker/).

Pick the path that matches your goal:

| I want to…                                                       | You need           | Steps                                              |
|------------------------------------------------------------------|--------------------|----------------------------------------------------|
| **Run the app quickly** — no Git, no local build                 | Docker only        | [Pre-built images](#pre-built-images-end-users)    |
| **Hack on the code** — latest `main`, or China mirror for builds | Docker + Git clone | [Build from source](#build-from-source-developers) |

---

#### Pre-built images (end users)

**What this does:** Downloads `docker-compose.release.yml` and `.env` into a fixed folder, pulls **ready-made** images from GitHub Container Registry (GHCR), and starts the stack. You do **not** clone this repository.

**Install location**

| OS            | Default directory                  |
|---------------|------------------------------------|
| macOS / Linux | `~/video-driven-skill`             |
| Windows       | `%USERPROFILE%\video-driven-skill` |

**1. Install and start**

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/ingorewho/video-driven-skill/main/scripts/install.sh | bash
```

Windows (PowerShell):

```powershell
irm https://raw.githubusercontent.com/ingorewho/video-driven-skill/main/scripts/install.ps1 | iex
```

If you already cloned the repo, run `./scripts/install.sh` or `.\scripts\install.ps1` from the project instead.

The script pulls images, starts containers, and opens `http://localhost:3000` when the UI is ready.

**2. Configure AI (required for generation features)**

On first run, `.env` is created from `.env.example`. Edit it and set:

```env
AI_API_KEY=your-key-here
```

**3. Choose a version (optional)**

| Tag                | When to use                                                                          |
|--------------------|--------------------------------------------------------------------------------------|
| `latest` (default) | Track the newest [release](https://github.com/ingorewho/video-driven-skill/releases) |
| `v1.0.0` (example) | Pin a specific release in production                                                 |

```bash
./scripts/install.sh --tag v1.0.0
```

Or set `VD_SKILL_IMAGE_TAG=v1.0.0` when running `docker compose -f docker-compose.release.yml …`.

**How images are published**

- Registry: `ghcr.io/ingorewho/video-driven-skill-backend` and `ghcr.io/ingorewho/video-driven-skill-frontend`
- **A new image is built only when a version Git tag is pushed** (e.g. `v1.0.0`, `v1.2.3`). Pushes to `main` alone do **not** publish images.
- Tag `latest` on GHCR always points to the **most recent** `v*` release.

> **First release not out yet?** GHCR will have no images until the project tags its first release (e.g. `v1.0.0`). Until then, use [build from source](#build-from-source-developers) below.

**Install script options**

| Option      | Description                                       | Default                |
|-------------|---------------------------------------------------|------------------------|
| `--dir`     | Install directory                                 | `~/video-driven-skill` |
| `--tag`     | Image tag on GHCR (`latest` or `v1.0.0`, …)       | `latest`               |
| `--port`    | Web UI port                                       | `3000`                 |
| `--ref`     | Git ref used to download compose / `.env.example` | `main`                 |
| `--no-open` | Do not open the browser when ready                | off                    |

**Manual install (no install script)**

```bash
mkdir -p ~/video-driven-skill && cd ~/video-driven-skill
curl -fsSL https://raw.githubusercontent.com/ingorewho/video-driven-skill/main/docker-compose.release.yml -o docker-compose.release.yml
curl -fsSL https://raw.githubusercontent.com/ingorewho/video-driven-skill/main/.env.example -o .env
# Edit .env — set AI_API_KEY
docker compose -f docker-compose.release.yml pull
docker compose -f docker-compose.release.yml up -d
```

**Update to a newer release:** run the install script again, or `docker compose -f docker-compose.release.yml pull && docker compose -f docker-compose.release.yml up -d` with the desired `VD_SKILL_IMAGE_TAG`.

---

#### Build from source (developers)

**What this does:** Clones the repo and **builds** images locally with `docker-compose.yml`. Use this when you are developing, need unreleased `main`, or want the China mirror overlay for faster base-image pulls.

```bash
git clone https://github.com/ingorewho/video-driven-skill.git
cd video-driven-skill
```

**Windows**

```bat
.\scripts\run-in-docker.cmd
```

**macOS / Linux** (make executable once)

```bash
chmod +x scripts/run-in-docker.sh
./scripts/run-in-docker.sh
```

On first run, `.env` is created from `.env.example` — set `AI_API_KEY` before using AI features.

**China — faster local builds** (base images only; does not apply to the GHCR install path above):

```bat
.\scripts\run-in-docker.cmd --cn
```

```bash
./scripts/run-in-docker.sh --cn
```

**Options:** `FRONTEND_PORT=3000` in `.env` to change the UI port; pass `--no-open` to skip opening the browser.

---

## Typical Workflow

1. **Upload** — Upload an operation recording (e.g., a screen capture of a workflow).
2. **Extract Frames** — Auto-extract key frames or manually capture the moments that matter.
3. **Annotate** — Mark up frames with arrows, notes, and corrections.
4. **Describe Intent** — Tell the AI what you want, e.g., "Collect item names from this page and export them."
5. **Generate** — Let the multimodal model produce a complete skill package.
6. **Review & Edit** — Inspect generated code, adjust variables, and refine the output.
7. **Run** — Execute the skill locally with streamed log output.
8. **Iterate** — Regenerate the full skill or just a selected section, with diff comparison.
9. **Export & Deploy** — Package as a ZIP or deploy to your local skill directory.

---

## Architecture

```text
video-driven-skill/
├── backend/                 # Spring Boot — API, video processing, AI, skill runner
├── frontend/                # React + Vite — studio UI
├── docker-compose.yml           # Docker deployment (build from source)
├── docker-compose.release.yml   # GHCR images (no clone)
├── docker-compose.cn.yml        # Optional mirror overlay (local build)
├── ARCHITECTURE.md              # Architecture (English)
├── ARCHITECTURE.zh-CN.md        # Architecture (Chinese)
├── scripts/
│   ├── install.sh / install.ps1     # Install from GHCR (no clone)
│   ├── run-in-docker.cmd / .sh      # Build & run from source
│   └── kill-midscene.sh         # Optional cleanup helper
```

### Backend (Spring Boot / Java 17)

| Module                       | Responsibility                                                   |
|------------------------------|------------------------------------------------------------------|
| `controller/`                | REST API & WebSocket entry points                                |
| `service/VideoService`       | Video upload, FFmpeg frame extraction, streaming                 |
| `service/AIService`          | Prompt construction & multimodal API calls                       |
| `service/SkillService`       | Skill CRUD, import/export, versioning                            |
| `service/SkillRunnerService` | Workspace setup, dependency injection, execution, log collection |
| `service/KnowledgeService`   | Per-skill reference files & manifest                             |
| `model/` & `repository/`     | SQLite-backed domain entities                                    |

Runtime data lives under `~/video-driven-skill/` by default (override with `VIDEO_DRIVEN_SKILL_HOME`; on Windows, the same folder name under your user profile):

- `uploads/` — uploaded videos & extracted frames
- `skills/` — generated skill source files
- `archives/` — reusable video/frame/requirement resources
- `video-driven-skill.db` — SQLite database

With **Docker Compose**, the same layout is stored at `/data` inside the backend container (Compose volume `app-data`), not under `~/video-driven-skill/`. Inspect the host path with `docker volume inspect video-driven-skill_app-data`.

### Frontend (React + Vite + Tailwind CSS)

| Component                                        | Responsibility                        |
|--------------------------------------------------|---------------------------------------|
| `HomePage`                                       | Upload, import, and recent resources  |
| `PlaygroundPage`                                 | Frame annotation & skill workspace    |
| `FrameTimeline` / `FrameAnnotator` / `FrameList` | Visual evidence collection            |
| `AIProcessor`                                    | Generation control & streamed status  |
| `SkillList`                                      | Skill repository with drag-to-reorder |
| `SkillEditor` / `SkillExport` / `SkillRunner`    | Review, export & execution            |
| `RegeneratePanel` / `CodeComparisonView`         | Iteration workflow                    |
| `KnowledgeBasePanel`                             | Extra context per skill               |

### Skill Package Structure

```text
SKILL.md              # Skill intent, instructions, and variable docs
package.json          # Metadata
variables.json        # User-editable runtime inputs
scripts/main.js       # Executable entrypoint
knowledge/            # Optional reference files
```

For a deeper walkthrough, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## API Overview

| Method | Path                                  | Purpose                        |
|--------|---------------------------------------|--------------------------------|
| `POST` | `/api/videos/upload`                  | Upload a video                 |
| `POST` | `/api/videos/{id}/frames/auto`        | Auto-extract frames            |
| `POST` | `/api/videos/{id}/frames/manual`      | Manual frame capture           |
| `GET`  | `/api/videos/{id}/stream`             | Stream uploaded video          |
| `GET`  | `/api/skills`                         | List all skills                |
| `PUT`  | `/api/skills/order`                   | Persist skill ordering         |
| `POST` | `/api/skills/generate`                | Generate a skill               |
| `GET`  | `/api/skills/{id}`                    | Read a skill                   |
| `PUT`  | `/api/skills/{id}/files`              | Update skill files             |
| `GET`  | `/api/skills/{id}/export`             | Export skill as ZIP            |
| `POST` | `/api/skills/{id}/regenerate`         | Generate candidate revision    |
| `POST` | `/api/skills/{id}/partial-regenerate` | Regenerate selected code range |
| `POST` | `/api/skills/{id}/accept`             | Accept candidate revision      |
| `GET`  | `/api/skills/{id}/versions`           | List skill versions            |
| `POST` | `/api/skills/{id}/deploy`             | Deploy skill locally           |

---

## Security & Privacy

This repository is prepared for open-source use:

- No API keys or credentials are committed.
- Local databases, uploads, archives, generated skills, logs, and build outputs are git-ignored.
- Runtime configuration comes from environment variables or local `.env` files.
- **Do not** upload private recordings, credentials, customer data, or production screenshots to any public instance.

If you discover a security issue, please report it responsibly. See [SECURITY.md](SECURITY.md).

---

## License

This project is licensed under the **MIT License**. See [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with care by the <strong>Video Driven Skill</strong> team.
</p>
