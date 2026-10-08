// Mark the original error without changing SDK identity or exposing raw payloads.
// A paid attempt with an unknown outcome must not be replayed on another channel.
const uncertain = new WeakSet<object>();
export function markUncertainProviderOutcome(error: unknown) {
    if (error && typeof error === 'object')
        uncertain.add(error);
}
export function isUncertainProviderOutcome(error: unknown) { return !!error && typeof error === 'object' && uncertain.has(error); }
