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
export function createModel(_config:CreateModelConfig){
  void _config;
  return createOpenAICompatible({name:'classroom-server',baseURL:classAiBaseUrl(),apiKey:'session-transport',
    fetch:async(url,init)=>{
      const headers=new Headers(init?.headers);headers.delete('authorization');
      headers.set('X-Request-Id',crypto.randomUUID());
      return fetch(url,{...init,headers,credentials:'include'});
    },
  })('classroom');
}
