import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';

const failures=[];
const major=Number(process.versions.node.split('.')[0]);
const minor=Number(process.versions.node.split('.')[1]);
if(major<22||(major===22&&minor<12))failures.push('Node.js 22.12+ (or supported newer LTS) is required.');
for(const path of ['.agents/skills/frontend-design/SKILL.md','.codex/skills/graphify/SKILL.md','AGENTS.md','docs/PARITY.md']){
  if(!existsSync(path))failures.push(`Missing project instruction: ${path}`);
}
const candidates=['graphify',...(process.env.STRATINO_GRAPHIFY?[process.env.STRATINO_GRAPHIFY]:[])];
let graphify;
for(const command of candidates){const result=spawnSync(command,['--version'],{encoding:'utf8'});if(result.status===0){graphify=command;console.log(result.stdout.trim());break;}}
if(!graphify)failures.push('Install uv tool install graphifyy==0.9.89 and add its bin directory to PATH, or set STRATINO_GRAPHIFY.');
if(existsSync('.agents/skills/frontend-design/SKILL.md')&&!readFileSync('.agents/skills/frontend-design/SKILL.md','utf8').includes('name: frontend-design'))failures.push('Invalid frontend-design skill.');
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log('Project instructions, frontend-design and Graphify are ready.');
