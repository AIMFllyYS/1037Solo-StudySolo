import { getStorageOwner, getOwnerEpoch } from '@/lib/storage/ownerScope';
import { externalizePayload } from './body';
import type { CloudSyncKind, SyncDocumentRow } from '@/lib/sync/types';
import { retryAfterDelay } from '@/lib/sync/failure';
export class AssetRequestError extends Error {
    constructor(message: string, readonly status: number, readonly code: string, readonly retryAfterMs = 0) { super(message); }
}
export async function assetApi(path: string, init?: RequestInit) {
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    const headers = new Headers(init?.headers);
    if (owner)
        headers.set('x-study-file-owner', owner);
    headers.set('Content-Type', 'application/json');
    const response = await fetch(`/api/assets${path}`, { credentials: 'include', ...init, headers, signal: init?.signal ?? AbortSignal.timeout(60000) });
    const result = await response.json().catch(() => { throw new AssetRequestError('云端响应无法解析，原内容保留。', response.status, 'INVALID_RESPONSE'); });
    if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
        throw new AssetRequestError('账号已切换。', 409, 'OWNER_CHANGED');
    if (!response.ok)
        throw new AssetRequestError(result.error || '云端资产暂不可用。', response.status, result.code || 'ASSET_UNAVAILABLE', retryAfterDelay(response.headers.get('retry-after')));
    return result;
}
export async function writeAssetVersion(kind: CloudSyncKind, clientId: string, source: unknown, expectedRevision: number, mutationId = crypto.randomUUID()): Promise<SyncDocumentRow> {
    const owner = getStorageOwner(), epoch = getOwnerEpoch();
    const assertOwner = () => {
        if (owner !== getStorageOwner() || epoch !== getOwnerEpoch())
            throw new AssetRequestError('账号已切换。', 409, 'OWNER_CHANGED');
    };
    const { payload, chunks } = await externalizePayload(kind, source);
    assertOwner();
    const prepared = await assetApi('/versions', { method: 'POST', body: JSON.stringify({ operation: 'prepare', kind, clientId, expectedRevision, mutationId, payload, chunks: [...chunks].map(([sha256, bytes]) => ({ sha256, size: bytes.length })) }) });
    for (const item of prepared.chunks as {
        sha256: string;
        uploadUrl?: string;
    }[]) {
        assertOwner();
        if (!item.uploadUrl)
            continue;
        const bytes = chunks.get(item.sha256);
        if (!bytes)
            throw new AssetRequestError('正文块缺失。', 409, 'INVALID_CONTENT');
        const upload = await fetch(item.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'x-upsert': 'false' }, body: new Blob([bytes as Uint8Array<ArrayBuffer>]), signal: AbortSignal.timeout(60000) });
        if (!upload.ok)
            throw new AssetRequestError('正文上传失败，原内容保留，可重试。', upload.status, 'UPLOAD_FAILED');
    }
    assertOwner();
    return await assetApi('/versions', { method: 'POST', body: JSON.stringify({ operation: 'commit', mutationId }) });
}
export async function hydrateRemotePayload(kind: string, clientId: string, revision?: number): Promise<unknown> {
    return (await assetApi(`/body?${new URLSearchParams({ kind, clientId, ...(revision === undefined ? {} : { revision: String(revision) }) })}`)).payload;
}
