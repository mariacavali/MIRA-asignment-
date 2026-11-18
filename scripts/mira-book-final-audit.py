#!/usr/bin/env python3
"""Read-only source audit; writes exact review inventories to the home work folder.

No OCR/model/provider calls, approvals, publication, or changes to source files.
"""
import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

WORK = Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion')
BOOK = Path('/Volumes/2tb/MIRA-local/books/brand-management')
REVIEW = BOOK/'review-2026-10-30'
OUT = WORK/'whole-book-information'
AUDIT = WORK/'review/final-audit-2026-10-30'

def read(path): return json.loads(path.read_text())
def save(name, data): (AUDIT/name).write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
def csv_save(name, rows, fields):
    with (AUDIT/name).open('w', newline='') as stream:
        writer=csv.DictWriter(stream, fieldnames=fields);writer.writeheader();writer.writerows(rows)
def sha(path):
    with path.open('rb') as stream: return hashlib.file_digest(stream, 'sha256').hexdigest()

def main():
    bundle=read(OUT/'information-bundle.json')
    checked=read(REVIEW/'checked-export.json')
    entries=read(REVIEW/'text-candidates.json')['entries']
    units={u['id']:u for u in bundle['units']}
    for path, digest in bundle['inputHashes'].items():
        assert sha(Path(path))==digest, f'Stale input {path}'
    for u in units.values(): assert sha(OUT/u['artifact'])==u['artifactSha256'], u['id']
    ledger=read(OUT/'observation-ledger.json')
    expected={(e['id'],l['id']) for e in entries for l in e['lines']}
    actual=[(row['regionId'],row['lineId']) for row in ledger]
    assert len(actual)==len(expected) and set(actual)==expected
    by_region=defaultdict(list)
    for row in ledger:
        if row['state']=='retained_pending_source_check': by_region[row['regionId']].append(row['lineId'])
    coverage=read(OUT/'page-coverage.json')
    pending=[]
    for p in coverage:
        if p['id'] not in by_region: continue
        u=units[p['id']]
        pending.append({'regionId':p['id'],'printedPage':p['printedPage'],'sourceFile':u['sourceFile'],
            'physicalPdfPage':u['physicalPage'],'side':u['side'],'pendingObservations':len(by_region[p['id']]),
            'lineIds':by_region[p['id']],'readingOrder':u['readingOrder'],
            'classification':'unfinished_source_check_not_missing_source'})
    save('pending-page-review.json', pending)
    csv_save('pending-page-review.csv', [{**p,'lineIds':' '.join(map(str,p['lineIds']))} for p in pending],
        ['regionId','printedPage','sourceFile','physicalPdfPage','side','pendingObservations','lineIds','readingOrder','classification'])
    # Each visual gap is a distinct record, with the exact excluded detail, not
    # a claim that the entire figure/page is unreadable or absent.
    gaps=[]
    for u in units.values():
        if not u.get('excludedDetails'):continue
        gaps.append({'id':u['id'],'printedPage':u['printedPage'],'sourceFile':u['sourceFile'],
            'physicalPdfPage':u['physicalPage'],'side':u['side'],'contentType':u['contentType'],
            'excludedDetails':u['excludedDetails'],'classification':'source_readability_or_explicit_interpretation_limit',
            'sourceImage':u['sourceImage']})
    save('unresolved-details.json',gaps)
    csv_save('unresolved-details.csv',[{**g,'excludedDetails':' | '.join(g['excludedDetails'])} for g in gaps],list(gaps[0]))
    tables=[{'id':u['id'],'printedPage':u['printedPage'],'sourceFile':u['sourceFile'],
        'physicalPdfPage':u['physicalPage'],'side':u['side'],'title':u['text'].splitlines()[0],
        'state':'source_checked','unresolvedDetails':u.get('excludedDetails',[])} for u in units.values() if u['contentType']=='checked_table']
    save('table-inventory.json',tables)
    # Inventory actual uppercase source captions. Body cross-references are not
    # counted as extra figures. Multiple figures sharing a crop stay explicit.
    captions={}
    for e in entries:
        for line in e['lines']:
            m=re.match(r'^FIGURE\s+(\d+)[–—-](\d+)',line['text'])
            if m: captions[tuple(map(int,m.groups()))]=e['id']
    by_page=defaultdict(list)
    for u in units.values():
        if u['contentType']!='ocr_text' or u.get('additionalSourceUnit'):
            by_page[(u['part'],u['physicalPage'],u['side'])].append(u)
    caption_rows=[]
    for (chapter,number),rid in sorted(captions.items()):
        part,page,side=rid.split('-');key=(int(part[1:]),int(page),side)
        candidates=by_page[key]
        exact=[u for u in candidates if re.search(r'Figure\s+'+str(chapter)+r'[-–]'+str(number)+r'\b',u['text'],re.I)]
        matched=exact or candidates
        assert matched, f'No checked representation for Figure {chapter}-{number} on {rid}'
        caption_rows.append({'figure':f'{chapter}-{number}','regionId':rid,'printedPage':units[rid]['printedPage'],
            'representationUnits':[u['id'] for u in matched],
            'state':'source_checked_with_explicit_detail_exclusions' if any(u.get('excludedDetails') for u in matched) else 'source_checked'})
    save('numbered-figure-inventory.json',caption_rows)
    # Regression checks for the actual information-loss cases, not just counts.
    anchors={'p02-0004-left':'Online','p02-0010-left':'six','p02-0013-left':'radio',
        'p02-0040-left':'celebrity','p02-0047-left':'inventory','p02-0048-left':'interpret',
        'p02-0049-left':'quantitative'}
    for rid,anchor in anchors.items(): assert anchor.lower() in units[rid]['text'].lower(), rid
    assert bundle['summary']['oversizedVisualMasksRejected']==10
    assert 'independent list' in units['t12']['text']
    assert '11-point scale' in units['t14']['text'] and 'definitely would not expect' in units['t14']['text']
    assert 'Hershey' in units['a005']['text'] and 'Hershey’s' not in units['a005']['text']
    assert 'SHINE' in units['f337']['text'] and '9% alc./vol.' in units['f346']['text']
    assert all(f'n{i:03d}' in units for i in range(1,54))
    findings={'bookComplete':False,'scope':'Exact extraction/review inventory; not publication or live retrieval verification',
        'preparationIntegrityPassed':True,'rawObservationAccountingExactlyOnce':len(expected),
        'pendingPageRegions':len(pending),'pendingOriginalObservations':sum(len(x) for x in by_region.values()),
        'pendingMainPrintedPages':[p['printedPage'] for p in pending if isinstance(p['printedPage'],int)],
        'pendingOtherPrintedPages':[p['printedPage'] for p in pending if not isinstance(p['printedPage'],int)],
        'pendingOcrDifferenceRecords':checked['summary']['pendingOcrDifferences'],
        'completePageTextSourceChecks':bundle['summary'].get('completePageTextSourceChecks',0),
        'lowConfidenceFollowupsCompleted':bundle['summary']['lowConfidenceFollowupDecisions'],
        'checkedStructuredTableUnits':len(tables),'unresolvedTableUnits':sum(bool(t['unresolvedDetails']) for t in tables),
        'numberedFiguresInventoried':len(caption_rows),'numberedFigureRepresentationsMissing':0,
        'checkedFigureDescriptionUnits':sum(u['contentType']=='figure_description' for u in units.values()),
        'visualDescriptionUnitsWithExplicitDetailLimits':sum(g['contentType']=='figure_description' for g in gaps),
        'gapRecordsIncludingReadableBlurSalvage':len(gaps),'unresolvedPositionMappings':bundle['summary']['unresolvedPositionMappings'],
        'missingMainPrintedPages':[14,15],'absentNumberedFrontMatter':'I–XXIII (23 numbered pages)',
        'unknownUnnumberedFrontMatterCount':True,'unreadableMainPageSections':read(WORK/'review/source-decisions.json')['blurredRegions'],
        'exclusionRecords':len(read(OUT/'exclusion-list.json')['explicitExclusions']),
        'newNumberedFigureUnits':53,'newAdditionalSourceUnits':['a005','a006','a007','a008'],
        'regressionsPassed':['page-wide mask body text retained','independent table lists','scale anchors',
            'recognition answer key','Pantene SHINE label','cocktail volume/alcohol labels','all new source units retained'],
        'providerCallsThisReview':0,'localModelCallsThisReview':0,'liveRetrievalVerified':False}
    save('audit-summary.json',findings)
    print(json.dumps({k:v for k,v in findings.items() if k not in ['pendingMainPrintedPages','pendingOtherPrintedPages','unreadableMainPageSections']},ensure_ascii=False))

if __name__=='__main__':main()
