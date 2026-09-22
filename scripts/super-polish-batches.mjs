import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const ids = ['mortal','keys','sybex','tuna','nitro','baezil','pauly','machinegunqueen','meesh','zunneh','rae','doc','kismet','mmiguel','strawberry','nemesis','bronze-leopard','five10','shannondoa','kuttula','gimmy','haut-carl','hondo','panda','pokey','platypus','so1ician'];
const phase = process.env.PHASE || 'iteration-6-high';
for (let i=0;i<ids.length;i+=3) {
  const batch=ids.slice(i,i+3).filter(id=>!fs.existsSync(`artifacts/super-polish/${phase}/report-${id}.json`));
  if (!batch.length) continue;
  const result=spawnSync('node',['scripts/super-polish-review.mjs'], {stdio:'inherit',env:{...process.env,PHASE:phase,IDS:batch.join(','),EFFECTS_ONLY:'1',QUALITY:process.env.QUALITY||'high'}});
  if (result.status!==0) process.exit(result.status||1);
}
const reports=ids.map(id=>JSON.parse(fs.readFileSync(`artifacts/super-polish/${phase}/report-${id}.json`)));
fs.writeFileSync(`artifacts/super-polish/${phase}/complete-report.json`,JSON.stringify({ids,rows:reports.map(r=>r.row),errors:reports.flatMap(r=>r.errors)},null,2));
