/**
 * menu 命名空间（中文真相源）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 只加在本文件；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 */
export const menuZh = {
  // 菜单通用动作（对话框 / 右键菜单 / 下拉共用）
  common: {
    delete: "删除",
    close: "关闭",
    select: "请选择",
  },
  // 消息右键菜单（引用 / 追问 / 记录；「复制」走 common.copy）
  contextMenu: {
    quote: "引用到对话",
    ask: "追问",
    record: "记录到复习板",
  },
  // 划词助手动作条：key 与 SELECTION_ASSISTANT_ACTION_LABELS 的动作 id 一一对应
  // （copy / copied 两条已并进 common.copy / common.copied）
  selection: {
    explain: "解释",
    record: "记录",
    note: "笔记",
    ask: "追问",
    quote: "引用",
    hidden: "已隐藏「{label}」",
  },
  // 深度思考（输入栏按钮 + 模型二级菜单共用）
  thinking: {
    title: "深度思考",
    trigger: "深度思考·{level}",
    required: " · 当前模型必须开启",
    unsupported: "当前模型不支持深度思考",
    active: "开",
    strength: "思考强度",
    off: {
      // 「关闭」= 关掉深度思考这个开关（英文 Off），不是 panel.common.close 的「关闭窗口」。
      label: "关闭",
      hint: "不启用推理链，直接回答",
    },
    on: {
      label: "开启",
      hint: "启用推理链，不区分强度档位",
    },
    hint: {
      low: "轻量推理 · 更快更省",
      medium: "平衡（多数任务默认）",
      high: "加强推理 · 复杂题",
      max: "最深思考 · 最贵",
    },
  },
  // 模型选择菜单
  model: {
    choose: "选择模型",
    short: "模型",
    dialog: "模型选择",
    builtin: "内置模型",
    auto: "自动模型",
    series: "模型系列",
    models: "具体模型",
    backToSeries: "返回模型系列",
    backToEffort: "返回思考强度",
    pricing: "每百万 Token · 输入 / 缓存 / 输出",
    details: "模型详情",
    info: "模型信息",
    selected: "已选模型",
    custom: "自定义 API",
    customHeading: "用户自定义 API",
    use: "选用此模型",
    category: {
      free: "免费模型",
      fast: "快速模型",
      multimodal: "多模态模型",
      flagship: "旗舰模型",
      image: "生图模型",
    },
    badge: {
      vision: "视觉",
      context: "上下文 {window}",
      thinking: "思考",
      thinkingRequired: "思考不可关",
      image: "生图",
      tools: "工具",
    },
  },
  // 输入区外壳（工具条 / 排队 / 引用 / 占位符 / 发送）
  modelEffort: {
    selectModel: "选择模型",
    switchModel: "切换模型",
    reset: "恢复默认思考深度",
    sliderAria: "思考深度",
    back: "返回",
    unsupported: "当前模型不支持调节思考深度",
    fixedOn: "该模型始终开启思考",
    stepsAria: "{count} 档",
    fast: "Fast 模式",
    fastUnsupported: "该模型没有 Fast 变体",
  },
  chatInput: {
    toolbarAria: "对话选项",
    more: "更多对话选项",
    addIntent: "添加计划、工具或技能",
    inputAria: "输入问题",
    send: "发送",
    stop: "停止生成",
    charCount: "{count} / 50,000 字",
    search: {
      label: "联网搜索",
      title: "联网搜索（需配置搜索API）",
      hint: "使用搜索 API 获取最新信息",
    },
    mode: {
      aria: "执行模式",
      heading: "执行模式",
      ask: "询问模式",
      askHint: "生成笔记、闪卡或调用工具前先征得你的同意",
      auto: "完全同意模式",
      autoHint: "自动执行生成闪卡、笔记修改及任何工具（含云沙箱），不再逐次确认",
      autoNote: "删除类操作仍会单独确认",
    },
    queue: {
      title: "等待发送",
      count: "{count} 条",
      edit: "编辑",
      editAria: "编辑第 {index} 条排队内容",
      cancelAria: "取消第 {index} 条排队内容",
    },
    quote: {
      label: "引用自当前页面",
      remove: "移除引用",
    },
    placeholder: {
      disabled: "输入已禁用",
      signInRequired: "登录后即可使用 AI 对话",
      checkingAccount: "正在验证账号…",
      historyLoading: "正在恢复对话历史…",
      queued: "继续输入，发送后将排队…",
      default: "输入问题、引用笔记、计划或工具",
    },
    access: {
      signedOutTitle: "登录后继续对话",
      signedOutBody: "对话历史按登录账号隔离。请先登录，再继续提问或恢复历史记录。",
      checkingTitle: "正在验证账号状态",
      checkingBody: "账号验证完成后，这里会显示对应账号的对话。",
      ownerChangedTitle: "账号已切换",
      ownerChangedBody: "此浮窗属于另一个账号。为保护对话隔离，请关闭后在当前账号重新打开。",
      signIn: "登录统一账号",
      closeWindow: "关闭浮窗",
    },
    autoPrompt: {
      files: "请阅读这些笔记",
      attachments: "请阅读并分析附件",
    },
  },
  // 输入框 / 加号面板（计划、压缩、强制工具、技能）
  composer: {
    aria: "对话命令",
    plan: "计划模式",
    compact: "压缩上下文",
    on: "已开",
    selected: "已选",
    toolsHeading: "特定工具",
    skillsHeading: "已导入 Skills",
    empty: "没有匹配的命令",
    skill: "技能",
    clearPlan: "关闭计划模式",
    clearTool: "取消指定工具",
    removeFile: "移除 {title}",
    tool: {
      generateImage: "生成图片",
      renderInteractive: "可交互网页",
      writeDocument: "生成长文",
      flashcards: "整理闪卡",
      notes: "整理笔记",
    },
  },
  // # 引用笔记菜单
  fileMention: {
    aria: "引用笔记",
    empty: "没有可引用的笔记",
    group: {
      nearby: "当前页附近",
      parent: "父层级",
      matched: "匹配的笔记",
    },
  },
  // 输入框右下角项目 chip
  projectPicker: {
    label: "对话所属项目",
    recent: "最近项目",
    empty: "还没有项目，先建一个。",
    sessionCount: "{count} 个对话",
    nameAria: "新项目名称",
    namePlaceholder: "项目名称",
    create: "建",
    add: "添加新项目",
    addHint: "建好后当前对话就归它",
    clear: "不使用项目",
    clearHint: "回到 Recents",
  },
  // 历史记录浮层
  history: {
    navAria: "历史记录分类",
    back: "返回对话",
    title: "历史记录",
    tab: {
      main: "对话",
      floating: "划词",
      image: "生图",
    },
    sessionCount: "{count} 个会话",
    taskCount: "{count} 个任务",
    messageCount: "{count} 条消息",
    imageCount: "{count} 张",
    page: {
      main: "对话记录",
      floating: "划词对话",
      image: "生图记录",
    },
    desc: {
      main: "继续此前的主对话，当前会话会保持高亮。",
      floating: "恢复由划词解释和追问创建的独立对话。",
      image: "查看曾经生成的图片任务与完成状态。",
    },
    status: {
      done: "已完成",
      loading: "生成中",
      // 同上：状态语气，不并进 window.common.failed。
      error: "失败",
      idle: "待批准",
    },
    empty: {
      main: "暂无历史记录",
      floating: "暂无划词记录",
      image: "暂无生图记录",
    },
    confirmDelete: "删除？",
    openImage: "点击查看生图弹窗",
    restoreFloating: "点击还原划词浮窗",
  },
  // 窗口外壳
  window: {
    more: "更多窗口",
  },
  // 快捷键参考浮层
  shortcutHelp: {
    aria: "快捷键帮助",
    title: "快捷键参考",
  },
  // 顶栏模式切换
  mode: {
    switch: "切换模式",
    hint: {
      studio: "当前主界面",
      agent: "对话工作区",
      class: "开发中",
      review: "笔记 · 闪卡 · 答题",
    },
  },
};
