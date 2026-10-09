# StudySolo · 多学科智能辅助学习应用

<div align="center">

[English](README_en.md) | **简体中文**

<br />

**由课堂录音逐字稿与前沿大模型驱动的深度全栈学习助手**

覆盖医学、理工、人文跨学科学术体系 · 原创详尽笔记 · KaTeX 完美公式 · 339 部 Manim 动画 · AI Agent 助教 · 离线桌面端

<br />

[![Cloud Beta](https://img.shields.io/badge/Cloud%20Beta-StudySolo.1037Solo.com-blue?style=flat-square&logo=cloudflare)](https://studysolo.1037solo.com)
[![License](https://img.shields.io/badge/License-PolyForm_Noncommercial_1.0.0-blue.svg?style=flat-square)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16.2.9-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.2.7-61dafb?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7.3-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Electron](https://img.shields.io/badge/Electron-42.5.0-47848f?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green?style=flat-square&logo=node.js)](https://nodejs.org/)

<br />

[核心特性](#-核心特性与架构矩阵) • [快速开始](#-快速开始指南) • [国际化系统](#-全界面多语言架构-i18n) • [技术栈清单](#-权威技术栈清单) • [目录结构](#-目录结构与模块组织) • [演进路线图](#-项目演进路线图) • [开源许可证](#-开源许可证与商业化限制声明)

</div>

---

## 📖 项目愿景与设计理念

**StudySolo** 是一款面向医学生与理工科学习者的高性能现代化计算机辅助学习（CAL）工作站。针对大学课堂教学中“录音冗长零碎、公式推导断代、跨学科知识繁重、习题与知识点脱节”等痛点，StudySolo 采用多学科统一知识图谱与本地优先（Local-First）存储架构，深度整合了 **Vercel AI SDK 7 智能体运行时**、**Python Manim 科学可视化引擎**、**10 学期制动态学年切换**、**1,956 键高覆盖双语 i18n 系统** 以及 **Windows Electron 硬件加密桌面端**。

无论是面对高强度的医学院核心基础课（医学细胞生物学、解剖、组胚、生化），还是理工科数理模型与化学反应机理（概率论、大物、有机、仪器分析），StudySolo 都能提供沉浸、流畅且注重隐私保护的学习体验。

---

## 🌟 核心特性与架构矩阵

### 1. 交互式学习工作站 (Interactive Learning Workspace)

- **详尽原创笔记与高精度数学排版**：
  基于课堂录音逐字稿深度提炼，集成 **KaTeX 0.16.21** 数学渲染引擎与 `mhchem` 化学拓展插件，原生支持复杂高斯积分、张量表达式与化学方程式，消除公式渲染崩溃与布局跳动。
- **339 部跨学科概念动画 (Manim Engine)**：
  内置自主维护的 3 条专业 Python 渲染流水线（概率论 155 部、有机化学 14 部、大学物理 170 部），提供直观生动的概念可视化。
- **79 套动态伴随式视频脚本**：
  视频脚本数据（`media.scripts.generated.ts`，~388KB）采用动态分块延迟加载（Lazy Import），展开时按需载入，避免初始首屏包体冗余。
- **画中画悬浮播放器 (@vidstack/react)**：
  集成 `@vidstack/react` 现代化播放器组件，支持全局 Picture-in-Picture (PiP) 模式，跨学科页面切换过程中无缝延续播放进度与时间戳。
- **3D 翻卡记忆系统与复习板**：
  基于划词选区与题库自动生成知识点填空闪卡与问答卡；提供 3D 翻卡沉浸式复习、数字跳转网格面板、艾宾浩斯间隔重复算法与本地全量 JSON 备份/还原。
- **统一类型化画布运行时 (Typed Canvas Block Runtime)**：
  将函数图像、SVG 矢量拓扑图、HTML 动态图表与基于 `@rdkit/rdkit` 的 SMILES 分子结构式收敛至统一类型化画布管线，内置表达式预检诊断与 AI 自动修订框架。

### 2. AI Agent 助教与智能体运行时 (AI Agent Copilot & Runtime)

- **Vercel AI SDK 7 全栈架构**：
  全面接入 `ai@7.0.85`，基于 `ToolLoopAgent` 与 `UIMessage Stream` 协议构建自主学习助教。客户端采用 `DefaultChatTransport` 与流式解析器，原生支持 `context-compaction`（80% 软上限紧凑化）、`context-breakdown`、`usage` 及 `followup` 自定义数据分片。
- **Agent Trace 时序执行时间轴**：
  流式呈现思考推理（Reasoning）、工具调用（Tool Calls）与状态说明；配备 22 个本地单色 SVG 状态图标，流结束 160ms 自动平滑折叠，无障碍支持键盘操作与 `prefers-reduced-motion` 动效优化。
- **句级来源标号 `[n]` 与悬停小卡片**：
  知识检索工具（`webSearch`、`searchNotes`、`getSection`、`getCurrentPage`、`searchClassTranscript`）返回单调递增标号 `[n]`，系统提示词强制模型在援引外部资料与教材时句末精确标注；界面自动将 `[1]` / `[1][2]` 解析为交互式上标圆片，悬停弹出来源详情浮窗，点击直达外部链接或在右侧面板开启教材节选。
- **右上常驻参考列与工作区分流**：
  中央线性对话区剥离非关键派生组件（折叠来源卡、演示卡、文档卡），右上角设立常驻「参考列」（聚合来源 `来源 · N`、出题、演示、文档）；AI 测验（`createQuiz`）自动停靠右侧答题工作区，彻底告别答题卡阻断对话流的困扰。
- **多模型网关与自由中转 (Thinking Dialects Normalization)**：
  原生集成 GLM-5.3 Flash、Qwen3.8 (27B/Flash)、Gemini 3.8 Flash、DeepSeek V4.1 Flash、MiMo 2.6 Flash/Pro、GPT-5.6、Kimi K3；支持桌面端自填任意 OpenAI 兼容端点（Base URL / Model ID / API Key），并在网关层自动标准化多厂商深度思考方言（`qiniu-toggle`、`openai-reasoning-effort`、`deepseek-thinking`、`anthropic-thinking`）。

### 3. 多学科知识图谱与学年切换 (Multidisciplinary Content Tree & Academic Year Switch)

- **10 学期全景学年连续体**：
  通过 `lib/constants/academic-year.ts` 建立涵盖医学 5 年制的 10 学期连续体（`freshman-1` 至 `fifth-2`），默认预设为 `sophomore-1`（大二上）；Framer Motion 胶囊动画无缝联动书架、侧边栏、搜索与 AI 大纲过滤，并附带路由安全守卫。
- **14 门已注册学科全景清单**（`lib/content-data/subjects.registry.ts` 单一真相源）：
  - **大一下学期 (`freshman-2`) · 6 门**：
    - 概率论与数理统计（`probability`，含完整章节详解、考研录音题库与真题模拟卷）
    - 大学物理（`physics`，含 27 套录音例题、章节考前模拟与 SVG 电磁力学插图）
    - 有机化学（`chemistry`，含反应机理与分子结构三维解析）
    - 中国近现代史纲要（`modern-history`，含 6 套考前模拟卷与 tb-ch00–10 教材题库）
    - 毛泽东思想和中国特色社会主义理论体系概论（`maogai`，含 2023 版教材拆章、押题卷与考研难度题库）
    - 其他学科与工具（`other`，涵盖大学英语 CET-4 8 个单元精讲精练）
  - **大二上学期 (`sophomore-1`) · 8 门**：
    - 医学细胞生物学（`cell-biology`，ch01–ch18 全章节精排富文本）
    - 组织学与胚胎学（`histology`，ch01–ch28 组织切片与胚胎发育重点详解）
    - 生物化学与分子生物学（`biochemistry`，ch00–ch27 代谢通路与分子机理）
    - 系统解剖学（`anatomy`，ch00–ch09 人体九大系统构造解析）
    - 仪器分析（`instrumental-analysis`，高教版季一兵教材 15 章全本 OCR 摄入、谱图与仪器结构）
    - 医学英语（`medical-english`，专业医学词汇与医学文献精读）
    - 医学统计学（`medical-statistics`，临床试验设计与医学数据统计方法）
    - 细胞生物学实验（`cell-biology-lab`，实验原理、器材操作与实验报告解析）
- **海量题库与 9 大题型支持**：
  全库收录 **324 套 JSON 题库**、**6,166 道精选试题**，支持 9 种题型（单选、多选、判断、辨析、填空、论述、阅读理解、完形填空、英汉互译），并辅以 **2,036 份分类实战例题**（`content/examples/`）。
- **4 角色标准化课堂摄入模型**：
  规范化课堂内容模型：逐字稿 `recording.md`、结构化纪要 `minutes.md`、独立沙箱富文本笔记 `notes.html`、高频闪卡 `cards.md` 统一绑定 `quizRef`，实现资料多维联动。

### 4. 桌面端与跨平台能力 (Desktop & Cross-Platform: Electron & PWA)

- **Route A 原生 Electron 架构**：
  Electron 主进程拉起自包含的 Next.js Standalone 服务（`.next/standalone/server.js`），通过 `ELECTRON_RUN_AS_NODE` 隔离执行环境，实现纯客户端代码零侵入打包。
- **固定端口 35349 源一致性策略**：
  桌面端与 Web 端严格统一监听 `http://127.0.0.1:35349`，彻底解决传统 Electron 随机端口导致浏览器 Origin 漂移、IndexedDB 历史数据被隔离丢失的致命缺陷（P0 级设计）。
- **Windows DPAPI 硬件密钥加密**：
  用户填写的模型端点及 API Key 经由 Chromium 原生 `safeStorage`（基于 Windows DPAPI 机器与账户级密钥）加密存储于 `userData/keys.enc`，**零密钥进入打包分发产物**。
- **离线知识引擎与双规格打包**：
  桌面安装包内嵌 307MB `content/.index/` 离线 BM25 知识检索索引，断网亦可全文搜索、浏览笔记与答题；支持输出 **NSIS 一键安装版**（`Gailvlun-setup-0.5.1.exe`）与 **免安装绿色便携版**（`Gailvlun-portable-0.5.1.exe`）。
- **渐进式 Web 应用 (PWA)**：
  严格配置 Web App Manifest（`app/manifest.ts`）与 `appleWebApp` 元数据；`<head>` 内嵌零白屏（zero-FOUC）主题预加载脚本，冷启动瞬间即应用本地持久化色彩，杜绝白屏闪烁。

### 5. Storage v2/v3 架构与隐私优先 (Storage Architecture & Privacy-First)

- **账户租户隔离存储**：
  基于 IndexedDB（`gailvlun-db/keyval`）实现数据分片，所有数据键强制施加账户作用域前缀 `ss-user:<ownerId>:<key>`，严格杜绝多账户本地串扰。
- **Storage v3 会话分片与 CAS 乐观并发控制**：
  采用 SessionHead (`SessionHeadV3`) 与 TurnSpine 脊柱分块架构（`TURNS_PER_CHUNK = 8`，首屏冷启动仅加载最近 4 轮），支持单事务比较并交换（CAS）原子性提交 `contentRevision`，兼具三向合并（Three-way Merge）冲突恢复能力。
- **ChatThread 虚拟化渲染**：
  基于 `@tanstack/react-virtual` 构建动态高度预估模型，万级超长对话会话平稳维持 60 FPS 渲染；配合 `ChatMessageDots` 点阵导航，用户可快速跳转历史轮次而无需全量加载 DOM。
- **800ms 写入防抖与生命周期保护**：
  高频流式输出采用 800ms 写入防抖与内存 Tail Cache 机制，并在 `pagehide` 与 `beforeunload` 生命周期事件挂钩中无延迟强制刷盘。
- **本地 Token 看板与零云端监控**：
  内置 `useBillingStore` 本地计量账本，精确追踪 Token 与生图消耗，支持多 API 分组动态定价与汇率换算；所有会话与用户数据 100% 保存在本地设备，支持一键导出完整 JSON 备份。

---

## 🌐 全界面多语言架构 (i18n)

StudySolo 建立了一套严密、高性能的国际化体系（`lib/i18n/`），专为专业学术软件打造：

```
lib/i18n/
├── dom.ts                  # Document lang 与 dataset.locale DOM 同步模块
├── index.ts                # translate / translateNow / useT / useLocale 导出接口
├── types.ts                # LocaleMessages 接口与类型定义
└── messages/
    ├── zh.ts               # 中文真相源根字典
    ├── en.ts               # 英文镜像根字典 (satisfies LocaleMessages 强类型约束)
    └── parts/              # 10 大分片命名空间 (zh & en 1:1 对等)
```

- **1,956 个双语词条 100% 对称覆盖**：
  中英文字典各包含 **1,956 个翻译键**，在持续集成测试（`lib/i18n/index.test.ts`）中强制运行形状对称性断言，确保中英文键集合 100% 绝对一致。
- **10 大模块化分片命名空间**：
  覆盖 `window`（464 键）、`settings`（397 键）、`trace`（274 键）、`panel`（255 键）、`agent`（245 键）、`menu`（151 键）、`review`（111 键）、`share`（34 键）、`app`（21 键）与 `common`（4 键）。
- **精准的学术内容本土化边界**：
  - **正文严谨保留**：教材原文、医学章节、题目题干、推导过程与笔记数据一律保持中文原样，避免机器翻译损害医学术语和数理逻辑的准确性。
  - **界面全量覆盖**：系统外壳、设置面板、Agent 思维链、21 个工具展示元数据（`labelKey`、`settingsLabelKey`、`descriptionKey`）、快捷键表、文件阅读器（PDF/DOCX/PPTX）外壳等均支持即时无缝切换。
- **DOM 与 SSR 水合无缝同步**：
  语言状态由 `useSettings` 统一调度，客户端挂载时调用 `syncDocumentLocale` 同步修改 `document.documentElement.lang`（`zh-CN` / `en`）与 `dataset.locale`，避免 SSR 客户端水合警告。

---

## 🚀 快速开始指南

### 1. 系统与环境要求

- **Node.js**: `22.x LTS` 或更高版本（`node -v >= 22.10.0`）
- **包管理器**: `pnpm` (推荐版本 8.x 或 9.x)
- **Python 环境 (可选，仅动画渲染需要)**: `Python 3.10+`，安装 `manim`、`scipy`、`numpy`、`ffmpeg` 及 LaTeX 引擎（MiKTeX 或 TeX Live）

### 2. Web 端开发与运行

```bash
# 1. 克隆代码仓库
git clone https://github.com/AIMFllyYS/1037Solo-StudySolo.git
cd 1037Solo-StudySolo

# 2. 安装项目依赖
pnpm install

# 3. 复制环境变量配置文件并填入模型密钥
cp .env.example .env.local

# 4. 编译本地检索索引（BM25 与向量知识库）
pnpm build-index

# 5. 启动 Next.js 极速开发服务器（固定端口 35349）
pnpm dev
```

启动成功后，使用现代浏览器访问：**`http://localhost:35349`**。

#### 环境变量配置说明 (`.env.local`)

```env
# 核心大模型网关（支持任意 OpenAI 兼容中转服务）
RELAY_BASE_URL=https://relay.protocom.org/v1
RELAY_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
AI_MODEL_FLASH=z-ai/glm-5.3-flash
AI_MODEL_PRO=Qwen/Qwen3.8-27B

# 多模态与生图端点（可选）
AI_BASE_URL=https://api.siliconflow.cn/v1
AI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx

# 智谱与联网检索端点（可选）
ZHIPU_BASE_URL=https://open.bigmodel.cn/api/paas/v4
ZHIPU_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx

# 开放配图搜索（可选）
UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```

*注：即使未配置 AI 密钥，StudySolo 的全部原创教材、公式排版、Manim 视频播放、交互组件及自测试题仍可完全离线正常使用。*

### 3. 桌面端调试与打包 (Electron)

```bash
# 启动本地 Electron 调试桌面应用（加载本地 Next 服务与密钥向导）
pnpm desktop:dev

# 执行完整的单机发布包构建（产出 NSIS 安装包与 Portable 便携版）
pnpm desktop:build
```

桌面端打包构建产物将输出至 `dist-desktop/` 目录：
- `Gailvlun-setup-0.5.1.exe`（推荐安装版，支持开机秒启与升级向导）
- `Gailvlun-portable-0.5.1.exe`（免安装绿色单文件版）

### 4. 数学与学科动画渲染 (Manim)

```bash
# 安装 Python 动画依赖库
pip install -r manim/requirements.txt

# 渲染当前尚未生成的动画场景
pnpm render

# 仅渲染指定学科章节的动画（例如概率论第一章）
pnpm render:chapter ch01

# 强制以 1080p 高清画质全量重渲
python manim/render.py --force --quality h
```

产出的 MP4 视频将输出至 `public/media/videos/`，并自动向 `lib/content-data/media.generated.ts` 注册媒体元数据。

### 5. 代码质量与工程验证

```bash
# 运行 ESLint、Knip 死代码扫描与敏感凭证检查
pnpm lint

# 运行 TypeScript 严格类型检查
pnpm typecheck

# 验证学科注册表、manifest 与实际内容文件的一致性
pnpm check:registry

# 运行核心功能单元测试套件
pnpm test:unit
```

---

## 🛠 权威技术栈清单

| 分类 | 核心依赖包 | 锁定版本 | 架构职责说明 |
|:---|:---|:---|:---|
| **前端基座** | `next` | `16.2.9` | App Router、Server Components、Route Handlers 与 Standalone 打包 |
| | `react` / `react-dom` | `19.2.7` | UI 运行时、React 19 Actions、并发渲染管道 |
| | `tailwindcss` | `^4.0.0` | 现代化原子 CSS 引擎（`@tailwindcss/postcss: ^4.0.0`） |
| | `typescript` | `^5.7.3` | 全栈强类型静态检查（`target: ES2022`） |
| | `framer-motion` | `^11.18.0` | 学年切换动画、独占手风琴与 3D 翻卡平滑物理动效 |
| **AI 智能体** | `ai` | `7.0.85` | Vercel AI SDK 7 核心（`ToolLoopAgent`, `UIMessage Stream`） |
| | `@ai-sdk/openai-compatible` | `3.0.41` | 多厂商 OpenAI 兼容网关接入与思考方言适配 |
| | `@ai-sdk/anthropic` | `4.0.46` | Claude 系列模型协议转换适配层 |
| | `streamdown` | `2.3.0` | 流式 Markdown 词法分析与平滑增量渲染 |
| | `zod` | `4.4.3` | 工具调用参数 Schema 强类型约束与运行时断言 |
| **状态与存储** | `zustand` | `^5.0.3` | 客户端轻量状态管理（分布于 44 个单职责 Store） |
| | `idb-keyval` | `^6.2.5` | IndexedDB 底层异步驱动（`gailvlun-db/keyval`） |
| | `@tanstack/react-virtual` | `^3.14.4` | 万级长会话虚拟滚动容器（动态高度预测，60 FPS） |
| **内容与排版** | `katex` | `^0.16.21` | 高性能数学公式渲染引擎（内嵌 `mhchem` 支持） |
| | `@vidstack/react` | `1.15.6` | 现代化无障碍视频播放器内核（支持画中画 PiP） |
| | `@rdkit/rdkit` | `2025.3.4-1.0.0` | WebAssembly 化学信息学 2D/3D 分子结构与反应式渲染 |
| | `@xyflow/react` | `12.11.5` | 交互式概念拓扑图与知识脉络流程图驱动 |
| | `@milkdown/crepe` | `7.22.0` | 所见即所得富文本 Markdown 笔记编辑套件 |
| **桌面与沙箱** | `electron` | `^42.5.0` | 原生桌面容器外壳（内置安全沙箱与 DPAPI 接口） |
| | `electron-builder` | `^26.15.3` | Windows NSIS 安装包与免安装 Portable 镜像打包器 |
| | `e2b` | `2.31.0` | 云端安全代码沙箱执行容器客户端 |
| | `@modelcontextprotocol/client` | `2.2.0` | Anthropic Model Context Protocol (MCP) 客户端接入 |

---

## 📁 目录结构与模块组织

```text
1037Solo-StudySolo/
├── app/                        # Next.js 16 App Router (页面、布局及 /api 路由)
│   ├── api/chat/               # AI SDK 7 ToolLoopAgent 流式路由
│   ├── manifest.ts             # PWA Web App Manifest 动态清单
│   └── layout.tsx              # 全局根布局与 zero-FOUC 主题注入
├── components/                 # React 19 UI 组件库
│   ├── chat/                   # 对话流、AgentTrace 时间轴、句级引用上标卡片
│   ├── layout/                 # 学年切换器 (AcademicYearSwitcher)、顶栏、导航
│   ├── visual/                 # 统一类型化画布、视频播放器、3D 复习板
│   └── quiz/                   # 9 种题型交互式测验评估卡片
├── content/                    # 多学科原始教学资产
│   ├── chapters/               # 概率论与数理统计章节详解
│   ├── physics/                # 大学物理教材、录音例题及模拟卷
│   ├── chemistry/              # 有机化学机理与反应图谱
│   ├── anatomy/                # 系统解剖学教材与题库
│   ├── cell-biology/           # 医学细胞生物学富文本教程
│   ├── histology/              # 组织学与胚胎学教材
│   ├── biochemistry/           # 生物化学与分子生物学教材
│   ├── instrumental-analysis/  # 季一兵《仪器分析》15 章全本 OCR 讲义
│   ├── quiz/                   # 14 门学科 324 套 JSON 题库
│   └── .index/                 # 本地构建的 307MB 离线 BM25 搜索索引
├── electron/                   # Electron 42 桌面端主进程与配置
│   ├── main.js                 # Route A Standalone 进程拉起与 DPAPI 加密中枢
│   ├── config.js               # 固定端口 35349 及静态配置项
│   └── preload.js              # 安全隔离的 contextBridge 预加载脚本
├── lib/                        # 业务逻辑与系统内核
│   ├── ai/                     # ToolLoopAgent、多模型网关、思维链与提示词系统
│   ├── constants/              # 10 学期制学年定义 (academic-year.ts)
│   ├── content-data/           # 学科单一注册表 (subjects.registry.ts) 与清单
│   ├── i18n/                   # 1,956 键双语国际化系统 (zh.ts, en.ts, parts/)
│   ├── storage/                # Storage v3 会话分片、TurnSpine 与 CAS 乐观锁事务
│   └── stores/                 # 44 个单职责 Zustand 状态存储模块
├── manim/                      # Python Manim 数学与学科动画工程
│   ├── render.py               # 概率论动画流水线 (155 部)
│   ├── render_chemistry.py     # 有机化学分子动画流水线 (14 部)
│   └── render_physics.py       # 大学物理电磁力学流水线 (170 部)
├── docs/                       # 项目工程规范、SOP 文档与架构白皮书
│   ├── refer/                  # 渲染架构与存储架构设计白皮书
│   └── sop/                    # 学科接入、题库生成与索引分发生命周期规范
└── scripts/                    # 构建、检查、迁移与测试自动化脚本
```

---

## 🗺️ 项目演进路线图

### 已完成里程碑

- [x] **v0.1.0**：首个 Windows Electron 桌面版发布，集成 Chromium，Windows DPAPI 硬件密钥加密，基础离线题库与 Manim 播放。
- [x] **v0.2.0**：记忆卡片系统打磨，划词一键转填空/问答卡，3D 翻卡复习板，首页书架专属学科配色。
- [x] **v0.2.1**：固定本地端口 `35349` 彻底根治 IndexedDB 跨启动孤立丢失致命缺陷（P0）；划词助手复用主对话完整引擎。
- [x] **v0.3.0**：统一窗口管理系统与全局任务栏，动态悬浮窗口召回，Unsplash 高清教育配图检索。
- [x] **v0.3.1**：Storage v2 对话按会话分片持久化，`@tanstack/react-virtual` 万级消息流畅虚拟滚动，AI 绘画与 BillingDashboard 计费看板，大学物理第一章详解与 27 套录音例题。
- [x] **v0.4.0**：上线中国近现代史纲要（6 套模拟卷、11 套教材题库）、毛泽东思想和中国特色社会主义理论体系概论（2023 版教材拆章、押题卷）、概率论真题模拟卷、Anthropic 适配器与 ThinkingMenu 思考档位。
- [x] **v0.5.0**：引入 10 学期制学年切换开关（`freshman-2` / `sophomore-1`），上线大二上 4 科医学教材（医学细胞生物学、组胚、生化、系统解剖）及季一兵《仪器分析》15 章全本 OCR 讲义。
- [x] **v0.5.1**：全面迁移至 Vercel AI SDK 7（`ToolLoopAgent` + `UIMessage Stream`），桌面端自由中转（自填 URL / Model ID / API Key），学科元数据收敛至单一注册表 `subjects.registry.ts`。
- [x] **[Unreleased] 最新前沿成果**：
  - [x] 句级来源标注 `[n]` 与悬停预览卡片，点击直达教材小节。
  - [x] 中央对话区与右上常驻参考列解耦，AI 出题自动分流至右侧工作区。
  - [x] 1,956 键全界面双语 i18n 体系（覆盖 10 大命名空间，强类型约束）。
  - [x] 22 个定制本地单色 SVG 图标，紧凑透明悬浮输入区。

### 未来展望 (Future Horizons)

- [ ] 接入大二下学期（`sophomore-2`）及高年级临床医学学科（病理学、药理学、病理生理学）。
- [ ] 引入本地小参数多模态语音模型，支持课堂录音实时流式对齐与语音答疑。
- [ ] 拓展移动端原生壳封装，提供基于离线 SQLite/OPFS 的跨端点对点同步方案。
- [ ] 知识图谱图数据库探索（Graph RAG 与跨学科知识点拓扑漫游）。

---

## 📄 开源许可证与商业化限制声明

本项目源代码遵循 **[PolyForm Noncommercial License 1.0.0](LICENSE)** 许可协议发布。

### 1. 允许用途 (Permitted Noncommercial Use)
- **个人学习与自用**：允许个人在本地部署、阅读笔记、复习刷题、离线自学，以及为了个人学术研究、技能拓展进行的非商业修改。
- **公益与学术机构**：大中小学校、公立研究机构、公共卫生机构、环境保护组织及政府部门可用于非商业目的教学、科研与公益科普。

### 2. 严格禁止商业营利 (Strict Commercial Prohibition)
- **严禁商业销售与变相收费**：严禁任何个人、机构或企业将本项目全部或部分代码、打包编译产物（包括但不仅限于 Windows 安装包 `.exe`、Docker 容器镜像等）、教材笔记或多媒体视频资源用于任何形式的商业获利行为。
- **严禁商业课程捆绑与转售**：严禁将本项目材料打包进付费考研/考证辅导班、付费专栏，或通过变相收取“会员费”、“服务费”、“赞助费”提供访问。
- **严禁第三方架设商业托管 SaaS**：严禁未经官方授权第三方使用本项目源码搭建收费云服务。

### 3. 官方云端公测服务与商业隔离说明
- 本项目的官方唯一指定公开云端测试服务为：**`StudySolo.1037Solo.com`**（[https://studysolo.1037solo.com](https://studysolo.1037solo.com)）。
- 官方云端公测旨在为广大学习者提供开箱即用的在线试用环境。官方公测服务的存在不赋予任何第三方进行商业运营的权利。

*商业合作、机构授权或特殊许可诉求，请通过官方仓库联系项目维护团队。*

---

## 🤝 贡献与社区

我们热忱欢迎社区同学参与 StudySolo 的建设！

1. **Fork 本仓库** 并创建您的特性分支（`git checkout -b feature/NewSubjectFeature`）。
2. 请严格参考 [`docs/sop/subject-onboarding.md`](docs/sop/subject-onboarding.md) 编写教材与题库数据。
3. 提交前确保通过全部工程门禁：`pnpm check:registry`、`pnpm typecheck` 及 `pnpm test:unit`。
4. 提交清晰规范的 Commit 并发起 Pull Request。

---

## 💖 致谢

- 感谢所有为华中科技大学（1037 森林大学）及各大医学院校贡献整理课堂录音与笔记的同学们。
- 感谢 Vercel AI SDK、Next.js、Tailwind CSS、Manim 社区以及 PolyForm 协议项目组提供的杰出开源基础设施。

<div align="center">

**如果 StudySolo 对你的学业有所助益，请在 GitHub 上点亮一颗 ⭐️ Star 支持我们！**

*Made with ❤️ by 1037Solo Contributors for Lifelong Learners Worldwide*

</div>
