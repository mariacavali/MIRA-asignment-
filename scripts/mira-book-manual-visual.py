#!/usr/bin/env python3
"""Source-read correction of the one figure that repeated text in both local trials."""
import hashlib
import json
from pathlib import Path
from mira_book_util import save

PROJECT=Path(__file__).resolve().parents[1]
root=Path(json.loads((PROJECT/'.mira-local-data/local-book-tools/config.json').read_text())['externalRoot'])/'books/brand-management'
manifest=json.loads((root/'visuals.json').read_text())
page=next(p for p in manifest['pages'] if p['part']==1 and p['physicalPage']==34)
figure=next(f for f in page['figures'] if Path(f['path']).name=='right-figure-002.png')
image=Path(figure['path'])
figure['checkedDescription']={'state':'source_checked','reviewer':'Codex source-image review','imageSha256':hashlib.sha256(image.read_bytes()).hexdigest(),
 'content':{'visible_text':'CHANGE WE CAN BELIEVE IN. A separate partly obscured sign reads VIRGINIA … FIRED UP!',
 'description':'A photograph of a campaign rally. A man in a dark suit stands near the centre with his arms crossed. People behind and in front hold mostly blue signs with white lettering. Several foreground hands and signs are out of focus.',
 'relationships':'The same campaign slogan repeats around the central person. Foreground signs partly cover the crowd and frame the centre of the photograph.',
 'uncertainties':'Small text and partly hidden signs are not fully legible. No additional sign wording is inferred.'},
 'paidProviderRequests':0,'newInputTokens':0,'newOutputTokens':0}
figure['state']='source_checked_manual_description'
save(image.parent/'visuals.json',page)
manifest['state']='all_detected_figures_have_descriptions_source_review_pending'
save(root/'visuals.json',manifest)
print(json.dumps({'correctedImage':str(image),'state':figure['state'],'priorAttemptsPreserved':True,'wholeBookComplete':False}))
