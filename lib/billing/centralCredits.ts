import {createServiceAuthClient} from "@/lib/auth/serviceClient";
export class CreditAdmissionError extends Error {constructor(message:string,readonly status:number){super(message);}}
function decimalFraction(value:string):{numerator:bigint;denominator:bigint}{
  const match=/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(value);
  if(!match)throw new CreditAdmissionError("计费数值无效",503);
  const digits=match[1]+(match[2]||"");const scale=(match[2]?.length||0)-Number(match[3]||0);
  return scale>=0?{numerator:BigInt(digits),denominator:10n**BigInt(scale)}:{numerator:BigInt(digits)*10n**BigInt(-scale),denominator:1n};
}
export function cnyToMicrocredits(cny:number):number {
  const ratio=Number(process.env.ECOSYSTEM_CREDITS_PER_CNY||"1");
  if(!Number.isFinite(cny)||cny<0||!Number.isFinite(ratio)||ratio<=0)throw new CreditAdmissionError("计费配置无效",503);
  const amount=decimalFraction(String(cny));const factor=decimalFraction(String(ratio));
  const numerator=amount.numerator*factor.numerator*1_000_000n;const denominator=amount.denominator*factor.denominator;
  const result=(numerator+denominator-1n)/denominator;
  if(result>BigInt(Number.MAX_SAFE_INTEGER))throw new CreditAdmissionError("计费金额超出范围",400);
  return Number(result);
}
export interface Admission {userId:string;requestKey:string;reserved:number;metadata:Record<string,unknown>}
export async function reserveCredit(userId:string,requestKey:string,maxCny:number,metadata:Record<string,unknown>):Promise<Admission>{
  const db=createServiceAuthClient();const amount=Math.max(1,cnyToMicrocredits(maxCny));
  const period=await db.rpc("ensure_period_credits",{p_user_id:userId});
  if(period.error)throw new CreditAdmissionError("会员周期额度暂不可用",503);
  const created=await db.from("ss_ai_admissions").insert({user_id:userId,request_key:requestKey,route:String(metadata.route||"class"),state:"pending",reserved_microcredits:amount});
  if(created.error)throw new CreditAdmissionError(created.error.code==="23505"?"该请求已提交，请查看原请求结果，不会重复调用模型":"计费准入服务暂不可用",created.error.code==="23505"?409:503);
  const result=await db.rpc("credit_apply",{p_user_id:userId,p_project_id:"studysolo",p_request_key:requestKey,p_action:"reserve",p_amount:amount,p_metadata:metadata});
  if(result.error){if(/^(?:[0-9A-Z]{5}|PGRST\d+)$/.test(result.error.code||"") && !/network|fetch|timeout/i.test(result.error.message)){await db.from("ss_ai_admissions").update({state:"rejected"}).eq("user_id",userId).eq("request_key",requestKey);}throw new CreditAdmissionError(/insufficient_credits/.test(result.error.message)?"生态 AI 额度不足":"生态计费服务暂不可用",/insufficient_credits/.test(result.error.message)?402:503);}
  const row=Array.isArray(result.data)?result.data[0]:result.data;
  if(row?.state!=="reserved")throw new CreditAdmissionError("该请求已经处理",409);
  const updated=await db.from("ss_ai_admissions").update({state:"reserved"}).eq("user_id",userId).eq("request_key",requestKey);
  if(updated.error)throw new CreditAdmissionError("计费状态未能确认，请稍后检查",503);
  return {userId,requestKey,reserved:amount,metadata};
}
export async function settleCredit(admission:Admission,actualCny:number){return settleMicrocredits(admission,cnyToMicrocredits(actualCny));}
export async function settleMicrocredits(admission:Admission,amount:number){
  if(!Number.isSafeInteger(amount)||amount<0)throw new CreditAdmissionError("结算金额无效",400);
  const db=createServiceAuthClient();
  if(amount>admission.reserved)throw new CreditAdmissionError("实际用量超过预留上限，已保留账目待核对",503);
  const result=await db.rpc("credit_apply",{p_user_id:admission.userId,p_project_id:"studysolo",p_request_key:admission.requestKey,p_action:"settle",p_amount:amount,p_metadata:admission.metadata});
  if(result.error)throw new CreditAdmissionError("用量结算待核对",503);
  const saved=await db.from("ss_ai_admissions").update({state:"settled",charged_microcredits:amount}).eq("user_id",admission.userId).eq("request_key",admission.requestKey);
  if(saved.error)throw new CreditAdmissionError("中央账本已结算，本地审计状态待核对",503);
}
export async function cancelCredit(admission:Admission){
  const db=createServiceAuthClient();const result=await db.rpc("credit_apply",{p_user_id:admission.userId,p_project_id:"studysolo",p_request_key:admission.requestKey,p_action:"cancel",p_amount:0,p_metadata:admission.metadata});
  if(result.error)throw new CreditAdmissionError("额度释放待核对",503);
  const saved=await db.from("ss_ai_admissions").update({state:"cancelled"}).eq("user_id",admission.userId).eq("request_key",admission.requestKey);
  if(saved.error)throw new CreditAdmissionError("中央额度已释放，本地审计状态待核对",503);
}
