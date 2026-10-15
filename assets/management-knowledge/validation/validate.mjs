// Offline research validation only. This module is never imported by the app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import Ajv from 'ajv';
import { load as loadYaml } from 'js-yaml';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],checks=[],warnings=[];
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?files(path.join(dir,d.name)):[path.join(dir,d.name)]);}
const rel=p=>path.relative(root,p).replaceAll('\\','/');
const documents=[];
for(const f of files(root).filter(f=>f.endsWith('.json'))){
 const p=rel(f);
 if(p.startsWith('validation/')||['sources/bibliography.json','catalog.json','metrics/registry.json','frameworks/registry.json'].includes(p))continue;
 try{documents.push({path:p,data:JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''))});}catch(e){errors.push(`${p}: ${e.message}`);}
}
const groups={metrics:[],frameworks:[],sources:[],diagnostics:[],rules:[],actions:[],recommendations:[],anti_patterns:[],terms:[]};
for(const d of documents){
 if(d.path.startsWith('sources/')&&Array.isArray(d.data))for(const value of d.data)groups.sources.push({...d,value});
 if(d.path.startsWith('diagnostics/')&&Array.isArray(d.data.trees))for(const value of d.data.trees)groups.diagnostics.push({...d,value});
 for(const kind of Object.keys(groups)){
  if(Array.isArray(d.data[kind]))for(const value of d.data[kind])if(value&&typeof value==='object'&&!Array.isArray(value))groups[kind].push({...d,value});
 }
 if(d.data.id){
  const prefix=d.path.split('/')[0];
  if(['metrics','frameworks','diagnostics'].includes(prefix)&&!Array.isArray(d.data[prefix]))groups[prefix].push({...d,value:d.data});
 }
}
const ids=new Map();
for(const [kind,records] of Object.entries(groups))for(const r of records){
 if(!r.value.id){errors.push(`${r.path}: missing ${kind} ID`);continue;}
 if(ids.has(r.value.id))errors.push(`Duplicate canonical ID ${r.value.id}`);
 ids.set(r.value.id,{kind,path:r.path});
}
const metricFields='id name aliases domain business_types stages definition formula formula_variables unit direction interpretation why_it_matters leading_or_lagging dependencies required_inputs optional_inputs data_sources typical_owner update_frequency warnings limitations benchmarks benchmark_context related_metrics recommended_actions sources explanation'.split(' ');
const frameworkFields='id name purpose use_when do_not_use_when inputs outputs steps interpretation common_mistakes limitations compatible_frameworks conflicting_frameworks business_types business_stages sources explanation'.split(' ');
const sourceFields='id title author year url type reliability notes last_reviewed access_depth supported_claims'.split(' ');
const specs={metrics:metricFields,frameworks:frameworkFields,sources:sourceFields,rules:'id conditions evidence confidence exceptions recommended_action explanation frameworks sources unknown_behavior'.split(' '),actions:'id name context required_information steps outputs risks sources'.split(' '),recommendations:'id recommendation_id trigger business_context severity confidence reason expected_impact next_action alternative_actions required_information risks sources'.split(' '),anti_patterns:'id symptoms risks how_to_detect recommended_response sources'.split(' '),terms:'id simple_explanation professional_definition formula example related_concepts common_confusion sources'.split(' ')};
const ajv=new Ajv({allErrors:true,strict:false});
const schema={schema_version:'0.1.0',description:'Record contracts used by the offline validation. Fields not marked as strings accept documented domain variants; no claim of a unified production runtime schema.',contracts:{}};
for(const [kind,required] of Object.entries(specs)){
 const properties={id:{type:'string',minLength:1},sources:{type:'array',minItems:1,items:{type:'string',minLength:1}}};
 if(kind==='metrics')Object.assign(properties,{formula:{type:'string',minLength:1},formula_variables:{type:'object',minProperties:1},required_inputs:{type:'array',minItems:1,items:{type:'string'}},business_types:{type:'array',minItems:1},stages:{type:'array',minItems:1},benchmarks:{type:'array'},dependencies:{type:'array',items:{type:'string'}}});
 if(kind==='frameworks')for(const k of ['use_when','do_not_use_when','inputs','outputs','steps','limitations','business_types','business_stages'])properties[k]={type:'array',minItems:1};
 if(['metrics','frameworks'].includes(kind))properties.explanation={type:'object',required:['quick','learn','deep_dive'],properties:Object.fromEntries(['quick','learn','deep_dive'].map(k=>[k,{type:'string',minLength:1}]))};
 if(kind==='sources')Object.assign(properties,{url:{type:'string',pattern:'^https?://'},year:{type:['integer','null']},access_depth:{enum:['full_text','relevant_sections','abstract_only','search_excerpt','metadata_only','unavailable']},last_reviewed:{type:'string',pattern:'^\\d{4}-\\d{2}-\\d{2}$'},supported_claims:{type:'array',minItems:1}});
 const contract={type:'object',required,properties};schema.contracts[kind]=contract;
 const validate=ajv.compile(contract);
 for(const r of groups[kind])if(!validate(r.value))errors.push(`${r.path} ${r.value.id}: ${ajv.errorsText(validate.errors)}`);
}
function walk(value,fn,key=''){if(typeof value==='string')fn(value,key);else if(Array.isArray(value))value.forEach(x=>walk(x,fn,key));else if(value&&typeof value==='object')for(const [k,v]of Object.entries(value))walk(v,fn,k);}
for(const d of documents)walk(d.data,(value,key)=>{
 if(/^(SRC-|MET-|FW-|STR-|FRM-|RULE-|REC-|ACT-|OPS-|ORG-|DIA-|DIAG-)/.test(value)&&/^[A-Za-z0-9-]+$/.test(value)&&key!=='id'&&key!=='recommendation_id'){
  const localSteps=new Set((d.data.steps??[]).map(s=>s.id));
  if(!ids.has(value)&&!localSteps.has(value))errors.push(`${d.path}: unresolved ${key} ${value}`);
 }
});
function assertDag(records,key,label){
 const map=new Map(records.map(r=>[r.value.id,r.value]));const active=new Set(),done=new Set();
 function visit(id){if(active.has(id)){errors.push(`${label}: cycle at ${id}`);return;}if(done.has(id))return;active.add(id);
  for(const child of map.get(id)?.[key]??[]){if(!map.has(child))errors.push(`${label}: missing dependency ${child}`);else visit(child);}
  active.delete(id);done.add(id);
 }for(const id of map.keys())visit(id);
}
assertDag(groups.metrics,'dependencies','metric computational dependencies');
for(const r of groups.diagnostics){
 const nodes=r.value.nodes;
 if(!Array.isArray(nodes)){warnings.push(`${r.path}: custom diagnostic structure needs a dedicated adapter`);continue;}
 const targets=[...nodes.map(n=>n.id),...(r.value.terminal_outcomes??[]).map(n=>typeof n==='string'?n:n.id),...(r.value.outcomes??[]).map(n=>n.id)];
 const local=new Set(targets);
 if(local.size!==targets.length)errors.push(`${r.path}: duplicate diagnostic node or outcome`);
 const entry=r.value.entry_node??r.value.root_node??r.value.entry;
 if(entry&&!local.has(entry))errors.push(`${r.path}: invalid diagnostic entry ${entry}`);
 for(const n of nodes){
  const external=new Set(r.data.evaluation_contract?.collect_evidence?['collect_evidence']:[]);
  for(const b of n.branches??[]){const target=b.next_node??b.target;if(target&&!local.has(target)&&!external.has(target))errors.push(`${r.path}: missing diagnostic branch ${target}`);}
  for(const k of ['if_yes','if_no','if_unknown','true','false','unknown','next','no_branch_supported'])if(n[k]&&!local.has(n[k])&&!external.has(n[k]))errors.push(`${r.path}: missing diagnostic ${k} ${n[k]}`);
 }
}
const org=read('journeys/organization/journey.json');
assertDag(org.steps.map(value=>({value})),'depends_on','organization prerequisites');
const startup=read('journeys/startup/journey.json');
if(startup.dependency_graph){const g=startup.dependency_graph;const nodes=new Set(g.nodes.map(n=>typeof n==='string'?n:n.id));for(const e of g.edges)if(!nodes.has(e.from)||!nodes.has(e.to))errors.push(`Startup graph: missing edge endpoint ${e.from} -> ${e.to}`);}

// Narrow, three-valued interpretation used only to check declarative fixtures.
function condition(c,p){if(!['eq','neq','in'].includes(c.op))throw new Error(`Unsupported offline operator ${c.op}`);if(p[c.field]===undefined||p[c.field]===null)return 'unknown';return c.op==='in'?c.value.includes(p[c.field]):c.op==='neq'?p[c.field]!==c.value:p[c.field]===c.value;}
function matches(rule,p){const values=rule.conditions.all.map(c=>condition(c,p));return values.includes(false)?false:values.includes('unknown')?'unknown':true;}
const ruleMap=new Map(groups.rules.filter(r=>r.path.startsWith('decisions/')).map(r=>[r.value.id,r.value]));
const routing=read('validation/routing-contract.json');
function plan(p){let matched=[...ruleMap.values()].filter(r=>matches(r,p)===true);if(matched.some(r=>r.id===routing.journey_policy.cash_interrupt))matched=matched.filter(r=>r.id===routing.journey_policy.cash_interrupt);
 const candidates=routing.candidates.filter(c=>matched.some(r=>r.id===c.rule));
 const questions=[...new Set(candidates.flatMap(c=>c.questions).filter(q=>p[q]===undefined||p[q]===null))];
 const metrics=[...new Set(candidates.flatMap(c=>[...c.metrics,...(c.conditional_metrics??[]).filter(m=>condition(m.when,p)===true).map(m=>m.metric)]))];
 const journey=routing.journey_policy.startup_stages.includes(p.stage)?'startup':routing.journey_policy.organization_stages.includes(p.stage)?'organization':'ask_search_vs_execution';
 return {rules:matched.map(r=>r.id),questions,metrics,journey};
}
const personaResults=[];
for(const f of read('validation/personas.json').personas){try{const actual=plan(f.profile);assert.deepEqual(actual.rules.sort(),[...f.expected_rules].sort());assert.equal(actual.journey,f.expected_journey);assert.ok(actual.questions.length<=f.max_next_questions);assert.deepEqual(actual.metrics.sort(),[...f.expected_metrics].sort());for(const x of f.forbidden_questions)assert.ok(!actual.questions.includes(x));for(const x of f.forbidden_metrics)assert.ok(!actual.metrics.includes(x));for(const id of actual.metrics){assert.ok(ids.has(id),`Missing metric ${id}`);const metric=groups.metrics.find(m=>m.value.id===id).value;assert.ok(metric.stages.includes(f.profile.stage),`Metric ${id} excludes persona stage ${f.profile.stage}`);}personaResults.push({id:f.id,status:'pass',description:f.description,actual});}catch(e){errors.push(`Persona ${f.id}: ${e.message}`);personaResults.push({id:f.id,status:'fail',error:e.message});}}
function check(name,fn){try{fn();checks.push({name,status:'pass'});}catch(e){errors.push(`${name}: ${e.message}`);checks.push({name,status:'fail',error:e.message});}}
check('unknown never becomes a positive match',()=>{assert.equal(matches(ruleMap.get('RULE-RETENTION-BEFORE-SCALE'),{stage:'early-traction',scale_acquisition_requested:true}),'unknown');assert.equal(plan({}).rules.length,0);assert.equal(plan({}).journey,'ask_search_vs_execution');});
check('explicit false suppresses unrelated rule despite other unknowns',()=>assert.equal(matches(ruleMap.get('RULE-INVENTORY-DIAGNOSIS'),{archetype:'service'}),false));
check('null is not zero or healthy',()=>assert.equal(matches(ruleMap.get('RULE-CASH-TRIAGE'),{cash_obligation_at_risk:null}),'unknown'));
check('cash risk interrupts routine plan',()=>assert.deepEqual(plan({stage:'idea',operating:false,cash_obligation_at_risk:true}).rules,['RULE-CASH-TRIAGE']));
check('headcount cannot infer lifecycle',()=>assert.equal(plan({employees:2000}).journey,'ask_search_vs_execution'));
check('one-off value does not automatically trigger repeat retention advice',()=>assert.ok(!plan({stage:'early-traction',scale_acquisition_requested:true,retention_evidence:'not_applicable_one_off'}).rules.includes('RULE-RETENTION-BEFORE-SCALE')));
check('dropship context does not receive inventory metric',()=>assert.ok(!plan({stage:'growth',archetype:'ecommerce',contribution_visibility:'missing',inventory_owned:false}).metrics.includes('MET-CASH-CONVERSION-CYCLE')));
check('verified imported fields suppress repeated questions',()=>assert.equal(plan({stage:'idea',operating:false,customer_problem_hypothesis:'Reviewed imported statement'}).questions.length,0));
check('recommendation trace resolves to rule, action, framework and source',()=>{for(const r of groups.recommendations){const rule=ruleMap.get(r.value.trigger);assert.ok(rule);assert.ok(ids.has(r.value.next_action));for(const id of rule.frameworks){const framework=groups.frameworks.find(f=>f.value.id===id);assert.ok(framework);for(const source of framework.value.sources)assert.equal(ids.get(source)?.kind,'sources');}}});
const outputs=['insight','decision','action','kpi','initiative','experiment','risk','no_action'];
check('actions terminate in allowed practical outputs',()=>{for(const r of groups.actions)for(const out of r.value.outputs)assert.ok(outputs.includes(out));});
const fieldMap=read('taxonomy/field-mapping.json');
function normalizeFixture(original){const p={...original};for(const a of fieldMap.aliases){if(p[a.from]!==undefined){if(p[a.to]!==undefined&&p[a.to]!==p[a.from])return {conflict:true};p[a.to]=p[a.from];}}const aggregate=fieldMap.conditional_aggregation;if(p.repeatability_scope===aggregate.requires.repeatability_scope&&aggregate.mapping[p[aggregate.from]]){const value=aggregate.mapping[p[aggregate.from]];if(p[aggregate.to]!==undefined&&p[aggregate.to]!==value)return {conflict:true};p[aggregate.to]=value;}return p;}
check('reviewed field aliases give consistent retention caution across two registries',()=>{const p=normalizeFixture({stage_id:'early-traction',material_acquisition_expansion_requested:true,repeatability_scope:'cohort_retention',repeatability_evidence_status:'stale'});assert.equal(matches(ruleMap.get('RULE-RETENTION-BEFORE-SCALE'),p),true);const supplemental=groups.rules.find(r=>r.value.id==='RULE-STARTUP-RETENTION-BEFORE-EXPANSION').value;assert.equal(matches(supplemental,p),true);assert.equal(p.repeatability_evidence_status,'stale');});
check('non-retention repeatability cannot silently become retention evidence',()=>{const p=normalizeFixture({stage_id:'early-traction',material_acquisition_expansion_requested:true,repeatability_scope:'delivery',repeatability_evidence_status:'missing'});assert.equal(p.retention_evidence,undefined);assert.equal(matches(ruleMap.get('RULE-RETENTION-BEFORE-SCALE'),p),'unknown');});
check('contradictory aliases require review',()=>assert.equal(normalizeFixture({stage:'idea',stage_id:'scale'}).conflict,true));
check('cash, margin and inventory routes link relevant domain knowledge',()=>{assert.ok(ruleMap.get('RULE-CASH-TRIAGE').frameworks.includes('FRM-FINANCE-PROFIT-CASH-BRIDGE'));assert.ok(ruleMap.get('RULE-SERVICE-MARGIN').sources.includes('SRC-FINANCE-contribution'));assert.ok(ruleMap.get('RULE-INVENTORY-DIAGNOSIS').frameworks.includes('OPS-LEAN-THINKING'));});

// Check simple calculation identities and guards independently of formula strings.
// The knowledge formula specifications are not executable product calculations.
function ratio(n,d){return Number.isFinite(n)&&Number.isFinite(d)&&d>0?n/d:null;}
check('finance guard fixtures: margin, negative profit, zero denominator and runway',()=>{assert.equal(ratio(40,100)*100,40);assert.equal(ratio(-20,100)*100,-20);assert.equal(ratio(0,0),null);assert.equal(ratio(120,30),4);assert.equal(ratio(120,-5),null);assert.equal(ratio(null,10),null);});
check('cohort fixtures distinguish observation eligibility',()=>{assert.equal(ratio(3,5)*100,60);assert.equal(ratio(3,10)*100,30);assert.equal(ratio(0,0),null);});

const bibliography=groups.sources.map(r=>({...r.value,canonical_file:r.path})).sort((a,b)=>a.id.localeCompare(b.id));
const save=(p,x)=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),typeof x==='string'?x:JSON.stringify(x,null,2)+'\n');};
const counts=Object.fromEntries(Object.entries(groups).map(([kind,rs])=>[kind,rs.length]));
const cited=Object.fromEntries(Object.entries(groups).filter(([k])=>k!=='sources').map(([kind,rs])=>[kind,{total:rs.length,with_sources:rs.filter(r=>r.value.sources?.length).length}]));
const report={reviewed_at:'2026-10-15',status:errors.length?'fail':'pass',scope:'Structural and synthetic fixture checks only; no runtime/UI integration or empirical expert validation.',counts,citation_presence:cited,persona_results:personaResults,checks,errors,warnings,not_tested:['Scientific efficacy of each framework','Real user journey length or usability','Metric formula execution from record strings','All startup conditional questions/rules or import mappings','Statistical confidence calibration','Local regulatory/accounting applicability','Live web link availability during this validation']};
save('validation/record-contracts.json',schema);
save('validation/report.json',report);
save('sources/bibliography.json',{schema_version:'0.1.0',generated_by:'validation/validate.mjs',sources:bibliography});
save('SOURCE_INDEX.yaml','schema_version: \'0.1.0\'\nreviewed_at: \'2026-10-15\'\nstatus: research_in_progress\ncanonical_source_files:\n'+[...new Set(groups.sources.map(r=>r.path))].sort().map(p=>'  - '+JSON.stringify(p)+'\n').join('')+'sources:\n'+bibliography.map(s=>'  - id: '+JSON.stringify(s.id)+'\n    file: '+JSON.stringify(s.canonical_file)+'\n    url: '+JSON.stringify(s.url)+'\n    access_depth: '+JSON.stringify(s.access_depth)+'\n').join(''));
const sourceIndex=loadYaml(fs.readFileSync(path.join(root,'SOURCE_INDEX.yaml'),'utf8'));
assert.equal(sourceIndex.sources.length,bibliography.length,'YAML source index must round-trip without losing records');
save('catalog.json',{schema_version:'0.1.0',generated_by:'validation/validate.mjs',records:[...ids.entries()].map(([id,r])=>({id,...r})).sort((a,b)=>a.id.localeCompare(b.id))});
for(const kind of ['metrics','frameworks'])save(`${kind}/registry.json`,{schema_version:'0.1.0',generated_by:'validation/validate.mjs',policy:'Index only; definitions live in canonical files.',records:groups[kind].map(r=>({id:r.value.id,path:r.path}))});
save('validation/PERSONA_VALIDATION_REPORT.md','# Persona validation — 2026-10-15\n\nSynthetic offline contract checks, not user research or a production engine. Profiles add explicit problem/evidence conditions to the six supplied personas; headcount never establishes stage.\n\n'+personaResults.map(r=>`- ${r.id}: ${r.status}; ${r.description}${r.actual?`; next questions=${r.actual.questions.length}; metrics=${r.actual.metrics.join(', ')||'none'}`:''}`).join('\n')+'\n\nChecks verify only eight curated rule routes and their question/metric selections. Startup graph, full questionnaires, financial input mappings and scientific validity need expert and user review. Unknown condition fields defer the rule and cannot mean a healthy business.\n');
console.log(JSON.stringify({status:report.status,counts,personas:personaResults.map(r=>({id:r.id,status:r.status})),checks:checks.length,errors,warnings},null,2));
process.exitCode=errors.length?1:0;
