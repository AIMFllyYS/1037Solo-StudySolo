export interface SyncFailure {
    message: string;
    code?: string;
    status?: number;
    retryAfterMs?: number;
    retryable?: boolean;
}
export function retryAfterDelay(value: string | null, now = Date.now()): number {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const deadline = Date.parse(value);
    return Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
}
export function retryableFailure(error: SyncFailure): boolean {
    if (error.retryable !== undefined)
        return error.retryable;
    if (error.status !== undefined)
        return error.status === 429 || error.status >= 500;
    return !['QUOTA_EXCEEDED', 'CONTENT_LIMIT', 'INVALID_CONTENT', 'AUTH_REQUIRED', 'MFA_REQUIRED', 'CLIENT_UPGRADE_REQUIRED', 'REVISION_CONFLICT'].includes(error.code ?? '');
}
