import { spawn } from 'node:child_process';
const build = process.argv.includes('--build');
const child = spawn(process.execPath, [process.env.npm_execpath, 'run', build ? 'build' : 'dev'], {
  env: { ...process.env, VITE_ACADEMY_PREVIEW: 'true' },
  stdio: 'inherit',
  shell: false,
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
