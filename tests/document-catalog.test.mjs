import test from 'node:test';
import assert from 'node:assert/strict';
import {documents,documentSections,priorities} from '../src/document-catalog.js';

test('managerial inventory covers the 12 Drive sections with unique, bilingual records',()=>{
  assert.equal(documentSections.length,12);
  assert.equal(documents.length,60);
  assert.equal(new Set(documents.map(record=>record.id)).size,documents.length);
  assert.deepEqual(new Set(documents.map(record=>record.section)),new Set(documentSections.map(section=>section.id)));
  for(const record of documents){
    assert.ok(record.title.fa&&record.title.en,record.id);
    assert.ok(record.topic.fa&&record.topic.en,record.id);
    assert.ok(record.kind.fa&&record.kind.en,record.id);
    assert.ok(record.guide.fa&&record.guide.en,record.id);
    assert.ok(record.use.fa&&record.use.en,record.id);
    assert.ok(record.timing.fa&&record.timing.en,record.id);
    assert.ok(record.owner.fa&&record.owner.en,record.id);
    assert.ok(record.audience.fa&&record.audience.en,record.id);
    assert.ok(record.reviewer.fa&&record.reviewer.en,record.id);
    assert.ok(record.access.fa&&record.access.en,record.id);
    assert.ok(record.status.fa&&record.status.en,record.id);
    assert.ok(record.source.fa.startsWith('https://drive.google.com/')||record.source.fa.startsWith('https://docs.google.com/'),record.id);
    assert.ok(record.source.en.startsWith('https://drive.google.com/')||record.source.en.startsWith('https://docs.google.com/'),record.id);
    assert.ok(priorities[record.priority],record.id);
  }
});

test('priority guidance is defined for critical, high and supporting documents',()=>{
  assert.deepEqual(Object.keys(priorities).sort(),['P0','P1','P2']);
  assert.ok(documents.some(record=>record.id==='mvp-prd'&&record.priority==='P0'));
  assert.ok(documents.some(record=>record.id==='scenario-strategy'&&record.priority==='P0'));
  assert.ok(documents.some(record=>record.id==='brand-identity'&&record.priority==='P1'));
  assert.ok(documents.some(record=>record.id==='life-finance-workbook'&&record.title.en.includes('Persian source')));
});
