import { collectMessageSourceRounds, traceSourceKey, type SourceRound, type TraceSource } from "@/lib/chat/sources/traceSources";
import { collectSessionProducts, type AgentProductKind } from "@/lib/chat/session/sessionProducts";
import { collectMessageImages, type AgentImageItem } from "@/lib/agent/sessionImages";
import { getMessageText } from "@/lib/chat/messages/messageParts";
import { STUDY_TOOL_NAMES } from "@/lib/ai/agent/tools/names";
import { estimateTokens } from "@/lib/context/estimateTokens";
import { loadSessionSummaryHead, loadTurnsBefore } from "./chatStorage";
import { idbStorage } from "./idbStorage";
import { getOwnerEpoch, getStorageOwner, onStorageOwnerChange } from "./ownerScope";

export interface SummarySourceRef { messageId: string; messageIndex: number; turn: number; round: SourceRound }
export interface SummaryProductRef { messageId: string; messageIndex: number; turn: number; kind: AgentProductKind; id: string; title: string; detail: string }
export interface SummaryImageRef { messageId: string; messageIndex: number; turn: number; item: AgentImageItem }
export interface SummaryUnknownToolRef { messageId: string; messageIndex: number; turn: number; partIndex: number; type: string }
export interface SessionSummary {
  schemaVersion: 1;
  sessionId: string;
  sourceRevision: number;
  sourceRefs: SummarySourceRef[];
  productRefs: SummaryProductRef[];
  imageRefs: SummaryImageRef[];
  unknownToolRefs: SummaryUnknownToolRef[];
  tokenEstimate: number;
  turnTokenEstimates: number[];
  estimatedBytes: number;
}

const BATCH_TURNS = 8;
const knownTools = new Set<string>(STUDY_TOOL_NAMES);
const SUMMARY_CACHE_BYTES = 8 * 1024 * 1024;
const SUMMARY_CACHE_COUNT = 8;
const cache = new Map<string, { value: SessionSummary; bytes: number }>();
const inFlight = new Map<string, Promise<SessionSummary | null>>();
let cacheBytes = 0;
onStorageOwnerChange(() => { cache.clear(); inFlight.clear(); cacheBytes = 0; });

function cacheKey(owner: string, sessionId: string, revision: number): string { return `${owner}:${sessionId}:${revision}`; }
function storageKey(sessionId: string): string { return `session-summary:${sessionId}`; }
function current(owner: string, epoch: number, signal?: AbortSignal): void {
  signal?.throwIfAborted();
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error("session_summary_owner_changed");
}
function remember(key: string, value: SessionSummary): void {
  const bytes = JSON.stringify(value).length * 2;
  const existing = cache.get(key);
  if (existing) { cacheBytes -= existing.bytes; cache.delete(key); }
  if (bytes > SUMMARY_CACHE_BYTES) return;
  cache.set(key, { value, bytes }); cacheBytes += bytes;
  while (cache.size > SUMMARY_CACHE_COUNT || cacheBytes > SUMMARY_CACHE_BYTES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cacheBytes -= cache.get(oldest)!.bytes; cache.delete(oldest);
  }
}

async function build(sessionId: string, revision: number, owner: string, epoch: number, signal?: AbortSignal): Promise<SessionSummary | null> {
  const head = await loadSessionSummaryHead(sessionId);
  current(owner, epoch, signal);
  if (!head || head.revision !== revision) return null;
  const sourceRefs: SummarySourceRef[] = [], productRefs: SummaryProductRef[] = [], imageRefs: SummaryImageRef[] = [], unknownToolRefs: SummaryUnknownToolRef[] = [];
  const seenSources = new Set<string>(), seenProducts = new Set<string>(), seenImages = new Set<string>();
  let tokenEstimate = 0, estimatedBytes = 0;
  const turnTokenEstimates = new Array<number>(head.spine.length).fill(0);
  for (let start = 0; start < head.spine.length; start += BATCH_TURNS) {
    const end = Math.min(start + BATCH_TURNS, head.spine.length);
    const window = await loadTurnsBefore(sessionId, end, end - start);
    current(owner, epoch, signal);
    if (!window) return null;
    let turn = start;
    for (let offset = 0; offset < window.messages.length; offset++) {
      const message = window.messages[offset];
      const index = window.startIndex + offset;
      while (turn + 1 < end && head.spine[turn + 1].firstIndex <= index) turn++;
      const text = getMessageText(message);
      const tokens = estimateTokens(text);
      tokenEstimate += tokens;
      turnTokenEstimates[turn] += tokens;
      estimatedBytes += text.length * 2;
      message.parts.forEach((part, partIndex) => {
        const name = part.type === "dynamic-tool" && "toolName" in part
          ? String(part.toolName)
          : part.type.startsWith("tool-") ? part.type.slice(5) : null;
        if (name && !knownTools.has(name)) unknownToolRefs.push({ messageId: message.id, messageIndex: index, turn, partIndex, type: part.type });
      });
      for (const round of collectMessageSourceRounds(message.parts)) {
        const id = `${index}:${round.id}`;
        const sources: TraceSource[] = [];
        for (const source of round.sources) {
          const key = traceSourceKey(source);
          if (key && seenSources.has(key)) continue;
          if (key) seenSources.add(key);
          sources.push({ ...source, snippet: source.snippet.slice(0, 500), query: round.query, roundId: id });
        }
        if (sources.length) sourceRefs.push({ messageId: message.id, messageIndex: index, turn, round: { ...round, id, sources } });
      }
      for (const product of collectSessionProducts([message])) {
        const key = `${product.kind}:${product.id}`;
        if (seenProducts.has(key)) continue;
        seenProducts.add(key);
        productRefs.push({ messageId: message.id, messageIndex: index, turn, kind: product.kind, id: product.id, title: product.title, detail: product.detail });
      }
      for (const item of collectMessageImages(message.parts)) {
        if (seenImages.has(item.src)) continue;
        seenImages.add(item.src);
        imageRefs.push({ messageId: message.id, messageIndex: index, turn, item });
      }
    }
    // Allow input/paint and owner abort between bounded 8-turn reads.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    current(owner, epoch, signal);
  }
  const latest = await loadSessionSummaryHead(sessionId);
  current(owner, epoch, signal);
  if (!latest || latest.revision !== revision) return null;
  return { schemaVersion: 1, sessionId, sourceRevision: revision, sourceRefs, productRefs, imageRefs, unknownToolRefs, tokenEstimate, turnTokenEstimates, estimatedBytes };
}

/** Rebuildable derived view; never changes authoritative chat chunks. */
export async function loadSessionSummary(sessionId: string, signal?: AbortSignal): Promise<SessionSummary | null> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  if (!owner) return null;
  const head = await loadSessionSummaryHead(sessionId);
  current(owner, epoch, signal);
  if (!head) return null;
  const key = cacheKey(owner, sessionId, head.revision);
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); return hit.value; }
  const existing = inFlight.get(key);
  if (existing) return existing;
  const task = (async () => {
    const raw = await idbStorage.getItem(storageKey(sessionId));
    current(owner, epoch, signal);
    if (raw) {
      try {
        const saved = JSON.parse(raw) as SessionSummary;
        if (saved.schemaVersion === 1 && saved.sessionId === sessionId && saved.sourceRevision === head.revision && Array.isArray(saved.turnTokenEstimates) && Array.isArray(saved.unknownToolRefs)) {
          remember(key, saved); return saved;
        }
      } catch { /* derived data can always be rebuilt */ }
    }
    const summary = await build(sessionId, head.revision, owner, epoch, signal);
    if (!summary) return null;
    remember(key, summary);
    idbStorage.setItem(storageKey(sessionId), JSON.stringify(summary));
    return summary;
  })();
  inFlight.set(key, task);
  try { return await task; }
  finally { if (inFlight.get(key) === task) inFlight.delete(key); }
}

export function sessionSummaryCacheStats(): { entries: number; bytes: number; pending: number } {
  return { entries: cache.size, bytes: cacheBytes, pending: inFlight.size };
}
