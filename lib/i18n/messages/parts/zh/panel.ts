/**
 * panel 命名空间（中文真相源）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 只加在本文件；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 *
 * 分工：panel 管「面板与窗口外壳」——右栏本体、窗口 chrome、标签条、加号菜单、
 * 文档阅读器外壳、面板里的账户与用量看板。窗口**里面**的业务界面在 window 分片。
 */
export const panelZh = {
  // 面板与窗口外壳的通用动作
  common: {
    // 「关闭」= 关掉窗口 / 浮层本身。**不要**跟 menu.thinking.off.label、share.assets.disable
    // 那两个「关闭」合并 —— 那两个是「关掉一个开关」，英文是 Off / Turn off，跟 Close 不是一回事。
    close: "关闭",
    collapse: "收起",
    open: "打开",
  },

  // 右栏本体：内置栏目名、加载态、栏内错误边界
  rightTab: {
    ai: "AI 对话",
    video: "动画讲解",
    interactive: "可交互",
    browser: "浏览器",
    loading: "{label} 加载中",
    // 「可交互」栏外壳（components/interactives/InteractiveTab.tsx）
    interactiveEyebrow: "可交互内容 · {section}",
    interactiveEmptyTitle: "本节交互内容即将生成",
    interactiveEmptyHint: "将提供可点击、拖动的 SVG / 图表式可视化，帮助直观理解本节知识本质。",
    errorTitle: "面板加载失败",
    errorBody: "这个栏目遇到了运行时错误，已经拦截以避免白屏。可以重试，或切换到其他栏目继续使用。",
    removeBookmark: "移除收藏",
  },

  // 中间笔记区上方的 Tab 栏（笔记 / 视频 / 可交互 / 浏览器）
  centerTab: {
    notes: "笔记",
    aria: "内容视图",
  },

  // 右栏 Agent 顶部（Cursor 式）：最近对话标签条 + 图标动作
  agentBar: {
    recentAria: "最近对话",
    newChat: "开启新对话",
    settings: "AI 设置",
    history: "历史记录",
    collapse: "收起右侧面板",
    closeTab: "关闭 {title}",
    untitled: "新对话",
  },

  // 窗口 chrome（红绿灯 / 标题 / 外链 / 缩放）与右栏标签条
  window: {
    minimize: "最小化",
    restore: "还原",
    fullscreen: "全屏",
    openInNewTab: "在新标签页打开",
    resize: "拖拽缩放窗口",
    tabsAria: "工作区标签",
    openTab: "打开 {title}",
    closeTab: "关闭 {title}",
  },

  // 加号菜单：右栏「＋」与右栏空态共用同一批入口
  addMenu: {
    addContent: "添加内容",
    addContentHint: "添加笔记、闪卡、文件或网址",
    projectAria: "项目",
    projectFiles: "项目文件",
    projectFilesHint: "本地索引 + 切片",
    openPanelsAria: "打开面板",
    pickNote: "选择笔记",
    pickNoteHint: "引用我的 / 课程笔记",
    flashcardPage: "复习闪卡页面",
    flashcardHint: "管理记忆卡",
    importAria: "导入产物",
    document: "导入长文本",
    documentHint: "Agent 讲义",
    artifact: "导入可交互 HTML",
    artifactHint: "Agent 演示",
    createAria: "新建文件",
    newNote: "新建笔记",
    newNoteHint: "Markdown · 公式",
    addFile: "添加文件",
    addFileHint: "PDF、文本、代码",
    footer: "笔记、闪卡、长文本和演示都从本机仓库打开，不会重新生成。",
  },

  // 文件添加失败弹窗
  fileError: {
    aria: "文件添加失败",
    eyebrow: "文件添加提醒",
    title: "文件无法添加",
    confirm: "知道了",
  },

  // 右栏空态：工作区里一个窗口都没有 / 全被收起来
  dockEmpty: {
    flashcard: "复习闪卡",
    hiddenTitle: "窗口都收起来了",
    emptyTitle: "工作区还没有内容",
    hiddenHint: "点上方的标签可以再打开它们。",
    emptyHint: "从下面选一个开始，或用右上角 ＋ 添加文件、网址。",
  },

  // 加号菜单末尾的「打开网址」输入条
  url: {
    group: "输入网址",
    field: "网址",
    placeholder: "输入网址…",
    invalid: "请输入有效的 http:// 或 https:// 地址",
    titleTag: "网址",
  },

  // 文档阅读器外壳（PDF / Word / PPTX 共用的工具栏与目录）
  reader: {
    prevPage: "上一页",
    nextPage: "下一页",
    page: "第 {page} 页",
    pageRenderFailed: "第 {page} 页渲染失败：{error}",
    openFailed: "无法打开 {name}",
    unknownError: "未知错误",
    outlineOf: "{name} 目录",
    outline: "目录",
    emptyOutline: "没有目录",
    collapseOutline: "收起{label}",
    expandOutline: "展开{label}",
    zoomOut: "缩小",
    zoomIn: "放大",
    reset: "重置",
  },

  // PDF 阅读器
  pdf: {
    readFailed: "无法读取该 PDF",
    openFailed: "无法打开 PDF",
    password: "该 PDF 有密码保护，暂不支持预览",
    renderFailed: "无法渲染 PDF",
    loading: "正在载入 PDF…",
  },

  // Word 阅读器
  docx: {
    renderFailed: "无法渲染 Word",
  },

  // PPTX 阅读器
  pptx: {
    readFailed: "无法读取该 PPTX",
    loading: "正在准备幻灯片…",
    slide: "幻灯片 {number}",
    outline: "幻灯片",
    title: "PowerPoint 本地预览",
  },

  // 上下文看板（TokenDashboard）
  token: {
    title: "上下文看板",
    open: "打开上下文看板",
    close: "关闭上下文看板",
    openBilling: "打开计费总览",
    refresh: "刷新上下文估算",
    pin: "固定面板",
    unpin: "取消固定",
    tooltip: "{pct} ({used} / {limit}) 上下文已使用",
    used: "上下文使用",
    usageAria: "上下文使用比例",
    // 上下文环文案（lib/context/estimateFullContext.ts 的 contextRingCaption 返回这两个 key）
    ringApproaching: "接近 80% 软上限",
    ringLimit: "已达 80% 软上限",
    compact: "压缩",
    compacting: "压缩中…",
    cacheRow: "上下文缓存",
    sendPolicy: "发送策略",
    sendPolicyRolling: "滚动摘要",
    breakdown: "上下文构成",
    cat: {
      tools: "系统提示词",
      skills: "技能",
      pages: "笔记页面",
      webSearch: "联网搜索",
      conversation: "对话",
    },
    lastTurn: "本轮对话",
    promptTokens: "输入 token",
    completionTokens: "输出 token",
    cacheHit: "缓存命中",
    turnCost: "本轮费用",
    total: "累计计费",
    totalInput: "总输入",
    totalOutput: "总输出",
    hitCount: "{count} 次",
    hitRate: "命中率",
    totalCost: "累计费用",
    priceNote: "价格为平台参考价，实际以 API 提供商结算为准。缓存命中窗口默认 {minutes} 分钟。",
    countdown: "缓存倒计时",
    estimate: "估算",
    remaining: "剩余时间",
    expired: "已过期",
    waiting: "等待首次对话",
    expiredTitle: "缓存可能已过期，下次请求将按全价计费",
    expiredDelta: "（约 {amount} 更贵）",
    priceShift: "过期后输入价格将从 {before} → {after} /百万token",
  },

  // API 计费总览（BillingDashboard）
  billing: {
    windowTitle: "API 计费总览",
    exportCsv: "导出 CSV",
    exportRecords: "导出记录",
    calls: "{count} 次调用",
    range: {
      d7: "最近 7 天",
      d30: "最近 30 天",
      all: "全部历史",
    },
    recordCount: "共 {count} 条记录",
    empty: "暂无计费数据",
    trend: "费用趋势",
    column: {
      time: "时间",
      model: "模型",
      type: "类型",
      tokens: "消耗 (In/Out/Cache)",
      cost: "费用",
      provider: "供应商",
    },
    typeImage: "生图",
    typeChat: "对话",
    imageCount: "{count} 张",
  },

  // 账户额度（AccountQuota）
  quota: {
    getMembership: "获取会员",
    tier: {
      free: "免费会员",
      plus: "Plus 会员",
      pro: "Pro 会员",
    },
    loadingAccount: "正在读取账户…",
    signInHint: "登录后查看会员与额度",
    title: "会员与额度",
    refresh: "刷新额度",
    platform: "平台模型额度",
    byok: "自备 API 辅助额度",
    platformRemaining: "平台模型剩余额度",
    byokRemaining: "自备 API 辅助剩余额度",
    note: "辅助额度用于平台提供的搜索等能力，不是外部 API 账户余额。",
    periodEnd: "当前额度周期截至 {date}。",
    updatedAt: "上次更新：{time}",
    reading: "正在读取额度…",
    unavailable: "额度暂不可用",
  },

  // 云同步占用（StorageQuota）
  storage: {
    local: "本机可同步占用",
    cloud: "云端已用",
    loading: "正在统计占用…",
    refresh: "刷新占用",
    rowAria: "{label}占用",
    // 同步类别与额度池的名称 / 单位（lib/sync/usage.ts 的 SYNC_KIND_META / SYNC_POOL_META）
    kind: {
      chatSession: { label: "全部对话", unit: "条" },
      artifact: { label: "演示", unit: "个" },
      document: { label: "文档", unit: "篇" },
      userNote: { label: "个人笔记", unit: "篇" },
      reviewCard: { label: "复习闪卡", unit: "张" },
      chatProject: { label: "对话项目", unit: "个" },
    },
    pool: {
      notes: { label: "笔记额度池", unit: "篇" },
      flashcards: { label: "闪卡额度池", unit: "张" },
    },
    hintSignedIn: "占用按同步后的对话、演示、文档、笔记与闪卡合计。笔记 / 闪卡另有独立额度池。不含用户上传的图片与 PDF。",
    hintLocal: "未登录时按本机将同步的内容估算，登录后改为云端实际占用。",
  },

  // 获取会员窗（MembershipSponsorWindow）
  membership: {
    title: "获取会员",
    intro: "本站开源。需要更多额度时，可以联系站长或发邮件申请；如果学习过程中真的帮到你，也欢迎赞赏。",
    repo: "GitHub 开源仓库",
    contact: "联系站长获取更多额度",
    qrAlt: "赞赏码",
    note: "真实对你有帮助，欢迎来赞赏。",
  },
};
