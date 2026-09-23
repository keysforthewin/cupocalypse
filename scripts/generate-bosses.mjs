// Offline asset jobs only. Never import into browser code.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const root = "assets/bosses";
const designs = JSON.parse(fs.readFileSync(`${root}/designs.json`));
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
const command = process.argv[2],
  only = process.argv[3];
const results = await Promise.allSettled(
  designs.map(async (d, i) => {
    if (only && d.id !== only) return;
    if (command === "concepts") {
      for (let variant = 0; variant < 2; variant++) {
        const result = await job(
          `${d.id}-concept-${d.revision ?? "r2"}-${variant}`,
          "fal-ai/flux-2-pro",
          {
            prompt: `Premium dark science fiction creature production concept, highly detailed realistic 3D sculpture with physically based surfaces. ${d.subject} Front three quarter view, full body centered with generous margin, neutral gray studio background, soft broad studio key and subtle rim light, sharp readable anatomy and joints. ${variant ? "More pronounced asymmetry and weathering, intricate tertiary surface details." : "Restrained composition, exceptionally strong primary silhouette."} No text, no labels, no watermark, no cropping, no other creatures.`,
            image_size: { width: 1024, height: 1024 },
            seed: 79131 + i * 13 + variant,
          },
          0.1,
        );
        await download(
          result.images[0].url,
          `${root}/concepts/${d.id}-${d.revision ?? "r2"}-${variant}.png`,
        );
      }
    }
    if (command === "models" || command === "produce") {
      const choice = JSON.parse(fs.readFileSync(`${root}/selection.json`))[
        d.id
      ];
      const image =
        ledger.jobs[`${d.id}-concept-${d.revision ?? "r2"}-${choice}`].result
          .images[0].url;
      const r = await job(
        `${d.id}-model-${d.revision ?? "v1"}`,
        "fal-ai/meshy/v6/image-to-3d",
        {
          image_url: image,
          model_type: "standard",
          topology: "triangle",
          target_polycount: 100000,
          should_remesh: true,
          should_texture: true,
          enable_pbr: true,
          symmetry_mode: i === 0 ? "off" : "auto",
          enable_rigging: false,
          enable_animation: false,
        },
        3,
      );
      await download(r.model_glb.url, `${root}/originals/${d.id}.glb`);
    }
    if (command === "audio" || command === "produce") {
      for (const [event, duration, description] of [
        ["entrance", 5, "A threatening arrival roar swelling from silence"],
        [
          "windup",
          2,
          "An anticipatory inhalation building tension without impact",
        ],
        ["attack", 2, "One forceful weapon release"],
        ["impact", 3, "One massive physical impact followed by debris"],
        ["phase", 5, "A violent anatomical transformation and rising roar"],
        ["death", 6, "A huge dying collapse dissipating into silence"],
      ]) {
        const r = await job(
          `${d.id}-${event}`,
          "fal-ai/elevenlabs/sound-effects/v2",
          {
            text: `Cinematic game sound effect. ${d.sound}. ${description}. Isolated original sound, no intelligible words, no music.`,
            duration_seconds: duration,
            prompt_influence: 0.65,
          },
          0.5,
        );
        const path = `${root}/audio/${d.id}-${event}.mp3`;
        await download(r.audio.url, path);
        fs.mkdirSync("public/assets/audio/bosses", { recursive: true });
        execFileSync("python3", ["scripts/master-boss-audio.py", d.id, event], {
          stdio: "pipe",
        });
      }
    }
  }),
);
for (const r of results)
  if (r.status === "rejected") console.error(r.reason.message);
console.log(
  `Reserved: $${Object.values(ledger.jobs)
    .reduce((s, j) => s + j.reserve, 0)
    .toFixed(2)} / $${ledger.cap}`,
);
