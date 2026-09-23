// Offline asset jobs only. Never import into browser code.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const lockPath="assets/bosses/.quality-generation.lock";
const lock=fs.openSync(lockPath,"wx");
fs.writeSync(lock,String(process.pid));
process.on("exit",()=>{fs.closeSync(lock);fs.unlinkSync(lockPath);});
process.on("SIGINT",()=>process.exit(130));
process.on("SIGTERM",()=>process.exit(143));
const root = "assets/bosses";
const designs = JSON.parse(fs.readFileSync(`${root}/quality-designs.json`));
const ledgerPath = `${root}/ledger.json`;
const ledger = fs.existsSync(ledgerPath)
  ? JSON.parse(fs.readFileSync(ledgerPath))
  : {
      cap: 100,
      currency: "USD",
      note: "User-authorized cap; reserves are conservative estimates, not invoices.",
      jobs: {},
    };
const key = process.env.FAL_KEY;
if (!key) throw Error("FAL_KEY required");
for (const d of ["concepts", "originals", "audio"])
  fs.mkdirSync(`${root}/${d}`, { recursive: true });
function save() {
  fs.writeFileSync(`${ledgerPath}.tmp`, JSON.stringify(ledger, null, 2));
  fs.renameSync(`${ledgerPath}.tmp`, ledgerPath);
}
async function request(url, input) {
  const r = await fetch(url, {
    method: input ? "POST" : "GET",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: input ? JSON.stringify(input) : undefined,
  });
  if (!r.ok)
    throw Error(`Provider HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}
async function job(id, model, input, reserve) {
  let j = ledger.jobs[id];
  if (!j) {
    if (
      Object.values(ledger.jobs).reduce((s, j) => s + j.reserve, 0) + reserve >
      ledger.cap
    )
      throw Error("Generation cap reached");
    j = ledger.jobs[id] = {
      model,
      input,
      reserve,
      state: "submission-uncertain",
      submitted: new Date().toISOString(),
    };
    save();
    Object.assign(j, await request(`https://queue.fal.run/${model}`, input), {
      state: "pending",
    });
    save();
  }
  if (j.state === "submission-uncertain" || j.state === "failed")
    throw Error(`${id}: reconcile recorded ${j.state} before retry`);
  while (j.state !== "complete") {
    const status = await request(j.status_url);
    if (status.status === "COMPLETED") {
      try {
        j.result = await request(j.response_url);
        j.state = "complete";
        save();
      } catch (e) {
        j.state = "failed";
        j.error = String(e);
        save();
        throw e;
      }
    } else await new Promise((r) => setTimeout(r, 5000));
  }
  console.log(`${id}: complete`);
  return j.result;
}
async function download(url, path) {
  if (!fs.existsSync(path)) {
    const r = await fetch(url);
    if (!r.ok) throw Error(`Download HTTP ${r.status}`);
    fs.writeFileSync(path, Buffer.from(await r.arrayBuffer()));
  }
}

const [command,round="q2",only,choice="0"] = process.argv.slice(2);
if(!["concepts","models"].includes(command)||!/^(q[0-9]+|selected)$/.test(round))throw Error("Usage: concepts|models q2 [boss-id] [variant]");
fs.mkdirSync(`${root}/candidates`,{recursive:true});
const reports=await Promise.allSettled(designs.map(async(d,i)=>{
 if(only&&!only.split(",").includes(d.id))return;
 const selection=JSON.parse(fs.readFileSync(`${root}/quality-selection.json`));
 const jobRound=round==="selected"?selection.rounds[d.id]:round;
 if(command==="concepts")for(let variant=0;variant<2;variant++){
  const prompt=`Use case: stylized-concept. An isolated high fidelity dark fantasy game creature sculpture. ${d.qualitySubject} Single isolated creature occupying only the central 75 percent of the image. Entire silhouette inside the frame, every wingtip and toe visible, broad empty margin on all sides. Camera pulled back enough to fit the complete figure. Almost straight-on front view, only ten degrees of turn, neutral bind stance suitable for rigging. Exquisitely sculpted primary and secondary forms, convincing material separation, fine restrained pores and chisel marks. Matte tactile surfaces; no shiny foil, no random noisy cracks, no melted edges. Broad neutral studio light, dark slate gray background, no dramatic painted shadows, no motion, no scenery. ${variant===0?"Monumental solid sculptural anatomy, clean silhouette and distinctly articulated joints.":"Older ceremonial variation, slightly more slender limbs, intricate raised relief only on large armor panels."} No lettering, no text, no watermark.`;
  const result=await job(`${d.id}-${jobRound}-concept-${variant}`,"fal-ai/flux-2-pro",{prompt,image_size:{width:d.landscape?2048:1536,height:d.landscape?1024:1536},seed:18281+i*31+variant+Number(jobRound.slice(1))*173},.15);
  await download(result.images[0].url,`${root}/candidates/${d.id}-${jobRound}-${variant}.png`);
 }
 if(command==="models"){
  const selected=fs.existsSync(`${root}/quality-selection.json`)?JSON.parse(fs.readFileSync(`${root}/quality-selection.json`)):{};
  const variant=selected[`${d.id}-${jobRound}`]??choice;
  const concept=ledger.jobs[`${d.id}-${jobRound}-concept-${variant}`];
  if(concept?.state!=="complete")throw Error("Selected concept not complete");
  const result=await job(`${d.id}-${jobRound}-model-${variant}`,"fal-ai/meshy/v6/image-to-3d",{image_url:concept.result.images[0].url,model_type:"standard",topology:"triangle",target_polycount:jobRound==="q5"?60000:200000,should_remesh:true,should_texture:true,enable_pbr:true,symmetry_mode:i===0?"off":"auto",texture_prompt:"Premium cinematic sculptural material quality. Preserve reference colors and material boundaries. Matte weathered ivory ceramic and aged bone, dark fibrous recesses, restrained rough oxidized metal only where shown. Subtle physically plausible wear. No baked highlights, no painted lighting, no gold foil, no random scribbles, no excessive chipped white noise.",enable_rigging:false,enable_animation:false},3);
  await download(result.model_glb.url,`${root}/candidates/${d.id}-${jobRound}-${variant}.glb`);
  if(result.thumbnail?.url)await download(result.thumbnail.url,`${root}/candidates/${d.id}-${jobRound}-${variant}-preview.png`);
 }
}));
for(const r of reports)if(r.status==="rejected"){console.error(r.reason.message);process.exitCode=1;}
console.log(`Ledger reservations: $${Object.values(ledger.jobs).reduce((s,j)=>s+j.reserve,0).toFixed(2)} / $${ledger.cap}`);
