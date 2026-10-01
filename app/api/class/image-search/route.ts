import {classImageSearchConfig} from "@/lib/billing/classImageSearch";
import {z} from 'zod';
import {extractAccessToken,verifySupabaseAccessToken} from '@/lib/auth/aiGate';
import {reserveCredit,settleCredit,cancelCredit,CreditAdmissionError} from '@/lib/billing/centralCredits';
import {searchNoteImages} from '@/lib/content/noteImages';
import {isSubjectId} from '@/lib/content-data/subjects.registry';
export const runtime='nodejs';
export async function POST(request:Request){
 const token=extractAccessToken(request.headers);const user=token?await verifySupabaseAccessToken(token):null;
 if(!user)return Response.json({error:'请先登录'},{status:401});
 if(user.mfaRequired)return Response.json({error:'请完成两步验证'},{status:403});
 try{
  const {query,subjectId}=z.object({query:z.string().min(1).max(200),subjectId:z.string().optional()}).parse(await request.json());
  const scopedSubject=subjectId&&isSubjectId(subjectId)&&subjectId!=='other'?subjectId:undefined;
  const course=searchNoteImages(query,{academicYear:'all',...(scopedSubject?{subjectId:scopedSubject}:{}),limit:1})[0];
  if(course&&course.score>=4&&course.src.startsWith('/images/'))return Response.json({results:[{provider:'course',url:course.src,alt:course.alt||course.caption||query,pageUrl:`/${course.path}`,author:course.title,sourcePath:course.path}],charged:false},{headers:{'Cache-Control':'no-store'}});
  const config=classImageSearchConfig();
  if(!config)throw new CreditAdmissionError('课堂图片检索服务或单价未配置',503);
  const {key,cnyPerCall:cost}=config;
  const id=z.string().uuid().parse(request.headers.get('x-request-id')||crypto.randomUUID());
  const admission=await reserveCredit(user.id,`class-image:${id}`,cost,{route:'class-image',provider:'unsplash'});
  const url=new URL('https://api.unsplash.com/search/photos');url.searchParams.set('query',query);url.searchParams.set('per_page','1');
  const response=await fetch(url,{headers:{Authorization:`Client-ID ${key}`},signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
  if(!response.ok){if([400,401,403,404,422,429].includes(response.status))await cancelCredit(admission);throw new CreditAdmissionError('图片检索服务暂不可用',502);}
  const data=await response.json();await settleCredit(admission,cost);
  return Response.json({results:Array.isArray(data.results)?data.results.slice(0,1).map((row:{id?:string;urls?:{small?:string};alt_description?:string;user?:{name?:string}})=>({provider:'unsplash',urls:{small:row.urls?.small},alt_description:row.alt_description,pageUrl:row.id?`https://unsplash.com/photos/${encodeURIComponent(row.id)}`:null,author:row.user?.name||'Unsplash'})):[],charged:true});
 }catch(error){
  // Diagnostic metadata only: never log credentials or provider payloads.
  if(!(error instanceof CreditAdmissionError))console.warn('class_image_failed',{name:error instanceof Error?error.name:'unknown',message:error instanceof Error?error.message.slice(0,160):'',causeCode:(error as {cause?:{code?:string}})?.cause?.code});
  return Response.json({error:error instanceof CreditAdmissionError?error.message:'图片检索失败'},{status:error instanceof CreditAdmissionError?error.status:error instanceof z.ZodError||error instanceof SyntaxError?400:502});
 }
}
