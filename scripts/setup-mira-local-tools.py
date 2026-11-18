#!/usr/bin/env python3
"""Install the explicitly selected free local tools; never processes book data.

Large downloads/caches go to the mounted external volume. Executables and the
Python environment stay on the Mac (ExFAT does not support Unix symlinks).
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import urllib.request
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
LOCAL = PROJECT / '.mira-local-data' / 'local-book-tools'
VERSION = 'v0.40.13'


def fetch_json(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'mira-local-tools-setup'})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def run(command, log):
    print('Running:', Path(command[0]).name, command[1] if len(command) > 1 else '', flush=True)
    with log.open('a') as output:
        result = subprocess.run(command, stdout=output, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError('Local setup step failed; inspect ' + str(log))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--external-root', type=Path, required=True)
    args = parser.parse_args()
    external = args.external_root
    if not external.is_absolute() or external.parent.parent != Path('/Volumes') or external.is_symlink():
        raise ValueError('Use a dedicated directory directly inside a mounted /Volumes volume.')
    if not os.path.ismount(external.parent) or external.parent.resolve() == Path('/'):
        raise ValueError('The selected external volume is not mounted.')
    if shutil.disk_usage(external.parent).free < 20_000_000_000:
        raise ValueError('At least 20 GB free is required for this setup and pilot.')
    external.mkdir(exist_ok=True)
    probe = external / 'mira-write-probe.tmp'
    with probe.open('x') as stream:
        stream.write('MIRA local setup write check\n'); stream.flush(); os.fsync(stream.fileno())
    probe.unlink()
    LOCAL.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in ['downloads', 'models/ollama', 'models/huggingface', 'cache/uv', 'books', 'pilot', 'logs']:
        (external / name).mkdir(parents=True, exist_ok=True)
    log = LOCAL / 'setup.log'
    release = fetch_json('https://api.github.com/repos/ollama/ollama/releases/tags/' + VERSION)
    asset = next(a for a in release['assets'] if a['name'] == 'ollama-darwin.tgz')
    if asset['size'] > 2_000_000_000:
        raise ValueError('Unexpected Ollama runtime archive size; review before downloading.')
    expected = asset.get('digest', '')
    if not expected.startswith('sha256:'):
        raise ValueError('Official release asset has no SHA-256 digest; review before installing.')
    archive = external / 'downloads' / asset['name']
    if not archive.exists():
        temporary = archive.with_suffix('.download')
        print('Downloading official Ollama runtime:', round(asset['size'] / 1e6, 1), 'MB', flush=True)
        request = urllib.request.Request(asset['browser_download_url'], headers={'User-Agent': 'mira-local-tools-setup'})
        with urllib.request.urlopen(request, timeout=120) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output, length=1024 * 1024)
        temporary.rename(archive)
    digest = hashlib.file_digest(archive.open('rb'), 'sha256').hexdigest()
    if archive.stat().st_size != asset['size'] or digest != expected.split(':', 1)[1]:
        raise ValueError('Ollama archive verification failed; no extraction was performed.')
    runtime = LOCAL / 'ollama'
    if not runtime.exists():
        runtime.mkdir()
        with tarfile.open(archive) as tar:
            if sum(member.size for member in tar.getmembers()) > 2_000_000_000:
                raise ValueError('Unexpected expanded runtime size.')
            tar.extractall(runtime, filter='data')
    binaries = [p for p in runtime.rglob('ollama') if p.is_file()]
    if len(binaries) != 1:
        raise ValueError('Could not identify the verified Ollama executable.')
    binary = binaries[0]
    binary.chmod(binary.stat().st_mode | 0o100)
    uv = shutil.which('uv')
    python = shutil.which('python3.12')
    if not uv or not python:
        raise RuntimeError('The existing uv and Python 3.12 installations are required.')
    venv = LOCAL / 'venv'
    if not venv.exists():
        run([uv, 'venv', '--python', python, str(venv)], log)
    partial = venv / 'lib/python3.12/site-packages/mpire-2.10.2.data'
    for orphan in partial.rglob('._*') if partial.exists() else []:
        if orphan.is_file() and orphan.read_bytes()[:4] == bytes.fromhex('00051607'):
            # Only AppleDouble metadata in this installer's partial package
            # data tree; no application/user source files are removed.
            orphan.unlink()
            print('Removed installer metadata:', orphan.name, flush=True)
    # ExFAT generates ._ metadata entries in unpacked wheel caches. uv treats
    # these as unexpected wheel files (notably .data/scripts). Use an ephemeral
    # APFS temp cache for packages; large AI weights still live on the USB disk.
    run([uv, 'pip', 'install', '--python', str(venv / 'bin/python'), '--requirements', str(PROJECT / 'scripts/requirements-mira-books.txt'),
         '--no-cache', '--link-mode=copy', '--reinstall-package', 'mpire', '--no-progress'], log)
    config = {'version': 1, 'externalRoot': str(external), 'ollamaBinary': str(binary), 'ollamaVersion': VERSION,
              'ollamaArchiveSha256': digest, 'python': str(venv / 'bin/python'), 'ollamaBaseUrl': 'http://127.0.0.1:11435',
              'model': 'qwen3-vl:8b', 'modelState': 'not_pulled', 'cloudEnabled': False,
              'originalFilesMoved': False, 'paidProviderRequests': 0}
    old_config = LOCAL / 'config.json'
    if old_config.exists():
        previous = json.loads(old_config.read_text())
        if previous.get('externalRoot') == str(external) and previous.get('model') in ['qwen3-vl:8b', 'qwen3-vl:8b-instruct']:
            config['model'] = previous['model']
            for field in ['modelState', 'modelDigest', 'downloadMethod']:
                if field in previous: config[field] = previous[field]
    (LOCAL / 'config.json').write_text(json.dumps(config, indent=2) + '\n')
    installed = subprocess.run([uv, 'pip', 'freeze', '--python', str(venv / 'bin/python')], capture_output=True, text=True, check=True)
    (LOCAL / 'installed-requirements.txt').write_text(installed.stdout)
    print(json.dumps({'state': 'runtime_and_document_tools_installed', 'config': str(LOCAL / 'config.json'),
                      'externalFreeGB': round(shutil.disk_usage(external).free / 1e9, 1), 'internalFreeGB': round(shutil.disk_usage(LOCAL).free / 1e9, 1)}), flush=True)


if __name__ == '__main__':
    main()
