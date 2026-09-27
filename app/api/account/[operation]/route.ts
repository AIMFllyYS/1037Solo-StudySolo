import {verifySupabaseAccessToken} from "@/lib/auth/aiGate";
import { NextResponse,type NextRequest } from "next/server";
import {nativeOAuthClientId,oauthSession,publicOrigin} from "@/lib/auth/oauthServer";
export const runtime = "nodejs";
const OPERATIONS = {session:"browser-session",refresh:"refresh",logout:"logout"} as const;
export async function POST(request: NextRequest, context: {params:Promise<{operation:string}>}) {
  const {operation}=await context.params;
  if (!(operation in OPERATIONS)) return NextResponse.json({error:"Not found"},{status:404});
  const origin=request.headers.get("origin");
  const allowed=new Set((process.env.APP_ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "https://study.1037solo.com,https://studysolo.1037solo.com").split(",").map(v=>v.trim()));
  allowed.add(publicOrigin(request.nextUrl.origin));
  if(process.env.NODE_ENV!=="production") {allowed.add("http://localhost:35349");allowed.add("http://127.0.0.1:35349");}
  if(!origin || !allowed.has(origin))return NextResponse.json({error:"Trusted request origin required"},{status:403});
  if(nativeOAuthClientId())return oauthSession(request,operation);
  try {
    const base=(process.env.ACCOUNT_BACKEND_URL || "http://127.0.0.1:3041").replace(/\/$/,"");
    const upstream=await fetch(`${base}/api/auth/${OPERATIONS[operation as keyof typeof OPERATIONS]}`,{method:"POST",headers:{Origin:origin,Cookie:request.headers.get("cookie") || "","Content-Type":"application/json"},body:"{}",cache:"no-store",signal:AbortSignal.timeout(15000)});
    let response:NextResponse;
    if(operation==='session'&&upstream.ok){
      const session=await upstream.json();
      const user=typeof session.access_token==='string'?await verifySupabaseAccessToken(session.access_token):null;
      response=!user?NextResponse.json({error:'统一会话无效'},{status:401}):user.mfaRequired?NextResponse.json({error:'请先完成两步验证',code:'MFA_REQUIRED'},{status:403}):NextResponse.json(session);
      response.headers.set('Cache-Control','no-store');
    }else response=new NextResponse(upstream.body,{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    for(const cookie of upstream.headers.getSetCookie())response.headers.append("Set-Cookie",cookie);
    return response;
  } catch {return NextResponse.json({error:"统一账号服务暂不可用"},{status:503});}
}
