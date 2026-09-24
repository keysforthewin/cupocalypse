import {manualRendering} from "./super-review-render.mjs";
import { chromium } from "playwright";
import fs from "node:fs";
import assert from "node:assert/strict";
const out = "artifacts/super-polish/iteration-6-boundaries";
fs.mkdirSync(out, {recursive:true});
const browser = await chromium.launch({
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({
  viewport: { width: 1100, height: 800 },
  reducedMotion: process.env.REDUCED ? "reduce" : "no-preference",
});
page.setDefaultTimeout(60000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

const rows = [];
try {
  await page.goto(process.env.GAME_URL || "http://localhost:5182");
  await page.evaluate(() => localStorage.setItem("gate-runner-profile", JSON.stringify({quality:"high", muted:true,currency:20000,upgrades:[0,0,0],records:{}})));
  await page.reload();
  await page.getByRole("button", {name:"DEPLOY SQUAD"}).click();
  await page.waitForFunction(() => window.__gateRunner?.sim.tick > 2);
  await manualRendering(page);
  for (const id of (process.env.IDS || "kuttula,hondo,panda,kismet").split(",")) {
    await page.evaluate(id => {window.__old = window.__gateRunner.sim; window.__gateRunner.superScenario([id]);}, id);
    await page.waitForFunction(() => window.__old !== window.__gateRunner.sim);
    await page.evaluate(() => window.__sceneReview.scene.__r3f.root.getState().setFrameloop("never"));
    const duration = await page.evaluate(async id => {
      const s = window.__gateRunner.sim;
      if (["kuttula", "hondo"].includes(id)) {
        s.enemies = [];
        const e = s.spawnEnemy("Bulwark", 0, id === "hondo" ? 9 : 18, true);
        e.hp = e.maxHp = 100000;
      }
      if (id === "kismet") {s.x=-3;s.spawnGate();s.gates[0].z = 7;}
      s.supers.charge = s.supers.quota;
      if (!s.supers.activate()) throw Error("Activation failed");
      if (id === "hondo") { const e=s.enemies[0], front=s.crowd.push+8; e.z=front-.01; s.supers.barrier(e,front+.01); }
      if (id === "panda") s.hitSquad(60,"review",0,0,false,s.enemies[0].id);
      return (await import("/src/game/superWeapons.ts")).SUPERS[id].duration;
    }, id);
    const samples = id === "panda" ? [duration*60-24,duration*60-6,duration*60+6,duration*60+18,duration*60+30] : id === "kismet" ? [6,24,48,90,150] : [6,114,126,138,162];
    let previous = 0;
    const frames = [];
    for (const tick of samples) {
      const state = await page.evaluate(async n => {
        const q=window.__gateRunner;
        if (q.sim.supers.slot.id === "kismet") {for(let i=0;i<n;i++) q.sim.update({x:-3},false);q.advance(0);} else q.advance(n);
        if (q.sim.supers.slot.id === "hondo") { const e=q.sim.enemies[0],front=q.sim.crowd.push+8; e.z=front-.01;q.sim.supers.barrier(e,front+.01); }
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.__sceneReview.scene.__r3f.root.getState().advance(q.sim.time, true);
        window.__sceneReview.scene.__r3f.root.getState().advance(q.sim.time, true);
        const c=q.sim.supers.casts[0], boss=q.sim.enemies.find(e=>e.boss);
        return {tick:q.sim.tick, count:c?.count, walls:c?.walls, bossMovement:boss?q.sim.supers.movement(boss):null, gatePassed:q.sim.gates.map(g=>g.passed), render:{...window.__renderInfo}};
      }, tick-previous);
      previous = tick;
      frames.push(state);
      await page.screenshot({path:`${out}/${id}-${tick}.png`});
    }
    if (id === "kuttula") {assert.equal(frames[0].bossMovement,0);assert.equal(frames.at(-1).bossMovement,1);}
    if (id === "hondo") assert.equal(frames.at(-1).walls[1],0);
    if (id === "kismet") assert.ok(frames.some(f=>f.count>0), "Actual gate crossing spends a fortune");
    rows.push({id,frames});
    fs.writeFileSync(`${out}/report-${id}.json`,JSON.stringify({id,frames,errors},null,2));
    console.log(`boundary: ${id}`);
  }
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/report.json`,JSON.stringify({rows,errors},null,2));
} finally {await browser.close();}
