import type {z} from 'zod'
import {createModel,generateText,tool} from '@/classolo/lib/ai'
import {getNotesPublic,getTranscriptPublic} from '@/classolo/lib/session'
import {upsertRenderMessage} from '@/classolo/lib/session/writes/render'
import {getClassUserId} from '@/classolo/lib/db'
import {visualPropsSchema} from '@/classolo/features/render-modules/visual/schema'

const visualInput=visualPropsSchema.pick({kind:true,title:true,content:true,plot:true})
const pending=new Map<string,Promise<void>>()
function xml(value:string){return value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!))}
export function outlineVisualFallback(titles:readonly string[]):string|null{
  const visible=titles.filter(Boolean).slice(0,7)
  if(!visible.length)return null
  const children=visible.slice(1),height=126+Math.ceil(children.length/2)*84
  const card=(title:string,x:number,y:number,width:number)=>{
    const short=title.slice(0,46),first=xml(short.slice(0,22)),second=xml(short.slice(22))
    return `<rect x="${x}" y="${y}" width="${width}" height="68" rx="11" fill="#f8fafc" stroke="#bfccd8"/><text x="${x+14}" y="${y+27}" font-size="14" fill="#263547">${first}</text>${second?`<text x="${x+14}" y="${y+48}" font-size="13" fill="#263547">${second}</text>`:''}`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 ${height}" role="img" aria-label="课堂导图概念关系示意"><path d="M320 88 V101" fill="none" stroke="#71879c" stroke-width="2"/>${children.map((_,index)=>`<path d="M320 101 L${index%2?470:170} ${112+Math.floor(index/2)*84}" fill="none" stroke="#9bafc1" stroke-width="1.5"/>`).join('')}${card(visible[0],30,20,580)}${children.map((title,index)=>card(title,index%2?330:30,112+Math.floor(index/2)*84,280)).join('')}</svg>`
}

/** Student-triggered, bounded visual explanation attached to the current lesson. */
export function generateClassVisual():Promise<void>{
  const snapshot=getTranscriptPublic(),owner=getClassUserId(),sessionId=snapshot.sessionId
  if(!owner||!sessionId||!snapshot.committed.length)return Promise.reject(new Error('先录入课堂文稿，再生成可视化说明'))
  const key=`${owner}:${sessionId}`
  const existing=pending.get(key);if(existing)return existing
  const task=(async()=>{
    const sources=snapshot.committed.slice(-4),anchor=sources.at(-1)!
    const outline=getNotesPublic().outlineDigest.slice(-12).map(row=>row.title).join('；')
    let visual:z.infer<typeof visualInput>|null=null
    try{const result=await generateText({
      model:createModel({baseUrl:'',model:'classroom'}),
      system:'你是课堂可视化助教。必须只调用 makeVisual，产生一张可核对的简洁教学图。优先使用完整内联 SVG（必须含 <svg> 根和闭合标签）；函数关系可用 plot，明确化学分子才用合法 SMILES。只依据文稿画事实，复杂结构不确定时用抽象关系图并标注“AI 示意”。不要生成临床诊断。',
      prompt:`课堂提纲：${outline||'暂无'}\n最近文稿：\n${sources.map(row=>`[${row.id}] ${row.text.slice(0,1800)}`).join('\n')}`,
      tools:{makeVisual:tool({description:'生成可渲染的 SVG、函数图或 SMILES 教学示意。',inputSchema:visualInput,execute:async input=>input})},
      toolChoice:{type:'tool',toolName:'makeVisual'},
      maxOutputTokens:2400,maxRetries:0,
    })
    const parsed=visualInput.safeParse(result.toolCalls.find(call=>call.toolName==='makeVisual')?.input)
    if(parsed.success&&!(parsed.data.kind==='svg'&&!/^\s*<svg(?:\s|>)[\s\S]*<\/svg>\s*$/i.test(parsed.data.content)))visual=parsed.data
    }catch{/* A provider failure does not erase the available AI outline. */}
    const fallback=!visual?outlineVisualFallback(getNotesPublic().outlineDigest.map(row=>row.title)):null
    if(!visual&&!fallback)throw new Error('助教未生成图示，课堂导图也尚未就绪')
    if(getClassUserId()!==owner||getTranscriptPublic().sessionId!==sessionId)return
    upsertRenderMessage({id:crypto.randomUUID(),module:'visual',version:'1.0',target:'notes',props:{...(visual??{kind:'svg',title:'课堂导图概念转绘 · 本地示意',content:fallback!}),sourceSegmentId:anchor.id,sourceRevision:anchor.correctionRevision??0},meta:{createdAt:Date.now(),source:visual?'silent-agent':'system',transcriptAnchor:anchor.id}})
  })().finally(()=>pending.delete(key))
  pending.set(key,task)
  return task
}
