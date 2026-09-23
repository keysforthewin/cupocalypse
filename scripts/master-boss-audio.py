"""Two-pass mastering, with codec headroom and fades measured before normalization."""
from pathlib import Path
import json,re,subprocess,sys
designs=json.loads(Path('assets/bosses/designs.json').read_text())
out=Path('public/assets/audio/bosses');out.mkdir(parents=True,exist_ok=True)
for i,d in enumerate(designs):
    if len(sys.argv)>1 and d['id']!=sys.argv[1]:continue
    for source in sorted(Path('assets/bosses/audio').glob(d['id']+'-*.mp3')):
        if len(sys.argv)>2 and not source.stem.endswith('-'+sys.argv[2]):continue
        duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(source)],text=True))
        target=-24+i*2
        fade=f'afade=t=in:d=0.025,afade=t=out:st={max(0,duration-.25)}:d=0.25'
        first=subprocess.run(['ffmpeg','-hide_banner','-i',str(source),'-af',fade+f',loudnorm=I={target}:TP=-2.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
        measured=json.loads(re.search(r'\{\s*"input_i".*?\}',first.stderr,re.S).group())
        loud=f'loudnorm=I={target}:TP=-2.5:LRA=9:linear=true:measured_I={measured["input_i"]}:measured_TP={measured["input_tp"]}:measured_LRA={measured["input_lra"]}:measured_thresh={measured["input_thresh"]}:offset={measured["target_offset"]}'
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(source),'-af',fade+','+loud,'-ar','44100','-c:a','libvorbis','-q:a','5',str(out/(source.stem+'.ogg'))],check=True)
        print(source.stem,'mastered')
