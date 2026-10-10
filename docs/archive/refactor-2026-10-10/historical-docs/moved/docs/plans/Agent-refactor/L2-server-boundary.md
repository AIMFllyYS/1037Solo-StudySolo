# L2 · 服务端边界

> **一句话**：把「主聊天有纪律、卫星路由没纪律」这个结构性差异补平——错误一律脱敏，入参一律有上限，role 一律过滤。
> **Issue**：#95 #96（2 个 P0）
> **来源 Epic**：E9 #35
> **冲突域**：`CD-satellite`（#95）+ `CD-route`（#96）
> **顺序**：紧跟 L1。**不能与 L1 并行**——#95 改的就是 L1 刚为额度闸门打开过的那 8 条路由。

## 1. 为什么这 2 个号是一个 loop

它们是同一条结论的两面：**服务端从未设定过「不可信输入 / 不可信输出」的边界。**

- 出方向：`/api/chat` 有 `toChatErrorMessage`，卫星路由把上游原始响应体直接回显。
- 入方向：客户端约定（只发 user/assistant、`MAX_SKILLS = 20`）被当成了服务端边界，直接打 API 就能绕过。

而且它们改的是同一批文件。L1 的 A3 阶段为了加额度闸门要在这 8 条路由各插一个 helper 调用；L2 紧接着在同样的 8 个位置插脱敏与上限。A 不用重新建立「8 条路由长什么样」的认知，这是把它们放在一起、且紧跟 L1 的全部理由。

这个 loop 很小，**一个 A 阶段就够**。

## 2. 当前基线（已核实）

### 2.1 脱敏只有主聊天在用

`lib/ai/sdk/errorMessage.ts` 的 `toChatErrorMessage(error, secrets = [])`（第 2 行）已经做得相当完整：

- 沿 `lastError` / `cause` / `errors` 链最多走 8 层找叶子 message
- 认 `EACCES` / `EPERM` / `ENOTFOUND` / `EAI_AGAIN` / `ECONNREFUSED` / `ECONNRESET` / `ETIMEDOUT` / `UND_ERR_CONNECT_TIMEOUT` / `AbortError` / `TypeValidationError` / `JSONParseError`，各给一句中文
- 认 HTTP 401 / 403 / 404 / 429
- 第 40 行起：把传入的 `secrets` 逐个替换成 `[已隐藏]`，再打码 URL → `[API 地址]`、`Bearer xxx`、`sk-xxx`、`api_key|authorization|token|password` 的值
- 只留首行、截断 240 字

**问题不是这个函数不够好，是只有一个调用方。** 卫星路由各写了一套：

**分两档，处理方式不同**（实地核实，比 Issue 正文更细）：

**档一 · 真的回显上游响应体（3 条，优先修）**

| 路由 | 现状 |
|---|---|
| `app/api/canvas-revise/route.ts:81-85` | 502 返回 `${err.statusCode} ${(err.responseBody ?? '').slice(0,300)}`；**422 还额外带 `rawOutput`** |
| `app/api/record/route.ts:249-252` | SSE 里 `接口返回 ${status}：${responseBody.slice(0,300)}` |
| `app/api/image-gen/route.ts:102-109` | `生图 API 返回 ${status}：${parsed.message \|\| errText.slice(0,300)}`，且**透传上游 status** |

**档二 · 不回显上游，但也没脱敏（2 条）**

| 路由 | 现状 |
|---|---|
| `app/api/artifact/route.ts:99-105` | catch 里 `String(err.message)` |
| `app/api/document/route.ts:106-112` | 同形 |

这两条不泄漏 `responseBody`，但 `err.message` 里仍可能带 URL 或 key 片段，改走 `toChatErrorMessage` 即可，风险与工作量都比档一小。

`/api/chat` 传 secrets 的正确用法（照抄）：

```76:78:app/api/chat/route.ts
      const secrets = [body.customProvider?.apiKey, ...customGroups.map((group) => group.apiKey)]
        .filter((value): value is string => !!value);
      const formatError = (error: unknown) => toChatErrorMessage(error, secrets);
```

> `toChatErrorMessage` **本身不序列化 `responseBody`**，这一点已核实——它只取 cause 链上的 `message` 叶子再打码。所以接进去就是安全的，不需要额外包一层。

### 2.2 入参完全没有服务端上限

`lib/ai/agent/requestSchema.ts` 全文件**零个 `.max()`**：

```ts
// 第 26-31 行
const uiMessageSchema = z.object({
  id: z.string().optional(),
  role: z.enum(["user", "assistant", "system"]),   // ← 允许 system
  parts: z.array(z.record(z.string(), z.unknown())), // ← 无数量 / 体积上限
  metadata: z.unknown().optional(),
});
```

```ts
globalContext: z.string().default(""),        // 无长度上限
skills: z.array(skillSchema).default([]),     // 无数量上限
customApiGroups: z.array(customApiGroupSchema).default([]),  // 无数量上限
messages: z.array(uiMessageSchema).default([]),              // 无数量上限
```

schema 顶部的注释写明是**刻意的宽松策略**：「未知字段忽略、类型不符回退默认，避免因客户端旧版本字段而 400」。这个意图要保留——加上限不等于把兼容性改严。区别在于：**兼容旧字段** 与 **接受无界输入** 是两件事。

**⚠️ 更严重的一层：只有 `/api/chat` 有 zod，其余 5 条卫星路由根本没有校验。**

| 路由 | 接收方式 |
|---|---|
| `/api/chat` | `chatRequestSchema`（唯一有 zod 的） |
| `/api/artifact` | `Array.isArray` 手判（`route.ts:23-24`） |
| `/api/document` | 直接 `as CustomApiGroup[]` 强转（`route.ts:21-22`） |
| `/api/image-gen` | 无（`route.ts:35-36`） |
| `/api/record` | 无（`route.ts:140-141`） |
| `/api/canvas-revise` | 无（`route.ts:25`） |

也就是说 #96 的实际范围比正文写的大：不是「给 `/api/chat` 加上限」，而是**5 条卫星路由连类型校验都没有**。`as CustomApiGroup[]` 这种强转在收到畸形数据时会一路带到 `resolveProvider`。

这条抬高了 #96 的价值，也解释了为什么它要和 #95 放在一起做——A 反正要打开这 8 个文件。

`app/api/chat/route.ts` 的 `toModelMessages` 只过滤 part 类型，不过滤 role。客户端侧的限制（`lib/chat/buildRequestMessages.ts` 只留 user/assistant、`lib/stores/skills.ts:8` 的 `MAX_SKILLS = 20`）是约定，不是边界。

### 2.3 已经就位、可以直接用的

- **闸门已在前面**：#63 的 `proxy.ts` 已经拦住 8 条付费路径的匿名访问，`lib/auth/rateLimit.ts` 有 per-user 30/60s 限流。所以 L2 不需要考虑「匿名打爆」，只需要考虑「已登录用户递交恶意 / 超大入参」。
- **`toChatErrorMessage` 的 `secrets` 参数**：卫星路由接入时要把本次用到的 apiKey 传进去，否则密钥只靠正则兜。`/api/chat` 已经这么用了，照抄。

## 3. 分阶段实施

### 单阶段 A · #95 + #96

**#95 卫星路由统一脱敏**

1. **先修档一那 3 条**（2.1 的表）：删掉 `responseBody.slice(0, 300)` 与 `rawOutput`，改走 `toChatErrorMessage`，并把本次请求用到的 apiKey 作为 `secrets` 传入（照抄 `chat/route.ts:76-78`）。
2. `image-gen` 不再透传上游 status。对外只暴露一个自有的状态码（建议统一 502 表示「上游失败」，401/403/429 这类可透传语义的可保留，但 body 一律脱敏）。
3. 再把档二那 2 条（`artifact` / `document`）的 `String(err.message)` 也接进 `toChatErrorMessage`。`chat-title` / `follow-ups` 一并过一遍。
4. 如果某条路由现在靠上游文案给用户提示，替换成 `toChatErrorMessage` 的对应分支；不够用就往那个函数里加分支，**不要在路由里再写一套**。

**#96 role 过滤与入参上限**

1. `uiMessageSchema.role` 从枚举里去掉 `"system"`，或者保留枚举但在 `toModelMessages` 里丢掉 system 消息。二者选一，不要两处都改一半。推荐**在 schema 层拒掉**（更靠前，也更好测），同时在 `toModelMessages` 留一道兜底过滤。
2. 加服务端上限。建议值（与现有客户端约定对齐，留一点余量，不要卡死正常使用）：

| 字段 | 建议上限 | 依据 |
|---|---|---|
| `messages` 数量 | 200 条 | 客户端软上限截断后只发 16 条；200 留足历史回放余量 |
| 单条 `parts` 数量 | 64 | 正常一条消息不会超过个位数 part |
| `globalContext` 长度 | 32 KB | 它是用户在设置里手填的全局背景 |
| `skills` 数量 | 32 | 客户端 `MAX_SKILLS = 20` |
| 单个 skill `content` 长度 | 32 KB | |
| `customApiGroups` 数量 | 32 | #71 之后这里只会剩本次用到的那一个，上限只是兜底 |
| file part 的 base64 体积 | 与现有附件上传上限一致 | 先去读客户端现在允许多大，服务端取同值或略宽 |

   具体数字定下来后写进 `lib/ai/agent/requestSchema.ts` 的注释，并在超限时返回**可读的中文提示**（不是裸 ZodError）。
3. 超限的错误要能被路由转成用户可读事件——`parseChatRequest` 现在抛 `ZodError` 由路由处理，确认这条链在加上限之后仍然给出人话。

3. **给 5 条卫星路由补 zod**（见 2.2 的表）。最省事的做法是把 `customApiGroupSchema` 等公共片段从 `requestSchema.ts` 抽出来复用，各路由再加自己的字段。`document/route.ts` 的 `as CustomApiGroup[]` 强转必须去掉。
4. 卫星路由的入参上限一起收（`artifact` / `document` 的 prompt、`canvas-revise` 的 HTML）。#96 正文只点了 `/api/chat`，但 2.2 的发现说明卫星侧缺口更大。把它们一起做掉，并在交回摘要里写进「超出 Issue 正文但属同一缺陷」。

## 4. 不变量

- **`toChatErrorMessage` 的行为不得削弱。** 它已经是多轮调过的，`secrets` 替换在正则打码**之前**执行（第 40 行），这个顺序不能反——反了的话完整密钥可能先被 URL 正则吃成 `[API 地址]` 的一部分从而漏过替换。
- **schema 的宽松兼容意图保留。** 未知字段继续忽略、类型不符继续回退默认。加的是**体积与枚举**的边界，不是字段严格性。
- **不要破坏 #66 的记账。** 这 7 条路由里的 `settleUsage` 调用位置不能动；脱敏改的是返回，不是结算。特别是 `canvas-revise` 的现状是「`generateText` 成功后先记账，即使后续解析失败返回 422 也已记」——这是对的（钱已经花了），不要因为改错误处理而把记账挪到 422 之后。
- **不要动 `proxy.ts` 的 matcher**。
- 8 条路由的 `maxDuration`（artifact 720 / image-gen 180 等）不要改。

## 5. 陷阱

1. **`image-gen` 透传 status 可能有客户端依赖**。改之前先搜客户端有没有按 status 分支的逻辑，别把「额度不足」的提示改成一句「上游失败」。
2. **role 过滤别把 `system` 静默吞掉又不告知**。如果选 schema 层拒绝，要给明确提示；如果选过滤，要在日志里留痕（#52 的 JSONL 已有通道）。
3. **上限设太紧会打断正常使用**。附件体积这一项必须先读客户端现有限制，不能凭感觉写数字。
4. **knip**：如果把上限常量抽成新模块，必须有测试 import。
5. 卫星路由的错误分支往往没有测试覆盖，改完要补——这正好是 #100 的一部分，但本 loop 自己的改动自己补测，不要留给 L7。

## 6. 合并验收

**#95**
- [ ] 所有卫星路由的错误响应不再包含上游原始响应体
- [ ] 错误信息中不出现任何密钥或完整 URL
- [ ] 用户仍能看懂出了什么问题（不是一句无信息量的「失败」）

**#96**
- [ ] 客户端传 `role: "system"` 时被服务端过滤或拒绝
- [ ] 超大 `globalContext` / `skills` / 附件被拒绝且提示清晰
- [ ] 正常使用不受影响（正常长度的对话、技能、附件全部照旧）

**门禁**
- [ ] `pnpm test` exit 0、`pnpm lint` exit 0
- [ ] 新增的脱敏与上限分支有测试

## 7. Loop 末尾端测脚本

1. 已登录态正常发一轮对话（**用免费 / 自备模型，不打真实付费模型**）→ 正常出答案，说明上限没卡死正常路径。
2. 用浏览器 `fetch` 直接打 `/api/chat`，body 里塞 `role: "system"` 的一条消息 → 断言被拒或被过滤，且响应里没有上游信息。
3. 用浏览器 `fetch` 打 `/api/chat`，`globalContext` 塞 1 MB 字符串 → 断言 4xx + 可读中文提示。
4. 制造一次卫星路由失败（例如在设置里把自定义分组的 baseUrl 改成一个不存在的域名，再触发 artifact 或 canvas-revise）→ 断言前端看到的错误里**没有** URL、没有 key、没有上游 JSON 片段。
5. 控制台无 500、无 `proxy.ts` / matcher 报错。

端测者交回 `tmp/issues/boundary-l2-e2e.md`。

## 8. 提交与关单

一个 A 阶段，建议 2 个 commit：

| commit | 内容 | Closes |
|---|---|---|
| `fix(security): redact upstream errors on satellite routes` | #95 | `Closes #95` |
| `fix(security): reject invalid roles and unbounded payloads` | #96 | `Closes #96` |

## 9. 风险与放弃条件

| 风险 | 处理 |
|---|---|
| 上限值设错，打断正常长对话或大附件 | 端测第 1 项就是为此。附件上限必须对齐客户端现值，不要自己发明 |
| 脱敏把有用的诊断信息也吃掉，以后排障变难 | 原始错误仍应进 #52 的 JSONL 服务端日志（那是本地文件，不经用户），只有**返回给前端的**才脱敏。这条要写进 A 的提示词 |
| `image-gen` 的 status 语义被客户端依赖 | 改前先搜；保留可透传的语义化 status，只改 body |

这个 loop 两个号都是 P0 且改动面小，不应该放弃。如果 C 之后仍不通过，大概率是上限值定得不合理——回到第 3 节重定数字，而不是打 `blocked`。
