# `lib/stores/`

Zustand store 的唯一落点。本目录**不做桶导出**（避免把全部 store 打进每个页面）。

清点方法：搜本目录（含 `keyboard/`）里 `export const useXxx =` 的导出，逐个核对其是否 `create()` / `createPersistedStore()` 建出的 store。共 **44** 个（不含 `_persist.ts` 等辅助模块）。

| 文件 | hook | persist name / 存储 |
|------|------|---------------------|
| `artifacts.ts` | `useArtifacts` | `artifacts`（idb） |
| `documents.ts` | `useDocuments` | `documents`（idb） |
| `imageGen.ts` | `useImageGen` | `image-gen`（idb） |
| `skills.ts` | `useSkills` | `skills`（idb） |
| `reviewCards.ts` | `useReviewCards` | `review-cards`（idb） |
| `userNotes.ts` | `useUserNotes` | `user-notes`（idb；登录后 `user-note` 上云） |
| `billing.ts` | `useBillingStore` | `billing-history`（idb） |
| `settings.ts` | `useSettings` | `gailvlun-settings-v1`（自定义 localStorage） |
| `theme.ts` | `useTheme` | `gailvlun-theme` + `gailvlun-appearance-v1` |
| `academicYear.ts` | `useAcademicYear` | `gailvlun-academic-year` |
| `browser.ts` | `useBrowser` | `gailvlun-browser-v1` |
| `chatHistory.ts` | `useChatHistory` | `chat-history` / `chat-manifest` / `chat-session:*`（chatStorage） |
| `windowManager.ts` | `useWindowManager` | 不持久化 |
| `floatingChats.ts` | `useFloatingChats` | `quickExplainWindowSize`（仅窗口尺寸） |
| `chatUI.ts` | `useChatUI` | 不持久化 |
| `contextMenu.ts` | `useContextMenu` | 不持久化 |
| `noteCitations.ts` | `useNoteCitations` | 不持久化 |
| `noteLocator.ts` | `useNoteLocator` | 不持久化 |
| `flashcardCitations.ts` | `useFlashcardCitations` | 不持久化 |
| `recordPreviews.ts` | `useRecordPreviews` | 不持久化 |
| `tokenTracker.ts` | `useTokenTracker` | 不持久化 |
| `floatingTokenTracker.ts` | `useFloatingTokenTracker` | 不持久化 |
| `keyboard/keyboardSettings.ts` | `useKeyboardSettings` | `gailvlun-disabled-shortcuts` |
| `keyboard/reviewKeyboard.ts` | `useReviewKeyboard` | 不持久化 |
| `keyboard/shortcutHelp.ts` | `useShortcutHelp` | 不持久化 |
| `keyboard/globalSearch.ts` | `useGlobalSearch` | 不持久化 |
| `keyboard/overlayStack.ts` | `useOverlayStack` | 不持久化 |
| `ui.ts` | `useStore` | `gailvlun-sidebar-collapsed` / `gailvlun-topbar-collapsed` |
| `quiz.ts` | `useQuizStore` | `gailvlun-quiz-progress-v1`（经 `lib/quiz-progress.ts`） |
| `lightbox.ts` | `useLightbox` | 不持久化 |
| `toast.ts` | `useToast` | 不持久化 |
| `appMode.ts` | `useAppMode` | `studysolo-app-mode`（localStorage，key 定义在 `lib/constants/app-mode.ts`） |
| `agentCenter.ts` | `useAgentCenter` | `studysolo-agent-sources-panel-size`（localStorage，仅来源面板宽度） |
| `agentProductPicker.ts` | `useAgentProductPicker` | 不持久化 |
| `memoryInbox.ts` | `useMemoryInbox` | 不持久化 |
| `reincludedAttachments.ts` | `useReincludedAttachments` | 不持久化（一次性意图，发送时读取并清空） |
| `quizExplain.ts` | `useQuizExplain` | `quizExplainWindowSize`（localStorage，仅窗口尺寸） |
| `imports.ts` | `useImports` | `agent-imports`（idb；只存路径与元数据，不上云） |
| `projectFiles.ts` | `useProjectFiles` | `project-files`（idb；本地索引与切片，不上云） |
| `noteChangeProposals.ts` | `useNoteChangeProposals` | `note-change-proposals`（idb；幂等账本，不上云） |
| `scheduledTasks.ts` | `useScheduledTasks` | `scheduled-tasks`（idb；任务定义与运行历史，不上云） |
| `sessionRuns.ts` | `useSessionRuns` | `studysolo-session-runs`（localStorage；本机会话运行状态，不上云） |
| `pluginSecrets.ts` | `usePluginSecrets` | `gailvlun-plugin-secrets-v1`（localStorage，混淆存储） |
| `userProfile.ts` | `useUserProfile` | `studysolo-user-profile`（localStorage；头像与昵称缓存，不上云） |

云端同步在 `lib/sync/`，不计入上表：登录后把 `chat-session` / `artifact` / `document` / `user-note` / `review-card` 镜像到 `sync_documents`。不持久化、不同步 `settings` / `skill` / 生图 / 图片 blob / apiKey。笔记与闪卡另有 20MB 额度池，见 `docs/plans/notes-flashcards-cloud-sync.md`。

`_persist.ts` / `windowPersist.ts` / `settingsRecovery.ts` 是持久化辅助模块，不是 store。

旧路径（`lib/hooks/useX.ts` 等）保留 re-export 一个发布周期。
