#!/usr/bin/env python3
"""Compile scan-review decisions without modifying any preserved raw artifact."""
import json,hashlib,time,argparse
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
from mira_book_util import save
ROOT=Path('/Volumes/2tb/MIRA-local/books/brand-management');REVIEW=ROOT/'review-2026-10-30'
WORK=Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion/review')
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def figures():
    decisions={}
    for p in sorted(WORK.glob('figure-decisions*.json')):
        for key,value in json.loads(p.read_text()).items():
            if key in decisions:raise ValueError(f'Duplicate decision {key}')
            decisions[key]=value
    follow_path=WORK/'final-audit-2026-10-30/figure-followups.json'
    follow=json.loads(follow_path.read_text()) if follow_path.exists() else {}
    index=json.loads((REVIEW/'figure-index.json').read_text())['figures'];out=[]
    previous={f['id']:f for f in json.loads((REVIEW/'figure-review.json').read_text())['figures']} if (REVIEW/'figure-review.json').exists() else {}
    assert set(decisions)=={f['id'] for f in index},'Every figure needs exactly one explicit decision'
    def expand(key,seen=None):
        seen=seen or set()
        if key in seen:raise ValueError('Circular repeated-design reference')
        d=decisions[key]
        if isinstance(d,str):return {'text':d}
        if 'sameVisibleDesignAs' in d:return {**expand(d['sameVisibleDesignAs'],seen|{key}),'sameVisibleDesignAs':d['sameVisibleDesignAs']}
        return d
    for f in index:
        if sha(f['image'])!=f['imageSha256']:raise ValueError('Source crop changed')
        d=dict(expand(f['id']))
        if f['id'] in follow:
            update=follow[f['id']]
            d['text']=update.get('replaceText',d.get('text',''))
            if update.get('appendText'):d['text']+=' '+update['appendText']
            d['excludedDetails']=update['excludedDetails']
            d['followupReview']='Direct scan check resolved deferred OCR review; remaining exclusions identify actual unreadable details.'
            if update.get('interpretationLimits'):d['interpretationLimits']=update['interpretationLimits']
        record={k:v for k,v in f.items() if k not in ['originalDescription','state']}
        if d.get('kind')=='table':
            assert all(len(r)==len(d['headers']) for r in d['rows'])
            d['text']=d['title']+'\n'+' | '.join(d['headers'])+'\n'+'\n'.join(' | '.join(r) for r in d['rows'])+'\n'+'\n'.join(d.get('notes',[]))
        record.update(d);record.setdefault('state','source_checked_with_excluded_details' if d.get('excludedDetails') else 'source_checked')
        record['reviewer']='Codex visual comparison with retained scan; generated description replaced, not self-approved'
        prior=previous.get(f['id'],{})
        record['checkedAt']=prior.get('checkedAt') if {k:v for k,v in prior.items() if k not in ['checkedAt','checkedText','checkedTextSha256']}==record else time.strftime('%Y-%m-%dT%H:%M:%S%z')
        if 'text' in d:
            folder=REVIEW/'figures'/f['id'];folder.mkdir(parents=True,exist_ok=True)
            target=folder/'checked.txt'
            if not target.exists() or target.read_text()!=d['text']+'\n':target.write_text(d['text']+'\n')
            record['checkedText']=str(target);record['checkedTextSha256']=sha(target)
            save(folder/'checked.json',record)
        out.append(record)
    save(REVIEW/'figure-review.json',{'figures':out,'allCandidatesHaveReviewDecision':True,'completeBook':False,
       'summary':{'candidates':len(out),'acceptedDescriptions':sum('text' in f and f.get('kind')!='table' for f in out),
       'newlyFoundTables':sum(f.get('kind')=='table' for f in out),'excludedCandidates':sum('text' not in f for f in out),
       'partialDescriptionsWithExcludedDetails':sum(bool(f.get('excludedDetails')) for f in out)}})
    print(json.dumps(json.loads((REVIEW/'figure-review.json').read_text())['summary']),flush=True)
def headers():
    entries=json.loads((REVIEW/'text-candidates.json').read_text())['entries'];needs=[];records=[]
    blanks={'p01-0003-left','p04-0067-left','p04-0068-left','p04-0075-right'}
    for e in entries:
        n=e['printedPage'];texts=[l['text'] for l in e['lines'] if l['box'][1]<.22 or l['box'][3]>.9]
        match=n is not None and any(str(n)==t.strip() or t.startswith(str(n)+' ') or t.endswith(' '+str(n)) for t in texts)
        r={'id':e['id'],'printedPage':n,'headerFooterOcrMatch':match,'blankSourcePreviouslyVisuallyChecked':e['id'] in blanks}
        records.append(r)
        if n is not None and not match and e['id'] not in blanks:needs.append(e)
    folder=REVIEW/'header-boards';folder.mkdir(exist_ok=True);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',22)
    for start in range(0,len(needs),8):
        tiles=[]
        for e in needs[start:start+8]:
            im=Image.open(e['candidateImage']).convert('RGB');w,h=im.size
            tile=Image.new('RGB',(1100,410),'white');d=ImageDraw.Draw(tile);d.text((5,3),e['id']+' expected '+str(e['printedPage']),font=font,fill='black')
            top=im.crop((0,0,w,int(h*.24)));top.thumbnail((1090,240));tile.paste(top,(5,35))
            bottom=im.crop((0,int(h*.89),w,h));bottom.thumbnail((1090,130));tile.paste(bottom,(5,275));tiles.append(tile)
        sheet=Image.new('RGB',(2200,410*((len(tiles)+1)//2)),'#bbb')
        for i,t in enumerate(tiles):sheet.paste(t,(i%2*1100,i//2*410))
        sheet.save(folder/f'headers-{start//8+1:03d}.jpg',quality=95)
    save(REVIEW/'printed-page-candidates.json',{'regions':records,'needsVisualHeaderReview':[e['id'] for e in needs]})
    print(json.dumps({'headerMatches':sum(r['headerFooterOcrMatch'] for r in records),'needsVisualHeaderReview':len(needs),'boards':(len(needs)+7)//8}),flush=True)
def rawcheck():
    baseline=json.loads((REVIEW/'raw-baseline.json').read_text());changed=[];missing=[]
    for path,expected in baseline['files'].items():
        if not Path(path).exists():missing.append(path)
        elif sha(path)!=expected:changed.append(path)
    receipt={'checkedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'filesChecked':len(baseline['files']),'changed':changed,'missing':missing,'unchanged':not changed and not missing}
    save(REVIEW/'raw-preservation-audit.json',receipt);print(json.dumps(receipt),flush=True)
    if changed or missing:raise RuntimeError('Preserved files changed or missing')
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('command',choices=['figures','headers','rawcheck']);a=p.parse_args();globals()[a.command]()
