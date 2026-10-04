# 网站自定义模型连接边界

网站服务的自定义模型调用现在先解析所有 DNS 地址，再将已验证的公网地址固定给请求 socket；Host 和 TLS 身份仍对应原模型主机。混合公网／私网结果、元数据地址、VPN fake-DNS 网段和非全球用途的特殊地址全部拒绝。IPv6 特殊网段依据 [IANA 特殊用途注册表](https://www.iana.org/assignments/iana-ipv6-special-registry) 与[地址空间注册表](https://www.iana.org/assignments/ipv6-address-space)核对，保留合法公网 IPv4、IPv6 和指向公网 IPv4 的通用 NAT64 地址。

调用固定在该配置的 origin，不跟随重定向，也不接受带用户名／密码的 URL；用户 API 密钥仍发给原来的模型服务。自定义 Host 与 Proxy-Authorization 被移除，TLS 验证显式启用。响应按字节流转发，不改写文本或完成信号；20MiB 上限、原超时和取消信号限制传输，结束／取消时释放 reader 和 dispatcher。预检未发出请求的拒绝会给出明确网络错误，并可按既有计费规则取消预留。

该传输适用于网站 SDK 的用户配置模型，覆盖 OpenAI-compatible 和 Anthropic 调用。平台固定上游保持原传输；桌面本机服务只含用户自备密钥，保留本机代理兼容，主 Agent 转到正式网站后仍使用网站护栏。它不是对任意未知服务或所有网络库的安全认证。

本机 60 项模型／流／错误定向测试、22 项 chat API 回归与5项公共连接探测回归通过，测试内的 provider HTTP/DNS 都为明确合成拦截，不发送真实模型请求。预检 VPS 使用该模块的单独构建，在无运营凭据的非 root 服务账号下完成真实公网 HTTPS 200／页面标记读取，私网 DNS 结果在 HTTP 前拒绝。实际测试不启动或替换网站实例，也不执行付费模型推理。完整仓库 CI 与最终发布实例仍是后续门禁。
