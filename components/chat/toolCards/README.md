# 工具结果卡片

客户端渲染层。`lib/ai/agent/tools/<name>/` 只放 `types.ts` / `presentation.ts` / `tool.ts`，**不要**再往 `lib` 里写 React 卡片。

`renderInteractive` 等工具 id 已写入 IndexedDB 聊天历史，**不得改名**。文件名可以是 `<name>Card.tsx`，id 不行。

## 加一个有卡片的工具

1. 在 `lib/ai/agent/tools/<name>/` 建 `types.ts`、`presentation.ts`、`tool.ts`（步骤见 `docs/refer/adding-an-agent-tool.md`）。
2. 在本目录建 `<name>Card.tsx`：只做 typed tool part → 现有 `components/chat/*Card` 的 props 映射，带 `"use client"`。
3. 在 `registry.tsx` 的 `TOOL_REGISTRY` 加一行（`ResultCard` + 如需则 `shouldRender` / `resultKey`）。
4. 若该卡片要出现在聊天气泡里，把它的 id **追加**到 `RESULT_CARD_ORDER` 末尾（或按现网顺序插入）。**不要重排**已有项——现网顺序是 `searchNotes → webSearch → renderInteractive → generateImage → createQuiz → searchNoteImages → writeDocument → imageSearch → updateUserNote`，`registry.test.tsx` 会锁死。
5. 同一产物不要重复出卡时加 `resultKey`（现网：`renderInteractive` 用 `artifactId`，`generateImage` 用 `imageGenId`，`createQuiz` 用 `quizId`，`writeDocument` 用 `documentId`）。
6. 同名工具多次调用要合成一张卡时加 `aggregate: true` + `itemKey` / `itemsOf` / `withItems`（现网：`searchNotes` 按 path，`webSearch` / `imageSearch` 按 url，`searchNoteImages` 按 src）。
7. 补 `<name>Card.test.tsx`。不要在 `ChatMessage.tsx` 里写工具名字面量。

`ChatMessage` 经 `ToolResultCards` 按 `RESULT_CARD_ORDER` 自动渲染。
