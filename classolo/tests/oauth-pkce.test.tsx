// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
const mocks=vi.hoisted(()=>({verify:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/auth/aiGate',()=>({verifySupabaseAccessToken:mocks.verify}));
import {pkce,safeNext,stateMatches,oauthSession} from '../../lib/auth/oauthServer';
import {GET as start} from '../../app/api/account/oauth/start/route';
import {GET as callback} from '../../app/api/account/oauth/callback/route';
const origin='https://notebook1b.husteread.icu';
const state='a'.repeat(43);const verifier='b'.repeat(43);
function callbackRequest(extra:Record<string,string>={}){
 const url=new URL('/api/account/oauth/callback',origin);url.searchParams.set('code','synthetic-code');url.searchParams.set('state',state);
 for(const [key,value]of Object.entries(extra))url.searchParams.set(key,value);
 return new NextRequest(url,{headers:{cookie:`ss_oauth_state=${state}; ss_oauth_verifier=${verifier}; ss_oauth_next=/class`}});
}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('NEXT_PUBLIC_APP_URL',origin);vi.stubEnv('SUPABASE_OAUTH_CLIENT_ID','test-client');vi.stubEnv('SUPABASE_OAUTH_CLIENT_SECRET','');
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://rootsolo-test.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','synthetic-public-key');
 mocks.verify.mockResolvedValue({id:'f1111111-1111-4111-8111-111111111111',clientId:'test-client',mfaRequired:false});
 mocks.fetch.mockResolvedValue(Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:3600}));vi.stubGlobal('fetch',mocks.fetch);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('official Supabase OAuth PKCE for retained external domain',()=>{
 it('does not restore an external session from Account shared cookies',async()=>{
  const response=await oauthSession(new NextRequest(`${origin}/api/account/session`,{method:'POST',headers:{cookie:'access_token=account-token; refresh_token=account-refresh'}}),'session');
  expect(response.status).toBe(401);expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.fetch).not.toHaveBeenCalled();
 });
 it('logs out only its own OAuth cookie transport, preserving Account login',async()=>{
  const response=await oauthSession(new NextRequest(`${origin}/api/account/logout`,{method:'POST',headers:{cookie:'ss_access_token=oauth-token; access_token=account-token'}}),'logout');
  expect(response.status).toBe(200);
  const names=response.cookies.getAll().map(cookie=>cookie.name);
  expect(names).toContain('ss_access_token');expect(names).toContain('ss_refresh_token');expect(names).toContain('ss_mfa_access_token');
  expect(names).not.toContain('access_token');expect(names).not.toContain('refresh_token');expect(names).not.toContain('remember_me');
  expect(mocks.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer oauth-token');
 });
 it('generates independent high entropy verifier/state and S256 challenge',()=>{const value=pkce();expect(value.state).toHaveLength(43);expect(value.verifier).toHaveLength(43);expect(value.state).not.toBe(value.verifier);expect(value.challenge).toBe(createHash('sha256').update(value.verifier).digest('base64url'));});
 it.each(['//evil.example','/\\evil.example','https://evil.example','/bad\npath'])('rejects unsafe local return %s',path=>expect(safeNext(path)).toBe('/'));
 it('rejects malformed unicode state safely',()=>expect(stateMatches(state,'中'.repeat(43))).toBe(false));
 it('starts at Supabase official authorize endpoint and stores HttpOnly PKCE only locally',async()=>{
  const response=await start(new NextRequest(`${origin}/api/account/oauth/start?next=/class`));
  const location=new URL(response.headers.get('location')!);expect(location.origin).toBe('https://rootsolo-test.supabase.co');expect(location.pathname).toBe('/auth/v1/oauth/authorize');
  expect(location.searchParams.get('redirect_uri')).toBe(`${origin}/api/account/oauth/callback`);expect(location.searchParams.get('code_challenge_method')).toBe('S256');
  const cookies=response.headers.getSetCookie().join(';');expect(cookies).toContain('HttpOnly');expect(cookies).toContain('Secure');expect(cookies).not.toContain('Domain=');
 });
 it('never exchanges a code on state mismatch',async()=>{const response=await callback(callbackRequest({state:'wrong'}));expect(response.headers.get('location')).toContain('invalid_state');expect(mocks.fetch).not.toHaveBeenCalled();});
 it('exchanges with verifier and keeps unmodified official tokens in host-only cookies',async()=>{
  const response=await callback(callbackRequest());expect(response.headers.get('location')).toBe(`${origin}/class`);
  const [url,init]=mocks.fetch.mock.calls[0];expect(url).toBe('https://rootsolo-test.supabase.co/auth/v1/oauth/token');expect(init.body.get('code_verifier')).toBe(verifier);expect(init.body.get('client_id')).toBe('test-client');expect(init.body.get('redirect_uri')).toBe(`${origin}/api/account/oauth/callback`);
  const cookies=response.headers.getSetCookie().join(';');expect(cookies).toContain('ss_access_token=synthetic-access');expect(cookies).toContain('ss_refresh_token=synthetic-refresh');expect(cookies).not.toContain('Domain=');
 });
 it('rejects a verified token bound to another OAuth client',async()=>{mocks.verify.mockResolvedValue({id:'user',clientId:'other',mfaRequired:false});const response=await callback(callbackRequest());expect(response.headers.get('location')).toContain('invalid_session');expect(response.headers.getSetCookie().join(';')).not.toContain('access_token=');});
 it('rejects only required incomplete MFA, not ordinary non-enrolled aal1 users',async()=>{mocks.verify.mockResolvedValue({id:'user',clientId:'test-client',mfaRequired:true});const response=await callback(callbackRequest());expect(response.headers.get('location')).toBe(`${origin}/auth/challenge`);expect(response.headers.getSetCookie().join(';')).toContain('ss_mfa_access_token=synthetic-access');});
 it('refreshes at OAuth token endpoint with registered public client, never native password/refresh grant endpoint',async()=>{
  const response=await oauthSession(new NextRequest(`${origin}/api/account/refresh`,{method:'POST',headers:{cookie:'ss_access_token=old; ss_refresh_token=oauth-refresh'}}),'refresh');
  expect(response.status).toBe(200);const [url,init]=mocks.fetch.mock.calls[0];expect(url).toContain('/auth/v1/oauth/token');expect(init.body.get('grant_type')).toBe('refresh_token');expect(init.body.get('client_id')).toBe('test-client');
 });
});
