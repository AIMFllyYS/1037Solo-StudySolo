import { z } from "zod";
import { createServiceAuthClient } from "@/lib/auth/serviceClient";
import {fileOwner,fileFailure} from '@/lib/files/owner.server';
import { outlineSchema } from '@/classolo/lib/session/outline-schema';
import {classCourseProfileSchema} from '@/classolo/lib/course/profile';
import {DEFAULT_CLASS_COURSE_PROFILE} from '@/classolo/lib/course/profile';
import {correctionActionSchema,correctionRecordSchema,planTranscriptCorrection} from '@/classolo/features/transcript/term-correction';
import {createHash} from 'node:crypto';
import {formulaPropsSchema} from '@/classolo/features/formulas/schema';
import {imagePropsSchema} from '@/classolo/features/render-modules/image/schema';
import {visualPropsSchema} from '@/classolo/features/render-modules/visual/schema';
import {aiAskPropsSchema} from '@/classolo/features/render-modules/ai-ask/schema';
export const runtime="nodejs";
export const dynamic="force-dynamic";
const uuid=z.string().uuid();
const inputSchema=z.object({op:z.enum(["session.save","session.update","session.list","session.load","session.version","transcript.append","correction.save","outline.save","render.save","chat.append"]),expectedUserId:uuid,input:z.record(z.string(),z.unknown()),operationKey:z.string().uuid().optional()});
const transcript=z.object({id:uuid,sessionId:uuid,seq:z.number().int().nonnegative(),startMs:z.number().nonnegative(),endMs:z.number().nonnegative(),text:z.string().max(20000)});
async function json(request:Request){
  const reader=request.body?.getReader();if(!reader)throw new Error("Missing request");
  const parts:Uint8Array[]=[];let length=0;
  while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>1024*1024){await reader.cancel();throw new Error("Request too large");}parts.push(value);}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  return inputSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
}
function sessionView(row:Record<string,unknown>){return {...(row.payload as object),id:row.id,userId:row.user_id,title:row.title,status:row.status,updatedAt:row.updated_at,cloudRevision:String(row.cloud_revision??row.updated_at??'0'),archived:!!row.archived_at};}
export async function POST(request:Request){
  let user:{id:string};try{user={id:await fileOwner(request,true)};}catch(error){return fileFailure(error);}
  try{
    const {op,input,expectedUserId,operationKey}=await json(request);
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
      const profile=input.profile===undefined?undefined:classCourseProfileSchema.parse(input.profile);
      if(!found.data){const result=await db.from("ss_class_sessions").insert({id:sessionId,user_id:user.id,title,status,payload:{startedAt:z.string().datetime().parse(input.startedAt),asrSnapshot:input.asrSnapshot,...(profile?{profile}:{})}});if(result.error)throw result.error;}
      const asset=await db.from("asset_index").upsert({user_id:user.id,project_id:"studysolo",source_type:"class-session",source_id:sessionId,title,media_type:"application/x-classroom-session",source_path:`/class?session=${sessionId}`,updated_at:new Date().toISOString()},{onConflict:"project_id,source_type,source_id"});
      if(asset.error)throw asset.error;
      return Response.json({ok:true});
    }
    if(!found.data)return Response.json({error:"课堂不存在或无访问权限"},{status:404});
    if(op==='session.version')return Response.json({revision:String(found.data.cloud_revision??found.data.updated_at??'0')},{headers:{'Cache-Control':'no-store'}});
    if(op==="session.update"){
      const patch=z.object({id:uuid,title:z.string().min(1).max(200).optional(),status:z.enum(["recording","paused","ended","interrupted"]).optional(),archived:z.boolean().optional(),expectedRevision:z.number().int().nonnegative().optional(),profile:classCourseProfileSchema.optional(),noteId:z.string().min(1).max(150).optional()}).parse(input);
      const payloadChanged=patch.profile!==undefined||patch.noteId!==undefined;
      if(patch.archived!==undefined&&(patch.title||patch.status||payloadChanged))return Response.json({error:'请单独确认课堂回收站操作，原数据保留。'},{status:400});
      if(payloadChanged){const result=await db.rpc('ss_class_patch_session_payload',{p_user_id:user.id,p_session_id:sessionId,p_patch:{...(patch.profile?{profile:patch.profile}:{}),...(patch.noteId?{noteId:patch.noteId}:{})}});if(result.error)throw result.error;}
      if(patch.archived!==undefined){if(patch.expectedRevision===undefined)return Response.json({error:'请刷新课堂版本后重新确认操作，原记录保留。',code:'CLASS_REVISION_CONFLICT'},{status:409});const result=await db.rpc('ss_class_archive',{p_owner:user.id,p_session:sessionId,p_expected:patch.expectedRevision,p_restore:!patch.archived});if(result.error)throw result.error;}
      if(patch.title||patch.status){const result=await db.from("ss_class_sessions").update({...(patch.title?{title:patch.title}:{}),...(patch.status?{status:patch.status}:{}),updated_at:new Date().toISOString()}).eq("id",sessionId).eq("user_id",user.id);if(result.error)throw result.error;}
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
      const [transcripts,outline,renders,chats,corrections]=await Promise.all([
        children("ss_class_transcripts","seq"),
        db.from("ss_class_outlines").select("payload,revision").eq("user_id",user.id).eq("session_id",sessionId).maybeSingle(),
        children("ss_class_renders","updated_at"),children("ss_class_chats","created_at"),
        children("ss_class_corrections","segment_id"),
      ]);
      if(outline.error)throw outline.error;
      return Response.json({session:sessionView(found.data),transcript:transcripts,outline:outline.data?{outline:outline.data.payload,revision:outline.data.revision}:null,renders,chat:chats,corrections},{headers:{"Cache-Control":"no-store"}});
    }

    if(op==='correction.save'){
      const segmentId=uuid.parse(input.segmentId),expectedRevision=z.number().int().nonnegative().parse(input.expectedRevision);
      const action=correctionActionSchema.parse(input.action);
      const actionHash=createHash('sha256').update(JSON.stringify([sessionId,segmentId,expectedRevision,action])).digest('hex');
      const [raw,prior]=await Promise.all([
        db.from('ss_class_transcripts').select('payload').eq('id',segmentId).eq('session_id',sessionId).eq('user_id',user.id).maybeSingle(),
        db.from('ss_class_corrections').select('revision,payload,last_operation_key').eq('segment_id',segmentId).eq('session_id',sessionId).eq('user_id',user.id).maybeSingle(),
      ]);
      if(raw.error||prior.error)throw raw.error||prior.error;
      if(!raw.data)return Response.json({error:'课堂文稿不存在或无权修改'},{status:404});
      const old=prior.data?.payload?correctionRecordSchema.parse(prior.data.payload):null;
      if(old?.revision===expectedRevision+1&&prior.data?.last_operation_key===operationKey&&old.actionHash===actionHash)return Response.json({ok:true,correction:old});
      if((old?.revision??0)!==expectedRevision)return Response.json({error:'文稿已在别处更正，本地修改已保留',code:'CORRECTION_CONFLICT',revision:old?.revision??0,correction:old},{status:409});
      const rawText=(raw.data.payload as {text?:unknown})?.text;
      if(typeof rawText!=='string')return Response.json({error:'原始文稿不可读'},{status:503});
      const course=classCourseProfileSchema.safeParse((found.data.payload as {profile?:unknown})?.profile);
      let next;
      try{next=planTranscriptCorrection({sessionId,segmentId,rawText,previous:old,profile:course.success?course.data:DEFAULT_CLASS_COURSE_PROFILE,action});}
      catch(error){
        return Response.json({error:error instanceof Error?error.message:'纠错候选已变化',code:'CORRECTION_CONFLICT',revision:old?.revision??0,correction:old},{status:409});
      }
      const saved=await db.rpc('ss_class_save_correction',{p_user_id:user.id,p_session_id:sessionId,p_segment_id:segmentId,p_expected_revision:expectedRevision,p_next_text:next.correctedText,p_history:next.history,p_operation_key:operationKey??crypto.randomUUID(),p_action_hash:actionHash});
      if(saved.error)throw saved.error;
      const value=saved.data as {status:string;revision:number;row?:unknown};
      if(value.status==='conflict')return Response.json({error:'文稿已在别处更正，本地修改已保留',code:'CORRECTION_CONFLICT',revision:value.revision,correction:value.row},{status:409});
      return Response.json({ok:true,correction:value.row});
    }

    let result;
    if(op==="transcript.append"){
      const rows=z.array(transcript).max(100).parse(input.rows);
      if(rows.some(row=>row.sessionId!==sessionId))throw new Error("Session mismatch");
      result=await db.from("ss_class_transcripts").upsert(rows.map(row=>({id:row.id,session_id:sessionId,user_id:user.id,seq:row.seq,payload:row})),{onConflict:"session_id,seq",ignoreDuplicates:true});
    }else if(op==="outline.save"){
      const outline=outlineSchema.parse(input.outline);
      const nextRevision=z.number().int().positive().parse(input.revision);
      // Legacy queued snapshots retain monotonic protection; new clients send an explicit base.
      const expectedRevision=z.number().int().nonnegative().parse(input.expectedRevision??nextRevision-1);
      if(nextRevision<=expectedRevision)return Response.json({error:'导图版本必须前进'},{status:400});
      result=await db.rpc('ss_class_save_outline',{p_user_id:user.id,p_session_id:sessionId,p_expected_revision:expectedRevision,p_revision:nextRevision,p_outline:outline,p_operation_key:operationKey??crypto.randomUUID()});
      if(result.error)throw result.error;
      const saved=result.data as {status:string;revision:number;payload?:unknown};
      if(saved.status==='conflict')return Response.json({error:'课堂导图已在别处更新，本地草稿已保留',code:'OUTLINE_CONFLICT',revision:saved.revision,outline:saved.payload},{status:409});
      return Response.json({ok:true,revision:saved.revision});
    }else if(op==="render.save"){
      const row=z.object({id:z.string().min(1).max(150),sessionId:uuid,module:z.enum(["image","rich-text","ai-ask","gen-ui","agent-status","formula","visual"]),version:z.string().max(20),target:z.enum(["transcript","notes"]),props:z.record(z.string(),z.unknown()),source:z.enum(["silent-agent","chat-agent","system"]),transcriptAnchor:z.string().max(150).nullable().optional(),createdAt:z.string().optional()}).parse(input);
      if(row.transcriptAnchor){const anchored=await db.from('ss_class_transcripts').select('id').eq('id',row.transcriptAnchor).eq('session_id',sessionId).eq('user_id',user.id).maybeSingle();if(anchored.error)throw anchored.error;if(!anchored.data)return Response.json({error:'卡片来源不属于本节课'},{status:400});}
      if(row.module==='formula'){
        const props=formulaPropsSchema.parse(row.props);
        if(props.id!==row.id||props.sourceSegmentId!==row.transcriptAnchor)return Response.json({error:'公式来源或身份不一致'},{status:400});
        const source=await db.from('ss_class_transcripts').select('id').eq('id',props.sourceSegmentId).eq('session_id',sessionId).eq('user_id',user.id).maybeSingle();
        if(source.error)throw source.error;
        if(!source.data)return Response.json({error:'公式来源不属于本节课'},{status:400});
        row.props=props;
      }
      if(row.module==='image')row.props=imagePropsSchema.parse(row.props);
      if(row.module==='ai-ask'){
        const props=aiAskPropsSchema.parse(row.props);
        if(props.assessmentId&&props.assessmentId!==row.id)return Response.json({error:'题卡身份不一致'},{status:400});
        const ids=[...new Set([...(row.transcriptAnchor?[row.transcriptAnchor]:[]),...(props.attempts??[]).flatMap(attempt=>attempt.evidenceIds)])];
        if(ids.length){const sources=await db.from('ss_class_transcripts').select('id').eq('session_id',sessionId).eq('user_id',user.id).in('id',ids);
          if(sources.error)throw sources.error;
          if((sources.data??[]).length!==ids.length)return Response.json({error:'题卡依据不属于本节课'},{status:400});
        }
        row.props=props;
      }
      if(row.module==='visual'){
        const props=visualPropsSchema.parse(row.props);
        if(props.sourceSegmentId){
          if(props.sourceSegmentId!==row.transcriptAnchor)return Response.json({error:'示意图来源不一致'},{status:400});
          const source=await db.from('ss_class_transcripts').select('id').eq('id',props.sourceSegmentId).eq('session_id',sessionId).eq('user_id',user.id).maybeSingle();
          if(source.error)throw source.error;
          if(!source.data)return Response.json({error:'示意图来源不属于本节课'},{status:400});
        }
        row.props=props;
      }
      result=await db.from("ss_class_renders").upsert({id:row.id,session_id:sessionId,user_id:user.id,payload:row,updated_at:new Date().toISOString()},{onConflict:"session_id,id"});
    }else{
      const row=z.object({id:uuid,sessionId:uuid,seq:z.number().int().nonnegative(),role:z.enum(["user","assistant","system","tool"]),content:z.string().max(100000),parts:z.unknown().optional(),createdAt:z.string().optional()}).parse(input);
      result=await db.from("ss_class_chats").upsert({id:row.id,session_id:sessionId,user_id:user.id,seq:row.seq,payload:row},{onConflict:"id",ignoreDuplicates:true});
    }
    if(result.error)throw result.error;
    return Response.json({ok:true});
  }catch(error){
    if(/revision_conflict/.test(String((error as {message?:unknown})?.message??'')))return Response.json({error:'课堂已在别处更新，操作尚未执行，请刷新后重新确认。',code:'CLASS_REVISION_CONFLICT'},{status:409});
    const invalid=error instanceof z.ZodError || error instanceof SyntaxError || (error as {code?:string})?.code==='22023';
    const quota=/storage_quota_exceeded/.test(String((error as {message?:string})?.message||""));
    return Response.json({error:quota?"生态云存储空间不足，本地记录已保留":invalid?"课堂数据格式不正确":"课堂云同步暂不可用，本地记录已保留"},{status:quota?413:invalid?400:503});
  }
}
