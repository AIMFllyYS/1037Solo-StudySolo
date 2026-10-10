/** settings.keyboard locale entries. Keep keys/placeholders aligned with the other language. */
export const settingsKeyboardZh = {
    enabled: "已启用 {enabled} / {total}",
    enableAll: "全部启用",
    disableAll: "全部关闭",
    enableAria: "启用 {label}",
    openReference: "查看完整快捷键参考",
    // 分组名（SHORTCUT_CATEGORIES[].labelKey）
    category: {
      global: "全局",
      rightPanel: "右栏",
      window: "窗口",
      review: "复习板",
      overlay: "浮层",
      chat: "对话",
    },
    // 21 条快捷键（SHORTCUTS[].labelKey / descriptionKey），键名即 lib/keyboard/shortcuts.ts 里的 id
    shortcut: {
      global: {
        search: { label: "全局搜索", description: "打开全局内容搜索" },
        aiFloating: { label: "AI 助手浮窗", description: "打开无选文的 AI 划词浮窗" },
        toggleSidebar: { label: "收起/展开侧栏", description: "切换左侧导航栏" },
        billing: { label: "API 计费总览", description: "打开 API 计费总览窗口" },
        newChat: { label: "新建对话", description: "创建新的 AI 对话并切到 AI 栏" },
        toggleTopBar: { label: "收起/展开顶栏", description: "切换顶部导航栏" },
        openReview: { label: "打开复习板", description: "跳转到当前科目复习板" },
        shortcutHelp: { label: "快捷键帮助", description: "打开快捷键参考面板" },
        rightTab: {
          ai: { label: "AI 对话栏", description: "切换到右侧 AI 对话" },
          video: { label: "动画讲解栏", description: "切换到右侧动画讲解" },
          interactive: { label: "可交互栏", description: "切换到右侧可交互演示" },
          browser: { label: "浏览器栏", description: "切换到右侧内置浏览器" },
        },
      },
      window: {
        close: { label: "关闭窗口", description: "关闭当前选中的浮窗" },
        minimize: { label: "最小化窗口", description: "最小化/还原当前选中的浮窗" },
        fullscreen: { label: "全屏窗口", description: "全屏/退出全屏当前选中的浮窗" },
      },
      overlay: {
        escape: { label: "关闭浮层", description: "关闭最上层弹窗/菜单/浮层" },
      },
      review: {
        prevCard: { label: "上一张卡", description: "复习板切换到上一张记忆卡" },
        nextCard: { label: "下一张卡", description: "复习板切换到下一张记忆卡" },
        flipCard: { label: "翻面", description: "复习板翻转当前记忆卡" },
      },
      chat: {
        send: { label: "发送消息", description: "在对话输入框按 Enter 发送" },
        newline: { label: "换行", description: "在对话输入框按 Shift+Enter 换行" },
      },
    },
  };
