// @vitest-environment node
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {NextRequest} from 'next/server';
const mocks=vi.hoisted(()=>({verify:vi.fn(),fetch:vi.fn()}));
vi.mock('@/lib/auth/aiGate',()=>({verifySupabaseAccessToken:mocks.verify}));
import {POST} from '../../app/api/account/mfa/route';
const origin='https://notebook1b.husteread.icu';
const uid='f1111111-1111-4111-8111-111111111111';
const factor='f2222222-2222-4222-8222-222222222222';
const challenge='f3333333-3333-4333-8333-333333333333';
function request(site=origin){return new NextRequest(`${origin}/api/account/mfa`,{method:'POST',headers:{Origin:site,'Content-Type':'application/json',Cookie:'ss_mfa_access_token=pending-token; ss_mfa_refresh_token=pending-refresh; ss_mfa_next=/class'},body:JSON.stringify({action:'verify',factorId:factor,challengeId:challenge,code:'123456'})});}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv('SUPABASE_OAUTH_CLIENT_ID','client');vi.stubEnv('SUPABASE_OAUTH_CLIENT_SECRET','');vi.stubEnv('NEXT_PUBLIC_APP_URL',origin);vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://root-test.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','synthetic-public-key');
 mocks.verify.mockImplementation(async(token:string)=>({id:uid,sessionId:'same-session',clientId:token==='intermediate-token'?undefined:'client',aal:token==='pending-token'?'aal1':'aal2',mfaRequired:token==='pending-token'}));
 mocks.fetch.mockImplementation(async(url:string)=>{
  if(url.endsWith('/user'))return Response.json({factors:[{id:factor,factor_type:'totp',status:'verified',friendly_name:'Fixture'}]});
  if(url.endsWith('/verify'))return Response.json({access_token:'intermediate-token',refresh_token:'intermediate-refresh'});
  if(url.endsWith('/oauth/token'))return Response.json({access_token:'final-token',refresh_token:'final-refresh',expires_in:3600});
  throw new Error('unexpected endpoint');
 });vi.stubGlobal('fetch',mocks.fetch);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
describe('OAuth session-local MFA step-up',()=>{
 it('verifies factor then restores client claim via official OAuth refresh before issuing app cookies',async()=>{
  const response=await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({ok:true,next:'/class'});
  const calls=mocks.fetch.mock.calls;expect(calls[1][0]).toContain(`/factors/${factor}/verify`);expect(calls[2][0]).toContain('/oauth/token');expect(calls[2][1].body.get('refresh_token')).toBe('intermediate-refresh');
  const cookies=response.headers.getSetCookie().join(';');expect(cookies).toContain('ss_access_token=final-token');expect(cookies).toContain('ss_refresh_token=final-refresh');expect(cookies).not.toContain('access_token=intermediate-token');expect(cookies).not.toContain('Domain=');
 });
 it('rejects changed session lineage before exchanging the intermediate refresh token',async()=>{
  mocks.verify.mockImplementation(async(token:string)=>({id:uid,sessionId:token==='intermediate-token'?'other-session':'same-session',clientId:token==='intermediate-token'?undefined:'client',aal:token==='pending-token'?'aal1':'aal2',mfaRequired:token==='pending-token'}));
  const response=await POST(request());expect(response.status).toBe(503);expect(mocks.fetch.mock.calls.some(c=>c[0].endsWith('/oauth/token'))).toBe(false);expect(response.headers.getSetCookie().join(';')).not.toContain('access_token=final');
 });
 it('rejects a final token without the registered client claim',async()=>{
  mocks.verify.mockImplementation(async(token:string)=>({id:uid,sessionId:'same-session',clientId:token==='pending-token'?'client':undefined,aal:token==='pending-token'?'aal1':'aal2',mfaRequired:token==='pending-token'}));
  const response=await POST(request());expect(response.status).toBe(503);expect(response.headers.getSetCookie().join(';')).not.toContain('ss_access_token=final-token');expect(response.headers.getSetCookie().join(';')).toContain('ss_mfa_refresh_token=intermediate-refresh');
 });
 it('retains only pending state after ambiguous OAuth refresh failure',async()=>{
  mocks.fetch.mockImplementation(async(url:string)=>{if(url.endsWith('/user'))return Response.json({factors:[{id:factor,factor_type:'totp',status:'verified'}]});if(url.endsWith('/verify'))return Response.json({access_token:'intermediate-token',refresh_token:'intermediate-refresh'});throw new TypeError('network');});
  const response=await POST(request());expect(response.status).toBe(503);expect(response.headers.getSetCookie().join(';')).toContain('ss_mfa_access_token=pending-token');expect(response.headers.getSetCookie().join(';')).not.toContain('access_token=intermediate-token');
 });
 it('rejects cross-origin factor verification before any provider call',async()=>{expect((await POST(request('https://evil.example'))).status).toBe(403);expect(mocks.fetch).not.toHaveBeenCalled();});
});
