# DeepSeek 本地失败：Unicode 请求修复

日期：2026-09-13。范围：修复已定位的本地请求 400；不重置浏览器、不迁移或删除历史数据、不修改中转模型参数、不发布生产。

## 根因与证据

`htmlToSummary()` 按 UTF-16 单元执行 `slice(0, 120)`。旧演示正文中的 emoji 恰好跨过截断边界，生成末尾为孤立高代理项 `\uD83D` 的 120 单元摘要。`collectRequestArtifacts()` 又把全局最近演示附加到每次聊天请求，导致无关会话也携带该摘要。

诊断对照结果：原开发请求、绕过 Next fetch 的请求、Node 原生 fetch 重放均返回 400；包含孤立代理项的最小请求返回 400；有效 emoji 请求返回 200；原失败 system 提示词仅修正为 well-formed Unicode 后返回 200。中转返回的错误仅为 `AI_APICallError / invalid_request_error`。

因此，此次问题不是已证实的开发代理、登录、DeepSeek 模型名称或思考参数问题。开发端与生产端的本地持久化数据不同，解释了端测差异；不能据生产当前成功断言旧代码没有同类风险。

## 正式修改

- `lib/utils/unicode.ts`：按 Unicode code point 安全截取，替换孤立代理项，递归修正 JSON-like 文本值。有效中文、emoji、组合字符保持原样；二进制、URL 和其他非普通对象保持原对象。
- `lib/context/compactArtifacts.ts`：摘要生成不再截断 emoji；旧摘要和目录行安全修正；只收集当前会话 `renderInteractive` / `getArtifact` 的显式引用，去重并保留最近 16 个。不再混入全局最近演示，完整 HTML 仍可按需取回。
- `lib/ai/sdk/languageModel.ts`：在共享模型工厂的请求边界处理 `prompt` 与工具定义，覆盖非流式、流式和后续工具步骤；内置与用户自定义协议都经过此边界。处理的是发送副本，不改写用户持久化原件，不触碰密钥。不会逐段修正流式输出，以免误处理跨 chunk 的合法字符对。
- 增加可重复运行的 `scripts/verify-unicode-live.ts --live`，通过真实工厂发送合成残缺摘要；不读取用户会话、不输出密钥。

## 真实验收

在用户原 Chrome 标签页 `http://localhost:35349/medical-english/textbook/ch01`，保留现有长会话、历史工具结果和本地演示，无清缓存、换端口或空白存储：

1. 选择现有内置 DeepSeek V4.1 Flash，发送连接测试，页面实际显示 `连接正常📖`，恢复发送按钮。
2. 开启 High 深度思考，发送 `17×19` 测试，页面显示已处理 6 秒及正确答案 `323`，正常结束。
3. 合成旧版残缺摘要通过真实模型工厂：非流式和 High 流式均准确返回 `UNICODE-OK`；实际模型均为 `deepseek/deepseek-v4.1-flash`，没有替换成其他模型。耗时约 2.0 秒 / 1.5 秒。

验收新增的两条测试消息保留，没有删除用户会话。之后观察到用户已切换学习章节并准备附件，停止进一步浏览器操作，没有清空其输入；High 模式保留。

## 回归覆盖

- 精确 emoji 截断边界与孤立高/低代理项。
- 旧目录摘要兼容、原件与未变化对象保持不变。
- 新会话不混入全局演示、当前会话引用去重及最近 16 个上限。
- OpenAI 兼容非流式/流式真实序列化请求：system、用户文本、工具结果及工具描述。
- 原生 Anthropic 自定义 API 仍使用 Messages 协议及原鉴权方式，同时受 Unicode 边界保护。
- 完整 `/api/chat` → SDK transport → 工具调用 → `getArtifact` → 第二步模型 → UI 消息：旧摘要和旧正文被修正，原件不变。

## 工程检查结果与边界

- Node 代码测试：最终低并发完整重跑 **1002/1002 通过**。此前默认高并发的一轮出现既有 heartbeat 定时测试抖动（预期至少 2 次心跳，实际 1 次）；未改其生产代码或放宽断言，使用 4 个并发 worker 完整重跑通过。
- React / Vitest：**84 文件、325/325 通过**（本轮执行时快照）。
- TypeScript：构建内检查及构建完成后独立检查通过。一次与 Next build 同时运行的独立检查碰到 `.next/types` 正在重建，构建结束后重跑通过；这两个检查应串行执行。
- 生产构建：成功，**1219/1219** 页面生成完成。仍有既有 KaTeX 字符 metrics 警告，不属于本次模型请求修复。
- 本次修改涉及的所有 TS 文件 ESLint 通过，`git diff --check` 通过，密钥扫描通过。
- 全仓 ESLint 首次通过；期间工作区新增了本轮未编辑的 `components/ui/AnchoredMenu.tsx` 等 UI 文件，最后一次全仓检查在该文件第 101 行报告 `react-hooks/refs`。未覆盖这些并行改动。Knip 同期提示新增的 `InputLimitDialog.tsx` / `AppSelect.tsx` 暂未引用，另有既有配置提示；不据此删除它们。

没有提交、推送或线上部署；未重启用户正在使用的 35349 开发服务，也未清理任何浏览器数据。结果证明本次 Unicode 缺陷已修复，不代表并行菜单工作及所有上游模型权限均已验收。
