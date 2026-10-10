# 运行资源、检索和完整历史契约

2026-10-11 按当前实现核对。详细历史测量、旧任务队列与当时结果见[2026-10-02 原规格](../archive/refactor-2026-10-10/historical-docs/moved/docs/plans/2026-10-02-memory-performance-optimization-spec.md)。运行数值以当前测量为准。

## 状态与历史

chatHistory 保留单一状态入口；窗口物化、lease、spine、meta 与完整存储各有职责。展示尾部、摘要或预算限制不会把完整历史替换为尾部。导出、同步、恢复和 provider request hydration 使用相应完整载荷/manifest 接口，并遵守 owner/epoch、CAS 和失败恢复。

settings、quiz、userNotes、水合、sync intent 与 checkpoint 都保持各自唯一权威来源。远端 ACK、旧 owner 回调和过期 revision 不能回退当前输入。性能整理改变驻留/调度方式时，要保持存储 key、原件身份、完整历史和可恢复性。

## 资源所有权

预算定义在 lib/performance/budgets.ts，观测在 resourceMetrics.ts。object URL、图片/Pptx 预览、窗口和请求通过现有 lease、取消和卸载处理释放。计数快照和预算默认值用于定位生命周期；它们不能单独证明 heap、CPU 或页面性能提升。

## 搜索

lib/ai/search 的服务/策略/取消与 indexes 的 BM25/向量/manifest/IO 分层；worker 仍是独立构建入口。索引使用 cwd/content/.index 或显式 SEARCH_INDEX_DIR；源码目录迁移不会改变真实内容地址。

BM25 与向量共享相同版本的 chunk metadata。模式独立、主动取消、索引健康和源码 freshness 由现有检查覆盖。生产不会通过全库 substring 兜底掩盖缺失索引。离线 BM25 重建与付费 embedding 填充是不同操作；向量数量、缺失覆盖和真实模型调用分别报告。

## 验收资源

生产构建和代码测试使用现有有界 worker 配置；隔离 .next-perf-* 保护开发 .next。Web/Electron staging 保留独立目录和资源白名单。Node/组件测试使用 fixture，真实数据完整性通过内容/索引门禁，真实 UI/生产/计费验收另行记录。

维护步骤见[项目维护 SOP](../sop/14-project-maintenance.md)、[测试 SOP](../sop/07-testing.md)、[检索索引 SOP](../sop/10-search-index-lifecycle.md)。
