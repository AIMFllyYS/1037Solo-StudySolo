import { optionalPaidContext } from '@/lib/billing/paidContext';
const responses = new Map<string, {
    status: number;
    contentType: string | null;
}>();
const key = (channel: string) => `${optionalPaidContext()?.requestId ?? 'unbilled'}:${channel}`;
/** Metadata only. Never collect bodies, URLs, request headers or error messages. */
export function modelDiagnosticFetch(fetchImpl: typeof fetch, channel: string): typeof fetch {
    return async (input, init) => {
        try {
            const response = await fetchImpl(input, init);
            responses.set(key(channel), { status: response.status, contentType: response.headers.get('content-type')?.split(';')[0].slice(0, 80) ?? null });
            while (responses.size > 128)
                responses.delete(responses.keys().next().value!);
            return response;
        }
        catch (error) {
            recordModelFailure(channel, 'network', error);
            throw error;
        }
    };
}
export function recordModelFailure(channel: string, stage: 'network' | 'stream' | 'generate', error: unknown): void {
    const name = error && typeof error === 'object' ? String((error as {
        name?: unknown;
    }).name ?? '') : '';
    const category = /TypeValidation/.test(name) ? 'FIELD_VALIDATION' : /JSONParse/.test(name) ? 'RESPONSE_PARSE' : /Timeout/.test(name) ? 'TIMEOUT' : /Abort/.test(name) ? 'ABORTED' : 'PROVIDER_FAILURE';
    console.warn('[model-diagnostic]', JSON.stringify({ requestId: optionalPaidContext()?.requestId ?? null, channel: channel.slice(0, 100), stage, category, ...responses.get(key(channel)) }));
}
