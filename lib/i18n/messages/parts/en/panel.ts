/**
 * panel 命名空间（英文）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 只加在本文件；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 *
 * Split of duties: panel owns the panel and window shell (right panel itself, window
 * chrome, tab strip, add menu, document-reader shell, account/usage dashboards inside
 * the panel). The business UI *inside* a window lives in the window shard.
 */
export const panelEn = {
  // Shared actions for the side panel and window chrome.
  common: {
    // "Close" dismisses a window/overlay. Do NOT merge with menu.thinking.off.label or
    // share.assets.disable: those turn a switch off ("Off" / "Turn off"), not "Close".
    close: "Close",
    collapse: "Collapse",
    open: "Open",
  },

  // The right panel itself: built-in tab names, loading state, in-panel error boundary.
  rightTab: {
    ai: "AI chat",
    video: "Video lesson",
    interactive: "Interactive",
    browser: "Browser",
    loading: "Loading {label}",
    // Interactive tab shell (components/interactives/InteractiveTab.tsx).
    interactiveEyebrow: "Interactive · {section}",
    interactiveEmptyTitle: "Interactive content for this section is coming soon",
    interactiveEmptyHint: "Clickable, draggable SVG and chart visualizations that make this section intuitive.",
    errorTitle: "This panel failed to load",
    errorBody: "This tab hit a runtime error. It was caught to avoid a blank screen. Retry, or switch to another tab and keep going.",
    removeBookmark: "Remove bookmark",
  },

  // The center tab bar above the notes area (Notes / Video / Interactive / Browser).
  centerTab: {
    notes: "Notes",
    aria: "Content view",
    collapseTopBar: "Collapse top bar",
    expandTopBar: "Expand top bar",
  },

  // Right-panel Agent header (Cursor-like): recent-conversation tab strip + icon actions.
  agentBar: {
    recentAria: "Recent chats",
    newChat: "Start a new chat",
    settings: "AI settings",
    history: "History",
    collapse: "Collapse the right panel",
    closeTab: "Close {title}",
    untitled: "New chat",
  },

  // Welcome prompts and keyboard hints for the Agent's central conversation.
  agentWelcome: {
    examplesTitle: "Try asking me",
    description: {
      outline: "Build a clear outline from the core ideas",
      flashcards: "Turn the material into cards for recall and self-testing",
      demo: "Make an abstract process easier to explore",
      brief: "Check the sources, then summarize the key points",
    },
  },
  agentComposer: {
    hintsAria: "Composer keyboard hints",
    enterToSend: "Send",
    shiftEnterForLineBreak: "New line",
    sendWithButton: "Use the send button to submit",
  },

  // Window chrome (traffic lights / title / external link / resize) and the dock tab strip.
  window: {
    minimize: "Minimize",
    restore: "Restore",
    fullscreen: "Full screen",
    openInNewTab: "Open in a new tab",
    resize: "Drag to resize the window",
    tabsAria: "Workspace tabs",
    openTab: "Open {title}",
    closeTab: "Close {title}",
    tabActions: "More actions for {title}",
    tabMenuAria: "Workspace tab actions for {title}",
    overflowMenuAria: "More workspace windows",
    moreTabs: "{count} more windows",
    copyTitle: "Copy title",
    closeTabAction: "Close this window",
    closeOthers: "Close other windows",
    closeAll: "Close all windows",
    untitledTab: "Untitled window",
    minimizedShort: "Minimized",
  },

  // Add menu: the panel "+" button and the empty state share these entries.
  addMenu: {
    addContent: "Add content",
    addContentHint: "Add a note, flashcards, a file, or a URL",
    projectAria: "Project",
    projectFiles: "Project files",
    projectFilesHint: "Cloud files + local references",
    openPanelsAria: "Open panels",
    pickNote: "Pick a note",
    pickNoteHint: "My notes / class notes",
    flashcardPage: "Flashcard review",
    flashcardHint: "Manage cards",
    importAria: "Import products",
    document: "Import long text",
    documentHint: "Agent handout",
    artifact: "Import interactive HTML",
    artifactHint: "Agent demo",
    createAria: "New file",
    newNote: "New note",
    newNoteHint: "Markdown · formulas",
    addFile: "Add file",
    addFileHint: "PDF, text, code",
    footer: "Notes, flashcards, long text, and demos all open from your local library — nothing is regenerated.",
  },

  // File upload failure dialog.
  fileError: {
    aria: "File upload failed",
    eyebrow: "Upload notice",
    title: "Could not add the file",
    confirm: "Got it",
  },

  // Right-panel empty state: no windows, or all of them tucked away.
  dockEmpty: {
    flashcard: "Flashcards",
    hiddenTitle: "All windows are tucked away",
    emptyTitle: "Nothing in the workspace yet",
    hiddenHint: "Click a tab above to reopen them.",
    emptyHint: "Pick one below, or use the ＋ above to add a file or URL.",
  },

  chatFeedback: {
    actionsAria: "Answer feedback actions",
    copy: "Copy answer",
    copied: "Copied",
    copyFailed: "Copy failed. Try again.",
    like: "Like",
    dislike: "Dislike",
    report: "Report",
    voteSaved: "Your vote was recorded. You can optionally attach a short redacted excerpt.",
    reportTitle: "Report this answer",
    voteDetailsTitle: "Add answer feedback",
    reportHint: "Choose the reason that best describes the issue.",
    feedbackText: "Additional details",
    feedbackTextPrivacy: "Up to 1,000 characters. Do not include names, contact details, or credentials; common contact and credential patterns are redacted.",
    excerptLabel: "Attach an answer excerpt (up to 600 characters)",
    excerptPrivacy: "Only this redacted preview is sent when checked. Review it for private details; your prompt, chat history, and tool data are not included.",
    reason: "Report reason",
    inaccurate: "Inaccurate content",
    unsafe: "Unsafe or harmful",
    privacy: "Privacy or sensitive information",
    other: "Other issue",
    cancel: "Not now",
    submitExcerpt: "Submit details",
    submitReport: "Submit report",
    submitting: "Submitting…",
    reportSaved: "Your report was recorded.",
    loginRequired: "Sign in to submit feedback.",
    mfaRequired: "Complete account two-step verification first.",
    accountUnavailable: "Account service is unavailable. Try again later.",
    migrationPending: "Feedback storage is not deployed yet. Try again later.",
    rateLimited: "Too many submissions. Try again later.",
    stale: "This vote changed elsewhere. Close this dialog and choose again.",
    staleClose: "Close and vote again",
    submitFailed: "Feedback was not saved. Try again.",
  },

  // The "open a URL" field at the end of the add menu.
  url: {
    group: "Enter URL",
    field: "URL",
    placeholder: "Enter a URL…",
    invalid: "Enter a valid http:// or https:// address",
    titleTag: "URL",
  },

  // Document-reader shell shared by PDF / Word / PPTX (toolbar and outline).
  reader: {
    prevPage: "Previous page",
    nextPage: "Next page",
    page: "Page {page}",
    pageRenderFailed: "Page {page} failed to render: {error}",
    openFailed: "Could not open {name}",
    unknownError: "Unknown error",
    outlineOf: "{name} outline",
    outline: "Outline",
    emptyOutline: "No outline",
    collapseOutline: "Collapse {label}",
    expandOutline: "Expand {label}",
    zoomOut: "Zoom out",
    zoomIn: "Zoom in",
    reset: "Reset",
  },

  // PDF reader.
  pdf: {
    readFailed: "Could not read this PDF",
    openFailed: "Could not open the PDF",
    password: "This PDF is password-protected, so preview is not supported yet",
    renderFailed: "Could not render the PDF",
    loading: "Loading PDF…",
  },

  // Word reader.
  docx: {
    renderFailed: "Could not render the Word file",
  },

  // PPTX reader.
  pptx: {
    readFailed: "Could not read this PPTX",
    loading: "Preparing slides…",
    slide: "Slide {number}",
    outline: "Slides",
    title: "PowerPoint local preview",
  },

  // Context dashboard (TokenDashboard).
  token: {
    title: "Context dashboard",
    open: "Open the context dashboard",
    close: "Close the context dashboard",
    openBilling: "Open billing overview",
    refresh: "Refresh the context estimate",
    pin: "Pin panel",
    unpin: "Unpin panel",
    tooltip: "{pct} ({used} / {limit}) of context used",
    used: "Context used",
    usageAria: "Context usage",
    // Context ring captions (contextRingCaption in lib/context/estimateFullContext.ts returns these keys).
    ringApproaching: "Approaching the 80% soft limit",
    ringLimit: "At the 80% soft limit",
    compact: "Compact",
    compacting: "Compacting…",
    cacheRow: "Context cache",
    sendPolicy: "Send policy",
    sendPolicyRolling: "Rolling summary",
    breakdown: "Context breakdown",
    cat: {
      tools: "System prompt",
      skills: "Skills",
      pages: "Note pages",
      webSearch: "Web search",
      conversation: "Conversation",
    },
    lastTurn: "This turn",
    promptTokens: "Input tokens",
    completionTokens: "Output tokens",
    cacheHit: "Cache hits",
    turnCost: "Turn cost",
    total: "Total billing",
    totalInput: "Total input",
    totalOutput: "Total output",
    hitCount: "{count} hits",
    hitRate: "Hit rate",
    totalCost: "Total cost",
    priceNote: "Prices are platform references; the API provider's invoice is final. The cache window defaults to {minutes} minutes.",
    countdown: "Cache countdown",
    estimate: "estimated",
    remaining: "Time left",
    expired: "Expired",
    waiting: "Waiting for the first turn",
    expiredTitle: "The cache may have expired, so the next request bills at full price",
    expiredDelta: "(about {amount} more)",
    priceShift: "After expiry the input price goes from {before} → {after} per million tokens",
  },

  // API billing overview (BillingDashboard).
  billing: {
    windowTitle: "API billing overview",
    exportCsv: "Export CSV",
    exportRecords: "Export records",
    calls: "{count} calls",
    range: {
      d7: "Last 7 days",
      d30: "Last 30 days",
      all: "All time",
    },
    recordCount: "{count} records",
    empty: "No billing data yet",
    trend: "Cost trend",
    column: {
      time: "Time",
      model: "Model",
      type: "Type",
      tokens: "Usage (In/Out/Cache)",
      cost: "Cost",
      provider: "Provider",
    },
    typeImage: "Image",
    typeChat: "Chat",
    imageCount: "{count} images",
  },

  // Account quota (AccountQuota).
  quota: {
    getMembership: "Get membership",
    tier: {
      free: "Free",
      plus: "Plus",
      pro: "Pro",
    },
    loadingAccount: "Loading account…",
    signInHint: "Sign in to see your membership and quota",
    title: "Membership & quota",
    refresh: "Refresh quota",
    platform: "Platform model quota",
    byok: "Bring-your-own API quota",
    platformRemaining: "Platform model quota left",
    byokRemaining: "BYO API quota left",
    note: "This auxiliary quota covers platform features such as search; it is not your external API account balance.",
    periodEnd: "The current quota period ends {date}.",
    updatedAt: "Last updated: {time}",
    reading: "Loading quota…",
    unavailable: "Quota unavailable",
  },

  // Cloud sync usage (StorageQuota).
  storage: {
    local: "Local sync usage",
    cloud: "Cloud usage",
    loading: "Measuring usage…",
    refresh: "Refresh usage",
    rowAria: "{label} usage",
    // Sync kinds and quota pools: names and units (SYNC_KIND_META / SYNC_POOL_META in lib/sync/usage.ts).
    kind: {
      chatSession: { label: "All chats", unit: "items" },
      artifact: { label: "Demos", unit: "items" },
      document: { label: "Documents", unit: "docs" },
      userNote: { label: "Personal notes", unit: "notes" },
      reviewCard: { label: "Review flashcards", unit: "cards" },
      imageGen: { label: 'Generated images', unit: 'sets' },
      chatProject: { label: "Chat projects", unit: "items" },
    },
    pool: {
      notes: { label: "Notes pool", unit: "notes" },
      flashcards: { label: "Flashcard pool", unit: "cards" },
    },
    hintSignedIn: "Usage counts synced chats, demos, documents, notes, and flashcards. Notes and flashcards have their own quota pools. Uploaded images and PDFs are not counted.",
    hintLocal: "Signed out, this estimates what would sync from this device; after signing in it shows your actual cloud usage.",
  },

  // Membership sponsor window (MembershipSponsorWindow).
  membership: {
    title: "Get membership",
    intro: "This site is open source. If you need more quota, contact the maintainer or send an email. And if it genuinely helped your study, a tip is welcome too.",
    repo: "GitHub repository",
    contact: "Contact the maintainer for more quota",
    qrAlt: "Tip QR code",
    note: "Glad it really helps — tips are welcome.",
  },
};
