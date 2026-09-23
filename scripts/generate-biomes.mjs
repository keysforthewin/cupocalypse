// Offline only: never import generation code into the browser.
import fs from "node:fs";
const directory = "assets/biomes";
fs.mkdirSync(`${directory}/originals`, { recursive: true });
const file = `${directory}/ledger.json`;
const lock = `${directory}/.lock`;
const key = process.env.FAL_KEY;
if (!key) throw Error("FAL_KEY is required in the generation container");
const subjects = {
  "city-kiosk":
    "An elaborate abandoned Parisian cast iron newspaper kiosk, octagonal pavilion, verdigris copper domed roof and finial, closed dark green shutters, brass moldings, stone base, realistic weathered architecture",
  "city-water-tower":
    "Old industrial rooftop water tower, cylindrical weathered oak plank tank, conical zinc roof, riveted iron hoops, four tall steel braced legs, access ladder, realistic architecture",
  "suburb-house":
    "American craftsman suburban house, two stories, sage green clapboard siding, cream trim, complex grey shingled gable roofs, deep covered porch with tapered stone columns, brick chimney, separate windows with dark glass, no ground or landscape",
  "suburb-car":
    "Abandoned vintage cream colored station wagon, rust at lower panels, dusty windows, realistic rubber tires and chrome trim, wheels intact, no ground",
  "country-barn":
    "Large weathered red timber American barn, tall gambrel shingled roof, white wooden braces on double doors, loft window, stone foundation, faded board siding, accurate agricultural architecture, no ground",
  "country-tractor":
    "Vintage abandoned green farm tractor, large rugged rear tires and small front tires, detailed engine block, exhaust pipe, leather seat, rust patina, realistic agricultural vehicle, no ground",
  "forest-rock":
    "Large asymmetrical granite boulder outcrop, fractured angular slabs, layered stone, patches of green moss in crevices, exposed roots around base, realistic natural geological formation, no pedestal",
  "forest-stump":
    "Ancient broken pine tree stump with gnarled exposed spreading roots, splintered jagged hollow top, deeply furrowed dark bark, subtle moss and bracket fungi, realistic woodland prop, no pedestal",
  "ash-ruin":
    "Bombed three story concrete building corner ruin, jagged broken outer walls, exposed floor slabs, bent steel rebar, empty rectangular window openings, collapsed masonry at base, soot blackened surfaces, realistic post apocalyptic architectural fragment",
  "ash-wreck":
    "Burned out abandoned heavy truck cab and chassis, blistered rusted metal, missing windshield, exposed blackened engine, buckled hood, charred tires, realistic scorched apocalypse vehicle wreck, no ground",
};
Object.assign(subjects, {
  "city-tenement":
    "Detailed five story New York red brick tenement building, rectangular footprint, front facade with recessed dark windows and stone lintels, iron fire escapes, ground floor shuttered shops with dark green awnings, ornate cornice and flat accessible roof, weathered realistic architecture, no ground",
  "city-offices":
    "Detailed six story early twentieth century limestone office building, rectangular narrow footprint, stone pilasters, rhythmic recessed dark windows, ground floor brass shopfront, stepped parapet cornice, flat roof with ducts, weathered realistic architecture, no surrounding ground",
  "suburb-cottage":
    "Detailed American two story red brick suburban cottage, steep charcoal slate gable roofs and dormers, white trim, covered timber porch, red brick chimney, white framed dark windows, foundation and front steps, weathered realistic architecture, no garden or ground",
  "country-barn-stone":
    "Detailed old rural stone barn, long rectangular building of rough golden limestone, weathered wooden double doors and loft window, steep dark slate pitched roof with broken tiles, exposed oak beams, realistic agricultural architecture, no surrounding ground",
  "forest-cabin":
    "Detailed abandoned woodland log cabin, interlocking weathered cedar logs, steep mossy shingled roof, stone chimney, dark glass windows, small covered porch on timber posts, stacked firewood beneath porch, realistic forest architecture, no ground",
  "ash-ruin-arcade":
    "Detailed destroyed single story industrial factory ruin, long rectangular facade with broken arched openings, crumbled brick masonry piers, collapsed steel roof trusses, soot blackened stone and piles of concrete debris at base, scorched post apocalyptic architecture, no surrounding ground",
});
const read = () =>
  fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file))
    : {
        cap: 100,
        currency: "USD",
        note: "Additional user-authorized biome allowance. Reservations are upper estimates, not invoices.",
        jobs: {},
      };
function update(fn) {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.mkdirSync(lock);
      break;
    } catch (e) {
      if (attempt >= 100) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    const ledger = read();
    const result = fn(ledger);
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(ledger, null, 2));
    fs.renameSync(`${file}.tmp`, file);
    return result;
  } finally {
    fs.rmdirSync(lock);
  }
}
async function request(url, body) {
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Key ${key}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok)
    throw Error(
      `Fal ${response.status}: ${(await response.text()).slice(0, 180)}`,
    );
  return response.json();
}
async function generate(name, subject) {
  let job = read().jobs[name];
  if (!job) {
    job = update((ledger) => {
      const reserve = 2;
      if (
        Object.values(ledger.jobs).reduce((n, j) => n + j.reserve, 0) +
          reserve >
        ledger.cap
      )
        throw Error("Biome allowance exhausted");
      return (ledger.jobs[name] = {
        reserve,
        model: "fal-ai/meshy/v6/text-to-3d",
        state: "submission-uncertain",
        submitted: new Date().toISOString(),
        input: {
          prompt: `${subject}. Single isolated game asset, detailed physically based materials, coherent realistic proportions.`,
          mode: "full",
          enable_pbr: true,
          target_polycount: 30000,
          should_remesh: true,
          seed: 32179,
        },
      });
    });
    // Persist attempted state BEFORE submission; reruns cannot duplicate uncertain jobs.
    const result = await request(
      `https://queue.fal.run/${job.model}`,
      job.input,
    );
    job = update((l) =>
      Object.assign(l.jobs[name], result, { state: "pending" }),
    );
  }
  if (job.state === "submission-uncertain")
    throw Error(`${name}: reconcile provider submission before retrying`);
  if (job.state === "failed")
    throw Error(`${name}: recorded failure; choose a new revision explicitly`);
  while (job.state !== "complete") {
    const status = await request(job.status_url);
    if (status.status === "COMPLETED") {
      try {
        const result = await request(job.response_url);
        job = update((l) =>
          Object.assign(l.jobs[name], { state: "complete", result }),
        );
      } catch (error) {
        update((l) =>
          Object.assign(l.jobs[name], {
            state: "failed",
            error: String(error),
          }),
        );
        throw error;
      }
    } else await new Promise((r) => setTimeout(r, 10000));
  }
  const dest = `${directory}/originals/${name}.glb`;
  if (!fs.existsSync(dest)) {
    const response = await fetch(job.result.model_glb.url);
    if (!response.ok) throw Error(`Download failed: ${name}`);
    fs.writeFileSync(dest, Buffer.from(await response.arrayBuffer()));
  }
  console.log(name, "complete", fs.statSync(dest).size);
}
const selected = process.argv[2];
const entries = Object.entries(subjects).filter(
  ([id]) => !selected || id === selected,
);
let cursor = 0;
await Promise.all(
  Array.from({ length: 2 }, async () => {
    while (cursor < entries.length) {
      const [id, subject] = entries[cursor++];
      try {
        await generate(id, subject);
      } catch (error) {
        console.error(id, String(error));
        process.exitCode = 1;
      }
    }
  }),
);
