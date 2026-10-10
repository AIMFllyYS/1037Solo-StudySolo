import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configuredUnitRate} from './unitRate.ts';
test('only an explicitly configured zero enables free unit-priced service',()=>{
 assert.equal(configuredUnitRate('0'),0);
 assert.equal(configuredUnitRate('0.001'),0.001);
 assert.equal(configuredUnitRate('1e-6'),0.000001);
 for(const value of [undefined,'',' ','-1','NaN','Infinity','1e999','0x10'])assert.equal(configuredUnitRate(value),null);
});
