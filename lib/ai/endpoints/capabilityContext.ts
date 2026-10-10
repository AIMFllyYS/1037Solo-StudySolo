import { AsyncLocalStorage } from "node:async_hooks";
import {
  EMPTY_CAPABILITY_ENDPOINTS,
  normalizeCapabilityEndpoints,
  type CapabilityEndpoints,
} from "@/lib/ai/endpoints/capabilityEndpoints";

const store = new AsyncLocalStorage<CapabilityEndpoints>();

export function runWithCapabilityEndpoints<T>(raw: unknown, fn: () => T): T {
  return store.run(normalizeCapabilityEndpoints(raw), fn);
}

export function getCapabilityEndpoints(): CapabilityEndpoints {
  return store.getStore() ?? EMPTY_CAPABILITY_ENDPOINTS;
}
