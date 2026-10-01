/**
 * Session 公开切片类型（ADR-0017）。
 * 不含密钥、xyflow 坐标、partial 文稿、布局比例。
 */

export type RecordingStatus = 'idle' | 'recording' | 'paused' | 'stopped'

export interface TranscriptCommittedSegment {
  id: string
  seq: number
  text: string
  startMs: number
  endMs: number
  rawText?:string
  correctionRevision?:number
}

export interface TranscriptPublic {
  /** Only the recording/importing device runs automatic paid analysis. */
  autoOrganize?:boolean
  sessionId: string | null
  recordingStatus: RecordingStatus
  committed: readonly TranscriptCommittedSegment[]
  committedVersion: number
  latestCommittedId: string | null
}

export interface OutlineDigestNode {
  id: string
  title: string
  /** 父节点 id，用于思维导图层级；顶层为 null/undefined。 */
  parentId?: string | null
  /** 来源文稿ID独立于节点身份，改名/移动节点不会破坏引用。 */
  sourceSegmentIds?: readonly string[]
  origin?:'ai'|'manual'
  locked?:boolean
}

export type OutlineProgress=Readonly<Record<string,{chars:number;fingerprint:string}>>

export interface NotesPublic {
  outlineVersion: number
  outlineDigest: readonly OutlineDigestNode[]
  processedSegments?:OutlineProgress
  organizerStatus?:'idle'|'queued'|'thinking'|'error'|'fallback'
  organizerError?:string
  organizedAt?:number
}

export interface SettingsPublic {
  asrConfigVersion: number
  aiConfigVersion: number
  hotwordsVersion: number
  asrReady: boolean
  aiReady: boolean
}

export type CommandSource = 'notes' | 'render' | 'agent' | 'settings' | 'system'

export type SessionCommand =
  | {
      type: 'transcript.scrollTo'
      segmentId: string
      source: CommandSource
    }
  | {
      type: 'transcript.highlight'
      segmentId: string
      source: CommandSource
    }
  | {
      type: 'asr.configChanged'
      source: 'settings'
    }
  | {
      type: 'ai.configChanged'
      source: 'settings'
    }
  | {
      type: 'session.reset'
      reason: 'new-recording' | 'user'
    }

export const P0_SESSION_COMMAND_TYPES = [
  'transcript.scrollTo',
  'transcript.highlight',
  'asr.configChanged',
  'ai.configChanged',
  'session.reset',
] as const

export type P0SessionCommandType = (typeof P0_SESSION_COMMAND_TYPES)[number]
