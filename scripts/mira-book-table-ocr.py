#!/usr/bin/env python3
"""Retain table OCR cells/geometry; never invent values or auto-approve tables."""
import argparse
import json
import subprocess
from pathlib import Path
from mira_book_util import save

PROJECT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--book-id',required=True);args=parser.parse_args()
if args.book_id!='brand-management':raise ValueError('Use the currently inventoried book')
root=Path(json.loads((PROJECT/'.mira-local-data/local-book-tools/config.json').read_text())['externalRoot'])/'books'/args.book_id
visuals=json.loads((root/'visuals.json').read_text())
worker=subprocess.Popen([str(PROJECT/'.mira-local-data/local-book-tools/mira-vision-ocr')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
tables=[]
try:
    for page in visuals['pages']:
        for figure in page['figures']:
            if figure['kind']!='table':continue
            path=Path(figure['path']);output=path.with_name(path.stem+'-ocr.json')
            if output.exists():raw=json.loads(output.read_text())
            else:
                worker.stdin.write(json.dumps({'path':str(path),'correction':False})+'\n');worker.stdin.flush()
                raw=json.loads(worker.stdout.readline());save(output,raw)
            text='\n'.join(line['text'] for line in raw.get('lines',[]))
            target=path.with_name(path.stem+'-ocr.txt');target.write_text(text)
            tables.append({'part':page['part'],'physicalPage':page['physicalPage'],'side':figure['side'],'image':str(path),'ocr':str(output),
                'text':str(target),'characters':len(text),'state':'source_checked' if page['part']==1 and page['physicalPage']==13 else 'cells_and_structure_need_source_review',
                'complete':False})
finally:worker.stdin.close();worker.wait()
save(root/'table-review.json',{'tables':tables,'paidProviderRequests':0,'localModelTokens':0,'complete':False})
print(json.dumps({'tables':len(tables),'sourceChecked':sum(t['state']=='source_checked' for t in tables),'complete':False}))
