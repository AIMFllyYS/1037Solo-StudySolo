// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({verify:vi.fn()}));
vi.mock('@/lib/auth/sign-in/account-verify',()=>({verifyAccount:state.verify}));
import {verifySupabaseAccessToken,decideAiGate} from '@/lib/auth/aiGate';
const identity={active:true,user_id:'fixture-user',mfa_required:false,aal:'aal2',session_id:'fixture-session',client_id:'fixture-client',user_metadata:{role:'admin'}};
beforeEach(()=>{state.verify.mockReset();state.verify.mockResolvedValue({kind:'ok',identity});});
describe('canonical Account server authentication',()=>{
 it('uses Account UUID and session, ignoring user-provided role metadata',async()=>{expect(await verifySupabaseAccessToken('token')).toMatchObject({id:'fixture-user',mfaRequired:false,clientId:'fixture-client',sessionId:'fixture-session'});expect(state.verify).toHaveBeenCalledWith('token',expect.objectContaining({accountBackendUrl:expect.any(String)}));});
 it.each(['signed-out','forbidden','unavailable'])('does not authenticate an Account %s result',async kind=>{state.verify.mockResolvedValue({kind});expect(await verifySupabaseAccessToken('token')).toBeNull();});
 it('uses Account MFA decision instead of deriving roles or factors independently',async()=>{state.verify.mockResolvedValue({kind:'ok',identity:{...identity,mfa_required:true,aal:'aal1'}});expect(await verifySupabaseAccessToken('token')).toMatchObject({mfaRequired:true});});
 it('reports Account outage as 503 without signing the user out or invoking a model',async()=>{state.verify.mockResolvedValue({kind:'unavailable'});const result=await decideAiGate({pathname:'/api/chat',method:'POST',headers:new Headers({authorization:'Bearer token'})});expect(result).toMatchObject({action:'reject',status:503,body:{code:'ACCOUNT_UNAVAILABLE'}});});
});