import {test} from 'node:test';
import assert from 'node:assert/strict';
import {retryAfterDelay,retryableFailure} from './failure';
test('Retry-After honors seconds and HTTP-date without NaN immediate retry loops',()=>{
 assert.equal(retryAfterDelay('5'),5000);assert.equal(retryAfterDelay('Thu, 01 Oct 2026 00:00:05 GMT',Date.parse('2026-10-01T00:00:00Z')),5000);assert.equal(retryAfterDelay('invalid'),0);assert.equal(retryAfterDelay(null),0);assert.equal(retryableFailure({message:'not language-dependent',status:401}),false);assert.equal(retryableFailure({message:'rate limit',status:429}),true);
});
