import { create } from 'zustand';
import { onStorageOwnerChange } from '@/lib/storage/ownerScope';
type State = { byId: Record<string, { phase: 'running' | 'done' | 'error'; message: string }>; set: (id: string, phase: 'running' | 'done' | 'error', message: string) => void };
export const useCompactionState = create<State>(set => ({ byId: {}, set: (id, phase, message) => set(state => ({ byId: { ...state.byId, [id]: { phase, message } } })) }));
onStorageOwnerChange(() => useCompactionState.setState({ byId: {} }));
