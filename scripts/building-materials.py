"""Recompose existing biome texture samples into upright architectural tiles.
No provider calls. Crop provenance is retained; small-scale wear comes from the
original generated textures, with clean architectural courses laid over them.
"""
from pathlib import Path
import json
import numpy as np
from PIL import Image
root=Path('assets/biomes/quality/textures'); size=512
spec=[
 ('brick','city-tenement',(153,84,57),'brick'),
 ('limestone','city-offices',(174,168,148),'stone'),
 ('siding','suburb-house',(116,145,113),'siding'),
 ('redwood','country-barn',(122,44,37),'vertical'),
 ('slate','suburb-house',(77,82,81),'roof'),
 ('timber','forest-cabin',(76,66,48),'vertical'),
 ('concrete','city-offices',(120,116,104),'plain'),
 ('steel','forest-cabin',(47,50,47),'plain'),
 ('glass','city-tenement',(43,57,59),'glass'),
 ('trim','suburb-house',(202,196,172),'plain'),
 ('greenmetal','city-tenement',(42,76,65),'plain'),
 ('copper','country-barn',(117,81,57),'plain'),
 ('fieldstone','city-offices',(118,117,100),'stone'),
 ('darkbrick','city-tenement',(126,76,56),'brick'),
 ('felt','suburb-house',(62,65,62),'plain'),
 ('soot','forest-cabin',(67,64,56),'plain'),
]
atlas=Image.new('RGB',(size*4,size*4));rough=Image.new('RGB',atlas.size);records=[]
rng=np.random.default_rng(9023)
for index,(name,source,color,pattern) in enumerate(spec):
 image=np.asarray(Image.open(root/(source+'.png')).convert('RGB'),dtype=float)
 target=np.array(color); candidates=[]
 for y in range(0,image.shape[0]-48,24):
  for x in range(0,image.shape[1]-48,24):
   crop=image[y:y+48,x:x+48]; mean=crop.mean(axis=(0,1))
   score=np.linalg.norm(mean-target)+crop.std(axis=(0,1)).mean()*.7
   candidates.append((score,x,y))
 _,x,y=min(candidates);crop=image[y:y+48,x:x+48]
 # Source-derived wear, without copying a warped window or baked silhouette.
 lum=crop.mean(axis=2);lum=(lum-lum.mean())/(lum.std()+1)
 sample=np.asarray(Image.fromarray(np.uint8(np.clip(lum*12+128,0,255))).resize((size,size),Image.Resampling.BICUBIC),dtype=float)-128
 yy,xx=np.indices((size,size));noise=rng.normal(0,1.4,(size,size))
 values=np.broadcast_to(target,(size,size,3)).copy()+sample[:,:,None]*.32+noise[:,:,None]
 if pattern in ['brick','stone','roof']:
  row_h=32 if pattern=='brick' else 64
  row=yy//row_h;col=((xx+(row%2)*(64 if pattern=='brick' else 96))//(128 if pattern=='brick' else 192))
  variation=np.sin(row*33+col*71)*5
  values+=variation[:,:,None]
  joint=(yy%row_h<2)|((xx+(row%2)*(64 if pattern=='brick' else 96))%(128 if pattern=='brick' else 192)<2)
  if pattern=='roof':joint=(yy%row_h<3)|((xx+(row%2)*64)%128<1)
  values[joint]=target*(.7 if pattern=='roof' else .76)
  values[yy%row_h==3]+=9 if pattern=='roof' else 2
 elif pattern in ['siding','vertical']:
  axis=yy if pattern=='siding' else xx
  values[axis%32<2]=target*.68;values[axis%32==2]=target*1.1
  values+=np.sin((xx if pattern=='siding' else yy)*.4)[:,:,None]*1.4
 elif pattern=='glass':
  values[:]=target;values+=(np.sin(xx*.011)+np.cos(yy*.007))[:,:,None]*3
 tile=Image.fromarray(np.uint8(np.clip(values,0,255)))
 atlas.paste(tile,((index%4)*size,(index//4)*size))
 rough.paste((155 if pattern=='glass' else 210,)*3,((index%4)*size,(index//4)*size,(index%4+1)*size,(index//4+1)*size))
 records.append({'material':name,'tile':index,'source':str(root/(source+'.png')),'sample':[x,y,48,48],'color':color,'pattern':pattern})
atlas.save(root/'architecture-atlas.png');rough.save(root/'architecture-roughness.png')
(root/'architecture-provenance.json').write_text(json.dumps(records,indent=2)+'\n')
