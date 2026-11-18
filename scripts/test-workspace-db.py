#!/usr/bin/env python3
"""Run workspace, coach and knowledge SQL tests in a disposable, socket-only MariaDB instance."""
import os
from pathlib import Path
import subprocess
import tempfile
import time

root = Path(__file__).resolve().parents[1]
bin_dir = Path('/opt/homebrew/opt/mariadb/bin')
installer = bin_dir / 'mariadb-install-db'
server = bin_dir / 'mariadbd'
if not installer.is_file() or not server.is_file():
    raise SystemExit('Install local MariaDB first (brew install mariadb).')

with tempfile.TemporaryDirectory(prefix='mira-db-', dir='/tmp') as folder:
    work = Path(folder)
    data = work / 'data'
    socket = work / 'db.sock'
    log = work / 'server.log'
    with log.open('w') as output:
        subprocess.run([str(installer), '--no-defaults', f'--datadir={data}',
                        '--auth-root-authentication-method=normal', '--skip-test-db'],
                       stdout=output, stderr=subprocess.STDOUT, check=True)
        process = subprocess.Popen([str(server), '--no-defaults', f'--datadir={data}',
                                    f'--socket={socket}', f'--pid-file={work / "server.pid"}',
                                    '--skip-networking', '--innodb-buffer-pool-size=64M'],
                                   stdout=output, stderr=subprocess.STDOUT)
        try:
            deadline = time.monotonic() + 15
            while not socket.exists():
                if process.poll() is not None or time.monotonic() > deadline:
                    raise RuntimeError('Isolated MariaDB failed to start:\n' + log.read_text())
                time.sleep(0.1)
            env = {**os.environ, 'RUN_MIRA_DB_TESTS': '1', 'MIRA_TEST_DB_SOCKET': str(socket)}
            result = subprocess.run([str(root / 'node_modules/.bin/vitest'), 'run',
                                     'server/miraWorkspace/database.test.ts', 'server/miraCoach/database.test.ts', 'server/miraKnowledge/database.test.ts'], cwd=root, env=env)
            if result.returncode:
                raise SystemExit(result.returncode)
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
    print('Isolated MariaDB stopped; temporary database and data directory removed.')
