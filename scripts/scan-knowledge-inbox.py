#!/usr/bin/env python3
"""Read-only local PDF inventory. No OCR, model, network, publishing or seeding."""
import argparse
import hashlib
import json
import os
from pathlib import Path
from datetime import datetime, timezone

UPLOAD_LIMIT = 25 * 1024 * 1024
MAX_FILES = 10_000
DEFAULT_ROOT = Path(__file__).resolve().parents[1]


def scan_inventory(project, previous=None):
    project = Path(project).resolve()
    previous = previous or {}
    old = {entry['path']: entry for entry in previous.get('files', [])}
    old_hashes = {entry.get('sha256') for entry in old.values() if entry.get('sha256')}
    files, skipped, roots = [], [], ['book-brand management', 'knowledge-inbox']
    for name in roots:
        root = project / name
        if not root.exists():
            continue
        if root.is_symlink():
            raise ValueError('Knowledge input roots must not be symlinks.')
        for folder, directories, names in os.walk(root, followlinks=False):
            directories[:] = sorted(part for part in directories if not part.startswith('.') and not (Path(folder)/part).is_symlink())
            for filename in sorted(names):
                if filename.startswith('.') or Path(filename).suffix.lower() != '.pdf':
                    continue
                path = Path(folder) / filename
                relative = path.relative_to(project).as_posix()
                if path.is_symlink() or not path.is_file():
                    skipped.append({'path': relative, 'reason': 'not_a_regular_file'})
                    continue
                if len(files) >= MAX_FILES:
                    raise ValueError('Knowledge inbox exceeds 10,000 PDF files.')
                before = path.stat()
                digest = hashlib.sha256()
                with path.open('rb') as source:
                    signature = source.read(5)
                    digest.update(signature)
                    while chunk := source.read(1024 * 1024):
                        digest.update(chunk)
                after = path.stat()
                if (before.st_size, before.st_mtime_ns, before.st_ino) != (after.st_size, after.st_mtime_ns, after.st_ino):
                    skipped.append({'path': relative, 'reason': 'file_changed_while_reading'})
                    continue
                sha = digest.hexdigest()
                prior = old.get(relative)
                change = 'unchanged' if prior and prior.get('sha256') == sha else 'changed' if prior else 'existing_content_new_path' if sha in old_hashes else 'new'
                relative_parts = path.relative_to(root).parts
                group = name if name == 'book-brand management' else f'{name}/{relative_parts[0]}' if len(relative_parts) > 1 else f'{name}/{path.stem}'
                files.append({'fileId': f'pdf-{sha}', 'path': relative, 'sourceGroup': group,
                              'bytes': before.st_size, 'sha256': sha, 'change': change,
                              'intakeStatus': 'signature_rejected' if signature != b'%PDF-' else 'needs_splitting' if before.st_size > UPLOAD_LIMIT else 'awaiting_pdf_preparation',
                              'sizeLimitBytes': UPLOAD_LIMIT, 'pageCoverage': 'not_verified',
                              'textOrOcrStatus': 'not_checked', 'remoteSeedStatus': 'not_checked'})
    files.sort(key=lambda item: item['path'])
    by_hash = {}
    for entry in files:
        by_hash.setdefault(entry['sha256'], []).append(entry['path'])
    status_path = project / 'book-brand management/source-status.json'
    completeness = 'unknown'
    if status_path.is_file() and not status_path.is_symlink():
        completeness = json.loads(status_path.read_text()).get('completeness', 'unknown')
    present = {entry['path'] for entry in files} | {entry['path'] for entry in skipped}
    return {'formatVersion': 1, 'scannedAt': datetime.now(timezone.utc).isoformat(),
            'roots': roots, 'files': files,
            'exactByteDuplicateGroups': [paths for paths in by_hash.values() if len(paths) > 1],
            'missingSincePreviousInventory': sorted(set(old)-present), 'skipped': skipped,
            'sourceCompleteness': {'book-brand management': completeness},
            'seedingPolicy': 'deferred_until_explicit_preparation_review_and_seed_step',
            'summary': {'pdfFiles': len(files), 'uniqueFileHashes': len(by_hash),
                        'new': sum(entry['change'] == 'new' for entry in files),
                        'changed': sum(entry['change'] == 'changed' for entry in files),
                        'needsSplitting': sum(entry['intakeStatus'] == 'needs_splitting' for entry in files),
                        'networkRequests': 0, 'seedRequests': 0}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=Path, default=DEFAULT_ROOT)
    args = parser.parse_args()
    destination = args.project.resolve() / '.mira-local-data/knowledge-inbox/inventory.json'
    previous = json.loads(destination.read_text()) if destination.exists() else None
    inventory = scan_inventory(args.project, previous)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = destination.with_suffix('.json.tmp')
    with temporary.open('w') as output:
        os.chmod(temporary, 0o600)
        json.dump(inventory, output, indent=2)
        output.write('\n')
    temporary.replace(destination)
    print(json.dumps({'inventory': str(destination), **inventory['summary']}, indent=2))


if __name__ == '__main__':
    main()
