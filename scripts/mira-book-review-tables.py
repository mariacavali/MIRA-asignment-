#!/usr/bin/env python3
"""Record table transcriptions visually checked against retained scans.

Corrections live only in the separate review workspace. Empty answers/dashes
remain empty/dashes; no facts are filled from world knowledge.
"""
import json
from pathlib import Path
from mira_book_util import save
from importlib.util import spec_from_file_location,module_from_spec

ROOT=Path('/Volumes/2tb/MIRA-local/books/brand-management'); REVIEW=ROOT/'review-2026-10-30'
tables=json.loads((ROOT/'table-review.json').read_text())['tables']
checked={}
def put(n,title,headers,rows,notes=None,**extra):
    checked[n]={'title':title,'headers':headers,'rows':rows,'notes':notes or [],**extra}

put(1,'Five product levels illustrated by an air conditioner',['Level','Air Conditioner'],[
 ['1. Core Benefit','Cooling and comfort.'],
 ['2. Generic Product','Sufficient cooling capacity (Btu per hour), an acceptable energy efficiency rating, adequate air intakes and exhausts, and so on.'],
 ['3. Expected Product','Consumer Reports states that for a typical large air conditioner, consumers should expect at least two cooling speeds, expandable plastic side panels, adjustable louvers, removable air filter, vent for exhausting air, environmentally friendly R-410A refrigerant, power cord at least 60 inches long, one year parts-and-labor warranty on the entire unit, and a five-year parts-and-labor warranty on the refrigeration system.'],
 ['4. Augmented Product','Optional features might include electric touch-pad controls, a display to show indoor and outdoor temperatures and the thermostat setting, an automatic mode to adjust fan speed based on the thermostat setting and room temperature, a toll-free 800 number for customer service, and so on.'],
 ['5. Potential Product','Silently running, completely balanced throughout the room, and completely energy self-sufficient.']],
 ['Historical source example, not a current product specification.'])
put(2,'Brand value and market capitalization',['Brand','Brand Value ($MM)','Market Cap ($MM)','% of Market Cap'],[
 ['Coca-Cola','70,452','146,730','48%'],['IBM','64,727','200,290','32%'],['Microsoft','60,895','226,530','27%'],
 ['Google','43,557','199,690','22%'],['General Electric','42,808','228,250','19%'],["McDonald's",'33,578','80,450','42%'],
 ['Intel','32,015','119,130','27%'],['Nokia','29,495','33,640','88%'],['Disney','28,731','81,590','35%'],['Hewlett-Packard','26,867','105,120','26%']],
 ['Restored dollar signs in $MM and corrected Hewlett-Packard; values are historical displayed values.'])
pilot=json.loads((ROOT/'part-01/page-0013/table-checked.json').read_text())
put(3,'Figure 1-5: Twenty-Five Most Valuable Global Brands',pilot['headers'],pilot['rows'],['Pilot rows re-used from the earlier source-checked transcription.'])
put(4,'Category leaders in 1923 and 1997',['Category','1923 Leaders','1997 Leaders'],[
 ['Cleansers','Old Dutch','Comet; Soft Scrub; Ajax'],['Chewing gum','Wrigley; Adams',"Wrigley's; Bubble Yum; Bubblicious"],
 ['Motorcycles','Indian; Harley-Davidson','Harley-Davidson; Honda; Kawasaki'],['Five cent mint candies','Life Savers','Breath-Savers; Tic Tac; Certs'],
 ['Peanut butter','Beech-Nut; Heinz','Jif; Skippy; Peter Pan'],['Razors','Gillette; Gem; Ever ready','Gillette; Bic; Schick'],
 ['Soft drinks','Coca-Cola; Cliquot Club; Bevo','Coca-Cola; Pepsi; Dr. Pepper/Cadbury'],
 ['Coffee',"Arbuckle's Yuban; White House; Hotel Astor","Folger's; Maxwell House; Hills Bros."],
 ['Laundry soap','Fels Naptha; Octagon; Kirkman','Tide; Cheer; Wisk'],['Cigarettes','Camel; Fatima; Pall Mall','Marlboro; Winston; Newport'],
 ['Shoes','Douglas; Walkover','Nike; Reebok'],['Candy',"Huyler's; Loft; Page & Shaw",'Hershey; M&M/Mars; Nestlé'],
 ['Jelly or jam','Heinz',"Smucker's; Welch's; Kraft"]],['Corrected OCR Marlboro/Tic Tac. Names/spellings are transcribed as displayed, not modernised.'])
put(5,'Figure 1-8: Landor Breakaway Brands (2011)',['Brand','Growth in Brand Strength 2007–2010'],[
 ['Facebook','195%'],['Skype','79%'],['YouTube','78%'],['Netflix','72%'],['Samsung','66%'],['Apple','51%'],['iTunes','50%'],['Amazon.com','44%'],["Reese's",'42%'],['National Guard','35%']],
 ['The caption identifies change in raw brand-strength score over 2007–2010, expressed as percentages; not sales growth.'])
put(6,'Figure 1-10: Example of Multiple Consumer Information Sources',['Information source','Percentage'],[
 ['Friends/peers','81%'],['Fashion magazines','68%'],['Ads','58%'],['Company Web sites','44%'],['Consumer Reviews','36%'],['Celebrities','33%'],['Parents/adults','25%'],['Bloggers','14%']],
 ['Editorial column labels: the crop has no header row. Caption: teen girls ages 13–18 identifying a source they typically use to learn about latest trends. Multiple responses are allowed; do not force a 100% total.'])
put(7,'Brand mantra components',['Brand','Emotional Modifier','Descriptive Modifier','Brand Function'],[
 ['Nike','Authentic','Athletic','Performance'],['Disney','Fun','Family','Entertainment']],['Brand is an editorial label for the originally blank first header cell. Removed OCR trailing character from Performance.'])
put(8,'Seven brand-naming pitfalls',['Number','Pitfall','Explanation'],[
 ['1','Using cliched words such as "Innovation" or "Solution" in a name.','In most industry situations these kinds of words are so overused, they no longer have meaning.'],
 ['2','Insisting on a name that can be found in an English dictionary.','Not only are such names scarce, they also may cause translation or other linguistic problems.'],
 ['3','Taking the easy way out and settling on initials.','Initials may be easier to trademark, but an enormous budget is typically required to give them meaning.'],
 ['4','Using terms like "Extra," "Plus," or "New" to communicate next generation products or improved line extensions.','Three more examples of words that have lost their meaning through overuse.'],
 ['5','Adopting license-plate shorthand.','A name that customers have to work too hard to figure out is a turnoff—and a wasted opportunity.'],
 ['6','Seeing how many names can be combined to make a confusing brand','Most that initially started in this direction have truncated to simpler shorter alternatives.'],
 ['7','Asking for suggestions from friends and other uninformed sources.',"The results that come from this approach seldom relate to or express a company's business startegy."]],
 ['Editorial column labels. The source prints "startegy" in the final cell; retained rather than silently correcting author text.'])
slogans=['Reach Out and Touch Someone','Have It Your Way','Just Do It','When It Absolutely, Positively Has to Be There Overnight','Drivers Wanted',"Don't Leave Home Without It",'Like a Rock',"Because I’m Worth It",'The Ultimate Driving Machine','When You Care Enough to Send the Very Best','Capitalist Tool','The Wonder Drug That Works Wonders','No More Tears','Melts in Your Mouth, Not in Your Hands','We Try Harder','The Antidote for Civilization','Where Do You Want to Go Today?','Let Your Fingers Do the Walking','Breakfast of Champions','Fly the Friendly Skies']
put(9,'Slogan recognition exercise',['Number','Brand answer (blank in source)','Slogan'],[[str(i+1),'',s] for i,s in enumerate(slogans)],
 ['All twenty answer lines are intentionally blank; no brand answers inferred or filled in. Editorial column labels.'])
put(10,'Criteria compared across brand elements',['Criterion','Brand Names and URLs','Logos and Symbols','Characters','Slogans and Jingles','Packaging and Signage'],[
 ['Memorability','Can be chosen to enhance brand recall and recognition','Generally more useful for brand recognition','Generally more useful for brand recognition','Can be chosen to enhance brand recall and recognition','Generally more useful for brand recognition'],
 ['Meaningfulness','Can reinforce almost any type of association, although sometimes only indirectly','Can reinforce almost any type of association, although sometimes only indirectly','Generally more useful for non-product-related imagery and brand personality','Can convey almost any type of association explicitly','Can convey almost any type of association explicitly'],
 ['Likability','Can evoke much verbal imagery','Can provoke visual appeal','Can generate human qualities','Can evoke much verbal imagery','Can combine visual and verbal appeal'],
 ['Transferability','Can be somewhat limited','Excellent','Can be somewhat limited','Can be somewhat limited','Good'],
 ['Adaptability','Difficult','Can typically be redesigned','Can sometimes be redesigned','Can be modified','Can typically be redesigned'],
 ['Protectability','Generally good, but with limits','Excellent','Excellent','Excellent','Can be closely copied']],
 ['Restored the 6×6 row/column alignment; corrected character-level OCR errors. "Brand Element" is the spanning source header above the five element columns.'])
put(11,'Brand-experience statements',['Dimension','Source statements'],[
 ['SENSORY','This brand makes a strong impression on my visual sense or other senses.\nI find this brand interesting in a sensory way.\nThis brand does not appeal to my senses.'],
 ['AFFECTIVE','This brand induces feelings and sentiments.\nI do not have strong emotions for this brand.\nThis brand is an emotional brand.'],
 ['BEHAVIORAL','I engage in physical actions and behaviors when I use this brand.\nThis brand results in bodily experiences.\nThis brand is not action oriented.'],
 ['INTELLECTUAL','I engage in a lot of thinking when I encounter this brand.\nThis brand does not make me think.\nThis brand stimulates my curiosity and problem solving.']],
 ['Editorial column labels. All negatively worded items are preserved; OCR lowercase l restored to I.'])
put(12,'Classic Designs, Timeless Status',['Points-of-Parity','Points-of-Difference'],[[
 'Swiss watchmaker; Durable; Fine materials; Quality craftsmanship; Accurate; Attractive',
 'Innovative products; Unique appearance (Big face; wide wrist band); Iconic crown logo; Exclusive, prestigious imagery; Rich history and heritage; Enduring premium value']],
 ['These are two independent bullet lists, not six paired row relationships. Corrected waschmaker/Exdusive OCR errors.'],layout='independent_lists')
put(13,'Coffee shopping-list impressions',['Impression','List 1 (Maxwell House)','List 2 (Nescafé)'],[
 ['Lazy','4%','48%'],['Fails to plan household purchases and schedules well','12%','48%'],['Thrifty','16%','4%'],['Not a good wife','0%','16%']],
 ['First header is editorial. Historical study response wording is retained as source data, not endorsed as a factual judgment.'])
put(14,'Figure 10-1: Reactions to Proposed Planters Extensions',['Average Scale Ratingᵃ','Proposed Extensions'],[
 ['10','Peanuts'],['9','Snack mixes, nuts for baking'],['8','—'],['7','Pretzels, chocolate nut candy, caramel corn'],
 ['6','Snack crackers, potato chips, nutritional granola bars'],['5','Tortilla chips, toppings (ice cream/dessert)'],
 ['4','Lunchables/lunch snack packs, dessert mixes (cookie/cake/brownie)'],['3','Ice cream/ice cream bars, toppings (salad/vegetable)'],
 ['2','Cereal, toaster pastries, Asian entrees/sauces, stuffing mix, refrigerated dough, jams/jellies'],['1','Yogurt']],
 ['Restored all lost scale numbers. The 8 row contains an explicit dash, not an unreadable/inferred extension.',
  'Footnote a: consumers rated hypothetical proposed extensions on an 11-point scale anchored by 0 (definitely would not expect Planter’s to sell it) and 10 (definitely would expect Planter’s to sell it). Footnote checked on full printed page 338.'])
put(15,'Marriott brand categories',['Brand Category','Brands'],[
 ['Iconic Luxury','Bvlgari; The Ritz-Carlton; The Ritz-Carlton Destination Club'],['Luxury','JW Marriott'],
 ['Lifestyle | Collections','Edition; Autograph Collection; Renaissance Hotels; AC Hotels'],['Signature','Marriott Hotels and Resorts'],
 ['Modern Essentials','Courtyard; SpringHill Suites; Fairfield Inn and Suites'],
 ['Extended Stay','Residence Inn; TownePlace Suites; ExecuStay; Marriott Executive Apartments'],['Vacation Clubs','Marriott Vacation Club; Grand Residences']],
 ['Historical source categories; not updated to a current hotel portfolio. Corrected Iconic/Ritz-Carlton and removed an OCR trailing pipe.'])
put(16,"Fortune’s top ten most admired companies, labelled 2010 in the book",['Rank','Company'],[[str(i+1),name] for i,name in enumerate(['Apple','Google','Berkshire Hathaway','Southwest Airlines','Procter & Gamble','Coca-Cola','Amazon.com','FedEx','Microsoft',"McDonald’s"])],
 ['The source uses two side-by-side rank/company blocks for one continuous 1–10 ranking. Body labels it 2010; the source citation is dated 22 March 2011. Preserve this distinction.'])
put(17,'RQ 2010 corporate-reputation ranking',['Rank','Company'],[[str(i+1),name] for i,name in enumerate(['Google','Johnson & Johnson','3M','Berkshire Hathaway','Apple','Intel','Kraft Foods','Amazon.com','General Mills','Walt Disney Co.'])],
 ['Harris Interactive/Reputation Institute study identified in the source body; a different survey from the adjacent Fortune list. Restored lost ranks/3M and corrected General Mills.'])
put(18,'Brand extensions and new brand meanings',['Brand','Original Product','Extension Products','New Brand Meaning'],[
 ['Weight Watchers','Fitness centers','Low-calorie foods','Weight loss and maintenance'],['Sunkist','Oranges','Vitamins, juices','Good health'],
 ["Kellogg’s",'Cereal','Nutri-Grain bars, Special K bars','Healthy snacking'],['Aunt Jemima','Pancake mixes','Syrups, frozen waffles','Breakfast foods']],
 ['Historical brand names and product groupings are preserved. Corrected column alignment; no current-brand substitutions.'])
headers=['Brand Strength Rank','USA 2011','UK 2011','Germany 2009','France 2009','Brazil 2011','China 2011']
columns=[['United States','Pixar','Disney','Google','Discovery Channel','U.S. Marines','Microsoft','National Geographic','DreamWorks (SKG)','Facebook'],
 ['Google','United Kingdom','Microsoft','Dyson','eBay','Apple','Nintendo Wii','Facebook','IKEA','Channel 4'],
 ['Germany','Google','IKEA','Die Olympischen Spiele','adidas','eBay','Windows','LEGO','BMW','Aldi'],
 ['France','IKEA','Arte','Canal +','Google','Coca-Cola','M6','Häagen-Dazs','Nutella','Nintendo Wii'],
 ['Rede Globo','Copa do Mundo','Fantástico','SBT','Globo Repórter','Jornal Nacional','Rede Record','Nestlé','Coca-Cola','Brastemp'],
 ['Chun Jie Wan Hui','Q-Zone','KFC','Colgate','QQ','Baidu','China Mobile','Xin Wen Lian Bo','Apple (Computer)','Nokia']]
put(19,'Figure 14-3: Global Brand Rankings (includes products, people, and countries)',headers,[[str(i+1),*(col[i] for col in columns)] for i in range(10)],
 ['Restored rank numbers and USA 2011; preserved different country years, diacritics, transliterations and product/country entries. Corrected Nintendo Wii/Aldi. Source: BrandAsset Consulting.'])

output=[]
for n,raw in enumerate(tables,1):
    item={**checked[n],'id':f't{n:02d}','part':raw['part'],'physicalPage':raw['physicalPage'],'side':raw['side'],
          'sourceImage':raw['image'],'state':'source_checked','unreadableCells':[],'reviewer':'Codex visual comparison with table and full-page scans',
          'checkedAt':'2026-10-30','rawOcrPreserved':raw['ocr'],'completeBook':False}
    assert all(len(row)==len(item['headers']) for row in item['rows'])
    folder=REVIEW/'tables'/item['id'];folder.mkdir(parents=True,exist_ok=True)
    save(folder/'checked.json',item)
    text=item['title']+'\n\n'
    text+=' | '.join(item['headers'])+'\n'
    text+='\n'.join(' | '.join(cell.replace('\n','; ') for cell in row) for row in item['rows'])+'\n\n'
    text+='\n'.join('Source note: '+note for note in item['notes'])
    (folder/'checked.txt').write_text(text);item['checkedText']=str(folder/'checked.txt');output.append(item)
save(REVIEW/'table-review.json',{'tables':output,'state':'all_19_source_checked','rawFilesPreserved':True,'paidProviderRequests':0})
print(json.dumps({'tablesSourceChecked':len(output),'previouslyFlaggedTablesResolved':18,'unreadableCells':0,'bookComplete':False}))
