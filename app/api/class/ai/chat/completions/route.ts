import {boundedText,RequestBodyTooLarge} from '@/lib/http/boundedBody';
import {z} from "zod";
import {extractAccessToken,verifySupabaseAccessToken} from "@/lib/auth/aiGate";
import {resolveProvider,ENV_MODEL_FLASH,chatCompletionsUrl} from "@/lib/ai/provider";
import {getModelInfo} from "@/lib/ai/models";
import {reserveCredit,settleMicrocredits,cancelCredit,CreditAdmissionError,type Admission} from "@/lib/billing/centralCredits";
import {tokenTariff,reservationPrice,tierPrice,endpointProvider,type TokenTariff} from "@/lib/billing/tariffs";
import {measuredTokens,usageCny,usageMicrocredits} from "@/lib/billing/providerAdmission";
export const runtime="nodejs";export const dynamic="force-dynamic";
const schema=z.object({messages:z.array(z.record(z.string(),z.unknown())).min(1).max(100),tools:z.array(z.record(z.string(),z.unknown())).max(8).optional(),tool_choice:z.unknown().optional(),stream:z.boolean().optional(),temperature:z.number().min(0).max(2).optional(),max_tokens:z.number().int().positive().optional(),max_completion_tokens:z.number().int().positive().optional()});
function actualAmount(usage:unknown,tariff:TokenTariff,ratio:number,inputBound:number,outputLimit:number):number {
  const measured=measuredTokens(usage);
  if(!measured||measured.input>inputBound||measured.output>outputLimit){
    // 只记数字，不含内容/凭据：这是「额度保留待核对」的唯一线索。
    console.warn(`[class-ai] usage outside bounds: measured=${measured?`${measured.input}/${measured.output}`:"none"} bound=${inputBound}/${outputLimit}`);
    throw new CreditAdmissionError("模型用量缺失或超出边界，额度已预留待核对",503);
  }
  return usageMicrocredits(measured,tierPrice(tariff,measured.input),ratio);
}

const CONNECT_PHASE_CODES=new Set(["ECONNREFUSED","ENOTFOUND","EAI_AGAIN","UND_ERR_CONNECT_TIMEOUT","ENETUNREACH","EHOSTUNREACH"]);
/** undici 把底层错误放在 `cause`；只有这些错误码能证明请求体从未发出。 */
function isConnectPhaseFailure(error:unknown):boolean{
  const cause=(error as {cause?:{code?:unknown}}|null)?.cause;
  return typeof cause?.code==="string"&&CONNECT_PHASE_CODES.has(cause.code);
}
/** 连接阶段失败时重试一次（请求未送达，不会重复计费）；其余错误原样抛出。 */
async function fetchUpstreamOnce(url:string,init:RequestInit):Promise<Response>{
  try{return await fetch(url,init);}
  catch(error){if(!isConnectPhaseFailure(error)||init.signal?.aborted)throw error;await new Promise(r=>setTimeout(r,400));return fetch(url,init);}
}

export async function POST(request:Request){
  const token=extractAccessToken(request.headers);const user=token?await verifySupabaseAccessToken(token):null;
  if(!user)return Response.json({error:{message:"请先登录"}},{status:401});
  if(user.mfaRequired)return Response.json({error:{message:"请先完成两步验证"}},{status:403});
  let admission:Admission|undefined;
  try{
    const text=await boundedText(request,128000);if(new TextEncoder().encode(text).length>128000)return Response.json({error:{message:"课堂上下文过长，请分段提问"}},{status:413});
    const body=schema.parse(JSON.parse(text));
    const provider=resolveProvider(process.env.CLASS_AI_MODEL||ENV_MODEL_FLASH);
    if(!provider.configured||provider.apiProtocol!=="openai")throw new CreditAdmissionError("课堂 AI 模型未配置",503);
    const tariff=tokenTariff(provider.billingProvider??endpointProvider(provider.baseUrl),provider.apiModelId);
    const ratio=Number(process.env.ECOSYSTEM_CREDITS_PER_CNY||"1");
    const outputLimit=Math.min(4096,body.max_tokens||body.max_completion_tokens||2048);
    const hasMedia=body.messages.some(m=>Array.isArray(m.content)&&m.content.some(part=>part&&typeof part==='object'&&(part as Record<string,unknown>).type!=='text'));
    const inputBound=hasMedia?(getModelInfo(provider.registryId)?.contextK??128)*1000:new TextEncoder().encode(JSON.stringify(body.messages)+JSON.stringify(body.tools||[])).length+4096;
    const reserveCny=usageCny({input:inputBound,output:outputLimit,cached:0,written:0},reservationPrice(tariff,inputBound));
    const ceiling=Number(process.env.ECOSYSTEM_MAX_REQUEST_CNY||'20');
    if(!Number.isFinite(ceiling)||ceiling<=0||reserveCny>ceiling)throw new CreditAdmissionError('课堂请求超出额度预留预算',402);
    const key=z.string().uuid().parse(request.headers.get("x-request-id")||crypto.randomUUID());
    admission=await reserveCredit(user.id,`class-ai:${key}`,reserveCny,{route:"class-ai",model:provider.registryId,provider:tariff.provider,upstream_model:provider.apiModelId,priceSnapshot:tariff,creditsPerCny:String(ratio),max_output_tokens:outputLimit,input_bound:inputBound});
    const upstreamInit={method:"POST",headers:{Authorization:`Bearer ${provider.apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({...body,model:provider.apiModelId,max_tokens:outputLimit,max_completion_tokens:undefined,stream:body.stream===true,...(body.stream?{stream_options:{include_usage:true}}:{})}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(180000)])};
    let upstream:Response;
    try{upstream=await fetchUpstreamOnce(chatCompletionsUrl(provider.baseUrl),upstreamInit);}
    catch(error){
      // 连接阶段失败（DNS / 拒绝 / 连接超时）= 请求从未到达模型商：释放预留，允许调用方重试。
      // 其余失败（发送后断开）结果未知，按既定口径保留待核对。
      if(isConnectPhaseFailure(error)){await cancelCredit(admission);return Response.json({error:{message:"课堂模型服务连接失败，请稍后重试（未扣费）"}},{status:503,headers:{"Retry-After":"3"}});}
      throw error;
    }
    if(!upstream.ok){if([400,401,403,404,413,422,429].includes(upstream.status))await cancelCredit(admission);return Response.json({error:{message:`课堂模型服务暂不可用 (${upstream.status})`}},{status:502});}
    if(!body.stream){const data=await upstream.json();await settleMicrocredits(admission,actualAmount(data.usage,tariff,ratio,inputBound,outputLimit));return Response.json(data);}
    if(!upstream.body)throw new Error("Missing provider stream");
    const reader=upstream.body.getReader();const decoder=new TextDecoder(),encoder=new TextEncoder();let buffer='';let usage:unknown;const reserved=admission;
    const terminal:string[]=[];let finished=false,terminalBytes=0;
    const stream=new ReadableStream<Uint8Array>({
      async start(controller){
        function frame(raw:string){
          const lines=raw.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim());
          let final=false;
          for(const text of lines){
            if(text==='[DONE]'){finished=true;final=true;continue;}
            if(!text)continue;
            const data=JSON.parse(text);
            if(data.error)throw new CreditAdmissionError('模型流返回错误，额度保留待核对',503);
            if(data.usage){usage=data.usage;if(!Array.isArray(data.choices)||data.choices.length===0)final=true;}
            if(data.choices?.some((c:Record<string,unknown>)=>c.finish_reason)){finished=true;final=true;}
          }
          if(final){terminalBytes+=raw.length;if(terminalBytes>256000)throw new Error('Provider terminal frames too large');terminal.push(raw);}
          else controller.enqueue(encoder.encode(raw+'\n\n'));
        }
        try{
          while(true){const chunk=await reader.read();if(chunk.done)break;buffer+=decoder.decode(chunk.value,{stream:true});
            buffer=buffer.replaceAll('\r\n','\n');const frames=buffer.split('\n\n');buffer=frames.pop()||'';
            for(const raw of frames)frame(raw);
            if(buffer.length>256000)throw new Error('Provider frame too large');
          }
          buffer+=decoder.decode();if(buffer.trim())frame(buffer);
          if(!finished)throw new CreditAdmissionError('模型流未完整结束，额度保留待核对',503);
          await settleMicrocredits(reserved,actualAmount(usage,tariff,ratio,inputBound,outputLimit));
          for(const raw of terminal)controller.enqueue(encoder.encode(raw+'\n\n'));
          controller.close();
        }catch(error){await reader.cancel(error).catch(()=>{});controller.error(error);}finally{reader.releaseLock();}
      },
      async cancel(){await reader.cancel();},
    });
    return new Response(stream,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-store","X-Accel-Buffering":"no"}});
  }catch(error){
    const status=error instanceof RequestBodyTooLarge?413:error instanceof CreditAdmissionError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:503;
    if(status>=500)console.warn(`[class-ai] ${status} ${error instanceof Error?`${error.name}: ${error.message.slice(0,160)}`:"unknown"}`);
    return Response.json({error:{message:error instanceof CreditAdmissionError?error.message:"课堂 AI 请求未能完成；已接受的请求额度保留待核对"}},{status});
  }
}
