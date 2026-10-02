/** Discard delayed Class library reads when the verified account changes. */
export async function listSessionsForCurrentClassOwner<Db, Row>(
  owner: string,
  currentOwner: () => string | null,
  open: () => Promise<Db>,
  list: (db: Db) => Promise<Row[]>,
  currentEpoch?: () => number,
): Promise<Row[] | null> {
  const epoch = currentEpoch?.();
  const db = await open();
  if (currentOwner() !== owner || (currentEpoch && currentEpoch() !== epoch)) return null;
  const rows = await list(db);
  return currentOwner() === owner && (!currentEpoch || currentEpoch() === epoch) ? rows : null;
}

/** Replacement effects invalidate this cleanup before it can stop the new owner's capture. */
export async function releaseClassOwnerIfCurrent(options: {
  generation: { current: number };
  cleanupGeneration: number;
  owner: string | null;
  currentOwner: () => string | null;
  stop: () => Promise<unknown>;
  clear: () => void;
}): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
  if (options.generation.current !== options.cleanupGeneration) return;
  try { await options.stop(); }
  catch { /* still release this owner on unmount */ }
  if (options.generation.current === options.cleanupGeneration && options.currentOwner() === options.owner) options.clear();
}
