# 期末复习工作站 · 多学科辅助学习应用

> **范围：** 这是 StudySolo（仓库现名 1037Solo-StudySolo，旧名 Notebook-MedFreshman），域名 studysolo.1037solo.com，跑在另一台机器上，不在 MainECS 的 /1037Solo 部署里。它和 StudyFlow 不是同一个产品。

> **当前无人值守上下文与返工交接：** [docs/handoff/README.md](docs/handoff/README.md)。用户已授权恢复执行；任务按6项大板块均由GPT-6.1 Sol High子智能体执行，主智能体统筹与验收组织，旧技术验收不代表用户可用。

<div align="center">

**由课堂录音逐字稿驱动的深度学习助手**

可伸缩导航 + 详尽原创笔记（完美公式）+ 右侧三板块（AI 对话 / Manim 动画 / 可交互内容）+ 划词问 AI

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-38bdf8?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)

[快速开始](#快速开始) • [功能特性](#功能特性) • [项目架构](#项目架构) • [开发指南](#开发指南) • [贡献指南](#贡献指南)

</div>

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填入你的 AI 端点
pnpm dev                     # http://localhost:35349
```

### 配置 AI（自定义 OpenAI 兼容端点）

编辑 `.env.local`：

```
RELAY_BASE_URL=https://relay.protocom.org/v1
RELAY_API_KEY=sk-xxx
AI_MODEL_FLASH=z-ai/glm-5.3-flash
AI_MODEL_PRO=Qwen/Qwen3.8-27B
AI_BASE_URL=https://api.siliconflow.cn/v1   # 生图 + 向量
AI_API_KEY=sk-xxx
MIMO_BASE_URL=https://token-plan-cn.xiaomimimo.com/v1
MIMO_API_KEY=tp-xxx
UNSPLASH_ACCESS_KEY=（可选）在 unsplash.com/oauth/applications 申请，启用 AI 图片搜索
```

未配置时，框架其余部分（笔记、动画小窗、交互、划词）照常可用，AI 对话会给出"未配置"提示。

### 检索索引分发

`searchNotes` 只读本地 `content/.index/`（不随 git 入库）。开发机执行 `pnpm build-index` 生成；部署时把该目录作为产物同步到服务器同路径，重启 Node 进程后 `GET /api/health/search` 应返回 `ok: true`。详见 `docs/sop/10-search-index-lifecycle.md` 与 `docs/plans/archive/15-search-index-distribution-and-rag-quality.md`。

## 渲染动画（Manim）

需要 Python + Manim + ffmpeg；公式渲染需 LaTeX（MiKTeX）。

```bash
pnpm render                  # 渲染全部尚未生成的视频
pnpm render:chapter ch01     # 仅渲染第一章
python manim/render.py --force --quality h   # 强制高画质重渲
```

产物输出到 `public/media/videos/<ch>/<id>.mp4`，并自动写入 `lib/content-data/media.generated.ts`。

## 功能特性

### 🎯 多学科支持
- **概率论与数理统计** - 完整的章节详解、动画演示、交互组件、考研录音题库与实战演练真题模拟卷
- **大学物理** - 第一章详解、例题、题库、考前模拟真题与 27 套录音例题
- **有机化学** - 分子结构、反应机理的深度解析
- **中国近现代史纲要** - 教材内容、6 套考前模拟卷与教材题库（tb-ch00–10）
- **毛泽东思想和中国特色社会主义理论体系概论** - 2023 版教材拆章为节、教材题库 tb-ch00–08、录音题库考研重写、考前模拟押题卷
- **大学英语（CET-4）** - Unit 1–8 全套内容，含原文精读、例题精讲与随堂测验
- **可扩展架构** - 轻松接入新学科（详见 `docs/sop/subject-onboarding.md`）

### 📚 智能学习体验
- **详尽原创笔记** - 基于课堂录音的深度解析，完美数学公式渲染（KaTeX）
- **AI 对话助手** - 上下文感知的智能问答，支持划词提问、图片附件、联网搜索
- **Agent 执行时间轴** - reasoning、工具与中间说明按消息 parts 的时序展示，运行时展开、结束时收拢，最终回答与引用/产物卡片独立保留；停止生成后可继续查看已接收内容
- **舒适的聊天布局** - 透明悬浮输入区，上置思考/搜索/上下文/模型控件；用户消息靠右、AI 靠左，执行过程分层缩进；桌面、手机和划词浮窗共享自绘图标与动态滚动避让
- **多 Provider 适配器** - 内置 OpenAI 兼容 / Anthropic 适配器，思考档位（ThinkingMenu）可全局与逐会话调节
- **AI 图片搜索** - 集成 Unsplash API，AI 对话可搜索并插入高质量配图（配置 `UNSPLASH_ACCESS_KEY` 启用）
- **AI 图片生成** - 复用 OpenAI 兼容端点生成图片，独立查看器、会话持久化、画廊汇总，与对话工具链打通
- **自定义 API 与多模型切换** - 在设置中添加任意 OpenAI 兼容端点，支持多 API 分组与逐组定价，与内置模型统一管理
- **Token 与计费看板** - 每个浮窗独立显示上下文 Token 用量；BillingDashboard 汇总 token 与图片生成费用，含 3D 翻卡片摘要与趋势图表
- **统一画布运行时** - 函数图、SVG、HTML 图表、化学式统一走 typed canvas block runtime，支持 AI 修订与表达式诊断
- **Manim 动画讲解** - Python 驱动的数学动画，直观展示抽象概念
- **可交互组件** - 动态可视化工具，支持参数调节和实时反馈
- **三板块布局** - AI 对话 / 动画讲解 / 可交互内容无缝切换
- **答题会话持久化** - 测验进度写入 IndexedDB，退出后自动恢复现场
- **集中化快捷键系统** - 全局快捷键集中注册，支持逐项启停

### 📲 安装为应用（PWA）
- **桌面端固定到任务栏** - Edge / Chrome 打开站点 → 地址栏安装图标或菜单「安装此站点为应用」，即可像原生软件一样独立窗口运行，右键固定到任务栏一键秒开
- **手机端固定到主屏幕** - iPhone（Safari 分享 → 添加到主屏幕）/ Android（Chrome 菜单 → 安装应用），启动时全屏无浏览器地址栏
- **零安装包** - 无需应用商店下载，通过浏览器即可安装，不占用额外存储

### 🎨 外观个性化
- **字体与行距调节** - 设置面板可实时调节字体大小和行间距，适应不同阅读偏好
- **主题配色** - 内置多套配色方案，CSS 层驱动实时切换，设置持久化

### 🛠 技术亮点
- **统一窗口管理** - 浮窗、Artifact Viewer、全屏窗口由统一框架管理，全局任务栏一键召回
- **自定义 API 多模型与多分组** - 运行时添加任意 OpenAI 兼容端点与模型，按 API 分组隔离，与内置模型统一调度
- **Storage v2 性能架构** - 对话历史按会话拆分写入 IndexedDB，ChatThread 虚拟化、订阅隔离与例题懒加载共同保证长会话流畅
- **多学科内容树** - 统一的内容管理系统，支持教材、详解、录音、纪要分类
- **自定义 Markdown 指令** - `::video`、`::interactive`、`:::definition` 等富文本扩展
- **可视化原语库** - 维恩图、分布图、公式步骤等可复用组件
- **小窗播放模式** - 视频画中画功能，支持跨页面续播
- **响应式设计** - 基于 Tailwind v4 的现代化 UI
- **PWA 可安装** - Web App Manifest + appleWebApp，支持安装为桌面/移动端独立应用

## 量产章节内容

参见 **`docs/sop/02-detail-generation.md`**。指定章节即可经 Workflow 扇出子智能体，
为每个小节产出「详尽笔记 + 动画 + 交互」三件套。完整 SOP 体系见 `docs/sop/README.md`。

## 目录结构

```
app/                 # Next App Router（页面 + /api 路由）
components/           # 布局 / 笔记渲染 / 对话 / 视频 / 交互
lib/                 # store、内容注册表、内容加载器、AI 工具
content/             # 各小节 .md 笔记与内容资源
manim/               # Manim 场景与渲染脚本
docs/                # 逐字稿、纪要、SOP、设计文档
scripts/             # 内容提取、海报生成、工作流脚本
public/              # 静态资源（视频、图片、海报、PWA 图标）
```

## 项目架构

### 核心设计理念
- **多学科统一架构** - 通过 `SubjectId` 和 `CategoryId` 实现学科无关的内容管理
- **组件注册系统** - 交互组件通过 `registry.ts` 统一管理，支持懒加载
- **媒体清单驱动** - 视频资源通过 `media.generated.ts` 集中管理
- **富文本扩展** - 自定义 Markdown 指令实现多媒体内容嵌入
- **共享渲染架构** - 笔记与 AI 对话复用同一 Markdown 渲染核心，详见 `docs/refer/rendering-architecture.md`
- **状态管理** - Zustand 全局状态管理导航、播放、对话等跨组件状态；对话历史与交互演示产物持久化至 IndexedDB，设置/主题等小数据保留 localStorage（详见 `docs/refer/storage-architecture.md`）

### 关键技术组件
- **内容树** - `lib/content-data/manifest.ts` 定义多学科内容结构
- **路由系统** - 动态路由 `/[subject]/[category]/[id]` 支持多学科访问
- **AI 集成** - AI SDK 7 `ToolLoopAgent` + UIMessage Stream；保留原 provider/模型注册表，兼容 OpenAI-compatible 与 Anthropic，前端 transport/stream 只负责传输，Zustand + IndexedDB 继续负责历史与持久化。迁移边界及验收见 [Agent SDK / Trace UI 记录](docs/plans/archive/13-agent-sdk-trace-ui.md)
- **可视化引擎** - 基于 Manim 的数学动画 + React 可交互组件
- **公式渲染** - KaTeX 实现完美的数学公式显示

## 开发指南

### 环境要求
- Node.js 22+（本次迁移在 Node 24 上验证）
- pnpm 8+
- Python 3.8+（用于 Manim 动画渲染）
- LaTeX/MiKTeX（用于数学公式渲染）

### 本地开发

```bash
# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入你的 AI 端点配置

# 启动开发服务器
pnpm dev
# 访问 http://localhost:35349
```

### 渲染动画

```bash
# 渲染所有未生成的视频
pnpm render

# 渲染指定章节
pnpm render:chapter ch01

# 强制高画质重渲染
python manim/render.py --force --quality h
```

### 代码规范

```bash
# 运行 ESLint 检查
pnpm lint

# 自动修复问题
pnpm lint:fix

# 类型检查
pnpm exec tsc --noEmit

# 注册表、manifest 与内容文件一致性检查
pnpm check:registry
```

### 接入新学科

详细步骤请参考 [`docs/sop/subject-onboarding.md`](docs/sop/subject-onboarding.md)：

1. 在 `lib/content-data/subjects.registry.ts` 注册学科元数据
2. 用教材提取/导入脚本生成 `lib/content-data/{subject}-textbook.ts`
3. 在 `lib/content-data/manifest.ts` 挂载 `contentTree` 与教材条目
4. 按约定放置 `content/{subject}/{category}/` 正文，可选添加学科提示词
5. 运行 `pnpm check:registry`、`pnpm exec tsc --noEmit` 并访问首个路由验证

## 技术栈

### 前端
- **Next.js 16** - React 框架，App Router
- **React 19** - UI 库
- **TypeScript 5.7** - 类型安全
- **Tailwind CSS 4.0** - 样式框架
- **Zustand** - 状态管理

### 内容与数学
- **react-markdown** - Markdown 渲染
- **KaTeX** - 数学公式渲染
- **remark-math** - Markdown 数学语法支持
- **rehype-katex** - KaTeX 集成

### UI 组件
- **lucide-react** - 图标库
- **framer-motion** - 动画库
- **react-resizable-panels** - 可调整大小面板
- **@vidstack/react** - 视频播放器

### 动画与后端
- **Manim** - Python 数学动画引擎
- **ffmpeg** - 视频处理

## 贡献指南

我们欢迎各种形式的贡献！

### 如何贡献

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启一个 Pull Request

### 贡献类型
- 🐛 修复 Bug
- ✨ 新增功能
- 📝 改进文档
- 🎨 优化 UI/UX
- ⚡ 性能优化
- 🧪 添加测试

### 代码审查
所有 Pull Request 需要通过代码审查，确保：
- 代码符合项目规范
- 通过 ESLint 检查
- TypeScript 类型检查通过
- 必要时添加测试用例

## 常见问题

### AI 对话显示"未配置"
确保 `.env.local` 文件中正确配置了 AI 端点：
```
AI_BASE_URL=https://你的端点/v1
AI_API_KEY=sk-xxx
AI_MODEL_PRO=你的模型id
```

### 数学公式渲染异常
检查是否正确安装了 KaTeX 依赖，确保公式语法符合 KaTeX 规范。
注意：`$$` 必须独占一行，否则会导致渲染崩溃。

### 视频无法播放
确认视频文件存在于 `public/media/videos/` 对应目录，且 `lib/content-data/media.generated.ts` 中有条目记录。

### Manim 渲染失败
确保 Python 环境配置正确，已安装 Manim 和 ffmpeg。LaTeX/MiKTeX 用于公式渲染。

## 路线图

- [x] 大学英语练习板块（Unit 1–8）
- [x] 答题进度持久化
- [x] 自定义 API 多模型管理
- [x] 全局外观定制（字体 / 行距 / 主题）
- [x] 大学物理第一章内容（详解 / 例题 / 题库 / 录音例题 / 考前模拟）
- [x] AI 图片生成与计费仪表盘
- [x] 对话存储 Storage v2 与 ChatThread 虚拟化
- [x] 桌面端（Electron）v0.4.0 安装包发布
- [x] 大二上学期学年切换与五本教材（细胞生物学 / 组胚 / 生化 / 系统解剖 / 仪器分析）
- [x] 桌面端（Electron）v0.5.0 安装包发布
- [ ] 支持更多学科（线性代数等）
- [ ] 增强 AI 对话能力（知识图谱、多轮深度推理）
- [ ] 优化移动端体验
- [ ] 支持用户自定义笔记
- [ ] 集成更多可视化组件
- [ ] 添加单元测试和集成测试

## 许可证

本项目说明采用 MIT 许可证；仓库根目录的许可证原文文件尚缺，待维护者补齐。

## 致谢

- 感谢所有贡献者的支持
- 感谢开源社区提供的优秀工具和库
- 特别感谢课堂录音内容提供者

---

<div align="center">

**如果这个项目对你有帮助，请给个 ⭐️ Star 支持一下！**

Made with ❤️ for learners everywhere

</div>
