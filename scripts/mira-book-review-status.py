#!/usr/bin/env python3
"""Refresh human status from validated preparation and an exact local draft receipt.

Does not approve content, publish, modify originals, or call a provider.
"""
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

W = Path('/Users/mariacavali/Desktop/Projects/brands/mira/work/2026-10_full-book-ingestion')
O = W / 'whole-book-information'
D = W / 'review/page-source-checks'
A = W / 'review/final-audit-2026-10-30'

def read(path):
    return json.loads(path.read_text())

def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')

def ranges(values):
    result = []
    for value in sorted(set(values)):
        if result and value == result[-1][1] + 1:
            result[-1][1] = value
        else:
            result.append([value, value])
    return result

def describe(values):
    return ', '.join(str(a) if a == b else f'{a}–{b}' for a, b in ranges(values))

bundle = read(O / 'information-bundle.json')
audit = read(A / 'audit-summary.json')
receipt = read(O / 'import-verification.json')
pending = read(A / 'pending-page-review.json')
checks = [c for path in sorted(D.glob('batch-*.json')) for c in read(path)]
assert audit['preparationIntegrityPassed'] and receipt['exactSqlReadbackVerified']
assert receipt['published'] is False and receipt['bookComplete'] is False
assert receipt['activeReleaseUnchanged'] and not receipt['paidProviderRequests']
assert audit['completePageTextSourceChecks'] == len(checks)
assert len({c['regionId'] for c in checks}) == len(checks)
checked = {c['regionId'] for c in checks}
units = {u['id']: u for u in bundle['units']}
assert all(units[rid]['quality'] == 'source_checked' for rid in checked)
assert all(row['regionId'] not in checked for row in pending)
stamp = datetime.now(timezone.utc).isoformat()
next_row = min((r for r in pending if isinstance(r['printedPage'], int)), key=lambda r: r['printedPage'], default=None)
cursor = None if next_row is None else {
    'printedPage': next_row['printedPage'], 'sourceFile': next_row['sourceFile'],
    'physicalPdfPage': next_row['physicalPdfPage'], 'side': next_row['side'],
    'regionId': next_row['regionId'],
}
main = describe(c['printedPage'] for c in checks if isinstance(c['printedPage'], int))
remaining = describe(r['printedPage'] for r in pending if isinstance(r['printedPage'], int))
other = sorted(str(c['printedPage']) for c in checks if not isinstance(c['printedPage'], int))
front = ', '.join(other)
q = receipt['sourceCheckedQualityPassages']
p = receipt['pendingQualityPassages']
total = receipt['passages']
count = audit['pendingOriginalObservations']
regions = audit['pendingPageRegions']
remaining_text = (f'{count:,} original observations across {regions} page regions still await direct source checking: printed {remaining}. Next: {cursor}.'
    if pending else 'No available readable page-text regions remain unchecked. Missing pages and unreadable details remain excluded; this is not whole-book completion.')
quality = f'{len(checks)} complete-page text checks: {main}; {front}. {count:,} original observations across {regions} regions remain pending. 53 structured tables and 349 visual descriptions reused; 97 descriptions retain explicit detail limits.'
imported = f'Unpublished local RAG draft {receipt["releaseId"]}, revision {receipt["revision"]}: {total:,} passages, {q:,} checked quality / {p:,} pending. Exact SQL readback and positive stored-content probes passed.'
progress = {
    'updatedAt': stamp, 'bookComplete': False,
    'scope': 'Continue all available pages. Skip missing sources; unpublished local draft only; no paid calls.',
    'completePageTextChecks': len(checks), 'checkedPrintedRanges': ranges(c['printedPage'] for c in checks if isinstance(c['printedPage'], int)),
    'checkedOtherPages': other, 'pendingSourceObservations': count,
    'pendingPageRegions': regions, 'pendingPrintedRanges': ranges(r['printedPage'] for r in pending if isinstance(r['printedPage'], int)),
    'nextReview': cursor, 'latestDraft': receipt['releaseId'], 'published': False,
    'rawFilesModified': False, 'newLocalModelTokens': 0, 'paidProviderRequests': 0,
}
write(D / 'progress.json', progress)
status = read(W / 'book-status.json')
book = status['books'][0]
book.update(quality=quality, import_=imported)
book.pop('import_', None)
book['import'] = imported
book.update(verification=receipt, informationCharacters=bundle['summary']['informationCharacters'], nextReview=cursor,
            extractionQuality='Full extracted text retained. Only direct scan-checked page text and separately checked tables/visual descriptions carry checked quality; remaining content stays pending.', complete=False)
status['updatedAt'] = stamp
write(W / 'book-status.json', status)
history = W / 'review/status-history/before-chapters2-through5-refresh'
history.mkdir(parents=True, exist_ok=True)
for name in ['processing-report.md', 'book-status.md']:
    if (W / name).exists() and not (history / name).exists():
        shutil.copy2(W / name, history / name)
rows = '\n'.join(f'| {b["title"]} | {b["import"]}; {b["quality"] if i == 0 else b["coverage"]} | No |' for i, b in enumerate(status['books']))
(W / 'book-status.md').write_text(f'''# MIRA per-book status

Updated {stamp}. Everything remains unpublished. Originals and previous checks/drafts are preserved.

| Book | Current state | Complete |
|---|---|---|
{rows}

[Current report](processing-report.md). Next review: {cursor}. Other titles remain unstarted until complete source books are available.
''')
(W / 'processing-report.md').write_text(f'''# Strategic Brand Management — local draft review

Kevin Lane Keller, Fourth Edition. Updated {stamp}. **Incomplete and unpublished.** No paid calls.

## Completed and saved

- **{len(checks)} complete-page text checks:** printed **{main}**, plus **{front}**. Each is bound to its scan hash, original assembled-text hash, corrected artifact and source/page reference in `review/page-source-checks/`.
- Missing sentence endings and paragraphs, wrong values and broken column order corrected against scans. Existing successful OCR and review decisions reused. Full extracted text remains available; no summary substitution.
- **53 structured table units**, **349 visual description units** and representations for all **129 numbered figures** retained. **97 descriptions still have explicit detail limits**; a checked page body does not clear them. The page135 slogan exercise now includes its exact printed upside-down answer key; page180 chart retains all seven channel/dollar pairs.
- All **38,160 original OCR observations accounted for exactly once**. **0 pending OCR-difference records**, **0 unresolved table units**, **0 unresolved position mappings**. These are separate from the broad page-source queue below.
- Preparation/input/source hash checks and content-loss regressions pass. **34 focused TypeScript tests and TypeScript checking passed.** Raw scans and historical OCR were only read; originals and all prior decisions remain preserved.

## Actual local import

{imported}

Bundle hash `{receipt['hash']}`. Source version {receipt['sourceVersion']}. **0 published passages.** Active knowledge unchanged; older drafts preserved. Positive text/table/figure stored-content probes and exact readback are local draft checks, not live retrieval. No exclusion-only test was used as ingestion evidence. No provider, embedding or Pinecone calls; no local model inference in this continuation.

[Import receipt](whole-book-information/import-verification.json) · [Stored-content probes](whole-book-information/retrieval-checks.json) · [Audit](review/final-audit-2026-10-30/audit-summary.json).

## Remaining quality and coverage gaps

- {remaining_text}
- **{p:,} draft passages have pending quality**, while **{q:,} have checked quality**. Transcription quality does not grant publication approval.
- **97 visual description units** retain specific detail limits, plus the readable page113 salvage: **98 gap records**. Exact IDs, pages and details: [unresolved-details.csv](review/final-audit-2026-10-30/unresolved-details.csv). Existing verified concepts/labels remain retained; unreadable details are not guessed.
- Exact page/line IDs and PDF references: [pending-page-review.csv](review/final-audit-2026-10-30/pending-page-review.csv). [Explicit exclusion list](whole-book-information/exclusion-list.json) retains {audit['exclusionRecords']} disposition records, which are not all missing information.

## Missing or insufficient source — deferred for Maria

- Main printed **14–15** are missing.
- Earlier numbered front matter **I–XXIII** is absent. The unnumbered title/copyright/front-matter count is unknown.
- **112:** blurred bibliography, part1 PDF photo61 left. **113:** unreadable learning objectives and small photograph caption, photo61 right. Readable salvage is preserved separately.
- Better source views are needed only for the exact informative unreadable details listed above if those details are to be recovered. No page is marked complete by assumption.

## Publication and drive

Current scope requires everything to stay unpublished. Existing source permission, item review/evaluation, coverage and publication validators are preserved. No rights evidence or approvals were invented. Detailed publication documentation remains in [permission-evidence-requirements.md](review/final-audit-2026-10-30/permission-evidence-requirements.md); no publication request is pending from this draft-only task.

Draft text is stored on the Mac/local database; reading that stored text does not require the external drive. The drive is needed to reopen the original scans or review better source files later. Other titles remain unstarted because their complete source files are unavailable.
''')
print(json.dumps({'completePageChecks': len(checks), 'pendingRegions': regions, 'nextReview': cursor,
                  'localDraft': receipt['releaseId'], 'published': False}))
