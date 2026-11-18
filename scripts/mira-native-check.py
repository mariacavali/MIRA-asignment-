import json, subprocess
from pathlib import Path
root = Path('/Volumes/2tb/MIRA-local/pilot/b00b09852cf7bdd8f248cd00cb20e86f2de97759f081c8ca0c6177e8b27834b5')
out = Path('.mira-local-data/local-book-tools/native-pilot'); out.mkdir(exist_ok=True)
worker = subprocess.Popen(['.mira-local-data/local-book-tools/mira-vision-ocr'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
for side in ['left','right']:
    worker.stdin.write(json.dumps({'path':str(root/f'spread-check-0013/{side}/source-region.png')})+'\n'); worker.stdin.flush()
    data = json.loads(worker.stdout.readline())
    (out/f'{side}.json').write_text(json.dumps(data,indent=2))
    print(side, data.get('seconds'), '\n'.join(f"{i}: {x['text']}" for i,x in enumerate(data.get('lines',[]))), flush=True)
worker.stdin.close(); worker.wait()
