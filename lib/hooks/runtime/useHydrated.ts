// 通用水合状态 hook —— 订阅任意 zustand persist store 的水合完成事件。
// 用于异步存储（IndexedDB）场景：首屏 store 为空，水合完成后才有数据。
// 消费方据此门控输入，避免水合前抢跑导致状态冲突。
//
// 参照 Zustand 官方 FAQ: https://zustand.docs.pmnd.rs/reference/integrations/persisting-store-data

import { useSyncExternalStore } from "react";

type PersistableStore = {
  persist: {
    hasHydrated: () => boolean;
    onHydrate: (cb: () => void) => () => void;
    onFinishHydration: (cb: () => void) => () => void;
  };
};

/**
 * 返回目标 persist store 是否已完成水合（从 IndexedDB 恢复数据）。
 * false = 仍在加载，true = 可安全读写。
 */
export function useHydrated<T extends PersistableStore>(store: T): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      const unsubHydrate = store.persist.onHydrate(onStoreChange);
      const unsubFinish = store.persist.onFinishHydration(onStoreChange);
      return () => {
        unsubHydrate();
        unsubFinish();
      };
    },
    () => store.persist.hasHydrated(),
    () => false, // SSR 快照：服务端无 IndexedDB，返回 false 与客户端首帧一致
  );
}
