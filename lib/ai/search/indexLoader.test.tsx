import {afterEach,expect,it,vi} from 'vitest'
import {createIndexLoader} from './indexLoader'
afterEach(()=>vi.useRealTimers())
it('singleflights cold load and retries a missing index only after a controlled interval',async()=>{
  vi.useFakeTimers();vi.setSystemTime(1000)
  let calls=0,release:(value:{id:string}|null)=>void=()=>{}
  const loader=createIndexLoader(()=>{calls++;return new Promise<{id:string}|null>(resolve=>{release=resolve})},100)
  const first=loader.load(),second=loader.load()
  expect(first).toBe(second)
  await Promise.resolve();expect(calls).toBe(1)
  release(null);expect(await first).toBeNull();expect(loader.phase).toBe('failed')
  expect(await loader.load()).toBeNull();expect(calls).toBe(1)
  vi.setSystemTime(1100)
  const retry=loader.load();await Promise.resolve();expect(calls).toBe(2)
  release({id:'ready'});expect(await retry).toEqual({id:'ready'})
  expect(loader.phase).toBe('ready')
})
it('ignores a stale load completion after an index revision resets the loader',async()=>{
  let release:(value:string|null)=>void=()=>{}
  const loader=createIndexLoader(()=>new Promise<string|null>(resolve=>{release=resolve}))
  const old=loader.load();await Promise.resolve();loader.reset()
  release('old-index')
  expect(await old).toBeNull()
  expect(loader.phase).toBe('cold')
})
