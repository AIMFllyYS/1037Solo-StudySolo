import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {NextResponse,type NextRequest} from 'next/server';
import {resolvePublicAuthEnv} from './env';
import {verifySupabaseAccessToken} from './aiGate';
export const OAUTH_TRANSIENT_PATH='/api/account/oauth';
const CANONICAL_SITE_ORIGIN='https://studysolo.1037solo.com';
const LEGACY_SITE_ORIGINS=new Set(['https://notebook1b.husteread.icu']);
// Public Supabase OAuth client ID; it is intentionally non-secret and has exact
// production/local callbacks registered. Keep environment override for local clients.
const DEFAULT_PUBLIC_OAUTH_CLIENT_ID='e469cd5c-2363-4ddd-bf5c-e36562995a9c';
export function nativeOAuthClientId(){return process.env.SUPABASE_OAUTH_CLIENT_ID||DEFAULT_PUBLIC_OAUTH_CLIENT_ID;}
export function safeNext(raw:string|null|undefined):string{
  if(!raw||raw!==raw.trim()||!raw.startsWith('/')||raw.startsWith('//')||/[\\\u0000-\u001f\u007f]/.test(raw))return '/';
  return raw;
}
export function publicOrigin(requestOrigin?:string){
  const configured=process.env.NEXT_PUBLIC_APP_URL||process.env.NEXT_PUBLIC_STUDYSOLO_URL;
  const fallback=process.env.NODE_ENV!=='production'&&requestOrigin&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)?requestOrigin:CANONICAL_SITE_ORIGIN;
  const configuredOrigin=configured?new URL(configured).origin:undefined;
  const resolved=process.env.NODE_ENV==='production'&&configuredOrigin&&LEGACY_SITE_ORIGINS.has(configuredOrigin)?CANONICAL_SITE_ORIGIN:configuredOrigin||fallback;
  const url=new URL(resolved);
  if(url.username||url.password||(process.env.NODE_ENV==='production'&&url.protocol!=='https:'))throw new Error('Invalid public application origin');
  return url.origin;
}
export function oauthConfig(requestOrigin?:string){
  const clientId=nativeOAuthClientId();
  const origin=publicOrigin(requestOrigin);const env=resolvePublicAuthEnv();
  return {clientId,origin,callback:`${origin}/api/account/oauth/callback`,authBase:`${env.supabaseUrl}/auth/v1`,anonKey:env.anonKey,secret:process.env.SUPABASE_OAUTH_CLIENT_SECRET||''};
}
export function pkce(){const verifier=randomBytes(32).toString('base64url');return {verifier,state:randomBytes(32).toString('base64url'),challenge:createHash('sha256').update(verifier).digest('base64url')};}
export function stateMatches(expected:string|undefined,actual:string|null){return !!expected&&!!actual&&/^[A-Za-z0-9_-]{43}$/.test(expected)&&/^[A-Za-z0-9_-]{43}$/.test(actual)&&timingSafeEqual(Buffer.from(expected),Buffer.from(actual));}
export function transientCookies(response:NextResponse,values?:{state:string;verifier:string;next:string},secure=true){
  for(const name of ['state','verifier','next'] as const)response.cookies.set(`ss_oauth_${name}`,values?.[name]||'',{httpOnly:true,secure,sameSite:'lax',path:OAUTH_TRANSIENT_PATH,maxAge:values?600:0});
}
export type OAuthTokens={access_token:string;refresh_token:string;expires_in:number;token_type?:string};
export async function exchangeOAuth(params:Record<string,string>,config:ReturnType<typeof oauthConfig>):Promise<OAuthTokens>{
  const form=new URLSearchParams(params);const headers:Record<string,string>={'Content-Type':'application/x-www-form-urlencoded'};
  if(config.secret)headers.Authorization=`Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString('base64')}`;
  else form.set('client_id',config.clientId);
  const response=await fetch(`${config.authBase}/oauth/token`,{method:'POST',headers,body:form,cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('OAuth token exchange failed');
  const data=await response.json();
  if(typeof data.access_token!=='string'||!data.access_token||typeof (data.refresh_token||params.refresh_token)!=='string')throw new Error('Incomplete OAuth session');
  return {access_token:data.access_token,refresh_token:data.refresh_token||params.refresh_token,expires_in:Math.min(86400,Math.max(1,Number(data.expires_in)||3600)),token_type:'bearer'};
}
export function oauthCookies(response:NextResponse,tokens?:OAuthTokens,secure=true){
  const maxAge=Number(process.env.OAUTH_COOKIE_MAX_AGE)||604800;
  for(const name of ['access_token','refresh_token'] as const)response.cookies.set(`ss_${name}`,tokens?.[name]||'',{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:tokens?maxAge:0});
  response.cookies.set('ss_remember_me',tokens?'1':'',{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:tokens?maxAge:0});
  response.headers.set('Cache-Control','no-store');
}
export function pendingMfaCookies(response:NextResponse,tokens?:OAuthTokens,next='/',secure=true){
  const values={access_token:tokens?.access_token||'',refresh_token:tokens?.refresh_token||'',next:safeNext(next)};
  for(const name of ['access_token','refresh_token','next'] as const)response.cookies.set(`ss_mfa_${name}`,tokens?values[name]:'',{httpOnly:true,secure,sameSite:'lax',path:'/api/account',maxAge:tokens?900:0});
  response.headers.set('Cache-Control','no-store');
}
const refreshes=new Map<string,Promise<OAuthTokens>>();
function refreshOAuth(refreshToken:string,config:ReturnType<typeof oauthConfig>){
  const key=createHash('sha256').update(config.clientId+refreshToken).digest('hex');
  const existing=refreshes.get(key);if(existing)return existing;
  const promise=exchangeOAuth({grant_type:'refresh_token',refresh_token:refreshToken},config).finally(()=>{setTimeout(()=>refreshes.delete(key),5000).unref();});
  refreshes.set(key,promise);return promise;
}
export async function oauthSession(request:NextRequest,operation:string):Promise<NextResponse>{
  const config=oauthConfig(request.nextUrl.origin);const secure=config.origin.startsWith('https:');
  const access=request.cookies.get('ss_access_token')?.value;const refresh=request.cookies.get('ss_refresh_token')?.value;
  const pendingAccess=request.cookies.get('ss_mfa_access_token')?.value;const pendingRefresh=request.cookies.get('ss_mfa_refresh_token')?.value;const pendingNext=safeNext(request.cookies.get('ss_mfa_next')?.value);
  if(operation==='logout'){
    if(access||pendingAccess){try{await fetch(`${config.authBase}/logout?scope=local`,{method:'POST',headers:{apikey:config.anonKey,Authorization:`Bearer ${access||pendingAccess}`},signal:AbortSignal.timeout(10000)});}catch{/* Local transport must still close if the provider is unavailable. */}}
    const response=NextResponse.json({message:'Logged out'});oauthCookies(response,undefined,secure);pendingMfaCookies(response,undefined,'/',secure);return response;
  }
  if(!refresh&&pendingAccess&&pendingRefresh){
    try{
      const original=await verifySupabaseAccessToken(pendingAccess);
      if(!original||original.clientId!==config.clientId||!original.sessionId)throw new Error('Invalid pending session');
      const tokens=await refreshOAuth(pendingRefresh,config);const current=await verifySupabaseAccessToken(tokens.access_token);
      if(!current||current.id!==original.id||current.clientId!==config.clientId||current.sessionId!==original.sessionId)throw new Error('Session lineage mismatch');
      if(current.mfaRequired){const response=NextResponse.json({error:'Two-factor verification required',code:'MFA_REQUIRED',challenge_url:'/auth/challenge'},{status:403});pendingMfaCookies(response,tokens,pendingNext,secure);return response;}
      const response=NextResponse.json({...tokens,returnTo:pendingNext});oauthCookies(response,tokens,secure);pendingMfaCookies(response,undefined,'/',secure);return response;
    }catch{return NextResponse.json({error:'Two-factor verification required',code:'MFA_REQUIRED',challenge_url:'/auth/challenge'},{status:403});}
  }
  if(!refresh)return NextResponse.json({error:'Sign in required'},{status:401});
  try{
    let tokens:OAuthTokens={access_token:access||'',refresh_token:refresh,expires_in:3600};
    let user=access?await verifySupabaseAccessToken(access):null;
    if(!user||operation==='refresh'){tokens=await refreshOAuth(refresh,config);user=await verifySupabaseAccessToken(tokens.access_token);}
    if(!user||user.clientId!==config.clientId)throw new Error('OAuth client identity mismatch');
    if(user.mfaRequired){const response=NextResponse.json({error:'Two-factor verification required',code:'MFA_REQUIRED',challenge_url:'/auth/challenge'},{status:403});oauthCookies(response,undefined,secure);pendingMfaCookies(response,tokens,'/',secure);return response;}
    const response=NextResponse.json(tokens);oauthCookies(response,tokens,secure);return response;
  }catch{const response=NextResponse.json({error:'Session expired; sign in again'},{status:401});oauthCookies(response,undefined,secure);return response;}
}
