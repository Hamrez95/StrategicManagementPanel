import SwaggerParser from '@apidevtools/swagger-parser';
import assert from 'node:assert/strict';
const spec = await SwaggerParser.validate('docs/api/openapi.json');
const operationIds = new Set();
let count = 0;

for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'patch', 'delete'].includes(method)) continue;
    assert.ok(operation.operationId, `${method.toUpperCase()} ${path} operation ID`);
    assert.ok(
      !operationIds.has(operation.operationId),
      `Duplicate operation ID: ${operation.operationId}`,
    );
    operationIds.add(operation.operationId);
    count += 1;

    if (path.includes('{workspace_id}')) {
      assert.ok(operation.security?.length, `${path} must require a server session`);
      assert.ok(operation.responses['404'], `${path} must hide non-member resources`);
    }
    if (['post', 'patch', 'delete'].includes(method)) {
      assert.ok(
        operation.parameters.some((parameter) => parameter.name === 'X-CSRFToken'),
        `${path} CSRF`,
      );
    }
  }
}

const schemas = spec.components.schemas;
for (const name of ['Analysis', 'Decision', 'Action', 'Document', 'Attachment', 'ExportSnapshot']) {
  assert.ok(schemas[name].required.includes('workspace_id'), `${name} ownership`);
}
assert.equal(
  schemas.Attachment.properties.object_key,
  undefined,
  'Private object keys must not appear in read contracts',
);
assert.equal(schemas.Login.properties.password.writeOnly, true);
assert.equal(schemas.PaymentAttempt.properties.amount_rial.type, 'integer');

const exportCollection = spec.paths['/api/v1/workspaces/{workspace_id}/exports/'];
const exportDetail = spec.paths['/api/v1/workspaces/{workspace_id}/exports/{record_id}/'];
const exportDownload =
  spec.paths['/api/v1/workspaces/{workspace_id}/exports/{record_id}/download/'];
assert.ok(exportCollection?.get && exportCollection?.post, 'Export list and create routes');
assert.ok(exportDetail?.get, 'Export detail route');
assert.ok(exportDownload?.get, 'Export download route');
assert.ok(
  exportCollection.post.parameters.some(
    (parameter) => parameter.name === 'Idempotency-Key' && parameter.required,
  ),
);
assert.deepEqual(
  exportDownload.get.parameters.find((parameter) => parameter.name === 'format')?.schema.enum,
  ['json', 'csv', 'zip', 'xlsx', 'ai'],
);
assert.deepEqual(Object.keys(exportDownload.get.responses['200'].content).sort(), [
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'text/csv',
]);
assert.deepEqual(
  exportDownload.get.parameters.find((parameter) => parameter.name === 'language')?.schema.enum,
  ['fa', 'en'],
);
assert.ok(exportDownload.get.responses['422'], 'Oversized Excel has an explicit error, never truncated success');
assert.ok(schemas.ExportSnapshot.properties.artifact);
assert.equal(schemas.ExportSnapshot.properties.expires_at, undefined);
assert.ok(
  schemas.ImportRequest.oneOf.some((variant) =>
    variant.properties?.schema?.enum?.includes('stratino-workspace-v1'),
  ),
  'Import accepts a direct versioned report envelope',
);

console.log(
  `PASS: OpenAPI document, ${count} unique operations, Workspace ownership/CSRF, private attachments, and report/import contracts. Backend execution is not claimed.`,
);
