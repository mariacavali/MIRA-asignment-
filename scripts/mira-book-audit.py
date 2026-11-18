#!/usr/bin/env python3
"""Audit every supplied physical page, exact chunk coverage and review holds."""
import argparse
import json
import hashlib
from pathlib import Path
from mira_book_util import save

PROJECT=Path(__file__).resolve().parents[1]
WORK=Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion')

def main():
    args=argparse.ArgumentParser(description=__doc__);args.add_argument('--book-id',required=True);arg=args.parse_args()
    if arg.book_id!='brand-management':raise ValueError('Printed-page mapping is source-specific; review a new book before adding its mapping.')
    config=json.loads((PROJECT/'.mira-local-data/local-book-tools/config.json').read_text());root=Path(config['externalRoot'])/'books'/arg.book_id
    book=json.loads((root/'book.json').read_text());rows=[];expected=1;started=False
    for source in book['sources']:
        with Path(source['path']).open('rb') as stream:current_hash=hashlib.file_digest(stream,'sha256').hexdigest()
        if current_hash!=source['sha256']:raise RuntimeError('An original PDF changed since extraction; its cached coverage cannot be certified.')
    blank={(1,3,'left'),(4,67,'left'),(4,68,'left'),(4,75,'right')}
    for page in book['pages']:
        for region in page['regions']:
            key=(page['part'],page['physicalPage'],region['side'])
            if key==(1,4,'right'):started=True
            printed=None
            if started and not (page['part']==4 and page['physicalPage']==1):
                if key==(1,11,'left'):expected=16
                if key==(1,23,'left'):expected=38
                if key==(1,42,'left'):expected=74
                printed=expected if expected<=562 else None;expected+=1
            candidates=[c['number'] for c in region['printedPageCandidates'] if c['number']<=600 and
                ((region['side']=='left' and c['box'][0]<.45) or (region['side']=='right' and c['box'][0]>.65))]
            corroborated=printed is not None and printed in candidates
            low=len(region['lowConfidenceLines'])/max(1,region['lines'])
            issues=[]
            if key not in blank and not region['characters']:issues.append('no_text_requires_review')
            if low>.35 and region['lines']>15:issues.append('many_low_confidence_lines')
            if page['orientationConfidence']<.9:issues.append('orientation_requires_review')
            if key[:2]==(1,61):issues.append('confirmed_blurred_source_rescan_recommended')
            # Retain the whole-page OCR alongside all crops. Edge fragments are
            # suspect source contamination, never silently dropped from the raw artifact.
            ocr=json.loads(Path(region['ocr']).read_text())
            fragments=[i for i,line in enumerate(ocr['lines']) if (region['side']=='right' and line['box'][2]<.12) or (region['side']=='left' and line['box'][0]>.9)]
            if fragments:issues.append('crop_edge_fragments_require_review')
            rows.append({'part':page['part'],'physicalPage':page['physicalPage'],'side':region['side'],
                'expectedPrintedPage':printed,'printedPageEvidence':'ocr_header_corroborated' if corroborated else 'inferred_from_reviewed_continuity_not_individually_verified' if printed else 'unnumbered_frontmatter_cover_or_trailing_blank',
                'ocrHeaderCandidates':candidates,'characters':region['characters'],'lowConfidenceFraction':round(low,3),
                'edgeFragmentLines':fragments,'blankVisuallyChecked':key in blank,'issues':issues,'image':region['image'],
                'textReview':'pilot_checked' if key==(1,13,'left') else 'pending'})
    # Test the transport against the source artifacts, not just passage counts.
    source_text={(p['part'],p['physicalPage'],r['side']):Path(r['text']).read_text() for p in book['pages'] for r in p['regions']}
    covered={key:set() for key in source_text};passages=0
    for line in (root/'passages.jsonl').read_text().splitlines():
        item=json.loads(line);key=(item['part'],item['physicalPage'],item['side']);text=source_text[key]
        if item['text']!=text[item['start']:item['end']]:raise RuntimeError('Draft passage differs from source OCR')
        covered[key].update(range(item['start'],item['end']));passages+=1
    uncovered=[{'part':k[0],'page':k[1],'side':k[2],'missingCharacters':len(t)-len(covered[k])} for k,t in source_text.items() if len(t)!=len(covered[k])]
    report={'bookId':arg.book_id,'title':'Strategic Brand Management','author':'Kevin Lane Keller','edition':'Fourth edition',
        'sourceHashes':{str(source['part']):source['sha256'] for source in book['sources']},
        'originalPdfHashesRecheckedUnchanged':True,
        'identityEvidence':'Part 4 physical PDF page 1 cover; Part 1 physical PDF page 4 author biography',
        'physicalPageCoverage':book['physicalPageCoverage'],'regions':rows,'rawDraftPassages':passages,
        'rawOcrCharacters':sum(map(len,source_text.values())),'chunkCoverageUncovered':uncovered,
        'printedPageCoverage':{'mainNumberedRange':[1,562],'confirmedMissing':[14,15],
           'confirmedDuplicates':[{'printedPages':[38,39],'part':1,'physicalPages':[22,23]}, {'printedPages':[74,75],'part':1,'physicalPages':[41,42]}],
           'frontMatter':'Earlier preface/title/copyright/contents material is absent. First supplied pages include XXIV and XXV in reverse/duplicate order; exact missing Roman-page range needs source comparison.',
           'individuallyCorroboratedHeaders':sum(r['printedPageEvidence']=='ocr_header_corroborated' for r in rows),
           'continuityInferenceIsNotFullSourceVerification':True},
        'confirmedReadabilityProblems':[{'part':1,'physicalPdfPage':61,'printedPages':[112,113],'issue':'Image is visibly blurred; dense notes and chapter learning objectives cannot be trusted from OCR. Rescan recommended.'}],
        'flaggedRegions':sum(bool(r['issues']) for r in rows),'quality':'blocked_missing_pages_and_source_readability',
        'import':'prepared_draft_only','retrieval':'positive_live_book_retrieval_pending_quality_and_publication','complete':False,
        'paidProviderRequests':0,'pineconeRequests':0}
    visuals=json.loads((root/'visuals.json').read_text())
    figures=[(p,f) for p in visuals['pages'] for f in p['figures']]
    attempts=[d for _,f in figures for d in [*f.get('previousDescriptionAttempts',[]),*([f['description']] if f.get('description') else [])]]
    report['visualProcessing']={'inventoriedPhysicalPages':len(visuals['pages']),'detectedFiguresAndTables':len(figures),
       'tables':sum(f['kind']=='table' for _,f in figures),'figureDescriptionsAttempted':sum(bool(f.get('description')) for _,f in figures),
       'figureDescriptionsStructurallyComplete':sum(f.get('description',{}).get('state')=='described_needs_review' for _,f in figures),
       'sourceCheckedManualDescriptions':sum(bool(f.get('checkedDescription')) for _,f in figures),
       'notYetAttempted':[{'part':p['part'],'page':p['physicalPage'],'image':f['path']} for p,f in figures if f['kind']=='figure' and not f.get('description')],
       'incompleteDescriptions':[{'part':p['part'],'page':p['physicalPage'],'image':f['path']} for p,f in figures if f.get('description') and f['description']['state']!='described_needs_review' and not f.get('checkedDescription')],
       'sourceReview':'pending; structural JSON completeness is not factual approval'}
    report['usage']={'ocrModelTokens':0,'newLocalVisionInputTokens':sum(d.get('newInputTokens') or 0 for d in attempts),
       'newLocalVisionOutputTokens':sum(d.get('newOutputTokens') or 0 for d in attempts),
       'localVisionSeconds':round(sum(d.get('newElapsedSeconds') or 0 for d in attempts),3),
       'priorPilotLocalTokens':11484,'paidProviderRequests':0,'pineconeRequests':0,'billedProviderTokens':0,
       'unmeteredFailedLocalRequests':sum(bool(f.get('error')) for _,f in figures),
       'scope':'This full-book run plus separately labelled earlier pilot. Two initial local HTTP 500 failures returned no token receipt; their local usage is unknown and is not represented as zero.'}
    save(root/'coverage-quality.json',report)
    WORK.mkdir(parents=True,exist_ok=True)
    drive=Path('/Users/mariacavali/Library/CloudStorage/GoogleDrive-invisibleaiteam@gmail.com/My Drive/Mira RAG Library — Brand Discovery Canon/Mira books — Free Legal Materials')
    books=[{'title':'Strategic Brand Management — Keller, 4th edition','extraction':'287/287 physical PDF pages OCR processed',
       'coverage':'Missing printed 14–15; duplicate 38–39 and 74–75; front matter incomplete',
       'quality':'Hold: blurry printed 112–113 plus OCR/table/visual review flags', 'import':'draft preparation; no active publication',
       'retrieval':'not yet positively verified in live book RAG','complete':False,'report':str(root/'coverage-quality.json')}]
    verification=root/'rag/verification.json'
    if verification.exists():
        receipt=json.loads(verification.read_text())
        books[0]['import']=f"Unpublished local draft {receipt['releaseId']} ({receipt['storedItems']} passages), exact readback verified"
        books[0]['retrieval']='Active retrieval correctly withholds draft; positive published-book retrieval pending'
        books[0]['verification']=receipt
        prepared=json.loads((root/'rag/preparation-report.json').read_text())
        if receipt['bundleHash']!=prepared['bundleHash']:raise RuntimeError('The last draft verification does not match the current prepared bundle.')
        book.update(workingTitle='Strategic Brand Management: Building, Measuring, and Managing Brand Equity',
            author='Kevin Lane Keller',edition='Fourth edition',quality=report['quality'],
            importState='local_draft_imported_not_published',retrieval='positive_live_book_retrieval_pending',
            ragDraft={'releaseId':receipt['releaseId'],'items':receipt['storedItems'],'hash':receipt['bundleHash']},complete=False)
        book['import']='local_draft_imported_not_published'
        book['coverageQualityReport']=str(root/'coverage-quality.json');save(root/'book.json',book)
        intake_path=Path(book['sources'][0]['path']).parent/'source-status.json'
        intake=json.loads(intake_path.read_text())
        intake.setdefault('originalIntakeReport',{key:intake.get(key) for key in ['completeness','scanning','reportedBy','reportedAt','reportedCoverage']})
        intake.update(title=book['workingTitle'],author='Kevin Lane Keller',edition='Fourth edition',
           completeness='incomplete_verified',scanning='supplied_parts_processed_rescans_required',
           authorEditionAndPageCoverage='Identity verified from cover; printed 14–15 missing; earlier front matter incomplete; printed 112–113 visibly blurred.',
           seedTiming='Full-text local draft staged. Active publication/Pinecone seed held for source coverage, quality and source-use review.',
           libraryStatus=f"{receipt['storedItems']} passages imported as unpublished local draft {receipt['releaseId']}; no active book publication or Pinecone seed.",
           usageNote='Original PDFs unchanged. Preserve all originals/duplicate photos. Exact draft readback passed; positive published-book retrieval is still pending. Do not mark complete from extraction/import success.')
        intake['verification']={'by':'Codex source audit','checkedAt':__import__('time').strftime('%Y-%m-%dT%H:%M:%S%z'),
           'coverageReport':str(root/'coverage-quality.json'),'draftVerification':str(root/'rag/verification.json'),
           'confirmedMissingPrintedPages':[14,15],'rescanPrintedPages':[112,113],'complete':False}
        save(intake_path,intake)
    for folder in sorted(p for p in drive.iterdir() if p.is_dir() and p.name[:2].isdigit()):
        books.append({'title':folder.name,'extraction':'not started: full book missing','coverage':'Only notes/resource material/excerpts present',
          'quality':'full source unavailable','import':'not imported as a complete book','retrieval':'not applicable until full source available','complete':False,
          'files':[p.name for p in folder.iterdir() if p.is_file()]})
    save(WORK/'book-status.json',{'updatedAt':__import__('time').strftime('%Y-%m-%dT%H:%M:%S%z'),'books':books})
    text='# MIRA per-book status\n\nA book is complete only after source coverage, text/visual quality, import and positive retrieval verification pass.\n\n'
    text+='| Book | Extraction/source | Coverage and quality | Import / retrieval | Complete |\n|---|---|---|---|---|\n'
    for b in books:text+=f"| {b['title']} | {b['extraction']} | {b['coverage']}; {b['quality']} | {b['import']}; {b['retrieval']} | No |\n"
    text+='\nConfirmed rescan priorities: printed pages **14–15** (missing), **112–113** (blurred), and the earlier front matter. Originals and duplicate photos are preserved.\n'
    text+='\nDetailed page and quality receipts: '+str(root/'coverage-quality.json')+'\n'
    (WORK/'book-status.md').write_text(text)
    print(json.dumps({k:report[k] for k in ['physicalPageCoverage','rawDraftPassages','rawOcrCharacters','chunkCoverageUncovered','flaggedRegions','quality','complete']}))

if __name__=='__main__':main()
