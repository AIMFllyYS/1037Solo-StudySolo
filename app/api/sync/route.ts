import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { fileOwner, fileFailure } from '@/lib/files/owner.server';
import { createServiceAuthClient } from '@/lib/auth/server/serviceClient';
import { boundedText } from '@/lib/http/boundedBody';
import { CLOUD_SYNC_KINDS } from '@/lib/sync/types';
export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';
const schema = z.object({ version: z.literal(2), expectedUserId: z.string().uuid(), restore: z.boolean().optional(), row: z.object({ kind: z.enum(CLOUD_SYNC_KINDS), client_id: z.string().min(1).max(200), expectedRevision: z.number().int().nonnegative(), deleted: z.boolean(), payload: z.unknown().optional(), mutationId: z.string().uuid().optional() }) });
export async function POST(request: NextRequest) {
 try {
  const owner = await fileOwner(request, true);
  const raw = JSON.parse(await boundedText(request, 256 * 1024));
  if (raw.version !== 2) return Response.json({ error: '请更新客户端后继续同步，本机内容保留。', code: 'CLIENT_UPGRADE_REQUIRED' }, { status: 409 });
  const input = schema.parse(raw);
  if (input.expectedUserId !== owner) return Response.json({ error: '账号已切换，操作已停止。', code: 'OWNER_CHANGED' }, { status: 409 });
  if (!input.row.deleted && !input.restore) return Response.json({ error: '请通过资产版本接口保存正文。', code: 'CLIENT_UPGRADE_REQUIRED' }, { status: 409 });
  const result = await createServiceAuthClient().rpc('ss_sync_archive', { p_owner: owner, p_kind: input.row.kind, p_client_id: input.row.client_id, p_expected: input.row.expectedRevision, p_restore: input.restore === true });
  if (result.error) {
   const conflict = /revision_conflict/.test(result.error.message), quota = /storage_quota_exceeded/.test(result.error.message);
   return Response.json({ error: conflict ? '云端版本已变化，本机操作保留。' : quota ? '个人云端空间不足，资产仍在回收站。' : '云同步暂不可用，本机内容保留。', code: conflict ? 'REVISION_CONFLICT' : quota ? 'QUOTA_EXCEEDED' : 'SYNC_UNAVAILABLE' }, { status: conflict ? 409 : quota ? 413 : 503 });
  }
  return Response.json(result.data, { headers: { 'Cache-Control': 'private, no-store' } });
 } catch (error) { if (error instanceof z.ZodError) return Response.json({ error: '同步数据格式不正确。', code: 'INVALID_CONTENT' }, { status: 400 }); return fileFailure(error); }
}