/** Coalesce events without starvation or overlapping work. Reset invalidates and aborts the old scope. */
export function createBoundedScheduler(options:{delayMs:number;maxWaitMs:number;run:(signal:AbortSignal)=>Promise<void>;onError?:(error:unknown)=>void}){
  let timer:ReturnType<typeof setTimeout>|null=null,firstDirty:number|null=null
  let dirty=false,running=false,stopped=false,generation=0
  let controller:AbortController|null=null
  let activeTask:Promise<void>|null=null
  const clear=()=>{if(timer)clearTimeout(timer);timer=null}
  function arm(){
    if(stopped||!dirty||running)return
    clear()
    const remaining=Math.max(0,options.maxWaitMs-(Date.now()-(firstDirty??Date.now())))
    timer=setTimeout(()=>{timer=null;void fire()},Math.min(options.delayMs,remaining))
  }
  async function fire(){
    if(stopped)return
    if(running){if(activeTask)await activeTask;return}
    if(!dirty)return
    clear()
    dirty=false;firstDirty=null;running=true
    const current=++generation;controller=new AbortController()
    const task=(async()=>{
      try{await options.run(controller!.signal)}catch(error){if(current===generation&&!controller!.signal.aborted)options.onError?.(error)}
      finally{running=false;controller=null;if(dirty)arm()}
    })()
    activeTask=task
    try{await task}finally{if(activeTask===task)activeTask=null}
  }
  return {
    schedule(){if(stopped)return;dirty=true;firstDirty??=Date.now();arm()},
    async flushNow(){if(stopped)return;dirty=true;firstDirty??=Date.now();clear();for(let run=0;run<4&&!stopped;run++){await fire();if(!dirty)break}},
    reset(){generation++;clear();dirty=false;firstDirty=null;controller?.abort()},
    stop(){stopped=true;generation++;clear();dirty=false;firstDirty=null;controller?.abort()},
  }
}
