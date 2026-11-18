#!/usr/bin/env python3
"""Assemble all available book information, preserving review state and raw files.

No OCR, model or network calls. This is a preparation artifact, never a publication
approval. Unreviewed retained text is explicitly pending, not silently discarded.
"""
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

BOOK = Path('/Volumes/2tb/MIRA-local/books/brand-management')
REVIEW = BOOK / 'review-2026-10-30'
WORK = Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion')
DECISIONS = WORK / 'review'
OUT = WORK / 'whole-book-information'


def read(path):
    return json.loads(path.read_text())


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def save(path, value):
    data = json.dumps(value, ensure_ascii=False, indent=2) + '\n'
    if not path.exists() or path.read_text() != data:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(data)


def column_order(items, spec):
    """Use only a saved visually checked column extent. Retain every item once."""
    if spec.get('layout') != 'columns':
        # OCR observations are already in reading sequence for a single column.
        # Sorting tall skewed boxes by their centre would reorder adjacent lines.
        if spec.get('layout') == 'single' and spec.get('lineOrder'):
            ranks = {str(lid): n for n, lid in enumerate(spec['lineOrder'])}
            return sorted(items, key=lambda i: (ranks.get(str(i['originalLineIds'][0]) if i['originalLineIds'] else i['key'].removeprefix('restored-'), 9999),
                                                i['key'].startswith('restored-')))
        return items
    blocks = [spec]
    if spec.get('secondColumnBlock'):
        blocks.append(spec['secondColumnBlock'])
    result = list(items)
    for block in blocks:
        inside = [i for i in result if block['startY'] <= i['box'][1] <= block['endY']]
        if not inside:
            continue
        def col(i):
            return i.get('column') or ('left' if sum(i['box'][::2]) / 2 < block['cut'] else 'right')
        left = [i for i in inside if col(i) == 'left']
        right = [i for i in inside if col(i) == 'right']
        def down_column(column):
            # Detector sometimes emits a detached list number before the title,
            # or a right-hand citation fragment after the next line. Compare the
            # centres of the skewed observation boxes within this checked column.
            # Side-by-side pieces on the same printed line retain left-to-right.
            result = sorted(column, key=lambda i: ((i['box'][1]+i['box'][3])/2, i['box'][0]))
            for at in range(1, len(result)):
                a, b = result[at-1], result[at]
                overlap = min(a['box'][3], b['box'][3])-max(a['box'][1], b['box'][1])
                height = min(a['box'][3]-a['box'][1], b['box'][3]-b['box'][1])
                if overlap > .4*height and b['box'][2] <= a['box'][0]:
                    result[at-1], result[at] = b, a
            return result
        left, right = down_column(left), down_column(right)
        ordered = left + right
        for nested in spec.get('nestedColumns', []):
            sub = [i for i in left if nested['startY'] <= i['box'][1] <= nested['endY']]
            if sub:
                sl = [i for i in sub if sum(i['box'][::2]) / 2 < nested['cut']]
                sr = [i for i in sub if i not in sl]
                index = min(ordered.index(i) for i in sub)
                ordered = [i for i in ordered if i not in sub]
                ordered[index:index] = sl + sr
        outside = [i for i in result if i not in inside]
        # Detached list-number observations may precede the box title in the
        # recognizer's array. Anchor the block by its checked spatial extent.
        before = [i for i in outside if i['box'][1] < block['startY']]
        after = [i for i in outside if i['box'][1] >= block['startY']]
        result = before + ordered + after
    assert Counter(i['key'] for i in result) == Counter(i['key'] for i in items)
    return result


def build():
    OUT.mkdir(parents=True, exist_ok=True)
    book = read(BOOK / 'book.json')
    sources = {s['part']: s for s in book['sources']}
    entries = read(REVIEW / 'text-candidates.json')['entries']
    coverage = read(DECISIONS / 'source-decisions.json')
    page_review = read(DECISIONS / 'page-reading-decisions.json')['pages']
    page_check_files=sorted((DECISIONS/'page-source-checks').glob('batch-*.json'))
    page_checks={}
    for path in page_check_files:
        for check in read(path):
            assert check['regionId'] not in page_checks, 'Duplicate complete-page check'
            assert check['quality']=='source_checked' and check['bookComplete'] is False
            page_checks[check['regionId']]={**check,'decisionFile':str(path)}
    final_audit = DECISIONS / 'final-audit-2026-10-30'
    lc_index_path = final_audit / 'low-confidence-index.json'
    lc_files = sorted(final_audit.glob('low-confidence-decisions-*.json'))
    lc_by_region = defaultdict(list)
    if lc_index_path.exists():
        lc_index = {x['id']: x for x in read(lc_index_path)}
        lc_decisions = {}
        for p in lc_files:
            for key, value in read(p).items():
                assert key not in lc_decisions, key
                lc_decisions[key] = value
        for key, decision in lc_decisions.items():
            record = lc_index[key]
            lc_by_region[record['regionId']].append((record, decision))
    checked = read(REVIEW / 'checked-export.json')
    decision_files = sorted(DECISIONS.glob('ocr-decisions-*.json'))
    decisions = {}
    for path in decision_files:
        for key, value in read(path).items():
            assert key not in decisions, key
            decisions[key] = value
    diffs = defaultdict(list)
    for d in read(REVIEW / 'ocr-differences.json')['differences']:
        diffs[d['regionId']].append(d)
    # Replace contained diagram/table OCR only where a checked representation
    # exists. False-positive figure detections never authorize masking body text.
    checked_visuals = {str(BOOK / u['sourceImage']): u for u in checked['units']
                       if u['contentType'] in ['checked_table', 'figure_description']}
    masks = defaultdict(list)
    oversized_masks_rejected = []
    raw_pages = {(p['part'], p['physicalPage']): p for p in book['pages']}
    for page in read(BOOK / 'visuals.json')['pages']:
        raw = raw_pages[(page['part'], page['physicalPage'])]
        for figure in page['figures']:
            unit = checked_visuals.get(figure.get('path'))
            if not unit:
                continue
            region = next((r for r in raw['regions'] if r['side'] == figure['side']), None)
            if region is None:
                # Cover detector used obsolete left/right crops while the OCR
                # receipt correctly identifies one single page. Keep its text;
                # never invent a geometry transform or drop observations.
                continue
            for prov in figure.get('provenance', []):
                b = prov['bbox']
                assert b['coord_origin'] == 'BOTTOMLEFT'
                ratio = (b['r']-b['l'])*(b['t']-b['b']) / ((region['bounds'][2]-region['bounds'][0])*raw['dimensions'][1])
                if ratio > .45:
                    # Several layout detections enclose a photographed page,
                    # including author paragraphs outside the described figure.
                    # A description cannot authorize deleting that page text.
                    oversized_masks_rejected.append({'unit':unit['id'],'part':page['part'],
                        'physicalPage':page['physicalPage'],'side':figure['side'],'areaRatio':ratio})
                    continue
                masks[(page['part'], page['physicalPage'], figure['side'])].append({
                    'unit': unit['id'], 'bounds': [region['bounds'][0] + b['l'],
                    raw['dimensions'][1] - b['t'], region['bounds'][0] + b['r'],
                    raw['dimensions'][1] - b['b']]})
    units, ledger, gaps, layout_pending = [], [], [], []
    regions = []
    front = {'p01-0002-left': 'XXIV', 'p01-0002-right': 'XXV',
             'p01-0003-right': 'XXVII', 'p01-0004-left': 'XXVIII'}
    for e in entries:
        rid = e['id']
        printed = coverage['visuallyCorroboratedPrintedPages'].get(rid, e['printedPage'])
        printed = printed if printed is not None else front.get(rid, 'cover (unnumbered)')
        original = {l['id']: l for l in e['lines']}
        account = {l['id']: {'regionId': rid, 'lineId': l['id'], 'state': 'retained_pending_source_check'} for l in e['lines']}
        if rid in coverage['duplicateRegions'] or rid in coverage['blankRegions']:
            state = 'excluded_duplicate' if rid in coverage['duplicateRegions'] else 'source_checked_blank'
            for row in account.values():
                row.update(state=state, canonicalRegion=coverage['duplicateRegions'].get(rid))
            ledger.extend(account.values())
            regions.append({'id': rid, 'printedPage': printed, 'state': state, 'originalLines': len(original)})
            continue
        if rid in coverage['blurredRegions']:
            for row in account.values():
                row.update(state='excluded_unreadable_source', reason=coverage['blurredRegions'][rid]['excluded'])
            ledger.extend(account.values())
            gaps.append({'regionId': rid, 'printedPage': printed, **coverage['blurredRegions'][rid]})
            regions.append({'id': rid, 'printedPage': printed, 'state': 'readable_salvage_only', 'originalLines': len(original)})
            continue
        nodes = {l['id']: [{'key': str(l['id']), 'text': l['text'], 'box': l['box'],
                           'originalLineIds': [l['id']], 'quality': 'pending'}] for l in e['lines']}
        insertions = []
        mapping_flags = []
        for d in diffs[rid]:
            assert d['id'] in decisions, 'Unreviewed difference ' + d['id']
            decision = decisions[d['id']]
            value = {'text': '\n'.join(d[decision])} if isinstance(decision, str) else decision
            ids = d['originalLineIds']
            for lid in ids:
                nodes[lid] = []
                account[lid].update(state='replaced_source_checked', decision=d['id'])
            if 'exclude' in value:
                for lid in ids:
                    account[lid].update(state='excluded_explicit_review', reason=value['exclude'])
                gaps.append({'id': d['id'], 'regionId': rid, 'printedPage': printed,
                             'reason': value['exclude'], 'type': 'explicit_exclusion_or_represented_elsewhere'})
                continue
            texts = value['text'].splitlines()
            assert texts and any(t.strip() for t in texts), d['id']
            boxes = [original[lid]['box'] for lid in ids]
            # A proposal-only insertion has its own observed source box.
            if not boxes:
                boxes = d['boxes']
            if len(texts) != len(boxes):
                # Keep the checked span intact, never truncate or zip away text.
                # Mixed-column mismatches require a specific page decision.
                boxes = [[min(b[0] for b in boxes), min(b[1] for b in boxes),
                          max(b[2] for b in boxes), max(b[3] for b in boxes)]]
                if len(texts) > 1 and value.get('orderEachLine'):
                    mapping_flags.append(d['id'])
                texts = ['\n'.join(texts)]
            replacements = [{'key': d['id'] + '-' + str(i), 'text': text, 'box': boxes[i],
                             'originalLineIds': ids, 'decision': d['id'], 'quality': 'source_checked'}
                            for i, text in enumerate(texts) if text.strip()]
            if ids:
                # Preserve each replacement's source position, including groups
                # whose original observations alternate between two columns.
                if len(replacements) == len(ids):
                    for lid, item in zip(ids, replacements):
                        item['originalLineIds'] = [lid]
                        nodes[lid].append(item)
                else:
                    nodes[ids[0]].extend(replacements)
            else:
                insertions.extend(replacements)
        spec = page_review.get(rid, {})
        for record, decision in lc_by_region[rid]:
            ids = record['lineIds']
            assert len(ids) == 1
            lid = ids[0]
            value = {'text': record['text']} if decision == 'original' else decision
            assert not any(lid in i['originalLineIds'] for k, values in nodes.items() if k != lid for i in values), record['id']
            if 'exclude' in value:
                nodes[lid] = []
                account[lid].update(state='excluded_explicit_review',decision=record['id'],reason=value['exclude'])
                gaps.append({'id':record['id'],'regionId':rid,'printedPage':printed,'reason':value['exclude'],
                             'type':'explicit_exclusion_or_represented_elsewhere'})
            else:
                nodes[lid] = [{'key':record['id'],'text':value['text'],'box':original[lid]['box'],
                               'originalLineIds':[lid],'quality':'source_checked','decision':record['id']}]
                account[lid].update(state='replaced_source_checked',decision=record['id'])
        for key, text in spec.get('lineOverrides', {}).items():
            lid = int(key)
            assert lid in nodes
            # Avoid applying a single-line override to only part of a multi-line
            # grouped replacement. Such an overlap must be resolved explicitly.
            for items in nodes.values():
                for item in items:
                    if lid in item['originalLineIds'] and item['originalLineIds'] != [lid]:
                        if len(item['text'].splitlines()) > 1:
                            raise ValueError('Grouped replacement overlaps line override: ' + rid + ':' + key)
            nodes[lid] = [{'key': 'page-' + key, 'text': text, 'box': original[lid]['box'],
                           'originalLineIds': [lid], 'quality': 'source_checked', 'decision': 'page-reading-decisions'}]
            account[lid].update(state='replaced_source_checked', decision='page-reading-decisions')
        for key, parts in spec.get('splitOverrides', {}).items():
            lid = int(key)
            nodes[lid] = [{'key': 'split-' + key + '-' + str(n), 'text': p['text'],
                           'box': original[lid]['box'], 'column': p['column'],
                           'originalLineIds': [lid], 'quality': 'source_checked', 'decision': 'page-reading-decisions'}
                          for n, p in enumerate(parts)]
            account[lid].update(state='replaced_source_checked', decision='page-reading-decisions')
            mapping_flags = [flag for flag in mapping_flags if flag not in
                             [d['id'] for d in diffs[rid] if lid in d['originalLineIds']]]
        items = []
        for lid in original:
            items.extend(nodes[lid])
            if str(lid) in spec.get('insertAfterLine', {}):
                items.append({'key': 'restored-' + str(lid), 'text': spec['insertAfterLine'][str(lid)],
                              'box': original[lid]['box'], 'originalLineIds': [],
                              'quality': 'source_checked', 'decision': 'page-reading-decisions'})
        for item in insertions:
            at = next((i for i, candidate in enumerate(items)
                       if candidate['box'][1] > item['box'][1]), len(items))
            items.insert(at, item)
        kept = []
        for item in items:
            b = item['box']
            w, h = e['bounds'][2] - e['bounds'][0], e['bounds'][3] - e['bounds'][1]
            absolute = [e['bounds'][0] + b[0]*w, b[1]*h, e['bounds'][0] + b[2]*w, b[3]*h]
            represented = next((m for m in masks[(e['part'], e['physicalPage'], e['side'])]
                                if absolute[0] >= m['bounds'][0]-2 and absolute[1] >= m['bounds'][1]-2
                                and absolute[2] <= m['bounds'][2]+2 and absolute[3] <= m['bounds'][3]+2), None)
            if represented:
                for lid in item['originalLineIds']:
                    account[lid].update(state='represented_by_checked_visual', replacementUnit=represented['unit'])
                continue
            kept.append(item)
        ordered = column_order(kept, spec)
        if mapping_flags:
            layout_pending.append({'regionId': rid, 'reason': 'Merged observation needs source-position mapping', 'decisions': mapping_flags})
        # Keep pending observations inside the preparation archive, but give each
        # its own quality status. They cannot be approved through this artifact.
        pending = [i['key'] for i in ordered if i['quality'] == 'pending']
        text = '\n'.join(i['text'] for i in ordered).strip() + '\n'
        page_check=page_checks.get(rid)
        if page_check:
            # Complete-page checks bind both the reviewed preparation and the
            # exact source image. They never promote unrelated pages or visuals.
            assert not mapping_flags, 'Position mapping must be resolved first'
            assert page_check['printedPage']==printed
            assert page_check['sourceImage']==e['candidateImage']
            assert page_check['sourceImageSha256']==sha(Path(e['candidateImage']))
            assert hashlib.sha256(text.encode()).hexdigest()==page_check['inputTextSha256'], 'Page check is stale: '+rid
            checked_path=Path(page_check['checkedText'])
            assert sha(checked_path)==page_check['checkedTextSha256']
            text=checked_path.read_text()
            for row in account.values():
                if row['state']=='retained_pending_source_check':
                    row.update(state='retained_source_checked_page',decision=page_check['decisionFile'])
            pending=[]
        if text.strip():
            artifact = f'pages/{rid}.txt'
            target = OUT / artifact
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists() or target.read_text() != text:
                target.write_text(text)
            units.append({'id': rid, 'part': e['part'], 'physicalPage': e['physicalPage'], 'side': e['side'],
                          'printedPage': printed, 'sourceFile': Path(sources[e['part']]['path']).name,
                          'sourceSha256': e['sourceSha256'], 'sourceImage': e['candidateImage'],
                          'sourceImageSha256': e['imageSha256'], 'artifact': artifact, 'artifactSha256': sha(target),
                          'contentType': 'ocr_text', 'authorship': 'author_text_transcription', 'text': text,
                          'quality': 'pending' if pending or mapping_flags else 'source_checked',
                          'readingOrder': 'source_checked' if spec or page_check else 'native_sequence_not_fully_source_checked',
                          'segments': [] if page_check else ordered,
                          **({'completePageReview':page_check} if page_check else {})})
        ledger.extend(account.values())
        regions.append({'id': rid, 'printedPage': printed, 'state': 'assembled_with_explicit_review_states',
                        'originalLines': len(original), 'retainedSegments': len(ordered),
                        'pendingSegments': len(pending), 'sourceCheckedReadingOrder': bool(spec or page_check),
                        'completePageTextSourceChecked':bool(page_check),
                        'meaningChangingDifferenceReview': 'finished', 'mappingFlags': mapping_flags})
    # Full checked visual and table representations are reused verbatim. All
    # checked spans remain available in checked-export; page text incorporates
    # corrections rather than replacing the book with those selected spans.
    for u in checked['units']:
        if u['contentType'] == 'ocr_text' and not u['id'].startswith('readable-') and not u.get('additionalSourceUnit'):
            continue
        artifact = f'checked/{u["id"]}.txt'
        target = OUT / artifact
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists() or target.read_text() != u['text']:
            target.write_text(u['text'])
        units.append({**u, 'artifact': artifact, 'artifactSha256': sha(target),
                      'authorship': 'checked_visual_description_not_author_verbatim' if u['contentType'] == 'figure_description'
                      else 'author_table_structured_transcription' if u['contentType'] == 'checked_table' else 'author_text_transcription',
                      'quality': 'source_checked', 'interpretation': False,
                      'scope': 'Readable source information only. Descriptions are our representation, not author quotations.'})
    assert len({u['id'] for u in units}) == len(units)
    expected = {(e['id'], l['id']) for e in entries for l in e['lines']}
    actual = [(r['regionId'], r['lineId']) for r in ledger]
    assert len(actual) == len(expected) and set(actual) == expected, 'Lost or duplicated source observation'
    assert all(u['artifactSha256'] == sha(OUT/u['artifact']) for u in units)
    counts = Counter(r['state'] for r in ledger)
    summary = {'bookComplete': False, 'physicalPages': len(book['pages']), 'regions': len(entries),
               'ocrDifferences': 3421, 'savedDifferenceDecisions': len(decisions), 'pendingOcrDifferences': 0,
               'accountedOriginalObservations': len(ledger), 'observationAccounting': dict(counts),
               'assembledPageTextUnits': sum(u['contentType'] == 'ocr_text' for u in units),
               'checkedTables': sum(u['contentType'] == 'checked_table' for u in units),
               'checkedFigureDescriptions': sum(u['contentType'] == 'figure_description' for u in units),
               'informationCharacters': sum(len(u['text']) for u in units),
               'sourceCheckedPageOrders': len(set(page_review)|set(page_checks)),
               'completePageTextSourceChecks':len(page_checks),'unresolvedPositionMappings': len(layout_pending),
               'oversizedVisualMasksRejected':len(oversized_masks_rejected),
               'lowConfidenceFollowupDecisions':sum(len(x) for x in lc_by_region.values()),
               'paidProviderRequests': 0, 'localModelTokensThisAssembly': 0,
               'quality': ('meaning-changing differences reviewed; retained agreeing OCR still explicitly pending source checks'
                   if counts['retained_pending_source_check'] else
                   'All retained readable page text source checked; missing/unreadable details remain excluded. Not publication approval.'),
               'publication': 'held; no rights or full-coverage checks bypassed',
               'rawFilesModified': False}
    inputs = [Path(__file__), *decision_files, DECISIONS/'source-decisions.json', DECISIONS/'page-reading-decisions.json',
              REVIEW/'text-candidates.json', REVIEW/'ocr-differences.json', REVIEW/'checked-export.json',
              WORK/'current-scope.json', BOOK/'book.json']
    inputs.extend([lc_index_path,*lc_files])
    # Bind source decisions, never generated audit reports (which would create
    # circular/stale hashes on the next audit).
    inputs.extend(sorted(final_audit.glob('numbered-figures-*.json')))
    inputs.extend([final_audit/name for name in ['additional-units.json','figure-followups.json','table-content-decisions.json']])
    inputs.extend(page_check_files)
    inputs.extend(Path(c['checkedText']) for c in page_checks.values())
    manifest = {'version': 1, 'bookId': 'brand-management',
                'title': 'Strategic Brand Management: Building, Measuring, and Managing Brand Equity',
                'author': 'Kevin Lane Keller', 'edition': 'Fourth Edition', 'bookComplete': False,
                'state': 'whole_available_information_preparation_not_approved_knowledge',
                'sources': book['sources'], 'processedPages': [{'part': p['part'], 'physicalPage': p['physicalPage']} for p in book['pages']],
                'summary': summary, 'sourceCoverage': coverage, 'units': units,
                'inputHashes': {str(p): sha(p) for p in inputs},
                'publicationRequirements': ['Permission/licence evidence for book text and visuals',
                    'Existing full-book source-coverage gate; missing/unreadable source remains unresolved',
                    'Outstanding source checks and existing item review/evaluation gates'],
                'exclusionPolicy': 'Unresolved segments stay in this preservation/preparation archive with pending state. They are excluded from approved live retrieval. No raw fallback is authorized.'}
    save(OUT/'information-bundle.json', manifest)
    save(OUT/'observation-ledger.json', ledger)
    save(OUT/'page-coverage.json', regions)
    save(OUT/'exclusion-list.json', {'bookComplete': False, 'sourceCoverage': coverage,
                                  'explicitExclusions': gaps, 'unresolvedPositionMappings': layout_pending,
                                  'oversizedVisualMasksRejected':oversized_masks_rejected,
                                  'pendingSourceObservations': [{'regionId': row['regionId'], 'lineId': row['lineId']}
                                      for row in ledger if row['state'] == 'retained_pending_source_check'],
                                  'pendingObservationSource': 'observation-ledger.json; exact original line IDs, not missing pages',
                                  'approvedKnowledgeExcluded': ['All pending OCR segments', 'All missing/unreadable details',
                                                               'All book material until publication requirements pass']})
    save(OUT/'validation.json', {'passed': True, 'scope': 'Preparation integrity, not full source quality or live publication',
                              'everyOriginalObservationAccountedExactlyOnce': True,
                              'allArtifactHashesMatch': True, 'sourceAndPageReferencesPresent': True,
                              'rawFallbackForApprovedKnowledge': False, 'summary': summary})
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    build()
