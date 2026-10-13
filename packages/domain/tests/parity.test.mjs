import test from 'node:test';
import assert from 'node:assert/strict';
import * as typed from '../dist/index.js';
import * as legacy from '../../../src/calculations.js';
import {createSeed} from '../../../src/data.js';
test('typed domain preserves every exported legacy calculator on real project fixtures and edge inputs',()=>{
 const s=createSeed();assert.deepEqual(Object.keys(typed).sort(),Object.keys(legacy).sort());
 const samples={sum:[[[]],[[1,2,3]]],ratio:[[4,2],[0,0],[-1,2],[4,null]],weightedScore:[[s.external],[s.internal]],validWeights:[[s.external],[[]]],qspm:[[s.external,s.internal,s.qScores],[s.external.map(r=>({...r,weight:0})),s.internal,s.qScores]],space:[[s.space]],iePosition:[[1.99,3],[2,2],[3,1.9]],financials:[[s.fin],[{...s.fin,revenue:0,newCustomers:0}]],npv:[[100,[60,60],.1],[100,[1],-1]],irr:[[100,[60,60]],[100,[-5,80]],[-1,[60,60]]],scenarioResult:[[100,.6,20,10,30]],progress:[[30,0,50],[3,10,0],[5,5,5]]};
 for(const [name,inputs] of Object.entries(samples))for(const args of inputs)assert.deepEqual(typed[name](...args),legacy[name](...args),name);
});
