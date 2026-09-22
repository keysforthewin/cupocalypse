"""Reproducible, original offline sound design; standard library only.
Writes mastered mono WAV assets. No generation service or runtime synthesis needed.
"""
import math, random, struct, wave, json
from pathlib import Path
RATE = 32000
OUT = Path('public/assets/audio')
OUT.mkdir(parents=True, exist_ok=True)
weapons = ['rail','storm','saw','cinder','cryo','gravity','cluster','crescent','needle','sonic']
boosts = ['warhead','feed','titan','phase','fork','ember','deadeye','breach','blast','echo']
profiles = [(.28,1200),(.42,790),(.55,170),(.5,110),(.4,1700),(.75,78),(.62,180),(.52,580),(.3,2200),(.8,125)]
manifest = []
def render(name, index, impact=False, pickup=False):
    duration, freq = profiles[index]
    if pickup: duration = .44 + index % 3 * .06
    if impact: duration *= .8; freq *= .7
    rng = random.Random(8000 + index * 37 + 100 * impact + 200 * pickup)
    samples=[]; phase=0.; noise_low=0.
    for n in range(int(RATE * duration)):
        t=n/RATE; u=t/duration
        noise=rng.uniform(-1,1)
        noise_low += (noise-noise_low) * (.06 if index in [3,5,9] else .5)
        pitch=freq * (1-u*.75)
        if pickup:
            notes=[1,1.25,1.5,2]
            pitch=(230+index*37)*notes[min(3,int(u*4))]
        elif index==2: pitch=freq*(1+.5*math.sin(u*math.pi))
        elif index==7: pitch=freq*(.4+math.sin(u*math.pi))
        phase += math.tau*pitch/RATE
        tone=math.sin(phase)
        harmonic=math.sin(phase*(2.7 if index in [4,7] else 2))*.28
        envelope=min(1,t/.004)*math.exp(-u*(5 if index in [0,8] else 3.5))*(1-u)**.4
        if index==6 and not pickup:
            envelope=sum(math.exp(-(t-k*.08)*32) if t>=k*.08 else 0 for k in range(5))*.55*(1-u)
        if index==8 and not pickup:
            envelope=math.exp(-(t%.055)*90)*(1-u)**2
        if index==1 and not pickup:
            envelope *= .45 + .55 * (math.sin(t*130)**8)
        sound=(tone+harmonic)*(.7 if pickup else .32)+noise_low*(.04 if pickup else .65)
        if index in [3,5,9] and not pickup:
            sound += math.sin(math.tau*(45+index*2)*t)*.5
        samples.append(sound*envelope)
    peak=max(abs(x) for x in samples) or 1
    pcm=b''.join(struct.pack('<h',round(max(-1,min(1,x/peak*.82))*32767)) for x in samples)
    with wave.open(str(OUT / f'{name}.wav'),'wb') as f:
        f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE); f.writeframes(pcm)
    manifest.append({'name':name,'duration':round(duration,3),'peak':.82,'rms':round(math.sqrt(sum((x/peak*.82)**2 for x in samples)/len(samples)),4)})
for i,k in enumerate(weapons):
    render(k,i); render('impact-'+k,i,impact=True)
for i,k in enumerate(boosts): render('pickup-'+k,i,pickup=True)
Path('assets/arsenal-audio.json').write_text(json.dumps({'source':'Original deterministic additive/noise synthesis','generator':'scripts/generate-arsenal-audio.py','sampleRate':RATE,'assets':manifest},indent=2)+'\n')
print(f'Wrote {len(manifest)} original sounds to {OUT}')
