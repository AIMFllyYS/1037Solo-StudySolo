# 新增一个 Agent 工具

每个工具一个目录：`lib/ai/agent/tools/<name>/`。新增时**不要**再往已经删掉的 `lib/ai/agent/tools.ts` 里堆定义，也**不要**在 `ChatMessage.tsx` 里写工具名字面量。

`renderInteractive` 这个 id **不得改名**（已写入 IndexedDB 聊天历史）。目录名可以不同，但 `STUDY_TOOL_NAMES` 里的字面量必须保持原样。

## 目录约定

```
lib/ai/agent/tools/<name>/
  types.ts           # Input / Output（客户端安全，禁止 import fs / 密钥 / tool.ts）
  presentation.ts    # labelKey / settingsLabelKey / descriptionKey / icon / toggleable
  tool.ts            # tool() 定义（仅服务端）

components/chat/toolCards/
  <name>Card.tsx     # 可选；有结果卡片的工具才加（不要写回 lib）
  registry.tsx       # TOOL_REGISTRY / TOOL_RESULT_CARDS / RESULT_CARD_ORDER
  ToolResultCards.tsx
```

汇总文件（新工具都要登记）：

| 文件 | 作用 |
|------|------|
| `names.ts` | `StudyTools` 联合 + `STUDY_TOOL_NAMES` |
| `presentations.ts` | 汇总各工具 `presentation` |
| `server.ts` | `buildStudyTools` 里挂上 `createXxxTool` |
| `index.ts` | 同构桶：只导出类型 + presentation。**禁止** re-export `tool.ts` / `server.ts` / 卡片 |
| `components/chat/toolCards/registry.tsx` | 客户端卡片注册表与顺序 |

旧路径 `lib/ai/agent/toolTypes.ts`、`lib/chat/toolPresentation.ts` 只是兼容 re-export。

## 服务端 / 客户端边界

`components/**` 与 `lib/hooks/**` 不得 import `tool.ts` 或 `server.ts`（ESLint `no-restricted-imports`）。一旦 `index.ts` 间接导出了 `tool.ts`，Next 会把 `fs` 或密钥读取打进浏览器 bundle。`lib/**` 也不得 import `components/**`（error）。

结果卡片只放 `components/chat/toolCards/`，步骤见该目录 `README.md`。

## 步骤

1. 新建 `lib/ai/agent/tools/<name>/types.ts`、`presentation.ts`、`tool.ts`。有卡片再加 `components/chat/toolCards/<name>Card.tsx`。
   顺手把 `trace.tool.<name>.label / settingsLabel / description` 三个 key 写进 zh/en 两份 trace 分片（见下方示例）。
2. 在 `names.ts` 的 `StudyTools` 与 `STUDY_TOOL_NAMES` 各加一项。
3. 在 `presentations.ts` import 并写入 `TOOL_PRESENTATION`。
4. 在 `components/chat/toolCards/registry.tsx` 的 `TOOL_REGISTRY` 登记；有卡片则写入 `RESULT_CARD_ORDER`（顺序按现网卡片，不是 `STUDY_TOOL_NAMES`）。
5. 在 `server.ts` 的 `all` 与 `names` 里挂上工厂函数（搜索类工具仍受 `enableSearch` 控制）。
6. 在 `index.ts` 加 `export type { XxxInput, XxxOutput }`。
7. 跑 `pnpm exec tsc --noEmit` 与 **`pnpm build`**（不只是 tsc），确认客户端 bundle 不报 `fs`。

## 最小示例（无卡片）

下面是一个只回文本、不渲染卡片的骨架。真实工具请抄 `getCurrentPage/`。

`types.ts`：

```ts
import type { TextToolOutput } from "@/lib/ai/agent/tools/_types";

export type ExampleToolInput = { query: string };

export interface ExampleToolOutput extends TextToolOutput {
  contextKey: string;
}
```

`presentation.ts`：

```ts
import type { ToolPresentation } from "@/lib/ai/agent/tools/registry";

export const presentation: ToolPresentation = {
  labelKey: "trace.tool.exampleTool.label",
  settingsLabelKey: "trace.tool.exampleTool.settingsLabel",
  descriptionKey: "trace.tool.exampleTool.description",
  icon: "file",
  toggleable: true,
};
```

三个字段的类型都是 `I18nKey`：这里放的是**文案 key**，不是文案本身，渲染处一律 `t(presentation.labelKey)`。
key 要同时加进 `lib/i18n/messages/parts/zh/trace.ts` 与 `lib/i18n/messages/parts/en/trace.ts`（zh 是真相源，
en 用 `satisfies LocaleMessages` 对齐形状）——**两边缺一个 `pnpm typecheck` 就会报错**。中文值照搬界面上原本那串字。

`tool.ts`（只给 `server.ts` 用）：

```ts
import { tool } from "ai";
import { z } from "zod";
import type { ExampleToolOutput } from "@/lib/ai/agent/tools/exampleTool/types";
import { toText, type StudyToolContext, type StudyToolRuntime } from "@/lib/ai/agent/tools/_shared";

export function createExampleTool(_ctx: StudyToolContext, _runtime: StudyToolRuntime) {
  return tool({
    description: "示例工具。把这段换成真实职责，勿改其它工具的 prompt。",
    inputSchema: z.object({ query: z.string() }),
    execute: async ({ query }): Promise<ExampleToolOutput> => ({
      text: query,
      contextKey: `example:${query}`,
    }),
    toModelOutput: ({ output }) => toText(output),
  });
}
```

`names.ts` 追加：

```ts
export type StudyTools = {
  // ...现有 21 项
  exampleTool: { input: ExampleToolInput; output: ExampleToolOutput };
};

export const STUDY_TOOL_NAMES = [
  // ...现有 21 项
  "exampleTool",
] as const;
```

有结果卡片时，`components/chat/toolCards/<name>Card.tsx` 只做 props 映射，本体仍放 `components/chat/`：

```tsx
"use client";
import SomeCard from "@/components/chat/SomeCard";
import type { ResultCardProps } from "@/lib/ai/agent/tools/registry";

export default function ExampleResultCard({ part }: ResultCardProps<"exampleTool">) {
  if (part.state !== "output-available") return null;
  return <SomeCard {...part.output} />;
}
```

然后把它挂进 `components/chat/toolCards/registry.tsx` 的 `TOOL_REGISTRY` 与 `RESULT_CARD_ORDER`。`ChatMessage.tsx` 会经 `ToolResultCards` 自动渲染，不用再写 `getToolPartsByName(message, 'exampleTool')`。

## KitSolo 的远端注册表

内置 `kitSolo` 是通用 MCP 桥接工具。KitSolo 新增工具后从远端注册表披露能力与参数，不要在 StudySolo 重复声明每一个 KitSolo 工具。原生安装、身份校验和结果卡说明见 [kitsolo-mcp.md](kitsolo-mcp.md)。
