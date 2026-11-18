#!/usr/bin/env python3
"""Read selected PDFs in place; write a reproducible local, unapproved intake.

Never mutates Drive originals or contacts a provider. The selection is explicit;
unselected files are inventoried, not implicitly imported.
"""
import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def prepare(root, selection_path, output):
    root, output = root.resolve(strict=True), output.resolve()
    if output == root or root in output.parents:
        raise ValueError('Output must be outside the original library.')
    selection = json.loads(selection_path.read_text())
    if selection['version'] != 1 or len({s['id'] for s in selection['sources']}) != len(selection['sources']):
        raise ValueError('Invalid source selection.')
    selected = {s['relativePath']: s for s in selection['sources']}
    if len(selected) != len(selection['sources']):
        raise ValueError('Duplicate selected paths.')
    output.mkdir(parents=True, exist_ok=True)
    extraction_dir = output / 'extracted'
    extraction_dir.mkdir(exist_ok=True)
    extractor = Path(__file__).with_name('extract-mira-pdf.py')
    inventory, records = [], []
    seen = {}
    for path in sorted(root.rglob('*')):
        if path.is_symlink() or not path.is_file() or any(p.startswith('.') for p in path.relative_to(root).parts):
            continue
        relative = path.relative_to(root).as_posix()
        file_hash = digest(path)
        record = {'relativePath': relative, 'bytes': path.stat().st_size, 'sha256': file_hash,
                  'duplicateOf': seen.get(file_hash), 'selected': relative in selected}
        seen.setdefault(file_hash, relative)
        if relative in selected:
            if path.suffix.lower() != '.pdf' or path.stat().st_size > 25 * 1024 * 1024:
                raise ValueError('Selected PDF exceeds the extractor contract.')
            with path.open('rb') as stream:
                proc = subprocess.run([sys.executable, str(extractor)], stdin=stream,
                                      capture_output=True, timeout=45, check=True)
            result = json.loads(proc.stdout)
            if not result.get('ok') or any(p['status'] != 'extracted' for p in result['result']['pages']):
                raise ValueError('Selected source has incomplete extraction: ' + relative)
            if digest(path) != file_hash:
                raise ValueError('Original changed during extraction: ' + relative)
            source = {**selected[relative], 'sha256': file_hash, 'bytes': record['bytes'],
                      'extraction': result['result']}
            target = extraction_dir / (source['id'] + '.json')
            target.write_text(json.dumps(source, ensure_ascii=False, indent=2) + '\n')
            records.append({'id': source['id'], 'relativePath': relative, 'driveUrl': source['driveUrl'],
                            'sha256': file_hash, 'pageCount': source['extraction']['pageCount'],
                            'imagePages': [p['page'] for p in source['extraction']['pages'] if p['hasImages']]})
        else:
            record['exclusionReason'] = selection['excluded'].get(relative, 'Supporting index/source links; not a selected knowledge payload.')
        inventory.append(record)
    if set(selected) != {r['relativePath'] for r in records}:
        raise ValueError('A selected source was not found.')
    manifest = {'version': 1, 'state': 'extracted_unapproved', 'sourceRoot': str(root),
                'selectionSha256': digest(selection_path), 'sources': records, 'files': inventory,
                'originalsModified': False, 'networkRequests': 0, 'seedWrites': 0}
    (output / 'intake-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'sources': len(records), 'pages': sum(r['pageCount'] for r in records),
                      'inventoriedFiles': len(inventory), 'imagePages': sum(len(r['imagePages']) for r in records),
                      'originalsModified': False, 'networkRequests': 0, 'seedWrites': 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--selection', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.root, args.selection, args.output)
