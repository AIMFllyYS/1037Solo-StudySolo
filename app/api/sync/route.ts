import {boundedText,RequestBodyTooLarge} from '@/lib/http/boundedBody';
import {z} from 'zod';
import {extractAccessToken,verifySupabaseAccessToken} from '@/lib/auth/aiGate';
import {createServiceAuthClient} from '@/lib/auth/serviceClient';
import {CLOUD_SYNC_KINDS,KIND_SIZE_LIMIT} from '@/lib/sync/types';
export const runtime='nodejs';export const dynamic='force-dynamic';
const schema=z.object({expectedUserId:z.string().uuid(),row:z.object({kind:z.enum(CLOUD_SYNC_KINDS),client_id:z.string().min(1).max(200),payload:z.unknown(),deleted:z.boolean(),updated_at:z.string().optional()})});
export async function POST(request:Request){
 const token=extractAccessToken(request.headers);const user=token?await verifySupabaseAccessToken(token):null;
 if(!user)return Response.json({error:'请先登录'},{status:401});
 if(user.mfaRequired)return Response.json({error:'请完成两步验证'},{status:403});
 try{
  const raw=await boundedText(request,8*1024*1024);if(new TextEncoder().encode(raw).length>8*1024*1024)return Response.json({error:'单个同步文件过大'},{status:413});
  const {expectedUserId,row}=schema.parse(JSON.parse(raw));
  if(expectedUserId!==user.id)return Response.json({error:'账号已切换，已阻止跨账号同步'},{status:409});
  if(new TextEncoder().encode(JSON.stringify(row.payload)).length>KIND_SIZE_LIMIT[row.kind])return Response.json({error:'同步内容超过单项限制'},{status:413});
  const db=createServiceAuthClient();
  let payload=row.payload;
  if(row.deleted){const existing=await db.from('ss_sync_documents').select('payload').eq('user_id',user.id).eq('kind',row.kind).eq('client_id',row.client_id).maybeSingle();if(existing.error)throw existing.error;if(existing.data)payload=existing.data.payload;}
  const result=await db.from('ss_sync_documents').upsert({user_id:user.id,kind:row.kind,client_id:row.client_id,payload,deleted:row.deleted,updated_at:new Date().toISOString()},{onConflict:'user_id,kind,client_id'}).select('kind,client_id,payload,deleted,updated_at').single();
  if(result.error)throw result.error;
  return Response.json(result.data,{headers:{'Cache-Control':'no-store'}});
 }catch(error){const message=error instanceof Error?error.message:String((error as {message?:string})?.message||'');return Response.json({error:/storage_quota_exceeded/.test(message)?'生态云存储空间不足，本地数据已保留':error instanceof z.ZodError?'同步数据格式不正确':'云同步暂不可用，本地数据已保留'},{status:error instanceof RequestBodyTooLarge?413:/storage_quota_exceeded/.test(message)?413:error instanceof z.ZodError?400:503});}
}
