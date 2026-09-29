import { initialNotesPublic, notesPublicStore } from '../reads/notes'
import type { NotesPublic } from '../types'

export function patchNotesPublic(patch: Partial<NotesPublic>): void {
  notesPublicStore.setState((state) => {
    const nextDigest = patch.outlineDigest ?? state.outlineDigest
    const digestChanged = nextDigest !== state.outlineDigest
    return {
      outlineDigest: nextDigest,
      outlineVersion: digestChanged
        ? state.outlineVersion + 1
        : (patch.outlineVersion ?? state.outlineVersion),
    }
  })
}

export function resetNotesPublic(): void {
  notesPublicStore.setState(initialNotesPublic)
}
