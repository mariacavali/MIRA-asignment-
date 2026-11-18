#!/usr/bin/env python3
"""Save explicit complete-page scan checks; never infer approval from OCR agreement.

Input JSON must be written only after direct visual comparison. Raw files and
existing checks remain untouched. A failed replacement leaves no new batch.
"""
import hashlib,json,sys
from pathlib import Path
W=Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion')
D=W/'review/page-source-checks'
def read(p):return json.loads(p.read_text())
def sha(b):return hashlib.sha256(b).hexdigest()
spec=read(Path(sys.argv[1]));assert spec['directScanReviewCompleted'] is True
target=D/spec['batch'];assert target.suffix=='.json' and target.parent==D and not target.exists()
units={u['id']:u for u in read(W/'whole-book-information/information-bundle.json')['units']}
prior={c['regionId'] for p in D.glob('batch-*.json') for c in read(p)}
records=[];texts={}
for decision in spec['pages']:
    rid=decision['regionId'];assert rid not in prior and rid not in texts,rid
    unit=units[rid];assert unit['quality']=='pending',rid
    text=unit['text']
    for old,new in decision.get('replacements',[]):
        assert old in text,(rid,old)
        text=text.replace(old,new)
    text=decision.get('checkedText',text)
    assert text.strip() and sha(unit['text'].encode())==unit['artifactSha256']
    path=D/(rid+'.txt');texts[rid]=text
    records.append(dict(regionId=rid,printedPage=unit['printedPage'],sourceImage=unit['sourceImage'],
        sourceImageSha256=unit['sourceImageSha256'],inputTextSha256=unit['artifactSha256'],checkedText=str(path),
        checkedTextSha256=sha(text.encode()),quality='source_checked',bookComplete=False,
        review=decision.get('review',spec['review'])))
for rid,text in texts.items():
    path=D/(rid+'.txt');assert not path.exists(),path;path.write_text(text)
target.write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'saved':len(records),'printedPages':[r['printedPage']for r in records],'batch':str(target)}))
