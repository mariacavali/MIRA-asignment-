#!/usr/bin/env python3
"""Export only explicit scan-review decisions. Unreviewed text never falls back to raw OCR."""
import hashlib,json,re,time
from pathlib import Path
from mira_book_util import save

BOOK=Path('/Volumes/2tb/MIRA-local/books/brand-management')
R=BOOK/'review-2026-10-30'
W=Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion/review')
def read(p):return json.loads(Path(p).read_text())
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def write_changed(p,text):
    if not p.exists() or p.read_text()!=text:p.write_text(text)
def clean_description(text):
    # Explanations of rejected model errors belong in the review ledger, never in retrieval content.
    sentences=re.split(r'(?<=[.!?])\s+',text)
    keep=[];notes=[]
    for sentence in sentences:
        if re.search(r'\b(generated|Removed|Corrected)\b',sentence):
            if '; removed ' in sentence:
                a,b=sentence.split('; removed ',1);keep.append(a.rstrip('.')+'.');notes.append('Removed '+b)
            else:notes.append(sentence)
        else:keep.append(sentence)
    return ' '.join(keep).strip(),notes
def table_text(d):
    assert d.get('rows') and all(len(row)==len(d['headers']) for row in d['rows'])
    path=W/'final-audit-2026-10-30/table-content-decisions.json'
    extra=read(path).get(d.get('id'),{}) if path.exists() else {}
    if extra.get('representation')=='independent_columns':
        text=d['title']+'\n'+'\n\n'.join(header+' (independent list)\n'+'\n'.join('• '+row[col] for row in d['rows'] if row[col].strip()) for col,header in enumerate(d['headers']))
    else:text=d['title']+'\n'+' | '.join(d['headers'])+'\n'+'\n'.join(' | '.join(c.replace('\n','; ') for c in row) for row in d['rows'])
    notes=d.get('sourceNotes',[])+extra.get('sourceNotes',[])
    return text+(' \nSource notes: '+'\n'.join(notes) if notes else '')
def build():
    book=read(BOOK/'book.json');sources={s['part']:s for s in book['sources']};src=read(W/'source-decisions.json')
    entries={e['id']:e for e in read(R/'text-candidates.json')['entries']}
    diffs=read(R/'ocr-differences.json')['differences'];decisions={};units=[];exclusions=[];receipts=[]
    decision_files=sorted(W.glob('ocr-decisions-*.json'))
    for p in decision_files:
        for k,v in read(p).items():
            if k in decisions:raise ValueError('Duplicate OCR decision '+k)
            decisions[k]=v
    if set(decisions)-{d['id'] for d in diffs}:raise ValueError('Unknown OCR decision')
    def add(uid,part,page,side,image,text,kind,meta):
        assert text.strip() and part in sources
        image=Path(image);assert image.is_relative_to(BOOK) and image.is_file()
        dest=R/'checked-units'/uid;dest.mkdir(parents=True,exist_ok=True)
        path=dest/'checked.txt';write_changed(path,text.strip()+'\n')
        region_id=f'p{part:02d}-{page:04d}-{side}'
        printed=src['visuallyCorroboratedPrintedPages'].get(region_id,entries.get(region_id,{}).get('printedPage'))
        front={'p01-0001-single':'XXV','p01-0002-left':'XXIV','p01-0002-right':'XXV','p01-0003-left':'XXVI (blank)','p01-0003-right':'XXVII','p01-0004-left':'XXVIII'}
        if printed is None:printed=front.get(region_id)
        if printed is None and part==4 and page==1:printed='cover (unnumbered)'
        assert printed is not None,f'No source-checked printed page mapping: {region_id}'
        meta={k:v for k,v in meta.items() if v is not None}
        unit={'id':uid,'part':part,'physicalPage':page,'side':side,'sourceSha256':sources[part]['sha256'],
              'sourceFile':Path(sources[part]['path']).name,'printedPage':printed,
              'artifact':str(path.relative_to(BOOK)),'text':path.read_text(),'contentType':kind,
              'sourceImage':str(image.relative_to(BOOK)),'sourceImageSha256':sha(image),'checkedTextSha256':sha(path),
              'state':'source_checked_partial' if meta.get('excludedDetails') else 'source_checked',**meta}
        write_changed(dest/'receipt.json',json.dumps({k:v for k,v in unit.items() if k!='text'},ensure_ascii=False,indent=2)+'\n');units.append(unit)
    for d in diffs:
        e=entries[d['regionId']];decision=decisions.get(d['id'])
        if e['id'] in src['duplicateRegions']:
            exclusions.append({'id':d['id'],'regionId':e['id'],'state':'excluded_duplicate','canonicalRegion':src['duplicateRegions'][e['id']]});continue
        if e['id'] in src['blurredRegions']:
            exclusions.append({'id':d['id'],'regionId':e['id'],'state':'excluded_blurred_region','reason':'Only the explicit readable-text salvage unit and checked photograph description are permitted.'});continue
        if decision is None:
            exclusions.append({'id':d['id'],'regionId':e['id'],'lineIds':d['originalLineIds'],'state':'pending_source_review','reason':'OCR difference is not an explicit scan-checked decision.'});continue
        value={'text':'\n'.join(d[decision])} if isinstance(decision,str) else decision
        if 'exclude' in value:
            exclusions.append({'id':d['id'],'regionId':e['id'],'lineIds':d['originalLineIds'],'state':'excluded_review_decision','reason':value['exclude']});continue
        text=value['text']
        if not text.strip():raise ValueError('Empty accepted OCR reading '+d['id'])
        # Interleaved source columns must remain separate units until the page layout has been checked.
        if value.get('orderEachLine'):
            lines=text.splitlines();assert len(lines)==len(d['originalLineIds']) or len(d['originalLineIds'])==1,d['id']
            for n,line in enumerate(lines):
                lid=d['originalLineIds'][min(n,len(d['originalLineIds'])-1)]
                add(d['id']+'-'+str(n),e['part'],e['physicalPage'],e['side'],e['candidateImage'],line,'ocr_text',
                    {'regionId':e['id'],'printedPage':e['printedPage'],'reviewDecision':d['id'],'originalLineIds':[lid],
                     'scope':'One source-checked line from an interleaved-column OCR block; adjacent unreviewed text excluded.'})
        else:add(d['id'],e['part'],e['physicalPage'],e['side'],e['candidateImage'],text,'ocr_text',
            {'regionId':e['id'],'printedPage':e['printedPage'],'reviewDecision':d['id'],'originalLineIds':d['originalLineIds'],
             'scope':'Only this explicit source-checked span; neighboring OCR is not approved by association.',
             'excludedDetails':value.get('excludedDetails',[])})
    # Every region reports unchecked lines, including lines where both OCR passes agree.
    by_region={}
    for d in diffs:
        if d['id'] in decisions:by_region.setdefault(d['regionId'],set()).update(d['originalLineIds'])
    for e in entries.values():
        unchecked=[l['id'] for l in e['lines'] if l['id'] not in by_region.get(e['id'],set())]
        receipts.append({'id':e['id'],'printedPage':e['printedPage'],'sourceImage':e['candidateImage'],
                         'sourceImageSha256':e['imageSha256'],'uncheckedLineIds':unchecked,
                         'state':'duplicate_excluded' if e['id'] in src['duplicateRegions'] else 'blank_source_checked' if e['id'] in src['blankRegions'] else 'partially_reviewed' if e['id'] in by_region else 'pending_source_review'})
    for f in read(R/'figure-review.json')['figures']:
        if 'text' not in f:exclusions.append({'id':f['id'],'state':f['state'],'reason':f.get('reason','Explicit review exclusion')});continue
        text,notes=clean_description(f['text'])
        add(f['id'],f['part'],f['physicalPage'],f['side'],f['image'],table_text(f) if f.get('kind')=='table' else text,
            'checked_table' if f.get('kind')=='table' else 'figure_description',
            {'excludedDetails':f.get('excludedDetails',[]),'reviewNotes':notes,'scope':'Checked visible content only; excluded details are not reconstructed.'})
    for t in read(R/'table-review.json')['tables']:
        add(t['id'],t['part'],t['physicalPage'],t['side'],t['sourceImage'],table_text(t),'checked_table',
            {'headers':t['headers'],'rows':t['rows'],'reviewNotes':t.get('notes',[]),'scope':'Source-checked row/column transcription; historical wording and blank cells preserved.'})
    audit=W/'final-audit-2026-10-30'
    extra_path=audit/'additional-units.json'
    numbered_files=sorted(audit.glob('numbered-figures-*.json'))
    additions=read(W/'additional-source-units.json')+(read(extra_path) if extra_path.exists() else [])
    for path in numbered_files:
        for value in read(path):
            part,page,side=value['regionId'].split('-')
            additions.append({**value,'part':int(part[1:]),'physicalPage':int(page),'side':side,
                'sourceImage':f'review-2026-10-30/text/{value["regionId"]}/page-region.png'})
    for a in additions:
        add(a['id'],a['part'],a['physicalPage'],a['side'],BOOK/a['sourceImage'],table_text(a) if a['contentType']=='checked_table' else a['text'],a['contentType'],
            {'printedPage':a['printedPage'],'excludedDetails':a.get('excludedDetails',[]),'reviewNotes':a.get('notes',[]),
             'additionalSourceUnit':True,'sourceNotes':a.get('sourceNotes',[])})
    for rid,b in src['blurredRegions'].items():
        e=entries[rid]
        if len(b['readableText'].strip())>3:add('readable-'+rid,e['part'],e['physicalPage'],e['side'],e['candidateImage'],b['readableText'],'ocr_text',
            {'printedPage':b['printedPage'],'excludedDetails':[b['excluded']]})
        exclusions.append({'id':rid,'state':'partial_blurred_source','excludedDetails':[b['excluded']]})
    ids=[u['id'] for u in units];assert len(ids)==len(set(ids))
    figures=read(R/'figure-review.json')['summary']
    input_files=sorted(set([*decision_files,*W.glob('figure-decisions*.json'),W/'source-decisions.json',W/'additional-source-units.json',W/'partial-import-scope.json',R/'figure-review.json',R/'table-review.json',R/'text-candidates.json',R/'ocr-differences.json',BOOK/'book.json',Path(__file__),Path(__file__).with_name('mira-review-compile.py'),Path(__file__).with_name('mira-book-review-tables.py')]))
    input_files+=list((W/'final-audit-2026-10-30').glob('*decisions*.json'))
    if extra_path.exists():input_files.append(extra_path)
    input_files+=numbered_files+[audit/'figure-followups.json']
    out={'version':2,'state':'source_checked_partial_subset','bookComplete':False,'sources':book['sources'],'processedPages':[{'part':p['part'],'physicalPage':p['physicalPage']} for p in book['pages']],
         'units':units,'exclusions':exclusions,'regionReview':receipts,'sourceCoverage':src,
         'summary':{'physicalPages':len(book['pages']),'regions':len(entries),'ocrDifferenceDecisions':len(decisions),'ocrDifferencesTotal':len(diffs),
                    'pendingOcrDifferences':sum(x['state']=='pending_source_review' for x in exclusions),
                    'uncheckedOcrLines':sum(len(x['uncheckedLineIds']) for x in receipts),'checkedUnits':len(units),
                    'checkedCharacters':sum(len(u['text']) for u in units),'checkedTables':sum(u['contentType']=='checked_table' for u in units),
                    'checkedFigureDescriptions':sum(u['contentType']=='figure_description' for u in units),**figures},
         'decisionDirectory':str(W),'decisionFiles':[str(p) for p in sorted([*decision_files,*W.glob('figure-decisions*.json')])],
         'inputHashes':{str(p):sha(p) for p in input_files},
         'publication':'held: text review, full printed-page coverage and rights not verified','paidProviderRequests':0}
    save(R/'checked-export.json',out);save(R/'checked-export-summary.json',{k:v for k,v in out.items() if k not in ['units','exclusions','regionReview','inputHashes']})
    print(json.dumps(out['summary']),flush=True)
if __name__=='__main__':build()
