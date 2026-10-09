# StudySolo · Multidisciplinary Intelligent Computer-Assisted Learning Application

<div align="center">

**English** | [简体中文](README.md)

<br />

**A Deep Full-Stack Learning Assistant Driven by Verbatim Lecture Transcripts and Frontier LLMs**

Spanning Medicine, STEM, and Humanities · Comprehensive Original Notes · Flawless KaTeX Math · 339 Manim Animations · AI Agent Copilot · Offline Desktop Application

<br />

[![Cloud Beta](https://img.shields.io/badge/Cloud%20Beta-StudySolo.1037Solo.com-blue?style=flat-square&logo=cloudflare)](https://studysolo.1037solo.com)
[![License](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-blue.svg?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.7-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-42.5.0-47848f?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green?style=flat-square&logo=node.js)](https://nodejs.org/)

<br />

[Key Features](#-key-features--architecture-matrix) • [Quickstart Guide](#-quickstart-guide) • [Internationalization](#-full-interface-i18n-architecture) • [Tech Stack](#-verified-tech-stack-breakdown) • [Directory Layout](#-project-directory-structure) • [Roadmap](#-project-roadmap) • [License](#-license--commercialization-statement)

</div>

---

## 📖 Vision & Architectural Philosophy

**StudySolo** is a high-performance, modern computer-assisted learning (CAL) workstation engineered for medical and STEM students. Addressing systemic learning challenges in university education—fragmented lecture recordings, opaque mathematical derivations, staggering multidisciplinary content volumes, and practice questions decoupled from knowledge points—StudySolo combines a unified multidisciplinary knowledge graph with a local-first storage architecture. It deeply integrates the **Vercel AI SDK 7 autonomous agent runtime**, the **Python Manim scientific visualization engine**, a **10-semester continuum academic year switcher**, a **1,956-key bilingual i18n system**, and a **Windows Electron desktop app with hardware-encrypted credentials**.

Whether tackling intensive foundational medical courses (Medical Cell Biology, Systematic Anatomy, Histology & Embryology, Biochemistry) or complex STEM mathematical models and chemical reaction mechanisms (Probability & Statistics, College Physics, Organic Chemistry, Instrumental Analysis), StudySolo delivers an immersive, smooth, and privacy-preserving learning journey.

---

## 🌟 Key Features & Architecture Matrix

### 1. Interactive Learning Workspace

- **Comprehensive Original Notes & Precision Mathematical Typesetting**:
  Deeply distilled from verbatim classroom lecture audio, incorporating the **KaTeX 0.16.21** mathematical rendering engine with `mhchem` chemical syntax extensions. Natively renders complex Gaussian integrals, tensor equations, and chemical reaction pathways without formula crashes or layout popping.
- **339 Multidisciplinary Concept Animations (Manim Engine)**:
  Maintains 3 specialized Python rendering pipelines (155 scenes for Probability & Statistics, 14 for Organic Chemistry, and 170 for College Physics), delivering intuitive and dynamic mathematical and physical visualizations.
- **79 Dynamic Accompanying Video Scripts**:
  Video script data (`media.scripts.generated.ts`, ~388KB) utilizes dynamic chunked lazy-loading (`await import(...)`), only loading into memory upon user interaction, preventing initial bundle bloat.
- **Picture-in-Picture Floating Video Player (@vidstack/react)**:
  Integrates modern `@vidstack/react` player primitives supporting global Picture-in-Picture (PiP) playback, preserving video progress and timestamps across cross-subject page transitions.
- **3D Flip-Card Memory System & Review Board**:
  Automatically synthesizes knowledge points into fill-in-the-blank flashcards and Q&A review cards from selected text and questions; features 3D flip card review, numeric jump grid navigators, Ebbinghaus spaced repetition algorithms, and offline full JSON backup/restore.
- **Unified Typed Canvas Block Runtime**:
  Converges function curve plots, SVG vector diagrams, interactive HTML charts, and `@rdkit/rdkit`-powered SMILES chemical structure diagrams into a single typed canvas runtime pipeline, complete with expression pre-diagnostics and AI automated code revision.

### 2. AI Agent Copilot & Runtime

- **Vercel AI SDK 7 Full-Stack Integration**:
  Built on `ai@7.0.85`, leveraging `ToolLoopAgent` and the `UIMessage Stream` protocol to deliver an autonomous tutoring agent. Employs `DefaultChatTransport` and client stream readers, natively handling custom typed data parts including `context-compaction` (80% soft limit compaction), `context-breakdown`, `usage`, and predictive `followup` questions.
- **Agent Trace Execution Timeline**:
  Sequentially renders reasoning steps, tool calls, and phase descriptions; equipped with 22 custom monochrome SVG status icons, 160ms automatic smooth collapsing on stream completion, keyboard navigation, and `prefers-reduced-motion` accessibility support.
- **Sentence-Level Citations `[n]` & Hover Popover Cards**:
  Knowledge retrieval tools (`webSearch`, `searchNotes`, `getSection`, `getCurrentPage`, `searchClassTranscript`) return monotonically allocated citation indices `[n]`. Strict prompt constraints compel the model to append citations to the end of every deriving sentence. The frontend transforms `[1]` / `[1][2]` into interactive superscript pill markers that trigger source preview popovers on hover and open external links or textbook reference panels on click.
- **Decoupled Central Chat & Permanent Right-Side Reference Column**:
  The central linear conversation is stripped of non-essential auxiliary artifacts (folded sources, demo widgets, document cards), delegating them to a permanent right-side "Reference Column" (aggregating sources `Sources · N`, quizzes, demos, and docs). AI quizzes (`createQuiz`) automatically dock into the right-side testing panel, never breaking the conversation flow.
- **Multi-Model Gateway & Dialect Normalization**:
  Natively supports GLM-5.3 Flash, Qwen3.8 (27B/Flash), Gemini 3.8 Flash, DeepSeek V4.1 Flash, MiMo 2.6 Flash/Pro, GPT-5.6, and Kimi K3. Supports user-configured OpenAI-compatible endpoints (Base URL / Model ID / API Key) and transparently normalizes vendor-specific thinking dialects (`qiniu-toggle`, `openai-reasoning-effort`, `deepseek-thinking`, `anthropic-thinking`).

### 3. Multidisciplinary Content Tree & Academic Year Switch

- **10-Semester Continuum Academic Year Architecture**:
  Configured via `lib/constants/academic-year.ts` across a 5-year curriculum (10 semesters: `freshman-1` through `fifth-2`), defaulting to `sophomore-1`. Framer Motion animated pill switchers seamlessly filter the bookshelf, sidebar navigation, search engine, and AI outline, protected by automatic route guards.
- **14 Registered Subjects Catalog** (`lib/content-data/subjects.registry.ts` Single Source of Truth):
  - **Freshman Spring Semester (`freshman-2`) · 6 Subjects**:
    - Probability & Statistics (`probability`: full chapter notes, exam recordings, and mock tests)
    - College Physics (`physics`: 27 sets of recorded lecture problems, chapter mock exams, and SVG electromagnetic diagrams)
    - Organic Chemistry (`chemistry`: 3D reaction mechanisms and stereochemical structures)
    - Modern Chinese History (`modern-history`: 6 mock exam sets and tb-ch00–10 textbook problem sets)
    - Maoism / Marxist Theory (`maogai`: 2023 revised edition textbook chapters, prediction papers, and postgraduate exam difficulty sets)
    - Others & Tools (`other`: College English CET-4 across 8 comprehensive lecture units)
  - **Sophomore Fall Semester (`sophomore-1`) · 8 Subjects**:
    - Medical Cell Biology (`cell-biology`: rich-text chapters ch01–ch18)
    - Histology & Embryology (`histology`: tissue slides, organ histology, and embryogenesis key points ch01–ch28)
    - Biochemistry & Molecular Biology (`biochemistry`: metabolic pathways, genetics, and molecular mechanisms ch00–ch27)
    - Systematic Anatomy (`anatomy`: detailed anatomical structural breakdown of all 9 human organ systems ch00–ch09)
    - Instrumental Analysis (`instrumental-analysis`: Ji Yibing's 2020 textbook, 15 complete OCR chapters with spectra and instrument architecture)
    - Medical English (`medical-english`: clinical terminology and biomedical literature reading)
    - Medical Statistics (`medical-statistics`: clinical trial design and biostatistical methodology)
    - Cell Biology Laboratory (`cell-biology-lab`: experimental principles, protocol execution, and lab report guides)
- **Extensive Question Bank Supporting 9 Question Types**:
  Hosts **324 JSON quiz sets** comprising **6,166 questions** across 9 diverse types (Single Choice, Multiple Choice, True/False, Conceptual Analysis, Fill-in-the-Blank, Essay/Calculation, Reading Comprehension, Cloze Test, English-Chinese Translation), backed by **2,036 practice example files** (`content/examples/`).
- **4-Role Standardized Lecture Ingestion Model**:
  Standardized lecture ingestion: verbatim audio `recording.md`, structured lecture minutes `minutes.md`, sandboxed rich-text notes `notes.html`, and high-yield flashcards `cards.md` unified under a shared `quizRef`.

### 4. Desktop & Cross-Platform: Electron & PWA

- **Route A Standalone Electron Architecture**:
  The Electron main process launches Next.js's self-contained standalone server (`.next/standalone/server.js`) inside an isolated child process via `ELECTRON_RUN_AS_NODE`, achieving full desktop wrapping without intrusive changes to web source code.
- **Fixed Port 35349 Origin Consistency Strategy**:
  Enforces a strict fixed port `APP_PORT: 35349` across development, web, and desktop (`http://127.0.0.1:35349`). This eliminates the catastrophic P0 flaw where random Electron ports alter the browser origin, stranding and wiping out IndexedDB user history on app restarts.
- **Windows DPAPI Credential Hardware Encryption**:
  User-configured API credentials and endpoint URLs are hardware-encrypted using Chromium's native `safeStorage` (backed by Windows DPAPI) and written to `userData/keys.enc`. **Zero API keys are bundled into distribution installers**.
- **Offline Knowledge Index & Dual Distribution Packaging**:
  Desktop installers bundle the full 307MB `content/.index/` BM25 knowledge index, enabling instantaneous offline textbook reading, full-text search, formula rendering, and quiz assessment without internet connectivity. Packages include an **NSIS Installer** (`Gailvlun-setup-0.5.1.exe`) and a **Portable Executable** (`Gailvlun-portable-0.5.1.exe`).
- **Progressive Web App (PWA)**:
  Configures the Web App Manifest (`app/manifest.ts`) and `appleWebApp` metadata for standalone installation on mobile home screens and desktop taskbars. Embeds a zero-FOUC theme bootstrap script in `<head>` to eliminate white flashes on cold starts.

### 5. Storage Architecture & Privacy-First

- **Tenant-Scoped Partitioned Storage**:
  IndexedDB (`gailvlun-db/keyval`) shards data with strict user account prefix scoping (`ss-user:<ownerId>:<key>`), guaranteeing complete data isolation between different accounts on the same machine.
- **Storage v3 Session Chunking with CAS Optimistic Concurrency Control**:
  Architected around SessionHead (`SessionHeadV3`) and TurnSpine chunks (`TURNS_PER_CHUNK = 8`, cold hydration loading only the latest 4 turns). Implements single-transaction Compare-And-Swap (CAS) atomic commits (`contentRevision`) and three-way conflict merge recovery.
- **Virtualized ChatThread Rendering**:
  Powered by `@tanstack/react-virtual` with role-based dynamic height estimations, smoothly rendering conversations spanning tens of thousands of messages at a stable 60 FPS. `ChatMessageDots` spine navigation allows users to jump instantly to any historical turn without loading intermediate DOM elements.
- **800ms Write Debouncing & Lifecycle Flushes**:
  High-frequency streaming tokens are buffered via an 800ms write debounce and memory Tail Cache, immediately flushed upon `pagehide` and `beforeunload` lifecycle hooks.
- **Local Token Ledger & Zero Cloud Tracking**:
  Includes `useBillingStore` for tracking token usage and image generation expenses, supporting multi-API group pricing and real-time currency conversions. User data stays 100% on the local device, with full JSON data export and zero cloud analytics.

---

## 🌐 Full Interface i18n Architecture

StudySolo incorporates a strict, high-performance internationalization system (`lib/i18n/`) designed specifically for rigorous academic software:

```
lib/i18n/
├── dom.ts                  # Document lang & dataset.locale DOM synchronization
├── index.ts                # translate / translateNow / useT / useLocale exports
├── types.ts                # LocaleMessages interface and type definitions
└── messages/
    ├── zh.ts               # Chinese dictionary root (Source of Truth)
    ├── en.ts               # English dictionary root (satisfies LocaleMessages constraint)
    └── parts/              # 10 modular namespace shards (zh & en 1:1 parity)
```

- **1,956 Bilingual Keys with 100% Structural Parity**:
  Both Chinese and English message trees contain exactly **1,956 translation keys**, verified by automated test assertions (`lib/i18n/index.test.ts`) enforcing complete structural symmetry (`assert.deepEqual(enKeys, zhKeys)`).
- **10 Modular Namespace Shards**:
  Spans `window` (464 keys), `settings` (397 keys), `trace` (274 keys), `panel` (255 keys), `agent` (245 keys), `menu` (151 keys), `review` (111 keys), `share` (34 keys), `app` (21 keys), and `common` (4 keys).
- **Academic Content Localization Boundary**:
  - **Preserved Academic Source Text**: Textbook prose, medical chapters, quiz questions, mathematical derivations, and lecture notes remain in their original Chinese to preserve terminology precision and prevent translation distortions.
  - **Comprehensive UI Localization**: System chrome, settings panels, Agent reasoning traces, 21 tool presentation metadata items (`labelKey`, `settingsLabelKey`, `descriptionKey`), shortcut key charts, and document reader shells (PDF/DOCX/PPTX) are 100% bilingual.
- **DOM & SSR Zero-Flicker Hydration**:
  Managed reactively through `useSettings`. Client hydration calls `syncDocumentLocale` to synchronize `document.documentElement.lang` (`zh-CN` / `en`) and `dataset.locale`, preventing React hydration warnings and eliminating visual flicker.

---

## 🚀 Quickstart Guide

### 1. System Prerequisites

- **Node.js**: `22.x LTS` or higher (`node -v >= 22.10.0`)
- **Package Manager**: `pnpm` (version 8.x or 9.x recommended)
- **Python Environment (Optional, for Manim rendering only)**: `Python 3.10+` with `manim`, `scipy`, `numpy`, `ffmpeg`, and a LaTeX distribution (MiKTeX or TeX Live)

### 2. Web Development & Local Server

```bash
# 1. Clone the repository
git clone https://github.com/AIMFllyYS/1037Solo-StudySolo.git
cd 1037Solo-StudySolo

# 2. Install workspace dependencies
pnpm install

# 3. Create your local environment configuration file
cp .env.example .env.local

# 4. Build local knowledge retrieval index (BM25 & vector embeddings)
pnpm build-index

# 5. Start the development server on fixed port 35349
pnpm dev
```

Open your browser and navigate to: **`http://localhost:35349`**.

#### Environment Variable Setup (`.env.local`)

```env
# Core LLM Relay Gateway (OpenAI-compatible)
RELAY_BASE_URL=https://relay.protocom.org/v1
RELAY_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
AI_MODEL_FLASH=z-ai/glm-5.3-flash
AI_MODEL_PRO=Qwen/Qwen3.8-27B

# Multimodal & Image Generation Endpoint (Optional)
AI_BASE_URL=https://api.siliconflow.cn/v1
AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# Zhipu Search & Vector Embedding Endpoint (Optional)
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# Unsplash Educational Image Discovery (Optional)
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```

*Note: Even without configuring AI API keys, StudySolo's complete original notes, formula typesetting, Manim animations, interactive components, and self-assessment quizzes remain completely operational offline.*

### 3. Desktop Development & Packaging (Electron)

```bash
# Launch the Electron desktop shell against your local server
pnpm desktop:dev

# Build standalone distribution packages (NSIS installer & portable exe)
pnpm desktop:build
```

Packaged desktop deliverables are generated in `dist-desktop/`:
- `Gailvlun-setup-0.5.1.exe` (NSIS installer with setup wizard, recommended)
- `Gailvlun-portable-0.5.1.exe` (Portable zero-install standalone executable)

### 4. Mathematical Animation Rendering (Manim)

```bash
# Install Python animation dependencies
pip install -r manim/requirements.txt

# Render all ungenerated animation scenes
pnpm render

# Render animations for a specific chapter (e.g., Probability chapter 1)
pnpm render:chapter ch01

# Force re-render all scenes at 1080p high quality
python manim/render.py --force --quality h
```

Rendered MP4 videos are saved to `public/media/videos/`, and media metadata is automatically registered in `lib/content-data/media.generated.ts`.

### 5. Quality Assurance & Test Verification

```bash
# Run ESLint, Knip dead-code audit, and secret credential checks
pnpm lint

# Run TypeScript strict type verification
pnpm typecheck

# Validate subject registry, manifest, and content file consistency
pnpm check:registry

# Run the core unit test suite
pnpm test:unit
```

---

## 🛠 Verified Tech Stack Breakdown

| Category | Package Name | Locked Version | Architectural Role |
|:---|:---|:---|:---|
| **Frontend Core** | `next` | `16.2.9` | App Router, Server Components, Route Handlers, Standalone bundling |
| | `react` / `react-dom` | `19.2.7` | UI runtime, React 19 Actions, Concurrent rendering pipeline |
| | `tailwindcss` | `^4.0.0` | Next-generation CSS utility engine (`@tailwindcss/postcss: ^4.0.0`) |
| | `typescript` | `^5.7.3` | Full-stack static type verification (`target: ES2022`) |
| | `framer-motion` | `^11.18.0` | Academic year switchers, accordion transitions, 3D flip card physics |
| **AI Agent Runtime**| `ai` | `7.0.85` | Vercel AI SDK 7 core (`ToolLoopAgent`, `UIMessage Stream`) |
| | `@ai-sdk/openai-compatible`| `3.0.41` | Multi-vendor OpenAI-compatible gateway adapters & dialect handling |
| | `@ai-sdk/anthropic` | `4.0.46` | Anthropic Claude model protocol translation adapter |
| | `streamdown` | `2.3.0` | Streaming Markdown lexing and smooth incremental rendering |
| | `zod` | `4.4.3` | Tool argument schemas and runtime payload validation |
| **State & Storage** | `zustand` | `^5.0.3` | Client state management across 44 discrete, single-responsibility stores |
| | `idb-keyval` | `^6.2.5` | Asynchronous IndexedDB storage engine (`gailvlun-db/keyval`) |
| | `@tanstack/react-virtual` | `^3.14.4` | Virtualized thread container (dynamic height estimation, 60 FPS) |
| **Content & Visuals**| `katex` | `^0.16.21` | High-performance LaTeX formula typesetting engine (with `mhchem`) |
| | `@vidstack/react` | `1.15.6` | Modern accessible video player engine (with floating PiP support) |
| | `@rdkit/rdkit` | `2025.3.4-1.0.0` | WebAssembly cheminformatics 2D/3D molecular structure renderer |
| | `@xyflow/react` | `12.11.5` | Interactive node-based concept maps and knowledge graph pipelines |
| | `@milkdown/crepe` | `7.22.0` | WYSIWYG rich markdown note editing environment |
| **Desktop & Sandboxing**| `electron` | `^42.5.0` | Native desktop container runtime with DPAPI credential security |
| | `electron-builder` | `^26.15.3` | Windows NSIS installer and portable executable bundler |
| | `e2b` | `2.31.0` | Sandboxed cloud code execution environment client |
| | `@modelcontextprotocol/client` | `2.2.0` | Anthropic Model Context Protocol (MCP) client implementation |

---

## 📁 Project Directory Structure

```text
1037Solo-StudySolo/
├── app/                        # Next.js 16 App Router (Pages, layouts & /api routes)
│   ├── api/chat/               # AI SDK 7 ToolLoopAgent streaming endpoint
│   ├── manifest.ts             # PWA Web App Manifest dynamic route
│   └── layout.tsx              # Root layout & zero-FOUC theme bootstrap
├── components/                 # React 19 UI component library
│   ├── chat/                   # Chat stream, AgentTrace timeline, citation chips
│   ├── layout/                 # AcademicYearSwitcher, header chrome, navigation
│   ├── visual/                 # Typed canvas runtime, video player, 3D review board
│   └── quiz/                   # Assessment cards supporting 9 question types
├── content/                    # Multidisciplinary original academic assets
│   ├── chapters/               # Probability & Statistics chapter notes
│   ├── physics/                # College Physics textbook, recordings & mock tests
│   ├── chemistry/              # Organic Chemistry mechanism notes & reaction maps
│   ├── anatomy/                # Systematic Anatomy textbook & problem banks
│   ├── cell-biology/           # Medical Cell Biology rich-text curriculum
│   ├── histology/              # Histology & Embryology textbook & slide notes
│   ├── biochemistry/           # Biochemistry & Molecular Biology notes
│   ├── instrumental-analysis/  # Ji Yibing's Instrumental Analysis 15 OCR chapters
│   ├── quiz/                   # 324 JSON quiz sets across 14 registered subjects
│   └── .index/                 # Bundled 307MB offline BM25 knowledge index
├── electron/                   # Electron 42 desktop main process and configs
│   ├── main.js                 # Route A Standalone server launcher & DPAPI manager
│   ├── config.js               # Fixed port 35349 and static runtime configuration
│   └── preload.js              # Sandboxed contextBridge security interface
├── lib/                        # Business logic and runtime core
│   ├── ai/                     # ToolLoopAgent, model gateway, prompts & reasoning
│   ├── constants/              # 10-semester academic year definitions (academic-year.ts)
│   ├── content-data/           # Subject registry (subjects.registry.ts) & manifests
│   ├── i18n/                   # 1,956-key bilingual i18n engine (zh.ts, en.ts, parts/)
│   ├── storage/                # Storage v3 session chunks, TurnSpine & CAS transactions
│   └── stores/                 # 44 single-responsibility Zustand stores
├── manim/                      # Python Manim animation rendering pipelines
│   ├── render.py               # Probability & Statistics pipeline (155 videos)
│   ├── render_chemistry.py     # Organic Chemistry molecular pipeline (14 videos)
│   └── render_physics.py       # College Physics electromagnetic pipeline (170 videos)
├── docs/                       # Engineering specifications, SOPs & whitepapers
│   ├── refer/                  # Rendering and storage architectural design papers
│   └── sop/                    # Subject onboarding, quiz generation & index lifecycle
└── scripts/                    # Build, inspection, migration, and testing automations
```

---

## 🗺️ Project Roadmap

### Completed Milestones

- [x] **v0.1.0**: Initial Windows Electron desktop release, bundled Chromium, Windows DPAPI hardware key encryption, offline quiz bank, and Manim video playback.
- [x] **v0.2.0**: Memory card system polishing, text-selection to fill-in-the-blank & Q&A cards, 3D flip card review board, subject-specific bookshelf cover styling.
- [x] **v0.2.1**: Enforced fixed local port `35349`, resolving the critical P0 bug of IndexedDB history wiped out by random Electron ports; text-selection assistant unified with main AI engine.
- [x] **v0.3.0**: Unified window management framework and global taskbar, floating window recall, Unsplash high-resolution educational image discovery.
- [x] **v0.3.1**: Storage v2 session-sharded IndexedDB persistence, `@tanstack/react-virtual` virtualization for 10,000+ message threads, AI image generation, BillingDashboard, College Physics chapter 1 with 27 lecture examples.
- [x] **v0.4.0**: Modern Chinese History (6 mock exams, 11 textbook sets), Maoism 2023 edition (chapter decomposition, prediction papers), Probability real mock exam series, Anthropic adapter, and ThinkingMenu reasoning controls.
- [x] **v0.5.0**: Introduced the 10-semester continuum academic year switcher (`freshman-2` / `sophomore-1`), added 4 core sophomore medical subjects (Cell Biology, Histology & Embryology, Biochemistry, Anatomy), and Ji Yibing's *Instrumental Analysis* 15 OCR chapters.
- [x] **v0.5.1**: Upgraded to Vercel AI SDK 7 (`ToolLoopAgent` + `UIMessage Stream`), desktop free gateway relay (custom URL / Model ID / API Key), and converged subject metadata into `subjects.registry.ts`.
- [x] **[Unreleased] Cutting-Edge Capabilities**:
  - [x] Sentence-level citations `[n]` with hover preview popovers and direct chapter navigation.
  - [x] Decoupled central chat and permanent right-side Reference Column; AI quizzes dispatched directly to right-side workspace.
  - [x] 1,956-key full-interface bilingual i18n system spanning 10 modular namespaces with strong type checking.
  - [x] 22 custom monochrome local SVG icons with compact transparent floating input chrome.

### Future Horizons

- [ ] Onboard sophomore spring (`sophomore-2`) and senior clinical medical subjects (Pathology, Pharmacology, Pathophysiology).
- [ ] Integrate local lightweight multimodal audio models for real-time lecture transcript alignment and voice tutoring.
- [ ] Expand native mobile wrappers with peer-to-peer synchronization over offline SQLite/OPFS.
- [ ] Explore Graph RAG and cross-disciplinary topological concept graph navigation.

---

## 📄 License & Commercialization Statement

This project is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

### 1. Permitted Noncommercial Use
- **Personal Learning & Private Study**: You are permitted to deploy, browse notes, study offline, take practice quizzes, and make noncommercial modifications for personal educational research and skill development.
- **Noncommercial Organizations**: Educational institutions (primary, secondary, and higher education), public research facilities, public health organizations, environmental protection bodies, and government departments may use the software for noncommercial education and research.

### 2. Strict Commercial Prohibition
- **Commercial Sale & Monetization Forbidden**: Any individual, organization, or enterprise is strictly prohibited from using this software, its source code, compiled binaries (including `.exe` installers, Docker images, etc.), lecture notes, or multimedia assets for direct or indirect commercial gain.
- **No Paid Course Bundling or Resale**: Packaging this project into commercial tutoring classes, paid exam prep materials, or demanding subscription/membership fees to access the software is strictly prohibited.
- **No Third-Party Hosted SaaS**: Hosting third-party commercial cloud services or charging users for access to hosted instances of this codebase without authorization is prohibited.

### 3. Official Public Cloud Beta Service & Commercial Isolation
- The official, authorized public cloud beta deployment for this project is hosted at: **`StudySolo.1037Solo.com`** ([https://studysolo.1037solo.com](https://studysolo.1037solo.com)).
- The official cloud beta is provided to offer a zero-install learning environment for students. The existence of this public beta does not grant third parties any right to engage in commercial exploitation.

*For institutional licensing, educational partnerships, or commercial inquiries, please contact the project maintainers.*

---

## 🤝 Contributing & Community

We warmly welcome contributions from the community!

1. **Fork the repository** and create your feature branch (`git checkout -b feature/NewSubjectFeature`).
2. Strictly follow [`docs/sop/subject-onboarding.md`](docs/sop/subject-onboarding.md) when authoring textbook chapters or quiz banks.
3. Ensure all engineering gates pass before submitting: `pnpm check:registry`, `pnpm typecheck`, and `pnpm test:unit`.
4. Commit your changes with clear messages and submit a Pull Request.

---

## 💖 Acknowledgments

- Gratitude to students from Huazhong University of Science and Technology (1037 Forest University) and partner medical colleges for organizing lecture recordings and notes.
- Thanks to the open-source communities behind Vercel AI SDK, Next.js, Tailwind CSS, Manim, and the PolyForm Project for providing foundational infrastructure.

<div align="center">

**If StudySolo assists your academic journey, please star ⭐️ this repository on GitHub!**

*Made with ❤️ by 1037Solo Contributors for Lifelong Learners Worldwide*

</div>
