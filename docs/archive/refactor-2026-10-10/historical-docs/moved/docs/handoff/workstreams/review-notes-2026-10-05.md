# REVIEW-NOTES · 2026-10-05 实施与本机真实验收

状态：本包候选、真实本机流程与最新必要检查已完成，主已独立核对笔记、云端元数据、重启恢复与化学公式；交主最终精确审查/提交。worker 未提交、未部署，不代表后续沙箱/MCP/客户端或整个目标完成。当前源文件范围为23个，主独占Git与全局账本。

## 确认的根因与最小变化

1. Agent `createQuizCard → ChatQuizCard / AgentQuizWindow → QuizRunner` 两个宿主原先不传稳定quizId，Runner仅保存React内存。现复用同一Runner与既有progressSync/attemptStorage/quiz-progress/wrongBook，保存题集、attempt、原题id/questionKey、成绩、作答恢复与CAS账号同步，无第二题库、API或新运行器。
2. 生成题部分提交的旧本地投影把未答客观题都算错，与现有服务端calculateResults不一致。共享投影现评分已作答/揭晓客观题，保留已恢复selfScores并按现有max上限计主观分；未评分题correct=null/scored=false。objectiveCount/correctCount只客观题，scoredCount可含已有主观自评，无新自评UI。两宿主明确显示分数和未评分数量。
3. 真实端测暴露CAS交错：旧组件快照能降回已确认serverRevision/quizSetId，旧seed ACK能覆盖更新答案。现沿原localWriteQueues串行普通写与ACK，单向保留已确认metadata，旧ACK保留较新答案/本地revision。
4. 成功后残留/重复sync会用同operationId和已变化expectedRevision再POST，触发既有RPC的幂等哈希冲突。现已确认synced revision不重复POST；conflict只读已有getAttempt，完整可写状态和contentHash/set一致才收敛synced（时间按语义归一），真正不同答案保留conflict且不覆盖服务器。工具卡晚于owner hydration加载时，重开消费者对当前pending/conflict同attempt调用既有队列，再加载同ID，不全owner扫描或轮询。
5. Review newest原先优先任意历史pending/conflict，旧50%冲突记录遮过新100%结果。现仅最新本地未同步项优先，其余最新本地/远端resume/远端completed按Date语义比较；旧记录保留，Review与掌握度恢复一致。
6. 本地wrongBook为空时，页面仍显示“没有足够错题”而服务器实际有1条错题。现复用原账号attempt索引，以questionKey和最新结果算当前wrongCount，保留后来correct尝试供服务端裁掉旧错；加载、读取不完整、真实服务器错题数各自准确显示，没有第二错题Store。
7. 章节选择器只列ch01等分组ID，现有readContentSearchText实际资料是1.1等叶子。真实ch01请求返回无资料。现从原content tree递归真实叶子，保留父章节路径标签，失效分组不能提交；不新增材料API或导航。
8. 远端summary已评分题数原投影固定0，现从已返回questionResults.scored恢复。轻量成绩DTO保留标题，虚拟Agent生成题显示学习主题，不把内部hash作为章节名称。
9. 自动沉淀原链已存在：proposeMemory→现有确认云→旁路/api/chat(memoryCommit)→commitNotes/commitFlashcards→owner stores→Review。本轮补owner epoch保护，切账号取消未完成commit/关闭内存提案，迟到流及结果不得写到新账号；不删除用户历史或笔记。
10. 主重开自动笔记发现红色裸ce。现有根/rehype使用KaTeX0.16.47，而Crepe独立使用0.18.7；其inline节点直接调用自身KaTeX且不读取feature配置。只在现Next配置将裸katex绑定根ESM实例（保留其他alias），Milkdown lazy入口加载已有mhchem。目标必须是根katex.mjs，与mhchem.mjs相对import同实例；不升级版本/加依赖/新parser/换编辑器。主同note验证三化学式正确显示。

Agent生成题明确使用既有review-chapter合同下的虚拟review/agent/agent:<sha256>范围，不冒充真实课程章节成绩。历史缺quizId按完整题组内容得到稳定identity，内联/dock一致。新attempt保留旧miss历史，较新correct纠正当前错题。原题id、题集关联及sourceRef持续保存。

Review一级目录、中心Milkdown/Markdown权威正文、右TOC、浮窗导航、既有菜单/通知/主题均保留。现有生成系统提示仅补标题使用学习主题/章节名，内部id/hash留数据依据，不全局regex改用户正文。

## 实际本机流程与数据证据

所有材料为自建公开题/公开科学事实；报告和数据库证据只包含metadata，不打印私有正文、联系人或凭证。使用现有登录态，未复制cookie/Token或模拟Actor。云端证明由主使用项目原有服务端client只读精确公测记录，不写SQL。

### Agent出题、错答、恢复、纠正

- 自建独立公开对话，实际模型调用createQuiz，标题REVIEW-PUBLIC-20261005，两题1+1=2、2+2=4。
- 原首次尝试9d77e838-bd0e-4928-a461-63c23fd84cf4本地50%却sync conflict。云端实际仅answering/0分，不把本地50%冒充保存成功；记录保留。
- 修后重做尝试12ea6d1e-b8db-4592-8ca2-e5fc1029bf9e：同题集744d1503-8ccf-410a-a654-6db8b437dd54，revision4，summary/final，1/2=50%，两个原题id/key与一错一对结果真实入云。
- 后来答对的新attempt0597f84e-bd80-4dc6-99b4-89638d203900：同题集，revision4，summary/final，2/2=100%，两题correct=true。成功后的额外409由重复sync修复，未关闭CAS或强行覆盖。
- 真实刷新/重开共享消费者恢复100%，DOM metadata同attempt/set，localrev6/serverrev4/syncedrev6且“已保存到当前账号”。Review答题页也恢复2/2=100%并无旧1错提示；掌握度近期正确率100%、薄弱点0。
- 原生来源/出题入口仍可重开。两个宿主共享保存链；旧卡片不因刷新再次强制抢焦点。
- 元数据：`public-quiz-cloud-metadata.json`。worker仅成功保存`public-score-pending.jpg`（真实50%待同步状态，不能当synced截图）。100%截图多次CDP超时，如实保留此边界；100%保存/恢复有实际DOM关联和主精确DB事实。

### 错题诊断与公开章节

- 真实点击原生成诊断接口，HTTP200返回9题；覆盖1/1原题、资料0/0。题目针对现有有机化学错题，主独立打开亦见账号保存成功，保存`parent-diagnosis-real.png`。账号索引当前wrongCount=1，本地空本不再显示错误empty；新正确结果保留供原服务端排除历史错误。
- 该旧生成标题露内部questionKey，原图保留；已在原system prompt约束新标题，只用主题/章节名。不为此额外模型重试，新增提示尚未单独自然生成再验。
- ch01真实请求HTTP422无资料，定位并修原选择器的分组/叶子断点。
- 1.1第一次真实请求HTTP200但UI通用失败、没有可作答结果；generation_failed为当时怀疑分支，当次尚无结构化诊断，不能认定具体schema字段或provider故障。未改全局tool schema/模型/env。仅保留generation_failed分支metadata日志（finishReason、calls/results/errors/error名称、boolean答案数、schema字段path、droppedCount，无正文/参数/headers）。
- 一次受控重试成功：标题“概率论1.1随机试验与样本空间·章节小测”，11题，真实资料1/1，保守输入估算2164tokens。
- 公测首题选择正确C，部分交卷2/2=100%，10题未评分且不算错；真实UI账号已保存。
- 精确attempt fe0e11f1-52fa-45a4-bfd1-1e7cc62de1d7，revision3，summary/final，review-chapter、probability/detail/1.1；questionResults11中1scored/correct、10unscored/correct=null，全部原id/key与题集155ea3f8关联。证据`public-chapter-cloud-metadata.json`。

### 笔记、自动沉淀与闪卡

- 主独立对原自建note9kzpfdj4g完成公开标题REVIEW-PUBLIC-NOTE-20261005、正文水的三态h1/h2的真实键入→自动保存→刷新恢复→根面包屑返回→一级列表重开；TOC两项可选。
- 选区Milkdown工具栏实际背景rgb(255,251,254)、opacity1、z10，非透明。
- 主390文档scrollWidth390、编辑区354.4；三横线展开一级树，选同note关闭抽屉，右TOC打开后选项自动关闭。截图`parent-note-selection.png`、`parent-note-390.png`。
- 主只读ss_sync_documents精确clientId/title，user-note/deleted=false/title+h1+h2+正文布尔标记全部正确，`public-note-cloud-metadata.json`。这是实际云同步行，非第二设备登录测试。
- 新独立公开对话仅给含氧光合作用事实，实际两个proposeMemory生成笔记/闪卡提案。逐个点击现有“整理”，串行旁路请求，无模型并行。
- Note实际commitNotes后打开真实编辑窗：标题REVIEW-PUBLIC-MEMORY-20261005，正文含光合作用和氧气/h1。Review直接打开`/review?note=o0ytmspt2`，一级列表、中心编辑/TOC均实际可见；云端同clientId/deleted=false/body标记正确，`public-memory-note-cloud-metadata.json`。
- Flashcard实际commitFlashcards→既有processRecord完成1张，预览front/cloze/原文可见。精确clientId fo9zxaaxp云端review-card/deleted=false/status=ready/cardType=cloze/front/back/blanks非空，`public-memory-card-cloud-metadata.json`。
- Review实际消费该公开卡，显示答案→四档评分，仅对该卡点“轻松”，到期4→3；刷新仍3，未操作其他3张已有卡。SRS本机恢复已验，未宣称另一设备SRS同步。
- 主服务重启后，新note标题/正文/h1/TOC恢复、闪卡badge3和公开cloze恢复。原图`parent-memory-note-after-restart.png`记录当时化学公式裸ce缺口。
- 同实例修复后主重开同note，三处katex-html均不含裸ce、msupsub数量3，下标实际可读；`parent-memory-chemistry-fixed.png`和对应metadata。未重新调用模型或改正文。不能只用katex-error=0判断成功。

### Class/Review基础导航与运行边界

- worker实点Class桌面三横线，收起/展开语义正确；桌面viewport/scrollWidth均2048。
- Class390实点“展开导航”，aria-expanded=true，viewport/scrollWidth均390，无基础横向溢出；随后关闭临时抽屉、reset视口回2048、恢复原桌面导航展开。
- 390公共48px头部截图亦CDP5s超时，未生成文件，未宣称截图成功；基础控制与宽度为真实UI/DOM实点数据。
- 同源同时切模式/Review页签期间观察到另一标签视图变化，主停止此类操作后worker串行完成；本包不扩跨标签UX或持久化布局体系。
- 初期RootSolo/Study/Account停机为历史阻断。用户后明确授权CLI自治恢复，主受管启动/重启自己5a，复用健康Account，不结束他人进程。浏览器观察/截图超时不等于服务死亡。
- 所有模型和写入结束后worker交还浏览器，主仅重启自己Study释放Next累积内存，再独立核对恢复；最后暂停自己5a为串行收尾检查腾内存，Account原进程保留。不做生产/VPN/SSH/部署。

## 检查与限制

- 前轮必要Node49项、React宿主/Sidebar/笔记/确认卡检查通过，未把这些替代真实流程。
- 最新串行Node25/25：progressSync7、agentQuizProgress3、既有Markdown/math/sanitize15；涵盖迟到seed ACK、captured draft不能降CASmetadata、重复sync、同状态回读/异状态保留、工具卡late owner消费恢复、Date语义newest、late correct的当前wrongCount、主观恢复评分。
- 最新单worker串行React15/15：QuizRunner2、ReviewQuizPane3、createQuizCard5、QuizMarkdown2、Milkdown owner3。
- 配置probe验证其他alias保留、根ESM同实例、三化学式throwOnError=true可渲染/msupsub输出；实页同note化学显示已由主复核。
- 最新精确22代码文件ESLint通过；最后标准pnpm typecheck已退出0、无错误。git diff --check通过；不整仓CI/build。
- 不声称第二设备或真实账号切换动态验收；账号隔离有现owner机制与定向迟到回归。未单独重做整份静态课程题集，保留其既有接口/成绩/运行器，本轮真实出题/章节/逐题保存链已验。
- 原1.1第一次HTTP200通用失败的具体error/模型输入字段未直接回读；受控重试实际成功，未来generation_failed可读metadata诊断，不猜测扩改schema。截图超时边界如上，主截图及精确数据证据独立保留。

## 精确候选范围：23文件

源码16：

- `app/api/review/quiz/route.ts`
- `components/chat/ChatQuizCard.tsx`
- `components/chat/toolCards/createQuizCard.tsx`
- `components/quiz/AgentQuizWindow.tsx`
- `components/quiz/QuizRunner.tsx`
- `components/review-mode/ReviewQuizPane.tsx`
- `components/review-mode/ReviewMasteryOverview.tsx`
- `components/notes/MilkdownNoteEditor.tsx`
- `lib/review-mode/agentQuizProgress.ts`（新增）
- `lib/review-mode/progressSync.ts`
- `lib/review-mode/wrongQuestions.ts`
- `lib/quiz-progress.ts`
- `lib/stores/memoryInbox.ts`
- `lib/i18n/messages/parts/zh/review.ts`
- `lib/i18n/messages/parts/en/review.ts`
- `next.config.mjs`

测试6：

- `components/quiz/QuizRunner.progress.test.tsx`（新增）
- `components/chat/toolCards/createQuizCard.test.tsx`
- `components/review-mode/ReviewQuizPane.test.tsx`
- `lib/review-mode/agentQuizProgress.test.ts`（新增）
- `lib/review-mode/progressSync.test.ts`
- `lib/stores/memoryInbox.test.ts`

报告1：`docs/handoff/workstreams/review-notes-2026-10-05.md`。

证据目录：`artifacts/performance/review-notes-2026-10-05/`。冻结SHA256单独记录于该目录，只包含本包23文件，不含全局账本或其他在途修改。

明确不纳入主的studysolo-workstreams.json/全局handoff/README、反馈/浏览器/沙箱独立候选及会员改动；UI包已提交部分保留。未改SQL/已应用006、MCP/云/core/budget/credentials/env、客户端或生产资源。worker未commit/切branch/stash/reset/push。
