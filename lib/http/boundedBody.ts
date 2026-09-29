export class RequestBodyTooLarge extends Error {readonly status=413;constructor(){super('请求内容超过限制');}}
export async function boundedBody(request:Request,limit:number):Promise<Uint8Array<ArrayBuffer>>{
  const declared=Number(request.headers.get('content-length')||0);if(declared>limit)throw new RequestBodyTooLarge();
  const reader=request.body?.getReader();if(!reader)return new Uint8Array(0);
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new RequestBodyTooLarge();}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export async function boundedText(request:Request,limit:number){return new TextDecoder().decode(await boundedBody(request,limit));}
