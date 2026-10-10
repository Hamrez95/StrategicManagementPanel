import test from 'node:test';
import assert from 'node:assert/strict';
import {bars,lineChart,bcgChart} from '../src/charts.js';

test('negative operating profit has a visible signed bar and zero baseline',()=>{
  const html=bars(['فروش','زیان'],[100,-30]);
  assert.ok(html.includes('background:#bc3c49'));
  assert.ok(html.includes('background:#b4bfce'));
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
});
test('zero revenue trends remain finite and accessible',()=>{
  const html=lineChart(['اول','دوم'],[0,0],[0,0]);
  assert.ok(!html.includes('NaN'));
  assert.ok(!html.includes('Infinity'));
  assert.ok(html.includes('role="img"'));
});
test('BCG renders an escaped product label on the descending share axis',()=>{
  const html=bcgChart([{title:'<test>',share:2,growth:20,revenue:100}],10);
  assert.ok(html.includes('&lt;test&gt;'));
  assert.ok(html.includes('cx="200"'));
  assert.ok(html.includes('cy="140"'));
});
