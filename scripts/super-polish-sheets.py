"""Compose unaltered browser captures for human visual review; no art assets generated."""
from pathlib import Path
from PIL import Image, ImageDraw
import sys
folder = Path('artifacts/super-polish') / (sys.argv[1] if len(sys.argv) > 1 else 'iteration-3')
def sheet(paths, name, columns=4, cell=(300,220), crop=None):
    if not paths: return
    canvas=Image.new('RGB',(columns*cell[0],((len(paths)+columns-1)//columns)*cell[1]),'#101b20')
    draw=ImageDraw.Draw(canvas)
    for i,p in enumerate(paths):
        im=Image.open(p).convert('RGB')
        if crop: im=im.crop(crop)
        im.thumbnail((cell[0]-4,cell[1]-28))
        x=i%columns*cell[0];y=i//columns*cell[1]
        canvas.paste(im,(x+(cell[0]-im.width)//2,y))
        draw.text((x+7,y+cell[1]-22),p.stem.replace('model-','').replace('effect-','').replace('icon-',''),fill='#e9f0e8')
    canvas.save(folder/name)
sheet(sorted(folder.glob('model-*.png')),'models-contact.png')
sheet(sorted(folder.glob('icon-*.png')),'icons-contact.png',3,(360,110))
sheet(sorted(folder.glob('effect-*-1.png')),'effects-contact.png',4,(300,350),(390,30,1070,760))
for ident in sorted({p.stem.removeprefix('effect-').rsplit('-',1)[0] for p in folder.glob('effect-*-0.png')}):
    sheet(sorted(folder.glob(f'effect-{ident}-[0-3].png')),f'timeline-{ident}.png',4,(360,440),(390,30,1070,800))
for p in sorted(folder.glob('motion-*.json')):
    ident=p.stem.removeprefix('motion-')
    sheet(sorted(folder.glob(f'motion-{ident}-*.png')),f'motion-timeline-{ident}.png',5,(256,220))
