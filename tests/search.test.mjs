import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_SEARCH_TERMS,MATRIX_SEARCH_TERMS,CONCEPT_SEARCH_TERMS,normalizeSearchText,searchItems} from '../src/search.js';

const pages=[
  {title:'شناخت شرکت',route:'company',type:'صفحه',keywords:PAGE_SEARCH_TERMS.company},
  {title:'اقتصاد کسب‌وکار',route:'finance',type:'صفحه',keywords:PAGE_SEARCH_TERMS.finance},
  {title:'محیط و بازار',route:'environment',type:'صفحه',keywords:PAGE_SEARCH_TERMS.environment}
];
const matrices=[
  {title:'سبد کسب‌وکار · BCG',route:'matrices/bcg',type:'ماتریس',keywords:MATRIX_SEARCH_TERMS.bcg},
  {title:'عوامل خارجی · EFE',route:'matrices/efe',type:'ماتریس',keywords:MATRIX_SEARCH_TERMS.efe}
];
const concepts=[
  {title:'ICP · پروفایل مشتری ایده‌آل',route:'learn/icp',type:'آموزش',keywords:CONCEPT_SEARCH_TERMS.icp,content:'تعریف بخش مشتری و فرایند تصمیم'},
  {title:'ROA · بازده دارایی‌ها',route:'learn/roa',type:'آموزش',keywords:CONCEPT_SEARCH_TERMS.roa,content:'سود خالص دوره تقسیم بر متوسط دارایی‌ها'},
  {title:'PESTEL · تحلیل محیط کلان',route:'learn/pestel',type:'آموزش',keywords:'PESTEL political economic social technology legal environmental'}
];

test('Persian and English aliases find the relevant workspace page first',()=>{
  assert.equal(searchItems([...pages,...concepts],'ماتریس ICP')[0].route,'company');
  assert.equal(searchItems([...pages,...concepts],'ideal customer profile')[0].route,'company');
  assert.equal(searchItems([...pages,...concepts],'ROA formula')[0].route,'finance');
  assert.equal(searchItems([...pages,...concepts],'تحلیل محیطی PESTEL')[0].route,'environment');
});

test('matrix names, synonyms, and Persian keyboard variants are searchable',()=>{
  assert.equal(searchItems(matrices,'BCG cash cow')[0].route,'matrices/bcg');
  assert.equal(searchItems(matrices,'ماتریس عوامل خارجى')[0].route,'matrices/efe');
  assert.equal(normalizeSearchText('كليد ي ۱۲۳'),'کلید ی 123');
});

test('all meaningful query words must match without generic filler words',()=>{
  assert.equal(searchItems([...pages,...matrices,...concepts],'the ICP matrix')[0].route,'company');
  assert.deepEqual(searchItems(matrices,'BCG finance'),[]);
});
