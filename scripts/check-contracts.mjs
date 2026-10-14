import SwaggerParser from '@apidevtools/swagger-parser';
import assert from 'node:assert/strict';
const spec=await SwaggerParser.validate('docs/api/openapi.json');
const names=new Set();let count=0;
for(const [path,item] of Object.entries(spec.paths))for(const [method,operation] of Object.entries(item)){
 if(!['get','post','patch','delete'].includes(method))continue;
 assert.ok(operation.operationId);assert.ok(!names.has(operation.operationId));names.add(operation.operationId);count++;
 if(path.includes('{workspace_id}'))assert.ok(operation.security?.length,`${path} must require server session`);
 if(['post','patch','delete'].includes(method))assert.ok(operation.parameters.some(p=>p.name==='X-CSRFToken'),`${path} CSRF`);
 if(path.includes('{workspace_id}'))assert.ok(operation.responses['404'],`${path} non-member privacy response`);
}
const s=spec.components.schemas;
for(const name of ['Analysis','Decision','Action','Document','Attachment','ExportSnapshot'])assert.ok(s[name].required.includes('workspace_id'),`${name} ownership`);
assert.equal(s.Attachment.properties.object_key,undefined,'Private object keys must not appear in read contract');
assert.equal(s.Login.properties.password.writeOnly,true);
assert.equal(s.PaymentAttempt.properties.amount_rial.type,'integer');
console.log(`PASS: OpenAPI document, ${count} unique operations, server ownership/CSRF and private attachment contract. Backend execution is not claimed.`);
