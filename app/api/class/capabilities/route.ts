import {extractAccessToken,verifySupabaseAccessToken} from '@/lib/auth/server/aiGate';
import {resolveProvider,ENV_MODEL_FLASH} from '@/lib/ai/provider';
import {tokenTariff,endpointProvider} from '@/lib/billing/pricing/tariffs';
import {configuredUnitRate} from '@/lib/billing/pricing/unitRate';
import {classImageSearchConfig} from '@/lib/billing/settlement/classImageSearch';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(request:Request){
 const token=extractAccessToken(request.headers);const user=token?await verifySupabaseAccessToken(token):null;
 if(!user)return Response.json({error:'请先登录'},{status:401});
 if(user.mfaRequired)return Response.json({error:'请完成两步验证'},{status:403});
 const provider=resolveProvider(process.env.CLASS_AI_MODEL||ENV_MODEL_FLASH);let aiReady=false;
 try{tokenTariff(provider.billingProvider??endpointProvider(provider.baseUrl),provider.apiModelId);aiReady=true;}catch{}
 return Response.json({ai:provider.configured&&provider.apiProtocol==='openai'&&aiReady,
 asr:!!((process.env.CLASS_ASR_BASE_URL||process.env.ASR_BASE_URL)&&(process.env.CLASS_ASR_API_KEY||process.env.ASR_API_KEY)&&(process.env.CLASS_ASR_MODEL||process.env.ASR_MODEL)&&configuredUnitRate(process.env.CLASS_ASR_CNY_PER_SECOND)!==null),
 image:classImageSearchConfig()!==null}, {headers:{'Cache-Control':'no-store'}});
}
