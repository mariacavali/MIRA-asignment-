#!/usr/bin/env python3
"""Fetch the SAME agreed Ollama model sequentially when parallel pull stalls.

Uses the official registry manifest and verifies every blob SHA-256. Only MIRA's
dedicated local vision server is stopped, to avoid concurrent blob writers.
No image/book content, credentials, model substitutions or paid calls are used.
"""
import hashlib
import json
import os
import re
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

project = Path(__file__).resolve().parents[1]
config_path = project / '.mira-local-data/local-book-tools/config.json'
config = json.loads(config_path.read_text()); root = Path(config['externalRoot'])
if config['model'] not in ['qwen3-vl:8b', 'qwen3-vl:8b-instruct'] or not os.path.ismount(root.parent):
    raise SystemExit('The agreed model and mounted external drive are required.')
found = subprocess.run(['lsof', '-nP', '-t', '-iTCP:11435', '-sTCP:LISTEN'], capture_output=True, text=True)
for pid in set(found.stdout.split()):
    command = subprocess.run(['ps', '-p', pid, '-o', 'command='], capture_output=True, text=True, check=True).stdout.strip()
    if command != config['ollamaBinary'] + ' serve':
        raise SystemExit('Port 11435 belongs to another process; it was not stopped.')
    os.kill(int(pid), signal.SIGTERM)
    print('Stopped only the dedicated MIRA vision server for download repair.', flush=True)
time.sleep(1)
registry = 'https://registry.ollama.ai/v2/library/qwen3-vl/'
tag = config['model'].split(':')[1]
with urllib.request.urlopen(registry + 'manifests/' + tag, timeout=30) as response:
    raw_manifest = response.read()
manifest = json.loads(raw_manifest)
blobs = root / 'models/ollama/blobs'; blobs.mkdir(parents=True, exist_ok=True)
for layer in [*manifest['layers'], manifest['config']]:
    digest = layer['digest']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('Unexpected official blob digest.')
    destination = blobs / digest.replace(':', '-')
    if destination.exists():
        with destination.open('rb') as stream:
            verified = hashlib.file_digest(stream, 'sha256').hexdigest() == digest.split(':')[1]
        if verified:
            print('Reusing verified model layer:', round(layer['size']/1e6, 1), 'MB', flush=True); continue
        raise ValueError('An existing model layer did not match; it was preserved for inspection.')
    temporary = destination.with_suffix('.mira-download')
    offset = temporary.stat().st_size if temporary.exists() else 0
    h = hashlib.sha256()
    if offset:
        with temporary.open('rb') as stream:
            for block in iter(lambda: stream.read(4*1024*1024), b''): h.update(block)
    request = urllib.request.Request(registry + 'blobs/' + digest, headers={'Range': f'bytes={offset}-', 'User-Agent': 'mira-local-model-setup'})
    start = time.perf_counter(); count = offset; next_percent = int(offset/max(layer['size'],1)*100)//10*10
    print('Sequential model download:', round(layer['size']/1e6, 1), 'MB', flush=True)
    with urllib.request.urlopen(request, timeout=120) as response, temporary.open('ab' if offset else 'wb') as output:
        if offset and (response.status != 206 or not response.headers.get('Content-Range', '').startswith(f'bytes {offset}-')):
            raise ValueError('The server did not confirm the requested resume range.')
        while True:
            block = response.read(4*1024*1024)
            if not block: break
            output.write(block); h.update(block); count += len(block)
            percent = int(count/max(layer['size'],1)*100)
            if percent >= next_percent:
                speed = (count-offset)/max(time.perf_counter()-start,0.001)/1e6
                print(f'{percent}% ({speed:.1f} MB/s)', flush=True); next_percent = (percent//10+1)*10
        output.flush(); os.fsync(output.fileno())
    if count != layer['size'] or h.hexdigest() != digest.split(':')[1]:
        raise ValueError('Downloaded model layer did not pass size/SHA-256 verification; it was not activated.')
    temporary.rename(destination)
location = root / 'models/ollama/manifests/registry.ollama.ai/library/qwen3-vl'
location.mkdir(parents=True, exist_ok=True)
(location/tag).write_bytes(raw_manifest)
config['modelState'] = 'downloaded'
config['modelDigest'] = 'sha256:' + hashlib.sha256(raw_manifest).hexdigest()
config['downloadMethod'] = 'official_registry_sequential_sha256_verified'
config_path.write_text(json.dumps(config, indent=2)+'\n')
print('The agreed 8B model is downloaded and verified. Restart the dedicated local runtime.', flush=True)
