import { resolveSecret, setUserSecretOverride } from '@/classolo/lib/providers/secrets'
import {
  getSettingsPublic,
  getTranscriptPublic,
  publishCommand,
} from '@/classolo/lib/session'
import type { RecordingStatus } from '@/classolo/lib/session'
import { patchSettingsPublic } from '@/classolo/lib/session/writes/settings'

import {
  parseExplicitAsrDraft,
  type AsrSettingsDraft,
} from './asr-config'
import { patchAsrPrivate } from './asr-private-store'

export interface AsrSaveResult {
  ok: boolean
  message: string
  appliesNextRecording: boolean
}

export function saveAsrSettings(
  draft: AsrSettingsDraft,
  recordingStatus: RecordingStatus = getTranscriptPublic().recordingStatus,
): AsrSaveResult {
  const parsed = parseExplicitAsrDraft(draft)
  if (!parsed.ok) {
    return { ok: false, message: parsed.message, appliesNextRecording: false }
  }
  patchAsrPrivate({
    family: parsed.family,
    dialect: parsed.dialect,
    baseUrl: parsed.baseUrl,
    model: parsed.model,
    sampleRate: String(parsed.sampleRate),
    apiKey: parsed.apiKey,
  })
  setUserSecretOverride('asr', parsed.apiKey || null)
  const secret = resolveSecret('asr')
  const recording = recordingStatus === 'recording'
  const current = getSettingsPublic()
  patchSettingsPublic({
    asrConfigVersion: current.asrConfigVersion + 1,
    asrReady: secret.value !== null,
  })
  publishCommand({ type: 'asr.configChanged', source: 'settings' })
  if (recording) {
    return {
      ok: true,
      message: '已保存。录音进行中，下次录音生效。',
      appliesNextRecording: true,
    }
  }
  return {
    ok: true,
    message: secret.value !== null ? '已保存 ASR 配置' : '已保存。缺密钥：未配置 ASR API key',
    appliesNextRecording: false,
  }
}
