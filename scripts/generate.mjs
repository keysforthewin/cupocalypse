// Generation is available only in the dedicated Docker service. Never import this into the app.
import fs from "node:fs";
const file = "assets/ledger.json",
  key = process.env.FAL_KEY;
if (!key) throw Error("FAL_KEY is required in the generation container");
const read = () => JSON.parse(fs.readFileSync(file, "utf8"));
async function locked(fn) {
  for (let i = 0; i < 300; i++) {
    try {
      fs.mkdirSync("assets/.ledger-lock");
      break;
    } catch (e) {
      if (i === 299)
        throw Error(
          "Ledger locked; verify no active process before removing assets/.ledger-lock",
        );
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try {
    const ledger = read();
    const result = await fn(ledger);
    fs.writeFileSync(file + ".tmp", JSON.stringify(ledger, null, 2));
    fs.renameSync(file + ".tmp", file);
    return result;
  } finally {
    fs.rmdirSync("assets/.ledger-lock");
  }
}
async function req(url, method = "GET", body) {
  const r = await fetch(url, {
    method,
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const e = new Error(
      `FAL HTTP ${r.status}: ${(await r.text()).slice(0, 240)}`,
    );
    e.status = r.status;
    throw e;
  }
  return r.json();
}
async function persistOutputs(name, result) {
  fs.writeFileSync(
    `assets/originals/${name}.json`,
    JSON.stringify(result, null, 2),
  );
  const url =
    result.images?.[0]?.url ||
    result.basic_animations?.walking_glb?.url ||
    result.model_mesh?.url ||
    result.model_glb?.url ||
    result.rigged_character_glb?.url;
  const ext = result.images ? "jpg" : "glb";
  if (url) {
    const dest = `assets/originals/${name}.${ext}`;
    if (!fs.existsSync(dest)) {
      const response = await fetch(url);
      if (!response.ok) throw Error("Asset download failed");
      fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
    }
  }
}
export async function run(name, model, input, reserve, bucket = "production") {
  const job = await locked(async (ledger) => {
    let j = ledger.jobs[name];
    if (j) return j;
    const all = Object.values(ledger.jobs);
    if (
      all.reduce((s, j) => s + j.reserve, 0) + reserve > 100 ||
      all
        .filter((j) => j.bucket === bucket)
        .reduce((s, j) => s + j.reserve, 0) +
        reserve >
        ledger.buckets[bucket]
    )
      throw Error("Generation budget reservation exceeded");
    j = {
      model,
      input,
      reserve,
      bucket,
      state: "submitting",
      submitted: new Date().toISOString(),
    };
    ledger.jobs[name] = j;
    return j;
  });
  if (job.state === "complete") {
    await persistOutputs(name, job.result);
    return job.result;
  }
  if (job.state === "failed")
    throw Error(`${name} previously failed; no duplicate submission`);
  if (!job.request_id) {
    if (job.state !== "submitting") throw Error("Unknown submission state");
    // Mark attempted BEFORE network I/O. Uncertain submissions are never automatically retried.
    const permitted = await locked((l) => {
      const j = l.jobs[name];
      if (j.attempted) return false;
      j.attempted = true;
      return true;
    });
    if (!permitted)
      throw Error(`${name}: reconcile uncertain request with provider`);
    try {
      Object.assign(
        job,
        await req(`https://queue.fal.run/${model}`, "POST", input),
        { state: "pending" },
      );
      await locked((l) => Object.assign(l.jobs[name], job));
    } catch (e) {
      await locked((l) =>
        Object.assign(l.jobs[name], {
          state: "submission-uncertain",
          error: e.message,
        }),
      );
      throw e;
    }
  }
  for (let i = 0; i < 180; i++) {
    try {
      const status = await req(job.status_url);
      if (status.status === "COMPLETED") {
        const result = await req(job.response_url);
        await locked((l) =>
          Object.assign(l.jobs[name], {
            state: "complete",
            result,
            completed: new Date().toISOString(),
          }),
        );
        await persistOutputs(name, result);
        console.log(name, "complete");
        return result;
      }
    } catch (e) {
      if (e.status >= 400 && e.status < 500) {
        await locked((l) =>
          Object.assign(l.jobs[name], { state: "failed", error: e.message }),
        );
        throw e;
      }
      console.log(name, "temporary status error; will resume same request");
    }
    if (i % 6 === 0) console.log(name, "pending");
    await new Promise((r) => setTimeout(r, 10000));
  }
  throw Error(`${name} pending; resume by running same command`);
}
const roster = {
  Walker:
    "Ordinary infected civilian, ash-gray human skin with subtle dark veins, slack posture, faded torn charcoal hoodie and dirty denim jeans, uneven gait, small dark red patches on cheek. Slender recognizable human body.",
  Runner:
    "Lean infected modern soldier with ash-gray skin, torn olive fatigues, damaged tactical chest rig, no helmet, long legs, aggressive forward lean, dark red discoloration on one arm. Distinct human limbs.",
  Crawler:
    "Low crawling fictional human mutant, enormous long muscular forearms and broad hands dragging a narrow torso, bent shortened rear legs, ash-gray skin, dark crimson tissue on upper back, ragged civilian cloth, quadrupedal silhouette.",
  "Riot Guard":
    "Infected riot police officer, battered black riot helmet with transparent cracked face shield, ash-gray face, black protective pads and plate armor, carrying a broad cracked dark rectangular riot shield on left arm, defensive stance.",
  Charger:
    "Asymmetrical fictional infected soldier mutant, one enormous muscular right shoulder and arm, left arm normal, dark red sinewy right shoulder with pale bone spikes, broken olive plate armor and fatigues, ash gray skin, no weapon.",
  Spitter:
    "Hunched fictional infected human creature, ash gray skin and dark veins, hugely swollen throat sac, narrow ribbed torso, ragged olive trousers, long skinny arms, leaning forward, heavy bulging neck, distinct complete limbs.",
  Bloater:
    "Heavy rotund fictional infected human, enormous distended ash-gray belly with dark red fissure-like markings, heavy hanging arms, small head, torn gray work trousers and industrial boots, swelling rounded body silhouette.",
  Screamer:
    "Tall extremely emaciated fictional infected human, elongated open jaw, exposed ridged throat, sharply visible rib-like bone structure under ashen skin, long arms, tattered black civilian trousers, head arched upward.",
  Carrier:
    "Broad-backed fictional infected soldier, huge cluster of dark crimson organic sacs on the back, ash-gray face and limbs, olive military webbing and torn trousers beneath organic mass, hunched walking posture, no weapon.",
  Gunner:
    "Infected modern infantry soldier with ash-gray face, bent military helmet, tangled rifle sling and heavy ammunition rig, holding a worn modern rifle across the chest, damaged olive fatigues, jerky slouched human stance.",
  Bulwark:
    "Enormous hulking fictional infected armored soldier boss, broad upright top-heavy silhouette, crushed ballistic helmet, very thick dark military armor plates pushed apart by dark crimson muscle growth, huge asymmetrical right shoulder and arm, bone spurs, massive combat boots, no weapon.",
  Broodmass:
    "Wide low sprawling fictional biological monster boss, many pale human arms supporting and dragging a central dark crimson fleshy mound, clustered swollen sacs on its back, several small recognizable ash-gray human faces embedded in mass, bits of olive military fabric, distinctly horizontal quadruped silhouette.",
  Congregation:
    "Towering fictional fusion creature boss made of infected soldiers, tall irregular central torso with ribbed bone structures, five distinct ash-gray human heads at different heights, many uneven arms, tangled military webbing, dark red organic connective tissue, two enormous supporting legs, vertically imposing silhouette.",
};
const selected = process.argv[2] || "all";
if (selected === "reconcile") {
  await locked((l) => {
    for (const name of [
      "reference",
      "keyart",
      "trellis-soldier",
      "meshy-base",
    ]) {
      const path = `assets/originals/${name}.json`;
      if (l.jobs[name] && fs.existsSync(path)) {
        l.jobs[name].state = "complete";
        l.jobs[name].result = JSON.parse(fs.readFileSync(path));
      }
    }
    if (l.jobs["meshy-soldier"]) {
      l.jobs["meshy-soldier"].state = "failed";
      l.jobs["meshy-soldier"].error =
        "Provider content checker rejection; retained reservation, no retry.";
    }
  });
  console.log("Ledger reconciled from original provider results");
} else {
  const entries = Object.entries(roster).filter(
    ([name]) =>
      selected === "all" ||
      name.toLowerCase().replaceAll(" ", "-") === selected,
  );
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < entries.length) {
        const [name, description] = entries[cursor++];
        const slug = name.toLowerCase().replaceAll(" ", "-");
        try {
          const reference = await run(
            `${slug}-reference`,
            "fal-ai/flux/dev",
            {
              prompt: `${description} Full body front three-quarter view, entire body and feet visible, isolated on plain light gray studio background, realistic AAA survival horror game character design, high quality weathered PBR materials, balanced lighting, clearly separated limbs, no text, no pedestal.`,
              image_size: "square_hd",
              num_images: 1,
            },
            0.1,
          );
          await run(
            `${slug}-mesh`,
            "fal-ai/trellis",
            { image_url: reference.images[0].url },
            2,
          );
        } catch (e) {
          console.error(slug, e.message);
        }
      }
    }),
  );
}
