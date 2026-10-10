# 未使用导出审查与保留范围

日期：2026-10-10。来源为当前 Knip 的完整 Next/Classolo/Worker/CLI/Electron 图，测试入口已纳入。静态报告是调用线索；外部、协议和诊断接口是否可缩减需结合产品契约。

本轮已经归档 37 份无运行消费者的旧模块及 21 份转发原件；另清理无调用的内部 header reader、题目 Map 包装、旧线性一次性重采样和 nodes-only 包装。过期探针归档为文本，真实带限流式重采样、解析、schema、ID/owner/CAS 与当前功能保留。删掉的完整源 blob 有 SHA256 原件；重复数学/parser/schema 转出统一指向真实模块。

当前 Knip 未使用文件、直接依赖、unlisted 和 binary 为 0。保留候选为 130 个值和 69 个类型。表中逐项记录本轮选择：保留既有可调用接口、跨模块 kit、配置/协议和诊断表面。这些条目仍会在静态工具中出现；不声称每个符号都有当前生产调用，也未添加泛化 ignore 使诊断消失。

颜色重复项 COLOR_OK/COLOR_WIRE_OK 具有“组件可靠/连线可靠”两个展示名称，后者引用前者。颜色值和消费者保留，避免以重命名改变现有样式接口。

## 保留明细

| 文件 | 符号 | 类别 | 决定依据 |
| --- | --- | --- | --- |
| lib/db/migrate.ts | CATALOG_COMPARE_KEYS | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/db/migrate.ts | HOSTED_CATALOG_NOISE | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/db/migrate.ts | MigrationFile | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/db/migrate.ts | CatalogCompareKey | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/db/migrate.ts | CatalogDiff | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/auth/sign-in/account-verify.ts | resetVerifier | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/db/index.ts | insertChatMessage | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/index.ts | sessionPublicKit | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/index.ts | getSettingsPublic | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/index.ts | subscribeSettingsPublic | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/index.ts | useSettingsPublic | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/index.ts | P0_SESSION_COMMAND_TYPES | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/index.ts | SessionPublicKit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | CommandSource | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | NotesPublic | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | P0SessionCommandType | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | RecordingStatus | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | SessionCommand | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | SettingsPublic | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | TranscriptCommittedSegment | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/index.ts | TranscriptPublic | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/writes/render.ts | revokeRenderMessage | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| lib/stores/learning/userNotes.ts | selectUserNotes | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/stores/learning/userNotes.ts | UserNotePatch | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/learning/userNotes.ts | CreateUserNoteInit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/learning/userNotes.ts | OpenEditorOptions | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/learning/userNotes.ts | OpenNoteLibraryOptions | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/ai/create-model.ts | MissingAISecretError | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/features/notes/organizer.ts | getOutlineGenerateCalls | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/features/transcript/flush.ts | MERGE_GAP_MS | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/features/transcript/flush.ts | MERGE_SHORT_CHARS | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/features/transcript/flush.ts | MERGE_MAX_CHARS | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| lib/storage/chatStorage.ts | CHAT_S3_KEY_PREFIX | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | SYSTEM_PROJECTS | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | buildSessionMeta | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | saveBlobFromDataUrl | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | extractBlobIdsFromMessages | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | loadAllSessionsForExport | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | dotEntriesFromSpine | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | spineDerivedTotals | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage.ts | ProjectSystemKind | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/storage/chatStorage.ts | ManifestSource | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/storage/chatStorage.ts | SessionHeadV3 | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/storage/chatStorage.ts | ChatGcDeps | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/auth/browser/account.ts | freshAccessToken | value | 保留现有领域/诊断导出面；本轮不改变公开接口的可调用性 |
| lib/stores/chat/sessionRuns.ts | selectAnySessionRunning | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/models.ts | MUSE_VENDOR_TRAINING_NOTICE | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/models.ts | menuCategoryOfGroup | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/models.ts | ModelEndpoint | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/review-mode/progressSync.ts | importLegacyEntries | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/sync/status.ts | hasCloudRow | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | customProviderSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | chatRequestSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | artifactRequestSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | documentRequestSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | imageGenRequestSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | recordRequestSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | canvasReviseRequestSchema | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/ai/agent/requestSchema.ts | ArtifactRequest | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/ai/agent/requestSchema.ts | DocumentRequest | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/ai/agent/requestSchema.ts | ImageGenRequest | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/ai/agent/requestSchema.ts | RecordRequest | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/ai/agent/requestSchema.ts | CanvasReviseRequest | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/content/loader.ts | readContentHtml | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/content/loader.ts | searchAllContentResult | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/content/loader.ts | UnifiedContent | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/content/loader.ts | ResolvedPath | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/content/loader.ts | SearchAllContentOptions | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/sync/types.ts | MAX_ARTIFACT_BYTES | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/sync/types.ts | MAX_DOCUMENT_BYTES | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/sync/types.ts | MAX_USER_NOTE_BYTES | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/sync/types.ts | MAX_REVIEW_CARD_BYTES | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| components/chat/composer/ChatInput.tsx | MAX_INPUT_CHARACTERS | value | 保留现有领域/诊断导出面；本轮不改变公开接口的可调用性 |
| components/chat/composer/ChatInput.tsx | ChatInputProps | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/profile/password.ts | readPasswordFlag | value | 保留现有领域/诊断导出面；本轮不改变公开接口的可调用性 |
| lib/review-mode/classSources.ts | loadClassQuizPrompt | value | 保留现有领域/诊断导出面；本轮不改变公开接口的可调用性 |
| lib/review-mode/attemptStorage.ts | reviewAttemptKeyPrefix | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/sessionSummary.ts | sessionSummaryCacheStats | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/providers/secrets/index.ts | USER_SECRET_BACKEND | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | USER_SECRET_WRITES_TO_PGLITE | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | clearAllUserSecretOverrides | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | createElectronSafeStorageBackend | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | getProviderCredentialRef | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | getProviderCredentialRefs | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | getUserSecretOverride | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | setUserSecretOverride | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/index.ts | ResolvedSecret | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/secrets/index.ts | SecretKind | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/secrets/index.ts | SecretSource | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/secrets/index.ts | ProviderCredentialRef | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/reads/settings.ts | useSettingsPublic | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/ai/index.ts | MissingAISecretError | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/index.ts | MISSING_AI_SECRET_MESSAGE | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/index.ts | getAiRuntimeConfig | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/index.ts | resetAiRuntimeConfig | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/ai/index.ts | setAiRuntimeConfig | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/index.ts | CreateModelConfig | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/ai/index.ts | AiRuntimeConfig | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/markdown/index.ts | classroomMarkdownKit | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/markdown/index.ts | ClassroomMarkdownKit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/asr/custom-hotwords.ts | subscribeCustomHotwords | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/custom-hotwords.ts | getCustomHotwordText | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/custom-hotwords.ts | setCustomHotwords | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/custom-hotwords.ts | resetCustomHotwords | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/providers/asr/index.ts | MissingAsrSecretError | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | MISSING_ASR_SECRET_MESSAGE | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | DEFAULT_HOTWORD_PACK_ID | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | listHotwordPacks | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | resetHotwordPackSelection | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/providers/asr/index.ts | resolveHotwordPack | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | selectHotwordPack | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | subscribeHotwordPack | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | hotwordsForStart | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | getCustomHotwordText | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | getCustomHotwords | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | mergeHotwords | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | parseCustomHotwordText | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | resetCustomHotwords | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/providers/asr/index.ts | setCustomHotwords | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | subscribeCustomHotwords | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/index.ts | ASRCapabilities | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/asr/index.ts | ASRFamily | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/asr/index.ts | ASRSegment | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/providers/asr/index.ts | HotwordPack | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | ClassroomOutlineNode | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/mindmap/index.ts | classroomMindmapKit | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/mindmap/index.ts | diffOutlineLayout | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/mindmap/index.ts | layoutOutlineTree | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/mindmap/index.ts | OUTLINE_NODE_HEIGHT | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/mindmap/index.ts | OUTLINE_NODE_WIDTH | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/mindmap/index.ts | ClassroomMindmapProps | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | ClassroomOutlineFlowNode | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | ClassroomOutlineNodeData | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | ClassroomMindmapKit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | LaidOutEdge | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | LaidOutGraph | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/index.ts | LaidOutNode | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/storage/chatStorage/legacyMigration.ts | loadAllSessionsForExport | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage/sessionStore.ts | dotEntriesFromSpine | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| lib/storage/chatStorage/sessionStore.ts | spineDerivedTotals | value | 保留已存在的稳定 API、存储/恢复/同步或请求兼容入口 |
| components/chat/trace/ToolTraceStep.tsx | ToolIcon | value | 保留现有领域/诊断导出面；本轮不改变公开接口的可调用性 |
| classolo/lib/providers/secrets/override-store.ts | USER_SECRET_STORAGE_KEY | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | USER_SECRET_BACKEND | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | USER_SECRET_WRITES_TO_PGLITE | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | setUserSecretOverride | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | getUserSecretOverride | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | clearAllUserSecretOverrides | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | getProviderCredentialRefs | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/secrets/override-store.ts | createElectronSafeStorageBackend | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/runtime-config.ts | setAiRuntimeConfig | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/runtime-config.ts | getAiRuntimeConfig | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/ai/runtime-config.ts | resetAiRuntimeConfig | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/providers/asr/hotword-packs.ts | subscribeHotwordPack | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/hotword-packs.ts | listHotwordPacks | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/hotword-packs.ts | selectHotwordPack | value | 保留配置、凭据覆盖及 ASR/AI 协议兼容入口，保持既有能力与存储契约 |
| classolo/lib/providers/asr/hotword-packs.ts | resetHotwordPackSelection | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/components/ui/dialog.tsx | DialogClose | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/ui/dialog.tsx | DialogFooter | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/components/ui/dialog.tsx | DialogTrigger | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/features/render-modules/manifest.ts | listRenderTools | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/agent-status/index.ts | AgentStatusModule | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/agent-status/index.ts | agentStatusPropsSchema | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/ai-ask/index.ts | AiAskModule | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/ai-ask/index.ts | aiAskPropsSchema | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/gen-ui/index.ts | GenUiModule | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/gen-ui/index.ts | parseGenUiDsl | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/gen-ui/index.ts | GEN_UI_VERSION | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/gen-ui/index.ts | GEN_UI_WHITELIST | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/gen-ui/index.ts | genUiPropsSchema | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/image/index.ts | ImageModule | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/image/index.ts | imagePropsSchema | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/image/index.ts | searchClassroomImage | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/image/index.ts | ImageModuleProps | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/features/render-modules/image/index.ts | ImageSearchState | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/features/render-modules/rich-text/index.ts | RichTextModule | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/rich-text/index.ts | richTextPropsSchema | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/features/render-modules/rich-text/index.ts | RichTextModuleProps | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/features/render-modules/visual/index.ts | visualPropsSchema | value | 保留已有渲染模块的组件/manifest/schema 导出契约 |
| classolo/lib/theme/preference.ts | installThemeTestHarness | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/theme/preference.ts | resetThemeTestHarness | value | 保留既有恢复/诊断入口；当前静态图未显示生产导入 |
| classolo/lib/theme/boot-script.ts | themeBootScript | value | 保留已存在的课堂公开 kit/跨 feature/领域接口 |
| classolo/lib/session/types.ts | P0SessionCommandType | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/chat/chatHistory.ts | ChatSession | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/chat/chatHistory.ts | SessionWindowMeta | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/settings.ts | ArtifactFullscreenTarget | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/review-mode/attemptTypes.ts | ReviewQuizAttemptPage | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/review-mode/attemptTypes.ts | ReviewQuestionContext | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/quiz-progress.ts | QuestionScore | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/quiz-progress.ts | GlobalSummary | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/ai/provider.ts | ImageApiStyle | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/ai/provider.ts | ThinkingRequestStyle | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/learning/quiz.ts | QuizStatus | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/learning/quiz.ts | QuizPhase | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/stores/learning/quiz.ts | QuizScoreBreakdown | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/outline-schema.ts | PersistedOutline | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/lib/session/public-kit.ts | SessionPublicKit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| lib/local-files/contract.ts | LocalReadInput | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/markdown/kit.ts | ClassroomMarkdownKit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
| classolo/components/mindmap/kit.ts | ClassroomMindmapKit | type | 保留现有 DTO、持久化或组件/SDK 类型入口；类型不引入运行副作用 |
