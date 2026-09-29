/**
 * 密钥解析（ADR-0013）。本目录是密钥读取的唯一入口。
 * 业务代码禁止直接读 process.env 里的 API key 字段，禁止把密钥写入 PGlite。
 *
 * 优先级（高 → 低）：用户在应用内配置 > 运行时 env > 未配置。
 */
export type SecretSource = 'user' | 'env' | 'none'

export type SecretKind = 'ai' | 'asr' | 'image-search'

export interface ResolvedSecret {
  kind: SecretKind
  /** 明文只存在内存；禁止 log / 禁止进 store 的可序列化快照 */
  value: string | null
  source: SecretSource
}
