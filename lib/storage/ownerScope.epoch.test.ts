import assert from 'node:assert/strict'
import {test} from 'node:test'
import {activateStorageOwner,captureStorageOperation,getOwnerEpoch,getStorageOwner,onStorageOwnerChange} from './ownerScope.ts'

test('owner epoch changes only with verified owner transitions and invalidates old jobs',()=>{
  activateStorageOwner(null)
  const start=getOwnerEpoch(),events:number[]=[]
  const stop=onStorageOwnerChange((_previous,_next,epoch)=>events.push(epoch))
  activateStorageOwner('owner-a')
  const operation=captureStorageOperation('session-1')
  assert.equal(operation.ownerId,'owner-a')
  assert.equal(operation.isCurrent(),true)
  activateStorageOwner('owner-a')
  assert.equal(getOwnerEpoch(),start+1)
  activateStorageOwner('owner-b')
  assert.equal(operation.signal.aborted,true)
  assert.equal(operation.isCurrent(),false)
  assert.equal(getStorageOwner(),'owner-b')
  assert.deepEqual(events,[start+1,start+2])
  stop();activateStorageOwner(null)
})
