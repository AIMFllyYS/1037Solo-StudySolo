import {verifySupabaseAccessToken} from "@/lib/auth/server/aiGate";
import { NextResponse,type NextRequest } from "next/server";
import {oauthSession,publicOrigin} from "@/lib/auth/server/oauthServer";
import {accountBackendUrl,authModeForRequest,canonicalUrlFor} from "@/lib/auth/authMode";
import {browserSessionBody} from "@/lib/auth/server/browserSessionBody";
export const runtime = "nodejs";
const OPERATIONS = {session:"browser-session",refresh:"refresh",logout:"logout"} as const;
export async function POST(request: NextRequest, context: {params:Promise<{operation:string}>}) {
  const {operation}=await context.params;
  if (!(operation in OPERATIONS)) return NextResponse.json({error:"Not found"},{status:404});
  const mode=authModeForRequest(request);
  // 历史域名不在 1037solo.com 下，拿不到 Account 的共享 cookie，因此不再单独登录：
  // 所有账号相关入口 308 到正式域名的同一路径（保留查询串，含 next）。
  if(mode==="redirect-canonical"){
    return NextResponse.redirect(canonicalUrlFor(request.nextUrl.pathname,request.nextUrl.search),308);
  }
  const origin=request.headers.get("origin");
  const allowed=new Set((process.env.APP_ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_APP_URL || "https://studysolo.1037solo.com,https://study.1037solo.com").split(",").map(v=>v.trim()).filter(Boolean));
  allowed.add(publicOrigin(request.nextUrl.origin));
  if(process.env.NODE_ENV!=="production") {allowed.add("http://localhost:35349");allowed.add("http://127.0.0.1:35349");}
  if(!origin || !allowed.has(origin))return NextResponse.json({error:"Trusted request origin required"},{status:403});
  // 只有生产构建里的 localhost 与未知主机才走自签 OAuth 通道。
  if(mode==="oauth-native")return oauthSession(request,operation);
  // 第一方域名与本机开发：身份唯一来源是 Account 的共享会话（本机开发用本机 Account）。
  // 线上地址只从环境变量读，未配置时明确报 503，不再静默回退到 127.0.0.1:3041（那会变成难以定位的 502/超时）。
  const base=accountBackendUrl(mode);
  if(!base)return NextResponse.json({error:"未配置 ACCOUNT_BACKEND_URL，无法查询统一账号服务",code:"ACCOUNT_BACKEND_UNSET"},{status:503});
  try {
    const upstream=await fetch(`${base}/api/auth/${OPERATIONS[operation as keyof typeof OPERATIONS]}`,{method:"POST",headers:{Origin:origin,Cookie:request.headers.get("cookie") || "","Content-Type":"application/json"},body:"{}",cache:"no-store",signal:AbortSignal.timeout(15000)});
    let response:NextResponse;
    if(operation==='session'&&upstream.ok){
      const session=await upstream.json();
      const user=typeof session.access_token==='string'?await verifySupabaseAccessToken(session.access_token):null;
      // 只把访问令牌（1 小时）交给浏览器；续期凭证留在 HttpOnly cookie 里，由服务端续期（接入协议 §6、§8）。
      response=!user?NextResponse.json({error:'统一会话无效'},{status:401}):user.mfaRequired?NextResponse.json({error:'请先完成两步验证',code:'MFA_REQUIRED'},{status:403}):NextResponse.json(browserSessionBody(session.access_token,user.id));
      response.headers.set('Cache-Control','no-store');
    }else{
      // 不吞掉上游错误：把状态码与截断后的响应体写到服务端日志，便于定位。
      // 响应体是 Account 的公开错误 JSON，不含 token；这里仍做长度截断以防意外。
      const body=await upstream.text().catch(()=> "");
      console.error(`[api/account/${operation}] 上游 ${base} 返回 ${upstream.status}：${body.slice(0,300)}`);
      response=new NextResponse(body || "{}",{status:upstream.status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
    }
    for(const cookie of upstream.headers.getSetCookie())response.headers.append("Set-Cookie",cookie);
    return response;
  } catch(error){
    // 同样不吞：区分超时/网络错误与上游返回错误，且只打印错误类别与地址，不打印 cookie 或 token。
    const detail=error instanceof Error?`${error.name}: ${error.message}`:String(error);
    console.error(`[api/account/${operation}] 请求统一账号服务失败 ${base} -> ${detail}`);
    return NextResponse.json({error:"统一账号服务暂不可用"},{status:503});
  }
}
