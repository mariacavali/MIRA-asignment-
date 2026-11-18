#!/usr/bin/env python3
"""Apply source-checked pilot corrections; raw OCR and earlier trials are retained."""
import json
from pathlib import Path
from mira_book_util import save

PROJECT=Path(__file__).resolve().parents[1]
ROOT=Path(json.loads((PROJECT/'.mira-local-data/local-book-tools/config.json').read_text())['externalRoot'])
folder=ROOT/'books/brand-management/part-01/page-0013'
left=json.loads((folder/'left-ocr.json').read_text())
lines=[x['text'] for x in left['lines']]
assert lines[4].startswith('Branding is not limited') and lines[23].startswith('Branding countries')
assert lines[41]=='Geographic Locations'
# These corrections were read directly from the retained source image, not guessed
# from language-model output. The original OCR is never overwritten.
corrections={7:'cation. Some notable early examples of place branding include',
8:'"Virginia is for Lovers" and "Shrimp on the Barbie" (Australia).',
14:'Las Vegas ran its hugely successful "What Happens Here,',
15:'Stays Here" campaign beginning in 2003. The ads were meant',
22:"larger than the city's top competitors' budgets combined.",
25:"Spain's use of a logo designed by Spanish artist Joan Miró, the",
27:'of itself in relation to the Lord of the Rings movie franchise.',
28:'Some other tourist slogans include "No Artificial Ingredients"',
30:'lize. Future Brand, a brand consultancy and research company,',
35:'ists." USA Today, 12 February 2010; Yana Polikarpov, "Visitors Bureau',
36:'Lures Tourists to \'Happy\' San Diego," Brandweek, 23 April 2009; Liz',
37:'Benston, "Will Vegas Advertising That Worked Before, Work Again?"',
38:'Las Vegas Sun, 27 September 2009; Sean O\'Neill, "Careful with Those',
39:'Tourist Slogans," Budget Travel, 24 September 2009; John Cook,',
59:"Interbrand's ranking of the world's 25 most valuable brands in 2011 based on its brand valuation",
60:'methodology (see Chapter 10), as published in its annual "Best Global Brands" report.',
61:'We can easily find some of the best-known brands by simply walking down a supermarket',
62:"aisle. It's also easy to identify a number of other brands with amazing staying power that have",
63:'been market leaders in their categories for decades. According to research by marketing con-',
64:'sultant Jack Trout, in 25 popular product categories, 20 of the leading brands in 1923 were still',
65:'leading brands over 80 years later—only five have lost their leadership position.'}
for i,t in corrections.items():lines[i]=t
(folder/'left-checked.txt').write_text('\n'.join(lines))
right=json.loads((folder/'right-ocr.json').read_text())['lines']
headers=['2011 Rank','Brand','2011 Brand Value','2010 Brand Value','2011–2010 Percent Change','Country of Ownership']
# Native OCR order is column-major on the table. Bind cells to the six verified
# columns and 25 aligned rows, rather than indexing column-major text as prose.
def column(first):
    start=next(i for i,line in enumerate(right) if line['text']==first)
    return [line['text'] for line in right[start:start+25]]
brands=column('Coca-Cola');values11=column('71,861');values10=column('70,452')
# OCR observation indices can change between renders. These source-checked
# columns are explicit transcriptions; never assume a fixed native line offset.
changes=['2%','8%','-3%','27%','0%','6%','10%','58%','1%','6%','6%','9%','9%','-15%','10%','3%','20%','6%','5%','16%','2%','4%','5%','14%','6%']
countries=['United States']*10+['Japan','Germany','United States','Finland','Germany','United States','South Korea','France','Japan','United States','Sweden','United States','United States','Germany','United States']
rows=[[str(i+1),*v] for i,v in enumerate(zip(brands,values11,values10,changes,countries))]
assert len(rows)==25 and all(len(row)==6 for row in rows)
assert rows[1][2]=='69,905' and rows[-1][1]=='Nike'
assert rows[0]==['1','Coca-Cola','71,861','70,452','2%','United States']
assert rows[-1]==['25','Nike','14,528','13,706','6%','United States']
assert rows[13][1:] == ['Nokia','25,071','29,495','-15%','Finland']
for row in rows:
    change=round((int(row[2].replace(',',''))/int(row[3].replace(',',''))-1)*100)
    assert change==int(row[4].removesuffix('%')),f'Inconsistent table cells: {row}'
description=('Figure 1-5, Twenty-Five Most Valuable Global Brands. A table with six columns and 25 brand rows. '
 'The columns give 2011 rank, brand, 2011 brand value, 2010 brand value, 2011–2010 percent change, and country of ownership. '
 'Coca-Cola ranks first, followed by IBM and Microsoft; Nike ranks twenty-fifth. '
 'Positive and negative percentage changes compare the two displayed years. Units are not specified in the visible table header.')
save(folder/'table-checked.json',{'state':'source_checked','sourceImage':str(folder/'right.png'),
 'physicalPage':13,'printedPage':21,'figure':'1-5','headers':headers,'rows':rows,'columnCount':6,'dataRowCount':25,
 'description':description,'review':'Codex visual comparison against source image; not model self-approval',
 'correctedPreviousErrors':['Seven-column hallucination replaced by six verified headers','Unsupported monospaced-font claim removed',
 'IBM 2011 value restored to 69,905','Missing rank OCR cells transcribed from visible source','Column-major OCR aligned into complete rows'],
 'paidProviderRequests':0,'localModelTokens':0})
table='| '+' | '.join(headers)+' |\n| '+' | '.join(['---']*6)+' |\n'
table+='\n'.join('| '+' | '.join(row)+' |' for row in rows)
(folder/'table-checked.md').write_text(description+'\n\n'+table+'\n')
save(folder/'pilot-review.json',{'readingOrder':'verified_on_pilot','order':['left header','left callout column 1','left callout column 2','left body','right table row-major','right body'],
 'corrections':[{'line':i,'original':left['lines'][i]['text'],'corrected':t} for i,t in corrections.items()],
 'table':'source_checked_six_columns_25_rows','wholeBookComplete':False,
 'notes':'This review does not approve all other book pages or the entire book for publication.'})
print(json.dumps({'pilotReadingOrder':'verified','tableColumns':6,'tableRows':25,'sourceCorrections':len(corrections),'wholeBookComplete':False}))

book=folder.parents[1]
order_checks=[]
for page,side,prefixes in [(30,'left',['Behavioral','Nature of Good','Given this market']),
                           (30,'right',['Criteria.','Nature of Competition']),
                           (60,'left',['1. Elizabeth','14. M. Joseph','15. Timothy','22. For an insightful']),
                           (60,'right',['23. Elaine','37. Gil','38. Rene','48. Robert'])]:
    page_folder=book/'part-01'/f'page-{page:04d}'
    ocr=json.loads((page_folder/f'{side}-ocr.json').read_text())
    positions=[next(i for i,line in enumerate(ocr['lines']) if line['text'].startswith(prefix)) for prefix in prefixes]
    assert positions==sorted(positions)
    order_checks.append({'physicalPage':page,'side':side,'sourceCheckedAnchorOrder':prefixes,'observedLineIndices':positions})
    if page==60 and side=='left':
        ordered=[line['text'] for line in ocr['lines']]
        # A sliver of the facing page was captured by the overlap. It belongs
        # only to right-page note 23; raw OCR remains preserved separately.
        neighbor=[i for i,line in enumerate(ocr['lines']) if line['text'].startswith('23.') and line['box'][0]>.9]
        assert len(neighbor)==1
        ordered=[line for i,line in enumerate(ordered) if i not in neighbor]
        ordered.insert(2,'Notes')
        (page_folder/'left-order-checked.txt').write_text('\n'.join(ordered))
        save(page_folder/'reading-order-review.json',{'state':'reading_order_checked_transcription_still_needs_review',
           'removedNeighborFragmentLines':neighbor,'neighborContentRetainedOn':'right-page note 23','headingRestoredFromSource':'Notes',
           'wholeBookComplete':False})
save(book/'pilot-reading-order.json',{'checks':order_checks,'physicalPage13Review':str(folder/'pilot-review.json'),
    'wholeBookComplete':False,'remainingLimits':'Order checks do not certify every OCR word or any unsupplied pages.'})
funnel=book/'part-01/page-0030'
description=('Figure 2-5: Hypothetical Examples of Funnel Stages and Transitions. Six stages run left to right: '
 'Aware 95; Ever Tried 68; Recent Trial 31; Occasional Use 18; Regular Use 9; Most Often Use 5. '
 'Arrows between consecutive stages show 72%, 46%, 58%, 50%, and 56%. '
 'These are hypothetical displayed stage figures and transitions, not a measured result for a named brand.')
(funnel/'figure-2-5-checked.txt').write_text(description)
save(funnel/'figure-2-5-review.json',{'state':'source_checked','physicalPage':30,'printedPage':53,'figure':'2-5',
 'description':description,'review':'Read against retained original source image; no local model call','wholeBookComplete':False})
