// IndexedDB 存储适配器 —— 为 zustand persist 中间件提供异步 StateStorage。
// 替代 localStorage 存储对话历史与交互演示 artifact，容量数百 MB，重启不丢失。
//
// 设计要点：
// 1. 单库单 store（gailvlun-db/keyval），所有持久化 key 同库共存，便于统一清理/导出。
// 2. 透明迁移：getItem 首次读不到 IndexedDB 时回退读旧 localStorage 并播种，幂等安全。
// 3. SSR 安全：所有方法在 typeof window === "undefined" 时降级返回 null/no-op。
// 4. 隐私模式/禁用 IndexedDB 时降级为 no-op，内存态仍可用（同 localStorage 失败行为）。

import {ownedStorageKey,getStorageOwner} from "./ownerScope";
import { createStore, get as idbGet, set as idbSet, del as idbDel, keys as idbKeys } from "idb-keyval";

// ── 常量（单一真相源）────────────────────────────────────────────
const DB_NAME = "gailvlun-db";
const STORE_NAME = "keyval";

/** 各持久化 key 集中定义，禁止散落硬编码。 */
export const PERSIST_KEYS = {
  chatHistory: "chat-history",
  chatManifest: "chat-manifest",
  artifacts: "artifacts",
  skills: "skills",
  reviewCards: "review-cards",
  imageGen: "image-gen",
  billingHistory: "billing-history",
  documents: "documents",
  userNotes: "user-notes",
  /** Agent 的本地导入记录（文件绝对路径 / 网址快捷方式），不上云。 */
  imports: "agent-imports",
  /** 项目文件的本地索引与切片（不上云）。 */
  projectFiles: "project-files",
  /** 笔记变更候选稿的幂等账本（已应用 / 已取消的 proposalId，不上云）。 */
  noteChangeProposals: "note-change-proposals",
  /** Agent 定时任务定义与运行历史（不上云）。 */
  scheduledTasks: "scheduled-tasks",
} as const;

export const CHAT_SESSION_KEY_PREFIX = "chat-session:";
export const CHAT_BLOB_KEY_PREFIX = "chat-blob:";

export function chatSessionKey(sessionId: string): string {
  return `${CHAT_SESSION_KEY_PREFIX}${sessionId}`;
}

export function chatBlobKey(blobId: string): string {
  return `${CHAT_BLOB_KEY_PREFIX}${blobId}`;
}

// 专属 IDB store 实例（非默认 keyval-store 库）
const idbStore = createStore(DB_NAME, STORE_NAME);

// ── SSR / 环境守卫 ──────────────────────────────────────────────
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

// ── 写入防抖（根治流式 OOM）────────────────────────────────────
// zustand persist 每次 set() 都会同步 JSON.stringify(整段状态) 并调 setItem 写盘。
// 流式对话每 token 一次 updateMessage → 每 token 写一次「整段 chat-history」。无防抖时
// 每次 setItem 都 `await idbSet(...)`（异步），高频 token 下大量写入并发在飞、各自持有
// 一份不断变大的历史字符串 → O(n²) 活跃内存 → 渲染进程 OOM（调试器实证断在此 setItem）。
// 方案：按 key 尾随防抖，最新值胜出，高频写合并为一次；页面卸载/隐藏时立即落盘，零丢失。
/** 流式持久化写盘防抖间隔（测试与文档引用）。 */
export const WRITE_DEBOUNCE_MS = 800;
type PendingValue = string | (() => string);
const pendingValues = new Map<string, PendingValue>();
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function writeNow(name: string, value: string): Promise<boolean> {
  try {
    await idbSet(name, value, idbStore);
    return true;
  } catch {
    try {
      localStorage.setItem(name, value);
      return true;
    } catch {
      return false;
    }
  }
}

function flushKey(name: string): void {
  const timer = pendingTimers.get(name);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(name);
  }
  const value = pendingValues.get(name);
  if (value === undefined) return;
  pendingValues.delete(name);
  void writeNow(name, typeof value === "function" ? value() : value);
}

/** 立即落盘所有挂起的写（卸载/隐藏/清空时调用）。 */
export function flushPendingWrites(): void {
  for (const name of [...pendingValues.keys()]) flushKey(name);
}

/** 立即写入并等待完成；用于迁移这类必须知道成功/失败的数据安全路径。 */
export async function setItemNow(name: string, value: string): Promise<boolean> {
  if (!isBrowser()) return false;
  const scoped=ownedStorageKey(name);if(!scoped)return false;name=scoped;
  const timer = pendingTimers.get(name);
  if (timer) {
    clearTimeout(timer);
    pendingTimers.delete(name);
  }
  pendingValues.delete(name);
  return writeNow(name, value);
}

/** 测试专用：清空挂起队列与计时器（node:test 用）。 */
export function __resetIdbStoragePendingForTests(): void {
  for (const timer of pendingTimers.values()) clearTimeout(timer);
  pendingTimers.clear();
  pendingValues.clear();
}

if (typeof window !== "undefined") {
  const flush = () => flushPendingWrites();
  window.addEventListener("pagehide", flush);
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

// ── zustand StateStorage 适配 ────────────────────────────────────
export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    if (!isBrowser()) return null;
    const owner=getStorageOwner();const scoped=ownedStorageKey(name);if(!scoped)return null;name=scoped;
    // 命中尚未落盘的最新值，避免「写后立即读」拿到旧数据
    const pending = pendingValues.get(name);
    if (pending !== undefined) return typeof pending === "function" ? pending() : pending;
    try {
      // 1. 先读 IndexedDB
      const val = await idbGet<string>(name, idbStore);
      if(getStorageOwner()!==owner)return null;
      if (val != null) return val;

      // 2. IndexedDB 无 → 回退读旧 localStorage（透明迁移）
      const legacy = localStorage.getItem(name);
      if (legacy != null) {
        // 播种到 IndexedDB，下次直接命中
        await idbSet(name, legacy, idbStore);
        // 释放旧 localStorage 空间
        localStorage.removeItem(name);
        return legacy;
      }
      return null;
    } catch {
      // IndexedDB 不可用（隐私模式等）→ 尝试 localStorage 兜底
      try {
        return localStorage.getItem(name);
      } catch {
        return null;
      }
    }
  },

  // 防抖写：仅暂存最新值并重置计时；真正落盘在 WRITE_DEBOUNCE_MS 后或卸载时。
  // 返回 void（同步调度）——persist 不依赖其完成，避免每 token 一次真实 IDB 写。
  setItem(name: string, value: string): void {
    if (!isBrowser()) return;
    const scoped=ownedStorageKey(name);if(!scoped)return;name=scoped;
    pendingValues.set(name, value);
    const existing = pendingTimers.get(name);
    if (existing) clearTimeout(existing);
    pendingTimers.set(name, setTimeout(() => flushKey(name), WRITE_DEBOUNCE_MS));
  },

  /** Coalesce before serialization; a bounded checkpoint also runs during uninterrupted streams. */
  setItemLazy(name: string, serialize: () => string): void {
    if (!isBrowser()) return;
    const scoped=ownedStorageKey(name);if(!scoped)return;name=scoped;
    pendingValues.set(name, serialize);
    if (!pendingTimers.has(name)) {
      pendingTimers.set(name, setTimeout(() => flushKey(name), WRITE_DEBOUNCE_MS));
    }
  },

  async removeItem(name: string): Promise<void> {
    if (!isBrowser()) return;
    const scoped=ownedStorageKey(name);if(!scoped)return;name=scoped;
    // 取消尚未落盘的写，避免删除后又被旧值覆盖回来
    const timer = pendingTimers.get(name);
    if (timer) {
      clearTimeout(timer);
      pendingTimers.delete(name);
    }
    pendingValues.delete(name);
    try {
      await idbDel(name, idbStore);
    } catch {
      // ignore
    }
    // 同时清除可能残留的 localStorage 旧 key
    try {
      localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

/** 枚举 IDB + 未落盘 pending + localStorage 兜底键，供 GC 使用。 */
export async function listPersistedKeys(): Promise<string[]> {
  const found = new Set<string>(pendingValues.keys());
  if (!isBrowser()) return [...found];
  try {
    const all = await idbKeys(idbStore);
    for (const key of all) {
      if (typeof key === "string") found.add(key);
    }
  } catch {
    // IndexedDB 不可用时走 localStorage
  }
  try {
    const n = localStorage.length;
    for (let i = 0; i < n; i += 1) {
      const key = localStorage.key(i);
      if (key) found.add(key);
    }
  } catch {
    // ignore
  }
  const owner=getStorageOwner();if(!owner)return [];
  const prefix=`ss-user:${owner}:`;
  return [...found].filter(key=>key.startsWith(prefix)).map(key=>key.slice(prefix.length));
}
