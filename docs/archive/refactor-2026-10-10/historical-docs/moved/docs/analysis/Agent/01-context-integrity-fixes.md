# Agent 上下文完整性修复（挂断 / 项目文件失联 / 历史图片失联）

> **分支**：`fix/agent-context-integrity`（从 `master` 切出）
> **性质**：先诊断再修，每条结论都回到源码复核过；不含未验证的重构
> **相关**：本目录 `00-agent-issues-consolidated.md`（历史清单）。本次修复登记的新编号见 §5

---

## 1. 结论：三个症状，三条根因链

用户报告的三件事（图片分析不了 / 项目文件过一会儿找不着 / 没反应就自动挂断）分别来自**三个独立机制**，
都不是"存储丢了"，而是**发送策略与超时策略**的问题：

| 症状 | 真实根因 | 关键位置 |
|---|---|---|
| 图片下一轮就"看不见" | 请求默认只带**最后一条 user 消息**的附件；历史图被替换成一句占位文本 | `lib/chat/buildRequestMessages.ts`、`lib/chat/executeChatRequest.ts` |
| 项目文件"过段时间找不到" | 正文合计超过 48k 字符后，携带计划从"全带"静默翻成"只带勾选"，且翻转无任何提示；读过的切片不回填 | `lib/project/catalog.ts`（`planCarry`）、`lib/ai/agent/tools/readProjectSlices/tool.ts` |
| 没反应自动挂断 | 首 chunk 之后心跳**永久停止**，客户端 60s 无字节活动即 abort；且不存在"最长等待时间"设置 | `lib/ai/sdk/heartbeat.ts`、`lib/chat/createStallWatchdog.ts` |

**存储层是无辜的**：图片字节一直存在本机 IndexedDB（`chatStorage.saveBlobFromDataUrl`），
`hydrateAttachmentsForApi` 本来就支持对任意消息集合水合。丢的是"**进不进这次 POST**"。

---

## 2. 逐条诊断（含证据）

### 2.1 图片：不是丢了，是没带
- `executeChatRequest` 调用 `hydrateForRequest(..., { messageIds: new Set([lastUserMessageId]) })`，只水合本轮那条。
- `buildRequestMessages` 的 `preserveAttachmentHistory` 默认 false → 历史轮附件被 `historyAttachmentNote` 换成一句
  "字节在本机"。模型只能诚实回答"我看不到图片"。
- 每请求最多 1 张图（`MAX_REQUEST_IMAGES`）、400KB data URL；超 800KB 时 `fitChatRequest` 先丢历史图、再丢本轮图。
- **本轮**图片超限时是**静默 `continue`**：模型收到的消息里没有图、也没有任何说明，只能按纯文字回答——
  用户看到的就是"Agent 没看我的图"。

### 2.2 项目文件：静默降级 + 无记忆
- `planCarry`：`totalChars <= MAX_CARRY_CHARS(48k)` → `mode:"all"`；否则只带 pinned；没有 pinned → `mode:"none"`（**一片都不带**）。
  这个翻转在 UI 上没有任何提示，用户只看到 Agent 回"这一轮没有携带任何切片正文"。
- `getProjectFiles` 的索引**不标**哪些切片本轮读得到 → 模型要先 `readProjectSlices` 撞一次墙才知道。
- `buildProjectCatalog` 目录超 64KB 时**从最后一个文件整片地删** → 排在后面的文件可能整个从模型视野消失。
- 读过的切片不记：同一份文件第 3 轮读得到、第 5 轮读不到。
- 项目归属取的是侧栏全局 `activeProjectId`，不是会话自己的 `folderId` → 从历史打开旧对话会"换户口"。
  这一点有旁证：项目文件窗本来就按 **`active?.folderId ?? history.activeProjectId`** 打开
  （`components/window/WindowTaskbar.tsx:165-174`），也就是说窗口里显示的是**会话自己项目**的文件，
  而请求带的是**全局选中项目**的文件——两边不一致时，用户会看到"窗里明明有，Agent 却说没有"。

### 2.3 挂断：两道闸门
- **服务端**：`withSseHeartbeat` 在 `firstChunkSeen` 后 `stop()`——首 chunk 之后的静默期（深度思考、长工具链）没有任何保活。
- **客户端**：`createStallWatchdog(onStall, 60_000, 5_000)` 一旦 60s 无字节就 `abort()`；且**没有**总时长闸，
  误触发（真死连接）与"跑太久"（正常但很长的生成）给的是同一句话。
- 核实：设置页只有"最大工具调用轮数"，**不存在**"最长等待时间"（此前记为 300s 的印象来自自定义 API 分组的 `timeoutMs`）。

---

## 3. 本次改了什么

### Phase 0 · 不再误挂断
| 文件 | 变更 |
|---|---|
| `lib/ai/sdk/heartbeat.ts` | 新增 `keepaliveWhileIdle` 模式：首 chunk 之后**只在空闲间隔**补 `: heartbeat` 注释，持续有数据时一个字节都不多发 |
| `app/api/chat/route.ts` | 用 `{ keepaliveWhileIdle: true }` 包裹响应流 |
| `lib/chat/createStallWatchdog.ts` | 双阈值：`idleTimeoutMs`(60s) + `maxWaitMs`(默认 300s，0=不限)：`onStall(reason)` 区分 `idle` / `max-wait`；新增 `clampMaxWaitMs`（60s–600s） |
| `lib/stores/settings.ts` + `components/chat/settings/ToolsSection.tsx` | 新增设置「最长等待时间」（秒，默认 300，范围 60–600） |
| `lib/chat/classifySendError.ts` | 两种超时给不同文案：静默超时说"连接没有响应"，总时长超时给可操作指引 |

### Phase 1 · 项目文件不再"失联"
| 文件 | 变更 |
|---|---|
| `lib/project/catalog.ts` | 新增 `summarizeCarry` / `carryNotice` / `withRememberedSlices`；目录裁剪改为**轮转裁**（每个文件至少留一片） |
| `app/api/chat/route.ts` | 降级时经 `data-info` 明确告知"本轮只带入了 X/Y 片…请在项目文件窗勾选后带入" |
| `lib/ai/agent/tools/getProjectFiles/tool.ts` | 索引每片标「已带入 / 未带入」，头部给"X 片可读 / Y 片在册"；文案要求模型对未带入的**别重试** |
| `lib/project/sessionSlices.ts`（新） | `collectReadSliceIds`（从 `tool-readProjectSlices` 结果收集）、`mergeRememberedSlices`（去重 + 上限 200 FIFO） |
| `lib/storage/chatStorage.ts` + `lib/stores/chatHistory.ts` | `SessionMeta.readSliceIds` + `rememberReadSlices` 动作（无新增才落盘） |
| `lib/hooks/useChat.ts` | 携带计划与已读集合并；项目归属改用**会话自己的 `folderId`**，回落 `activeProjectId`；发送后回填已读切片 |

### Phase 2 · 历史图片可恢复 + 预算收敛
| 文件 | 变更 |
|---|---|
| `lib/chat/buildRequestMessages.ts` | 占位文本带 blob id 与「重新带入本轮」指引；新增 `reincludedMessageIds`；**整包最多一张图**（本轮提问优先）；截断时保住被点过带入的消息；**超限图片改为写明原因**而不是静默丢弃 |
| `lib/stores/reincludedAttachments.ts`（新） | 一次性意图 store：`takeForRequest` 读取即清空，不落盘、不跨会话 |
| `lib/chat/executeChatRequest.ts` / `lib/hooks/useChat.ts` | 透传 `reincludedMessageIds`，水合范围同步扩大 |
| `components/chat/ChatMessage.tsx` + `ChatThread.tsx` + `app/styles/prose.css` | 历史带图消息上加「重新带入本轮」开关（`aria-pressed`） |
| `lib/chat/requestBudget.ts` | `fitChatRequest` 瘦身顺序补齐**项目正文**一档（历史图 → 项目正文 → 本轮图 → 较早轮次），并在削完即收手；信息文案合并展示 |
| `lib/ai/prompts/global.md` | 新增「本地资源可见性」一节：三类资源各自怎么读、读不到时让学生做什么 |

---

## 4. 明确**不做**的（以及为什么）

- **不给附件加 TTL / 不清理 IDB**：字节留在本机不占服务端资源，且"ID 拿得到、内容没了"会造出新的不一致。
  需要过期的是"**带不带进本轮**"这个开关，而不是存储。
- **不靠文件路径重读附件**：`absPath` 只在 Electron 下可用，浏览器端拿不到；而把它做成恢复链路会把
  "本地解析"变成"服务端按路径读盘"的越权面。按钮 + 重新水合已经解决同一问题。
- **不动跨会话长期记忆 / 视觉闸门自定义模型**（历史清单 P1-16 / P1-38）：与本次三条根因无因果，避免 PR 膨胀。

---

## 5. 常量基线（本次新增 / 修改）

| 常量 | 位置 | 值 |
|---|---|---|
| `DEFAULT_IDLE_TIMEOUT_MS` | `lib/chat/createStallWatchdog.ts` | 60_000 |
| `DEFAULT_MAX_WAIT_MS` / `MIN` / `MAX` | 同上 | 300_000 / 60_000 / 600_000 |
| SSE 空闲保活间隔 | `lib/ai/sdk/heartbeat.ts` | 15_000 |
| `MAX_REMEMBERED_SLICES` | `lib/project/sessionSlices.ts` | 200（FIFO） |

---

## 6. 验证

新增/更新单测（`node --test` 与 vitest 两套）：

- `lib/ai/sdk/heartbeat.test.ts`：静默期补心跳、持续输出不补、顺序不乱
- `lib/chat/createStallWatchdog.test.ts`：idle 触发一次、touch 推迟、max-wait 总闸、`maxWaitMs=0` 不限、clamp 边界
- `lib/chat/classifySendError.test.ts`：两种超时的文案不同，且不互相误判
- `lib/chat/requestBudget.test.ts`：先砍项目正文再动本轮图；砍到 0 才继续丢图
- `lib/chat/buildRequestMessages.test.ts`：占位含 blob id 与恢复动作、重新带入生效、整包最多一张图、截断不丢被点过的消息、超限图片写进请求说明
- `lib/project/catalog.test.ts`：携带摘要/告警、已读回补只在降级态、回补仍受预算封顶、轮转裁每文件≥1 片
- `lib/project/sessionSlices.test.ts`：脏 parts 不炸、去重、FIFO
- `lib/stores/chatHistory.lifecycle.test.ts`：累计已读、无新增不落盘、会话不存在静默跳过
- `lib/stores/reincludedAttachments.test.ts`：标记/取消、读取即清空、会话隔离
- `lib/ai/agent/tools/getProjectFiles/tool.test.ts`：索引标注已带入/未带入
- `components/chat/ChatMessage.reinclude.test.tsx`：开关渲染与 `aria-pressed` 切换
- `components/chat/settings/ToolsSection.test.tsx`：秒→毫秒、越界收敛

**未验证项（需人工/真机）**：真实上游在深度思考静默期的心跳续期效果；Electron 端按钮交互。
