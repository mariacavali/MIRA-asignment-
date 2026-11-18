#!/usr/bin/env python3
"""Test both halves of a photographed spread, preserving source coordinates."""
import argparse
import json
import os
import time
from pathlib import Path

project = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pilot-id', required=True)
parser.add_argument('--page', type=int, required=True)
args = parser.parse_args()
if len(args.pilot_id) != 64 or any(c not in '0123456789abcdef' for c in args.pilot_id) or args.page < 1:
    raise ValueError('Use an existing pilot ID and physical page number.')
config = json.loads((project / '.mira-local-data/local-book-tools/config.json').read_text())
root = Path(config['externalRoot'])
if not os.path.ismount(root.parent): raise RuntimeError('Connect the selected drive.')
os.environ['HF_HOME'] = str(root / 'models/huggingface')
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
os.environ['DO_NOT_TRACK'] = '1'
os.environ['TOKENIZERS_PARALLELISM'] = 'false'
from PIL import Image
from docling.datamodel.base_models import InputFormat
from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
from docling.document_converter import DocumentConverter, ImageFormatOption

pilot = root / 'pilot' / args.pilot_id
original = json.loads((pilot / 'pilot.json').read_text())
page = next(p for p in original['pages'] if p['pdfPage'] == args.page)
image = Image.open(page['pageImages'][0]); w, h = image.size
if w <= h: raise ValueError('This explicit spread check expects a landscape photographed spread.')
output = pilot / f'spread-check-{args.page:04d}'; output.mkdir(exist_ok=True)
options = PdfPipelineOptions(generate_page_images=True, generate_picture_images=True, do_ocr=True, images_scale=2.0,
                             ocr_options=RapidOcrOptions(), enable_remote_services=False)
converter = DocumentConverter(format_options={InputFormat.IMAGE: ImageFormatOption(pipeline_options=options)})
parts = []
for side, bounds in [('left', (0, 0, w//2+24, h)), ('right', (w//2-24, 0, w, h))]:
    folder = output / side; folder.mkdir(exist_ok=True)
    region = folder / 'source-region.png'; image.crop(bounds).save(region, 'PNG')
    start = time.perf_counter(); result = converter.convert(region, raises_on_error=True); elapsed = time.perf_counter()-start
    text = result.document.export_to_markdown(); (folder/'text.md').write_text(text)
    result.document.save_as_json(folder/'document.json')
    parts.append({'side':side, 'sourcePhysicalPdfPage':args.page, 'sourceRegionPixels':bounds, 'overlapPixels':48,
                  'seconds':round(elapsed,3), 'characters':len(text), 'state':'extracted_needs_reading_order_review',
                  'text':str(folder/'text.md')})
    print(json.dumps({'side':side,'seconds':round(elapsed,3),'characters':len(text),'opening':text[:500]}),flush=True)
report={'state':'partial_spread_pilot_only','source':original['source'],'sourceSha256':original['sourceSha256'],
        'physicalPdfPage':args.page,'originalImagePreserved':True,'bothHalvesPreserved':True,'parts':parts,
        'wholeBookComplete':False,'paidProviderRequests':0,'pineconeRequests':0}
(output/'spread-check.json').write_text(json.dumps(report,indent=2)+'\n')
