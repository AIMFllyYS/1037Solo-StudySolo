// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({user:vi.fn(),claims:vi.fn(),profile:vi.fn()}));
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getUser:state.user,getClaims:state.claims}})}));
vi.mock('@/lib/auth/serviceClient',()=>({createServiceAuthClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:state.profile})})})})}));
import {verifySupabaseAccessToken} from '../../lib/auth/aiGate';
const user={id:'fixture-user',email_confirmed_at:'2026-09-27T00:00:00Z',factors:[],user_metadata:{role:'admin'}};
const claims={sub:'fixture-user',iss:'https://fixture.supabase.co/auth/v1',aud:'authenticated',aal:'aal1',session_id:'fixture-session',client_id:'fixture-client'};
beforeEach(()=>{
 vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://fixture.supabase.co');vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY','fixture-public');
 state.user.mockResolvedValue({data:{user},error:null});state.claims.mockResolvedValue({data:{claims},error:null});state.profile.mockResolvedValue({data:{account_role:'user',is_active:true},error:null});
});
afterEach(()=>vi.unstubAllEnvs());
describe('canonical server authentication',()=>{
 it('uses confirmed active canonical user and ignores metadata admin claims',async()=>{expect(await verifySupabaseAccessToken('token')).toMatchObject({id:user.id,mfaRequired:false,clientId:'fixture-client',sessionId:'fixture-session'});});
 it.each([null,{account_role:'user',is_active:false}])('rejects missing or disabled server profile',async profile=>{state.profile.mockResolvedValue({data:profile,error:null});expect(await verifySupabaseAccessToken('token')).toBeNull();});
 it('rejects unconfirmed email',async()=>{state.user.mockResolvedValue({data:{user:{...user,email_confirmed_at:null}},error:null});expect(await verifySupabaseAccessToken('token')).toBeNull();});
 it('rejects another issuer despite a successful user lookup',async()=>{state.claims.mockResolvedValue({data:{claims:{...claims,iss:'https://legacy.supabase.co/auth/v1'}},error:null});expect(await verifySupabaseAccessToken('token')).toBeNull();});
 it.each(['admin','super_admin'])('requires aal2 for server-owned %s role',async role=>{state.profile.mockResolvedValue({data:{account_role:role,is_active:true},error:null});expect(await verifySupabaseAccessToken('token')).toMatchObject({mfaRequired:true});});
 it('requires aal2 for an enrolled verified factor',async()=>{state.user.mockResolvedValue({data:{user:{...user,factors:[{status:'verified',factor_type:'totp'}]}},error:null});expect(await verifySupabaseAccessToken('token')).toMatchObject({mfaRequired:true});state.claims.mockResolvedValue({data:{claims:{...claims,aal:'aal2'}},error:null});expect(await verifySupabaseAccessToken('token')).toMatchObject({mfaRequired:false});});
 it('fails closed when profile authority is unavailable',async()=>{state.profile.mockResolvedValue({data:null,error:new Error('fixture unavailable')});expect(await verifySupabaseAccessToken('token')).toBeNull();});
});
