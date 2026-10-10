import {boundedBody,RequestBodyTooLarge} from '@/lib/http/boundedBody';
import {z} from "zod";
import {extractAccessToken,verifySupabaseAccessToken} from "@/lib/auth/server/aiGate";
import {reserveCredit,settleCredit,cancelCredit,CreditAdmissionError} from "@/lib/billing/settlement/centralCredits";
import {configuredUnitRate} from '@/lib/billing/pricing/unitRate';
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function POST(request:Request){
  let stage='authenticate';
  let outcomeUnknown=false;
  const token=extractAccessToken(request.headers);const user=token?await verifySupabaseAccessToken(token):null;
  if(!user)return Response.json({error:"请先登录"},{status:401});
  if(user.mfaRequired)return Response.json({error:"请先完成两步验证"},{status:403});
  try{
    stage='validate';
    const base=process.env.CLASS_ASR_BASE_URL||process.env.ASR_BASE_URL;
    const key=process.env.CLASS_ASR_API_KEY||process.env.ASR_API_KEY;
    const model=process.env.CLASS_ASR_MODEL||process.env.ASR_MODEL;
    const rate=configuredUnitRate(process.env.CLASS_ASR_CNY_PER_SECOND);
    if(!base||!key||!model||rate===null)throw new CreditAdmissionError("课堂语音服务或计费单价尚未配置",503);
    if(Number(request.headers.get('content-length')||0)>2_000_000)return Response.json({error:"音频分段过大"},{status:413});
    const raw=await boundedBody(request,2_000_000);const data=await new Response(raw,{headers:{'Content-Type':request.headers.get('content-type')||''}}).formData();const file=data.get('file');
    if(!(file instanceof File)||file.size<44||file.size>1_920_044)return Response.json({error:"仅接受不超过一分钟的 PCM WAV 分段"},{status:400});
    const bytes=await file.arrayBuffer();const view=new DataView(bytes);const sig=new TextDecoder().decode(bytes.slice(0,4));
    if(sig!=='RIFF'||new TextDecoder().decode(bytes.slice(8,12))!=='WAVE'||view.getUint16(20,true)!==1||view.getUint16(22,true)!==1||view.getUint32(24,true)!==16000||view.getUint16(34,true)!==16||view.getUint32(40,true)!==bytes.byteLength-44)return Response.json({error:"音频格式必须是单声道 16kHz PCM16 WAV"},{status:400});
    const seconds=(bytes.byteLength-44)/32000;
    const requestKey=z.string().uuid().parse(request.headers.get('x-request-id')||crypto.randomUUID());
    const prompt=data.get('prompt');
    if(typeof prompt==='string'&&prompt.length>600)return Response.json({error:"热词过长"},{status:400});
    stage='reserve';
    const admission=await reserveCredit(user.id,`class-asr:${requestKey}`,seconds*rate,{route:"class-asr",model,seconds,rate_cny_per_second:rate});
    const form=new FormData();form.append('file',file,'class.wav');form.append('model',model);
    // 热词上下文：只接受有界纯文本（≤600 字），不接受任意字段透传。
    if(typeof prompt==='string'&&prompt.trim())form.append('prompt',prompt.trim());
    const url=base.replace(/\/$/,'').endsWith('/audio/transcriptions')?base:`${base.replace(/\/$/,'')}/audio/transcriptions`;
    stage='provider';
    outcomeUnknown=true;
    const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${key}`,'X-Trace-Id':requestKey},body:form,signal:AbortSignal.any([request.signal,AbortSignal.timeout(120000)])});
    if(!response.ok){if([400,401,403,404,413,422,429].includes(response.status)){await cancelCredit(admission);outcomeUnknown=false;}throw new CreditAdmissionError('语音服务未能完成转写',502);}
    stage='decode';
    const result=await response.json();if(typeof result.text!=='string')throw new Error('Missing text');
    stage='settle';
    await settleCredit(admission,seconds*rate);return Response.json({text:result.text});
  }catch(error){
    // Diagnostic metadata only: never log credentials, audio or provider payloads.
    console.warn('class_asr_failed',{stage,name:error instanceof Error?error.name:'unknown',causeCode:(error as {cause?:{code?:string}})?.cause?.code});
    return Response.json({error:error instanceof CreditAdmissionError?error.message:'语音转写失败，已保留额度与本地录音待核对',outcome:outcomeUnknown?'uncertain':'retryable'},{status:error instanceof RequestBodyTooLarge?413:error instanceof CreditAdmissionError?error.status:error instanceof z.ZodError?400:503});
  }
}
