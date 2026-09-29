import {NextResponse,type NextRequest} from 'next/server';
import {z} from 'zod';
import {oauthConfig,exchangeOAuth,oauthCookies,pendingMfaCookies,safeNext,type OAuthTokens} from '@/lib/auth/oauthServer';
import {verifySupabaseAccessToken} from '@/lib/auth/aiGate';
import {boundedText} from '@/lib/http/boundedBody';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function pending(request:NextRequest){
 const config=oauthConfig(request.nextUrl.origin);const access=request.cookies.get('ss_mfa_access_token')?.value;const refresh=request.cookies.get('ss_mfa_refresh_token')?.value;
 if(!access||!refresh)throw new Error('Pending session missing');
 const user=await verifySupabaseAccessToken(access);
 if(!user||user.clientId!==config.clientId||!user.sessionId)throw new Error('Pending session invalid');
 return {config,access,refresh,user,next:safeNext(request.cookies.get('ss_mfa_next')?.value)};
}
async function factors(context:Awaited<ReturnType<typeof pending>>){
 const response=await fetch(`${context.config.authBase}/user`,{headers:{apikey:context.config.anonKey,Authorization:`Bearer ${context.access}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Factor lookup failed');
 const data=await response.json();
 return (Array.isArray(data.factors)?data.factors:[]).filter((factor:{factor_type?:string;status?:string})=>factor.factor_type==='totp'&&factor.status==='verified').map((factor:{id:string;friendly_name?:string})=>({id:factor.id,name:factor.friendly_name||'验证器'}));
}
export async function GET(request:NextRequest){
 try{const context=await pending(request);return NextResponse.json({factors:await factors(context),next:context.next},{headers:{'Cache-Control':'no-store'}});}
 catch{return NextResponse.json({error:'验证会话已过期，请重新登录'},{status:401});}
}
export async function POST(request:NextRequest){
 const config=oauthConfig(request.nextUrl.origin);
 if(request.headers.get('origin')!==config.origin)return NextResponse.json({error:'Trusted request origin required'},{status:403});
 let context:Awaited<ReturnType<typeof pending>>;try{context=await pending(request);}catch{return NextResponse.json({error:'请重新登录'},{status:401});}
 let recovery:OAuthTokens|undefined;
 try{
  const body=z.object({action:z.enum(['challenge','verify']),factorId:z.string().uuid(),challengeId:z.string().uuid().optional(),code:z.string().regex(/^\d{6}$/).optional()}).parse(JSON.parse(await boundedText(request,2048)));
  const owned=await factors(context);if(!owned.some((f:{id:string})=>f.id===body.factorId))return NextResponse.json({error:'无效验证器'},{status:400});
  if(body.action==='verify'&&(!body.challengeId||!body.code))return NextResponse.json({error:'请输入验证码'},{status:400});
  const response=await fetch(`${config.authBase}/factors/${encodeURIComponent(body.factorId)}/${body.action}`,{method:'POST',headers:{apikey:config.anonKey,Authorization:`Bearer ${context.access}`,'Content-Type':'application/json'},body:JSON.stringify(body.action==='verify'?{challenge_id:body.challengeId,code:body.code}:{}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)return NextResponse.json({error:'验证码无效或已过期，请重试'},{status:400});
  const data=await response.json();
  if(body.action==='challenge')return NextResponse.json({id:data.id,expires_at:data.expires_at},{headers:{'Cache-Control':'no-store'}});
  if(typeof data.access_token!=='string'||typeof data.refresh_token!=='string')throw new Error('Incomplete MFA response');
  const intermediate=await verifySupabaseAccessToken(data.access_token);
  if(!intermediate||intermediate.id!==context.user.id||intermediate.sessionId!==context.user.sessionId||intermediate.aal!=='aal2'||intermediate.mfaRequired)throw new Error('MFA identity mismatch');
  // GoTrue verify currently omits client_id. Restore its registered client claim
  // via official OAuth refresh; never use the intermediate token as app session.
  recovery={access_token:context.access,refresh_token:data.refresh_token,expires_in:3600};
  const finalTokens=await exchangeOAuth({grant_type:'refresh_token',refresh_token:data.refresh_token},config);
  const final=await verifySupabaseAccessToken(finalTokens.access_token);
  if(!final||final.id!==context.user.id||final.sessionId!==context.user.sessionId||final.clientId!==config.clientId||final.aal!=='aal2'||final.mfaRequired)throw new Error('OAuth MFA lineage mismatch');
  const output=NextResponse.json({ok:true,next:context.next});oauthCookies(output,finalTokens,config.origin.startsWith('https:'));pendingMfaCookies(output,undefined,'/',config.origin.startsWith('https:'));return output;
 }catch(error){
  const output=NextResponse.json({error:error instanceof z.ZodError?'验证请求格式无效':'两步验证未能完成，请重新读取验证状态后重试'},{status:error instanceof z.ZodError?400:503});
  if(recovery)pendingMfaCookies(output,recovery,context.next,config.origin.startsWith('https:'));return output;
 }
}
