// Wrapper that just invokes the server's migration runner. Useful when
// running migrations from the repo root during CI without changing dirs.
import { spawn } from 'node:child_process';
import path from 'node:path';

const cwd = path.resolve(__dirname, '../packages/server');
const child = spawn('npm', ['run', 'db:migrate'], { cwd, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
