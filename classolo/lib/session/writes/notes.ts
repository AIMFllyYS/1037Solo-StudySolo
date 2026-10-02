import { initialNotesPublic, notesPublicStore } from '../reads/notes'
import type { NotesPublic } from '../types'

export function patchNotesPublic(patch: Partial<NotesPublic>): void {
  notesPublicStore.setState((state) => {
    const nextDigest = patch.outlineDigest ?? state.outlineDigest
    const digestChanged = nextDigest !== state.outlineDigest
    const progressChanged=patch.processedSegments!==undefined&&patch.processedSegments!==state.processedSegments
    return {
      ...state,...patch,
      outlineDigest: nextDigest,
      outlineVersion: patch.outlineVersion ?? (digestChanged||progressChanged ? state.outlineVersion + 1 : state.outlineVersion),
    }
  })
}

export function resetNotesPublic(): void {
  notesPublicStore.setState(initialNotesPublic,true)
}
