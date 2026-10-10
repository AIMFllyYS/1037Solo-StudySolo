import { settingsAppearanceEn } from "./settings/appearance";
import { settingsModelsEn } from "./settings/models";
import { settingsModelFormEn } from "./settings/modelForm";
import { settingsKeyboardEn } from "./settings/keyboard";

/**
 * settings 命名空间（英文）—— 由 i18n 分片维护。
 *
 * 为什么分片：这一轮要覆盖设置 / 菜单 / 右侧面板 / 思考链四块互不相干的界面，
 * 分片后每块只改自己这一份词典，不会在合并阶段互相覆盖。
 * 加 key 在对应业务分片（未拆出的命名空间留在本文件）；缺英文会被 `en.ts satisfies LocaleMessages` 在 typecheck 阶段拦下。
 */
export const settingsEn = {
  language: {
    title: "Language",
    zh: "Chinese",
    en: "English",
    desc: "Interface language, applied immediately",
  },
  // Shared actions used across the settings sections.
  common: {
    save: "Save",
    create: "Create",
  },
  // Settings workspace shell (components/chat/settings/ChatSettings.tsx)
  workspace: {
    navAria: "Agent settings categories",
    back: "Back to chat",
    brand: "Settings",
  },
  // The six workspace sections: nav label + nav hint + content title + content description
  section: {
    general: {
      label: "General",
      hint: "Defaults and chat",
      title: "General",
      desc: "Tune the defaults for new chats, the selection assistant, and shared context.",
    },
    appearance: {
      label: "Appearance",
      hint: "Theme and reading",
      title: "Appearance",
      desc: "Shares one configuration with the appearance controls at the bottom left of the project, so changes apply instantly.",
    },
    models: {
      label: "Models",
      hint: "Models, APIs, images",
      title: "Models",
      desc: "Manage built-in models, custom APIs, dedicated capability endpoints, and the image generation flow.",
    },
    capabilities: {
      label: "Agent capabilities",
      hint: "Tools and demos",
      title: "Agent capabilities",
      desc: "Control the tools and interactions the Agent may use. Models and chat history are unaffected.",
    },
    skills: {
      label: "Skills",
      hint: "Library and injection",
      title: "Skills",
      desc: "Maintain the skills the Agent can call on demand or always inject.",
    },
    data: {
      label: "Data & account",
      hint: "Billing, sync, export",
      title: "Data & account",
      desc: "Review billing preferences, redemption, cloud sync, and local export.",
    },
  },
  overlay: {
    aria: "Agent settings",
  },
  // Appearance (AppearanceSection + AppearanceSettingsControls + the GlobalSettings summary)
  appearance: settingsAppearanceEn,
  // Model lists and built-in models (ModelSection + the model rows in _shared)
  models: settingsModelsEn,
  // Custom model form (ModelForm.tsx)
  modelForm: settingsModelFormEn,
  // Custom API groups (ApiGroupsSection + _ApiGroupCard)
  apiGroups: {
    title: "Custom API",
    meta: "{count} groups · alongside site defaults",
    desc: "Create as many API groups as you like; each has its own baseUrl/apiKey and model list, and all of them appear in the model menu.",
    keyNoticeDesktop: "Desktop: API keys are encrypted by the operating system (DPAPI on Windows) and are never written to the settings JSON in plain text.",
    keyNoticeWeb: "Web: API keys are kept in this browser (separate storage, lightly obfuscated) and never reach the cloud. This is not encryption — local extensions or forensics can still read them, so avoid saving keys on a shared computer.",
    defaultName: "API group {index}",
    newGroup: "New API group",
    name: "Group name",
    namePlaceholder: "My API",
    baseUrl: "API endpoint (base URL, including /v1)",
    apiKey: "API key",
    timeout: "Request timeout (ms, default 45000)",
    modelCount: "{count} models",
    rename: "Rename group",
    remove: "Delete group",
    removeConfirm: "Delete group {name}? This cannot be undone.",
    addedModels: "Added models ({count})",
    noModels: "No models yet — use the button below to add one",
    addModel: "Add model",
    removeModelConfirm: "Delete model {name}?",
  },
  // Import / export / restore for custom APIs (ApiConfigurationRecovery.tsx)
  apiRecovery: {
    import: "Import API config",
    importAria: "Import API config file",
    export: "Export API config",
    restore: "Restore local backup",
    merged: "Merged {count} groups; existing configuration is never overwritten by an older backup.",
    noGroups: "No custom groups were found at this address. Browsers save settings per address and port, so if you upgraded from an older address, export there first and import here. Do not clear your browser data.",
    exported: "The backup contains recoverable API keys. Keep it to yourself and never share it.",
    noBackup: "No pre-migration backup is available at this address. Export from the old address instead; nothing was modified.",
    restored: "Local backup merged.",
    unreadable: "The backup could not be read; nothing was modified.",
    exportHint: "The export contains recoverable keys (lightly obfuscated, not encrypted). Never upload or share the backup file.",
    tooLarge: "File is too large",
    importFailed: "Could not import the configuration; your settings were not modified.",
  },
  // Image generation settings (ImageSection.tsx)
  image: {
    title: "Image generation",
    meta: "Default model, prompt model, fallback",
    desc: "Click ⭐ on a built-in model or a custom API model to make it the default. In image mode the AI first uses a text model to understand the intent and refine the prompt, then calls the image model to generate the picture.",
    current: "Current default image model",
    fallback: "(falling back to the built-in image model)",
    clear: "Clear default (back to fallback)",
    textModel: "Image-mode text model (understands intent + refines the prompt)",
    textModelAria: "Image-mode text model",
    fallbackModel: "Fallback model (used when the primary model fails)",
    fallbackModelAria: "Fallback model",
  },
  // Capability endpoints (CapabilityEndpointsSection.tsx)
  capability: {
    title: "Capability endpoints",
    meta: "Image, embedding, search, rerank",
    desc: "Leave a field empty to use the platform default. With your own key, that capability no longer counts against the platform quota.",
    image: "Image",
    modelId: "Model ID",
    platformDefault: "empty = platform default",
    imageApiStyle: "API style",
    imageApiStyleAria: "Image API style",
    probe: "Test image endpoint",
    probing: "Checking…",
    probeOk: "Image endpoint is configured",
    builtinImageModel: "empty = built-in image model",
    embedding: "Embedding",
    embeddingDesc: "Query vectors must come from the model that built the index. Building the index offline still uses environment variables only.",
    rerank: "Rerank",
    webSearch: "Web search (three providers)",
    webSearchHint: "All three search providers can be configured separately; empty means the platform env var. Default priority Kimi > Zhipu > Perplexity; academic or fact-checking questions go to Perplexity first (most authoritative), everyday questions to Kimi / Zhipu (cheaper); the model may run all three in parallel when cross-checking is needed.",
    zhipuKey: "Zhipu API key",
    zhipuPlaceholder: "empty = platform ZHIPU_API_KEY",
    kimiSearchKey: "Kimi API key (built-in $web_search)",
    kimiSearchPlaceholder: "empty = platform KIMI_API_KEY",
    perplexitySearchKey: "Perplexity API key",
    perplexitySearchPlaceholder: "empty = platform PERPLEXITY_API_KEY",
    unsplash: "Image search (Unsplash)",
    unsplashPlaceholder: "empty = platform UNSPLASH_ACCESS_KEY",
  },
  // Agent capabilities section (ToolsSection.tsx)
  tools: {
    title: "Tool calling",
    maxRounds: "Max tool rounds",
    maxRoundsDesc: "Passed to the Agent ToolLoop ({rounds} by default). The slash / plus menus still fall back to this setting when they cannot read the value.",
    roundsUnit: "rounds",
    maxOutput: "Max output per call",
    maxOutputDesc: "The most tokens one model call may produce, reasoning included. 0 = automatic: the current model's declared maximum ({model}: {tokens}).",
    maxOutputUnit: "tokens",
    maxOutputHint: "A lower value holds less credit in reserve, but reasoning models may spend it all on thinking and return no answer, or get cut off. Keep 0 unless you need a limit.",
    turnBudget: "Budget per answer",
    turnBudgetDesc: "The most credits one answer may spend, all tool steps included. 0 = automatic: the server limit. It can only be stricter than the server limit, never looser.",
    turnBudgetUnit: "credits",
    turnBudgetHint: "Each step reserves its worst case first and gets the difference back once it settles. When the reserved total would exceed this value, the remaining steps of the answer are stopped with a notice.",
    maxWait: "Max wait time",
    maxWaitDesc: "How long one answer may take before it is stopped locally. Deep reasoning plus several tool steps can legitimately exceed the default — raise it if long answers get cut off.",
    waitUnit: "s",
    waitHint: "Range {min}–{max} seconds; {default} seconds by default. The server keeps streaming heartbeats during silent reasoning, so this only cuts off answers that really run too long.",
    hint: "{recommended} rounds is recommended: it matches the studyAgent default and is plenty for everyday Q&A. The {cap}-round cap matches the AI SDK ToolLoopAgent default stopWhen, and going higher brings no architectural benefit.",
    demo: {
      title: "HTML demo window",
      target: "Fullscreen overlay area",
      targetDesc: "Artifacts are global floating windows mounted on the page by AppShell — they belong to neither the notes area nor the side panel",
      notes: "Notes area",
      viewport: "Whole window",
    },
  },
  // Shared context (ContextSection.tsx)
  context: {
    title: "Shared context",
    desc: "This text is injected into the system prompt of every chat (appended to the stable prefix, which helps caching). A good place for general background, how you want to be addressed, or style preferences.",
    placeholder: "e.g. Answer in concise Chinese, use KaTeX for formulas, and end with a one-line summary.",
    count: "{count} characters",
  },
  // Data & account section (DataSection.tsx)
  data: {
    redeem: {
      title: "Redemption code",
      desc: "Enter a code to upgrade your tier. A failure never reveals whether the code exists.",
      placeholder: "Enter redemption code",
      failed: "Redemption failed. Check the code and try again.",
      successTier: "Redeemed for the {tier} tier",
      success: "Redeemed",
      busy: "Redeeming…",
      submit: "Redeem",
    },
    billing: {
      title: "Billing & exchange rate",
      desc: "In the billing dashboard you can flip the card to switch between CNY (¥) and USD ($). Set your own exchange rate here.",
      rate: "USD rate (USD/CNY)",
    },
    cloudSync: {
      title: "Cloud sync",
      desc: "Signed-in chat text, AI context checkpoints, demos, documents, notes, and flashcards are synced. New attachments, including photos and PDFs, save originals and processed context in private cloud storage using the account storage allowance. Manage them in My assets → Cloud files with confirmed soft deletion. Legacy local-only attachments remain available locally. API keys are never uploaded. Structured sync data is limited to about {limitMb} MB, with {notesPoolMb} MB for notes and {flashcardsPoolMb} MB for flashcards; these are not file upload size limits.",
      signedIn: "Signed in — you can pull your chats and artifacts back on another device.",
      signedOut: "Signed out — data stays on this device only.",
    },
    export: {
      title: "Data",
      desc: "Export every chat (main chats + selection chats) as a local JSON backup. It is saved only where you choose and is never uploaded to any server.",
      done: "Exported {count} chats",
      empty: "No chat data to export yet",
      chats: "Export all chats",
      logsDesc: "Export the Agent lifecycle logs on disk, kept as raw JSONL with no cleanup.",
      logs: "Export all logs",
      noLogs: "No logs yet",
      logExported: "Exported",
      failed: "Export failed",
    },
  },
  // Skill library (SkillsSection + SkillsManager)
  skills: {
    title: "Skill library",
    // The paragraph has an icon in the middle, so it is split in two; the surrounding
    // spaces are the literal spaces the original JSX rendered around that icon.
    descPrefix: "Import ",
    descSuffix: " a single .md file, a ZIP, or a .skill bundle (aligned with Agent skills: SKILL.md wins). The AI reads the full text on demand by name and description; turn on the switch to keep a skill “always on” (injected in full every round).",
    import: "Import skill",
    loading: "Loading skill library…",
    empty: "No skills yet. Import a .md file, or a ZIP / .skill bundle containing SKILL.md (name and description are filled in from the frontmatter and can be edited below).",
    name: "Skill name",
    description: "Skill description (helps the AI decide when to use it)",
    pinTitle: "Always on: injected in full every round",
    unpinTitle: "Off: called on demand by the AI",
    pinnedNote: "Pinned: injected in full every round, hidden from the callable menu",
    remove: "Delete skill",
    maxReached: "At most {max} skills; some files were not added.",
    unsupported: "Only .md / .markdown / .zip / .skill are supported.",
    // Import failures (generated by lib/utils/importSkills.ts, shown by SkillsManager).
    errorNoMarkdown: "{file} contains no SKILL.md or Markdown.",
    errorUnparsable: "Could not parse {file}.",
  },
  // Selection assistant action preview (SelectionAssistantPreview.tsx)
  selectionPreview: {
    title: "Selection assistant actions",
    desc: "Click the buttons on the mini action bar to toggle actions; anything turned off never appears in the real selection assistant.",
    count: "Showing {visible} / {total} actions",
    disabled: "While the main switch is off, selecting text never opens this site's action bar",
  },
  // Bottom-left global settings panel / phone settings page (GlobalSettings.tsx)
  global: {
    title: "Settings",
    viewAccount: "View account",
    openAgent: "Open Agent settings",
    openAgentDesc: "Models, tools, export, and appearance — the same configuration the AI assistant on the right uses.",
    open: "Open",
    quota: "Quota",
    quotaSummary: "Membership · usage · storage",
    storageQuota: "Storage quota",
    year: "Year / term",
    scores: "Scores",
    keyboard: "Shortcuts",
    appearance: "Appearance",
    signIn: "Sign in",
    signOut: "Sign out",
    signOutFull: "Sign out",
  },
  // Account dialog (AccountDialog.tsx)
  account: {
    title: "Account info",
    close: "Close account info",
    avatar: "Avatar",
    localOnly: "Stored on this device only",
    change: "Change",
    restoreInitials: "Restore initials",
    name: "Name",
    nameHint: "Defaults to {name} until you change it",
    emailPrefix: "the email prefix",
    saveName: "Save name",
    noEmail: "No email linked",
    changePassword: "Change password",
    setPassword: "Set password",
    updatePassword: "Update password",
    currentPassword: "Current password",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    passwordInAccount: "Your password is managed by your 1037Solo account. Changing it asks for the current one.",
    openPasswordPage: "Change it in your 1037Solo account",
    nicknameFailed: "Could not save the nickname",
    avatarFailed: "Could not save the avatar",
    authMissing: "Sign-in is not configured",
  },
  // Shortcut section shell (KeyboardShortcutsSettings; item copy lives under shortcut.* below)
  keyboard: settingsKeyboardEn,
  // Scores section (GlobalSettings.tsx)
  scores: {
    chapters: "Chapters tested",
    avgBest: "Average best score",
    attempts: "Attempts",
    empty: "No test records yet",
    summary: "{chapters} chapters · avg {avg} · {attempts} attempts",
    emptyTitle: "No test records yet.",
    emptyHint: "Open the “Quiz” tab of any chapter — your score shows up here once you finish a set.",
    chapterCount: "{count} chapters",
    avgBestShort: "Avg best",
    lastAttempt: "Last {percent} · {attempts} attempts",
    lastUnscored: "No objective score",
    clear: "Clear all scores",
    clearDesc: "Removes only the test scores saved on this device; the questions themselves are untouched.",
    clearConfirm: "Confirm clear",
    clearAction: "Clear",
  },
};
