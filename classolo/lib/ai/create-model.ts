import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
export const MISSING_AI_SECRET_MESSAGE='课堂 AI 服务暂不可用';
export class MissingAISecretError extends Error { readonly code='MISSING_AI_SECRET'; constructor(){super(MISSING_AI_SECRET_MESSAGE);} }
export interface CreateModelConfig {baseUrl:string;model:string;userOverride?:string|null}
/**
 * AI SDK 内部用 `new URL(baseURL + path)` 拼请求地址，相对路径会直接抛
 * `Failed to construct 'URL'`——课堂静默 Agent 与课堂助手因此从未真正发出请求。
 * 浏览器里必须给绝对地址（同源 BFF），服务端/测试环境回落到本地开发源。
 */
export function classAiBaseUrl(origin=typeof window!=='undefined'?window.location.origin:'http://localhost:35349'){
  return `${origin.replace(/\/$/,'')}/api/class/ai`;
}

/**
 * 一节课里大纲整理、静默补充、知识卡片、课堂问答会同时触发。并发打满时模型商返回 429，
 * 于是整批补充失败。这里限制同时在途的课堂请求数，并只对「服务端已明确释放预留」的状态
 * （429 繁忙 / 带 Retry-After 的 503 连接失败）做有限次退避重试——其余失败结果未知，不重试，
 * 以免重复计费。每次重试都会生成新的 X-Request-Id（新的幂等键）。
 */
export const CLASS_AI_MAX_IN_FLIGHT=2;
const RETRYABLE=new Set([429,503]);
const MAX_ATTEMPTS=3;
let inFlight=0;const waiters:(()=>void)[]=[];
async function acquire(signal?:AbortSignal|null){
  if(inFlight<CLASS_AI_MAX_IN_FLIGHT){inFlight++;return;}
  await new Promise<void>((resolve,reject)=>{
    const go=()=>{signal?.removeEventListener('abort',abort);inFlight++;resolve();};
    const abort=()=>{const i=waiters.indexOf(go);if(i>=0)waiters.splice(i,1);reject(signal?.reason??new DOMException('Aborted','AbortError'));};
    waiters.push(go);signal?.addEventListener('abort',abort,{once:true});
  });
}
function release(){inFlight=Math.max(0,inFlight-1);waiters.shift()?.();}
export function retryDelayMs(response:Pick<Response,'status'|'headers'>,attempt:number){
  const header=Number(response.headers.get('retry-after'));
  const base=Number.isFinite(header)&&header>0?header*1000:1500*2**attempt;
  return Math.min(8000,base)+Math.floor(Math.random()*400);
}
export function isRetryableClassResponse(response:Pick<Response,'status'|'headers'>){
  // 503 只有在服务端声明 Retry-After（= 连接阶段失败、已释放预留）时才可重试。
  return RETRYABLE.has(response.status)&&(response.status===429||response.headers.has('retry-after'));
}
export async function classTransportFetch(url:RequestInfo|URL,init?:RequestInit):Promise<Response>{
  await acquire(init?.signal);
  let released=false;const done=()=>{if(!released){released=true;release();}};
  try{
    for(let attempt=0;;attempt++){
      const headers=new Headers(init?.headers);headers.delete('authorization');
      headers.set('X-Request-Id',crypto.randomUUID());
      const response=await fetch(url,{...init,headers,credentials:'include'});
      if(attempt+1>=MAX_ATTEMPTS||!isRetryableClassResponse(response)){
        // 流式响应要等 body 读完才释放名额；非流式/错误响应头到达即可释放。
        if(response.body&&response.ok&&response.headers.get('content-type')?.includes('event-stream')){
          const reader=response.body.getReader();
          const stream=new ReadableStream<Uint8Array>({
            async pull(controller){try{const {done:end,value}=await reader.read();if(end){done();controller.close();}else controller.enqueue(value);}catch(e){done();controller.error(e);}},
            cancel(reason){done();return reader.cancel(reason);},
          });
          return new Response(stream,{status:response.status,statusText:response.statusText,headers:response.headers});
        }
        done();return response;
      }
      await response.body?.cancel().catch(()=>{});
      await new Promise(r=>setTimeout(r,retryDelayMs(response,attempt)));
      if(init?.signal?.aborted){done();return response;}
    }
  }catch(error){done();throw error;}
}
export function createModel(_config:CreateModelConfig){
  void _config;
  return createOpenAICompatible({name:'classroom-server',baseURL:classAiBaseUrl(),apiKey:'session-transport',
    fetch:classTransportFetch,
  })('classroom');
}
