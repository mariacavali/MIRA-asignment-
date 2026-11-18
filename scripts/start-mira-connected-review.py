#!/usr/bin/env python3
"""Start MIRA's isolated, persistent local review API. Never uses DATABASE_URL."""
import os
from pathlib import Path
import subprocess
import socket as network_socket
import time

project = Path(__file__).resolve().parents[1]
review = project / '.mira-local-data' / 'connected-review'
review.mkdir(parents=True, exist_ok=True, mode=0o700)
review.chmod(0o700)
data, socket = review / 'database', review / 'db.sock'
with network_socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 5184)) == 0:
        raise SystemExit('The MIRA review API is already running on port 5184. Stop that review service before restarting.')
if (review / 'database.pid').exists():
    try:
        os.kill(int((review / 'database.pid').read_text().strip()), 0)
    except (ProcessLookupError, ValueError):
        pass
    else:
        raise SystemExit('The isolated review database is already running. Stop its review launcher before restarting.')
bin_dir = Path('/opt/homebrew/opt/mariadb/bin')
if not (bin_dir / 'mariadbd').is_file():
    raise SystemExit('The existing local MariaDB installation is required.')
with (review / 'database.log').open('a') as log:
    if not (data / 'mysql').exists():
        subprocess.run([str(bin_dir / 'mariadb-install-db'), '--no-defaults', f'--datadir={data}', '--auth-root-authentication-method=normal', '--skip-test-db'], stdout=log, stderr=subprocess.STDOUT, check=True)
    database = subprocess.Popen([str(bin_dir / 'mariadbd'), '--no-defaults', f'--datadir={data}', f'--socket={socket}', f'--pid-file={review / "database.pid"}', '--skip-networking', '--innodb-buffer-pool-size=64M'], stdout=log, stderr=subprocess.STDOUT)
    api = None
    try:
        deadline = time.monotonic() + 15
        # A crash can leave the old socket path behind. File existence is not
        # readiness: wait for the actual isolated SQL server to answer.
        while subprocess.run([str(bin_dir / 'mariadb-admin'), '--no-defaults', f'--socket={socket}', '--user=root', 'ping'],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
            if database.poll() is not None or time.monotonic() > deadline:
                raise RuntimeError('The isolated review database could not start. See its private log.')
            time.sleep(.1)
        if database.poll() is not None:
            raise RuntimeError('The isolated review database exited before API startup.')
        build = review / 'connected-review.mjs'
        subprocess.run([str(project / 'node_modules/.bin/esbuild'), str(project / 'scripts/mira-connected-review.ts'), '--platform=node', '--packages=external', '--bundle', '--format=esm', f'--outfile={build}'], cwd=project, check=True)
        review_env = {**os.environ, 'NODE_ENV': 'development', 'MIRA_REVIEW_DB_SOCKET': str(socket), 'LANGCHAIN_TRACING': '', 'LANGCHAIN_VERBOSE': 'false', 'LANGSMITH_TRACING': 'false'}
        api = subprocess.Popen(['node', str(build)], cwd=project, env=review_env)
        api.wait()
    finally:
        if api and api.poll() is None:
            api.terminate()
            api.wait(timeout=10)
        database.terminate()
        database.wait(timeout=10)
