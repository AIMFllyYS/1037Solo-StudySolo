# BROWSER-BASICS · 2026-10-05 候选实施与验收交接

最新状态（2026-10-07）：十文件网页候选已冻结并由主实际验收 Studio/Agent 两种消费者；缩放、复位、真实刷新、两窗隔离、菜单键盘及1280/390基础布局通过。按本包网页验收准则准备精确任务分支提交。外部动作实际创建目标URL/标题的新标签，第三方正文读取工具仍超时，保留覆盖限制；native_verified=false，原生真包与外部系统浏览器验证仍归后续CLIENTS。反馈认证待验，不称SIMPLE整线或全局目标完成。

## 实际入口、已有能力与根因

- 网页 Studio 右栏 `components/layout/RightPanel.tsx`、中央资源区 `components/layout/center/CenterWorkspace.tsx`、`components/layout/AppShell.tsx` 的通用浏览器资源窗消费同一个 `components/browser/BrowserTab.tsx`。右/中央顶部书签设置复用同一个 `BrowserSettingsButton`。Agent「添加内容→输入网址」与来源预览另走 `openSourcePreview → ManagedWindow(type=source-preview) → SourcePreviewViewer / SourcePreviewWindow`；这是本轮主实际打开网址后确认、原六候选漏覆盖的消费者。保留原两类宿主，不重建 BrowserPanel/BrowserWindow。
- 基线已实现默认 100%、50–200% 范围、10% 步长的放大/缩小/复位/菜单刷新。web 的 `FramedSite → computeIframeZoomLayout` 同时改变 iframe 逻辑宽高与外层 `transform: scale()`，并非只修改百分比；native 的 `WebviewSite` 已通过现 `window.desktop.isElectron` 特征开关使用 `<webview>`，由 `setZoomFactor` 改变真正页面 zoom，`reloadNonce → reload()` 刷新。全部保留，不修改正确默认比例、算法或现存偏好。
- 源码未发现强制放大超过 100% 的新安装默认。用户“缩放太大”的具体呈现原因仍须真实服务核验，不能以源码和数学测试宣称已经复现/修复该视觉症状。已有旧偏好、视口模式和实际内容均可能影响观感，本包保留它们并验收现缩小/复位路径。
- 确认的源码断点：native `did-navigate / did-navigate-in-page` 原来仅更新地址输入值，顶部外部打开与 webview 错误回退仍用原请求 URL，站内导航后会打开旧页；地址草稿也不等于已打开页面。本包只补当前 guest URL 的局部状态投影，不再导航 guest、不制造第二浏览器 store。
- 2026-10-07 主实际 Agent 访客网址窗仅有「打开原页面」，来源 iframe 固定 1:1，来源 `WebviewSite` 未传 zoom/nonce，因此通用 BrowserTab 的正确控制不在该用户实际入口。本轮最小补真实来源消费者；这是明确复现的控制缺失，不宣称已复现某私人站点的所有视觉问题。
- 收藏/主页设置此前有独立手写 portal、定位、mousedown 和 overlay 栈；未复用公共菜单碰撞/滚动/键盘逻辑。基础工具栏多处固定按钮缺少 `shrink-0`，地址输入缺明确零基础宽度；本包统一此处收缩契约，真实窄屏几何仍待验。

## 最小变化与复用

- `BrowserSettingsButton` 改用已有 `AnchoredMenu`，沿用主题 tokens、现图标、共享 portal、viewport collision、scroll/resize 定位与 Escape。新增收藏/选择收藏关闭后焦点回到原触发按钮。设置包含输入框，保留输入、光标和自然 Tab，不让操作菜单 typeahead 消费正文；按 Enter 添加收藏阻止默认点击，避免还焦点后菜单被再次打开。主页保存仍走原 store；未引入新通知/设置体系。
- 收藏删除按钮保持原功能，只将 hover 才可见改为常显并补可访问名称，使触摸和键盘有入口。未删除任何用户书签/数据。
- `BrowserTab` 主容器 `min-w-0`、固定按钮 `shrink-0`、地址输入 `w-0 min-w-0 flex-1` 和 label；长 URL 保留在输入自身滚动。原生 guest 没有实现 iframe 视口模式切换，因此原生不展示只改变偏好却不改变呈现的手机模拟按钮；web 原正确视口模式保留。
- native 外部打开依据 guest 最近 URL，先走原 `safeHttpUrl`。地址输入草稿不改变外链；非 HTTP(S) 导航外链无 href/禁用；选择新页面重置当前投影。`WebviewSite` 错误回退同样使用当前安全页面地址。没有改 Electron 主进程现 `openExternalSafe / setWindowOpenHandler` 协议策略。
- 继续用现 web iframe sandbox、`useEmbeddable → canEmbed → /api/can-embed → probeEmbed` 预检与 `EmbedFallback` 外部打开。没有加入站点代理、跨源 DOM 注入、CORS/X-Frame/CSP 绕过或另一 WebView 库。

### 2026-10-07 来源消费者补齐（最新冻结候选）

- 将 BrowserTab 原放大/缩小/复位/刷新 `AnchoredMenu` 抽为受控、无业务状态的 `PageControls`。原菜单翻译、范围、10%步长、主题、图标、聚焦还原和菜单项 test IDs 保留。SourcePreviewWindow 使用 `ManagedWindow.actions` 放同一组件，`data-no-drag` 保留按钮交互，不增整条地址/导航栏或第二菜单样式。
- 将 BrowserTab 原 `FramedSite` 的 ResizeObserver 与现 `computeIframeZoomLayout` 呈现抽为 `ZoomableSite`，两消费者共用。BrowserTab 原模式/手机逻辑宽、persisted zoom 与白名单不变；来源窗默认按实际容器宽度、100%渲染。未改算法；菜单不会只改变百分比。
- 每个 SourcePreviewWindow 实例持有自己的 `zoomPercent/reloadNonce/nativeUrl`，不写 BrowserTab store；URL改变时重置本窗口100%，刷新保持当前倍率。web nonce 换 iframe；native复用现 WebviewSite `zoomFactor/setZoomFactor` 和 `nonce/reload`，没有新桥接。
- 来源 URL 仍经原同源检查：same-origin、无效 URL、loadFailed、embed blocked 均保留原 fallback；强制尝试也不能越过 same-origin 降级。没有扩大 iframe sandbox/allow/referrerPolicy；Source 保留无 clipboard-read 的原 allow，BrowserTab 保留原 clipboard-read allow。原来源 onLoad/onError 判定、ManagedWindow、旧窗口 ID/数据、打开原页/noopener 路径均保留。
- 来源原生外部打开局部跟随安全当前 guest HTTP(S) 页面；非HTTP(S)无外部按钮。web跨源内页最终地址仍不可读，外部打开只使用已知请求URL。fallback不执行假zoom；页面加载失败可通过现刷新动作重新尝试，same-origin不允许刷新成内嵌。

最新必要检查：SourcePreviewViewer **6/6**（原3项保留，加两个窗口/BrowserTab倍率不串、真实iframe尺寸变换与刷新节点/复位、同源force仍降级、native zoom/reload/安全当前外链）；BrowserTab 抽取后共享消费 **3/3**（原实际iframe尺寸/nonce刷新/安全native外链）。作用五文件 ESLint、标准 `pnpm typecheck` 本轮一次退出0、作用 `git diff --check`通过。初跑6+3均通过，但两窗口测试的异步probe完成产生act警告，补等待现probe微任务后仅重跑Source **6/6**，无警告。旧Settings/Webview/Node基础算法未改，不重复旧完整组或全CI。

## 技术检查证据

| 检查 | 结果与边界 |
| --- | --- |
| 标准 `pnpm typecheck` | 本轮一次，退出 0；`tsc --noEmit --incremental false`，没有整仓 build/CI |
| 作用文件 ESLint | 三个源码、BrowserTab/settings React 测试通过；新增 webview 测试另行通过；设置 Enter 修复后只重跑设置作用文件 |
| 定向 Node | `iframeZoom.test.ts`、`stores/browser.test.ts` 4/4；验证宽面板不放大手机逻辑视口、窄容器变换保持边界、默认与范围 |
| 定向 React 最终源码 | BrowserTab 3/3、Settings 2/2、WebviewSite 3/3、EmbedFallback 2/2，共 10/10；不是真实网页/打包端证明 |
| 差异空白 | `git diff --check -- components/browser` 通过 |

BrowserTab 回归直接断言 iframe 初始 600×400/scale(1) → 缩小后逻辑宽高分别除以 0.9/scale(0.9) → 复位返回原宽高与 scale(1)；刷新实际换新 iframe 节点，源 URL 保持。另断言 native 当前安全导航外链、输入草稿不改外链、`javascript:` 导航无 href、选新页面恢复新 HTTP(S) 外链。Settings 使用真实键盘 typing/Tab/Enter 完成自建公开收藏并关闭/还焦点，主页保存与 Escape 通过。Webview 回归确认仅显式 zoom prop 会调用现 setZoomFactor，共享调用不强制默认，并验证错误回退跟随安全当前地址、`file:` 无 href。

首次设置回归发现 Enter 保存后默认点击重开菜单，修复 `preventDefault` 后仅重跑该两项与作用 ESLint通过；未为通过而弱化断言。

## 真实验收与兼容边界

### 2026-10-07 同 worker 恢复记录

- 读取当前三条线规则、账本和本报告；当前源 HEAD 为 `b25388e823b3ccc1a972bdcccdf62faad7bebef7`（UI/Review 已由主真验提交），仍在原任务分支。六个浏览器源码/测试 SHA256 与下方冻结表全部一致，本次没有重写源码或重复旧 React10/Node4/lint/typecheck。
- 本机 `GET http://localhost:35349/agent` 实际 200；`GET http://localhost:3041/` 返回 404（服务已响应但根路由不存在），不能当连接拒绝，也不能当身份验证证据。worker 没有启动、重启或停止服务。最新 Root 恢复规范已明确允许必要 CLI 恢复，旧“等用户双击/禁止 CLI 起服”的历史边界不再适用；本轮服务已活无需恢复。
- 自己实时 `cua.getState()` 只列 family=edge 的扩展、tabs 空，报 `nodeRepl.fetch request failed`，没有连接的 Chrome。随后仅一次尝试 `cua.createBrowserTab('iab', 'http://localhost:35349/agent', {visible:true})`，明确返回 `Browser is not available: iab`。未借用主或他人 tab ID，未用另一浏览器 CLI/Playwright 绕过 CUA，未读取 cookie、隐藏 store 或造登录身份。
- 本轮未获得可操作 StudySolo UI，因此放大/缩小/复位的实际网页比例、真实文档刷新、设置键盘/长 URL/外部打开、桌面及 390px 截图均仍待验。没有截图文件，不能把 HTTP200、源码或工具错误当绘制页面证据。只暂停依赖 CUA 的真实步骤，整体目标继续 active；接口恢复后由同 worker 续验。
- 时间化 metadata：[browser-basics-2026-10-07-preflight.json](browser-basics-2026-10-07-preflight.json)。只记录 URL、状态、接口错误与验证边界，不含账号、正文、令牌或 Cookie。
- 用户要求再试后第二轮（`2026-10-06T16:15:16Z`）：HTTP `/agent` 仍 200；worker 实时 CUA 现在列 Edge/Chrome，但两个扩展均 `nodeRepl.fetch request failed`。自己的 IAB create 仍不可用；通过 `open_in_codex` 请求本包唯一公开 URL `?browser-basics=20261007`，仅返回 queued 到调用 worker thread，随后 getTab 失败。有限重置一次 CUA kernel，以 own URL 首调用 getTab，仍 `Browser is not available: iab`。主会话报告可读 IAB Studio 页面，worker 没有照抄/绑定主 tab 或把主观察算本包真验。当前具体差异是子会话没有 IAB provider、own UI open 尚 queued；等待可用接口或主接棒验收，源码与证据边界不变。
- 来源消费者补齐期间 worker 再次实时 `cua.listBrowsers()`，只列 Edge、没有 IAB；不重复失败绑定或抢主同源UI。主报告1280 `/agent` Guest 实际添加 example.com 能内嵌，IANA `X-Frame-Options: DENY` 有原fallback，随后HMR看到新增「网页控制」、原打开原页和iframe仍在。这些是主接棒的局部观察，不能作为尚在修改时的最终倍率/刷新验收。worker已明确通知源码冻结，主后续实际90/100、刷新scroll重置、两个网址窗互不影响及390/1280验收；本 worker没有最新截图或原生真包证据。

### 2026-10-05 历史尝试及持续兼容边界

- 本 worker 首次 CUA 创建自己的 Chrome 标签 `1671245688`（本会话 ID，仅用于后续绑定）访问 `http://localhost:35349/agent`，返回 `ERR_CONNECTION_REFUSED`。未得到可操作 StudySolo 页面，未截图，未重新创建循环标签、CLI 起服务、读取 cookie/hidden stores 或借用他人标签。
- 主随后确认 RootSolo 47037、Account 3041 可达但 StudySolo 35349 未起，Edge 面板仍 locked；授权恢复由主协调。worker 不重复探测/询问。这是本机环境待恢复，不是全局停止或目标完成。
- web iframe 的缩放是逻辑视口 + 外层变换，会改变内容尺寸/响应式布局，但不具备浏览器原生页面 zoom API，也不能读取/注入跨源页面 DOM。内页导航发生在跨源 iframe 时外部打开仍依据应用可知的请求页，无法伪称能同步跨源最终 URL。native 才有真正 guest zoom 与导航事件，当前仅组件 mock 验证，`native_verified=false`。
- 拒绝嵌入的网站保留清晰外部打开和现尝试内嵌入口；不保证所有网站都可内嵌，预检也不能完整判定人机挑战或后续导航的嵌入策略。

服务就绪后同 worker 必须继续：Chrome 同一自有标签打开 Studio 右浏览器与独立 Agent 资源窗，以公开可嵌入页/自建公开文档，实际比较文字/标尺和视图尺寸的放大、缩小、复位；刷新须观察文档 load 次数或明确重载标记，不只看菜单百分比。切书签/自由浏览页核 URL、视口与现偏好；打开两种菜单核定位、滚动、输入键盘、长 URL，桌面与 390px 无溢出。以公开禁止内嵌页核 fallback 与外部打开真实入口。native 真验留待已有打包客户端运行，不能本包新打包冒充完成。

## 精确候选范围与最新冻结 SHA256

基线 `18ce822974c95250b4c7d6128c5fa539c55a3c3f`，分支 `codex/unattended-agent-platform-2026-10-04`。

| 文件 | SHA256 |
| --- | --- |
| `components/browser/BrowserTab.tsx` | `89EAF1882CCECDC2E12BFABC822E50E0ACEE7AE09647CF2C5EF6D3823DB2DC72` |
| `components/browser/BrowserSettingsButton.tsx` | `E8FA2191BCDB5115FA1B4973E15F110690BA6D3FF742B235E522D6FC3B0B8999` |
| `components/browser/WebviewSite.tsx` | `7FA83B05A5D239FA2F5C4DF8295A276D6FD4349196863F52CBFCE6AC76926A14` |
| `components/browser/BrowserTab.controls.test.tsx` | `4AEF73C26AA76712DF8B6D30C5DFCAFB6730C26096DCE0E09174B57323CF137E` |
| `components/browser/BrowserSettingsButton.test.tsx` | `8EC9B5A3A1E94F07FC9F113E67B6CB7A241AFE649AAB4A004F76D8BA8D1A379A` |
| `components/browser/WebviewSite.zoom.test.tsx` | `D975D10B9201C59C9C0D8EFAA73BACBB9F196C6DA5FCF90E0DA5A274F7CE1CB1` |
| `components/browser/PageControls.tsx` | `FF0AC43263B8D099D74BD2D90EDF03708ED852A85F044780FC7E7426D68AF444` |
| `components/browser/ZoomableSite.tsx` | `0B25D6327F4719428AFF87B2B2C0387A42EAA90AD7B64AADB8F3645F589AE041` |
| `components/chat/SourcePreviewViewer.tsx` | `3162B411E61DD6F8E43816333CE823544888318F6DC21C482D70ADC26D065F17` |
| `components/chat/SourcePreviewViewer.test.tsx` | `67106F10EEB980FF1B426397BEF7056B4320045712A6410DE2EE0C69B42C656B` |

文档候选为本报告和已有 2026-10-07 preflight metadata（后者保留当时接口状态的时间化历史，不代表最新源码冻结验收）；不新开报告。原六候选加四个必要共享/来源文件共十个源码/测试，上表为最新冻结值；BrowserTab旧SHA256被本轮必要抽取自然替代，其余原五文件未改。2026-10-05 入场 Review20候选、反馈Study4文件/两报告、Landing候选、会员字段、主账本/README均未编辑或夹带；2026-10-07 Review/UI 已提交由主维护，本 worker 不改其源码。不 commit/branch/reset/stash/push；不改 MCP/云/Skills/budget/env/秘密、RootSolo、SQL、服务器、Electron启动/安装/发布、Android打包或下载页。不杀进程，不删用户 data。

## 主智能体网页验收回执（2026-10-07）

- 主从独立Agent原添加网址入口打开公开页面，90%实际逻辑宽852.222/外层0.9，复位100%；第二窗保持100%，切回第一窗仍90%，状态不串。110%时原菜单刷新令实际scroll31.2→0且倍率保持。
- 1280桌面与390窄屏实际显示；390文档/iframe物理宽均390，菜单172..382无溢出。抽取后Studio消费者实际90→100回归通过。原settings Enter/Escape与长URL检查保留，不重复旧完整套。
- 外部点击之后确有第二目标tab，工具返回其URL为https://example.com/、标题Example Domain；正文/截图读取超时，页面面板打开请求返回queued，故不宣称第三方页面正文视觉验收。此覆盖限制及原生真包另列，不以它替代本包已通过的实际缩放/刷新/基础布局。
- 十文件冻结SHA256主逐个匹配，0差异。实际证据位于ignored artifacts/performance/browser-basics-2026-10-07/parent-real-acceptance.json及三张来源窗口截图；必要测试/类型/lint结果如上，不再为无新修改重复完整CI。
