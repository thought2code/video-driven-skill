<p align="center">
  <a href="README.md">English</a> · <strong>简体中文</strong>
</p>

<h1 align="center">Video Driven Skill</h1>

<p align="center">
  <strong>自动化，从真实操作开始。</strong>
</p>
<p align="center">
  把屏幕录屏变成可运行、可编辑、可复用的 Skill。
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> · <a href="#功能特性">功能特性</a> · <a href="#架构说明">架构说明</a> · <a href="#许可证">许可证</a>
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

## 项目简介

Video Driven Skill 是一套开源的**自动化工作室**：把**屏幕录屏**变成**可运行、可编辑的技能包**。上传视频 → 抽取关键帧 → 标注意图 → 多模态 AI 起草技能 → 再审阅、运行、版本化、归档与导出。

适合希望自动化从**真实操作方式**出发，而不是从空白脚本开始的团队与个人。

> **工作流：** 录制流程 → 挑选关键画面 → 标注意图 → 生成技能 → 审阅与运行 → 导出与部署

---

## 功能特性

- **视频到技能流水线** — 上传操作录屏，自动转换为包含 `SKILL.md`、`package.json`、脚本与变量说明的结构化技能包。
- **智能抽帧** — 通过 FFmpeg 自动抽关键帧，也可手动截取重要时刻。
- **可视化标注** — 在画面上用箭头、文字等标注，向 AI 明确「要做什么」。
- **多模态 AI 生成** — 对接任意 **OpenAI 兼容** 的视觉模型，生成浏览器、Android、iOS 或桌面端等自动化代码。
- **浏览器内代码编辑** — 语法高亮、变量管理，就地审阅与修改生成结果。
- **增量重新生成** — 支持整包重生或选中代码片段重生，并可对比版本差异。
- **本地技能运行器** — 本地执行技能，流式日志，可选截图。
- **技能仓库** — 浏览、搜索、导入、导出（ZIP）、拖拽排序管理技能集合。
- **知识库** — 为每个技能附加参考图、文档与笔记，丰富上下文。
- **归档系统** — 保留视频、帧与需求素材，便于日后基于历史物料构建新技能。

---

## 快速开始

### Step 1：安装 Docker

先安装 [Docker](https://docs.docker.com/get-docker/)。

### Step 2：启动 Video Driven Skill

安装脚本会下载发布版 Compose 文件、拉取预构建镜像并启动应用。

#### macOS / Linux

```bash
curl -fsSL https://raw.githubusercontent.com/thought2code/video-driven-skill/main/scripts/install.sh | bash
```

#### Windows

```powershell
irm https://raw.githubusercontent.com/thought2code/video-driven-skill/main/scripts/install.ps1 | iex
```

### Step 3：配置 AI

首次运行后，脚本会在安装目录生成 `.env`。使用 AI 生成功能前，请填写：

```env
AI_API_KEY=你的密钥
```

### Step 4：打开应用

访问 `http://localhost:3000`。

---

## 典型工作流

1. **上传** — 上传操作录屏（如某业务流程的屏幕录像）。
2. **抽帧** — 自动抽关键帧或手动截取重要画面。
3. **标注** — 用箭头、备注等标注意图与修正点。
4. **描述意图** — 用自然语言说明目标，例如：「从本页收集商品名并导出」。
5. **生成** — 由多模态模型生成完整技能包。
6. **审阅与编辑** — 检查代码、调整变量、微调输出。
7. **运行** — 在本地执行技能并查看流式日志。
8. **迭代** — 整包重生或局部重生，并对比差异。
9. **导出与部署** — 打包为 ZIP 或部署到本地技能目录。

---

## 架构说明

```text
video-driven-skill/
├── backend/                 # Spring Boot — API、视频处理、AI、技能运行器
├── frontend/                # React + Vite — 工作室前端
├── docker-compose.yml           # Docker 部署（本地构建）
├── docker-compose.release.yml   # GHCR 预构建镜像（免克隆）
├── docker-compose.cn.yml        # 可选：国内基础镜像加速（本地构建）
├── ARCHITECTURE.md              # 架构说明（英文）
├── ARCHITECTURE.zh-CN.md        # 架构说明（中文）
├── scripts/
│   ├── install.sh / install.ps1     # 从 GHCR 安装（免克隆）
│   ├── run-in-docker.cmd / .sh      # 从源码构建并启动
│   └── kill-midscene.sh         # 可选清理辅助脚本
```

### 后端（Spring Boot / Java 17）

| 模块                           | 职责                      |
|------------------------------|-------------------------|
| `controller/`                | REST API 与 WebSocket 入口 |
| `service/VideoService`       | 视频上传、FFmpeg 抽帧、流式传输     |
| `service/AIService`          | 提示词构建与多模态 API 调用        |
| `service/SkillService`       | 技能 CRUD、导入导出、版本管理       |
| `service/SkillRunnerService` | 工作区准备、依赖注入、执行与日志采集      |
| `service/KnowledgeService`   | 每个技能的参考文件与清单            |
| `model/`、`repository/`       | 基于 SQLite 的领域实体与持久化     |

运行时数据默认位于 `~/video-driven-skill/`（可通过环境变量 `VIDEO_DRIVEN_SKILL_HOME` 覆盖；Windows 下对应用户主目录下的同名文件夹）：

- `uploads/` — 上传视频与抽取帧
- `skills/` — 已生成技能源码
- `archives/` — 可复用的视频 / 帧 / 需求归档
- `video-driven-skill.db` — SQLite 数据库

使用 **Docker Compose** 时，上述目录在容器内挂载为 `/data`（Compose 卷 `app-data`），不由 `~/video-driven-skill/` 提供；可用 `docker volume inspect video-driven-skill_app-data` 查看宿主机路径。

### 前端（React + Vite + Tailwind CSS）

| 组件                                               | 职责         |
|--------------------------------------------------|------------|
| `HomePage`                                       | 上传、导入与最近资源 |
| `PlaygroundPage`                                 | 帧标注与技能工作区  |
| `FrameTimeline` / `FrameAnnotator` / `FrameList` | 可视化证据收集    |
| `AIProcessor`                                    | 生成控制与流式状态  |
| `SkillList`                                      | 技能仓库与拖拽排序  |
| `SkillEditor` / `SkillExport` / `SkillRunner`    | 审阅、导出与执行   |
| `RegeneratePanel` / `CodeComparisonView`         | 迭代与对比      |
| `KnowledgeBasePanel`                             | 每个技能的扩展上下文 |

### 技能包结构

```text
SKILL.md              # 技能意图、说明与变量文档
package.json          # 元数据
variables.json        # 用户可编辑的运行时输入
scripts/main.js       # 可执行入口
knowledge/            # 可选参考文件
```

更细的说明见 [ARCHITECTURE.zh-CN.md](ARCHITECTURE.zh-CN.md)。

---

## API 概览

| 方法     | 路径                                    | 说明        |
|--------|---------------------------------------|-----------|
| `POST` | `/api/videos/upload`                  | 上传视频      |
| `POST` | `/api/videos/{id}/frames/auto`        | 自动抽帧      |
| `POST` | `/api/videos/{id}/frames/manual`      | 手动截帧      |
| `GET`  | `/api/videos/{id}/stream`             | 流式播放已上传视频 |
| `GET`  | `/api/skills`                         | 列出全部技能    |
| `PUT`  | `/api/skills/order`                   | 保存技能排序    |
| `POST` | `/api/skills/generate`                | 生成技能      |
| `GET`  | `/api/skills/{id}`                    | 读取技能      |
| `PUT`  | `/api/skills/{id}/files`              | 更新技能文件    |
| `GET`  | `/api/skills/{id}/export`             | 导出为 ZIP   |
| `POST` | `/api/skills/{id}/regenerate`         | 生成候选修订版   |
| `POST` | `/api/skills/{id}/partial-regenerate` | 局部重新生成    |
| `POST` | `/api/skills/{id}/accept`             | 接受候选修订    |
| `GET`  | `/api/skills/{id}/versions`           | 列出技能版本    |
| `POST` | `/api/skills/{id}/deploy`             | 本地部署技能    |

---

## 安全与隐私

本仓库面向开源协作做了默认安全处理：

- 不提交任何 API 密钥或凭据。
- 本地数据库、上传内容、归档、生成技能、日志与构建产物已加入 `.gitignore`。
- 运行期配置来自环境变量或本地 `.env`。
- **请勿**将私密录屏、口令、客户数据或生产环境截图上传到不可信的公共实例。

若发现安全问题，请负责任地披露，详见 [SECURITY.md](SECURITY.md)。

---

## 许可证

本项目采用 **MIT License**，详见 [LICENSE](LICENSE)。

---

<p align="center">
  由 <strong>Video Driven Skill</strong> 团队用心构建。
</p>
