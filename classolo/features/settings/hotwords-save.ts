import {
  mergeHotwords,
  parseCustomHotwordText,
  resolveHotwordPack,
  selectHotwordPack,
  setCustomHotwords,
} from '@/classolo/lib/providers/asr'
import {
  getSettingsPublic,
  getTranscriptPublic,
  publishCommand,
} from '@/classolo/lib/session'
import type { RecordingStatus } from '@/classolo/lib/session'
import { patchSettingsPublic } from '@/classolo/lib/session/writes/settings'

export interface HotwordsSaveDraft {
  packId: string
  customText: string
}

export interface HotwordsSaveResult {
  ok: boolean
  message: string
  appliesNextRecording: boolean
  hotwords: readonly string[]
}

export function saveHotwordSettings(
  draft: HotwordsSaveDraft,
  recordingStatus: RecordingStatus = getTranscriptPublic().recordingStatus,
): HotwordsSaveResult {
  try {
    selectHotwordPack(draft.packId)
  } catch {
    return {
      ok: false,
      message: '未知热词包',
      appliesNextRecording: false,
      hotwords: [],
    }
  }
  const custom = parseCustomHotwordText(draft.customText)
  setCustomHotwords(custom)
  const hotwords = mergeHotwords(resolveHotwordPack(draft.packId), custom)
  const current = getSettingsPublic()
  patchSettingsPublic({
    hotwordsVersion: current.hotwordsVersion + 1,
  })
  publishCommand({ type: 'asr.configChanged', source: 'settings' })
  const recording = recordingStatus === 'recording'
  if (recording) {
    return {
      ok: true,
      message: '已保存。录音进行中，下次录音生效。',
      appliesNextRecording: true,
      hotwords,
    }
  }
  return {
    ok: true,
    message: '已保存热词',
    appliesNextRecording: false,
    hotwords,
  }
}
