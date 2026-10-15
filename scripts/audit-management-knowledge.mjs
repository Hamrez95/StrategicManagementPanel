import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Reads every file. Never rewrites research, indexes, or fixtures.
export function auditKnowledge(root) {
  const errors = [];
  const warnings = [];
  const documents = new Map();
  const inventory = [];
  const visitFiles = (directory) => {
    for (const item of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, item.name);
      if (item.isSymbolicLink()) {
        errors.push(`Symlink is not allowed: ${filename}`);
        continue;
      }
      if (item.isDirectory()) {
        visitFiles(filename);
        continue;
      }
      const relative = path.relative(root, filename).replaceAll('\\', '/');
      const bytes = fs.readFileSync(filename);
      const text = bytes.toString('utf8').replace(/^\uFEFF/, '');
      inventory.push({
        path: relative,
        bytes: bytes.length,
        sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      });
      try {
        if (relative.endsWith('.json')) {
          const json = JSON.parse(text);
          // YAML's strict mapping parser also detects duplicate keys hidden by JSON.parse.
          loadYaml(text);
          documents.set(relative, json);
        } else if (/\.ya?ml$/.test(relative)) documents.set(relative, loadYaml(text));
        else if (relative.endsWith('.md') && /^---\r?\n/.test(text)) {
          const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
          if (!match) throw new Error('Unclosed Markdown frontmatter');
          documents.set(relative, loadYaml(match[1]));
        }
      } catch (error) {
        errors.push(`${relative}: ${error.message}`);
      }
    }
  };
  visitFiles(root);
  const canonical = new Map();
  const groups = Object.fromEntries(
    [
      'metrics',
      'frameworks',
      'sources',
      'diagnostics',
      'rules',
      'recommendations',
      'actions',
      'anti_patterns',
      'terms',
    ].map((kind) => [kind, []]),
  );
  const add = (kind, value, file) => {
    if (!value?.id) {
      errors.push(`${file}: ${kind} record has no ID`);
      return;
    }
    if (canonical.has(value.id)) errors.push(`Duplicate canonical ID: ${value.id}`);
    canonical.set(value.id, { kind, value, path: file });
    groups[kind].push(value);
  };
  for (const [file, document] of documents) {
    if (file.startsWith('validation/') || document?.generated_by || file === 'SOURCE_INDEX.yaml')
      continue;
    const directory = file.split('/')[0];
    if (directory === 'sources' && Array.isArray(document))
      document.forEach((value) => add('sources', value, file));
    for (const kind of Object.keys(groups)) {
      if (Array.isArray(document?.[kind]))
        document[kind]
          .filter((value) => value && typeof value === 'object')
          .forEach((value) => add(kind, value, file));
    }
    if (directory === 'diagnostics' && Array.isArray(document?.trees))
      document.trees.forEach((value) => add('diagnostics', value, file));
    if (
      ['metrics', 'frameworks', 'diagnostics'].includes(directory) &&
      document?.id &&
      !Array.isArray(document[directory])
    )
      add(directory, document, file);
  }
  const read = (file) => documents.get(file);
  const startup = read('journeys/startup/journey.json');
  const organization = read('journeys/organization/journey.json');
  const extraIds = new Set();
  for (const [file, document] of documents) {
    if (file.startsWith('validation/') || document?.generated_by) continue;
    if (document?.id) extraIds.add(document.id);
    for (const key of [
      'questions',
      'evidence_requirements',
      'policies',
      'cadences',
      'stages',
      'steps',
    ]) {
      for (const value of document?.[key] ?? [])
        if (value?.id) {
          if (extraIds.has(value.id)) errors.push(`Duplicate auxiliary ID: ${value.id}`);
          extraIds.add(value.id);
        }
    }
  }
  const walk = (value, callback, key = '') => {
    if (typeof value === 'string') callback(value, key);
    else if (Array.isArray(value)) value.forEach((child) => walk(child, callback, key));
    else if (value && typeof value === 'object')
      for (const [childKey, child] of Object.entries(value)) walk(child, callback, childKey);
  };
  for (const [file, document] of documents) {
    if (
      document?.generated_by ||
      ['catalog.json', 'SOURCE_INDEX.yaml', 'sources/source-aliases.json'].includes(file)
    )
      continue;
    const localIds = new Set();
    const collect = (value) => {
      if (value && typeof value === 'object') {
        if (typeof value.id === 'string') localIds.add(value.id);
        Object.values(value).forEach(collect);
      }
    };
    collect(document);
    walk(document, (value, key) => {
      if (
        /^(SRC|MET|FW|FRM|STR|RULE|REC|ACT|OPS|ORG|DIA|DIAG|Q-STARTUP|EV-STARTUP|CAD|JOURNEY|TAX)-[A-Za-z0-9-]+$/.test(
          value,
        ) &&
        !['id', 'recommendation_id'].includes(key) &&
        !canonical.has(value) &&
        !extraIds.has(value) &&
        !localIds.has(value)
      )
        errors.push(`${file}: unresolved ${key}: ${value}`);
      if (key === 'sources' && canonical.get(value)?.kind !== 'sources')
        errors.push(`${file}: invalid source: ${value}`);
    });
  }
  const aliases = read('sources/source-aliases.json')?.aliases ?? {};
  for (const [alias, target] of Object.entries(aliases)) {
    if (canonical.has(alias) || canonical.get(target)?.kind !== 'sources')
      errors.push(`Invalid source alias ${alias} -> ${target}`);
  }
  const assertDag = (records, dependencies, label) => {
    const map = new Map(records.map((value) => [value.id, value]));
    const active = new Set();
    const complete = new Set();
    const visit = (id) => {
      if (active.has(id)) {
        errors.push(`${label}: circular prerequisite ${id}`);
        return;
      }
      if (complete.has(id)) return;
      active.add(id);
      for (const dependency of map.get(id)?.[dependencies] ?? []) {
        if (!map.has(dependency)) errors.push(`${label}: missing prerequisite ${dependency}`);
        else visit(dependency);
      }
      active.delete(id);
      complete.add(id);
    };
    for (const id of map.keys()) visit(id);
  };
  assertDag(groups.metrics, 'dependencies', 'metrics');
  assertDag(organization?.steps ?? [], 'depends_on', 'organization');
  if (startup) {
    const stages = new Set(startup.dependency_graph.nodes);
    const reachable = new Set(['idea']);
    for (let iteration = 0; iteration < stages.size; iteration++)
      for (const edge of startup.dependency_graph.edges) {
        if (!stages.has(edge.from) || !stages.has(edge.to))
          errors.push(`Startup: dangling transition ${edge.from} -> ${edge.to}`);
        if (reachable.has(edge.from)) reachable.add(edge.to);
      }
    for (const stage of stages)
      if (!reachable.has(stage)) errors.push(`Startup: unreachable stage ${stage}`);
    for (const question of startup.questions) {
      for (const key of [
        'id',
        'answer_field',
        'why_needed',
        'decision_changed',
        'ask_when',
        'unknown_behavior',
      ])
        if (!question[key]) errors.push(`${question.id}: missing ${key}`);
      if (!question.derive_first || !question.import_from?.length)
        warnings.push(`${question.id}: review derive/import-first policy`);
    }
  }
  for (const [file, document] of documents) {
    if (document?.generated_by || file.startsWith('validation/') || Array.isArray(document))
      continue;
    if (document?.schema_version && !['0.1.0', '1.0.0'].includes(document.schema_version))
      errors.push(`${file}: unknown research schema ${document.schema_version}`);
    if (!document?.schema_version)
      warnings.push(`${file}: no document schema_version; explicit loader adapter required`);
  }
  const index = read('catalog.json');
  if (index) {
    const indexed = new Set();
    for (const item of index.records) {
      const entry = canonical.get(item.id);
      if (indexed.has(item.id)) errors.push(`Catalog duplicates ${item.id}`);
      indexed.add(item.id);
      if (!entry || entry.path !== item.path || entry.kind !== item.kind)
        errors.push(`Catalog mismatch ${item.id}`);
    }
    for (const id of canonical.keys()) if (!indexed.has(id)) errors.push(`Catalog omits ${id}`);
  }
  const sourceDepth = {};
  for (const source of groups.sources)
    sourceDepth[source.access_depth] = (sourceDepth[source.access_depth] ?? 0) + 1;
  const recommendations = groups.recommendations.map((value) => {
    const rule = canonical.get(value.trigger)?.value;
    return {
      id: value.id,
      rule: value.trigger,
      action: value.next_action,
      frameworks: rule?.frameworks ?? [],
      sources: [...new Set([...(value.sources ?? []), ...(rule?.sources ?? [])])],
    };
  });
  return {
    status: errors.length ? 'fail' : 'pass',
    scope:
      'Read-only structural audit; source existence and scientific efficacy are not certified.',
    inventory,
    counts: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length])),
    source_depth: sourceDepth,
    recommendations,
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootIndex = process.argv.indexOf('--root');
  const reportIndex = process.argv.indexOf('--report');
  const root =
    rootIndex < 0
      ? path.join(repository, 'assets/management-knowledge')
      : path.resolve(process.argv[rootIndex + 1]);
  const report = auditKnowledge(root);
  if (reportIndex >= 0) {
    const output = path.resolve(process.argv[reportIndex + 1]);
    if (output === root || output.startsWith(root + path.sep))
      throw new Error('Audit report must be outside the read-only knowledge directory');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  }
  console.log(
    JSON.stringify(
      {
        ...report,
        inventory: `${report.inventory.length} files read and hashed`,
        recommendations: `${report.recommendations.length} trace chains inspected`,
      },
      null,
      2,
    ),
  );
  process.exitCode = report.errors.length ? 1 : 0;
}
