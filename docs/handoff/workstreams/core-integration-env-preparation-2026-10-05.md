# CORE-INTEGRATION 环境文件准备回执

> status: active · updated: 2026-10-05

本回执仅记录父审批准后的StudySolo环境文件准备。原33冻结产品/报告文件不修改。主已报告产品PR合入master/dev、Shared唯一canonical合入main；这些发布/合并事实与数据库应用、正式进程生效是不同阶段。用户当前自行手动部署，本worker没有调用Grok、部署服务或浏览器。

## 已完成文件修改

仅本项目 `.env.local` 与 `.env.production` 新增/统一：

- `CLOUD_SANDBOX_BUDGET_AUTHORITY`
- `CLOUD_SANDBOX_BUDGET_IMPORT_FINGERPRINT`

按父审候选保存；本报告不输出变量值、密钥、owner或环境文件正文。作用范围只限StudySolo服务端文件，不修改Windows全局、其他项目、Account、Shared用户状态或grant。完整 `.env.production` 已保留所有原配置并补齐本次批准字段，供用户现有手动部署使用；它不是只有两行的补丁文件。

每个文件均从受限副本准备完整候选，先parse和配置校验，再在同卷执行Windows原子替换；写后核对候选文件hash和原source ACL。备份目录保护继承，仅保留受限主体，未扩大读权限；before及atomic-before副本均保留，没有删除原证据。

实际写入前出现的Windows接口问题已解决：PowerShell传入null字符串被File.Replace解释为空path，首次未写入；改用明确受限backup路径后，重设已受限旧backup descriptor触发SeSecurityPrivilege，程序停在第二文件之前。源文件ACL仍正确，随后去掉不必要的backup ACL重写，以原始descriptor限制检查代替，完成两个文件原子写入。最终从本任务最初snapshot重新核对两文件，保证第一次已写local不会掩盖整体原值差异。

## 完整性与names-only差异证据

受限最终证据：`.local-archive/connectors-private/core-sandbox-env-final-validation-2026-10-05.json`。

|校验|`.env.local`|`.env.production`|
|---|---|---|
|parse与UTF-8往返|通过|通过|
|唯一差异变量名|上述2项|上述2项|
|全部未批准变量值及文本字节保留|通过|通过|
|sandbox配置schema|通过|通过|
|connector/Google/GitHub配置schema|通过|通过|
|原origin保留|通过|通过|
|原模板与完整skills绑定|通过|通过|
|provider配置hash不变|通过|通过|
|原加密key及其余密钥不变|通过|通过|
|原runId和已批准预算限额保留|通过|通过|
|RootSolo项目绑定正确|通过|通过|
|source ACL保持|通过|通过|
|原子文件hash校验|通过|通过|

本机文件变量数量由89变91，生产文件由91变93；这是解析后的字段数量，不是环境值。证据只列批准变量名和boolean检查，不存正文、owner、密钥或provider hash值。变量值相等校验、provider/key/template/origin校准在服务端私有helper内进行，没有注入VM/模型。

受限操作回执 `.local-archive/connectors-private/core-sandbox-env-preparation-2026-10-05.json` 记录backup目录、ACL/hash/schema检查、作用文件与变量名；私有执行helper也留在ignored目录。备份路径不进入公开包或Git。

## 生效状态与SQL待办

文件准备已通过，未人工重启RootSolo/StudySolo/Account或其他进程。开发服务器可能自行监测环境文件变化，本轮没有读取进程秘密或重启来验证；当前本机进程是否已重读新字段仍未验证。正式部署由用户操作，远端进程和完整环境实际生效仍pending，不能把本机 `.env.production` 存在表述为正式已启用。

现有新create入口按冻结实现要求准确shared authority、reviewed marker、对应reconciled RPC。marker/RPC尚未应用时继续fail closed；本轮没有调用open或以配置校验触发创建。纯MCP、普通聊天和已有本人止损保留原合同。

数据库没有执行任何SQL/DML；Shared canonical迁移、正式history登记、独立旧reserve操作导入仍未应用。此前现场无unreleased是父核时点，实际执行前仍须重新核snapshot。原runId未跨日重置，原准入cap/批准上限/模板/永久API key不变。实际Ali invoice及本轮/月compute+template/storage余量未核，不能因为环境准备完成创建新VM或宣布费用闭环。

后续父验收：核对names-only证据与完整生产文件准备；待本人Ali登录和实际invoice后，按独立预算部署附录审查/执行唯一Shared迁移与history、独立操作导入，再核正式环境/进程生效，最后恢复真实Cloud命令/skills/产物/下载/回收验收。完整CORE仍pending。

本轮可入Git仅本回执。环境文件、受限备份、helper与metadata均为ignored；无关membership/quota dirty未触碰。
