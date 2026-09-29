import { z } from "zod";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import { extractAccessToken,verifySupabaseAccessToken } from "@/lib/auth/aiGate";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=z.string().uuid();
const inputSchema=z.object({op:z.enum(["session.save","session.update","session.list","session.load","transcript.append","outline.save","render.save","chat.append"]),expectedUserId:uuid,input:z.record(z.string(),z.unknown()),operationKey:z.string().uuid().optional()});
const transcript=z.object({id:uuid,sessionId:uuid,seq:z.number().int().nonnegative(),startMs:z.number().nonnegative(),endMs:z.number().nonnegative(),text:z.string().max(20000)});
async function json(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new Error("Missing request");
  const parts:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024*1024){await reader.cancel();throw new Error("Request too large");}parts.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return inputSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
function sessionView(row:Record<string,unknown>){return {...(row.payload as object),id:row.id,userId:row.user_id,title:row.title,status:row.status,updatedAt:row.updated_at,archived:!!row.archived_at};}
export async function POST(request:Request){
  const token=extractAccessToken(request.headers);
  const user=token?await verifySupabaseAccessToken(token):null;
  if(!user)return Response.json({error:"请先登录统一账号"},{status:401});
  if(user.mfaRequired)return Response.json({error:"请先完成两步验证",code:"MFA_REQUIRED"},{status:403});
  try{
    const {op,input,expectedUserId}=await json(request);
    if(expectedUserId!==user.id)return Response.json({error:"账号已切换，已停止旧账号同步"},{status:409});
    const db=createServiceAuthClient();
    if(op==="session.list"){
      const result=await db.from("ss_class_sessions").select("*").eq("user_id",user.id).is("archived_at",null).order("updated_at",{ascending:false}).limit(100);
      if(result.error)throw result.error;
      return Response.json((result.data||[]).map(sessionView),{headers:{"Cache-Control":"no-store"}});
    }
    const sessionId=uuid.parse(op.startsWith("session.")?input.id:input.sessionId);
    const found=await db.from("ss_class_sessions").select("*").eq("id",sessionId).eq("user_id",user.id).maybeSingle();
    if(found.error)throw found.error;
    if(op==="session.save"){
      const title=z.string().min(1).max(200).parse(input.title);
      const status=z.enum(["recording","paused","ended","interrupted"]).parse(input.status);
      if(!found.data){const result=await db.from("ss_class_sessions").insert({id:sessionId,user_id:user.id,title,status,payload:{startedAt:z.string().datetime().parse(input.startedAt),asrSnapshot:input.asrSnapshot}});if(result.error)throw result.error;}
      const asset=await db.from("asset_index").upsert({user_id:user.id,project_id:"studysolo",source_type:"class-session",source_id:sessionId,title,media_type:"application/x-classroom-session",source_path:`/class?session=${sessionId}`,updated_at:new Date().toISOString()},{onConflict:"project_id,source_type,source_id"});
      if(asset.error)throw asset.error;
      return Response.json({ok:true});
    }
    if(!found.data)return Response.json({error:"课堂不存在或无访问权限"},{status:404});
    if(op==="session.update"){
      const patch=z.object({id:uuid,title:z.string().min(1).max(200).optional(),status:z.enum(["recording","paused","ended","interrupted"]).optional(),archived:z.boolean().optional()}).parse(input);
      const result=await db.from("ss_class_sessions").update({...(patch.title?{title:patch.title}:{}),...(patch.status?{status:patch.status}:{}),...(patch.archived!==undefined?{archived_at:patch.archived?new Date().toISOString():null}:{}),updated_at:new Date().toISOString()}).eq("id",sessionId).eq("user_id",user.id);
      if(result.error)throw result.error;
      if(patch.title||patch.archived!==undefined){const updated=await db.from("asset_index").update({...(patch.title?{title:patch.title}:{}),...(patch.archived!==undefined?{archived_at:patch.archived?new Date().toISOString():null}:{}),updated_at:new Date().toISOString()}).eq("project_id","studysolo").eq("source_type","class-session").eq("source_id",sessionId).eq("user_id",user.id);if(updated.error)throw updated.error;}
      return Response.json({ok:true});
    }
    if(op==="session.load"){
      async function children(table:string,order:string){
        const values:Record<string,unknown>[]=[];
        for(let page=0;page<40;page++){
          const result=await db.from(table).select("payload").eq("user_id",user!.id).eq("session_id",sessionId).order(order).range(page*500,page*500+499);
          if(result.error)throw result.error;
          values.push(...(result.data||[]).map(row=>row.payload as Record<string,unknown>));
          if((result.data?.length||0)<500)return values;
        }
        throw new Error("Class session exceeds reader limit; export with pagination");
      }
      const [transcripts,outline,renders,chats]=await Promise.all([
        children("ss_class_transcripts","seq"),
        db.from("ss_class_outlines").select("payload,revision").eq("user_id",user.id).eq("session_id",sessionId).maybeSingle(),
        children("ss_class_renders","updated_at"),children("ss_class_chats","created_at"),
      ]);
      if(outline.error)throw outline.error;
      return Response.json({session:sessionView(found.data),transcript:transcripts,outline:outline.data?{outline:outline.data.payload,revision:outline.data.revision}:null,renders,chat:chats},{headers:{"Cache-Control":"no-store"}});
    }

    let result;
    if(op==="transcript.append"){
      const rows=z.array(transcript).max(100).parse(input.rows);
      if(rows.some(row=>row.sessionId!==sessionId))throw new Error("Session mismatch");
      result=await db.from("ss_class_transcripts").upsert(rows.map(row=>({id:row.id,session_id:sessionId,user_id:user.id,seq:row.seq,payload:row})),{onConflict:"session_id,seq",ignoreDuplicates:true});
    }else if(op==="outline.save"){
      const outline=z.object({nodes:z.array(z.object({id:z.string().max(150),title:z.string().max(500)})).max(300)}).parse(input.outline);
      result=await db.from("ss_class_outlines").upsert({session_id:sessionId,user_id:user.id,revision:z.number().int().nonnegative().parse(input.revision),payload:outline,updated_at:new Date().toISOString()},{onConflict:"session_id"});
    }else if(op==="render.save"){
      const row=z.object({id:z.string().min(1).max(150),sessionId:uuid,module:z.enum(["image","rich-text","ai-ask","gen-ui","agent-status"]),version:z.string().max(20),target:z.enum(["transcript","notes"]),props:z.record(z.string(),z.unknown()),source:z.enum(["silent-agent","chat-agent","system"]),transcriptAnchor:z.string().max(150).nullable().optional(),createdAt:z.string().optional()}).parse(input);
      result=await db.from("ss_class_renders").upsert({id:row.id,session_id:sessionId,user_id:user.id,payload:row,updated_at:new Date().toISOString()},{onConflict:"session_id,id"});
    }else{
      const row=z.object({id:uuid,sessionId:uuid,seq:z.number().int().nonnegative(),role:z.enum(["user","assistant","system","tool"]),content:z.string().max(100000),parts:z.unknown().optional(),createdAt:z.string().optional()}).parse(input);
      result=await db.from("ss_class_chats").upsert({id:row.id,session_id:sessionId,user_id:user.id,seq:row.seq,payload:row},{onConflict:"id",ignoreDuplicates:true});
    }
    if(result.error)throw result.error;
    return Response.json({ok:true});
  }catch(error){
    const invalid=error instanceof z.ZodError || error instanceof SyntaxError;
    const quota=/storage_quota_exceeded/.test(String((error as {message?:string})?.message||""));
    return Response.json({error:quota?"生态云存储空间不足，本地记录已保留":invalid?"课堂数据格式不正确":"课堂云同步暂不可用，本地记录已保留"},{status:quota?413:invalid?400:503});
  }
}
