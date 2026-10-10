# 登录注册板块 · 人机验证面板 —— 深度分析与升级规划

> 状态：**主体已落地**（2026-09-21 `dc2e5c0e`，与 `app/login/page.tsx`、`app/styles/auth.css`、`components/auth/LoginOverlay.tsx`、`components/auth/HumanChallengeDialog.tsx` 同批提交；`components/auth/OtpInput.tsx`、`app/styles/auth.css` 与 `HumanChallengeDialog.tsx` 的 `CooldownRing` 环形冷却均已存在，`globals.css` 已含 `--subj-*` 学科色令牌）。本文同时是对仓库现状代码的逐行阅读 + 站内既有设计规范（studysolo-glass 快照）+ 外部最佳实践调研。
>
> **与原文已有偏差的一处（务必先读）**：登录入口不再是本文第三章描述的「邮箱 + OTP 分格输入」自建表单。`components/auth/LoginForm.tsx` 现在只渲染一个「登录并继续」按钮，经 `lib/auth/account.ts` 的 `redirectAccount()` 跳转 **1037Solo 统一账号中心**；邮箱登录 / Google / GitHub / 找回密码 / 两步验证都在账号中心完成，本仓库不再维护自己的登录会话。因此 `components/auth/OtpInput.tsx` 目前**没有调用方**，第三章 3.1/3.2 的 OTP 分格输入设计已成历史；Phase 1 规划的 `components/auth/GlassCard.tsx` 未创建（玻璃窗框直接落在 `app/styles/auth.css` 的 `.auth-window` / `.auth-titlebar` 上）。人机验证面板（第四章）与外观部分仍然有效。
>
> 写作背景：本文基于对仓库当时现状代码的逐行阅读 + 站内既有设计规范（studysolo-glass 快照）+ 外部最佳实践调研写成。
> 涉及文件：`components/auth/LoginForm.tsx`、`components/auth/LoginOverlay.tsx`、`components/auth/HumanChallengeDialog.tsx`、`app/login/page.tsx`、`app/styles/prose.css`、`components/window/WindowChrome.tsx`、`docs/design-snapshots/2026-09-studysolo-glass/`。

---

## 一、现状诊断（基于代码实读）

### 1.1 登录注册板块现状

| 维度 | 现状 | 问题 |
|---|---|---|
| 容器 | `.login-dialog` 440px 固定宽，纯色 `.login-overlay` 46% 黑遮罩 | 无玻璃质感、无品牌氛围、无层次；遮罩下 app 直接可见但毫无「景深」处理 |
| 表单 | `LoginForm.tsx` 内联 Tailwind + `primaryBtnStyle()` 内联 style；输入框 13px 小字、`px-2.5 py-2` | 拥挤、密集、按钮矮小；无密码可见性切换、无 focus 光晕、无输入动效 |
| 登录/注册切换 | 两个圆角按钮手写 tab（`background` 内联切换） | 无 macOS 分段控件的滑动 thumb，切换生硬 |
| 独立登录页 | `app/login/page.tsx` 直接复用弹窗样式铺满全屏 | **整页画布被浪费**——没有品牌叙事区，登录页 = 一个居中小卡片 |
| 品牌 | 左上角 BrandLogo（已有 7 套多彩动画徽标）+ 一句 slogan | 品牌资产很好，但排版层级弱：eyebrow 与标题重复出现 "STUDYSOLO/StudySolo" |
| 动效 | 仅有 overlay/dialog 两个 160–180ms 进场 keyframes | 无 stagger、无微交互、无成功/失败反馈动效 |
| 主题 | 使用 MD3 令牌（`--md-sys-color-*`），三主题（雾蓝/深炭/奶油）可用 | 基础 OK，但完全没有用上 studysolo-glass 的玻璃令牌与环境光晕 |

### 1.2 人机验证（做题面板）现状

- **结构**：portal 弹窗 560px，头部标题 + 四科 tab（手写圆角按钮）+ 滚动题区 + 底部「提交/冷却」条。
- **控件**：全部是**原生** radio/checkbox/fieldset；医科排序是裸「↑ ↓」字符按钮；展示区（reveal）是一块灰色圆角盒。
- **CSS**：`prose.css:2389-2425` 与登录共用同一组纯色 dialog 样式，无玻璃、无 Mac 灯点、无学科色彩语义。
- **信息设计**：题目提示（"提交后才看答案；失败冷却 10 秒"）挤在副标题一行小字里；冷却状态只是文字 "冷却中 N 秒"。
- **优点必须保留**：四科任选机制、提交后 reveal 解析、失败 10s 冷却、医科学院 SVG（`CentralDogmaSvgs.tsx`）、全部 aria/testid 与单测契约。

### 1.3 可复用的站内资产（升级的「原料库」）

1. **studysolo-glass 设计规范**（`docs/design-snapshots/2026-09-studysolo-glass/`）：完整的 macOS 玻璃拟态令牌——`--glass-window-fill / --glass-border / --glass-highlight`、`--mac-close/-min/-zoom` 灯点、环境光晕 `--ambient-1..4`、学科强调色 `--subj-prob/phy/chem/hist`、动效曲线 `--ease-standard`。**这些令牌目前只存在于 docs 快照，尚未进入 `globals.css`**（app 里只有旧的 `--glass-bg/--glass-border` 两个近似物）。
2. **Mac 窗口灯点**：`components/window/WindowChrome.tsx` 的 `TrafficButton`（#ff5f57/#ffbd2e/#28c840，hover 显图标）——就是「Mac 弹窗效果」的现成实现。
3. **进场动画**：`agent-settings-overlay-in / agent-settings-dialog-in`（prose.css），设置面板已在用。
4. **Framer Motion** 已在依赖中（BrandLogo 在用），可做 stagger 微动效。
5. **BrandLogo 动画徽标组**：可直接放大用作登录页品牌区的视觉主角。

### 1.4 外部调研结论（要点）

- **Cloudflare Turnstile 重设计**（[blog.cloudflare.com](https://blog.cloudflare.com/the-most-seen-ui-on-the-internet-redesigning-turnstile-and-challenge-pages/)）：验证 UI 的三原则——①像产品而不是像关卡（friendly, on-brand）；②状态反馈极其明确（进行中/成功/失败三态可视化）；③减少用户焦虑（把"你在做什么、还差什么"说清楚）。
- **Claude / ChatGPT / Linear / Vercel 式高端登录页**（[dribbble 参考](https://dribbble.com/shots/27316616-Claude-AI-Subtle-UI-Exploration-for-the-Login-Signup-Page)）：居中或左右分栏卡片 + 环境光晕背景 + 极少字段 + 一个大 CTA；动效克制（淡入 + 轻位移）。
- **OTP 输入**（[input-otp](https://www.npmjs.com/package/input-otp)、[Syncfusion OTP 指南](https://www.syncfusion.com/blogs/post/blazor-otp-input-authentication.md)）：6 位**分格输入**（segmented input）是行业共识——自动前进、粘贴分发、退格回退，比单输入框高级且错误率更低。

---

## 二、总体设计概念：「玻璃工作台 · Glass Workbench」

**一句话**：把登录与人机验证统一升级为 studysolo-glass 语言下的「Mac 玻璃窗」——环境光晕打底、深浅玻璃分层、Mac 灯点窗框、学科色彩点缀。登录页是"进入工作室的门"，人机验证是"门上的智能锁"：同一套窗框、同一套光线、同一套动效节奏。

三条设计支柱：

1. **协调 > 创新**：不发明新风格，把项目自己的 glass 快照令牌移植进 app，让 auth 板块成为全站风格的「第一展示位」。
2. **一个页面一个焦点**：登录页只讲两件事——品牌（左）与进入（右）；验证面板只讲一件事——答题。
3. **克制的动效**：全部动效走快照曲线（140/220/360ms，`--ease-standard`），尊重 `prefers-reduced-motion`。

---

## 三、登录注册板块升级方案

### 3.1 布局：两种形态，一套组件

**形态 A —— 独立登录页 `/login`（左右分栏，重头戏）**

```
┌────────────────────────────────────────────────────┐
│  ┌───────────────────┐  ┌───────────────────────┐  │
│  │   品牌叙事区（60%）│  │  登录玻璃卡（40%）    │  │
│  │  ambient 光晕背景  │  │  ┌─────────────────┐  │  │
│  │  BrandLogo 大徽标  │  │  │ 💡💡💡 (灯点)   │  │  │
│  │  动画渐变切换      │  │  │  StudySolo      │  │  │
│  │                   │  │  │  欢迎回来        │  │  │
│  │  "一人一室，把课堂 │  │  │  [登录 | 注册]  │  │  │
│  │   变成自己的复习   │  │  │  邮箱 ________  │  │  │
│  │   工作站"         │  │  │  密码 ________  │  │  │
│  │                   │  │  │  [ 进入工作室 ] │  │  │
│  │  · 笔记 · 对话    │  │  │  忘记密码?      │  │  │
│  │  · 动画 · 测验    │  │  └─────────────────┘  │  │
│  └───────────────────┘  └───────────────────────┘  │
└────────────────────────────────────────────────────┘
```

- 左侧：`--ambient-1..4` 四团光晕（大 blur 半径、缓慢漂移动画 20s loop）+ 44px BrandLogo + 大字 slogan（`clamp(28px, 4vw, 40px)`、行高 1.25）+ 三个特性点（lucide 图标 + 一句话）。深色主题下光晕更亮，浅色更柔。
- 右侧：一张 420px 宽的 **Mac 玻璃卡**（见 3.2）。
- 窄屏（<900px）：左栏退化为卡顶部的品牌头，一栏流式布局。

**形态 B —— 应用内登录弹窗 `LoginOverlay`（紧凑居中卡）**

- 保留单卡形态，但升级为同一张 Mac 玻璃卡 + 新遮罩（见 3.2），宽 420px，卡顶带灯点条。

### 3.2 Mac 玻璃卡（新共享组件 `components/auth/GlassCard.tsx`）

把「Mac 弹窗效果」抽象成可复用容器，登录卡与人机验证面板共用：

- **灯点条（titlebar 44px）**：左置三颗 `TrafficButton` 风格灯点（视觉复用 WindowChrome 的色值与 hover 显图标交互；红点=关闭即 onClose，另外两颗装饰但 hover 有反馈）。中置窗口标题（如 "登录 StudySolo" / "人机验证"），右侧可放动作。
- **玻璃本体**（移植快照令牌到 globals.css）：
  - `background: var(--glass-window-fill)`（深色 `rgba(255,255,255,0.06)` / 浅色按快照）
  - `backdrop-filter: blur(28px) saturate(1.6)`——**全页唯一重度 blur 挂载点**（遵循快照"模糊只挂窗口"的性能纪律）
  - `border: 1px solid var(--glass-border)` + `box-shadow: inset 0 1px 0 var(--glass-highlight), 0 24px 60px -16px rgba(0,0,0,.5)`
  - 圆角 `16px`（比现在 20px 更接近 macOS）
- **遮罩升级**：46% 纯黑 → `rgba(0,0,0,0.35) + 8px 轻模糊`（对下层内容 `backdrop-filter: blur(8px)`），制造 macOS 打开窗口时的景深感。注：遮罩 blur 与窗口 blur 是两个元素，不影响"单挂载点"预算。

### 3.3 表单升级（LoginForm 重构）

1. **排版**：欢迎语升为主标题（"欢迎回来" / 注册态"创建你的工作室"），slogan 降为副文案；去掉 "STUDYSOLO/StudySolo" 重复 eyebrow，品牌交给灯点条 + 品牌区。
2. **分段控件**：登录/注册改为 macOS 滑动 thumb 分段控件（快照 `.seg` 组件规格：40px 高、药丸圆角、白色 thumb + `--seg-thumb-light-shadow`，thumb 用 CSS transform 滑动 220ms）。**aria 角色 tablist/tab 契约保持不变**。
3. **输入框**：高度 40px、字号 13.5px、圆角 10px；聚焦时 `border: var(--md-sys-color-primary)` + `box-shadow: 0 0 0 3px color-mix(primary 18%)` 光晕；密码框加可见性切换（Eye/EyeOff）；错误态红边 + 抖动一次（reduced-motion 时仅变色）。
4. **主 CTA**：整宽 40px，渐变底（`linear-gradient(180deg, color-mix(primary 88%, white), primary)`）+ inset 高光 + hover `brightness(1.06)` + active `scale(0.985)`；加载态换成 spinner + 文案。保留 "无密码 → 发送验证码" 的智能文案逻辑。
5. **OTP 分格输入**（phase === "code"）：6 格 segmented input（自动前进/退格回退/粘贴分发/`autoComplete="one-time-code"`），当前格光晕脉动。这是单测里 "验证码" 输入的替换，测试需同步改。
6. **错误/提示**：内联 callout（图标 + 12.5px），错误带淡入；成功态（密码已更新等）用 primary 色确认图标。
7. **进场动效**：字段按 40ms stagger 上浮淡入（framer-motion 或纯 CSS animation-delay），整卡沿用 `agent-settings-dialog-in`。

### 3.4 主题与无障碍

- 全部颜色走令牌：浅雾蓝 / 深炭 / 奶油三主题 + appearance 自定义主色（`appearance.css` 的 `--appearance-*-accent`）自动生效，无需分支代码。
- 焦点环 3px 光晕对键盘可见；灯点关闭按钮保留 aria-label"关闭登录"（现有单测断言保持）；玻璃卡在 `forced-colors` 下退化为实底。

---

## 四、人机验证面板升级方案

### 4.1 整体前端（视觉包装）

- **复用 GlassCard**：与登录同一窗框、同灯点、同遮罩景深，宽度 560px，高度上限 640px。
- **头部叙事重排**：灯点条（红点=关闭，保留单测的关闭路径）→ 窗口标题"人机验证"居中 → 内容头部一句话改为引导性文案："答对任一科，验证邮件马上出发"，冷却规则移到 footer 的状态区。
- **环境底**：面板打开时，遮罩里加两团低透明度学科光晕（随所选科目换色，见 4.2），验证面板成为"会呼吸"的界面。

### 4.2 面板设计（分科目细节）

**科目选择器 → macOS 分段控件（带学科色）**
- 四科做成与登录页同款的滑动 thumb 分段控件；选中 thumb 着**学科色**：理科 `--subj-prob`(紫)、文科 `--subj-hist`(红)、医科 `--subj-chem`(绿)、其他 `--subj-phy`(蓝)——完全复用快照的学科强调色令牌，切科目 = 换气氛，与学习平台的身份天然契合。
- aria：role=tablist/tab/aria-selected 契约不变。

**理科（ODE 题）**
- 题干卡：玻璃面板（`--glass-panel-fill`）+ 左侧 3px 学科色竖条；方程 `dy/dx = 2x` 用 `font-mono` 22px 放大展示，条件 `y(0)=1` 作次行；提示语收纳为可展开的"?"气泡，默认收起（降低"被考试"的压迫感）。
- 选项 → **可选卡片行**：整行可点（替换原生 radio），hover 玻璃提亮，选中态学科色描边 + 左侧勾选指示器（圆形 → 动画变对勾）。键盘上下键 + 空格可用（role=radiogroup 保留）。

**文科（三选多）**
- 问题卡列表，每卡头部是自定义复选指示器（圆角方块勾选动画）+ 题干；选中后展开选项区（高度动画 180ms）；已选计数徽章（"已选 2/3"）固定在题区右上角。

**医科（中心法则排序）**
- ↑↓ 改成圆形玻璃按钮（hover 提亮、禁用降透明度），每步卡片左侧加**连接线**（垂直虚线 + 节点圆点），提交后排序正确时连线变绿色流动虚线动画——把"中心法则"画成流程图而不是列表。
- `CentralDogmaSvgs` 图形加浅色玻璃底衬（40px 圆角容器）。

**其他（10 题对 3）**
- 与文科同款卡片行 + 顶部进度指示（三格进度点，答对格子点亮，替代纯文字）。

**提交后的 reveal**
- 通过：面板内浮出绿色玻璃确认条（对勾动画 + 解析列表逐条 stagger 淡入），CTA 变"验证通过，正在发送…"。
- 失败：卡片抖动一次 + 红色确认条；**冷却可视化**——提交按钮变为环形倒计时（SVG 圆环 10s 扫描），footer 文案"冷却中，N 秒后可重试"，替代现在的纯文字。

### 4.3 效果复用清单（Mac 弹窗协调性）

| 复用项 | 来源 | 用到 |
|---|---|---|
| 玻璃窗框 + 灯点条 | 快照 `.win` 规格 + WindowChrome 灯点色值 | GlassCard（登录+验证共用） |
| 遮罩景深 | 新增（快照 `--glass-scrim` 思路） | 两处 overlay |
| 进场曲线 | `agent-settings-overlay-in / dialog-in` | 两处 overlay |
| 分段控件 | 快照 `.seg` 规格 | 登录/注册切换、四科切换 |
| 学科色令牌 | 快照 `--subj-*` | 验证面板四科 accent |
| 灯点 hover 显图标 | WindowChrome TrafficButton | GlassCard 关闭钮 |
| BrandLogo 动画徽标 | components/layout/BrandLogo.tsx | 登录页品牌区 |

---

## 五、技术实施方案（落地路线）

### Phase 0 · 令牌移植（前置，0.5 天）
- `globals.css` 增补 studysolo-glass 令牌组：`--glass-window-fill / --glass-panel-fill / --glass-control-fill / --glass-highlight / --glass-blur-deep / --mac-close/-min/-zoom`、`--ambient-1..4`、`--subj-*`（三主题各一份，与快照取值一致）。

### Phase 1 · GlassCard 组件（1 天）
- 新建 `components/auth/GlassCard.tsx`（titlebar 灯点 + 标题 + children）；`.login-dialog / .human-challenge-dialog` 样式升级为玻璃窗（建议迁移到新建 `app/styles/auth.css`，与 prose.css 解耦）。
- `LoginOverlay` / `HumanChallengeDialog` 接入；**aria-label、testid、事件契约全部不变**，先保证现有单测绿。

### Phase 2 · 登录表单重构（2 天）
- LoginForm 视觉重构（分段控件、输入框、CTA、callout）；新组件 `components/auth/OtpInput.tsx`（分格输入）。
- `app/login/page.tsx` 升级为分栏品牌页（形态 A），窄屏降级。
- 同步更新 `LoginForm.test.tsx / LoginOverlay.test.tsx`（主要是 OTP 输入方式的断言）。

### Phase 3 · 验证面板重构（2 天）
- HumanChallengeDialog 按第四章重做（分段控件、选项卡片、排序连接线、reveal 动画、环形冷却）。
- 同步 `HumanChallengeDialog.test.tsx`（断言 `role=dialog, name=人机验证`、reveal testid 不变）。

### Phase 4 · 打磨与验收（1 天）
- 三主题 + appearance 自定义色回归；reduced-motion / forced-colors / 键盘走查；backdrop-filter 性能核对（页面重度 blur 挂载点 ≤2）。

### 风险与对策
- **backdrop-filter 层叠**：玻璃卡叠在已 blur 遮罩上会双重采样 → 遮罩用低透明纯色 + 8px 轻模糊、卡内不再嵌套 blur。
- **单测契约**：所有 role/aria/testid 作为「公共契约」在重构中冻结，视觉改动不碰语义。
- **主题漂移**：新令牌三主题取值直接抄快照，不自造色值，避免与全站脱节。

## 六、验收清单

- [ ] 登录页（/login）分栏品牌区 + 玻璃卡，三主题下截屏对比快照风格一致
- [ ] 应用内登录弹窗与人机验证面板窗框、灯点、遮罩、动效完全一致
- [ ] OTP 分格输入：粘贴 6 位 / 逐位输入 / 退格 / 错误抖动 全通过
- [ ] 四科验证：分段控件滑动、选中学科色、reveal 动画、环形冷却倒计时
- [ ] 既有单测（LoginForm / LoginOverlay / HumanChallengeDialog）全绿
- [ ] prefers-reduced-motion 下所有动画退化为淡入
- [ ] 键盘完整走通：登录 → 发码 → 验证 → 登出；验证面板四科均可键盘作答
