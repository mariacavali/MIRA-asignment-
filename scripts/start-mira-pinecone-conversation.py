#!/usr/bin/env python3
"""Serve the real text coach against the already-seeded isolated catalogue."""
from pathlib import Path
import os
import socket as network_socket
import subprocess
import time

project = Path(__file__).resolve().parents[1]
state = project / '.mira-local-data' / 'pinecone-nine-entry-test'
app_root = project / '.mira-local-data' / 'pinecone-conversation'
app_root.mkdir(parents=True, exist_ok=True, mode=0o700)
socket = state / 'db.sock'
binary = Path('/opt/homebrew/opt/mariadb/bin')
if not (state / 'database' / 'mysql').is_dir():
    raise SystemExit('The previously seeded test catalogue must exist; no replacement is created.')
with network_socket.socket() as probe:
    if probe.connect_ex(('127.0.0.1', 5188)) == 0:
        raise SystemExit('Port 5188 is already occupied; do not replace that service.')
lock = state / 'launcher.lock'
with lock.open('x') as handle:
    handle.write(str(os.getpid()))
database = None
api = None
try:
    with (state / 'database.log').open('a') as log:
        database = subprocess.Popen([str(binary / 'mariadbd'), '--no-defaults', f'--datadir={state / "database"}',
            f'--socket={socket}', f'--pid-file={state / "database.pid"}', '--skip-networking', '--innodb-buffer-pool-size=64M'],
            stdout=log, stderr=subprocess.STDOUT)
        deadline = time.monotonic() + 20
        while subprocess.run([str(binary / 'mariadb-admin'), '--no-defaults', f'--socket={socket}', '--user=root', 'ping'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            if database.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError('The isolated catalogue failed to start; inspect its private log.')
            time.sleep(.1)
        build = app_root / 'server.mjs'
        subprocess.run([str(project / 'node_modules/.bin/esbuild'), 'scripts/serve-mira-pinecone-conversation.mts',
            '--platform=node', '--packages=external', '--bundle', '--format=esm', f'--outfile={build}'], cwd=project, check=True)
        api = subprocess.Popen(['node', str(build)], cwd=project, env={**os.environ,
            'LANGCHAIN_TRACING': '', 'LANGCHAIN_VERBOSE': 'false', 'LANGSMITH_TRACING': 'false'})
        api.wait()
finally:
    if api and api.poll() is None:
        api.terminate()
        api.wait(timeout=10)
    if database and database.poll() is None:
        database.terminate()
        database.wait(timeout=10)
    lock.unlink()
