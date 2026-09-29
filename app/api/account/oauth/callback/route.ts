import {NextResponse,type NextRequest} from 'next/server';
import {oauthConfig,stateMatches,exchangeOAuth,oauthCookies,transientCookies,safeNext,pendingMfaCookies} from '@/lib/auth/oauthServer';
import {verifySupabaseAccessToken} from '@/lib/auth/aiGate';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
 const config=oauthConfig(request.nextUrl.origin);const secure=config.origin.startsWith('https:');
 const fail=(reason:string)=>{const url=new URL('/login',config.origin);url.searchParams.set('error',reason);const response=NextResponse.redirect(url);transientCookies(response,undefined,secure);response.headers.set('Cache-Control','no-store');return response;};
 if(!config.clientId||!stateMatches(request.cookies.get('ss_oauth_state')?.value,request.nextUrl.searchParams.get('state')))return fail('invalid_state');
 const code=request.nextUrl.searchParams.get('code');const verifier=request.cookies.get('ss_oauth_verifier')?.value;
 if(!code||code.length>4096||!verifier||!/^[A-Za-z0-9_-]{43,128}$/.test(verifier)||request.nextUrl.searchParams.has('error'))return fail('authorization_denied');
 try{
  const tokens=await exchangeOAuth({grant_type:'authorization_code',code,code_verifier:verifier,redirect_uri:config.callback},config);
  const user=await verifySupabaseAccessToken(tokens.access_token);
  if(!user||user.clientId!==config.clientId)return fail('invalid_session');
  if(user.mfaRequired){const response=NextResponse.redirect(new URL('/auth/challenge',config.origin));oauthCookies(response,undefined,secure);pendingMfaCookies(response,tokens,safeNext(request.cookies.get('ss_oauth_next')?.value),secure);transientCookies(response,undefined,secure);return response;}
  const response=NextResponse.redirect(new URL(safeNext(request.cookies.get('ss_oauth_next')?.value),config.origin));
  oauthCookies(response,tokens,secure);transientCookies(response,undefined,secure);return response;
 }catch{return fail('exchange_failed');}
}
