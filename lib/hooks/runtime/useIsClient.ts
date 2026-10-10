import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/** 客户端首帧即为 true，SSR / 水合前为 false。替代 `useEffect(() => setMounted(true), [])`。 */
export function useIsClient() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
