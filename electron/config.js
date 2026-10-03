// Baked, NON-SECRET runtime config for the desktop build.
// These are URLs / model names / modes — safe to ship inside the .exe.
// Secrets and the user's 自由中转 URL/model are NEVER here; they are entered in
// the 设置 window and stored encrypted (DPAPI) in userData/keys.enc.
// Values mirror the project's .env.local (non-secret fields only). Edit & rebuild
// if your endpoints/models change.
module.exports = {
  // 固定本地服务端口 → 应用 origin 恒为 http://127.0.0.1:35349，使渲染进程的
  // IndexedDB / localStorage 在每次重启后都能读回（对话历史 / 技能 / 复习卡）。
  // 🔴 一旦发布就不可更改：端口变了 origin 就变，浏览器会按新 origin 给一份空存储，
  // 旧数据被永久孤立（这正是"重启后记录全没"的根因）。须与 package.json 的
  // dev/start 脚本（next -p 35349）保持一致，让网页端与桌面端同源。
  APP_PORT: 35349,
  ACCOUNT_BACKEND_URL: "https://account.1037solo.com",
  ACCOUNT_URL: "https://account.1037solo.com",
  AI_BASE_URL: "https://api.siliconflow.cn/v1",
  AI_MODEL_PRO: "Qwen/Qwen3.8-27B",
  AI_MODEL_FLASH: "z-ai/glm-5.3-flash",
  AI_REASONING_FIELD: "reasoning_content",
  MIMO_BASE_URL: "https://token-plan-cn.xiaomimimo.com/v1",
  AI_EMBEDDING_MODEL: "BAAI/bge-m3",
  AI_RERANK_MODEL: "BAAI/bge-reranker-v2-m3",
  AI_SEARCH_MODE: "hybrid",
  // Video CDN is client-inlined at BUILD time (NEXT_PUBLIC_*); kept here so the
  // build script can pass it to `next build`. Also harmless at runtime.
  NEXT_PUBLIC_VIDEO_CDN_BASE: "https://qimo1b-1392708216.cos.ap-nanjing.myqcloud.com",
};
