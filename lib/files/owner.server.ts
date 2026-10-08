import type { NextRequest } from 'next/server';
import { accountBackendUrl, authModeForRequest, CANONICAL_SITE_ORIGIN, isLocalDevHost } from '@/lib/auth/authMode';
import { verifyAccount, failureStatus } from '@/lib/auth/sign-in/account-verify';
import { extractAccessToken } from '@/lib/auth/sessionCookie';

export class FileError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
export async function fileOwner(request: Pick<NextRequest,'headers'|'url'> & {nextUrl?:{host:string}}, mutation = false): Promise<string> {
  if (mutation && !/^Bearer\s+\S+/i.test(request.headers.get('authorization')??'')) {
    const host = request.headers.get('host')?.trim() ?? '';
    const expected = isLocalDevHost(host) ? new URL(request.url).origin : new URL(process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || CANONICAL_SITE_ORIGIN).origin;
    if (request.headers.get('origin') !== expected || host.toLowerCase() !== new URL(expected).host.toLowerCase()) throw new FileError('文件操作来源不正确。', 403);
  }
  const result = await verifyAccount(extractAccessToken(request.headers), { accountBackendUrl: accountBackendUrl(authModeForRequest({headers:request.headers,nextUrl:request.nextUrl??new URL(request.url)})), live: true });
  if (result.kind !== 'ok') throw new FileError(result.kind === 'unavailable' ? '账号服务暂不可用。' : '请先登录并完成账号验证。', failureStatus(result));
  if (result.identity.mfa_required) throw new FileError('请先完成两步验证。', 403);
  const expectedOwner = request.headers.get('x-study-file-owner');
  if (expectedOwner && expectedOwner !== result.identity.user_id) throw new FileError('账号已切换，文件操作已停止。', 409);
  return result.identity.user_id;
}
export function fileFailure(error: unknown): Response {
  return Response.json({ error: error instanceof FileError ? error.message : '云端文件服务暂不可用，请重试；文件与原对话已保留。' }, { status: error instanceof FileError ? error.status : 503, headers: { 'Cache-Control': 'private, no-store' } });
}
