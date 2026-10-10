/**
 * 当前 ASR 工厂统一使用应用拥有的 /api/class/asr REST 代理与热词装配。
 * ASRConfig 保留协议族兼容类型；它不意味着客户端会选择旧直连 WebSocket 实现。
 * 业务代码从本入口与 types.ts 读取契约，凭据/准入/真实上游保持服务端归属。
 */
import { getCustomHotwords, mergeHotwords } from './custom-hotwords'
import { getSelectedHotwordPackId, resolveHotwordPack } from './hotword-packs'
import type { ASRConfig, ASRProvider } from './types'
import { OpenAiCompatibleTranscriptionsProvider } from './transcriptions-rest/openai-compatible'

export type {
  ASRCapabilities,
  ASRConfig,
  ASRFamily,
  ASRProvider,
  ASRSegment,
} from './types'
export { MissingAsrSecretError, MISSING_ASR_SECRET_MESSAGE } from './missing-secret'
export {
  DEFAULT_HOTWORD_PACK_ID,
  getSelectedHotwordPackId,
  listHotwordPacks,
  resetHotwordPackSelection,
  resolveHotwordPack,
  selectHotwordPack,
  subscribeHotwordPack,
  type HotwordPack,
} from './hotword-packs'
export { hotwordsForStart } from './hotwords'
export {
  getCustomHotwordText,
  getCustomHotwords,
  mergeHotwords,
  parseCustomHotwordText,
  resetCustomHotwords,
  setCustomHotwords,
  subscribeCustomHotwords,
} from './custom-hotwords'

export function withHotwordPack(config: ASRConfig): ASRConfig {
  const packTerms =
    config.hotwords !== undefined
      ? config.hotwords
      : [...resolveHotwordPack(getSelectedHotwordPackId())]
  return {
    ...config,
    hotwords: mergeHotwords(packTerms,config.hotwords===undefined?getCustomHotwords():[]),
  }
}

export function createASRProvider(_config:ASRConfig):ASRProvider {
  return new OpenAiCompatibleTranscriptionsProvider({...withHotwordPack(_config),family:'transcriptions-rest',dialect:'openai-compatible',baseUrl:'/api/class/asr',model:'classroom-asr',apiKey:'',sampleRate:16000});
}
