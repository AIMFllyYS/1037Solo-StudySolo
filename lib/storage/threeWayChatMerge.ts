import type { ChatMessage } from "@/lib/types/chat";

/** Conservative merge of two logical replacements against a common committed base. */
export function mergeChatSnapshots(base: ChatMessage[], local: ChatMessage[], remote: ChatMessage[]): ChatMessage[] | null {
  const mapOf = (rows: ChatMessage[]) => new Map(rows.map((row) => [row.id, row]));
  const baseById = mapOf(base), localById = mapOf(local), remoteById = mapOf(remote);
  if (baseById.size !== base.length || localById.size !== local.length || remoteById.size !== remote.length) return null;
  const same = (a: ChatMessage | undefined, b: ChatMessage | undefined) => JSON.stringify(a) === JSON.stringify(b);
  const chosen = new Map<string, ChatMessage>();
  for (const id of new Set([...baseById.keys(), ...localById.keys(), ...remoteById.keys()])) {
    const original = baseById.get(id), ours = localById.get(id), theirs = remoteById.get(id);
    if (!original) {
      if (ours && theirs && !same(ours, theirs)) return null;
      const added = ours ?? theirs;
      if (added) chosen.set(id, added);
      continue;
    }
    const localChanged = !same(ours, original), remoteChanged = !same(theirs, original);
    if (localChanged && remoteChanged && !same(ours, theirs)) return null;
    const kept = localChanged ? ours : remoteChanged ? theirs : ours;
    if (kept) chosen.set(id, kept);
  }
  // Preserve the local replacement's explicit order (including compact-summary
  // prelude). Insert remote-only additions relative to the surviving remote spine.
  const result = local.filter((row) => chosen.has(row.id)).map((row) => chosen.get(row.id)!);
  const placed = new Set(result.map((row) => row.id));
  for (let index = 0; index < remote.length; index++) {
    const row = remote[index];
    if (!chosen.has(row.id) || placed.has(row.id)) continue;
    let at = result.length;
    for (let next = index + 1; next < remote.length; next++) {
      const successor = result.findIndex((entry) => entry.id === remote[next].id);
      if (successor >= 0) { at = successor; break; }
    }
    result.splice(at, 0, chosen.get(row.id)!);
    placed.add(row.id);
  }
  return result;
}
