#!/usr/bin/env python3
"""Run a command against MIRA's dedicated persistent Pinecone test catalogue."""
from pathlib import Path
import os
import json
import subprocess
import sys
import time

project = Path(__file__).resolve().parents[1]
state = project / '.mira-local-data' / 'pinecone-nine-entry-test'
state.mkdir(parents=True, exist_ok=True, mode=0o700)
state.chmod(0o700)
socket = state / 'db.sock'
binary = Path('/opt/homebrew/opt/mariadb/bin')
if not sys.argv[1:]:
    raise SystemExit('Pass prepare|status|check|approved-seed|reconcile|verify and the explicit work directory.')
if (state / 'database.pid').exists():
    try:
        os.kill(int((state / 'database.pid').read_text().strip()), 0)
    except (ProcessLookupError, ValueError):
        pass
    else:
        raise SystemExit('The dedicated Pinecone test database is already running; inspect before reuse.')
lock = state / 'launcher.lock'
with lock.open('x') as handle:
    handle.write(str(os.getpid()))
process = None
try:
    with (state / 'database.log').open('a') as log:
        if not (state / 'database' / 'mysql').exists():
            subprocess.run([str(binary / 'mariadb-install-db'), '--no-defaults', f'--datadir={state / "database"}',
                            '--auth-root-authentication-method=normal', '--skip-test-db'], stdout=log, stderr=subprocess.STDOUT, check=True)
        process = subprocess.Popen([str(binary / 'mariadbd'), '--no-defaults', f'--datadir={state / "database"}',
                                    f'--socket={socket}', f'--pid-file={state / "database.pid"}', '--skip-networking',
                                    '--innodb-buffer-pool-size=64M'], stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 20
        while subprocess.run([str(binary / 'mariadb-admin'), '--no-defaults', f'--socket={socket}', '--user=root', 'ping'],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            if process.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError('Dedicated test database failed to start; see its local log.')
            time.sleep(0.1)
        build = state / 'runner.mjs'
        subprocess.run([str(project / 'node_modules/.bin/esbuild'), 'scripts/mira-pinecone-isolated-test.mts',
                        '--platform=node', '--packages=external', '--bundle', '--format=esm', f'--outfile={build}'], cwd=project, check=True)
        env = {**os.environ, 'LANGSMITH_TRACING': 'false', 'LANGCHAIN_TRACING': ''}
        if sys.argv[1] == 'check':
            if len(sys.argv) != 3:
                raise SystemExit('Use check with one explicit work directory.')
            work = Path(sys.argv[2]).resolve()
            subprocess.run(['node', str(build), 'prepare', str(work)], cwd=project, env=env, check=True)
            original = (work / 'release-and-seed-plan.json').read_bytes()
            denied = subprocess.run(['node', str(build), 'approved-seed', str(work)], cwd=project, env=env, capture_output=True, text=True)
            if denied.returncode != 1 or 'Explicit approval file required' not in denied.stderr:
                raise RuntimeError('Missing-approval guard did not reject exactly as expected.')
            status = subprocess.run(['node', str(build), 'status', str(work)], cwd=project, env=env, capture_output=True, text=True, check=True)
            observed = json.loads(status.stdout)
            if observed['publishedItems'] or observed['activeReleaseId'] is not None:
                raise RuntimeError('The rejected operation changed publication state.')
            subprocess.run(['node', str(build), 'prepare', str(work)], cwd=project, env=env, check=True)
            if original != (work / 'release-and-seed-plan.json').read_bytes():
                raise RuntimeError('Repeated preparation changed the sealed packet.')
            if (state / 'transport-ledger.json').exists() or (state / 'seed-jobs').exists():
                raise RuntimeError('Preparation or the rejected run created remote-execution state.')
            result = {'missingApprovalRejected': True, 'publishedItems': 0, 'packetStableAcrossRestartAndRepeat': True,
                      'remoteExecutionStateCreated': False, 'status': observed}
            (work / 'guard-verification.json').write_text(json.dumps(result, indent=2) + '\n')
            print(json.dumps(result))
        else:
            result = subprocess.run(['node', str(build), *sys.argv[1:]], cwd=project, env=env)
            if result.returncode:
                raise SystemExit(result.returncode)
finally:
    if process and process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()
    lock.unlink()
