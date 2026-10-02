import assert from 'node:assert/strict'
import {test} from 'node:test'
import {DEFAULT_RESOURCE_BUDGETS,resolveResourceBudgets} from './budgets.ts'
import {getResourceSnapshot,registerResourceMetrics,resetResourceMetricsForTests} from './resourceMetrics.ts'

test('resource snapshots contain numeric copies and owners release their gauges',()=>{
  resetResourceMetricsForTests()
  const content={secret:'synthetic body that must not appear in metrics'}
  const release=registerResourceMetrics(()=>({activeObjectUrls:1,hotMessageEstimatedBytes:content.secret.length*2,ownerEpoch:3}))
  const snapshot=getResourceSnapshot()
  assert.equal(snapshot.activeObjectUrls,1)
  assert.equal(snapshot.ownerEpoch,3)
  assert.equal(typeof snapshot.hotMessageEstimatedBytes,'number')
  assert.equal(JSON.stringify(snapshot).includes(content.secret),false)
  assert.equal(Object.isFrozen(snapshot),true)
  release();release()
  assert.equal(getResourceSnapshot().activeObjectUrls,0)
  for(let i=0;i<20;i++){const dispose=registerResourceMetrics(()=>({mountedPdfPages:1}));assert.equal(getResourceSnapshot().mountedPdfPages,1);dispose()}
  assert.equal(getResourceSnapshot().mountedPdfPages,0)
  assert.throws(()=>registerResourceMetrics(()=>({searchWorkerCount:-1}))&&getResourceSnapshot(),/Invalid resource metric/)
  resetResourceMetricsForTests()
})

test('resource budgets have validated, immutable defaults',()=>{
  assert.equal(DEFAULT_RESOURCE_BUDGETS.hotMessageEstimatedBytes,32*1024*1024)
  const override=resolveResourceBudgets({inactiveHotSessions:2})
  assert.equal(override.inactiveHotSessions,2)
  assert.equal(Object.isFrozen(override),true)
  assert.throws(()=>resolveResourceBudgets({searchPendingJobs:0}),/Invalid resource budget/)
})
