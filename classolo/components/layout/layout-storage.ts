/**
 * react-resizable-panels `useDefaultLayout` defaults `storage` to the
 * `localStorage` identifier. That throws during SSR even inside `'use client'`.
 * Callers must still mount Group/Panel only after hydration — getItem on the
 * client returns persisted sizes that do not match the SSR default layout.
 */
export const layoutStorage = {
  getItem(key: string): string | null {
    if (typeof localStorage === 'undefined') return null
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem(key: string, value: string): void {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem(key, value)
    } catch {
      // private-mode / quota
    }
  },
}
