# GOAL_PROGRESS — 用户反馈后的系统性修复轮（2026-09-30）

目标：
1. 叉掉 Agent 顶部标签 = 仅隐藏，不删除；删除只在历史里、必须二次确认。
2. Class 的 Agent 直接复用 Studio/Agent 页的 Agent 面板（设计、交互、架构），不另造一套。
3. 中间区 Tab 合并为一条（题目/正文/浏览器/可交互）；修配色与对比（Class 按钮、课堂设置面板透明）、笔记页设计；Class/Review/Agent 面板动画缓动统一。每项在真实浏览器验收。

## 进度
- [x] 云端恢复：RootSolo `ss_sync_documents` 用户 82e2e0df 的 41 个对话 + 10 个作品改回未删除（空内容的墓碑不动）。
- [x] 叉号只隐藏（3ea99c2c）：`lib/stores/agentTabs.ts` 记录已关闭标签；当前会话自动回到标签条。
- [x] 历史删除二次确认：历史面板与侧栏原本就有确认步骤，已核对。
- [x] Class Agent 复用 Studio Agent（64f49ac2）：`StudioAgentPanel` 抽成独立组件，Class 右栏直接挂；课堂上下文走 `classContext` + 服务端 `searchClassTranscript` 工具；删除 classolo 自带聊天 8 个文件。
- [x] 中间 Tab 合并（6985dec5）：内容页标签注册进 `lib/stores/contentTabs.ts`，`CenterWorkspace` 一条栏画 正文/例题/题目测试/视频/可交互/浏览器，选中底色滑动。
- [x] 配色/透明面板（a39ab12a、4cb01882）：根因是语义色 @theme 写在非 Tailwind 入口的 classolo/styles.css，bg-card 等工具类根本没生成；已迁到 `app/styles/semantic-tokens.css`。实色 accent 按钮文字改 on-primary；课堂弹窗对齐 .app-dialog；Button 变体对齐 Studio。
- [x] 笔记页（94025f85）：Review 笔记整页 Notion 式版式；删除改用应用内二次确认弹窗。
- [x] 动画统一（ff0363e9）：.ss-rail / .ss-view-enter / LAYOUT_REFLOW；Agent 标签滑动底色、关闭用中性色。
- [ ] 浏览器验收：用户确认暂不做（依赖统一登录）。
- [ ] 浏览器验收：被登录挡住——线上 account.1037solo.com/oauth/consent 未登录时 500，/login 在无头浏览器里停在「加载中…」；本地 3040 的 Accounts 前端 consent 页一直重定向。
- 验证：tsc 0 错；eslint 通过；vitest 186 文件 824 全过；node:test 1801（1800 过、0 失败）。
- 注意：origin/dev 还没有合入 PR #161。
