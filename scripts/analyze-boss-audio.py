"""Measure shipped cues; never infer successful mastering from prompts."""
import json,subprocess,re
from pathlib import Path
designs=json.loads(Path('assets/bosses/designs.json').read_text())
report=[]
for i,d in enumerate(designs):
    sounds=[]
    for path in sorted(Path('public/assets/audio/bosses').glob(d['id']+'-*.ogg')):
        p=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','loudnorm=I=-16:TP=-1:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True)
        match=re.search(r'\{\s*"input_i".*?\}',p.stderr,re.S)
        if not match:raise RuntimeError('No loudness measurement: '+str(path))
        data=json.loads(match.group());sounds.append({'file':str(path),'integratedLUFS':float(data['input_i']),'truePeakDBTP':float(data['input_tp'])})
    if len(sounds)!=6:raise RuntimeError(d['id']+' needs all six cues')
    report.append({'boss':d['id'],'targetLUFS':-24+i*2,'sounds':sounds})
Path('artifacts/boss-review').mkdir(parents=True,exist_ok=True)
Path('artifacts/boss-review/audio.json').write_text(json.dumps(report,indent=2))
for r in report:
    intro=next(s for s in r['sounds'] if s['file'].endswith('-entrance.ogg'))
    print(r['boss'],intro['integratedLUFS'],'LUFS; max peak',max(s['truePeakDBTP'] for s in r['sounds']))
assert all(max(s['truePeakDBTP'] for s in r['sounds'])<=-1 for r in report)
assert all(next(s['integratedLUFS'] for s in a['sounds'] if s['file'].endswith('-entrance.ogg')) < next(s['integratedLUFS'] for s in b['sounds'] if s['file'].endswith('-entrance.ogg')) for a,b in zip(report,report[1:]))
