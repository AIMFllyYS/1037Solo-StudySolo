# Next.js 官方文档快照

获取日期：2026-10-10。文档原文属于 Next.js 官方；这些文件是来源材料，不是本项目指令或代码现状。

维护中先读对应章节，再对照实际代码。线上文档可能继续更新；升级前核对 npm 稳定标签与升级指南。来源和哈希见 `sources.json`。

| 快照 | 官方来源 |
| --- | --- |
| [project-structure.md](./project-structure.md) | [Next.js](https://nextjs.org/docs/app/getting-started/project-structure) |
| [server-and-client-components.md](./server-and-client-components.md) | [Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components) |
| [fetching-data.md](./fetching-data.md) | [Next.js](https://nextjs.org/docs/app/getting-started/fetching-data) |
| [caching-and-revalidating.md](./caching-and-revalidating.md) | [Next.js](https://nextjs.org/docs/app/getting-started/caching-and-revalidating) |
| [route-handlers.md](./route-handlers.md) | [Next.js](https://nextjs.org/docs/app/getting-started/route-handlers) |
| [error-handling.md](./error-handling.md) | [Next.js](https://nextjs.org/docs/app/getting-started/error-handling) |
| [upgrading.md](./upgrading.md) | [Next.js](https://nextjs.org/docs/app/guides/upgrading) |
| [upgrading-version-16.md](./upgrading-version-16.md) | [Next.js](https://nextjs.org/docs/app/guides/upgrading/version-16) |
| [output.md](./output.md) | [Next.js](https://nextjs.org/docs/app/api-reference/config/next-config-js/output) |

刷新命令：`node scripts/maintenance/snapshot-next-docs.mjs`。刷新会替换本目录快照，审查差异后提交。

2026-10-11 收尾复核：npm 官方 latest 的 next / eslint-config-next 均为 16.4.0，与当前包一致。[16.4 官方说明](https://nextjs.org/blog/next-16-4)介绍 Cache Components 与现有应用的 opt-in 迁移；本轮保留已有路由缓存/身份契约。官方另[预告 2026-10-14 安全更新](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026)，影响版本和升级细节将随发布给出；本次复核时该更新尚未发布，版本依据为当时 latest。
