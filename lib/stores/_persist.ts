import { create, type StateCreator } from "zustand";
import {
  persist,
  createJSONStorage,
  type PersistOptions,
  type PersistStorage,
  type StorageValue,
} from "zustand/middleware";
import { registerOwnerHydrator } from "@/lib/storage/ownerScope";
import { idbStorage } from "@/lib/storage/idbStorage";

export type PersistedStoreOptions<T> = {
  /** 必须与搬家前的 persist name 逐字相同，否则用户数据对不上。 */
  name: string;
  storage: "idb" | "local";
  version?: number;
  migrate?: PersistOptions<T, unknown>["migrate"];
  partialize?: PersistOptions<T, unknown>["partialize"];
  onRehydrateStorage?: PersistOptions<T, unknown>["onRehydrateStorage"];
};

/** IDB persist：把 JSON.stringify 推迟到 800ms 防抖落盘，避免笔记/闪卡每次 set 都卡主线程。 */
export function createLazyIdbJSONStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      const raw = await idbStorage.getItem(name);
      return raw ? (JSON.parse(raw) as StorageValue<S>) : null;
    },
    setItem: (name, value) => {
      idbStorage.setItemLazy(name, () => JSON.stringify(value));
    },
    removeItem: (name) => {
      void idbStorage.removeItem(name);
    },
  };
}

export function createPersistedStore<T>(
  initializer: StateCreator<T>,
  opts: PersistedStoreOptions<T>,
) {
  const storage =
    opts.storage === "idb"
      ? createLazyIdbJSONStorage()
      : createJSONStorage(() => localStorage);

  const store=create<T>()(
    persist(initializer, {
      name: opts.name,
      storage,
      ...(opts.version != null ? { version: opts.version } : {}),
      ...(opts.migrate ? { migrate: opts.migrate } : {}),
      ...(opts.partialize ? { partialize: opts.partialize } : {}),
      ...(opts.onRehydrateStorage ? { onRehydrateStorage: opts.onRehydrateStorage } : {}),
    }),
  );
  if(opts.storage==="idb")registerOwnerHydrator(async()=>{await store.persist.rehydrate();});
  return store;
}
