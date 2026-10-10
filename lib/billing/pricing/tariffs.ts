import defaults from './trusted-tariffs.json';
import { CreditAdmissionError } from '../settlement/centralCredits';

export interface Price { input:number; cachedInput:number; output:number; cacheWrite?:number }
export interface TokenTariff { unit:'tokens'; provider:string; model:string; source:string; verifiedAt:string; supplierQuoteVerified:boolean; tiers:Array<Price & {maxInputTokens:number|null}> }
export function endpointProvider(base:string):string|undefined {
  try { return ({'api.qnaigc.com':'qiniu','relay.protocom.org':'relay','api.siliconflow.cn':'siliconflow','api.deepseek.com':'deepseek','open.bigmodel.cn':'zhipu','bcai.online':'bcai'} as Record<string,string>)[new URL(base).hostname]; } catch { return undefined; }
}
function object(value:unknown):Record<string,unknown> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new CreditAdmissionError('渠道计价配置无效',503);
  return value as Record<string,unknown>;
}
function price(value:unknown):Price {
  const v=object(value),p={input:v.input,output:v.output,cachedInput:v.cachedInput,cacheWrite:v.cacheWrite??v.input};
  if(Object.values(p).some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1e9))throw new CreditAdmissionError('渠道计价配置无效',503);
  return p as Price;
}
export function configuredTariff(provider:string,model:string):Record<string,unknown>|undefined {
  let overrides:Record<string,unknown>={};
  try { overrides=object(JSON.parse(process.env.ECOSYSTEM_ENDPOINT_PRICES_JSON||'{}')); } catch { throw new CreditAdmissionError('渠道计价配置无效',503); }
  const key=`${provider}:${model}`;
  const raw=Object.hasOwn(overrides,key)?overrides[key]:(defaults.rates as Record<string,unknown>)[key];
  if(raw===undefined)return undefined;
  const entry=object(raw);
  if(typeof entry.disabledReason==='string')throw new CreditAdmissionError(`该渠道暂未启用：${entry.disabledReason}`,503);
  if(entry.currency!=='CNY'||typeof entry.source!=='string'||!entry.source||typeof entry.verifiedAt!=='string'||!entry.verifiedAt)throw new CreditAdmissionError('渠道价格缺少单位或来源',503);
  return entry;
}
export function tokenTariff(provider:string|undefined,model:string,byok=false):TokenTariff {
  if(byok)return {unit:'tokens',provider:'byok',model,source:'operator-BYOK-infrastructure-tariff',verifiedAt:'2026-09-27',supplierQuoteVerified:false,tiers:[{maxInputTokens:null,input:.5,output:.5,cachedInput:.5,cacheWrite:.5}]};
  let entry=provider?configuredTariff(provider,model):undefined;
  // Legacy explicit operator overrides remain only for unmanaged service endpoints,
  // never override a recognized channel or borrow another provider's model price.
  if(!provider){
    let legacy:Record<string,unknown>;
    try{legacy=object(JSON.parse(process.env.ECOSYSTEM_MODEL_PRICES_JSON||'{}'));}catch{throw new CreditAdmissionError('模型计价配置无效',503);}
    if(Object.hasOwn(legacy,model))entry={unit:'tokens',currency:'CNY',source:'operator-explicit-model-override',verifiedAt:'configured',price:legacy[model]};
  }
  if(!entry||entry.unit!=='tokens')throw new CreditAdmissionError('当前落地渠道缺少可信token定价，暂不可调用',503);
  const raw=Object.hasOwn(entry,'tiers')?entry.tiers:[{...object(entry.price),maxInputTokens:null}];
  if(!Array.isArray(raw)||!raw.length||raw.length>16)throw new CreditAdmissionError('上下文分档配置无效',503);
  let previous=0;
  const tiers=raw.map((row,index)=>{
    const value=object(row),maximum=value.maxInputTokens;
    if(index===raw.length-1?maximum!==null:(!Number.isSafeInteger(maximum)||Number(maximum)<=previous))throw new CreditAdmissionError('上下文分档配置无效',503);
    previous=maximum===null?previous:Number(maximum);
    return {...price(value),maxInputTokens:maximum as number|null};
  });
  return {unit:'tokens',provider:provider??'operator-configured',model,source:String(entry.source),verifiedAt:String(entry.verifiedAt),supplierQuoteVerified:entry.supplierQuoteVerified===true,tiers};
}
export function tierPrice(tariff:TokenTariff,inputTokens:number):Price {
  if(!Number.isSafeInteger(inputTokens)||inputTokens<0)throw new CreditAdmissionError('上下文用量无效',503);
  return tariff.tiers.find(t=>t.maxInputTokens===null||inputTokens<=t.maxInputTokens)!;
}
/** Every possible cache mix/tier up to the bound is covered, even nonmonotonic tariffs. */
export function reservationPrice(tariff:TokenTariff,inputBound:number):Price {
  const candidates=[];
  for(const tier of tariff.tiers){candidates.push(tier);if(tier.maxInputTokens===null||inputBound<=tier.maxInputTokens)break;}
  return {input:Math.max(...candidates.flatMap(p=>[p.input,p.cachedInput,p.cacheWrite??p.input])),cachedInput:0,cacheWrite:0,output:Math.max(...candidates.map(p=>p.output))};
}
