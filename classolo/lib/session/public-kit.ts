import {
  getNotesPublic,
  subscribeNotesPublic,
} from './reads/notes'
import {
  getSettingsPublic,
  subscribeSettingsPublic,
} from './reads/settings'
import { publishCommand, subscribeCommands } from './commands'
import { getRenderMessages, subscribeRenderProjection } from './reads/render'
import {
  getTranscriptPublic,
  subscribeTranscriptPublic,
} from './reads/transcript'
import type { NotesPublic, SettingsPublic, TranscriptPublic } from './types'

const requiredTranscriptKeys = [
  'sessionId',
  'recordingStatus',
  'committed',
  'committedVersion',
  'latestCommittedId',
] as const satisfies readonly (keyof TranscriptPublic)[]

const requiredNotesKeys = [
  'outlineVersion',
  'outlineDigest',
] as const satisfies readonly (keyof NotesPublic)[]

const requiredSettingsKeys = [
  'asrConfigVersion',
  'aiConfigVersion',
  'hotwordsVersion',
  'asrReady',
  'aiReady',
] as const satisfies readonly (keyof SettingsPublic)[]

type MissingKeys<T, K extends readonly (keyof T)[]> = Exclude<
  keyof T,
  K[number]
>
type TranscriptComplete = MissingKeys<
  TranscriptPublic,
  typeof requiredTranscriptKeys
> extends never
  ? true
  : never
type NotesComplete = MissingKeys<
  NotesPublic,
  typeof requiredNotesKeys
> extends never
  ? true
  : never
type SettingsComplete = MissingKeys<
  SettingsPublic,
  typeof requiredSettingsKeys
> extends never
  ? true
  : never

const slicesComplete: TranscriptComplete & NotesComplete & SettingsComplete =
  true
void slicesComplete

/**
 * P0-INF-02 public kit. Missing a slice getter fails `pnpm tsc --noEmit`.
 * Non-React subscribers are the supported cross-feature path (ADR-0017).
 */
type PublicExports = typeof import('./index')
type ForbiddenWriteExport =
  | 'appendCommitted'
  | 'patchTranscriptPublic'
  | 'patchNotesPublic'
  | 'patchSettingsPublic'
  | 'resetTranscriptPublic'
  | 'resetNotesPublic'
  | 'resetSettingsPublic'
  | 'upsertRenderMessage'
  | 'revokeRenderMessage'
  | 'resetRenderProjection'
type LeakedWrite = Extract<keyof PublicExports, ForbiddenWriteExport>
const writesStayPrivate: [LeakedWrite] extends [never] ? true : never = true
void writesStayPrivate

export const sessionPublicKit = {
  getTranscriptPublic,
  subscribeTranscriptPublic,
  getNotesPublic,
  subscribeNotesPublic,
  getSettingsPublic,
  subscribeSettingsPublic,
  getRenderMessages,
  subscribeRenderProjection,
  publishCommand,
  subscribeCommands,
}

export type SessionPublicKit = typeof sessionPublicKit
