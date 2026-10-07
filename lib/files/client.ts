import { assertFileSize, type CloudFile, type ProcessedFile } from './contract';
import { getOwnerEpoch, getStorageOwner } from '@/lib/storage/ownerScope';
import { z } from 'zod';
import { notifyCloudFileChange } from './events';
const fileSchema = z.object({ id: z.string().uuid(), name: z.string().min(1).max(300), mime_type: z.string().max(150), size_bytes: z.coerce.number().int().min(1).max(25 * 1024 * 1024), project_id: z.string().nullable().optional().default(null), state: z.enum(['pending','ready','deleted','failed']), created_at: z.string().datetime({ offset: true }), deleted_at: z.string().datetime({ offset: true }).nullable().optional().default(null) });
const bytes = z.union([z.string().regex(/^\d+$/), z.number().int().nonnegative()]).transform(String).refine(value => Number.isSafeInteger(Number(value)));
const storageSchema = z.object({ used_bytes: bytes, reserved_bytes: bytes, capacity_bytes: bytes });
const pageSchema = z.object({ files: z.array(fileSchema), nextCursor: z.string().uuid().nullable(), storage: storageSchema.nullable().optional() });
const preparedSchema = z.object({ id: z.string().uuid(), uploadUrl: z.string().url(), processedUploadUrl: z.string().url() });

async function api(path: string, init?: RequestInit) {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const headers = new Headers(init?.headers);
  if (owner) headers.set('x-study-file-owner', owner);
  const response = await fetch(`/api/files${path}`, { credentials: 'include', ...init, headers });
  const data = await response.json().catch(() => { throw new Error('云端文件响应格式不正确，请重试。'); });
  if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error('账号已切换，文件操作已停止。');
  if (!response.ok) throw new Error(data.error || '云端文件暂不可用，请重试。');
  return data;
}
export async function uploadCloudFile(file: File, processed: ProcessedFile, projectId?: string): Promise<CloudFile> {
  assertFileSize(file.size);
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const assertOwner = () => { if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error('账号已切换，文件操作已停止。'); };
  const source = new Uint8Array(await file.arrayBuffer());
  const digest = await crypto.subtle.digest('SHA-256', source);
  const sha256 = [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, '0')).join('');
  const derived = new Blob([JSON.stringify(processed)], { type: 'application/json' });
  const processedDigest = await crypto.subtle.digest('SHA-256', await derived.arrayBuffer());
  const processedSha256 = [...new Uint8Array(processedDigest)].map(x => x.toString(16).padStart(2, '0')).join('');
  assertOwner();
  const prepared = preparedSchema.parse(await api('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, sha256, projectId, processedSize: derived.size, processedSha256 }) }));
  assertOwner();
  notifyCloudFileChange(prepared.id, 'pending');
  const derivedUpload = await fetch(prepared.processedUploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-upsert': 'false' }, body: derived });
  if (!derivedUpload.ok) throw new Error('文件处理结果上传失败，可在云端文件中清理未完成上传后重试。');
  assertOwner();
  // The signed URL is scoped to this new object; no service credential enters the browser.
  const upload = await fetch(prepared.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'false' }, body: file });
  if (!upload.ok) {
    await deleteCloudFile(prepared.id).catch(() => {});
    throw new Error('文件上传失败，原文件仍在本机，请重试。');
  }
  assertOwner();
  const confirmed = fileSchema.parse((await api(`/${prepared.id}`, { method: 'POST' })).file);
  assertOwner();
  notifyCloudFileChange(confirmed.id, 'ready');
  return confirmed;
}
export async function loadCloudFileLibrary(projectId?: string): Promise<{ files: CloudFile[]; storage: CloudStorageUsage | null }> {
  const owner = getStorageOwner(), epoch = getOwnerEpoch();
  const files: CloudFile[] = [];
  let cursor: string | null = null;
  let storage: CloudStorageUsage | null = null;
  const seen = new Set<string>();
  do {
    const params = new URLSearchParams();
    if (projectId) params.set('projectId', projectId);
    if (cursor) params.set('cursor', cursor);
    const parsed = pageSchema.safeParse(await api(`?${params}`));
    if (!parsed.success) throw new Error('云文件列表或额度格式不正确，未采用不完整数据，请重试。');
    const result = parsed.data;
    if (getStorageOwner() !== owner || getOwnerEpoch() !== epoch) throw new Error('账号已切换，文件读取已停止。');
    if (!cursor) storage = result.storage ?? null;
    files.push(...result.files); cursor = result.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error('云文件分页返回重复游标，未使用不完整列表，请重试。');
    if (cursor) seen.add(cursor);
  } while (cursor);
  return { files: files.sort((a, b) => b.created_at.localeCompare(a.created_at)), storage };
}
export interface CloudStorageUsage { used_bytes: string; reserved_bytes: string; capacity_bytes: string }
export async function listCloudFiles(projectId?: string): Promise<CloudFile[]> { return (await loadCloudFileLibrary(projectId)).files; }
export async function deleteCloudFile(id: string): Promise<void> {
  await api(`/${id}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmed: true }) });
  notifyCloudFileChange(id, 'delete');
}
export async function completePendingCloudFile(id: string): Promise<void> { await api(`/${id}`, { method: 'POST' }); notifyCloudFileChange(id, 'ready'); }
export async function readCloudFileContext(id: string): Promise<ProcessedFile> { return (await api(`/${id}?context=1`)).processed; }
