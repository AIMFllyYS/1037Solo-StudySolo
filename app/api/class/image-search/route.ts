import {configuredUnitRate} from "@/lib/billing/unitRate";
import {z} from 'zod';
import {extractAccessToken,verifySupabaseAccessToken} from '@/lib/auth/aiGate';
import {reserveCredit,settleCredit,cancelCredit,CreditAdmissionError} from '@/lib/billing/centralCredits';
export const runtime='nodejs';
export async function POST(request:Request){
 const token=extractAccessToken(request.headers);const user=token?await verifySupabaseAccessToken(token):null;
 if(!user)return Response.json({error:'请先登录'},{status:401});
 if(user.mfaRequired)return Response.json({error:'请完成两步验证'},{status:403});
 try{
  const {query}=z.object({query:z.string().min(1).max(200)}).parse(await request.json());
  const key=process.env.CLASS_IMAGE_SEARCH_API_KEY;const cost=configuredUnitRate(process.env.CLASS_IMAGE_SEARCH_CNY_PER_CALL);
  if(!key||cost===null)throw new CreditAdmissionError('课堂图片检索服务或单价未配置',503);
  const id=z.string().uuid().parse(request.headers.get('x-request-id')||crypto.randomUUID());
  const admission=await reserveCredit(user.id,`class-image:${id}`,cost,{route:'class-image',provider:'unsplash'});
  const url=new URL('https://api.unsplash.com/search/photos');url.searchParams.set('query',query);url.searchParams.set('per_page','1');
  const response=await fetch(url,{headers:{Authorization:`Client-ID ${key}`},signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
  if(!response.ok){if([400,401,403,404,422,429].includes(response.status))await cancelCredit(admission);throw new CreditAdmissionError('图片检索服务暂不可用',502);}
  const data=await response.json();await settleCredit(admission,cost);
  return Response.json({results:Array.isArray(data.results)?data.results.slice(0,1).map((row:{urls?:{small?:string};alt_description?:string})=>({urls:{small:row.urls?.small},alt_description:row.alt_description})):[]});
 }catch(error){return Response.json({error:error instanceof CreditAdmissionError?error.message:'图片检索失败'},{status:error instanceof CreditAdmissionError?error.status:400});}
}
