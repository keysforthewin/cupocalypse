"""Freeze application sources for reproducible DEV-hook browser reviews."""
from pathlib import Path
import shutil,tempfile,json,hashlib,sys
root=Path.cwd();label=sys.argv[1] if len(sys.argv)>1 else 'review'
snapshot=Path(tempfile.mkdtemp(prefix=f'march-super-{label}-'))
shutil.copytree(root/'src',snapshot/'src')
for name in ['package.json','index.html','vite.config.ts','tsconfig.json']:
    shutil.copy2(root/name,snapshot/name)
for name in ['node_modules','public']:(snapshot/name).symlink_to(root/name,target_is_directory=True)
files={str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((root/'src').rglob('*')) if p.is_file()}
out=root/'artifacts/super-polish'/label;out.mkdir(parents=True,exist_ok=True)
(out/'source-snapshot.json').write_text(json.dumps({'path':str(snapshot),'files':files},indent=2))
print(snapshot)

config=snapshot/"vite.config.ts"
config.write_text(config.read_text().replace("  plugins:", f"  cacheDir: {json.dumps(str(snapshot / '.vite'))},\n  plugins:").replace("    host:", f"    fs: {{ allow: {json.dumps([str(snapshot),str(root / 'node_modules'),str(root / 'public')])} }},\n    host:"))
