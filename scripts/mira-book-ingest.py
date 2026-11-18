#!/usr/bin/env python3
"""Resumable full-source LOCAL preparation. Extraction never grants publication.

All original PDFs remain in place. Apple Vision retains reading order/word boxes;
every physical page and both sides of a spread are accounted for. Derived text,
image descriptions and source-checked corrections remain separate evidence.
"""
import argparse
import hashlib
import fcntl
import json
import math
import os
import re
import subprocess
import time
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
VERSION = 'apple-vision-full-source-v2-orientation'

def digest(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()

def save(path, value):
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')
    temp.replace(path)

def chunks(text, maximum=1000, overlap=120):
    """Exact character slices: union covers every source character, no summary."""
    start = 0
    while start < len(text):
        end = min(len(text), start+maximum)
        if end < len(text):
            boundary = text.rfind('\n', start+maximum//2, end)
            if boundary > start: end = boundary+1
        yield start, end, text[start:end]
        if end == len(text): break
        start = end-overlap

def printed_candidates(lines):
    found = []
    for i, line in enumerate(lines):
        t, b = line['text'].strip(), line['box']
        if re.fullmatch(r'\d{1,4}', t) and (b[1] < .22 or b[1] > .88):
            # Header/footer edge, rather than table cells/year labels.
            if b[0] < .38 or b[2] > .72:
                found.append({'number':int(t), 'line':i, 'box':b, 'confidence':line['confidence']})
    return found

def orientation(ocr):
    votes={0:0,90:0,180:0,270:0}
    for line in ocr.get('lines',[]):
        words=line.get('words',[])
        if len(words)<4: continue
        a,b=words[0]['box'],words[-1]['box']
        dx=((b[0]+b[2])-(a[0]+a[2]))*ocr['width']
        dy=((b[1]+b[3])-(a[1]+a[3]))*ocr['height']
        angle=math.degrees(math.atan2(dy,dx))
        quadrant=int(round(angle/90)*90)%360
        votes[quadrant]+=len(line['text'])
    selected=max(votes,key=votes.get)
    # PIL positive rotation is counterclockwise: this removes the image-coordinate text angle.
    return selected, votes, votes[selected]/max(1,sum(votes.values()))

def is_letterboxed_single(image):
    w,h=image.size
    if w<=h:return True
    bounds=image.convert('L').point(lambda pixel:255 if pixel<245 else 0).getbbox()
    return bool(bounds and bounds[0]>.1*w and bounds[2]<.9*w and bounds[2]-bounds[0]<.9*h)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--book-id', required=True)
    parser.add_argument('--max-pages', type=int)
    args=parser.parse_args()
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,79}', args.book_id): raise ValueError('Invalid book ID')
    config=json.loads((PROJECT/'.mira-local-data/local-book-tools/config.json').read_text())
    root=Path(config['externalRoot'])
    if not os.path.ismount(root.parent): raise RuntimeError('Connect the selected USB drive')
    source_dir=args.source_dir.resolve(strict=True)
    files=sorted(p for p in source_dir.iterdir() if p.suffix.lower()=='.pdf' and not p.name.startswith('._'))
    if not files: raise ValueError('No PDFs in the explicit source folder')
    lock_path=PROJECT/'.mira-local-data/local-book-tools'/f'{args.book_id}-ingest.lock'
    job_lock=lock_path.open('w')
    try:fcntl.flock(job_lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:raise RuntimeError('This book already has a running OCR job')
    import pypdfium2 as pdfium
    from PIL import Image, ImageDraw
    output=root/'books'/args.book_id; output.mkdir(parents=True,exist_ok=True)
    worker=subprocess.Popen([str(PROJECT/'.mira-local-data/local-book-tools/mira-vision-ocr')],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
    manifest={'format':'mira-full-book-preparation-v1','bookId':args.book_id,'workingTitle':'Brand Management (identity pending source verification)',
      'processingVersion':VERSION,'sources':[], 'pages':[], 'extraction':'processing','quality':'not_verified','import':'not_imported',
      'retrieval':'not_verified','complete':False,'paidProviderRequests':0,'pineconeRequests':0,
      'imageHandling':'Full physical page and both overlapping regions preserved. Visual interpretation is a separate reviewed stage.',
      'startedAt':time.strftime('%Y-%m-%dT%H:%M:%S%z')}
    # Inventory every part before an optional pilot bound; a page limit must not
    # make the remainder of a multi-part book disappear from expected coverage.
    for part,source in enumerate(files,1):
        pdf=pdfium.PdfDocument(source)
        manifest['sources'].append({'part':part,'path':str(source),'sha256':digest(source),'physicalPages':len(pdf),'bytes':source.stat().st_size})
        pdf.close()
    total=0
    try:
        for part, source in enumerate(files,1):
            sha=manifest['sources'][part-1]['sha256']; pdf=pdfium.PdfDocument(source)
            for index in range(len(pdf)):
                total+=1
                if args.max_pages and total>args.max_pages: break
                number=index+1; folder=output/f'part-{part:02d}'/f'page-{number:04d}'; folder.mkdir(parents=True,exist_ok=True)
                receipt=folder/'page.json'
                if receipt.exists():
                    data=json.loads(receipt.read_text())
                    if data.get('sourceSha256')==sha and data.get('processingVersion')==VERSION and data.get('extraction')=='extracted':
                        with Image.open(data['orientedImage']) as cached_image:expected_regions=1 if is_letterboxed_single(cached_image) else 2
                        if len(data['regions'])==expected_regions:
                            manifest['pages'].append(data); continue
                start=time.perf_counter()
                page=pdf[index]; image=page.render(scale=2).to_pil().convert('RGB'); page.close()
                original=folder/'source-page.png'; image.save(original)
                def recognize(target):
                    worker.stdin.write(json.dumps({'path':str(target),'language':'en-US','correction':False})+'\n');worker.stdin.flush()
                    raw=worker.stdout.readline()
                    if not raw: raise RuntimeError('Native OCR worker stopped; cached pages remain resumable')
                    return json.loads(raw)
                full=recognize(original);save(folder/'orientation-ocr.json',full)
                rotation,votes,certainty=orientation(full)
                if rotation: image=image.rotate(rotation,expand=True)
                oriented=folder/'oriented-page.png';image.save(oriented)
                w,h=image.size
                regions=[('single',(0,0,w,h))] if is_letterboxed_single(image) else [('left',(0,0,w//2+24,h)),('right',(w//2-24,0,w,h))]
                data={'processingVersion':VERSION,'sourceSha256':sha,'part':part,'physicalPage':number,'image':str(original),
                      'dimensions':[w,h],'orientedImage':str(oriented),'rotationCounterclockwise':rotation,
                      'orientationVotes':votes,'orientationConfidence':certainty,
                      'regions':[],'extraction':'extracted','quality':'needs_review','visuals':'not_reviewed'}
                for side,bounds in regions:
                    target=folder/f'{side}.png'; image.crop(bounds).save(target)
                    ocr=recognize(target); save(folder/f'{side}-ocr.json',ocr)
                    if not ocr.get('ok'):
                        data['extraction']='errors'; data['regions'].append({'side':side,'error':ocr.get('error'),'quality':'unreadable'}); continue
                    lines=ocr['lines']; text='\n'.join(line['text'] for line in lines)
                    (folder/f'{side}.txt').write_text(text)
                    # Native observation order handles columns; never globally sort all lines by y.
                    low=[i for i,line in enumerate(lines) if line['confidence']<.75]
                    row={'side':side,'bounds':bounds,'overlapPixels':48 if len(regions)==2 else 0,'image':str(target),
                         'ocr':str(folder/f'{side}-ocr.json'),'text':str(folder/f'{side}.txt'),'characters':len(text),
                         'lines':len(lines),'lowConfidenceLines':low,'printedPageCandidates':printed_candidates(lines),
                         'quality':'needs_review' if text else 'no_text_needs_visual_review','seconds':ocr['seconds']}
                    data['regions'].append(row)
                data['seconds']=round(time.perf_counter()-start,3); save(receipt,data); manifest['pages'].append(data)
                save(output/'book.json',manifest)
                if total%10==0 or number==1: print(json.dumps({'part':part,'physicalPage':number,'processed':len(manifest['pages']),'seconds':data['seconds']}),flush=True)
            pdf.close()
            if args.max_pages and total>=args.max_pages: break
    finally:
        worker.stdin.close(); worker.wait()
    expected=sum(s['physicalPages'] for s in manifest['sources'])
    manifest['physicalPageCoverage']={'expected':expected,'processed':len(manifest['pages']),
        'failed':[{'part':p['part'],'page':p['physicalPage']} for p in manifest['pages'] if p['extraction']!='extracted']}
    manifest['extraction']='extracted' if len(manifest['pages'])==expected and not manifest['physicalPageCoverage']['failed'] else 'partial_or_errors'
    manifest['quality']='needs_reading_order_printed_page_and_visual_review'
    manifest['finishedAt']=time.strftime('%Y-%m-%dT%H:%M:%S%z')
    save(output/'book.json',manifest)
    # Exact full-text draft transport, not an editorial card or published corpus.
    chunk_count=0
    with (output/'passages.jsonl').open('w') as stream:
        for page in manifest['pages']:
            for region in page['regions']:
                if 'text' not in region: continue
                text=Path(region['text']).read_text()
                for begin,end,content in chunks(text):
                    key=f"{page['sourceSha256']}:{page['physicalPage']}:{region['side']}:{begin}:{end}:{VERSION}"
                    passage={'id':hashlib.sha256(key.encode()).hexdigest(),'bookId':args.book_id,'kind':'source_passage',
                      'sourceSha256':page['sourceSha256'],'part':page['part'],'physicalPage':page['physicalPage'],'side':region['side'],
                      'printedPageCandidates':region['printedPageCandidates'],'start':begin,'end':end,'text':content,
                      'sourceImage':region['image'],'sourceOcr':region['ocr'],'quality':'unreviewed','publicationEligible':False}
                    stream.write(json.dumps(passage,ensure_ascii=False)+'\n'); chunk_count+=1
    manifest['draftPassages']=chunk_count; save(output/'book.json',manifest)
    # Contact sheets show every physical source page, not just the successful OCR pages.
    for offset in range(0,len(manifest['pages']),16):
        batch=manifest['pages'][offset:offset+16]; sheet=Image.new('RGB',(1280,4*270),'white');draw=ImageDraw.Draw(sheet)
        for slot,page in enumerate(batch):
            img=Image.open(page['orientedImage']);img.thumbnail((310,240))
            x=(slot%4)*320;y=(slot//4)*270;sheet.paste(img,(x,y+22));draw.text((x+4,y+3),f"Part {page['part']} / PDF {page['physicalPage']}",fill='black')
        sheet.save(output/f'coverage-{offset//16+1:02d}.jpg',quality=90)
    print(json.dumps({'output':str(output),'physicalCoverage':manifest['physicalPageCoverage'],'draftPassages':chunk_count,'complete':False}),flush=True)

if __name__=='__main__': main()
