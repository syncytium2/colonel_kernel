// Start the dev server for the lab page (ADR-0053) on a port that has been TESTED free,
// and say which checkout and commit it is serving.
//
//   npm run lab-dev                 first free port from 5181
//   npm run lab-dev -- 5190         first free port from 5190
//
// Why: on a shared machine other apps and other sessions hold dev-server ports (5173 is often
// cerebro's), and a colonel_kernel server started from another worktree can be serving an old
// commit. Picking a port by assumption, or letting Vite drift to the next one quietly, is how
// the wrong page ends up on screen. This probes each port first, then starts Vite with
// --strictPort on the one it found, so the port it prints is the port that serves.
import net from 'node:net';
import { spawn, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const start = Number(process.argv[2] ?? 5181);
if (!Number.isInteger(start) || start < 1024 || start > 65000) throw new Error(`not a port: ${process.argv[2]}`);

// Free on BOTH loopbacks: Vite listens on "localhost", which can resolve to ::1 or 127.0.0.1.
function freeOn(port, host) {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once('error', (e) => resolve(e.code === 'EADDRNOTAVAIL' || e.code === 'EAFNOSUPPORT')); // no such stack: not a conflict
    s.once('listening', () => s.close(() => resolve(true)));
    s.listen(port, host);
  });
}
async function isFree(port) {
  return (await freeOn(port, '127.0.0.1')) && (await freeOn(port, '::1'));
}

let port = start;
const taken = [];
while (!(await isFree(port))) {
  taken.push(port);
  if (++port > start + 50) throw new Error(`no free port in ${start}-${start + 50}`);
}

const git = (cmd) => {
  try {
    return execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '?';
  }
};
const dirty = git('status --porcelain') ? ' (uncommitted changes)' : '';
console.log(`lab-dev: checkout ${root}`);
console.log(`lab-dev: branch ${git('rev-parse --abbrev-ref HEAD')} at ${git('log -1 --format="%h %s"')}${dirty}`);
if (taken.length) console.log(`lab-dev: ports in use, skipped: ${taken.join(', ')}`);
console.log(`lab-dev: recordings folder ${process.env.CK_LAB_RAW_DIR || '(CK_LAB_RAW_DIR not set: exports/ only)'}`);
console.log(`lab-dev: open http://localhost:${port}/#lab\n`);

// A port can be taken between the probe and Vite's bind; --strictPort makes that an error,
// never a silent move to another port.
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const child = spawn(process.execPath, [vite, '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 0));
