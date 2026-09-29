import {NextResponse,type NextRequest} from 'next/server';
import {oauthConfig,pkce,safeNext,transientCookies} from '@/lib/auth/oauthServer';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  try{
    const config=oauthConfig(request.nextUrl.origin);const next=safeNext(request.nextUrl.searchParams.get('next'));
    if(!config.clientId){
      if(!new URL(config.origin).hostname.endsWith('.1037solo.com')&&new URL(config.origin).hostname!=='1037solo.com')return NextResponse.json({error:'此域名的统一登录客户端尚未配置，请稍后重试'},{status:503});
      const action=request.nextUrl.searchParams.get('action');const allowed=['login','register','forgot-password','security','update-password'];
      const url=new URL(`/${action&&allowed.includes(action)?action:'login'}`,process.env.NEXT_PUBLIC_ACCOUNT_URL||'https://account.1037solo.com');
      url.searchParams.set(action==='security'||action==='update-password'?'next':'redirect',new URL(next,config.origin).toString());return NextResponse.redirect(url);
    }
    const value=pkce();const url=new URL(`${config.authBase}/oauth/authorize`);
    for(const [key,val] of Object.entries({response_type:'code',client_id:config.clientId,redirect_uri:config.callback,state:value.state,code_challenge:value.challenge,code_challenge_method:'S256',scope:'openid email profile'}))url.searchParams.set(key,val);
    const response=NextResponse.redirect(url);transientCookies(response,{state:value.state,verifier:value.verifier,next},config.origin.startsWith('https:'));response.headers.set('Cache-Control','no-store');return response;
  }catch{return NextResponse.json({error:'统一登录配置暂不可用'},{status:503});}
}
