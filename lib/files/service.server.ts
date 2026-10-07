import { createHash } from 'node:crypto';
import { createServiceAuthClient } from '@/lib/auth/serviceClient';
import { FILE_BUCKET, FILE_QUOTA_MESSAGE, type ProcessedFile } from './contract';
import { FileError } from './owner.server';
import { z } from 'zod';
const processedSchema = z.object({ v: z.literal(1), text: z.string().max(32 * 1024 * 1024).optional(), image: z.object({ dataUrl: z.string().max(12 * 1024 * 1024).regex(/^data:image\/(?:jpeg|png|gif|webp);base64,[A-Za-z0-9+/=]+$/), mimeType: z.enum(['image/jpeg','image/png','image/gif','image/webp']) }).optional(), note: z.string().max(2000).optional() });

export async function ownedFileCatalog(owner: string, ids: string[]) {
  const rows: Array<{ id: string; name: string; state: string }> = [];
  const unique = [...new Set(ids)];
  for (let index = 0; index < unique.length; index += 100) {
    const result = await createServiceAuthClient().from('ss_user_files').select('id,name,state').eq('user_id', owner).in('id', unique.slice(index, index + 100));
    if (result.error) throw new FileError('云端文件目录读取失败，原对话已保留。', 503);
    rows.push(...result.data);
  }
  return rows;
}

export async function ownedFile(owner: string, id: string) {
  const result = await createServiceAuthClient().from('ss_user_files').select('*').eq('user_id', owner).eq('id', id).maybeSingle();
  if (result.error) throw new FileError('云端文件服务尚未就绪或暂不可用。', 503);
  if (!result.data || result.data.state === 'deleted' || result.data.state === 'failed') throw new FileError('文件已删除或无权访问。', 404);
  return result.data;
}
export async function loadProcessedFile(owner: string, id: string): Promise<ProcessedFile> {
  const row = await ownedFile(owner, id);
  if (row.state !== 'ready') throw new FileError('文件仍在处理中，请稍后重试。', 409);
  const result = await createServiceAuthClient().storage.from(FILE_BUCKET).download(row.processed_key);
  if (result.error || !result.data) throw new FileError('文件处理结果读取失败，原文件已保留。', 503);
  return processedSchema.parse(JSON.parse(await result.data.text()));
}
export async function fileTransition(owner: string, id: string, action: 'complete' | 'delete') {
  const result = await createServiceAuthClient().rpc('ss_file_transition', { p_user_id: owner, p_file_id: id, p_action: action });
  if (result.error) throw new FileError(/storage_quota_exceeded/.test(result.error.message) ? FILE_QUOTA_MESSAGE : '文件状态更新失败，请重试。', 503);
  return result.data;
}
export async function completeFile(owner: string, id: string) {
  const row = await ownedFile(owner, id);
  if (row.state === 'ready') return row;
  const db = createServiceAuthClient();
  const raw = await db.storage.from(FILE_BUCKET).download(row.object_key);
  const processed = await db.storage.from(FILE_BUCKET).download(row.processed_key);
  if (raw.error || processed.error || !raw.data || !processed.data) throw new FileError('上传未完成，请重试。', 409);
  if (raw.data.size !== Number(row.size_bytes) || processed.data.size !== Number(row.processed_bytes) || createHash('sha256').update(new Uint8Array(await raw.data.arrayBuffer())).digest('hex') !== row.sha256 || createHash('sha256').update(new Uint8Array(await processed.data.arrayBuffer())).digest('hex') !== row.processed_sha256) throw new FileError('上传文件校验未通过，未确认存储。', 409);
  try { processedSchema.parse(JSON.parse(await processed.data.text())); }
  catch { throw new FileError('文件处理结果格式不正确，原文件已保留在待完成上传中，可从我的资产取消并重试。', 409); }
  return fileTransition(owner, id, 'complete');
}
