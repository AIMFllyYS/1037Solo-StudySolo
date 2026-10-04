/**
 * trace 命名空间（英文）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 只加在本文件；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 *
 * 思考链的措辞刻意克制：Working / Done / Searched notes 这类短词，不写长句。
 */
export const traceEn = {
  // Status words for the agent trace.
  status: {
    done: "Done",
  },
  // The collapsed header row of the trace disclosure.
  summary: {
    aria: "Agent activity",
    stepsAria: "Steps in execution order",
    process: "Activity",
    working: "Working…",
    waiting: "Waiting for tool approval",
    stopped: "Stopped",
    partialError: "Finished with incomplete steps",
    underOneSecond: "Took under 1s",
    seconds: "Took {seconds}s",
    minutes: "Took {minutes}m {seconds}s",
    thinking: "Thinking…",
    composing: "Writing the answer…",
  },
  // One step row.
  step: {
    status: {
      running: "running",
      complete: "done",
      error: "failed",
      interrupted: "stopped",
      waiting: "needs approval",
    },
    underOneSecond: "under 1s",
    seconds: "{seconds}s",
    reasoningTitle: "Thinking",
    textTitle: "Progress note",
    thinking: "Working out the details…",
    input: "Input",
    output: "Result",
    errorOutput: "Call failed",
    success: "Succeeded",
  },
  // Tool step summaries and fallbacks.
  tool: {
    learningConnectors: {
      authorizationSaved: "{provider} is connected. You can use it in a conversation.",
      verifyAccount: "Verify your identity in Account",
      statusChecked: "Learning service connection status checked.",
      capabilitiesReady: "Retrieved this service's currently available operations.",
      readCompleted: "Reading completed. Expand the result to inspect the original data.",
      grantedScopes: "Saved authorization: {scopes}",
      noGrantedScopes: "No learning service capabilities granted",
      nextAuthorizationScopes: "Choose capabilities for the next authorization",
      connectionAccountChanged: "Account changed. Refresh connection status.",
      scopeDraftHint: "Selections apply to the next authorization; current capabilities follow the saved grant.",
      accountDisabled: "Your Account is unavailable. Contact the account administrator; reconnecting a learning service will not remove this restriction.",
      emailUnverified: "Verify your email in Account before connecting learning services.",
      authorizationCancelled: "Authorization was cancelled. You can connect again when needed.",
      authorizationRetry: "Authorization did not complete or expired. Connect again with the current account.",
      selectApprovedScopes: "Select at least one approved Google capability.",
      configurationRequired: "Service connection configuration is not ready. Contact the administrator before retrying.",
      rateLimited: "The provider is limiting requests. Refresh the status later.",
      disconnectedRevoked: "Disconnected from this app and revoked provider authorization.",
      disconnectedLocal: "Disconnected from this app. Provider authorization has not been confirmed revoked; review the provider settings.",
      label: "Learning services", settingsLabel: "Learning connectors", description: "Read connected notes, tasks, files, calendars, mail and references. External writes require confirmation.",
      manage: "Manage learning connections", manageHint: "Connect your accounts so the assistant can use the learning materials you authorize.", connect: "Connect account", reconnect: "Authorize again", disconnect: "Disconnect", disconnectConfirm: "Disconnect this learning service? New reads and writes will stop.", refresh: "Refresh status", signIn: "Please sign in", failed: "Learning service request did not complete", scopes: "Choose the capabilities to authorize", googleFiles: "Read course files", googleCalendar: "Read calendars", googleCalendarWrite: "Create study events", googleMailRead: "Read course mail", googleMailSend: "Send confirmed mail", googleContacts: "Find contacts", connected: "Connected", disconnected: "Not connected", available: "Available", reauth: "Authorization required", api: "Official API", mcp: "Official MCP", local: "Local export", result: "Learning service result", proposal: "Review this external action", parameters: "Target and content", approve: "Confirm and execute", reject: "Cancel", proposed: "Awaiting confirmation", executing: "Executing", succeeded: "Completed", cancelled: "Cancelled", uncertain: "Outcome needs review. Do not repeat this action.", expired: "Proposal expired. Create a new one.", download: "Download Anki cards", exportHint: "Export complete review cards while preserving existing review history on import.", accountChanged: "Account changed. Generate this export again for the current account.", fullParameters: "Show full parameters", source: "Open source", scopeRequired: "Additional authorization is required. Select the capability in connection settings.", readOnly: "Read operation", writeCandidate: "Proposed action; writes only after confirmation",
    },
    kitSolo: { label: "KitSolo toolbox", settingsLabel: "KitSolo tools", description: "Search and run text, encoding and data tools after connecting.", open: "Open workspace", copy: "Copy result", failed: "Tool call failed" },
    cloudSandbox: { label: "Cloud command", settingsLabel: "Cloud commands and files", description: "Only the independent Agent runs commands and produces files in an isolated cloud sandbox.", title: "Cloud execution", refresh: "Check progress", cancel: "Stop command", close: "Close sandbox", closed: "Cloud sandbox closure confirmed", resume: "Continue original action after verification", confirmResume: "Continue only the original action rejected before execution for identity verification. Review the request:", download: "Download file", failed: "Operation incomplete", confirmClose: "Close this cloud sandbox? Save required files first.", expired: "Use the independent Agent conversation to manage this task.", logExcerpt: "Showing a log excerpt. Check progress to load the saved full log." },
    callAria: "Tool calls",
    denied: "This tool call was not approved",
    runFailed: "Run failed",
    interrupted: "Stopped before a full result arrived",
    waitingApproval: "Continues after approval",
    deduped: "Already in context; reused the loaded content",
    preparing: "Preparing arguments…",
    running: "Running…",
    images: "Found {count} note images",
    questions: "{count} questions",
    questionsWithTitle: "{count} questions · {title}",
    document: "Document: {title}",
    untitled: "Untitled",
    sources: "{count} sources",
    imageSources: "{count} images",
    cacheHit: " · cached",
    hits: "Found {count} notes",
    skillUsed: "Used skill: {name}",
    skillMissing: "Skill not found: {name}",
    proposeNote: "Suggested saving as a note",
    proposeFlashcard: "Suggested saving as flashcards",
    note: "Note: {title}",
    noteWritten: "Saved",
    flashcards: "{count} flashcards",
    flashcardsWithMode: "{count} flashcards · {mode}",
    // Presentation metadata for the 21 tools: label drives the trace step title,
    // settingsLabel / description drive the settings toggles.
    getCurrentPage: {
      label: "Read current page",
      settingsLabel: "Current page",
      description: "Let the AI read the page you are viewing",
    },
    getOutline: {
      label: "Read course outline",
      settingsLabel: "Course outline",
      description: "Let the AI browse the chapter outline of every subject",
    },
    getSection: {
      label: "Read note section",
      settingsLabel: "Read a page",
      description: "Let the AI pull the full text of any section in any subject",
    },
    searchNotes: {
      label: "Searched notes",
      settingsLabel: "Full-text search",
      description: "Let the AI search class and personal notes by title, body or subject; lists first, then reads the full text by id",
    },
    searchFlashcards: {
      label: "Searched flashcards",
      settingsLabel: "Flashcard search",
      description: "Let the AI look up existing flashcards by front, back, source text or subject; lists first, then analyzes by id",
    },
    searchNoteImages: {
      label: "Searched note images",
      settingsLabel: "Note images",
      description: "Let the AI find and cite illustrations already in your course notes",
    },
    webSearch: {
      label: "Searched the web",
      settingsLabel: "Web search",
      description: "Three providers (Kimi / Zhipu / Perplexity); fetches real-time information online",
    },
    imageSearch: {
      label: "Searched images",
      settingsLabel: "Web images",
      description: "Enabled together with web search; finds real photos on Unsplash",
    },
    renderInteractive: {
      label: "HTML demo",
      settingsLabel: "HTML demo",
      description: "Builds an interactive HTML demo page (Artifact) that opens in its own window",
    },
    drawDiagram: {
      label: "Drew a diagram",
      settingsLabel: "SVG drawing",
      description: "Let the AI draw vector diagrams (molecules, circuits, optics, geometry)",
    },
    generateImage: {
      label: "Preparing image",
      settingsLabel: "AI image generation",
      description: "Let the AI generate images (needs your approval; SVG first, only when necessary)",
    },
    createQuiz: {
      label: "Created a quiz",
      settingsLabel: "Structured quiz",
      description: "Let the AI build answerable, gradable questions with quiz components instead of collapsed text",
    },
    writeDocument: {
      label: "Wrote document",
      settingsLabel: "Long-form writing",
      description: "Let the AI write long articles, papers or reports section by section; exports to Markdown",
    },
    getArtifact: {
      label: "Retrieved demo HTML",
      settingsLabel: "Retrieved demo HTML",
      description: "Retrieves the full HTML of a previously generated demo by id (only the summary stays in context)",
    },
    useSkill: {
      label: "Used skill",
      settingsLabel: "Skills",
      description: "Enabled with the skill library",
    },
    proposeMemory: {
      label: "Proposed a save",
      settingsLabel: "Memory suggestions",
      description: "Lightly suggests saving definitions, theorems or steps worth remembering as notes or flashcards",
    },
    commitNotes: {
      label: "Wrote note",
      settingsLabel: "Save as note",
      description: "After your confirmation, writes a short outline into your personal notes and opens the editor",
    },
    commitFlashcards: {
      label: "Wrote flashcards",
      settingsLabel: "Save as flashcards",
      description: "After your confirmation, writes quizzable items to the review board (excerpt, cloze, question, custom)",
    },
    updateUserNote: {
      label: "Edited note",
      settingsLabel: "Edit notes",
      description: "Rewrites or deletes a personal note by id; can also write back to the note you are editing",
    },
    getProjectFiles: {
      label: "Viewed project files",
      settingsLabel: "Project files",
      description: "Views the project file tree and slice index (read bodies on demand with readProjectSlices)",
    },
    readProjectSlices: {
      label: "Read project slices",
      settingsLabel: "Project slices",
      description: "Reads project file bodies slice by slice (slices not in context prompt you to bring them in)",
    },
    searchClassTranscript: {
      label: "Search class transcript",
      settingsLabel: "Class transcript",
      description: "In Class mode, searches this or earlier classes' transcripts and cites them by number",
    },
  },
  // Message shell.
  message: {
    you: "You",
    assistantAria: "AI reply status",
    thinkingEnabled: "Deep thinking on",
    searchEnabled: "Web search on",
  },
  // Conversation stream container.
  thread: {
    loadingHistory: "Loading history...",
    loadEarlier: "Load earlier messages",
    loadingEarlier: "Loading earlier messages...",
    thinking: "AI is thinking...",
    closeInfo: "Dismiss the connection notice",
    closeError: "Dismiss the error",
    followOutput: "Follow the latest output",
  },
  // Panel-level notices (context warning / blank-chat nudge).
  panel: {
    blankHint: "You are already in a new chat — just say what you want to do.",
    contextWarning: "Context is {percent}% full; later requests will compress earlier turns automatically. You can keep typing.",
    // Notice after a manual compaction (lib/context/compactChatSession.ts writes tokenTracker.contextWarning).
    manualCompacted: "Earlier turns were compacted manually",
  },
  // Top navigation row.
  header: {
    title: "AI Tutor",
    settingsTitle: "AI settings",
    settings: "Settings",
    historyTitle: "History",
    history: "History",
    newChatTitle: "Start a new chat",
  },
  // Fold headers.
  fold: {
    expand: "Expand",
  },
  // Empty-chat welcome screen.
  welcome: {
    earlyMorning: "Late night — what would you like to do?",
    morning: "Good morning — what would you like to do today?",
    noon: "Good afternoon — what would you like to do?",
    afternoon: "Good afternoon — what would you like to do today?",
    evening: "Good evening — what would you like to do today?",
    example: {
      outline: "Turn today's lecture notes into a revision outline",
      flashcards: "Make 5 revision flashcards from my notes",
      demo: "Build a draggable demo that helps me understand a formula",
      brief: "Look up the latest material and turn it into a one-page brief",
    },
  },
  // The question rail on the right.
  dots: {
    aria: "Chat navigation",
    turn: "Question {turn}",
    turnWithPreview: "Question {turn}: {preview}",
    current: " · current",
    range: "Questions {start}–{end}",
    rangeTitle: "Earlier questions",
    rangeHint: "Questions {start}–{end}; expand to jump precisely",
    blank: "Empty question",
    quoted: "“{preview}”",
  },
  // Inline visualization folds and error boundary.
  viz: {
    fallbackLabel: "figure",
    error: "⚠️ This {label} failed to render (skipped; the rest is unaffected)",
    showSource: "Show source",
    hideSource: "Hide source",
    venn: "Venn diagram",
    distribution: "Distribution",
    formulaSteps: "Derivation",
    manim: "Animation",
    diagram: "Diagram",
    fallback: "Visualization",
  },
  // Web source fold.
  webSources: {
    title: "Web sources",
    foldTitle: "{label} · {count}{footnote}",
    cached: " · cached",
    searching: "Searching {providers}…",
    failed: "Search failed",
    scrollPrev: "Scroll sources back",
    scrollNext: "Scroll sources forward",
  },
  // Follow-up questions.
  followUp: {
    title: "You might also ask",
    sourcesOnly: "Sources for this round",
  },
  // Note citation fold.
  citations: {
    title: "Cited notes · {count}",
    open: "View",
  },
  // Note image gallery, web image search and chat images.
  images: {
    title: "Note images · {count}",
    searchTitle: "Images from this search · {count}",
    fallbackAlt: "Image {index}",
    untitled: "Image",
    loadFailed: "Image failed to load",
  },
};
