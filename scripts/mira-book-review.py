#!/usr/bin/env python3
"""Source-review workspace. Never overwrite extraction/raw/source artifacts."""
import argparse
import hashlib
import json
import subprocess
import time
import re
from pathlib import Path
from mira_book_util import save

PROJECT=Path(__file__).resolve().parents[1]
ROOT=Path('/Volumes/2tb/MIRA-local/books/brand-management')
REVIEW=ROOT/'review-2026-10-30'

def sha(path):
    with path.open('rb') as stream:return hashlib.file_digest(stream,'sha256').hexdigest()

def gutter(ocr):
    words=[w for line in ocr['lines'] for w in line.get('words',[]) if .2<(w['box'][1]+w['box'][3])/2<.9]
    values=[]
    for x in range(420,591):
        count=sum(min(12,len(w['text'])) for w in words if w['box'][0]<=x/1000<=w['box'][2])
        values.append((x,count))
    best=min(v for _,v in values);runs=[];run=[]
    for x,v in values:
        if v<=best+3:run.append(x)
        elif run:runs.append(run);run=[]
    if run:runs.append(run)
    # A persistent central text-free corridor separates the two page bodies.
    # Broad/ambiguous corridors remain explicit layout review flags.
    selected=min(runs,key=lambda xs:abs((xs[0]+xs[-1])/2-500)-min(25,len(xs))/3)
    cut=(selected[0]+selected[-1])/2000
    return cut,{'corridor':[selected[0]/1000,selected[-1]/1000],'wordCrossings':best,
                 'ambiguous':best>15 or len(selected)>85 or len(selected)<8}

def extract():
    from PIL import Image
    REVIEW.mkdir(parents=True,exist_ok=True)
    book=json.loads((ROOT/'book.json').read_text());audit=json.loads((ROOT/'coverage-quality.json').read_text())
    numbers={(r['part'],r['physicalPage'],r['side']):r for r in audit['regions']}
    baseline=REVIEW/'raw-baseline.json'
    if not baseline.exists():
        files=[Path(s['path']) for s in book['sources']]+[ROOT/'visuals.json',ROOT/'table-review.json',ROOT/'passages.jsonl']
        for page in book['pages']:
            folder=Path(page['image']).parent
            files.extend(p for p in folder.iterdir() if p.is_file() and p.suffix in ['.json','.txt','.png'])
        save(baseline,{'createdAt':time.strftime('%Y-%m-%dT%H:%M:%S%z'),'files':{str(p):sha(p) for p in sorted(set(files))}})
    worker=subprocess.Popen([str(PROJECT/'.mira-local-data/local-book-tools/mira-vision-ocr')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    entries=[]
    try:
        for page in book['pages']:
            original=Path(page['orientedImage']);image=Image.open(original).convert('RGB');w,h=image.size
            single=len(page['regions'])==1
            full=json.loads((original.parent/'orientation-ocr.json').read_text())
            cut,decision=(.5,{'single':True}) if single else gutter(full)
            x=round(cut*w)
            regions=[('single',(0,0,w,h))] if single else [('left',(0,0,min(w,x+96),h)),('right',(max(0,x-96),0,w,h))]
            for side,bounds in regions:
                key=f"p{page['part']:02d}-{page['physicalPage']:04d}-{side}"
                folder=REVIEW/'text'/key;folder.mkdir(parents=True,exist_ok=True)
                record=folder/'candidate.json'
                if record.exists():
                    existing=json.loads(record.read_text())
                    if existing['sourceSha256']==page['sourceSha256'] and existing['settings']=='adaptive-gutter-v1':entries.append(existing);continue
                target=folder/'page-region.png';image.crop(bounds).save(target)
                worker.stdin.write(json.dumps({'path':str(target),'correction':False})+'\n');worker.stdin.flush()
                ocr=json.loads(worker.stdout.readline());save(folder/'ocr.json',ocr)
                lines=[];excluded=[]
                for i,line in enumerate(ocr.get('lines',[])):
                    b=line['box'];global_center=bounds[0]+(b[0]+b[2])/2*(bounds[2]-bounds[0])
                    neighbor=(side=='left' and global_center>x) or (side=='right' and global_center<x)
                    item={'id':i,'text':line['text'],'box':b,'confidence':line['confidence']}
                    (excluded if neighbor else lines).append(item)
                text='\n'.join(l['text'] for l in lines);(folder/'candidate.txt').write_text(text)
                entry={'id':key,'part':page['part'],'physicalPage':page['physicalPage'],'side':side,'settings':'adaptive-gutter-v1',
                  'sourceSha256':page['sourceSha256'],'sourceImage':str(original),'candidateImage':str(target),
                  'imageSha256':sha(target),'gutter':cut,'gutterEvidence':decision,'bounds':bounds,
                  'printedPage':numbers.get((page['part'],page['physicalPage'],side),{}).get('expectedPrintedPage'),
                  'lines':lines,'excludedNeighborFragments':excluded,'candidateText':str(folder/'candidate.txt'),
                  'state':'candidate_needs_source_review','corrections':[],'unresolved':[]}
                save(record,entry);entries.append(entry)
            if page['physicalPage']%20==0:print(json.dumps({'part':page['part'],'page':page['physicalPage'],'regions':len(entries)}),flush=True)
            save(REVIEW/'text-candidates.json',{'entries':entries,'state':'processing'})
    finally:worker.stdin.close();worker.wait()
    save(REVIEW/'text-candidates.json',{'entries':entries,'state':'candidate_needs_source_review','completeBook':False})
    print(json.dumps({'textRegions':len(entries),'neighborsExcludedFromReadingCopy':sum(len(e['excludedNeighborFragments']) for e in entries)}),flush=True)

def boards():
    from PIL import Image,ImageDraw,ImageFont
    REVIEW.mkdir(parents=True,exist_ok=True)
    folder=REVIEW/'figure-boards';folder.mkdir(exist_ok=True)
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
    bold=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf',21)
    raw=json.loads((ROOT/'visuals.json').read_text());items=[]
    for page in raw['pages']:
        for figure in page['figures']:
            if figure['kind']!='figure':continue
            item={'id':f'f{len(items)+1:03d}','part':page['part'],'physicalPage':page['physicalPage'],'side':figure['side'],
                  'image':figure['path'],'imageSha256':sha(Path(figure['path'])),'state':'needs_source_review',
                  'originalDescription':figure.get('checkedDescription',figure.get('description',{})).get('content',{})}
            items.append(item)
    save(REVIEW/'figure-index.json',{'figures':items})
    def wrap(text,width,draw):
        result=[]
        for para in text.split('\n'):
            line=''
            for word in para.split():
                candidate=(line+' '+word).strip()
                if draw.textlength(candidate,font=font)>width and line:result.append(line);line=word
                else:line=candidate
            result.append(line)
        return result
    for offset in range(0,len(items),4):
        batch=items[offset:offset+4];cells=[]
        for item in batch:
            img=Image.open(item['image']).convert('RGB');img.thumbnail((920,480))
            content=item['originalDescription'];text='\n'.join(f'{k}: {v if isinstance(v,str) else json.dumps(v,ensure_ascii=False)}' for k,v in content.items())
            dummy=ImageDraw.Draw(Image.new('RGB',(1,1)));lines=wrap(text,920,dummy)
            height=max(900,70+img.height+len(lines)*23)
            cell=Image.new('RGB',(960,height),'white');d=ImageDraw.Draw(cell)
            d.text((12,8),f"{item['id']} | Part {item['part']} PDF {item['physicalPage']} {item['side']}",font=bold,fill='black')
            cell.paste(img,(12,50));y=60+img.height
            for line in lines:d.text((12,y),line,font=font,fill='black');y+=23
            cells.append(cell)
        heights=[max(c.height for c in cells[i:i+2]) for i in range(0,len(cells),2)]
        sheet=Image.new('RGB',(1920,sum(heights)+20),'#bbbbbb');y=0
        for row in range(len(heights)):
            for col in range(2):
                index=row*2+col
                if index<len(cells):sheet.paste(cells[index],(col*960,y))
            y+=heights[row]+10
        sheet.save(folder/f'figures-{offset//4+1:03d}.jpg',quality=94)
    print(json.dumps({'figures':len(items),'reviewBoards':(len(items)+3)//4}),flush=True)

def corroborate():
    """A second native OCR reading proposes differences; it never approves text."""
    from difflib import SequenceMatcher
    from PIL import Image,ImageDraw,ImageFont
    entries=json.loads((REVIEW/'text-candidates.json').read_text())['entries']
    worker=subprocess.Popen([str(PROJECT/'.mira-local-data/local-book-tools/mira-vision-ocr')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    differences=[];receipts=[]
    try:
        for e in entries:
            folder=Path(e['candidateText']).parent;path=folder/'language-assisted-ocr.json'
            if path.exists():ocr=json.loads(path.read_text())
            else:
                worker.stdin.write(json.dumps({'path':e['candidateImage'],'correction':True,'language':'en-US'})+'\n');worker.stdin.flush()
                ocr=json.loads(worker.stdout.readline());save(path,ocr)
            if not ocr.get('ok'):raise RuntimeError(f'Native OCR failed on {e["id"]}: {ocr}')
            assisted=[]
            for line in ocr['lines']:
                b=line['box'];center=e['bounds'][0]+(b[0]+b[2])/2*(e['bounds'][2]-e['bounds'][0]);cut=Image.open(e['sourceImage']).width*e['gutter']
                if (e['side']=='left' and center>cut) or (e['side']=='right' and center<cut):continue
                assisted.append(line)
            a=[l['text'] for l in e['lines']];b=[l['text'] for l in assisted]
            diff=[]
            for tag,i,j,k,m in SequenceMatcher(None,a,b,autojunk=False).get_opcodes():
                if tag=='equal':continue
                item={'id':f'd{len(differences)+1:05d}','regionId':e['id'],'printedPage':e['printedPage'],
                      'originalLineIds':[l['id'] for l in e['lines'][i:j]],'original':a[i:j],'proposal':b[k:m],
                      'boxes':[l['box'] for l in e['lines'][i:j]]+[l['box'] for l in assisted[k:m]],'image':e['candidateImage'],
                      'state':'needs_scan_review_not_autoapproved'}
                differences.append(item);diff.append(item['id'])
            receipts.append({'id':e['id'],'lines':len(a),'assistedLines':len(b),'differences':diff,'state':'machine_comparison_only'})
            if len(receipts)%30==0:print(json.dumps({'regions':len(receipts),'differences':len(differences)}),flush=True)
    finally:worker.stdin.close();worker.wait()
    save(REVIEW/'ocr-differences.json',{'differences':differences,'regions':receipts,'method':'Same native recognizer, language assistance toggled. Agreement is not independent source verification.'})
    # Source pixels above each pair of readings; reviewer must select from the scan.
    out=REVIEW/'ocr-difference-boards';out.mkdir(exist_ok=True)
    font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',18)
    for start in range(0,len(differences),8):
        tiles=[]
        for d in differences[start:start+8]:
            im=Image.open(d['image']).convert('RGB');w,h=im.size;boxes=d['boxes']
            crop=im.crop((max(0,int(min(x[0] for x in boxes)*w)-10),max(0,int(min(x[1] for x in boxes)*h)-6),min(w,int(max(x[2] for x in boxes)*w)+10),min(h,int(max(x[3] for x in boxes)*h)+6)))
            crop.thumbnail((1480,650));crop=crop.resize((crop.width*2,crop.height*2)) if crop.width<740 else crop
            texts=[d['id']+' '+d['regionId']+' printed '+str(d['printedPage']),'RAW: '+' | '.join(d['original']),'PROPOSAL: '+' | '.join(d['proposal'])]
            wrapped=[]
            for text in texts:
                wrapped.extend(text[i:i+145] for i in range(0,len(text),145))
            tile=Image.new('RGB',(1520,40+crop.height+23*len(wrapped)),'white');draw=ImageDraw.Draw(tile)
            draw.text((10,3),wrapped[0],font=font,fill='black');tile.paste(crop,(10,30));y=40+crop.height
            for line in wrapped[1:]:draw.text((10,y),line,font=font,fill='black');y+=23
            tiles.append(tile)
        sheet=Image.new('RGB',(1520,sum(t.height+8 for t in tiles)),'#bbbbbb');y=0
        for t in tiles:sheet.paste(t,(0,y));y+=t.height+8
        sheet.save(out/f'differences-{start//8+1:04d}.jpg',quality=94)
    print(json.dumps({'regions':len(receipts),'differences':len(differences),'boards':(len(differences)+7)//8,'autoapproved':0}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('command',choices=['extract','boards','corroborate']);args=parser.parse_args()
    {'extract':extract,'boards':boards,'corroborate':corroborate}[args.command]()
