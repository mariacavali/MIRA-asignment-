#!/usr/bin/env python3
"""Inventory all detected figures/tables locally; descriptions never self-approve."""
import argparse
import importlib.util
import json
import os
import time
from pathlib import Path
from mira_book_util import save

PROJECT=Path(__file__).resolve().parents[1]
def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--book-id',required=True)
    parser.add_argument('--describe',action='store_true')
    args=parser.parse_args()
    if not __import__('re').fullmatch(r'[a-z][a-z0-9-]{0,79}',args.book_id):raise ValueError('Invalid book ID')
    config=json.loads((PROJECT/'.mira-local-data/local-book-tools/config.json').read_text());root=Path(config['externalRoot'])
    if not os.path.ismount(root.parent):raise RuntimeError('Connect the selected drive')
    os.environ.update(HF_HOME=str(root/'models/huggingface'),HF_HUB_OFFLINE='1',HF_HUB_DISABLE_TELEMETRY='1',DO_NOT_TRACK='1',TOKENIZERS_PARALLELISM='false')
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions
    from docling.document_converter import DocumentConverter,ImageFormatOption
    from docling_core.types.doc import PictureItem,TableItem
    options=PdfPipelineOptions(do_ocr=False,do_table_structure=False,generate_picture_images=True,generate_page_images=True,enable_remote_services=False)
    converter=DocumentConverter(format_options={InputFormat.IMAGE:ImageFormatOption(pipeline_options=options)})
    output=root/'books'/args.book_id
    manifest=json.loads((output/'book.json').read_text())
    inventory=[]
    for page in manifest['pages']:
        folder=Path(page['image']).parent;target=folder/'visuals.json'
        if target.exists():
            prior=json.loads(target.read_text())
            if prior.get('sourceSha256')==page['sourceSha256'] and prior.get('version')=='layout-no-ocr-v1':
                inventory.append(prior);continue
        figures=[];errors=[]
        for region in page['regions']:
            try:
                result=converter.convert(Path(region['image']),raises_on_error=True);document=result.document
                for item,_ in document.iterate_items():
                    if not isinstance(item,(PictureItem,TableItem)):continue
                    kind='table' if isinstance(item,TableItem) else 'figure'
                    image=item.get_image(document)
                    entry={'kind':kind,'side':region['side'],'elementRef':item.self_ref,'state':'missing_crop' if image is None else 'preserved_needs_description',
                           'sourceImage':region['image'],'provenance':[p.model_dump(mode='json') for p in item.prov]}
                    if image is not None:
                        path=folder/f"{region['side']}-{kind}-{len(figures)+1:03d}.png";image.save(path);entry['path']=str(path)
                    figures.append(entry)
            except Exception as exc:errors.append({'side':region['side'],'error':str(exc)[:500]})
        row={'version':'layout-no-ocr-v1','sourceSha256':page['sourceSha256'],'part':page['part'],'physicalPage':page['physicalPage'],
             'figures':figures,'errors':errors,'state':'detected_needs_page_visual_review','completeVisualCoverageVerified':False}
        save(target,row);inventory.append(row)
        save(output/'visuals.json',{'pages':inventory,'state':'processing','complete':False})
        print(json.dumps({'part':page['part'],'page':page['physicalPage'],'figures':len(figures),'errors':len(errors)}),flush=True)
    save(output/'visuals.json',{'pages':inventory,'state':'detected_needs_page_visual_review','complete':False})
    if args.describe:
        spec=importlib.util.spec_from_file_location('mira_local_vision',PROJECT/'scripts/mira-local-vision.py');vision=importlib.util.module_from_spec(spec);spec.loader.exec_module(vision)
        for page in inventory:
            for figure in page['figures']:
                if not figure.get('path'):continue
                # An incomplete attempt is evidence to review, not permission
                # for an unbounded repeat on each resume.
                if figure.get('description'):continue
                # A table needs verified structure/numerical cells, not a model's guessed row count.
                if figure['kind']=='table':
                    figure['state']='needs_structured_table_review';continue
                try:
                    figure['description']=vision.describe(Path(figure['path']));figure['state']=figure['description']['state']
                except Exception as exc:
                    figure['state']='description_failed';figure['error']=str(exc)[:300]
                save(Path(page['figures'][0]['sourceImage']).parent/'visuals.json',page)
                save(output/'visuals.json',{'pages':inventory,'state':'described_needs_source_review','complete':False})
                print(json.dumps({'part':page['part'],'page':page['physicalPage'],'kind':figure['kind'],'state':figure['state']}),flush=True)
    print(json.dumps({'pages':len(inventory),'figures':sum(len(p['figures']) for p in inventory),'complete':False}),flush=True)

if __name__=='__main__':main()
