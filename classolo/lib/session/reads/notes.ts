import { useStore } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import type { NotesPublic } from '../types'

export const initialNotesPublic: NotesPublic = {
  outlineVersion: 0,
  outlineDigest: [],
}

export const notesPublicStore = createStore(
  subscribeWithSelector<NotesPublic>(() => initialNotesPublic),
)

export function getNotesPublic(): NotesPublic {
  return notesPublicStore.getState()
}

export function subscribeNotesPublic<T>(
  selector: (state: NotesPublic) => T,
  listener: (selected: T, previous: T) => void,
): () => void {
  return notesPublicStore.subscribe(selector, listener)
}

export function useNotesPublic<T>(selector: (state: NotesPublic) => T): T {
  return useStore(notesPublicStore, selector)
}
