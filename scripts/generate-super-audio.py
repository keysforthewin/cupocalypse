"""27 original, deterministic layered super signatures. No network/provider required."""
import math, random, struct, wave, json
from pathlib import Path
RATE=32000
OUT=Path('public/assets/audio'); OUT.mkdir(parents=True,exist_ok=True)
IDS=['mortal','keys','sybex','tuna','nitro','baezil','pauly','machinegunqueen','meesh','zunneh','rae','doc','kismet','mmiguel','strawberry','nemesis','bronze-leopard','five10','shannondoa','kuttula','gimmy','haut-carl','hondo','panda','pokey','platypus','so1ician']
manifest=[]
for index,name in enumerate(IDS):
 duration=2.4; samples=[0.] * int(RATE*duration); rng=random.Random(19000+index)
 def tone(at,length,freq,end=None,amp=.3,kind='sine',attack=.008):
  phase=0
  for n in range(int(length*RATE)):
   pos=int(at*RATE)+n
   if pos>=len(samples): break
   t=n/RATE;u=t/length;f=freq*((end or freq)/freq)**u;phase+=2*math.pi*f/RATE
   v=math.sin(phase)
   if kind=='metal':v=(v+math.sin(phase*2.71)*.5+math.sin(phase*5.13)*.22)/1.72
   elif kind=='reed':v=(v+math.sin(phase*3)*.35+math.sin(phase*5)*.16)/1.51
   elif kind=='engine':v=math.tanh(2*(v+math.sin(phase*1.01)*.4))*(.7+.3*math.sin(t*90))
   elif kind=='glass':v=(v+math.sin(phase*2.002)*.4+math.sin(phase*4)*.1)/1.5
   env=min(1,t/attack)*(1-u)**1.4
   samples[pos]+=v*env*amp
 def noise(at,length,amp=.3,cut=.12,rhythm=0,reverse=False):
  low=0
  for n in range(int(length*RATE)):
   pos=int(at*RATE)+n
   if pos>=len(samples):break
   t=n/RATE;u=t/length;low+=(rng.uniform(-1,1)-low)*cut
   env=(u**1.6 if reverse else (1-u)**1.7)*min(1,t/.008)
   samples[pos]+=low*amp*env*(.55+.45*math.sin(t*rhythm)**2 if rhythm else 1)
 def notes(seq,at=0,step=.12,length=.3,kind='glass',amp=.25):
  for i,f in enumerate(seq):tone(at+i*step,length,f,amp=amp,kind=kind)
 if name=='mortal':
  noise(0,.55,.45,.05,reverse=True);tone(.5,1.85,67,38,.7,'metal');tone(.51,1.5,253,251,.27,'metal');noise(.5,.35,.5,.35)
 elif name=='keys':
  notes([1800,730,2200,910,2700],step=.095,length=.16,kind='metal');notes([440,554,660,880],at=.55,step=.13,length=.8)
 elif name=='sybex':
  for k in range(9):tone(k*.045,.07,1400-k*100,90,.17,'glass')
  tone(.45,1.2,550,55,.6,'glass');notes([1200,600,1200],at=1.7,step=.08,length=.09)
 elif name=='tuna':
  tone(0,.65,650,480,.4);noise(.3,1.9,.9,.06);noise(.65,.3,.5,.7);tone(.65,1.2,76,35,.65)
 elif name=='nitro':
  tone(0,1.8,45,350,.6,'engine',.25);noise(.1,1.7,.35,.4,120);tone(1.5,.6,320,90,.4,'engine')
 elif name=='baezil':
  for f in [110,138.6,164.8]:tone(0,2.3,f,f*.97,.28,'reed',.25)
  noise(.2,2,.4,.16,75);notes([880,1320,990],at=.8,step=.3,length=.25,kind='metal',amp=.12)
 elif name=='pauly':
  notes([1450,1800,2600,1950],step=.13,length=.25,kind='metal');tone(.6,.6,95,45,.6,'metal');tone(.8,.7,2300,500,.25)
 elif name=='machinegunqueen':
  notes([220,277,330,440],step=.09,length=.5,kind='reed');
  for k in range(19):noise(.45+k*.065,.06,.5,.55);tone(.45+k*.065,.06,120,70,.3,'engine')
 elif name=='meesh':
  noise(0,1.1,.4,.2,reverse=True);tone(.5,1.8,880,1320,.2,'glass',.25);tone(.7,1.6,1108,660,.18,'glass',.3)
 elif name=='zunneh':
  notes([680,1020,1360],step=.23,length=.4,kind='reed');
  for k in range(3):noise(.85+k*.31,.28,.6,.4);tone(.85+k*.31,.3,80,35,.4)
 elif name=='rae':
  for f in [196,294,392,588]:tone(0,2.35,f,f*2,.2,'glass',.4)
  noise(.4,1.9,.28,.3);tone(1.7,.65,60,40,.45)
 elif name=='doc':
  tone(0,.16,56,42,.65);tone(.22,.18,65,45,.45);tone(.6,.18,720,720,.3);notes([440,554,660,880],at=.9,step=.15,length=.7)
 elif name=='kismet':
  for k in range(6):noise(k*.07,.06,.4,.7)
  notes([520,780,650,1040],at=.5,step=.15,length=.16,kind='metal');notes([523,659,784,1046],at=1.1,step=.13,length=.6)
 elif name=='mmiguel':
  notes([330,440,494,659],step=.13,length=.35,kind='reed');notes([392,523,587,784],at=.65,step=.13,length=.45,kind='reed')
 elif name=='strawberry':
  for k in range(9):tone(.1+k*.16,.13,160+k*25,45,.4);noise(.1+k*.16,.1,.25,.12)
  notes([880,1108,1320],at=1.2,step=.2,length=.5,amp=.18)
 elif name=='nemesis':
  notes([110,104,82],step=.35,length=.8,kind='engine',amp=.4)
  for k in range(6):tone(1.2+k*.12,.07,1600,1500,.18,'metal')
 elif name=='bronze-leopard':
  tone(0,.65,65,140,.5,'engine');
  for k in range(6):noise(.5+k*.25,.15,.6,.2);tone(.5+k*.25,.18,180,48,.4,'metal')
 elif name=='five10':
  for k in range(5):
   for delta,f in [(0,85),(.095,130)]:tone(k*.38+delta,.25,f,35,.45,'metal');noise(k*.38+delta,.12,.5,.4)
 elif name=='shannondoa':
  noise(0,2.3,.7,.025);notes([392,440,523,587,523],at=.1,step=.3,length=.65,amp=.2)
 elif name=='kuttula':
  for k in range(6):tone(k*.25,.35,70+k*12,30,.45,'reed');noise(k*.25+.12,.2,.55,.035)
  tone(.9,1.4,42,28,.35)
 elif name=='gimmy':
  for k in range(12):noise(k*.09,.035,.5,.8);tone(k*.09,.06,350+k*40,180,.2,'metal')
  notes([660,880,1320],at=1.2,step=.2,length=.35,kind='metal')
 elif name=='haut-carl':
  for k in range(3):noise(k*.55,.13,.6,.2);tone(k*.55+.1,.3,1600,220,.22);noise(k*.55+.38,.3,.9,.055);tone(k*.55+.38,.35,75,30,.4)
 elif name=='hondo':
  noise(0,.7,.65,.2,reverse=True)
  for k in range(3):tone(.5+k*.35,.5,110,45,.5,'metal');noise(.5+k*.35,.15,.55,.3)
 elif name=='panda':
  noise(0,1,.55,.025,reverse=True);tone(.7,1.2,48,32,.65);noise(1.1,.6,1,.4);tone(1.1,1.1,90,30,.5)
 elif name=='pokey':
  for k in range(15):noise(k*.1,.04,.4,.9);tone(k*.1,.13,2100,480,.16,'metal')
 elif name=='platypus':
  for k in range(5):tone(k*.3,.3,220,650 if k%2 else 90,.4,'reed');noise(k*.3+.1,.17,.3,.04)
  notes([880,440,660],at=1.55,step=.16,length=.2)
 elif name=='so1ician':
  notes([165,220,247],step=.18,length=.6,kind='reed',amp=.3)
  for at in [.6,1.15,1.7]:tone(at,.4,140,45,.55,'metal');noise(at,.09,.7,.6)
 peak=max(abs(v) for v in samples) or 1
 samples=[math.tanh(v/peak*1.3)*.87 for v in samples]
 pcm=b''.join(struct.pack('<h',round(v*32767)) for v in samples)
 with wave.open(str(OUT/f'super-{name}.wav'),'wb') as f:
  f.setnchannels(1);f.setsampwidth(2);f.setframerate(RATE);f.writeframes(pcm)
 manifest.append({'id':name,'duration':duration,'peak':max(abs(v) for v in samples),'rms':math.sqrt(sum(v*v for v in samples)/len(samples))})
Path('assets/super-audio.json').write_text(json.dumps({'source':'Original deterministic multi-layer synthesis','generator':'scripts/generate-super-audio.py','sampleRate':RATE,'assets':manifest},indent=2)+'\n')
print('Generated 27 original super signatures.')
