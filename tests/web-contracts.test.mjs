import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import catalog from '../src/document-catalog.json' with { type: 'json' };

const moduleUrl = (source) =>
  'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const compile = (file) =>
  ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
const clientUrl = moduleUrl(compile('../apps/web/src/api/client.ts'));
const contracts = compile('../apps/web/src/api/contracts.ts').replace(
  /from ['"]\.\/client['"]/,
  `from '${clientUrl}'`,
);
const { decodeDocumentBoard } = await import(moduleUrl(contracts));

function documentBoard() {
  return {
    workspace_id: 'workspace-a',
    role: 'owner',
    history_limit: 50,
    stages: catalog.stages,
    industries: catalog.industries,
    sections: catalog.sections,
    priorities: catalog.priorities,
    members: [],
    events: [],
    items: catalog.documents.map((document) => ({ ...structuredClone(document), record: null })),
  };
}

test('real bilingual document catalog decodes without flattening outline arrays', () => {
  const board = decodeDocumentBoard(documentBoard());
  assert.equal(board.items.length, catalog.documents.length);
  for (const item of board.items) {
    const original = catalog.documents.find((document) => document.id === item.id);
    assert.deepEqual(item.structure, original.structure);
  }
});

test('document outline rejects scalar, empty, non-text and oversized lists', () => {
  for (const invalid of ['a scalar', [], [null], Array.from({ length: 21 }, () => 'line')]) {
    const board = documentBoard();
    board.items[0].structure.fa = invalid;
    assert.throws(() => decodeDocumentBoard(board), TypeError);
  }
});
