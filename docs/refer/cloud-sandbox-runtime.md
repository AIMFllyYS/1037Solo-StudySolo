# 云沙箱运行时与维护边界

2026-10-11 按当前源码核对。框架/环境和实际资源状态以代码、运行进程与服务端记录为准。历史接入、账单估算和旧任务结果见[原参考快照](../archive/refactor-2026-10-10/reference-refresh-2026-10-11/docs/refer/cloud-sandbox-runtime.md.txt)；当前任务范围由人类请求和[维护 SOP](../sop/14-project-maintenance.md)确定。

## 运行入口和职责

| 位置 | 职责 |
| --- | --- |
| lib/sandbox/types.ts | action、session、command、auth retry、私有产物 DTO |
| lib/sandbox/request.server.ts | 有界请求与参数验证 |
| lib/sandbox/actor.server.ts | Agent 来源面、Account owner、不可由 JSON 构造的执行 scope、逐操作授权 |
| lib/sandbox/config.server.ts | 来源/提供者/模板/秘密配置和资源/预算上限 |
| lib/sandbox/service.server.ts | action 生命周期、已开始标记、所有者/会话归属、异常不重复执行 |
| lib/sandbox/provider.server.ts、assets/ | SDK 与受控执行、namespace/worker 协议 |
| lib/sandbox/store.server.ts | 加密持久化、租约/围栏、共享预算 authority |
| lib/sandbox/artifacts.server.ts | 原件发布与私有鉴权下载 |
| lib/sandbox/cleanup.server.ts、maintenance.server.ts | 精确实例关闭、结果/清理恢复 |
| lib/sandbox/skills.server.ts、skill-packs/ | 账号安装记录、包完整性与受控技能挂载 |
| instrumentation.ts | Node 运行时注册索引健康和 execution maintenance |

工具与网站的连接器是独立能力。连接器运行规则见[连接器运行时](learning-connector-runtime.md)，环境见[配置参考](connector-environment.md)。

## 身份与来源

执行 scope 绑定实时 Account UUID 和 conversationId。服务端 Symbol 标记不能通过请求 JSON 声明。独立 Agent 的 /api/agent/chat、agentMain、/agent 或相同 /c/<id> 来源共同决定可用性；内嵌笔记/课堂/计划上下文不会因此获得执行能力。

普通对话取得 live owner；open/exec/write/publish 逐次调用近期授权并重新核对 owner。当前 SANDBOX_RECENT_AUTH_MAX_AGE_SEC 为 12 小时，仍要求有效登录/MFA；连接器自己的敏感操作窗口按其 actor 规则执行。cancel/close 是已有资源的止损路径。技能安装有单独来源与授权入口。ACCOUNT_CHANGED 拒绝旧 owner 继续写。

模板、操作者 API key、加密密钥和服务角色均在服务端。任务代码、日志、文件和技能文字不能授予第三方写入或提升来源权限。任务环境和宿主控制面通过现有 worker/namespace、UID、挂载和文件权限规则隔离；源实现和已有测试说明机制，实际供应商/生产隔离仍需独立验收。

## action 和结果

支持 status/open/exec/poll/write/read/list/cancel/publish/close。exec 返回 commandId；调用者查询同一命令的状态与结果。开始标记、uncertain、已存在会话与 auth-retry 票据防止未知网络结果被当作“未执行”再运行。已开始或不确定的外部动作先读取记录/提供者状态。

完成命令后 publish 用户需要的文件，再 close 精确资源。原件和产物 manifest 绑定 owner/session，下载继续鉴权；历史完整日志和展示摘要有各自边界。关闭状态、容量释放和费用预留分别记录。

SDK connect 与外部并发 pause/resume 之间存在窗口；该源码重构没有提供原子的 no-resume 保证。未知创建、连接中断与清理失败保持 uncertain，维护时按记录和精确提供者绑定核对；迁移 Team/key/template 后仍需核对原绑定资源。

## 当前软件上限

以下是 config/server/产物服务的代码约束；它们不代表本次任务获得了使用资源或支出的授权。

| 约束 | 当前值 |
| --- | --- |
| 实例生命周期 | 900 秒 |
| 单命令 | 600 秒 |
| 输出日志 | 262144 字节 |
| 单文件 | 20 MiB |
| 文本读写 | 256 KiB |
| 应用并发活跃实例 | 1 |
| 单用户 24 小时创建次数 | 10 |
| monthly/run 基础 ceiling | 各 100000000 micro-CNY |

配置的月/run ceiling 不可超过源码上限；固定准备余量从可计算余额中扣除。预算 authority、reservation、实际账单和用户模型额度各有记录。真实计费规则、账单和变更授权按当次任务核实；旧文档中的价格/预算许可只属于原日期。

## 配置与验证

配置入口使用 CLOUD_SANDBOX_ENABLED、REGION/DOMAIN/API_URL、API_KEY、TEMPLATE、APP_ORIGIN、ENCRYPTION_KEY，以及 BUDGET/FIXED_COST/RUN_ID 等服务端变量。秘密不得使用 NEXT_PUBLIC_ 前缀；配置缺失或不合法返回既有受控错误。

修改协议、租约、预算、文件、auth retry 或清理时，运行对应 lib/sandbox 下既有测试及完整类型/代码门禁。测试替身、静态报告或端口就绪只证明相应层。需要真实资源验收时，明确批准的提供者绑定/身份/预算，记录 open → exact command/poll → publish → 鉴权下载 → close，以及独立资源释放核对。

这份参考不会安排旧交接队列、指定执行模型、开启提供者、安装技能、修改生产配置或启动付费验收。代码维护和真实运行验收分别记录。
