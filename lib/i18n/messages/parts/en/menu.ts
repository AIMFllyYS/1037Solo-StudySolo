/**
 * menu 命名空间（英文）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 只加在本文件；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 */
export const menuEn = {
  // Shared actions for dialogs, context menus and dropdowns.
  common: {
    delete: "Delete",
    close: "Close",
    select: "Select…",
  },
  // Message right-click menu ("Copy" now lives in common.copy).
  contextMenu: {
    quote: "Quote in chat",
    ask: "Follow up",
    record: "Save to review board",
  },
  // Selection assistant action bar; keys mirror the action ids
  // (copy / copied now live in common.copy / common.copied).
  selection: {
    explain: "Explain",
    record: "Save",
    note: "Note",
    ask: "Follow up",
    quote: "Quote",
    hidden: "“{label}” is hidden",
  },
  // Deep thinking: shared by the composer button and the model submenu.
  thinking: {
    title: "Deep thinking",
    trigger: "Deep thinking · {level}",
    required: " · required by this model",
    unsupported: "This model does not support deep thinking",
    active: "On",
    strength: "Thinking effort",
    off: {
      // Turning the deep-thinking switch off — not panel.common.close ("Close" a window).
      label: "Off",
      hint: "Answer directly without a reasoning chain",
    },
    on: {
      label: "On",
      hint: "Use a reasoning chain; effort is not configurable",
    },
    hint: {
      low: "Light reasoning · faster and cheaper",
      medium: "Balanced (default for most tasks)",
      high: "Stronger reasoning · complex problems",
      max: "Deepest thinking · most expensive",
    },
  },
  // Model picker.
  model: {
    choose: "Choose model",
    short: "Model",
    dialog: "Model selection",
    builtin: "Built-in models",
    auto: "Auto model",
    series: "Model families",
    models: "Models",
    backToSeries: "Back to model families",
    details: "Model details",
    info: "Model info",
    selected: "Selected model",
    custom: "Custom API",
    customHeading: "Custom APIs",
    use: "Use this model",
    category: {
      free: "Free models",
      fast: "Fast models",
      multimodal: "Multimodal models",
      flagship: "Flagship models",
      image: "Image models",
    },
    badge: {
      vision: "Vision",
      context: "Context {window}",
      thinking: "Thinking",
      thinkingRequired: "Thinking always on",
      image: "Image gen",
      tools: "Tools",
    },
  },
  // Composer shell: toolbar, queue, quote, placeholders, send.
  modelEffort: {
    selectModel: "Select model",
    switchModel: "Switch model",
    reset: "Reset thinking depth",
    sliderAria: "Thinking depth",
    back: "Back",
    unsupported: "This model has no adjustable thinking depth",
    fixedOn: "This model always thinks",
    stepsAria: "{count} levels",
    fast: "Fast mode",
    fastUnsupported: "This model has no Fast variant",
  },
  chatInput: {
    toolbarAria: "Chat options",
    more: "More chat options",
    addIntent: "Add a plan, tool or skill",
    inputAria: "Ask a question",
    send: "Send",
    stop: "Stop generating",
    charCount: "{count} / 50,000 chars",
    search: {
      label: "Web search",
      title: "Web search (search API required)",
      hint: "Use the search API for the latest information",
    },
    mode: {
      aria: "Execution mode",
      heading: "Execution mode",
      ask: "Ask mode",
      askHint: "Ask for your approval before writing notes, flashcards or calling tools",
      auto: "Full-approval mode",
      autoHint: "Automatically run flashcards, note edits and any tool (including the cloud sandbox) without per-step confirmation",
      autoNote: "Delete actions are still confirmed separately",
    },
    queue: {
      title: "Waiting to send",
      count: "{count} queued",
      edit: "Edit",
      editAria: "Edit queued message {index}",
      cancelAria: "Cancel queued message {index}",
    },
    quote: {
      label: "Quoted from this page",
      remove: "Remove quote",
    },
    placeholder: {
      disabled: "Input disabled",
      signInRequired: "Sign in to use AI chat",
      checkingAccount: "Checking account…",
      historyLoading: "Restoring chat history…",
      queued: "Keep typing — messages queue after sending…",
      default: "Ask a question, quote a note, or pick a plan or tool",
    },
    access: {
      signedOutTitle: "Sign in to continue chatting",
      signedOutBody: "Chat history is separated by account. Sign in to ask a question or restore your history.",
      checkingTitle: "Checking account status",
      checkingBody: "This area will show the current account's conversations after verification.",
      ownerChangedTitle: "Account changed",
      ownerChangedBody: "This floating chat belongs to another account. Close it and reopen it in the current account to protect conversation privacy.",
      signIn: "Sign in",
      closeWindow: "Close floating chat",
    },
    autoPrompt: {
      files: "Please read these notes",
      attachments: "Please read and analyze the attachments",
    },
  },
  // Composer slash panel: plan, compact, forced tools, skills.
  composer: {
    aria: "Chat commands",
    plan: "Plan mode",
    compact: "Compact context",
    on: "On",
    selected: "Selected",
    toolsHeading: "Specific tools",
    skillsHeading: "Imported skills",
    empty: "No matching commands",
    skill: "Skill",
    clearPlan: "Turn off plan mode",
    clearTool: "Clear the forced tool",
    removeFile: "Remove {title}",
    tool: {
      generateImage: "Generate an image",
      renderInteractive: "Interactive page",
      writeDocument: "Write a long article",
      flashcards: "Make flashcards",
      notes: "Organize notes",
    },
  },
  // "#" file mention menu.
  fileMention: {
    aria: "Quote a note",
    empty: "No notes to quote",
    group: {
      nearby: "Near this page",
      parent: "Parent level",
      matched: "Matching notes",
    },
  },
  // Project chip at the bottom-right of the composer.
  projectPicker: {
    label: "Chat project",
    recent: "Recent projects",
    empty: "No projects yet — create one first.",
    sessionCount: "{count} chats",
    nameAria: "New project name",
    namePlaceholder: "Project name",
    create: "Add",
    add: "Add a new project",
    addHint: "The current chat moves into it",
    clear: "No project",
    clearHint: "Back to Recents",
  },
  // Chat history overlay.
  history: {
    navAria: "History categories",
    back: "Back to chat",
    title: "History",
    tab: {
      main: "Chats",
      floating: "Selections",
      image: "Images",
    },
    sessionCount: "{count} chats",
    taskCount: "{count} tasks",
    messageCount: "{count} messages",
    imageCount: "{count} images",
    page: {
      main: "Chat history",
      floating: "Selection chats",
      image: "Image history",
    },
    desc: {
      main: "Resume an earlier chat; the active one stays highlighted.",
      floating: "Reopen standalone chats created by Explain and Follow up.",
      image: "Review past image tasks and their status.",
    },
    status: {
      done: "Done",
      loading: "Generating",
      error: "Failed",
      idle: "Awaiting approval",
    },
    empty: {
      main: "No history yet",
      floating: "No selection chats yet",
      image: "No image history yet",
    },
    confirmDelete: "Delete?",
    openImage: "Click to open the image window",
    restoreFloating: "Click to reopen the selection window",
  },
  // Window chrome.
  window: {
    more: "More windows",
  },
  // Shortcut reference overlay.
  shortcutHelp: {
    aria: "Keyboard shortcuts help",
    title: "Keyboard shortcuts",
  },
  // Top-bar mode switcher.
  mode: {
    switch: "Switch mode",
    hint: {
      studio: "Current workspace",
      agent: "Chat workspace",
      class: "In development",
      review: "Notes · flashcards · quizzes",
    },
  },
};
