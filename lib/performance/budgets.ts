/** Engineering resource targets. These are not billing limits or data-retention limits. */
export interface ResourceBudgets {
  inactiveHotSessions: number
  hotMessageEstimatedBytes: number
  mountedPptxSlides: number
  pdfBitmapBytes: number
  syncInFlightJobs: number
  syncPendingPayloadBytes: number
  searchWorkers: number
  searchPendingJobs: number
  searchPendingBytes: number
  bodyFallbackCacheBytes: number
}

export const DEFAULT_RESOURCE_BUDGETS: Readonly<ResourceBudgets> = Object.freeze({
  inactiveHotSessions: 3,
  hotMessageEstimatedBytes: 32 * 1024 * 1024,
  mountedPptxSlides: 12,
  pdfBitmapBytes: 96 * 1024 * 1024,
  syncInFlightJobs: 6,
  syncPendingPayloadBytes: 16 * 1024 * 1024,
  searchWorkers: 1,
  searchPendingJobs: 16,
  searchPendingBytes: 4 * 1024 * 1024,
  bodyFallbackCacheBytes: 32 * 1024 * 1024,
})

export function resolveResourceBudgets(overrides: Partial<ResourceBudgets> = {}): Readonly<ResourceBudgets> {
  const next = {...DEFAULT_RESOURCE_BUDGETS, ...overrides}
  for (const [key, value] of Object.entries(next)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid resource budget: ${key}`)
  }
  return Object.freeze(next)
}
