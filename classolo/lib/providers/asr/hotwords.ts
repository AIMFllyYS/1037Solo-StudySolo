import type { ASRCapabilities } from './types'

/**
 * Families that cannot take hotwords must omit them and keep start() usable.
 */
export function hotwordsForStart(
  capabilities: ASRCapabilities,
  words: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!capabilities.supportsHotwords) {
    return undefined
  }
  return words ?? []
}
