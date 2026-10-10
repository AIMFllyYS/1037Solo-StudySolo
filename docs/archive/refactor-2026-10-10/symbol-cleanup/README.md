# 未使用符号整理的源码原件

日期：2026-10-10。此目录保存完整原 Git blob；source commit、路径和 SHA256 见 receipts.json，原件为 txt，不参与应用、类型或包入口。

- aiGate 的 readTrustedProxyUserId：全仓库只存在定义，没有静态/类型/延迟入口、运营脚本或文档消费者。它直接读取内部 header，当前所有者来自 Account 验证；删除未调用函数，保留 proxy 实际设置/清理的 TRUSTED_PROXY_USER_HEADER 和完整验证流程。
- quizSnapshot 的 questionsById：全仓库只存在定义，没有消费者或动态注册。删除无调用的 Map 包装和仅为其使用的 QuizQuestion 类型导入，保留 canonical/hash/location/immutable identity 逻辑。
- resampleTo16k：当前录音使用 createStreamingResampler 的连续带限重采样；旧无状态线性函数唯一非定义消费者是已归档的 2026-10-02 探针。保留真实流式重采样、PCM 转换、峰值计算及原接口。
- parseOutlinePatch：没有消费者的旧 nodes-only 包装；保留解析 nodes/formulas 的 parseOutlineAnalysis 与 applyOutlinePatch。
- knowledge-cards 的 parseFlashcards/FlashcardDraft 和 validate 的 formula schema：冗余转出路径；真实 flashcard-parse/schema 模块及生成/验证调用完全保留，不删除实际解析器或校验器。

原件不代表当前执行任务，不得据此恢复旧代码或触发任何账户/数据库操作。真正的当前实现仍位于原运行路径。
