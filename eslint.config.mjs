// ESLint 扁平配置（Next.js 16 起 `next lint` 被移除，改由 ESLint CLI 直接驱动：见 package.json 的 lint 脚本）。
// 采用 create-next-app 在 16.x 的标准组合：core-web-vitals + typescript（二者导出均为扁平配置数组，直接展开）。
// 选用 typescript 预设是有意为之——代码中已存在针对 @typescript-eslint/no-explicit-any 的 eslint-disable 注释，
// 说明项目原本即按此规则集编写。注意：Next 16 工具链整体趋严（react-hooks v6 的 set-state-in-effect、
// no-unescaped-entities 等），本仓在升级前从未配置过可用的 lint，故首次启用会暴露存量告警；
// 这些与框架升级无关，lint 在 16 中已与 build 解耦（不阻塞构建），可作为独立的代码质量任务逐步清理。
import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    // Complete user-provided skill scripts run as isolated CommonJS CLIs.
    files: ["lib/sandbox/skill-packs/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // 持久化 store（settings / appMode …）在首帧仍是默认值，本机值只在水合之后可用。
    // 用 useState 初始化器取值会永久停在默认值，也会让首屏 DOM 与服务端不一致（React Hydration failed）。
    files: ["components/**/*.tsx", "app/**/*.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='useState'] > ArrowFunctionExpression MemberExpression[object.name='useSettings'][property.name='getState']",
          message:
            "不要在 useState 初始化器里读 useSettings.getState()：首帧只有默认值，会永久停留并造成 hydration 不一致。请改用 useSettings((s) => s.x) 订阅。",
        },
        {
          selector:
            "CallExpression[callee.name='useState'] > ArrowFunctionExpression MemberExpression[object.name='useAppMode'][property.name='getState']",
          message:
            "不要在 useState 初始化器里读 useAppMode.getState()：本机模式水合后才可用。请改用 useAppMode((s) => s.x) 订阅。",
        },
      ],
    },
  },
  // 构建产物与同仓的独立子项目（各自有自己的 lint 配置/锁文件）不纳入根 lint。
  globalIgnores([
    ".next/**",
    ".next-class-verify/**",
    ".next-perf-*/**",
    ".next-desktop-*/**",
    "dist-desktop-staged-*/**",
    "artifacts/performance/**",
    "runtime/search-worker/**",
    ".local-archive/**",
    "1037Solo-Classolo/**",
    "1037Solo-StudySolo/**",
    "out/**",
    "build/**",
    "dist-desktop/**",
    "next-env.d.ts",
    "node_modules/**",
    "exhibition-hall/**",
    "showroom/**",
    "docs/refer/**",
    "scripts/one-off/**",
    // 归档区：历史一次性脚本（探针 / 验收 / 转储），与 one-off 同一口径 —— 不参与代码质量门禁。
    // 它们是**证据材料**而不是运行时依赖：里面大量 require() 与未用变量是当时的真实形态，
    // 改干净反而丢证据；纳入门禁只会让 lint 永久变红、把真问题淹掉（计划 18 从根 tmp/ 归位）。
    "scripts/archive/**",
    // 设计快照：只读留档，其中 design-library/.tmp/ 是快照自带的构建产物，同样不是运行时依赖。
    "docs/design-snapshots/**",
    ".claude/**",
    ".trae/**",
    ".mimocode/**",
    ".workbuddy/**",
    "tmp/**",
    "public/rdkit/**",
    "public/pdfjs/**",
  ]),
  {
    files: ["electron/**"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["components/**", "lib/hooks/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: [
            "@/lib/ai/agent/tools/**/tool",
            "@/lib/ai/agent/tools/server",
            "**/lib/ai/agent/tools/**/tool",
            "**/lib/ai/agent/tools/server",
          ],
          message: "客户端不得导入 Agent 工具的服务端定义（tool.ts / server.ts），以免把 fs 与密钥打进浏览器 bundle。请从 @/lib/ai/agent/tools 导入类型与 presentation；结果卡片在 components/chat/toolCards/。",
        }],
      }],
    },
  },
  {
    files: ["components/notes/**", "components/layout/RightPanel.tsx", "components/interactives/**"],
    // 笔记窗内微型 Agent 必须复用 ChatThread / ChatInput，但不抢主对话。
    ignores: ["components/notes/NoteAgentPanel.tsx"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/components/chat/*", "@/lib/hooks/useArtifacts", "@/lib/hooks/useDocuments", "@/lib/hooks/useImageGen"],
            message: "AI 对话产物（artifact/document/imageGen）只能由 components/chat 与 AppShell 的全局窗口层渲染，不得在笔记区/右侧 tab 直接引用。见 docs/plans/17 §5。",
          },
          {
            group: [
              "@/lib/ai/agent/tools/**/tool",
              "@/lib/ai/agent/tools/server",
              "**/lib/ai/agent/tools/**/tool",
              "**/lib/ai/agent/tools/server",
            ],
            message: "客户端不得导入 Agent 工具的服务端定义（tool.ts / server.ts），以免把 fs 与密钥打进浏览器 bundle。",
          },
        ],
      }],
    },
  },
  {
    files: ["components/canvas/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/components/chat/*"], message: "canvas 是纯渲染层，不得反向依赖 chat。" },
          {
            group: [
              "@/lib/ai/agent/tools/**/tool",
              "@/lib/ai/agent/tools/server",
              "**/lib/ai/agent/tools/**/tool",
              "**/lib/ai/agent/tools/server",
            ],
            message: "客户端不得导入 Agent 工具的服务端定义（tool.ts / server.ts），以免把 fs 与密钥打进浏览器 bundle。",
          },
        ],
      }],
    },
  },
  {
    files: ["lib/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{ group: ["@/components/*"], message: "lib 不得依赖 components。" }],
      }],
    },
  },
  {
    // 必须排在 lib/** 之后：扁平配置同名规则按后写覆盖，否则 hooks 会丢掉 tool.ts 边界。
    files: ["lib/hooks/**"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          { group: ["@/components/*"], message: "lib 不得依赖 components。" },
          {
            group: [
              "@/lib/ai/agent/tools/**/tool",
              "@/lib/ai/agent/tools/server",
              "**/lib/ai/agent/tools/**/tool",
              "**/lib/ai/agent/tools/server",
            ],
            message: "客户端不得导入 Agent 工具的服务端定义（tool.ts / server.ts），以免把 fs 与密钥打进浏览器 bundle。",
          },
        ],
      }],
    },
  },
]);
