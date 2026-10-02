import type {RenderMessage} from '@/classolo/features/render-modules/types'
import type {OutlineDigestNode,TranscriptCommittedSegment} from '@/classolo/lib/session/types'
import {useUserNotes} from '@/lib/stores/userNotes'
import type {UserNote} from '@/lib/notes/userNote'

const START='<!-- class-generated:start -->',END='<!-- class-generated:end -->'
function fingerprint(text:string){let hash=2166136261;for(const ch of text){hash^=ch.codePointAt(0)!;hash=Math.imul(hash,16777619)}return (hash>>>0).toString(16)}
function sourceLink(sessionId:string,id:string){return `[文稿 ${id.slice(0,8)}](/class?session=${encodeURIComponent(sessionId)}&segment=${encodeURIComponent(id)})`}
function outlineLines(nodes:readonly OutlineDigestNode[],sessionId:string){
  const children=new Map<string|null,OutlineDigestNode[]>()
  for(const node of nodes){const parent=nodes.some(row=>row.id===node.parentId)?node.parentId??null:null;children.set(parent,[...(children.get(parent)??[]),node])}
  const visited=new Set<string>(),lines:string[]=[]
  function walk(parent:string|null,depth:number){for(const node of children.get(parent)??[]){if(visited.has(node.id))continue;visited.add(node.id);lines.push(`${'  '.repeat(Math.min(depth,8))}- ${node.title}${node.sourceSegmentIds?.length?` · ${node.sourceSegmentIds.map(id=>sourceLink(sessionId,id)).join('、')}`:''}`);walk(node.id,depth+1)}}
  walk(null,0);return lines
}
export function buildClassNoteMarkdown(input:{sessionId:string;title:string;transcript:readonly TranscriptCommittedSegment[];outline:readonly OutlineDigestNode[];renders:readonly RenderMessage[]}):string{
  const {sessionId,title,transcript,outline,renders}=input
  const outlineText=outlineLines(outline,sessionId)
  const lines=[`# ${title}`,'',`[返回课堂](/class?session=${encodeURIComponent(sessionId)})`,'','## 课堂提纲',...(outlineText.length?outlineText:['（待整理）']),'','## 公式与可视化']
  for(const card of renders){
    const props=card.props as Record<string,unknown>,anchor=card.meta.transcriptAnchor
    if(card.module==='formula'&&typeof props.latex==='string')lines.push(`- 公式候选：$${props.latex}$ · ${anchor?sourceLink(sessionId,anchor):'来源待核对'} · ${props.semanticStatus==='checked'?'有限数值检查通过':'语义未核验'}`)
    if(card.module==='visual'&&typeof props.title==='string')lines.push(`- AI 示意：${props.title}（${props.kind}） · ${anchor?sourceLink(sessionId,anchor):'课堂补充'}`)
    if(card.module==='image'&&typeof props.query==='string'){
      const result=props.result as {status?:string;url?:string;pageUrl?:string;author?:string}|undefined
      lines.push(`- 资料图：${props.query}${result?.status==='ready'&&result.url?` · [${result.author||'Unsplash'}](${result.pageUrl}) · ![${props.alt||props.query}](${result.url})`:' · 尚无固定结果'}`)
    }
  }
  if(!renders.some(card=>['formula','visual','image'].includes(card.module)))lines.push('（无）')
  lines.push('','## 随堂问答')
  let answered=0
  for(const card of renders){if(card.module!=='ai-ask')continue;const props=card.props as {question?:string;attempts?:{response:string;answer:string;evidenceIds:string[]}[]};const last=props.attempts?.at(-1);if(!last)continue;answered++;lines.push(`### ${props.question||'随堂题'}`,'',`我的回答：${last.response}`,'',last.answer,'',`依据：${last.evidenceIds.length?last.evidenceIds.map(id=>sourceLink(sessionId,id)).join('、'):'无可核对课堂引用'}`,'')}
  if(!answered)lines.push('（尚未作答）')
  lines.push('','## 课堂补充')
  let supplements=0
  for(const card of renders){if(card.module==='rich-text'&&typeof (card.props as {markdown?:unknown}).markdown==='string'){supplements++;lines.push(String((card.props as {markdown:string}).markdown),'')}}
  if(!supplements)lines.push('（无）')
  lines.push('','## 完整文稿')
  for(const row of transcript)lines.push(`### ${sourceLink(sessionId,row.id)}`,'',row.text,'')
  return lines.join('\n')
}

/** Stable one-note linkage. Edited generated text is never silently overwritten. */
export function saveClassNote(input:{ownerId:string;sessionId:string;noteId?:string;title:string;subjectId:string;markdown:string;openEditor?:boolean}):{id:string;status:'created'|'updated'|'proposal'|'unchanged'}{
  const notes=useUserNotes.getState()
  const open=(id:string)=>{if(input.openEditor!==false)notes.openEditor(id)}
  if(!notes._hasHydrated)throw new Error('笔记库正在恢复，请稍后再保存')
  const owned=Object.values(notes.byId).filter(note=>note.source?.kind==='class'&&note.source.sessionId===input.sessionId&&note.source.ownerId===input.ownerId)
  const existing=(input.noteId?notes.byId[input.noteId]:undefined)
  const note=existing?.source?.ownerId===input.ownerId&&existing.source.sessionId===input.sessionId?existing:owned[0]
  const hash=fingerprint(input.markdown),generated=`${START}\n${input.markdown}\n${END}`
  if(!note){const id=notes.createNote(input.subjectId,{title:input.title,markdown:`${generated}\n\n## 我的补充\n`,source:{kind:'class',label:input.title,sessionId:input.sessionId,ownerId:input.ownerId,generatedHash:hash}});open(id);return {id,status:'created'}}
  const start=note.markdown.indexOf(START),end=note.markdown.indexOf(END)
  const current=start>=0&&end>start?note.markdown.slice(start+START.length+1,end-1):''
  if(fingerprint(current)===hash){open(note.id);return {id:note.id,status:'unchanged'}}
  if(start>=0&&end>start&&fingerprint(current)===note.source?.generatedHash){
    notes.updateNote(note.id,{markdown:note.markdown.slice(0,start)+generated+note.markdown.slice(end+END.length),source:{...note.source,generatedHash:hash,proposalHash:undefined}})
    open(note.id);return {id:note.id,status:'updated'}
  }
  if(note.source?.ignoredHash===hash){open(note.id);return {id:note.id,status:'unchanged'}}
  // A student edited the generated block. Place a single replaceable proposal after it.
  const proposalMarker='<!-- class-proposal:start -->',proposalEnd='<!-- class-proposal:end -->'
  const pStart=note.markdown.indexOf(proposalMarker),pEnd=note.markdown.indexOf(proposalEnd)
  const proposal=`${proposalMarker}\n## 待采纳课堂更新\n${input.markdown}\n${proposalEnd}`
  if(note.source?.proposalHash!==hash){
    const next=pStart>=0&&pEnd>pStart?note.markdown.slice(0,pStart)+proposal+note.markdown.slice(pEnd+proposalEnd.length):`${note.markdown}\n\n${proposal}`
    notes.updateNote(note.id,{markdown:next,source:{...note.source!,proposalHash:hash}})
  }
  open(note.id);return {id:note.id,status:'proposal'}
}

export function resolveClassNoteProposal(note:UserNote,choice:'accept'|'ignore'):{markdown:string;source:NonNullable<UserNote['source']>}|null{
  const begin='<!-- class-proposal:start -->',finish='<!-- class-proposal:end -->'
  const pStart=note.markdown.indexOf(begin),pEnd=note.markdown.indexOf(finish)
  if(pStart<0||pEnd<=pStart||note.source?.kind!=='class'||!note.source.proposalHash)return null
  const withoutProposal=note.markdown.slice(0,pStart)+note.markdown.slice(pEnd+finish.length)
  if(choice==='ignore')return {markdown:withoutProposal,source:{...note.source,ignoredHash:note.source.proposalHash,proposalHash:undefined}}
  const proposed=note.markdown.slice(pStart+begin.length,pEnd).trim().replace(/^## 待采纳课堂更新\s*/u,'')
  const start=withoutProposal.indexOf(START),end=withoutProposal.indexOf(END)
  if(start<0||end<=start)return null
  return {markdown:withoutProposal.slice(0,start)+`${START}\n${proposed}\n${END}`+withoutProposal.slice(end+END.length),source:{...note.source,generatedHash:note.source.proposalHash,proposalHash:undefined,ignoredHash:undefined}}
}
