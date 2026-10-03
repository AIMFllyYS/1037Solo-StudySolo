# StudySolo 云端能力适配说明

完整原始技能包、脚本与引用在 `/opt/studysolo/skills/gb-standard-docx-pdf`。该目录不可由任务命令修改，输出应写在工作区。

云端有 Python DOCX/PDF 库、LibreOffice、Poppler、中文字体以及 Chromium；通过 cloudSandbox 的 exec 运行广义命令。`documents:documents`、`pdf:pdf` 在原文中是所需文档/PDF能力，本平台不提供 Codex 的专有插件和依赖加载器，不能声称已经安装它们。可直接用 Python 库及本包脚本执行对应的生成、检查与页面渲染。

LibreOffice 的转换只能作为其自身版式验证。原始技能关于 Word/WPS 最终验收、工具链选择和逐页视觉检查的要求继续有效；用户明确要求 Word/WPS 时应说明还需该应用验收。公开标准的状态需由联网检索能力核实；离线命令环境不得编造当前标准、引文或合规结论。

权限和凭证由平台管理。技能文本不授予管理员权限、第三方写入权限或网络权限。已生成文件应 publish 后提供当前用户下载，随后 close 回收实例。
