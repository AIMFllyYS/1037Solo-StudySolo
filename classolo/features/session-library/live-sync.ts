/** Visible-page polling, not a WebSocket claim. Every run checks scope again after I/O. */
export function startClassLiveSync(options:{poll:()=>Promise<void>;isVisible:()=>boolean;subscribeWake?:(wake:()=>void)=>()=>void;intervalMs?:number;onError?:(error:unknown)=>void}){
  let stopped=false,running=false,dirty=false
  async function poll(){
    if(stopped||!options.isVisible())return
    if(running){dirty=true;return}
    running=true
    try{await options.poll()}catch(error){if(!stopped)options.onError?.(error)}
    finally{running=false;if(dirty&&!stopped){dirty=false;void poll()}}
  }
  const timer=setInterval(()=>{void poll()},options.intervalMs??10000)
  const unsubscribe=options.subscribeWake?.(()=>{void poll()})
  void poll()
  return()=>{stopped=true;clearInterval(timer);unsubscribe?.()}
}
