import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditKnowledge } from '../scripts/audit-management-knowledge.mjs';

const root = fileURLToPath(new URL('../assets/management-knowledge', import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'stratino-knowledge-tests-'));
after(() => {
  const resolved = path.resolve(scratch);
  const temporaryRoot = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(resolved.startsWith(temporaryRoot));
  assert.ok(path.basename(resolved).startsWith('stratino-knowledge-tests-'));
  fs.rmSync(resolved, { recursive: true });
});
let sequence = 0;
function fixture() {
  const directory = path.join(scratch, String(sequence++));
  fs.cpSync(root, directory, { recursive: true });
  return {
    directory,
    update(file, change) {
      const filename = path.join(directory, file);
      const value = JSON.parse(fs.readFileSync(filename, 'utf8'));
      change(value);
      fs.writeFileSync(filename, JSON.stringify(value));
    },
  };
}
function rejects(name, mutate, expected) {
  test(name, () => {
    const copy = fixture();
    mutate(copy);
    const result = auditKnowledge(copy.directory);
    assert.equal(result.status, 'fail');
    assert.ok(
      result.errors.some((error) => expected.test(error)),
      result.errors.join('\n'),
    );
  });
}

test('complete KB passes read-only and startup re-entry is permitted', () => {
  const before = auditKnowledge(root);
  assert.equal(before.status, 'pass', before.errors.join('\n'));
  assert.ok(before.inventory.some((file) => file.path === 'README.md'));
  assert.ok(before.inventory.some((file) => file.path === 'validation/validate.mjs'));
  assert.ok(before.counts.sources > 0);
  assert.ok(before.recommendations.length > 0);
  const after = auditKnowledge(root);
  assert.deepEqual(after.inventory, before.inventory);
  assert.ok(before.warnings.some((warning) => warning.includes('no explicit entry node')));
  assert.ok(before.warnings.some((warning) => warning.includes('variable/context adapter')));
});

rejects(
  'removing a still-referenced metric fails',
  ({ directory }) => {
    fs.unlinkSync(path.join(directory, 'metrics/finance/met-cac.json'));
  },
  /MET-CAC/,
);

rejects(
  'duplicate canonical IDs fail',
  ({ update }) => {
    update('metrics/core/registry.json', (value) => value.metrics.push(value.metrics[0]));
  },
  /Duplicate canonical ID/,
);

rejects(
  'duplicate JSON keys are not silently overwritten',
  ({ directory }) => {
    fs.writeFileSync(path.join(directory, 'duplicate.json'), '{"id":"first","id":"second"}');
  },
  /duplicated mapping key/,
);

rejects(
  'invalid YAML is parsed even outside the source index',
  ({ directory }) => {
    fs.writeFileSync(path.join(directory, 'invalid.yaml'), 'items: [unterminated');
  },
  /invalid.yaml/,
);

rejects(
  'unclosed Markdown frontmatter fails',
  ({ directory }) => {
    fs.writeFileSync(path.join(directory, 'invalid.md'), '---\ntitle: test\n');
  },
  /Unclosed Markdown frontmatter/,
);

rejects(
  'missing question evidence references fail',
  ({ update }) => {
    update('journeys/startup/journey.json', (value) => {
      value.questions[0].evidence_ref = 'EV-STARTUP-NOT-DEFINED';
    });
  },
  /EV-STARTUP-NOT-DEFINED/,
);

rejects(
  'source aliases cannot point to an undefined source',
  ({ update }) => {
    update('sources/source-aliases.json', (value) => {
      value.aliases['SRC-OLD'] = 'SRC-MISSING';
    });
  },
  /Invalid source alias/,
);

rejects(
  'source access-depth enum is validated',
  ({ update }) => {
    update('sources/core.json', (value) => {
      (Array.isArray(value) ? value : value.sources)[0].access_depth = 'trust_me';
    });
  },
  /access_depth/,
);

rejects(
  'unknown research schema version fails',
  ({ update }) => {
    update('journeys/startup/journey.json', (value) => {
      value.schema_version = '99.0.0';
    });
  },
  /unknown research schema/,
);

rejects(
  'organization prerequisite cycles fail',
  ({ update }) => {
    update('journeys/organization/journey.json', (value) => {
      value.steps[0].depends_on = [value.steps.at(-1).id];
    });
  },
  /circular prerequisite/,
);

rejects(
  'unreachable startup stages fail',
  ({ update }) => {
    update('journeys/startup/journey.json', (value) => {
      value.dependency_graph.nodes.push('unreachable');
    });
  },
  /unreachable stage/,
);

rejects(
  'unsupported condition operators fail before runtime use',
  ({ update }) => {
    update('decisions/rules/registry.json', (value) => {
      value.rules[0].conditions.all[0].op = 'execute';
    });
  },
  /unsupported research operator/,
);

rejects(
  'required record fields are validated',
  ({ update }) => {
    update('metrics/core/registry.json', (value) => {
      delete value.metrics[0].unit;
    });
  },
  /required property 'unit'/,
);

rejects(
  'undefined simple formula variables fail',
  ({ update }) => {
    update('metrics/finance/met-contribution-margin.json', (value) => {
      value.formula += ' + undefined_cost';
    });
  },
  /undefined formula variable undefined_cost/,
);

rejects(
  'diagnostic cycles fail while stage re-entry remains legal',
  ({ update }) => {
    update('diagnostics/growth/registry.json', (value) => {
      const tree = value.diagnostics[0];
      tree.nodes[0].true = tree.root_node;
    });
  },
  /diagnostic traversal cycle/,
);

rejects(
  'unreachable diagnostic nodes fail',
  ({ update }) => {
    update('diagnostics/growth/registry.json', (value) => {
      value.diagnostics[0].nodes.push({ id: 'orphan', next: null });
    });
  },
  /unreachable diagnostic node/,
);

rejects(
  'catalog does not hide deleted definitions',
  ({ update }) => {
    update('catalog.json', (value) => {
      value.records[0].path = '../../outside.json';
    });
  },
  /Catalog mismatch/,
);
