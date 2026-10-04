# StudySolo 桌面版 (Electron)

把 StudySolo Next.js 应用打包成 Windows 安装版与便携版。桌面继续使用 Windows application ID `com.gailvlun.desktop`、本地端口 `35349`，并保留历史 Gailvlun userData 路径，保证已有 DPAPI 加密配置可继续读取。

启动应用不要求用户预先配置 AI 密钥。未配置 AI Provider 时，正文、笔记和 Account 登录等非 AI 页面仍可使用；发起模型请求时由产品正常显示配置错误。云能力经固定远端 bridge 访问并需要网络，桌面版不宣称全部离线可用。

## 配置与数据边界

- 用户可在应用设置里自行配置 Provider；应用不再把 API 密钥设置作为启动门槛。没有可用 Provider 时，AI 请求返回正常的未配置提示。
- 用户自有配置仍保存在固定的旧 userData 路径并由 Windows DPAPI 加密。不要把用户配置、`.env`、provider/account 凭据或任何运营密钥放进构建环境或安装包。
- Electron 子进程只接收主进程筛选后的环境值，不继承父进程偶然存在的 provider、API、Bearer 或 token 值。
- 固定本地端口为 `35349`。端口变更会改变桌面 origin，可能使旧本地状态变得不可见，因此保持不变。
- 云能力使用固定远端 bridge；需要联网。禁止把操作员密钥写入桌面包或用其静默代替用户配置。

## 本地内容与联网能力

- **无需 AI 配置**：已打包的内容、笔记、题库、本地关键词搜索和 IndexedDB 进度仍可使用。
- **需要联网**：Account 登录、固定远端 bridge、视频 CDN，以及配置了 Provider 后的 AI 功能。无 AI 配置时，对话请求显示普通未配置错误。

## 构建

```bash
pnpm install            # 含 electron / electron-builder
pnpm run desktop:build  # 1) next build (standalone) 2) 拷 static/public/content(含307MB索引) 3) electron-builder
```

产物在每次独立构建的 `dist-desktop-staged-<id>/`：

- `StudySolo-portable-<version>.exe` —— 免安装单文件。
- `StudySolo-setup-<version>.exe` —— NSIS 安装版。

## 本地联调（不打包，验证启动链路）

```bash
# 使用隔离 staging 目录做完整桌面构建与包内校验，不覆盖 .next 或旧 dist。
pnpm run desktop:build
pnpm run desktop:dev    # electron . —— 使用当前开发目录打开桌面窗口
```

## 工作原理（简）

1. Electron 使用固定的历史 Gailvlun userData 目录保存本地数据；首次启动无需录入密钥。
2. 以 `ELECTRON_RUN_AS_NODE` 使用 Electron 自带 Node 启动 `.next/standalone/server.js`，`cwd` 设为 standalone 目录。
3. 主进程过滤继承环境，仅注入用户配置，并固定端口 `35349`；不继承开发机或运营环境的密钥。
4. 服务就绪后，`BrowserWindow` 打开 loopback 页面；Provider 未配置时 AI 请求正常报错，不影响浏览内容和账户登录。

## 备注

- Client CI uses Playwright's Electron API to launch the actual `win-unpacked/StudySolo.exe` under a temporary profile, check guest login and Agent layout, exercise BrowserTab's native webview zoom/reset/refresh against a local StudySolo route, capture screenshots, then close and reopen the app. This verifies the packaged UI and local webview controls; it does not certify compatibility with every public website.
- Windows EXE 尚未进行代码签名，系统可能提示未知发布者。请只从官方 Release 获取，并核对该 Release 中的 SHA-256；本文不指导绕过系统安全提示。
- 图标可选：放 `build/icon.ico` 后在 `electron-builder.yml` 取消 `icon` 注释。
- `next.config.mjs` 仅当 `BUILD_STANDALONE=1` 才切到 standalone + 关图片优化，**不影响本地 / 自托管 Web 构建**。检索索引随 `content/.index/` 打进包内，内容搜索读取本地索引；Account、固定远端 bridge 与视频 CDN 仍需网络（见 `docs/sop/10-search-index-lifecycle.md`）。
