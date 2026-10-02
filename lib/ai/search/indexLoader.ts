export type IndexLoadPhase='cold'|'loading'|'ready'|'failed'
/** A bounded retry state machine for local, side-effect-free index initialization. */
export function createIndexLoader<T>(load:()=>Promise<T|null>|T|null,retryMs=30_000){
  let phase:IndexLoadPhase='cold',value:T|null=null,pending:Promise<T|null>|null=null,retryAt=0,generation=0
  return {
    get phase(){return phase},
    load():Promise<T|null>{
      if(phase==='ready')return Promise.resolve(value)
      if(pending)return pending
      if(phase==='failed'&&Date.now()<retryAt)return Promise.resolve(null)
      phase='loading'
      const started=++generation
      const task=Promise.resolve().then(load).then(result=>{
        if(started!==generation)return null
        value=result
        phase=result?'ready':'failed'
        if(!result)retryAt=Date.now()+retryMs
        return result
      },()=>{if(started===generation){value=null;phase='failed';retryAt=Date.now()+retryMs}return null}).finally(()=>{if(pending===task)pending=null})
      pending=task
      return task
    },
    reset(){generation++;value=null;phase='cold';retryAt=0;pending=null},
  }
}
