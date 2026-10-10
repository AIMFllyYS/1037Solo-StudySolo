# Classolo 全量接入 + Review 模式 + Agent UX — 目标与进度（2026-09-29 起）

> 可恢复记录。会话丢失后先读本文件，再 `git status` / `git log` 核对真实状态。

## 目标（用户原话要点）

1. 1037Solo-Classolo（仓库内 `1037Solo-Classolo/`，gitignored，只读）全部真实功能在 StudySolo `/class` 可用，计费对齐生态中央额度 RPC。
2. 前端与 StudySolo 吻合：统一主题/字体控制，保留最顶部导航栏。
3. 完成 Classolo GitHub issues 中属于 Class 模式的必要项（见下表）。
4. 新增第 4 模式 Review：左侧闪卡 + 笔记（Notion 式完整 md 编辑器）+ 答题（错题驱动 AI 出题 / 章节 Agent 出题，复用 Agent 机制）。
5. Bug：① Agent 声称调用工具但未调用 / 深度思考后无正文；② 切主题同时换字体；③ Studio 右侧 Agent 面板 Cursor 化（可交互/视频/浏览器移至中间笔记区 Tab；顶部 Tab = 最近对话，图标化设置/历史，无「AI 助教」）。

## 阶段

| 阶段 | 内容 | 状态 |
|---|---|---|
| P0 | 恢复现场：盘点未提交 WIP、typecheck、定向测试 | ✅ tsc 0；34 files/167 tests 通过 |
| P1 | Bug ①② | ✅ 已在 d8530f1a（completionGuard + 主题字体） |
| P2 | 右栏 Cursor 化 + CenterWorkspace 中间 Tab（WIP） | 🔄 代码存在，待浏览器验收 + 提交 |
| P3 | Classolo 真实功能验收（登录态浏览器 E2E）并修复断点 | ⏳ |
| P4 | Classolo issues：#63 会话库、#64 导航完整形态、#65 知识卡片、#66 素材检索、#70 复习定位新对话 | 🔄 #63/#65 WIP 存在 |
| P5 | Review 模式：笔记/闪卡/答题/掌握度（#52/#68 SRS、#71 题目 Schema、#74 错题加固、#75 掌握度） | 🔄 WIP 骨架存在 |
| P6 | UX 统一打磨、全量回归、提交推送 | ⏳ |

## Issue 取舍

- 纳入：#50/#63、#64、#51/#65、#66、#70、#53/#71、#52/#68（SRS）、#55/#74、#75、#78/#80/#81（已在 9/27 迁移完成，复核）。
- 不纳入：Electron #9/#45-49、Playbook #8、宝塔 nginx #83/#60（StudySolo 独立云部署）、#73 腾讯医学 ASR（无凭据）、#72 桌面定时出题（桌面路径不适用；Web 端以按需出题替代）、#76/#77 P2 教材上传/押题。

## 待汇报问题

- 本机网络经 198.18.0.1 TUN 代理：到模型商偶发 `ECONNRESET` / 上游 429。连接阶段失败与 429 已自动退避重试且不计费；发送后断连按既定口径「额度保留待核对」，不自动重试。生产环境需另行观察。

## 进度日志

- 05:00 E2E 基建：Playwright(core 1.63) + 专用测试账号 OAuth(aal2) cookie，脚本在 `$KIROCREW_SCRATCH/kc/pw`（不入库）。
- 05:05 根因：课堂 AI SDK baseURL 为相对路径 → `new URL` 抛错，静默 Agent/课堂助手/大纲从未真正调用模型（「没有真正接入」的主因）。已修 453a8a9c。
- 05:30 真实录音链路验证：Chromium 伪麦克风 + Windows TTS 中文 WAV → `/api/class/asr` (SiliconFlow Qwen3-ASR) 200，文稿实时出现，停止后 AI 层级大纲、随堂题、KaTeX 补充卡片正常。979babbc。
- 下一步：Review 模式 E2E（闪卡含课堂自动卡、笔记编辑器、答题/错题），再做 Studio 右栏与中间 Tab 验收。
