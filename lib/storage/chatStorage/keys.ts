// ── Storage v3：轮次分块 + spine ──────────────────────────────────
// v2 把整段会话塞进一个 `chat-session:{id}` blob：读 = 全量 parse + normalize + compact，
// 写 = 每次 flush 全量 stringify（100MB 级会话单次 ~100ms 主线程，流式期间每 800ms 一次）。
// v3 布局：
//   chat-s3:{id}:h      head：{ v:3, messageCount, turnCount, chunkCount, spine }
//   chat-s3:{id}:c:{n}  第 n 个 chunk 的消息数组（每 chunk 固定 TURNS_PER_CHUNK 轮）
// 流式追加只重写尾部 chunk + head；「加载更早 / 定位点跳转」按轮次区间读少数 chunk；
// loadSessionMessages 仍返回全量装配结果，全量消费方（sync/导出/GC/请求构造）零改动。

export const CHAT_S3_KEY_PREFIX = 'chat-s3:';

export function chatHeadKey(sessionId: string): string {
  return `${CHAT_S3_KEY_PREFIX}${sessionId}:h`;
}
export function chatChunkKey(sessionId: string, chunk: number): string {
  return `${CHAT_S3_KEY_PREFIX}${sessionId}:c:${chunk}`;
}
export function chatS3Prefix(sessionId: string): string {
  return `${CHAT_S3_KEY_PREFIX}${sessionId}:`;
}
