import { settingsAppearanceZh } from "./settings/appearance";
import { settingsModelsZh } from "./settings/models";
import { settingsModelFormZh } from "./settings/modelForm";
import { settingsKeyboardZh } from "./settings/keyboard";

/**
 * settings 命名空间（中文真相源）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 在对应业务分片（未拆出的命名空间留在本文件）；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 *
 * 值一律是「搬进来的原字面量」：JSX 里跨行拼接的空格（如 `…模型。\n独立于…` 渲染成
 * `…模型。 独立于…`）也照抄，改字典时不要顺手规范化。
 */
export const settingsZh = {
  language: {
    title: "语言",
    zh: "中文",
    en: "English",
    desc: "界面语言，切换后立即生效",
  },
  // 设置页通用动作（各分节可复用）
  common: {
    save: "保存",
    create: "创建",
  },
  // 设置工作区外壳（components/chat/settings/ChatSettings.tsx）
  workspace: {
    navAria: "Agent 设置分类",
    back: "返回对话",
    brand: "设置",
  },
  // 设置工作区左侧六个分节的「导航名 + 导航副标题 + 内容区标题 + 内容区描述」
  section: {
    general: {
      label: "通用",
      hint: "常规与对话默认",
      title: "通用设置",
      desc: "调整新对话默认行为、划词助手和全局补充上下文。",
    },
    appearance: {
      label: "外观",
      hint: "主题与阅读体验",
      title: "外观",
      desc: "这里与项目左下角的外观设置共用同一份配置，修改会立即同步。",
    },
    models: {
      label: "模型配置",
      hint: "模型、API 与生图",
      title: "模型配置",
      desc: "集中管理内置模型、自定义 API、专用能力端点与图片生成流程。",
    },
    capabilities: {
      label: "Agent 能力",
      hint: "工具与演示",
      title: "Agent 能力",
      desc: "控制 Agent 可以调用的工具与交互能力，不影响模型或历史对话。",
    },
    skills: {
      label: "Skills",
      hint: "技能库与注入",
      title: "Skills",
      desc: "维护可供 Agent 按需调用或固定注入的技能。",
    },
    data: {
      label: "数据与账户",
      hint: "计费、同步与导出",
      title: "数据与账户",
      desc: "查看计费偏好、兑换、云同步与本地导出。",
    },
  },
  overlay: {
    aria: "Agent 设置",
  },
  // 外观（AppearanceSection + AppearanceSettingsControls + GlobalSettings 摘要）
  appearance: settingsAppearanceZh,
  // 模型列表与内置模型（ModelSection + _shared 的模型行）
  models: settingsModelsZh,
  // 自定义模型表单（ModelForm.tsx）
  modelForm: settingsModelFormZh,
  // 自定义 API 分组（ApiGroupsSection + _ApiGroupCard）
  apiGroups: {
    title: "自定义 API",
    meta: "{count} 个分组 · 与站点默认并存",
    desc: "可创建多个 API 分组，每组独立 baseUrl/apiKey + 模型列表，全部出现在模型菜单中。",
    keyNoticeDesktop: "桌面端：API 密钥由操作系统加密保存（Windows 为 DPAPI），不会以明文写入设置 JSON。",
    keyNoticeWeb: "网页端：API 密钥保存在本机浏览器（独立存储、轻量混淆），不进入云端。这不是加密，本机扩展或取证仍可能读取；请勿在公共电脑上保存密钥。",
    defaultName: "API 分组 {index}",
    newGroup: "新建 API 分组",
    name: "分组名称",
    namePlaceholder: "我的 API",
    baseUrl: "API 端点（base URL，含 /v1）",
    apiKey: "API 密钥",
    timeout: "请求超时（毫秒，缺省 45000）",
    modelCount: "{count} 个模型",
    rename: "重命名分组",
    remove: "删除分组",
    removeConfirm: "删除分组 {name}？此操作不可撤销。",
    addedModels: "已添加模型（{count}）",
    noModels: "暂无模型，点击下方按钮添加",
    addModel: "添加模型",
    removeModelConfirm: "删除模型 {name}？",
  },
  // 自定义 API 的导入 / 导出 / 恢复（ApiConfigurationRecovery.tsx）
  apiRecovery: {
    import: "导入 API 配置",
    importAria: "导入 API 配置文件",
    export: "导出 API 配置",
    restore: "恢复本机备份",
    merged: "已合并恢复 {count} 个分组，已有配置不会被旧备份覆盖。",
    noGroups: "当前地址没有读到自定义分组。浏览器按地址和端口独立保存设置；若从旧地址升级，请先在那里导出配置，再到这里导入。不要清空浏览器数据。",
    exported: "备份含可恢复的 API 密钥，仅供本人保管，请勿分享。",
    noBackup: "当前地址没有可用的迁移前备份。请回旧地址导出配置；此操作不会修改现有数据。",
    restored: "已合并恢复本机备份。",
    unreadable: "备份无法读取，原记录未修改。",
    exportHint: "导出包含可恢复的密钥（轻量混淆，不是加密），请勿上传或分享备份文件。",
    tooLarge: "文件过大",
    importFailed: "无法导入配置，原设置未修改。",
  },
  // 生图设置（ImageSection.tsx）
  image: {
    title: "生图设置",
    meta: "默认模型、提示词模型与容灾",
    desc: "默认生图模型可在「内置模型」或「自定义 API」中点击 ⭐ 设置。生图模式下， AI 会先用文本模型理解意图并优化提示词，再调用生图模型实际生成图片。",
    current: "当前默认生图模型",
    fallback: "（降级使用内置生图模型）",
    clear: "清除默认（恢复降级）",
    textModel: "生图模式文本模型（理解意图 + 优化提示词）",
    textModelAria: "生图模式文本模型",
    fallbackModel: "容灾降级模型（主模型失败时使用）",
    fallbackModelAria: "容灾降级模型",
  },
  // 能力端点（CapabilityEndpointsSection.tsx）
  capability: {
    title: "能力端点",
    meta: "生图、向量、搜索与重排",
    desc: "每一项留空 = 使用平台默认。填写自己的密钥后，该能力不计入平台额度。",
    image: "生图",
    modelId: "模型 ID",
    platformDefault: "留空 = 平台默认",
    imageApiStyle: "API 风格",
    imageApiStyleAria: "生图 API 风格",
    probe: "测试生图连通",
    probing: "检查中…",
    probeOk: "生图端点已配置",
    builtinImageModel: "留空 = 内置生图模型",
    embedding: "向量 embedding",
    embeddingDesc: "查询向量需与索引构建模型一致。离线建索引仍只用环境变量。",
    rerank: "重排 rerank",
    webSearch: "联网搜索（三家）",
    webSearchHint: "三家搜索源可分别配置，都不填则用站点环境变量。默认优先级 Kimi > 智谱 > Perplexity；学术与需查证的问题优先走 Perplexity（权威性最高），日常事务走 Kimi / 智谱（更便宜）；需要交叉验证时模型可以让三家同时搜。",
    zhipuKey: "智谱 API Key",
    zhipuPlaceholder: "留空 = 平台 ZHIPU_API_KEY",
    kimiSearchKey: "Kimi API Key（内置 $web_search）",
    kimiSearchPlaceholder: "留空 = 平台 KIMI_API_KEY",
    perplexitySearchKey: "Perplexity API Key",
    perplexitySearchPlaceholder: "留空 = 平台 PERPLEXITY_API_KEY",
    unsplash: "搜图（Unsplash）",
    unsplashPlaceholder: "留空 = 平台 UNSPLASH_ACCESS_KEY",
  },
  // Agent 能力分节（ToolsSection.tsx）
  tools: {
    title: "工具调用",
    maxRounds: "最大工具调用轮数",
    maxRoundsDesc: "接到 Agent ToolLoop（默认 {rounds} 轮）。斜杠 / 加号菜单读不到此值时仍走本设置。",
    roundsUnit: "轮",
    maxOutput: "单次输出上限",
    maxOutputDesc: "每次模型调用最多输出多少 token（思考也算在内）。填 0 = 自动，按当前模型声明的最大输出（{model}：{tokens}）。",
    maxOutputUnit: "token",
    maxOutputHint: "调小会少占预留额度，但推理模型可能把额度都花在思考上，出现「思考完没有正文」或回答被截断。没有特别需要建议保持 0。",
    turnBudget: "单轮预算上限",
    turnBudgetDesc: "一次回答（包括所有工具步骤）最多花多少积分。填 0 = 自动，按服务端上限。只能比服务端上限更严，不能放宽。",
    turnBudgetUnit: "积分",
    turnBudgetHint: "每一步会先按最坏情况预留、结算后退回差额；预留总额超过这个值时，本轮后续步骤会被拦下并提示。",
    maxWait: "最长等待时间",
    maxWaitDesc: "一次回答最多等多久，超过就本地停止。深度思考加多步工具本来就可能超过默认值——长回答被掐断时可以调高。",
    waitUnit: "秒",
    waitHint: "范围 {min}–{max} 秒，默认 {default} 秒。思考静默期服务端会持续发心跳保活，所以这里只掐真正跑太久的回答。",
    hint: "推荐 {recommended} 轮：与 studyAgent 默认一致，一般问答够用。 上限 {cap} 轮对齐 AI SDK ToolLoopAgent 的默认 stopWhen，再高没有架构适配收益。",
    demo: {
      title: "HTML 演示窗口",
      target: "演示全屏时覆盖",
      targetDesc: "Artifact 是 AppShell 挂到页面的全局浮窗，不属于笔记区或右侧面板",
      notes: "笔记区",
      viewport: "整个窗口",
    },
  },
  // 全局补充上下文（ContextSection.tsx）
  context: {
    title: "全局补充上下文",
    desc: "这里的文字会注入每次对话的系统提示词（拼入稳定前缀，利于缓存）。适合放通用背景、称呼、风格偏好等。",
    placeholder: "例如：请用简洁的中文回答，公式用 KaTeX，回答末尾附一句要点总结。",
    count: "{count} 字",
  },
  // 数据与账户分节（DataSection.tsx）
  data: {
    redeem: {
      title: "兑换码",
      desc: "输入兑换码升级档位。失败不会提示该码是否存在。",
      placeholder: "输入兑换码",
      failed: "兑换失败，请检查兑换码后重试。",
      successTier: "已兑换为 {tier} 档",
      success: "兑换成功",
      busy: "兑换中…",
      submit: "兑换",
    },
    billing: {
      title: "计费与汇率",
      desc: "计费大盘中支持翻转卡片将人民币 (¥) 切换为美元 ($)。你可以在这里自定义兑换汇率。",
      rate: "美元汇率 (USD/CNY)",
    },
    cloudSync: {
      title: "云端同步",
      desc: "登录后同步对话文本、AI 整理后的上下文、演示、长文档、笔记和闪卡。新上传附件含照片与 PDF 的原文件及处理结果保存到私有云端，使用账号统一存储额度，可在「我的资产 → 云端文件」管理与确认软删除。旧的仅本机附件保留。API 密钥不会上传。结构化同步数据上限约 {limitMb} MB；笔记额度池 {notesPoolMb} MB，闪卡额度池 {flashcardsPoolMb} MB，这些不是附件文件体积上限。",
      signedIn: "已登录，换设备后可拉回历史对话与产物。",
      signedOut: "未登录时数据只留在本机。",
    },
    export: {
      title: "数据",
      desc: "把全部聊天记录（主对话 + 划词）导出为本地 JSON 文件备份。仅保存到你选择的位置，绝不上传任何服务器。",
      done: "已导出 {count} 个会话",
      empty: "暂无可导出的聊天数据",
      chats: "导出所有聊天数据",
      logsDesc: "导出已落盘的 Agent 生命周期日志，保持原始 JSONL，不做清洗。",
      logs: "导出全部日志",
      noLogs: "暂无日志",
      logExported: "已导出",
      failed: "导出失败",
    },
  },
  // 技能库（SkillsSection + SkillsManager）
  skills: {
    title: "技能库（Skills）",
    // 段落中间夹了一个图标，所以拆成图标前后的两段；两侧空格是原来 JSX 里的字面空格。
    descPrefix: "导入 ",
    descSuffix: " 单个 .md、ZIP 或 .skill 包（对齐 Agent skills：优先 SKILL.md）。 AI 按名称与描述按需调用全文；打开右侧开关可将该技能「固定开启」（每轮强制注入）。",
    import: "导入技能",
    loading: "正在加载技能库…",
    empty: "还没有技能。导入 .md，或含 SKILL.md 的 ZIP / .skill 包（frontmatter 的 name/description 会自动填入，可在下方编辑）。",
    name: "技能名称",
    description: "技能描述（供 AI 判断何时调用）",
    pinTitle: "固定开启：每轮强制注入全文",
    unpinTitle: "关闭：由 AI 按需调用",
    pinnedNote: "已固定：每轮注入全文，不进可调用菜单",
    remove: "删除技能",
    maxReached: "最多 {max} 个技能，部分文件未添加。",
    unsupported: "仅支持 .md / .markdown / .zip / .skill。",
    // 导入失败原因（lib/utils/importSkills.ts 生成，SkillsManager 直接显示）
    errorNoMarkdown: "{file} 里没有 SKILL.md 或 Markdown。",
    errorUnparsable: "{file} 无法解析。",
  },
  // 划词助手动作预览（SelectionAssistantPreview.tsx）
  selectionPreview: {
    title: "划词助手展示动作",
    desc: "点缩小版浮条上的按钮开关动作；关掉的不会出现在真实划词助手上。",
    count: "当前显示 {visible} / {total} 个动作",
    disabled: "总开关关闭时，划词不会弹出本站动作条",
  },
  // 左下角全局设置面板 / 手机设置页（GlobalSettings.tsx）
  global: {
    title: "设置",
    viewAccount: "查看账户",
    openAgent: "打开 Agent 设置",
    openAgentDesc: "模型、工具、导出与外观，与右侧 AI 助教共用同一份配置。",
    open: "打开",
    quota: "额度",
    quotaSummary: "会员 · 用量 · 存储",
    storageQuota: "存储额度",
    year: "年级 / 学期",
    scores: "成绩",
    keyboard: "快捷键",
    appearance: "外观",
    signIn: "登录",
    signOut: "退出",
    signOutFull: "退出登录",
  },
  // 账户弹窗（AccountDialog.tsx）
  account: {
    title: "账户信息",
    close: "关闭账户信息",
    avatar: "头像",
    localOnly: "只保存在这台设备",
    change: "更换",
    restoreInitials: "恢复字标",
    name: "名称",
    nameHint: "未改时默认 {name}",
    emailPrefix: "邮箱前缀",
    saveName: "保存名称",
    noEmail: "未绑定邮箱",
    changePassword: "修改密码",
    setPassword: "设置密码",
    updatePassword: "更新密码",
    currentPassword: "当前密码",
    newPassword: "新密码",
    confirmPassword: "确认新密码",
    passwordInAccount: "密码由 1037Solo 统一账号管理，修改时需要输入当前密码。",
    openPasswordPage: "前往统一账号修改密码",
    nicknameFailed: "昵称未能保存",
    avatarFailed: "头像未能保存",
    authMissing: "登录未配置",
  },
  // 快捷键分节外壳（KeyboardShortcutsSettings；条目文案见下方 shortcut.*）
  keyboard: settingsKeyboardZh,
  // 成绩分节（GlobalSettings.tsx）
  scores: {
    chapters: "已测章节",
    avgBest: "平均最佳分",
    attempts: "测验次数",
    empty: "暂无测验记录",
    summary: "{chapters} 章 · 平均 {avg} · {attempts} 次",
    emptyTitle: "还没有测验记录。",
    emptyHint: "打开任意章节的「题目测试」标签，完成一套题后成绩会出现在这里。",
    chapterCount: "{count} 章",
    avgBestShort: "平均最佳",
    lastAttempt: "上次 {percent} · {attempts} 次",
    lastUnscored: "暂无客观计分",
    clear: "清空全部成绩",
    clearDesc: "仅清除本机保存的测验成绩，不影响题目本身。",
    clearConfirm: "确认清空",
    clearAction: "清空",
  },
};
