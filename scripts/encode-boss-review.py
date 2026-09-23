"""Encode Blender review frames and move intermediates out of tracked assets."""
import json, subprocess, shutil
from pathlib import Path
root=Path('assets/bosses/review')
archive=Path('artifacts/boss-review/frames')
archive.mkdir(parents=True,exist_ok=True)
for design in json.load(open('assets/bosses/designs.json')):
    name=design['id']
    if not (root/f'film-{name}-000.png').exists(): continue
    subprocess.run(['ffmpeg','-y','-v','error','-framerate','10','-i',str(root/f'film-{name}-%03d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','20',str(root/f'{name}-motion.mp4')],check=True)
    for path in root.glob(f'film-{name}-*.png'):
        shutil.move(str(path),str(archive/path.name))
    print(name)
