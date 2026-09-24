"""Decode/measure locally. Measurements are not perceptual quality ratings."""
import array, hashlib, json, math, re, subprocess, sys, wave
from pathlib import Path

def decode(path):
    cmd=['ffmpeg','-v','error','-i',str(path),'-ac','1','-ar','44100','-f','f32le','-']
    data=array.array('f');data.frombytes(subprocess.check_output(cmd));return data

def measure(path, loop=False, immediate=False):
    samples=decode(path)
    finite=bool(samples) and all(math.isfinite(v) for v in samples)
    peak=max(map(abs,samples),default=0)
    rms=math.sqrt(sum(v*v for v in samples)/max(1,len(samples)))
    threshold=max(.0003,peak*.015)
    active=[i for i,v in enumerate(samples) if abs(v)>threshold]
    first=active[0]/44100 if active else len(samples)/44100
    trailing=(len(samples)-1-active[-1])/44100 if active else len(samples)/44100
    proc=subprocess.run(['ffmpeg','-hide_banner','-i',str(path),'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True)
    peaks=re.findall(r'Peak:\s+([\-\d.]+) dBFS',proc.stderr)
    tp=float(peaks[-1]) if peaks else None
    db=lambda v:round(20*math.log10(max(v,1e-12)),2)
    edge=max(abs(samples[0]),abs(samples[-1])) if samples else 1
    seam=abs(samples[0]-samples[-1]) if samples else 1
    failures=[]
    if not finite or peak<.0001:failures.append('empty, nonfinite, or silent')
    if tp is None or tp> -1:failures.append('true peak exceeds -1 dBTP or is unavailable')
    if immediate and first>.025:failures.append('percussive onset later than 25 ms')
    if not loop and edge>.003:failures.append('unfaded boundary')
    if loop and seam>.003:failures.append('loop boundary discontinuity')
    return {'sha256':hashlib.sha256(Path(path).read_bytes()).hexdigest(),'duration':round(len(samples)/44100,4),'finite':finite,'peakDBFS':db(peak),'truePeakDBTP':tp,'rmsDBFS':db(rms),'crestDB':round(db(peak)-db(rms),2),'onsetSeconds':round(first,4),'trailingSilenceSeconds':round(trailing,4),'edgeAmplitude':round(edge,6),'loopSeamDelta':round(seam,6),'failures':failures,'passed':not failures}

def master(source, target, cue):
    # Provider PCM may arrive as raw s16le or as a WAV container.
    signature=Path(source).read_bytes()[:4]
    input_args=[] if signature in [b'RIFF',b'ID3\x04',b'OggS'] or signature[:3]==b'ID3' or signature[:1]==b'\xff' else ['-f','s16le','-ar','44100','-ac','1']
    base=['ffmpeg','-y','-v','error',*input_args,'-i',str(source)]
    temp=Path(target).with_suffix('.work.wav')
    filters=['highpass=f=30']
    if not cue.get('loop') and cue['family'] not in ['supers','ambience']:
        filters+=['silenceremove=start_periods=1:start_duration=0.002:start_threshold=-48dB']
    subprocess.run(base+['-af',','.join(filters),'-ar','44100','-c:a','pcm_s24le',str(temp)],check=True)
    data=decode(temp);duration=len(data)/44100
    peak=max(map(abs,data),default=1)
    rms=math.sqrt(sum(v*v for v in data)/max(1,len(data)))
    # Match active-body energy with peak headroom; no broadband dulling or flattening.
    active=[v for v in data if abs(v)>peak*.01]
    active_rms=math.sqrt(sum(v*v for v in active)/max(1,len(active)))
    target_db=-28 if cue.get('loop') else -23 if cue['family']=='ui' else -20
    gain=min(10**(target_db/20)/max(active_rms,1e-9),10**(-3/20)/max(peak,1e-9))
    if cue.get('loop'):
        # Rotate by half a second; overlap the original tail onto the original
        # head. The resulting boundary joins adjacent source samples, without a dip.
        stereo=array.array('f');stereo.frombytes(subprocess.check_output(['ffmpeg','-v','error','-i',str(temp),'-ac','2','-ar','44100','-f','f32le','-']))
        frames=len(stereo)//2;blend=min(22050,frames//8)
        output=stereo[blend*2:]
        for i in range(blend):
            t=i/max(1,blend-1)
            for c in range(2):
                at=(frames-2*blend+i)*2+c
                output[at]=stereo[(frames-blend+i)*2+c]*math.cos(t*math.pi/2)+stereo[i*2+c]*math.sin(t*math.pi/2)
        gain=min(gain,10**(-3/20)/max(max(map(abs,output)),1e-9))
        pcm=array.array('h',(round(max(-1,min(1,v*gain))*32767) for v in output))
        with wave.open(str(target),'wb') as stream:
            stream.setnchannels(2);stream.setsampwidth(2);stream.setframerate(44100);stream.writeframes(pcm.tobytes())
        temp.unlink();return
    else:
        args=['-af',f'volume={gain},afade=t=in:d=0.0015,afade=t=out:st={max(0,duration-.04)}:d=0.04']
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(temp),*args,'-ar','44100','-c:a','pcm_s16le',str(target)],check=True)
    temp.unlink()

if __name__=='__main__':
    root=Path('assets/audio-quality');out=Path('artifacts/audio-quality');out.mkdir(parents=True,exist_ok=True)
    if sys.argv[1:2]==['pilot']:
        cues={c['id']:c for c in json.loads(Path('scripts/audio-quality/pilot.json').read_text())}
        ledger=json.loads((root/'ledger.json').read_text());records=[]
        (out/'candidates').mkdir(exist_ok=True)
        for ident,job in ledger['jobs'].items():
            if job['state']!='complete' or 'original' not in job:continue
            cue=cues.get(job['cue'])
            if not cue:continue
            target=out/'candidates'/f'{ident}.wav';master(job['original'],target,cue)
            metrics=measure(target,cue.get('loop',False),cue['id'] in ['pulse','seeker','impact','boss-grave-marshal-attack'])
            records.append({'id':ident,'cue':cue['id'],'family':cue['family'],'file':str(target),'metrics':metrics})
            print(ident,'PASS' if metrics['passed'] else metrics['failures'])
        (out/'measurements.json').write_text(json.dumps(records,indent=2)+'\n')
    else:
        records=[{'file':str(p),'metrics':measure(p)} for p in sorted(Path(sys.argv[1] if len(sys.argv)>1 else 'public/assets/audio').rglob('*')) if p.suffix in ['.wav','.ogg','.mp3']]
        (out/'baseline-measurements.json').write_text(json.dumps(records,indent=2)+'\n')
        print(f'Measured {len(records)} assets; {sum(not r["metrics"]["passed"] for r in records)} technical failures. Listening score unreviewed.')
