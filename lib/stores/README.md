# `lib/stores/`

Zustand store 的唯一落点。`assets/` 管理资产，`chat/` 管理对话，`learning/` 管理学习与引用，`workspace/` 管理窗口和工作区；根目录保留共享持久化、账户/偏好、设置和集成入口。本目录**不做桶导出**（避免把全部 store 打进每个页面）。

清点方法：搜本目录（含 `keyboard/`）里 `export const useXxx =` 的导出，逐个核对其是否 `create()` / `createPersistedStore()` 建出的 store。共 **48** 个（不含 `_persist.ts` 等辅助模块）。

| 文件 | hook | persist name / 存储 |
|------|------|---------------------|
| `assets/artifacts.ts` | `useArtifacts` | `artifacts`（idb） |
| `assets/documents.ts` | `useDocuments` | `documents`（idb） |
| `assets/imageGen.ts` | `useImageGen` | `image-gen`（idb） |
| `skills.ts` | `useSkills` | `skills`（idb） |
| `learning/reviewCards.ts` | `useReviewCards` | `review-cards`（idb） |
| `learning/userNotes.ts` | `useUserNotes` | `user-notes`（idb；登录后 `user-note` 上云） |
| `billing.ts` | `useBillingStore` | `billing-history`（idb） |
| `settings.ts` | `useSettings` | `gailvlun-settings-v1`（自定义 localStorage） |
| `theme.ts` | `useTheme` | `gailvlun-theme` + `gailvlun-appearance-v1` |
| `academicYear.ts` | `useAcademicYear` | `gailvlun-academic-year` |
| `workspace/browser.ts` | `useBrowser` | `gailvlun-browser-v1` |
| `chat/chatHistory.ts` | `useChatHistory` | `chat-history` / `chat-manifest` / `chat-session:*`（chatStorage） |
| `workspace/windowManager.ts` | `useWindowManager` | 不持久化 |
| `chat/floatingChats.ts` | `useFloatingChats` | `quickExplainWindowSize`（仅窗口尺寸） |
| `chat/chatUI.ts` | `useChatUI` | 不持久化 |
| `workspace/contextMenu.ts` | `useContextMenu` | 不持久化 |
| `learning/noteCitations.ts` | `useNoteCitations` | 不持久化 |
| `learning/noteLocator.ts` | `useNoteLocator` | 不持久化 |
| `learning/flashcardCitations.ts` | `useFlashcardCitations` | 不持久化 |
| `learning/recordPreviews.ts` | `useRecordPreviews` | 不持久化 |
| `chat/tokenTracker.ts` | `useTokenTracker` | 不持久化 |
| `chat/floatingTokenTracker.ts` | `useFloatingTokenTracker` | 不持久化 |
| `keyboard/keyboardSettings.ts` | `useKeyboardSettings` | `gailvlun-disabled-shortcuts` |
| `keyboard/reviewKeyboard.ts` | `useReviewKeyboard` | 不持久化 |
| `keyboard/shortcutHelp.ts` | `useShortcutHelp` | 不持久化 |
| `keyboard/globalSearch.ts` | `useGlobalSearch` | 不持久化 |
| `keyboard/overlayStack.ts` | `useOverlayStack` | 不持久化 |
| `ui.ts` | `useStore` | `gailvlun-sidebar-collapsed` / `gailvlun-topbar-collapsed` |
| `learning/quiz.ts` | `useQuizStore` | `gailvlun-quiz-progress-v1`（经 `lib/quiz-progress.ts`） |
| `workspace/lightbox.ts` | `useLightbox` | 不持久化 |
| `toast.ts` | `useToast` | 不持久化 |
| `appMode.ts` | `useAppMode` | `studysolo-app-mode`（localStorage，key 定义在 `lib/constants/app-mode.ts`） |
| `workspace/agentCenter.ts` | `useAgentCenter` | `studysolo-agent-sources-panel-size`（localStorage，仅来源面板宽度） |
| `workspace/agentProductPicker.ts` | `useAgentProductPicker` | 不持久化 |
| `learning/memoryInbox.ts` | `useMemoryInbox` | 不持久化 |
| `assets/reincludedAttachments.ts` | `useReincludedAttachments` | 不持久化（一次性意图，发送时读取并清空） |
| `learning/quizExplain.ts` | `useQuizExplain` | `quizExplainWindowSize`（localStorage，仅窗口尺寸） |
| `assets/imports.ts` | `useImports` | `agent-imports`（idb；只存路径与元数据，不上云） |
| `assets/projectFiles.ts` | `useProjectFiles` | `project-files`（idb；本地索引与切片，不上云） |
| `assets/noteChangeProposals.ts` | `useNoteChangeProposals` | `note-change-proposals`（idb；幂等账本，不上云） |
| `scheduledTasks.ts` | `useScheduledTasks` | `scheduled-tasks`（idb；任务定义与运行历史，不上云） |
| `chat/sessionRuns.ts` | `useSessionRuns` | `studysolo-session-runs`（localStorage；本机会话运行状态，不上云） |
| `pluginSecrets.ts` | `usePluginSecrets` | `gailvlun-plugin-secrets-v1`（localStorage，混淆存储） |
| `userProfile.ts` | `useUserProfile` | `studysolo-user-profile`（localStorage；头像与昵称缓存，不上云） |

云端同步在 `lib/sync/`，不计入上表：登录后把 `chat-session` / `artifact` / `document` / `user-note` / `review-card` 镜像到 `sync_documents`。不持久化、不同步 `settings` / `skill` / 生图 / 图片 blob / apiKey。笔记与闪卡另有 20MB 额度池，见 `docs/plans/notes-flashcards-cloud-sync.md`。

`_persist.ts` / `workspace/windowPersist.ts` / `settingsRecovery.ts` 是持久化辅助模块，不是 store。

2026-10-10 已将仓库内旧 hook 转发的调用者全部迁到真实 store，21 个纯转发源码作为可恢复文本归档在 `docs/archive/refactor-2026-10-10/source-shims/`。应用为 private 包，没有另行发布这些模块的外部包接口；数据 key 和同一 store 实例保持不变。新增 store 直接从本目录对应领域导入，不再增加 hook 转发层。
