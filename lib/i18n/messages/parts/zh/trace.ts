/**
 * trace 命名空间（中文真相源）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 只加在本文件；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 *
 * 本命名空间覆盖「Agent 思考链 + 工具展示」：折叠标题、步骤行、工具摘要、
 * 21 个工具的展示元数据（labelKey / settingsLabelKey / descriptionKey）。
 * 中文值一字不差照搬原字面量——既有测试与既有观感都钉在这些字串上。
 */
export const traceZh = {
  // 处理过程（思考链）的状态词
  status: {
    done: "处理完成",
  },
  // 折叠入口那一行的标题
  summary: {
    aria: "Agent 处理过程",
    stepsAria: "按执行顺序排列的步骤",
    process: "处理过程",
    working: "正在处理…",
    waiting: "等待工具批准",
    stopped: "处理已停止",
    partialError: "处理结束，部分步骤未完成",
    underOneSecond: "已处理不到 1 秒",
    seconds: "已处理 {seconds} 秒",
    minutes: "已处理 {minutes} 分 {seconds} 秒",
    thinking: "正在思考…",
    composing: "正在整理回答…",
  },
  // 单条步骤行
  step: {
    status: {
      running: "进行中",
      complete: "已完成",
      // 状态语气（「状态：失败」）。跟结果语气的 window.common.failed（「失败」）是两份，别并。
      error: "失败",
      interrupted: "已停止",
      waiting: "待批准",
    },
    underOneSecond: "不到 1 秒",
    seconds: "{seconds} 秒",
    reasoningTitle: "思考",
    textTitle: "进展说明",
    thinking: "正在整理思路…",
    input: "输入参数",
    output: "返回结果",
    errorOutput: "调用失败",
    success: "运行成功",
  },
  // 工具步骤的摘要与兜底文案
  tool: {
    learningConnectors: {
      authorizationSaved: "{provider} 已关联，可以回到对话使用。",
      verifyAccount: "前往账号中心验证身份",
      accountDisabled: "统一账号当前不可用，请联系账号管理员；重新授权学习服务无法解除限制。",
      emailUnverified: "请先在统一账号完成邮箱验证，再连接学习服务。",
      authorizationCancelled: "本次授权已取消。需要时可以重新连接。",
      authorizationRetry: "本次授权未完成或已过期，请在当前账号重新连接。",
      selectApprovedScopes: "请选择至少一项已批准的 Google 功能。",
      configurationRequired: "服务连接配置尚未就绪，请联系管理员后重试。",
      rateLimited: "提供者暂时限制请求，请稍后刷新状态。",
      disconnectedRevoked: "已断开本项目连接，并撤销提供者授权。",
      disconnectedLocal: "已断开本项目连接。提供者授权尚未确认撤销，请到提供者设置中核对。",
      label: "学习服务", settingsLabel: "学习连接器", description: "读取已关联的笔记、待办、课件、日历、邮件与文献；外部写入须确认。",
      manage: "管理学习服务连接", manageHint: "关联你的账号后，助教可以使用你允许的学习资料。", connect: "关联账号", reconnect: "重新授权", disconnect: "断开连接", disconnectConfirm: "确定断开这个学习服务？新的读取与写入将停止。", refresh: "刷新状态", signIn: "请先登录", failed: "学习服务操作未完成", scopes: "选择允许助教使用的功能", googleFiles: "读取云盘课件", googleCalendar: "读取日历", googleCalendarWrite: "创建学习日程", googleMailRead: "读取课程邮件", googleMailSend: "发送已确认邮件", googleContacts: "查找联系人", connected: "已关联", disconnected: "未关联", available: "可直接使用", reauth: "需要重新授权", api: "官方 API", mcp: "官方 MCP", local: "本地导出", result: "学习服务结果", proposal: "请检查这次外部操作", parameters: "具体目标与内容", approve: "确认执行", reject: "取消", proposed: "等待确认", executing: "正在执行", succeeded: "已完成", cancelled: "已取消", uncertain: "结果需要核对，请勿重复执行", expired: "候选已过期，请重新生成", download: "下载 Anki 闪卡", exportHint: "导出完整复习卡片；导入时保留已有复习记录。", accountChanged: "账号已切换，请在当前账号重新生成导出。", fullParameters: "查看完整参数", source: "查看来源", scopeRequired: "需要补充授权，请在连接管理中选择对应功能。", readOnly: "只读操作", writeCandidate: "候选操作，确认后才写入",
    },
    kitSolo: { label: "KitSolo 工具箱", settingsLabel: "KitSolo 工具", description: "关联后检索并调用文本、编码和数据工具。", open: "打开工具工作台", copy: "复制结果", failed: "工具调用失败" },
    cloudSandbox: { label: "云端命令", settingsLabel: "云端命令与文件", description: "仅独立 Agent 可在隔离云沙箱运行命令、生成和下载文件。", title: "云端执行", refresh: "查看进度", cancel: "停止命令", close: "关闭沙箱", download: "下载文件", failed: "操作未完成", confirmClose: "关闭当前云沙箱？请先保存需要的文件。", expired: "请在独立 Agent 对话中操作此任务。", logExcerpt: "当前显示日志摘要；点击“查看进度”可读取已保存的完整日志。" },
    callAria: "工具调用",
    denied: "此次工具调用未获批准",
    runFailed: "运行失败",
    interrupted: "已停止，未收到完整结果",
    waitingApproval: "等待批准后继续",
    deduped: "已在上下文中，复用已加载内容",
    preparing: "正在准备参数…",
    running: "正在运行…",
    images: "找到 {count} 张笔记图片",
    questions: "{count} 道题",
    questionsWithTitle: "{count} 道题 · {title}",
    document: "文档：{title}",
    untitled: "未命名",
    sources: "{count} 条来源",
    imageSources: "{count} 张图片",
    cacheHit: " · 缓存命中",
    hits: "找到 {count} 条笔记",
    skillUsed: "已调用技能：{name}",
    skillMissing: "未找到技能：{name}",
    proposeNote: "提议整理成笔记",
    proposeFlashcard: "提议整理成闪卡",
    note: "笔记：{title}",
    noteWritten: "已写入",
    flashcards: "{count} 张闪卡",
    flashcardsWithMode: "{count} 张闪卡 · {mode}",
    // 21 个工具的展示元数据：label 是思考链步骤标题，settingsLabel / description 是设置面板文案
    getCurrentPage: {
      label: "阅读当前页面",
      settingsLabel: "读取当前页",
      description: "让 AI 获取你正在阅读的页面内容",
    },
    getOutline: {
      label: "查阅课程大纲",
      settingsLabel: "课程大纲",
      description: "让 AI 查看全部科目的章节大纲",
    },
    getSection: {
      label: "读取笔记章节",
      settingsLabel: "读取指定页面",
      description: "让 AI 调取任意科目的任意小节正文",
    },
    searchNotes: {
      label: "检索笔记",
      settingsLabel: "全文检索",
      description: "让 AI 在课堂笔记和个人笔记中按标题/正文/科目检索；先列表再按 id 取全文",
    },
    searchFlashcards: {
      label: "检索闪卡",
      settingsLabel: "闪卡检索",
      description: "让 AI 在现有复习闪卡中按正反面/原文/科目查找，先列表再按 id 引用分析",
    },
    searchNoteImages: {
      label: "检索笔记图片",
      settingsLabel: "笔记图片",
      description: "让 AI 检索并直接引用课程笔记里已有的插图",
    },
    webSearch: {
      label: "搜索网页",
      settingsLabel: "联网搜索",
      description: "三家源可选（Kimi / 智谱 / Perplexity）；联网获取实时信息",
    },
    imageSearch: {
      label: "搜索图片",
      settingsLabel: "联网图片",
      description: "随联网搜索开关启用；从 Unsplash 搜索真实照片",
    },
    renderInteractive: {
      label: "HTML 演示",
      settingsLabel: "HTML 演示",
      description: "生成可交互的 HTML 演示页（Artifact），在独立浮窗中打开",
    },
    drawDiagram: {
      label: "绘制图示",
      settingsLabel: "SVG 绘图",
      description: "让 AI 绘制矢量示意图（分子/电路/光路/几何等）",
    },
    generateImage: {
      label: "准备生成图片",
      settingsLabel: "AI 生图",
      description: "让 AI 生成图片（需用户批准，优先 SVG，仅必要时使用）",
    },
    createQuiz: {
      label: "出题",
      settingsLabel: "结构化出题",
      description: "让 AI 用题库组件出可作答、可判分的题目（替代折叠文本）",
    },
    writeDocument: {
      label: "撰写长文档",
      settingsLabel: "长文档撰写",
      description: "让 AI 分节撰写长文章/论文/报告，可导出 Markdown",
    },
    getArtifact: {
      label: "取回演示全文",
      settingsLabel: "取回演示全文",
      description: "按 id 取回此前生成的 HTML 演示全文（上下文里只保留摘要）",
    },
    useSkill: {
      label: "调用技能",
      settingsLabel: "技能",
      description: "随技能库启用",
    },
    proposeMemory: {
      label: "提议沉淀",
      settingsLabel: "记忆提议",
      description: "对话里出现值得记住的定义/定理/步骤时，轻量提议整理成笔记或闪卡",
    },
    commitNotes: {
      label: "写入笔记",
      settingsLabel: "沉淀笔记",
      description: "学生确认后，把短要点提纲写入个人笔记并打开编辑器",
    },
    commitFlashcards: {
      label: "写入闪卡",
      settingsLabel: "沉淀闪卡",
      description: "学生确认后，把可测验条目写入复习板（摘录/挖空/出题/自定义）",
    },
    updateUserNote: {
      label: "改写笔记",
      settingsLabel: "改写笔记",
      description: "按 id 改写或删除个人笔记；正在编辑时也可直接写回当前篇",
    },
    getProjectFiles: {
      label: "查看项目文件索引",
      settingsLabel: "项目文件",
      description: "查看项目文件的文件树与切片索引（正文用 readProjectSlices 按需读）",
    },
    readProjectSlices: {
      label: "读取项目切片",
      settingsLabel: "项目切片",
      description: "按切片读项目文件正文（未携带的切片会提示用户点「带入对话」）",
    },
    searchClassTranscript: {
      label: "检索课堂文稿",
      settingsLabel: "课堂文稿",
      description: "Class 模式下检索本节课或以前课堂的录音文稿，并按编号标注出处",
    },
  },
  // 消息外壳
  message: {
    you: "你",
    assistantAria: "AI 回复状态",
    thinkingEnabled: "已启用深度思考",
    searchEnabled: "已启用联网搜索",
  },
  // 对话流容器
  thread: {
    loadingHistory: "正在加载历史记录...",
    loadEarlier: "加载更早消息",
    loadingEarlier: "正在加载更早消息...",
    thinking: "AI 正在思考中...",
    closeInfo: "关闭连接提示",
    closeError: "关闭错误提示",
    followOutput: "跟随最新输出",
  },
  // 面板级提示（上下文告警 / 空对话轻反馈）
  panel: {
    blankHint: "已经在一条新对话里了，直接说你想做什么就行。",
    contextWarning: "上下文已使用 {percent}%，之后请求会自动压缩较早对话；你仍然可以继续输入。",
    // 手动压缩后的提示（lib/context/compactChatSession.ts 写进 tokenTracker.contextWarning）
    manualCompacted: "已手动压缩较早对话",
  },
  // 顶部导航行
  header: {
    title: "AI 助教",
    settingsTitle: "AI 设置",
    settings: "设置",
    historyTitle: "历史记录",
    history: "历史",
    newChatTitle: "开启新对话",
  },
  // 折叠条
  fold: {
    expand: "展开",
  },
  // 空对话欢迎页
  welcome: {
    earlyMorning: "夜深了，想做点什么？",
    morning: "早上好，今天想做点什么？",
    noon: "中午好，想做点什么？",
    afternoon: "下午好，今天想做点什么？",
    evening: "晚上好，想做点什么？",
    example: {
      outline: "把今天的课堂笔记整理成复习提纲",
      flashcards: "按我的笔记出 5 张复习闪卡",
      demo: "做一个可拖动的演示，帮我理解一个公式",
      brief: "查一下最新资料，整理成一页简报",
    },
  },
  // 右侧的提问定位点
  dots: {
    aria: "对话定位",
    turn: "第 {turn} 次提问",
    turnWithPreview: "第 {turn} 次提问：{preview}",
    current: " · 当前",
    range: "第 {start}–{end} 次提问",
    rangeTitle: "较早的提问",
    rangeHint: "第 {start}–{end} 次，展开后可精确定位",
    blank: "空白提问",
    quoted: "“{preview}”",
  },
  // 内联可视化折叠块与错误边界
  viz: {
    fallbackLabel: "图形",
    error: "⚠️ 该{label}渲染失败（已跳过，不影响其余内容）",
    showSource: "查看源码",
    hideSource: "收起源码",
    venn: "韦恩图",
    distribution: "分布图",
    formulaSteps: "推导步骤",
    manim: "动画演示",
    diagram: "图示",
    fallback: "可视化",
  },
  // 联网来源折叠卡
  webSources: {
    title: "联网来源",
    foldTitle: "{label} · {count} 条{footnote}",
    cached: " · 缓存",
    searching: "正在搜索 {providers}…",
    failed: "搜索失败",
    scrollPrev: "向前滚动来源",
    scrollNext: "向后滚动来源",
  },
  // 追问卡
  followUp: {
    title: "你可能还想问",
    sourcesOnly: "本轮依据",
  },
  // 引用笔记折叠卡
  citations: {
    title: "引用笔记 · {count} 条",
    open: "查看",
  },
  // 笔记图片画廊、联网搜图与聊天图片
  images: {
    title: "笔记图片 · {count} 张",
    searchTitle: "本次搜索图片 · {count} 张",
    fallbackAlt: "图片 {index}",
    untitled: "图片",
    loadFailed: "图片加载失败",
  },
};
