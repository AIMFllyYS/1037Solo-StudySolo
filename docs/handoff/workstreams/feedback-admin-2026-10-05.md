# FEEDBACK-ADMIN · 2026-10-05 候选实施与验收交接

状态：最小代码候选与必要检查已完成；同一普通账号消息反馈保存/刷新恢复及Edge既有管理员后台同条消费已真实观察。桌面证据已保存，390px与直接HTTP外owner拒绝仍未取得运行证据，等待主独立复核收尾。未提交、未部署。主负责独立验收、Git与全局账本。

## 根因与实际消费链

- 实际消息入口是 `ChatThread / ChatMessage`：非流式、存在 sessionId 且最终 answerText 非空时渲染 `ChatFeedbackActions`。复制沿既有 `copyTextToClipboard`；右键沿既有 `openMessageMenu / MessageContextMenu`。本包没有改已验 UI 消费者。
- 原反馈链已经存在：按钮 → `POST /api/feedback/chat` → live Account introspect 的 `identity.user_id`（Account UUID）→ `ss_chat_feedback_vote / ss_chat_feedback_report` RPC、本人 CAS 补充说明 → `ss_chat_feedback`。
- 官网实际入口是 `/1037solo-admin/feedback`，既有 AdminFrame 导航“用户反馈 / 对话反馈” → `AdminFeedback` → `/api/admin/feedback` → 同一个 `ss_chat_feedback`。API与管理页面 shell 都经 `context(request,true)`；Account live 验证 `is_admin` 与 aal2，更新另需 recent auth。不是 `/admin/feedback`，也不靠邮箱名单或前端自报 UUID。
- 确认断点：反馈组件只有 React 内存；原 API 没有本人反馈恢复动作，刷新/虚拟列表重挂后点赞、点踩、举报和说明状态消失。异步写也没有 owner epoch 保护，切账号后旧结果可能恢复旧按钮/弹窗。原失败仅局部 alert，未接已有 toast。
- 现有表包含 vote/report 唯一槽、Account UUID、revision、说明/摘录、处理状态；无需新表、新字段或迁移。源码 `202610040003`、`004` 和现有服务表权限定义只作只读核对，未应用/重放 SQL；不改006。

## 最小修复与复用

- 同一个 POST API增加只读 `action=state`：只接受 sessionId/messageId，Account UUID从服务端实时验证取得；查询同时过滤三个字段、最多2行，响应仅为客户端需要的 id/type/revision/status/reason/主动说明/主动摘录。不会读取聊天正文、邮箱、其他用户或管理处理人字段，也不改变反馈记录。
- 只读动作使用独立每用户读限流120/min，写限流仍30/min。保留同源防护、私有 no-store 响应与现有桌面 POST桥接，不改桌面/core白名单。
- 组件在挂载、消息位置变化与既有 `onStorageOwnerChange` 时恢复当前账号状态；切账号/卸载 abort未完成请求并清空当前反馈弹窗。所有写结果检查 owner/epoch/signal；旧账号结果丢弃。读恢复也检查本组件 mutation revision，迟到读不能覆盖新点赞或正在填写的举报。
- 点赞/点踩仍等待实际保存成功再打开原说明dialog；取消说明保留已经保存操作。相同票重复点击打开原说明，不制造重复行。举报仍要求原因与主动输入说明，失败保留表单供重试。原CAS stale说明及重试路径保留。
- 失败沿 `useToast / ToastHost` 通知，同时保留原表单可访问错误；复制沿原helper。复用现反馈dialog、`app-dialog`/semantic tokens、overlay/Escape stack和原聚焦/Tab行为，没有另造菜单、弹窗或卡片体系。
- 官网仅反馈域增加现 `list.reload` 刷新按钮和“最近更新”列；API按 updated_at/id倒序，补充说明后的旧记录可回到当前列表前面。仍使用原筛选、分页、DataTable、Badge、Toast与导航，不改其他admin/会员域。

## 基线与精确候选范围

StudySolo基线：`18ce822974c95250b4c7d6128c5fa539c55a3c3f`；分支 `codex/unattended-agent-platform-2026-10-04`。入场已有Review20文件候选（完整名单见 `review-notes-2026-10-05.md`）及主账本变更；均未编辑。已验UI及会员提交未重做、未reset/stash/夹带。

StudySolo本包4个代码/测试文件及本报告：

| 文件 | 冻结 SHA256 |
| --- | --- |
| `components/chat/ChatFeedbackActions.tsx` | `C0BB1BF04A9A4786670D52B01FF7B310AD9F3779B8060E6F3947B92AD2E8F8D3` |
| `components/chat/ChatFeedbackActions.test.tsx` | `EEB59F8B524FC76601113DC64AB688D2016632B6A1CB7345FD388CF23EABA1EA` |
| `app/api/feedback/chat/route.ts` | `AFF2773503CDCBAC4669D250B75CA9E6C250C4C7D3F3C9222A2E7EC9507E744C` |
| `app/api/feedback/chat/route.test.tsx` | `66A25A503B5F7E02CFD122770455536F3881DE5E77A4A0EE7D7E0A7D429D6B4B` |

Landing基线：`116a5415ec9c622deb685e0b93625d5919d100bd`；分支 `codex/studysolo-chat-feedback-2026-10-04`。入场已有README、member API、admin frame/kit/overview、CONTENT-PRESERVATION/QA、frontend会员/相机/样式与ecosystem-server等变更，另有promo API和product-hover未跟踪文件；全部保留且不纳入本包。

| Landing候选文件 | 冻结 SHA256 |
| --- | --- |
| `components/admin/feedback.tsx` | `EA0755BDDDAC3D20B647896DEC8BF2FCA99A934C0A3CB460F2B20F010F31076F` |
| `app/api/admin/feedback/route.ts` | `4EEA685780D04BF137028D1444DF181D3AF15C60AA684E5051E1540989DFCBA1` |

没有SQL、env/credential、RootSolo、会员定价、Review、MCP/Cloud/沙箱/core/预算、下载或客户端变更；没有commit、push、部署、SSH或正式站端测。

## 必要检查

| 检查 | 结果与边界 |
| --- | --- |
| 反馈React组件 | 7/7通过：恢复/remount及原说明、取消保留、旧owner迟到写丢弃、迟到读不能覆盖新票、聚焦保护、先保存后弹窗/摘录主动勾选、失败toast与重试、CAS stale关闭重评 |
| API定向React/Vitest | 12/12通过：包含新state本人过滤/返回字段/无RPC变更/拒caller身份，原Account/同源/CAS/脱敏/桌面桥接与失败路径 |
| 真实ChatMessage消费者定向React | 2/2通过；仍是模拟React渲染，不是浏览器最终业务证明 |
| 原摘录脱敏定向React | 3/3通过 |
| Landing现Node admin策略 | `node --experimental-strip-types --test tests/admin-feedback.test.mjs`，2/2通过；证明策略用Account live与实际UUID、非admin被拒，尚不代表真实HTTP拒绝 |
| ESLint | Study本包4文件、Landing本包2文件均通过 |
| Study标准typecheck | `pnpm typecheck`退出0；未删检查或排除源文件 |
| Landing标准typecheck | 初次因旧`.next/types/validator.ts`仍引用已迁移的`app/admin`路径失败。`npx next typegen`修复生成声明；恢复工具自动改动的tracked `next-env.d.ts`到入场内容后，`npx tsc --noEmit --incremental false`再次退出0。没有tsconfig豁免、源码绕过或整仓build |
| 差异检查 | 两仓本包 `git diff --check`通过；Windows行尾提示无空白错误 |

首轮24项定向React中23通过、1失败原因是新增测试误取“取消”而原文案为“暂不补充”；修正测试及afterEach cleanup后仅重跑受影响组件7/7，全组最新源对应24项通过。未跑整仓CI/build；整条简单线结束由主统一CI。

## 恢复后的真实本机验收

恢复入场Study HEAD为Review已验提交 `b25388e823b3ccc1a972bdcccdf62faad7bebef7`；上述六文件SHA256全部匹配，真实验收没有新增源码修改，因此未重复无意义技术检查。新增浏览器候选、sandbox只读报告和Landing其他dirty仍未编辑。主已自行恢复Root受管Study35349；Landing1037与Account3040/3041直接复用，没有启动或停止服务。

本worker实时辨认浏览器family：Chrome1、Edge2；仅使用自己新建标签，不占此前Review/UI/Supabase标签。Chrome普通账号显示名为 `workflow-acceptance-1002`；后台本次public行给出服务端归属UUID `489d3980-799b-4f66-b28e-480bd12762b8`。UUID只作必要metadata，未读取cookie/token/隐藏store或记录联系方式。

本次自建公开消息：`FEEDBACK-PUBLIC-20261005`，请求仅一句话回答2+2，不调用工具、不读私人内容；实际回答 `4。`。真实session为 `4df3bda6-6358-4b97-a6f4-bc35e84d2aaa`，assistant message为 `90542001-4335-4107-b24a-fd2c0d114157`。消息ID取实际DOM，session/owner取已授权后台本public行的DOM title。

| 实际动作 | 观察结果 |
| --- | --- |
| 复制 | 原复制按钮点击后clipboard确为本次公开答案`4。` |
| 点赞先保存 | 点击后三个反馈按钮先disabled、无说明dialog；成功后like=true并出现原“评价已记录”说明dialog |
| 取消保留 | 点击“暂不补充”后dialog关闭、like=true；整页刷新后相同消息like=true |
| 重复点赞 | 相同票打开原说明，未另造UI或新消息；后续后台同消息只有一个vote槽 |
| 切点踩与补充 | dislike保存后说明dialog出现；主动填写带公开标记的说明，提交后关闭；未勾选摘录 |
| 点踩刷新恢复 | 刷新后dislike=true；打开原说明textarea完整恢复已写公开文字 |
| 举报失败与重试 | 初次及一次有限重试收到实际“请先完成账号两步验证”；原原因/文字保留、提交按钮恢复可重试。没有绕过MFA或Auth源码修改 |
| MFA完成后的最新举报 | 主转达人类已完成账号验证；保存原公开草稿并正常刷新现Study会话，重新提交成功：“举报已记录”、report=true。此前MFA失败不是最新状态 |
| 举报刷新恢复 | 再次刷新后dislike=true、report=true；原举报dialog恢复reason=other与完整公开说明 |
| 既有后台消费 | Edge已有正常管理员+aal2会话直接进既有后台，无重新登录；原“刷新列表”后，本次相同owner/session/message出现2行：点踩公开说明和举报“其他问题”公开说明。两行均“待处理”“用户未附摘录”，同一消息一个vote槽和一个report槽 |
| 普通账号真实管理门 | Chrome用户完成MFA后正常进入后台，server shell明确“当前账号没有管理权限”，本public row计数0。该截图证明实际服务端页面门拒绝；不把它写成独立HTTP API攻击测试 |
| 桌面布局 | 实际innerWidth2048/height1146，document clientWidth=scrollWidth2048，无页面横向溢出。原四个动作与dialog可用；截图已观察 |

举报说明明确写“此数学答案无实际违规，仅核对既有后台反馈链”；点踩说明明确写“答案正确，此记录仅用于测试反馈闭环”。公开测试反馈留存，不删除旧反馈或用户数据，不操作其他人的处理状态。Edge列表有其他行，读取只限定本public标记的2行，没有输出其他正文。

历史首轮曾因本机服务未恢复延期；2026-10-05人类已授权Agent CLI自治恢复，旧等面板令牌/用户双击约束已撤销。本次服务正常，上述普通反馈和后台消费不存在该旧阻断。主另接人类明确请求维护指定账号admin身份，该维护不属于本worker代码/SQL范围；本worker没有改Account角色/MFA/白名单。

## 真实证据与剩余边界

证据目录：`artifacts/performance/feedback-admin-2026-10-05/`（截图为实际JPEG，metadata JSON仅含本次公开位置及验收布尔值）：

- `vote-saved-before-details-desktop.jpg`：原说明dialog显示“评价已记录”。
- `public-feedback-saved-desktop.jpg`：同公开消息点踩/举报状态已保存。
- `vote-details-restored-desktop.jpg`：稳定原dialog中的刷新后公开点踩说明；首次抓帧早于弹窗绘制，已按新鲜AX状态重新覆盖正确画面。
- `report-details-restored-desktop.jpg`：刷新后原举报原因/公开说明。
- `report-mfa-failure-preserves-form.jpg`：早期实际失败时公开表单保留，已由后续正常会话提交成功取代。
- `admin-mfa-required.jpg`：早期Chrome Account要求开启MFA，历史依赖证据，不代表当前状态。
- `nonadmin-denied-after-mfa.jpg`：用户MFA完成后Chrome真实无管理权限门。
- `runtime-metadata.json`：本次owner/session/message和实测结果，未含token、邮箱或私人正文。

待主收尾的精确边界：

1. **390px仍未verified**：按工具公开viewport.set方法、以及主此前有效的同Chrome `cua.getBrowser({id:当前ID})`绑定方法，设置390×844并收集AX/DOM后，实际innerWidth仍2048。有限复核后reset；没有把桌面截图冒充390。等待主独立短390验收，worker未改样式迎合工具。
2. **后台裁剪截图尚缺**：本public行实际DOM与刷新可重复核对；两次仅裁剪本行的Edge截图遇Page.captureScreenshot超时，未循环。没有保存可能含其他记录的全页图、没有假造后台图。主独立截图可补。
3. **直接HTTP边界仍需区分**：普通账号真实server页面门已经拒绝；直接导航管理JSON API被浏览器客户端拦截，未取得独立HTTP状态码，不冒充API测试通过。外owner实际覆盖请求在当前合法GUI中没有发起入口；未为凑证据复制cookie、读取隐藏React/store状态或新增harness。既有service端AccountUUID/CAS筛选、定向API与admin策略测试仍是技术证明，不能泛化成真实多账号攻击测试。

六源码/测试SHA仍与上表完全一致。当前主可独立验公开消息保存/恢复和Edge同条消费；未由workercommit或写全局账本，也未把剩余边界写成完整交付。
