#!/usr/bin/env python3
"""Free local alternate OCR. Raw files untouched; all output remains proposals."""
import json,time,argparse
from pathlib import Path
from rapidocr import RapidOCR
from rapidocr.utils.typings import OCRVersion,ModelType
import numpy as np
import cv2
from PIL import Image
ROOT=Path('/Volumes/2tb/MIRA-local/books/brand-management/review-2026-10-30')
PROJECT=Path(__file__).resolve().parents[1]
def main():
    p=argparse.ArgumentParser();p.add_argument('command',choices=['pilot','linepilot','highres']);a=p.parse_args()
    out=PROJECT/'.mira-local-data/local-book-tools/rapid-review-pilot';out.mkdir(parents=True,exist_ok=True)
    engine=RapidOCR(params={'Global.model_root_dir':str(PROJECT/'.mira-local-data/local-book-tools/rapid-models'),
      'Rec.lang_type':'en','EngineConfig.onnxruntime.intra_op_num_threads':4,'EngineConfig.onnxruntime.inter_op_num_threads':4})
    if a.command=='highres':
        engine=RapidOCR(params={'Global.model_root_dir':str(PROJECT/'.mira-local-data/local-book-tools/rapid-models'),
          'Rec.lang_type':'en','Rec.ocr_version':OCRVersion.PPOCRV4,'Rec.model_type':ModelType.MOBILE,'Det.limit_side_len':1800,
          'Det.box_thresh':.3,'Det.thresh':.2,'Global.max_side_len':4000,
          'EngineConfig.onnxruntime.intra_op_num_threads':4,'EngineConfig.onnxruntime.inter_op_num_threads':4})
        key='p01-0006-left';im=Image.open(ROOT/'text'/key/'page-region.png').convert('RGB');im=im.resize((im.width*2,im.height*2))
        before=time.monotonic();result=engine(im);data={'id':key,'seconds':round(time.monotonic()-before,3),'state':'alternate_ocr_proposal_not_verified',
          'lines':[{'box':box.tolist(),'text':text,'confidence':float(score)} for box,text,score in zip(result.boxes,result.txts,result.scores)]}
        (out/'highres-p01-0006-left.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps(data,ensure_ascii=False),flush=True);return
    if a.command=='linepilot':
        key='p01-0006-left';folder=ROOT/'text'/key;data=json.loads((folder/'ocr.json').read_text());im=np.array(Image.open(folder/'page-region.png').convert('RGB'));h,w=im.shape[:2]
        for n,line in enumerate(data['lines']):
            words=line.get('words',[])
            if len(words)<7 or line['box'][0]>.9:continue
            points=np.array([[(b['box'][0]+b['box'][2])*w/2,(b['box'][1]+b['box'][3])*h/2,(b['box'][3]-b['box'][1])*h] for b in words])
            l=max(0,int(points[0,0]-(words[0]['box'][2]-words[0]['box'][0])*w/2)-3);r=min(w,int(words[-1]['box'][2]*w)+3)
            if r-l<150:continue
            poly=np.polyfit(points[:,0],points[:,1],min(2,len(points)-1));height=int(np.median(points[:,2])*1.5)+6
            xx=np.tile(np.arange(l,r,dtype=np.float32),(height,1));yy=np.tile(np.polyval(poly,np.arange(l,r,dtype=np.float32)),(height,1))+np.arange(height,dtype=np.float32)[:,None]-height/2
            strip=cv2.remap(im,xx.astype(np.float32),yy.astype(np.float32),cv2.INTER_CUBIC,borderMode=cv2.BORDER_CONSTANT,borderValue=(255,255,255));strip=cv2.resize(strip,None,fx=3,fy=3,interpolation=cv2.INTER_CUBIC)
            Image.fromarray(strip).save(out/f'{key}-line-{n}.png');result=engine(strip,use_det=False,use_cls=False)
            print(json.dumps({'line':n,'original':line['text'],'new':result.txts,'confidence':result.scores},default=lambda x:x.tolist(),ensure_ascii=False),flush=True)
            if n>40:break
        return
    for key in ['p01-0006-left','p01-0060-left','p01-0061-left']:
        target=out/(key+'.json')
        if target.exists():data=json.loads(target.read_text())
        else:
            before=time.monotonic();result=engine(ROOT/'text'/key/'page-region.png')
            data={'id':key,'seconds':round(time.monotonic()-before,3),'state':'alternate_ocr_proposal_not_verified',
              'lines':[{'box':box.tolist(),'text':text,'confidence':float(score)} for box,text,score in zip(result.boxes,result.txts,result.scores)]}
            target.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
        print(json.dumps({'id':key,'seconds':data['seconds'],'lines':len(data['lines']),'sample':[l['text'] for l in data['lines'][:18]]},ensure_ascii=False),flush=True)
if __name__=='__main__':main()
