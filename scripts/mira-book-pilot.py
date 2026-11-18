#!/usr/bin/env python3
"""Measure representative local PDF pages; never claims whole-book completion.

Preserves original files and page/figure provenance. Network downloads fetch only
public extraction-model weights. Book text/images are processed locally; figure
descriptions use only the dedicated cloud-disabled loopback runtime.
"""
import argparse
import hashlib
import importlib.util
import json
import os
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--pages', required=True, help='Explicit physical PDF pages, comma separated; at most 5.')
    parser.add_argument('--describe-figures', action='store_true')
    parser.add_argument('--max-descriptions', type=int, default=3)
    args = parser.parse_args()
    pages = sorted({int(p) for p in args.pages.split(',')})
    if not 1 <= len(pages) <= 5 or pages[0] < 1 or not 1 <= args.max_descriptions <= 5:
        raise ValueError('Use 1–5 explicit physical PDF pages and a 1–5 image-description pilot budget.')
    config = json.loads((PROJECT / '.mira-local-data/local-book-tools/config.json').read_text())
    root = Path(config['externalRoot'])
    if not os.path.ismount(root.parent):
        raise RuntimeError('The selected processing drive must be connected.')
    os.environ['HF_HOME'] = str(root / 'models/huggingface')
    os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    os.environ['DO_NOT_TRACK'] = '1'
    os.environ['TOKENIZERS_PARALLELISM'] = 'false'
    import pypdfium2 as pdfium
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling_core.types.doc import PictureItem, TableItem
    source = args.source.resolve(strict=True)
    if source.suffix.lower() != '.pdf':
        raise ValueError('This measurement pilot currently accepts PDF only; EPUB intake is a separate implementation step.')
    with source.open('rb') as stream:
        source_hash = hashlib.file_digest(stream, 'sha256').hexdigest()
    pdf = pdfium.PdfDocument(source)
    total_pages = len(pdf); pdf.close()
    if pages[-1] > total_pages:
        raise ValueError('A requested page is beyond the original PDF.')
    settings = {'docling': '2.144.0', 'scale': 2.0, 'ocr': 'rapidocr', 'pages': pages}
    key = hashlib.sha256(json.dumps({'source': source_hash, **settings}, sort_keys=True).encode()).hexdigest()
    output = root / 'pilot' / key; output.mkdir(parents=True, exist_ok=True)
    manifest_path = output / 'pilot.json'
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {
        'version': 1, 'state': 'partial_pilot_only', 'source': str(source), 'sourceSha256': source_hash,
        'totalPhysicalPdfPages': total_pages, 'requestedPhysicalPages': pages, 'settings': settings,
        'pages': [], 'paidProviderRequests': 0, 'pineconeRequests': 0, 'wholeBookComplete': False}
    options = PdfPipelineOptions()
    options.images_scale = 2.0
    options.generate_page_images = True
    options.generate_picture_images = True
    options.do_ocr = True
    options.ocr_options = RapidOcrOptions()
    options.do_picture_description = False
    options.enable_remote_services = False
    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
    for number in pages:
        if any(page['pdfPage'] == number and page.get('state') == 'extracted_needs_review' for page in manifest['pages']):
            print('Reusing extracted PDF page', number, flush=True); continue
        start = time.perf_counter()
        converted = converter.convert(source, page_range=(number, number), raises_on_error=True)
        elapsed = time.perf_counter() - start
        document = converted.document
        folder = output / f'page-{number:04d}'; folder.mkdir(exist_ok=True)
        text = document.export_to_markdown()
        (folder / 'text.md').write_text(text)
        document.save_as_json(folder / 'document.json')
        saved_pages = []
        for _, page in document.pages.items():
            if page.image:
                target = folder / f'original-page-{page.page_no}.png'
                page.image.pil_image.save(target, 'PNG'); saved_pages.append(str(target))
        figures = []
        for item, _ in document.iterate_items():
            if not isinstance(item, (PictureItem, TableItem)):
                continue
            kind = 'table' if isinstance(item, TableItem) else 'figure'
            target = folder / f'{kind}-{len(figures)+1:03d}.png'
            image = item.get_image(document)
            if image is None:
                figures.append({'kind': kind, 'elementRef': item.self_ref, 'state': 'missing_crop_needs_review'}); continue
            image.save(target, 'PNG')
            figures.append({'kind': kind, 'elementRef': item.self_ref, 'state': 'preserved_not_described', 'path': str(target),
                            'sourcePages': [p.page_no for p in item.prov]})
        row = {'pdfPage': number, 'state': 'extracted_needs_review', 'conversionStatus': str(converted.status),
               'elapsedSeconds': round(elapsed, 3), 'textCharacters': len(text), 'pageImages': saved_pages, 'figures': figures,
               'extractionErrors': [str(e) for e in converted.errors]}
        manifest['pages'] = [p for p in manifest['pages'] if p['pdfPage'] != number] + [row]
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
        print(json.dumps({'pdfPage': number, 'seconds': row['elapsedSeconds'], 'characters': len(text), 'figuresAndTables': len(figures)}), flush=True)
    if args.describe_figures:
        spec = importlib.util.spec_from_file_location('mira_local_vision', PROJECT / 'scripts/mira-local-vision.py')
        vision = importlib.util.module_from_spec(spec); spec.loader.exec_module(vision)
        completed = 0
        for row in manifest['pages']:
            for figure in row['figures']:
                if not figure.get('path') or completed >= args.max_descriptions:
                    continue
                prior = figure.get('description')
                result = vision.describe(Path(figure['path']))
                if prior and prior.get('modelDigest') != result.get('modelDigest'):
                    history = figure.setdefault('previousDescriptionAttempts', [])
                    if not any(p.get('modelDigest') == prior.get('modelDigest') for p in history): history.append(prior)
                figure['description'] = result; figure['state'] = result['state']; completed += 1
                manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
                print(json.dumps({'figure': figure['elementRef'], 'seconds': result['newElapsedSeconds'],
                    'localInputTokens': result['newInputTokens'], 'localOutputTokens': result['newOutputTokens'], 'state': result['state']}), flush=True)
    descriptions = [f['description'] for p in manifest['pages'] for f in p['figures'] if 'description' in f]
    measured = [p['elapsedSeconds'] for p in manifest['pages']]
    summary = {'state': 'partial_pilot_only', 'report': str(manifest_path), 'measuredPages': len(measured),
               'visionModel': config['model'],
               'meanSecondsPerPageIncludingColdSetup': round(sum(measured)/len(measured), 2) if measured else None,
               'warmSecondsPerPage': round(sum(measured[1:])/len(measured[1:]), 2) if len(measured)>1 else None,
               'figuresAndTablesPreserved': sum(len(p['figures']) for p in manifest['pages']),
               'describedFigures': len(descriptions),
               'successfulDescriptions': sum(d['state'] == 'described_needs_review' for d in descriptions),
               'incompleteDescriptions': sum(d['state'] != 'described_needs_review' for d in descriptions),
               'localInputTokens': sum(d.get('localInputTokens') or 0 for d in descriptions),
               'localOutputTokens': sum(d.get('localOutputTokens') or 0 for d in descriptions),
               'paidProviderRequests': 0, 'pineconeRequests': 0, 'wholeBookComplete': False}
    (output / 'summary.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
