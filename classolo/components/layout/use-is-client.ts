import { useSyncExternalStore } from 'react'

function subscribeEmpty() {
  return () => {}
}

/** Server + first client paint = false; after hydration = true. */
export function useIsClient() {
  return useSyncExternalStore(subscribeEmpty, () => true, () => false)
}
