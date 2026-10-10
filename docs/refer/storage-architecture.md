# 存储、状态、所有者与恢复

核对日期：2026-10-10。本说明对应实际源码；磁盘格式和所有者边界不能因职责拆分改写。扩展前结合 [当前架构](../architecture.md)、[组织标准](../standards/code-organization.md) 和相关行为测试。

## 所有权与运行顺序

`lib/storage/ownerScope.ts` 持有当前 owner、epoch、操作取消信号和 owner 变更监听。账号用户数据的物理 key 为 `ss-user:<ownerId>:<logicalKey>`；无 owner 时不能用未作用域 key 代替。已捕获的 owner/epoch 操作不能在账号切换后落入新账号，恢复写入也沿用捕获的 owner。

`lib/hooks/auth/useAuthSession.tsx` 根据真实登录身份激活 owner 并触发 owner store 水合；`lib/stores/chat/chatHistory.ts` 管理聊天账户重置和 bootstrap。界面 store、IndexedDB、云端状态各有职责，不把网络 ACK 或 UI 尾部窗口当成另一份完整历史。

## 存储层与写入证据

| 模块 | 职责与结果 |
| --- | --- |
| `lib/storage/idbStorage.ts` | `gailvlun-db/keyval`、logical key 常量、owner 作用域、延迟/立即 IO、原子事务 |
| `idbStorage.setItem` / `setItemLazy` | 排队及防抖；调用完成不能当原子 checkpoint 的成功凭据 |
| `setItemNow` | 立即写入并等待，返回 boolean；无浏览器/owner 时 false |
| `commitSessionCheckpoint` | 同一 IDB 事务比较 head revision 并提交 chunks/head，返回 saved/conflict/unavailable |
| `readOwnedStorageItem` / `writeOwnedStorageItem` | 明确捕获 owner 的读与恢复写，不能跟随新活动账号 |
| `lib/stores/_persist.ts` | Zustand persist 组合；IDB JSON 序列化推迟到写入时，注册 owner 水合 |

读取在同一 owner 的 IndexedDB 未命中时可检查其 localStorage 并迁移；不能自动认领别人的或旧无归属的数据。浏览器存储不可用时，上层必须按实际结果处理；内存可继续使用不等于保存成功。

设置、外观和小型布局偏好有各自 localStorage 与恢复机制。localStorage 的同步读取也需要 SSR 与水合处理，不能声称“同步所以无水合问题”，不能在 `useState` 初始化器里永久捕获未水合默认值。

## 聊天持久化职责

公共入口 `lib/storage/chatStorage.ts` 显式导出原调用契约；子目录分工如下：

| 子模块 | 负责 |
| --- | --- |
| `types.ts`、`keys.ts` | manifest/head/window/GC 协议与 key |
| `manifest.ts` | 项目/会话元信息、系统项目、manifestFrom、保存门控 |
| `blobs.ts` | 附件字节、内联迁移、API 水合与 Blob 引用 |
| `legacyMigration.ts` | 旧格式迁移和完整导出 |
| `gc.ts` | 保守的孤儿检查和清理 |
| `sessionStore.ts` | 写队列、v3 chunks/head、checkpoint、尾部缓存、失败与恢复 |

logical key 由源码构造，不能从文档复制后另造一套：

| 格式 | 用途 |
| --- | --- |
| `chat-history` | v1 迁移输入 |
| `chat-manifest` | 会话/项目 manifest |
| `chat-session:<id>` | v2 会话体的兼容入口 |
| `chat-blob:<id>` | 附件字节 |
| `chat-s3:<id>:h` | v3 head，含 revision、计数与 turn spine |
| `chat-s3:<id>:c:<n>` | v3 轮次 chunk |
| `chat-recovery-s3:<id>`、`chat-recovery-tail-s3:<id>` | 全量/尾部恢复记录 |

这些 logical key 写入用户存储时仍带 owner 前缀。`sessionStore` 按 owner/session 串行处理写入；head/chunks 在一个原子事务中提交。CAS 冲突可合并安全的新增消息，否则保留待写内容和恢复证据。写失败不会靠不断旋转重试或伪造“已存盘”完成；重试/恢复按原协议执行。

加载尾部窗口、较早轮次、spine 和摘要 head 有不同 API。显示和驻留预算可以只物化窗口；请求、同步、导出及完整消费者仍按其完整历史契约取数据。不要用当前 DOM 消息数量推断全会话数量。

## 单一 store 与水合

聊天历史只有一个 `useChatHistory`，入口组合窗口/会话/消息/项目 action；它们使用相同 set/get。`chatHistory/manifest.ts` 的写入门控在 bootstrap 水合前禁止用空默认状态覆盖真实 manifest。窗口驻留、lease、估算和预算由 `windowRuntime.ts` 管理。

一般 owner 用户数据 store 位于 assets/chat/learning/workspace，各自定义持久化和局部恢复；[store 索引](../../lib/stores/README.md)给出实际入口。`lib/hooks/` 只保留 React 生命周期与适配，旧纯转发 hook 已归档。

`useHydrated`、`useChatReady`、`_hasHydrated` 和 `_activeMessagesReady` 分别服务于已建立的界面/聊天门控，不能只给它们设 true 来解锁失败状态。格式、类型和运行时入口必须分开，类型导入不应初始化 store 或 IO。

## 设置与秘密

`lib/stores/settings.ts` 组合唯一设置 store 和水合门控；`settings/types.ts`、`defaults.ts`、`persistence.ts`、`apiActions.ts`、`preferenceActions.ts` 分别维护协议、默认值、磁盘/备份/密钥生命周期和动作。`settingsRecovery.ts` 与 `apiSecrets.ts` 管理恢复与 Web/Electron 秘密编码；它们是存储辅助层，不另建一份设置权威。

原 key、Web 格式和 Electron bridge 保留。重构不能抹掉恢复备份、把读失败当空配置覆盖，或让服务端凭据进入客户端导入树。配置和 provider/能力端点的实际服务端归属仍由相应边界处理。

## 云同步与复习

`lib/sync/engine.ts` 拥有 intent/journal 队列、重试、版本基线和 owner 生命周期。`stores.ts` 适配真实状态/持久化，`payloadReaders.ts` 读取完整载荷，`remoteApply.ts` 通过窄策略应用远端，`quotaSnapshot.ts` 管理额度快照。云端应用仍走 manifestFrom 和原冲突/CAS/删除规则。

复习 `progressSync.ts` 拥有队列与账户生命周期，`progress/client/` 分离 HTTP、attempt 转换、checkpoint、事件、投影和主动 legacy 导入。服务器 API 的 origin、身份、静态题库、幂等/CAS 由 `progress/server/` 管理。旧无归属复习历史必须由用户主动导入；延迟 seed/ACK 不能回退新答案。

## 扩展与验证

先决定数据权威、所有者、格式版本、完整读取、事务成功证据、失败/冲突/恢复及迁移条件，再新增 store 或 IO。保留原件、key、迁移次序和恢复语义；清理需由实际引用和所有者证明安全。

测试覆盖 owner 切换、未水合写保护、真实 IDB 事务、并行/CAS、尾部与完整历史、附件/导出、失败恢复和复习延迟 ACK。运行相应源码旁测试，再按 [SOP 07](../sop/07-testing.md)完成候选全量验收。生产库、真实账号数据、部署或付费调用的操作依照当次人类授权，不作为文档维护的自动步骤。
