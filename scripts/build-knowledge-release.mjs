import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseCandidates = {
  'stratino-first-slice-v1': {
    curationPath: 'apps/api/modules/knowledge/curation/first-slice-v1.json',
    releasePath: 'apps/api/modules/knowledge/releases/stratino-first-slice-v1.json',
  },
  'stratino-first-slice-v2': {
    curationPath: 'apps/api/modules/knowledge/curation/first-slice-v2.json',
    releasePath: 'apps/api/modules/knowledge/releases/stratino-first-slice-v2.json',
  },
};
const defaultReleaseId = 'stratino-first-slice-v1';
const releaseSchemaVersion = 1;
const canonicalization = 'json-sort-keys-compact-utf8-no-newline-v1';

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortJson(value));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function readJsonBuffer(buffer, label) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 JSON: ${error.message}`);
  }
}

function readAtCommit(commit, relativePath) {
  return execFileSync('git', ['show', `${commit}:${relativePath}`], { cwd: repositoryRoot });
}

function parsePinnedFile(commit, relativePath) {
  const portablePath = relativePath.replaceAll('\\', '/');
  if (
    !portablePath.startsWith('assets/management-knowledge/') ||
    path.posix.isAbsolute(portablePath) ||
    portablePath.split('/').includes('..')
  ) {
    throw new Error(`Knowledge path escapes the repository: ${relativePath}`);
  }
  const committed = readJsonBuffer(readAtCommit(commit, portablePath), portablePath);
  const localPath = path.resolve(repositoryRoot, portablePath);
  if (!localPath.startsWith(`${repositoryRoot}${path.sep}`)) {
    throw new Error(`Knowledge path escapes the repository: ${portablePath}`);
  }
  const working = readJsonBuffer(readFileSync(localPath), portablePath);
  if (canonicalJson(working) !== canonicalJson(committed)) {
    throw new Error(`Working knowledge file differs from pinned commit ${commit}: ${portablePath}`);
  }
  return committed;
}

function findRecord(value, id) {
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findRecord(child, id);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (value.id === id) return value;
  for (const child of Object.values(value)) {
    const found = findRecord(child, id);
    if (found) return found;
  }
  return null;
}

export function assertSourceSchema(id, source, curation) {
  if (String(source.schema_version) !== curation.source_schema)
    throw new Error(`${id} source schema changed.`);
}

export function assertRecordRevision(id, source, curation) {
  if (sha256(canonicalJson(source)) !== curation.revision)
    throw new Error(`${id} revision changed; review the source before rebuilding.`);
}

export function assertRuleOperators(id, source) {
  const operators = source.conditions?.all?.map((condition) => condition.op) ?? [];
  if (operators.some((operator) => operator !== 'eq'))
    throw new Error(`${id} contains an unapproved condition operator.`);
}

export function assertDependencyClosure(
  id,
  declared,
  candidates,
  sources,
  directDependencies = [],
) {
  for (const dependency of directDependencies) {
    if (!declared.includes(dependency)) {
      throw new Error(`${id} is missing its direct reviewed dependency ${dependency}.`);
    }
  }
  for (const dependency of declared) {
    if (!candidates.has(dependency) && !sources.has(dependency))
      throw new Error(`${id} has an unreviewed dependency ${dependency}.`);
  }
}

export function assertSourceReferences(id, refs, sources) {
  for (const ref of refs) {
    if (!sources.has(ref.source_id))
      throw new Error(`${id} refers to an unreviewed source ${ref.source_id}.`);
    if (!ref.section?.trim()) throw new Error(`${id} has an empty claim-level source section.`);
  }
}

export function assertNoRawApplicabilityTags(id, definition) {
  if (Object.hasOwn(definition, 'business_types') || Object.hasOwn(definition, 'stages')) {
    throw new Error(`${id} may not project raw applicability tags.`);
  }
}

function collectDirectDependencies(id, source) {
  const dependencies = new Set(source.sources ?? []);
  if (id.startsWith('RULE-')) {
    for (const dependency of source.frameworks ?? []) dependencies.add(dependency);
    if (source.recommended_action) dependencies.add(source.recommended_action);
  } else if (id.startsWith('REC-')) {
    if (source.trigger) dependencies.add(source.trigger);
    if (source.next_action) dependencies.add(source.next_action);
  }
  return dependencies;
}

function normalizeDefinition(id, source, curation, runtimeGates) {
  let gate = runtimeGates.find((item) => item.record_id === id);
  if (!gate && (id.startsWith('REC-') || id.startsWith('ACT-'))) {
    const owningRule = curation.depends_on.find((dependency) => dependency.startsWith('RULE-'));
    const inherited = runtimeGates.find((item) => item.record_id === owningRule);
    if (inherited) gate = { ...inherited, inherited_from: owningRule };
  }
  const runtimeGate = gate
    ? {
        status: gate.status,
        fields: gate.fields,
        reason: gate.reason,
        ...(gate.inherited_from ? { inherited_from: gate.inherited_from } : {}),
      }
    : { status: 'context_only' };
  const deps = [...curation.depends_on].sort();

  if (id.startsWith('FW-')) {
    const provenance = source.provenance ?? {};
    return {
      id,
      name: source.name,
      purpose: source.purpose,
      source_supported_elements: provenance.source_supported ?? [],
      derived_guidance: provenance.derived_guidance ?? [],
      limitations: source.limitations ?? [],
      validation_status: source.validation_status ?? 'not_recorded',
      dependencies: deps,
      runtime_gate: runtimeGate,
    };
  }

  if (id.startsWith('RULE-')) {
    assertRuleOperators(id, source);
    return {
      id,
      conditions: source.conditions,
      evidence_required: source.evidence,
      minimum_candidate_confidence: source.confidence?.minimum_for_candidate,
      candidate_action_gate: source.confidence?.action_gate,
      exceptions: source.exceptions ?? [],
      unknown_behavior: source.unknown_behavior,
      human_review_required: source.human_review_required === true,
      outputs: source.outputs ?? [],
      dependencies: deps,
      runtime_gate: runtimeGate,
    };
  }

  if (id.startsWith('REC-')) {
    return {
      id,
      trigger_rule_id: source.trigger,
      reason: source.reason,
      severity: source.severity,
      confidence_policy: source.confidence,
      expected_impact: source.expected_impact,
      required_information: source.required_information ?? [],
      alternatives: source.alternative_actions ?? [],
      risks: source.risks ?? [],
      next_action_id: source.next_action,
      dependencies: deps,
      runtime_gate: runtimeGate,
    };
  }

  if (id.startsWith('ACT-')) {
    if (!Array.isArray(source.steps) || source.steps.length === 0)
      throw new Error(`${id} has no reviewed action steps.`);
    return {
      id,
      required_information: source.required_information ?? [],
      steps: source.steps,
      outputs: source.outputs ?? [],
      stop_condition: source.stop_condition,
      risks: source.risks ?? [],
      dependencies: deps,
      runtime_gate: runtimeGate,
    };
  }

  if (id === 'MET-CONTRIBUTION-MARGIN') {
    return {
      id,
      definition: source.definition,
      formula_prose_non_executable: source.formula,
      unit: source.unit,
      required_inputs: source.required_inputs,
      limitations: source.limitations ?? [],
      benchmark_available: Array.isArray(source.benchmarks) && source.benchmarks.length > 0,
      dependencies: deps,
      runtime_gate: runtimeGate,
    };
  }

  throw new Error(`No explicit reviewed adapter exists for ${id}.`);
}

export function buildKnowledgeRelease(releaseId = defaultReleaseId) {
  const candidate = releaseCandidates[releaseId];
  if (!candidate) throw new Error(`Unknown reviewed release candidate ${releaseId}.`);
  const manifest = readJsonBuffer(
    readFileSync(path.join(repositoryRoot, candidate.curationPath)),
    candidate.curationPath,
  );
  if (manifest.manifest_schema_version !== 1 || manifest.candidate_id !== releaseId) {
    throw new Error('Unsupported curation manifest schema or candidate ID.');
  }
  if (manifest.status !== 'reviewed_curation_only_not_packaged_or_active') {
    throw new Error('The curation manifest is not in its reviewed, non-active state.');
  }
  if (!/^[0-9a-f]{40}$/.test(manifest.source_kb_commit))
    throw new Error('The knowledge source commit must be a full lowercase Git SHA.');
  const candidates = new Map(manifest.records.map((item) => [item.id, item]));
  if (candidates.size !== 9 || candidates.size !== manifest.records.length)
    throw new Error('The reviewed first-slice allowlist must contain exactly nine unique records.');
  const sources = new Map(manifest.sources.map((item) => [item.id, item]));
  if (sources.size !== manifest.sources.length)
    throw new Error('The source allowlist contains duplicate IDs.');

  const normalizedRecords = {};
  for (const id of [...candidates.keys()].sort()) {
    const curation = candidates.get(id);
    const normalizedSourcePath = curation.source_path.replaceAll('\\', '/');
    if (!normalizedSourcePath.startsWith('assets/management-knowledge/'))
      throw new Error(`${id} source is outside the canonical knowledge tree.`);
    const sourceFile = parsePinnedFile(manifest.source_kb_commit, normalizedSourcePath);
    const source = findRecord(sourceFile, id);
    if (!source) throw new Error(`${id} does not exist at the pinned knowledge commit.`);
    assertSourceSchema(id, source, curation);
    assertRecordRevision(id, source, curation);
    if (
      curation.source_support?.status !== 'product_heuristic' ||
      !curation.source_support.rationale?.trim()
    ) {
      throw new Error(`${id} must retain its reviewed product-heuristic label and rationale.`);
    }
    assertDependencyClosure(
      id,
      curation.depends_on,
      candidates,
      sources,
      collectDirectDependencies(id, source),
    );
    assertSourceReferences(id, curation.source_support.refs, sources);
    const definition = normalizeDefinition(id, source, curation, manifest.runtime_gates);
    const allowedProjection = [...curation.allowlisted_projection_fields].sort();
    const actualProjection = Object.keys(definition).sort();
    if (JSON.stringify(actualProjection) !== JSON.stringify(allowedProjection)) {
      throw new Error(`${id} normalized projection differs from its reviewed field allowlist.`);
    }
    assertNoRawApplicabilityTags(id, definition);
    normalizedRecords[id] = {
      source_schema: curation.source_schema,
      revision: curation.revision,
      adapter_id: curation.adapter_id,
      source_support: curation.source_support,
      definition,
    };
  }

  for (const [id, sourceEntry] of sources) {
    const canonicalPath = sourceEntry.canonical_evidence_path.replaceAll('\\', '/');
    const bibliographyPath = sourceEntry.bibliography_path.replaceAll('\\', '/');
    const canonicalRecord = findRecord(
      parsePinnedFile(manifest.source_kb_commit, canonicalPath),
      id,
    );
    const bibliographyRecord = findRecord(
      parsePinnedFile(manifest.source_kb_commit, bibliographyPath),
      id,
    );
    if (!canonicalRecord || !bibliographyRecord)
      throw new Error(`Source ${id} is absent from its pinned evidence or bibliography file.`);
    if (sha256(canonicalJson(bibliographyRecord)) !== sourceEntry.bibliography_revision)
      throw new Error(`Bibliography revision changed for ${id}.`);
    if (sourceEntry.source_schema !== 'unversioned-bibliography-entry')
      throw new Error(`Source ${id} has an unreviewed bibliography schema.`);
  }

  const rejectedRecords = [
    {
      record_id: 'MET-ACTIVATION-RATE',
      reason_code: 'unmapped_applicability',
      source_schema: '0.1.0',
    },
    { record_id: 'PLAN-MARKET-SIZING', reason_code: 'unreviewed_record', source_schema: '0.1.0' },
  ];
  const sourceIds = [...sources.keys()].sort();
  const release = {
    release_id: releaseId,
    schema_version: releaseSchemaVersion,
    source_kb_commit: manifest.source_kb_commit,
    content_sha256: '',
    canonicalization,
    generated_by: 'scripts/build-knowledge-release.mjs',
    approved_ids: Object.keys(normalizedRecords).sort(),
    source_ids: sourceIds,
    rejected_records: rejectedRecords,
    records: normalizedRecords,
  };
  const { content_sha256: _digest, ...unsigned } = release;
  release.content_sha256 = sha256(canonicalJson(unsigned));
  return release;
}

export function renderKnowledgeRelease(release) {
  return `${JSON.stringify(release, null, 2)}\n`;
}

const checkOnly = process.argv.includes('--check');
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const releaseArgumentIndex = process.argv.indexOf('--release');
  const selectedReleaseId =
    releaseArgumentIndex === -1
      ? defaultReleaseId
      : process.argv[releaseArgumentIndex + 1];
  const candidate = releaseCandidates[selectedReleaseId];
  if (!candidate) throw new Error(`Unknown reviewed release candidate ${selectedReleaseId}.`);
  const target = path.join(repositoryRoot, candidate.releasePath);
  const expected = renderKnowledgeRelease(buildKnowledgeRelease(selectedReleaseId));
  if (checkOnly) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== expected) {
      console.error(`Knowledge release is missing or stale: ${candidate.releasePath}`);
      process.exitCode = 1;
    } else {
      console.log(`Knowledge release is reproducible: ${candidate.releasePath}`);
    }
  } else {
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, expected, { encoding: 'utf8' });
    console.log(`Wrote ${candidate.releasePath}`);
  }
}
