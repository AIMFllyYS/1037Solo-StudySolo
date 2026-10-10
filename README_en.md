# StudySolo

English · [简体中文](README.md) · [Documentation index](docs/README.md)

StudySolo is a multidisciplinary learning workspace for medical, STEM and humanities courses. It combines textbook reading, lecture materials, quizzes, review, Agent conversations and project workspaces. The browser and Electron applications share domain code while keeping account, cloud and local data boundaries explicit.

[Hosted application](https://studysolo.1037solo.com) · [License](LICENSE) · [Changelog](CHANGELOG.md)

Last checked against source on 2026-10-10. The current dependency versions are Next.js **16.4.0** and React **19.2.7**. [package.json](package.json) and [pnpm-lock.yaml](pnpm-lock.yaml) define requested and resolved versions. Repository work and the deployed application have separate release records; see the [Web release guide](docs/refer/studysolo-web-release.md).

## Application surfaces

| Surface | Responsibilities |
| --- | --- |
| Studio `/`, `/<subject>/<category>/<id>` | Semester/subject navigation, textbooks, explanations, four lecture materials, examples, quizzes, video, handwritten interactives, notes and browser |
| Agent `/agent`, `/c/<sessionId>` | Conversations, models/thinking, tool traces, projects, sources, products and the right workspace |
| Assets `/agent/assets` | Originals, notes, products, versions, recycle bin and restoration |
| Classroom `/class` | Recording, transcripts, notes, outline/mind map and classroom Agent |
| Review `/review`, `/<subject>/review` | Answers, scores, records, diagnosis and persisted progress |
| Sharing `/s/<shareId>` | Controlled read-only snapshots |

[subjects.registry.ts](lib/content-data/subjects.registry.ts) defines subjects and semesters. The manifest and generated catalogs define navigation; available materials are established by registration and content checks.

The Agent workspace can open internal textbooks and project files. Textbook reading reuses the existing safe body renderer, with the folder tree at the workspace's right edge and semester selection through the common folder tree. Fast mode is available only for registered normal/fast model pairs; model variants and thinking intensity remain separate choices.

## Local development

Use Node.js 22 or newer and pnpm 11.7; CI currently uses Node 22. Start configuration from [.env.example](.env.example), then configure account, AI, connector and sandbox services as required. Credentials do not belong in source control.

```powershell
pnpm install --frozen-lockfile
Copy-Item -LiteralPath .env.example -Destination .env.local
pnpm dev
```

The local Web address is `http://localhost:35349`. Reuse an existing RootSolo-managed `studysolo-web` service when present; process, HTTP and actual page health determine whether recovery is required.

Textbooks and local indexes can be read from local files. Conversations, account services, cloud sync, online integrations and sandboxes require their own configuration, connectivity and authorization. Visitors can read public materials; signed-in identity determines conversation and asset ownership.

## Source organization

| Location | Owner |
| --- | --- |
| `app/` | Next pages/layouts, metadata, HTTP adapters and runtime/cache declarations |
| `components/` | Presentation, interaction and UI composition, grouped by responsibility |
| `lib/` | Contracts, algorithms, services, persistence, sync and React adapters |
| `lib/stores/` | Single Zustand authorities, grouped into assets/chat/learning/workspace |
| `lib/content-data/` | Subject, navigation, media and authored/generated metadata |
| `content/`, `public/` | Original materials, quizzes and media |
| `classolo/` | Classroom domain integrated into this application |
| `electron/` | Desktop main process, controlled IPC and packaging |
| `scripts/` | Build, validation, content ingestion and maintenance CLIs |

See the [current architecture](docs/architecture.md) and [organization standard](docs/standards/code-organization.md). Subject and Agent tool additions follow the [subject onboarding SOP](docs/sop/subject-onboarding.md) and [tool extension guide](docs/refer/adding-an-agent-tool.md).

## Validation and builds

| Command | Scope |
| --- | --- |
| `pnpm typecheck` | Full TypeScript |
| `pnpm lint:eslint`, `pnpm lint:secrets` | Code rules and secret scan |
| `pnpm lint:knip` | Unused candidates; verify real entrypoints, currently non-blocking in CI |
| `pnpm test:unit`, `pnpm test:react` | node:test code tests and Vitest component tests |
| `pnpm test:content` | Content tests using a matching local index |
| `pnpm check:lectures`, `pnpm check:registry` | Lecture contracts, navigation and registry |
| `pnpm build` | Prebuild gates and production build |
| `pnpm desktop:build:staged`, `pnpm desktop:build` | Staged Electron build and packaging |

Follow the [index lifecycle SOP](docs/sop/10-search-index-lifecycle.md) when indexes are missing or stale. `pnpm build-index --bm25-only` performs an offline keyword rebuild. Vector generation has separate configuration and call costs; a keyword check does not establish vector coverage of new materials.

Use a separate `STUDYSOLO_BUILD_DIR` for candidate builds beside a running development service. The [testing SOP](docs/sop/07-testing.md), [Web release guide](docs/refer/studysolo-web-release.md) and [desktop SOP](docs/sop/06-desktop-packaging-release.md) describe the corresponding acceptance and release paths.

## Maintenance contracts

Read [AGENTS.md](AGENTS.md) and the [documentation index](docs/README.md) first. Current source, package/lock files and the human task define the scope. Historical handoffs, ledgers and archived prompts do not start new work. Preserve identity, ownership, billing, scoped storage, checkpoints/CAS, complete history, recovery, cancellation and attachment contracts.

Each message/batch allows up to 9 attachments, 25MiB per file; later messages may attach more. Originals and derived AI context are stored separately. Materials remain traceable to source, and math/HTML/SVG/media follow the [rendering guide](docs/refer/rendering-architecture.md).

The [current refactor record](docs/plans/2026-10-10-project-refactor-execution.md) tracks completed and remaining work. Standards and SOPs must change with actual code; obsolete documents enter a recoverable archive with their source recorded.

## License and contributions

The source uses [PolyForm Noncommercial License 1.0.0](LICENSE). The LICENSE text governs permissions, conditions and restrictions; contact the maintainers for commercial or special licensing.

Confirm scope before contributing, use descriptive branches such as `feature/<topic>`, `fix/<topic>` or `refactor/<topic>`, and run checks appropriate to the change. Thanks to contributors of course materials, learning features and the underlying open-source infrastructure.
