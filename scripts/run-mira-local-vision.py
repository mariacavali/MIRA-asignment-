#!/usr/bin/env python3
"""Run the dedicated, loopback-only MIRA vision runtime with cloud disabled."""
import json
import os
import subprocess
from pathlib import Path

project = Path(__file__).resolve().parents[1]
config = json.loads((project / '.mira-local-data/local-book-tools/config.json').read_text())
external = Path(config['externalRoot'])
if not os.path.ismount(external.parent) or not external.is_dir():
    raise SystemExit('The selected book-processing drive must be connected.')
env = {**os.environ, 'OLLAMA_NO_CLOUD': '1', 'OLLAMA_MODELS': str(external / 'models/ollama'),
       'OLLAMA_HOST': '127.0.0.1:11435', 'OLLAMA_NUM_PARALLEL': '1', 'OLLAMA_MAX_LOADED_MODELS': '1',
       'OLLAMA_CONTEXT_LENGTH': '8192', 'OLLAMA_KEEP_ALIVE': '5m'}
print('MIRA local vision: loopback port 11435; cloud disabled; models on the connected drive.', flush=True)
with (external / 'logs/ollama.log').open('a') as output:
    subprocess.run([config['ollamaBinary'], 'serve'], env=env, stdout=output, stderr=subprocess.STDOUT, check=True)
