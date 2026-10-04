# StudySolo 网站发布准备

2026-10-04 实查：`studysolo.1037solo.com` 经代理 VPS 的专属 Nginx 站点转发到本机 `41349`，此端口属于来自执行盒子的反向 SSH 隧道，盒子再提供 Next `35349`。代理 VPS 不是已经确认的应用源；合并 GitHub 主分支不会自动改变盒子中的运行版本。现有转发保留，未更改隧道、Nginx、VPN 或其他站点。

StudySolo 独立于 RootSolo 的八仓库发布列车。Landing 后台仍需和 Account、Platform、StudyFlow、ChatSolo、KitSolo、Docs、Shared 一起以现行 SOP 的固定提交发布；不能只替换 Landing 服务或把其他仓库的未验收改动带入该发布。

## 可复现服务器归档

`.github/workflows/web-release.yml` 是手动触发的干净 Linux 构建，不注入生产密钥，不启动服务。它先生成无外部模型调用的 BM25 索引，再通过类型、凭证扫描和项目既有 prebuild 闸门构建。`STUDYSOLO_WEB_STANDALONE=1` 仅打开 Web standalone 输出，保留 Web 正常图片处理，不打开 Electron 执行转发。

`scripts/deploy/pack-web-release.mjs` 把已追踪的运行依赖、静态产物和公开资源装入以完整 commit 命名的独立归档。它拒绝环境文件、原始导入资料、私密归档、Git 目录、特殊文件和越界符号链接；核对搜索 worker、内容索引、完整技能 catalog 等实际运行资源。归档附 SHA256、版本和 Next BUILD_ID，不凭分支名猜版本。

生产配置仍由操作者通过受限服务端文件注入；不放进 GitHub 构建产物。阿里云、连接器、Account 与存储配置须使用当前正式 profile，开发授权记录不能冒充正式用户授权。Cloud/Skills 及连接器生产门禁只有在各自实际验收通过后才启用。

## 部署与验收边界

真正部署前，必须实时确认目标主机、项目目录、空闲回环端口、磁盘、内存、守护方式和旧版本回退点。先把确切 SHA 的归档部署为独立预检实例，再检查真实登录、Agent 命令与产物、MCP 回调、Review 恢复、JS/CSS MIME、图片、内容检索和移动布局；通过后才切换正式专属站点。不能用停止未知进程、改 VPN 或重启整机代替发布。

发布后可通过 `/studysolo-release.json` 核对实际站点返回的 commit、version 和 BUILD_ID；这些字段没有用户或运营者配置。旧站点缺少该文件时不能据此声称已运行新版本。

## 已取得的实际归档

GitHub运行`37159564965`已成功，下载产物后再次核对归档SHA256、全部tar成员、特殊文件与符号链接，未包含环境文件或原始导入资料。固定引用如下：

- 源码commit：`f321e29d8bb580cf9cb43288437c31b1d4118358`。
- Next BUILD_ID：`4EMDRN2dcyKr0WiLyQrMq`。
- 归档SHA256：`638e0f17ed9cd356f0804c5a8682f7d7a6574ba0ca06edde9690ecebe9f6e034`。
- 归档785,054,022字节，运行文件约2.32GB，tar共29,644个文件。

下载后可重复运行以下只读校验。`--expected-commit`来自已验收Git提交，不从归档里的自述推断；校验程序不解压文件或启动服务。

```bash
python3 scripts/deploy/verify-web-archive.py --reference /private/release-reference.json --expected-commit <verified-full-commit>
```

校验同时确认SHA256、完整运行资源、内部/public版本标记、BUILD_ID和文件数/字节数。合法pnpm相对目录链接被解析；绝对路径、越界、特殊文件、硬链接、重复成员、循环链接和通过链接祖先写入均被拒绝。14项合成安全回归通过，现有实际29,644文件归档也已用该程序通过。新Web构建工作流在上传产物前执行同一校验。

该归档是云运行核心的冻结快照，不包含随后合并的Agent布局，以及还在验收的笔记和客户端修改。最终发布须重新构建最终commit，不能称这份较早归档为全部最新功能。

用户随后确认了独立预检路线。当前已在现有代理VPS的`/opt/studysolo-preview/`上传、二次校验并解包该归档，使用官方SHA验证的独立Node22和项目专用PM2 7.0.4。服务以无交互登录的`studysolo-preview`系统账号运行，只监听`127.0.0.1:35359`；PM2使用独立目录，没有接管其他进程或注册全局启动服务。

实际服务器HTTP验收通过：public版本标记返回上述commit/BUILD_ID，Agent HTML与JS/CSS均200且MIME正确。监听与进程UID核对通过，启动后RSS约153MiB，剩余磁盘约5.61GiB；这些是单次检查，不是并发或性能压测。通过严格SSH的本机回环转发，浏览器也实际渲染了页面。Nginx和sing-box保持active，正式StudySolo站点文件SHA256仍为`7d30ece15c25889e578ad8ad1dc978c9f4a16dc6b6203e96d64e3728a5962dba`，没有正式切换、新增购买或更改反向隧道。

仅新增预检专属`/opt/studysolo-preview/config/runtime.env`：`NODE_ENV`、`NEXT_PUBLIC_APP_URL`、`ACCOUNT_BACKEND_URL`、`ACCOUNT_URL`、`CLOUD_SANDBOX_ENABLED`、`CONNECTOR_ALLOW_PRODUCTION`。当前没有复制运营密钥，两个能力开关为false。初次整段部署脚本被自动策略阻止、没有执行，随后采用独立解包/配置/启动步骤完成；启动时修复了服务账号无法使用root工作目录的问题，没有改成以root运行应用。

预检证明了运行链路，不能当作最终界面发布或认证后的MCP/云执行验收。最终功能提交仍须重新构建、在本实例复验，并在正式切换前核对生产配置与回退点。

桌面安装包和手机壳另有发布流程，不能把网站归档当作EXE/APK。正式切换和浏览器多用户验收仍待完成。
