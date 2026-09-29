export const MISSING_ASR_SECRET_MESSAGE =
  '缺密钥：未配置 ASR API key（用户覆盖与运行时 env 均为空）' as const

type MissingKeyHint =
  typeof MISSING_ASR_SECRET_MESSAGE extends `${string}缺密钥${string}`
    ? true
    : never
const missingKeyHintOk: MissingKeyHint = true
void missingKeyHintOk

export class MissingAsrSecretError extends Error {
  readonly code = 'MISSING_ASR_SECRET' as const

  constructor() {
    super(MISSING_ASR_SECRET_MESSAGE)
    this.name = 'MissingAsrSecretError'
  }
}
