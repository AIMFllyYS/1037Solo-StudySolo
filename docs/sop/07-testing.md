# SOP 07 — 测试体系

## 适用场景

所有需要编写、运行或维护测试的场景。本 SOP 定义了项目的双运行器测试架构、命名约定、测试分层与最佳实践。

## 输入物料

| 物料 | 路径 | 说明 |
|------|------|------|
| 源码 | `lib/`、`components/`、`app/api/` | 被测代码 |
| 内容数据 | `content/quiz/`、`lib/content-data/manifest.ts` | 内容完整性测试的数据源 |
| 渲染架构规范 | `docs/refer/rendering-architecture.md` | Markdown 渲染层测试的参考规范 |
| 题目类型定义 | `lib/quiz/types.ts` | quiz 评分逻辑测试的类型依据 |
| TypeScript 配置 | `tsconfig.json` | 路径别名 `@/*`（tsx 与 Vitest 共用） |

## 执行角色分配（主控 + subagent 拆分）

| 角色 | 类型 | 职责 |
|------|------|------|
| 主控 | 当前智能体 | 确定测试范围、选择运行器、审查合规性 |
| 测试编写 | GeneralPurpose subagent | 按 P0-P3 分层编写测试文件 |
| 测试运行 | Shell subagent | 执行 `pnpm test` / `pnpm test:unit` / `pnpm test:react` |

**分工铁律**：
1. 单个 subagent 一次只负责一个层级的测试（P0/P1/P2/P3）
2. 测试文件与源码同目录（`x.ts` ↔ `x.test.ts`），内容/API 集成测试集中在 `tests/`
3. 禁止在测试中加载真实搜索索引（307MB）或触发网络请求

## 步骤流程

### Step 1：确定测试层级

根据被测代码选择层级：

| 层级 | 运行器 | 范围 | 文件模式 |
|------|--------|------|----------|
| P0 纯逻辑 | node:test | `lib/` 纯函数 | `*.test.ts` |
| P1 内容完整性 | node:test | `content/` 数据 | `*.test.ts` |
| P2 API 逻辑 | node:test | `app/api/` 核心函数 | `*.test.ts` |
| P3 React | Vitest | `lib/hooks/`、`components/` | `*.test.tsx` |

**架构概览**：项目采用 **node:test + Vitest 并存** 的双运行器架构。不需要 DOM 的测试用 `node:test`（零依赖、快）；需要 DOM/React 的用 Vitest（jsdom 环境）。

### Step 2：编写测试

#### node:test（P0-P2）

```typescript
import assert from "node:assert/strict";
import { test } from "node:test";
import { myFunction } from "./myModule.ts";

test("描述", () => {
  assert.equal(myFunction("input"), "expected");
});
```

要点：
- 用 `import "./x.ts"` 直接导入（tsx 处理 TS + 路径别名 `@/`）
- `node:assert/strict` 提供 `equal`、`deepEqual`、`ok`、`throws`
- 需要 `localStorage`/`window` 时手动 mock `globalThis`

#### Vitest（P3）

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/ComplexChild", () => ({
  default: ({ children }) => <span>{children}</span>,
}));

describe("MyComponent", () => {
  it("渲染", () => {
    render(<MyComponent />);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
```

要点：
- `vi.mock` 隔离复杂子组件（如 QuizMarkdown 拉入 react-markdown/katex 链）
- 状态变更需包在 `act()` 中：`act(() => { store.fire(); })`
- `userEvent.setup()` 模拟真实用户交互（推荐优于 `fireEvent`）
- `@testing-library/jest-dom` 提供 `toBeInTheDocument()` 等 matchers

### Step 3：运行测试

```bash
pnpm test        # 全量（node:test + Vitest）
pnpm test:unit   # 仅纯逻辑（~1s）
pnpm test:react  # 仅 React（~2s）
pnpm test:watch  # 监听模式（仅 Vitest）
pnpm test:cov    # 覆盖率
```

### Step 4：验证 prebuild 集成

`pnpm build` 前自动运行 `test:unit`（node:test），拦截逻辑/内容回归。

**注意**：prebuild 只跑 node:test 不跑 Vitest——Vitest 需要 jsdom 环境，启动较慢，且 React 组件测试回归在开发阶段更容易发现。如需构建前全量验证，手动运行 `pnpm test`。

## 文档解析规范（引用 00-infrastructure.md）

本 SOP 不涉及文档解析。测试中如需读取内容文件，直接使用 `node:fs` 同步 API（见 `tests/content/quiz.test.ts`）。

## 产出规范（文件路径 + 命名）

### 文件布局

```
项目根/
├── vitest.config.ts          # Vitest 配置（jsdom、别名、setup）
├── scripts/
│   └── run-unit-tests.mjs    # node:test 跨平台运行器
├── tests/
│   ├── helpers/
│   │   └── vitest-setup.ts   # Vitest setup（jest-dom matchers）
│   ├── content/
│   │   ├── quiz.test.ts      # quiz JSON 完整性校验
│   │   └── manifest.test.ts  # contentTree 结构校验
│   └── api/
│       ├── can-embed.test.ts # iframe 嵌入判定逻辑
│       └── loader.test.ts    # 内容加载器路径解析
├── lib/
│   ├── utils/
│   │   ├── sseEvents.ts
│   │   ├── sseEvents.test.ts       # 同目录，node:test
│   │   └── skillFrontmatter.test.ts
│   ├── markdown/
│   │   ├── remarkDirectives.test.ts
│   │   └── ...
│   ├── ai/
│   │   ├── artifact.test.ts
│   │   ├── models.test.ts          # 模型注册表
│   │   ├── provider.test.ts        # 提供者解析
│   │   ├── imageSearch.test.ts     # 图片搜索边界
│   │   ├── imageUtils.test.ts      # 图片附件工具
│   │   ├── agent/
│   │   │   ├── studyAgent.test.ts
│   │   │   ├── requestSchema.test.ts
│   │   │   ├── tools.searchNotes.test.ts
│   │   │   └── tools/
│   │   │       └── presentations.test.ts   # AI 工具目录（13 个）内的测试，如 <name>/tool.test.ts
│   │   └── search/
│   │       ├── bm25Store.test.ts
│   │       ├── vectorStore.test.ts
│   │       └── hybridSearch.test.ts
│   ├── quiz/
│   │   └── types.test.ts     # autoGrade 等运行时函数
│   ├── quiz-progress.test.ts
│   ├── motion.test.ts              # 动画常量与 Variants
│   ├── constants/
│   │   ├── prompts.test.ts         # QUICK_PROMPTS 结构
│   │   └── subjects.test.ts        # 科目映射
│   ├── stores/
│   │   └── quiz.test.ts            # quiz store buildAttempt（Vitest）
│   ├── context/
│   │   └── estimateTokens.test.ts  # token 估算
│   ├── content/
│   │   └── poster.test.ts          # 视频封面推导
│   ├── chemistry/
│   │   └── svgTemplates.test.ts    # 化学结构模板
│   └── hooks/
│       ├── useIsMobile.test.tsx         # Vitest
│       ├── useHydrated.test.tsx         # Vitest
│       ├── useChatUI.test.tsx           # Vitest
│       ├── useContextMenu.test.tsx      # Vitest
│       └── useCanvasFullscreen.test.tsx # Vitest
└── components/
    └── chat/
        ├── FollowUpQuestions.test.tsx  # Vitest
        ├── ChatEmptyState.test.tsx     # Vitest
        └── ProcessingSteps.test.tsx    # Vitest
```

### 命名约定

- 单元测试与源码同目录：`x.ts` ↔ `x.test.ts`（或 `.test.tsx`）
- 内容/API 集成测试集中在 `tests/` 目录
- `*.test.ts` → node:test；`*.test.tsx` → Vitest
- 测试描述用中文，便于定位

### 可测性改造

部分源码内部函数未导出，需添加 `export` 才能单测：

| 文件 | 导出的函数 | 原因 |
|------|-----------|------|
| `lib/ai/artifact.ts` | `stripFences`、`extractHtml`、`finalizeHtml` | HTML 修复逻辑 |
| `lib/ai/search/bm25Store.ts` | `tokenize` | 分词逻辑 |
| `lib/ai/search/vectorStore.ts` | `cosineSimilarity` | 相似度计算 |
| `lib/ai/search/hybridSearch.ts` | `rrfMerge` | RRF 合并 |
| `app/api/can-embed/route.ts` | `judge` | iframe 嵌入判定 |
| `lib/stores/learning/quiz.ts`（`lib/quiz-store.ts` 已是转发壳） | `buildAttempt` | 作答记录构造 |

这些导出不影响运行时行为，仅暴露已有函数供测试调用。

## AI 工具可达性验证（引用 05-content-integration.md）

测试体系不直接涉及 AI 工具可达性。但内容完整性测试（P1）间接保障了 AI 工具的数据源正确性：
- `manifest.test.ts` 校验 `contentTree` 结构完整性 → 保障 `getOutline` 工具
- `quiz.test.ts` 校验 quiz JSON 字段合法性 → 保障 `/api/quiz` 路由
- `loader.test.ts` 校验 `readQuiz`/`readContentMarkdown` 路径解析 → 保障 `getCurrentPage` 工具

完整 AI 工具可达性验证流程见 [05-content-integration.md](./05-content-integration.md)。

## 性能冒烟（手动）

性能相关改动合并前，在本地/Electron 执行以下检查（详见 [performance-audit-report.md](../refer/performance-audit-report.md) §九）：

1. 打开含 **100+ 轮对话** 的会话 — 滚动流畅，无明显卡顿
2. **主面板流式** + **3 个划词浮窗**（2 个最小化）— 最小化窗不应随他窗流式重渲染
3. 最小化浮窗后切到 **视频/交互 tab** — 任务管理器内存应下降
4. **超长讲义** — TOC 滚动与 heading 高亮正常
5. **全局搜索** 输入 — 无明显输入卡顿
6. 确认 `content/.index` 存在 — 生产搜索不走 substring 全库扫描
7. Storage v2 迁移后 **Electron 重启** — 历史/图片/附件完整
8. 开发者工具 Performance — 流式期间无持续 >50ms 长任务尖峰

自动化补充：`lib/storage/idbStorage.test.ts`、`lib/chat/streamUiThrottle.test.ts`；阶段 2 后启用 `ChatThread.virtual.test.tsx`。

## 最佳实践

1. **测试行为，不测实现**：断言输入→输出关系，不断言内部变量
2. **mock 最小化**：只 mock 必要的外部依赖（DOM、网络、复杂子组件）
3. **内容测试用真实数据**：quiz/manifest 测试扫描 `content/` 真实文件，防内容回归
4. **搜索模块用内存夹具**：禁止加载真实 307MB 索引或触网/COS
5. **每个 `.test.ts` 文件自包含**：不依赖其他测试文件的执行顺序

## 参考文件（相对路径链接）

- [vitest.config.ts](../../vitest.config.ts) — Vitest 配置（jsdom、别名、setup）
- [scripts/run-unit-tests.mjs](../../scripts/run-unit-tests.mjs) — node:test 跨平台运行器
- [tsconfig.json](../../tsconfig.json) — 路径别名 `@/*`（tsx 与 Vitest 共用）
- [docs/refer/rendering-architecture.md](../refer/rendering-architecture.md) — Markdown 渲染架构规范
- [docs/sop/05-content-integration.md](./05-content-integration.md) — AI 工具可达性验证
- [docs/sop/00-infrastructure.md](./00-infrastructure.md) — 基础设施规范
