import test from 'node:test';
import assert from 'node:assert/strict';
import {localizeDigits,localize} from '../src/i18n.js';
import {preferences} from '../src/preferences.js';

test('numeric text follows the selected Persian or English language',()=>{
  assert.equal(localizeDigits('P0 · 3,500.5 / ٠٧٪','fa'),'P۰ · ۳٬۵۰۰٫۵ / ۰۷٪');
  assert.equal(localizeDigits('P۰ · ۳٬۵۰۰٫۵ / ۰۷٪','en'),'P0 · 3,500.5 / 07%');
});

test('rendered text and accessible labels are re-localized when the language changes',()=>{
  const textNode={nodeValue:'P0 · 3.5',parentElement:{tagName:'P'}};
  const attributes={'aria-label':'12 items',placeholder:'Version 2'};
  const element={hasAttribute:key=>key in attributes,getAttribute:key=>attributes[key],setAttribute:(key,value)=>attributes[key]=value};
  globalThis.document={createTreeWalker:()=>{let read=false;return {nextNode:()=>read?null:(read=true,textNode)};}};
  const root={querySelectorAll:()=>[element]};
  preferences.language='fa';localize(root);assert.equal(textNode.nodeValue,'P۰ · ۳٫۵');assert.equal(attributes['aria-label'],'۱۲ items');
  preferences.language='en';localize(root);assert.equal(textNode.nodeValue,'P0 · 3.5');assert.equal(attributes.placeholder,'Version 2');
});
