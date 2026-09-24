// Paid offline generation. No provider credentials or code belong in the game bundle.
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import {
  ROOT,
  MODEL,
  readJSON,
  writeJSON,
  reserveCost,
  hash,
  envKey,
} from "./core.mjs";

fs.mkdirSync(`${ROOT}/originals`, { recursive: true });
const lock = `${ROOT}/.generation-lock`;
try {
  fs.mkdirSync(lock);
} catch {
  throw Error(
    "Another generator owns the ledger; inspect its process before removing the lock",
  );
}
try {
  const config = readJSON(
    process.argv[2] || "scripts/audio-quality/pilot.json",
  );
  const revision = process.argv[3] || "r2";
  if (!/^r\d+$/.test(revision))
    throw Error("Revision must be r followed by digits");
  const stage = process.env.AUDIO_STAGE || "pilot";
  if (stage !== "pilot") {
    execFileSync(process.execPath, ["scripts/audio-quality/evaluate.mjs"], {
      stdio: "pipe",
    });
    if (
      !["pilot-approved", "pilot-accepted"].includes(
        readJSON(`${ROOT}/pilot-evaluation.json`).status,
      )
    )
      throw Error("Pilot listening checkpoint has not passed");
  }
  const ledgerPath = `${ROOT}/ledger.json`;
  const ledger = fs.existsSync(ledgerPath)
    ? readJSON(ledgerPath)
    : { capUSD: 100, currency: "USD", jobs: {} };
  const key = envKey();
  async function request(url, body, attempt = 0) {
    const target = new URL(url);
    if (!["queue.fal.run", "api.fal.ai"].includes(target.hostname))
      throw Error("Unexpected provider host");
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Key ${key}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    if (
      !body &&
      [429, 502, 503, 504].includes(response.status) &&
      attempt < 4
    ) {
      console.log(
        `Read-only provider request throttled; retry ${attempt + 1}/4`,
      );
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30000, 5000 * 2 ** attempt)),
      );
      return request(url, body, attempt + 1);
    }
    if (!response.ok) throw Error(`Provider HTTP ${response.status}`);
    return response.json();
  }
  for (const cue of config) {
    if (!/^[a-z0-9-]+$/.test(cue.id)) throw Error("Invalid cue ID");
    for (let variant = 0; variant < 3; variant++) {
      const id = `${cue.id}-${revision}-${variant + 1}`;
      const variation = [
        "Detailed, clear gesture.",
        "Drier, tighter alternate take.",
        "Broader body, deeper alternate take.",
      ][variant];
      const input = {
        text: `Cinematic game SFX. ${cue.prompt} ${variation} No speech or music.`,
        duration_seconds: cue.duration,
        loop: !!cue.loop,
        prompt_influence: 0.55,
        output_format: "pcm_44100",
      };
      if (input.text.length > 450)
        throw Error(`${id}: prompt exceeds provider's 450-character limit`);
      let job = ledger.jobs[id];
      if (
        job &&
        hash(JSON.stringify(job.input)) !== hash(JSON.stringify(input))
      )
        throw Error(`${id}: input changed; use a new revision`);
      if (!job) {
        const quote = await request(
          `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(MODEL)}`,
        );
        const price = quote.prices.find((p) => p.endpoint_id === MODEL);
        if (!price) throw Error("No model pricing returned");
        job = ledger.jobs[id] = {
          id,
          cue: cue.id,
          family: cue.family,
          stage,
          revision,
          model: MODEL,
          input,
          price,
          quotedAt: new Date().toISOString(),
          reserveUSD: reserveCost(ledger, cue.duration, price, stage),
          state: "submission-uncertain",
        };
        writeJSON(ledgerPath, ledger);
        Object.assign(
          job,
          await request(`https://queue.fal.run/${MODEL}`, input),
          { state: "pending" },
        );
        writeJSON(ledgerPath, ledger);
      }
      if (["submission-uncertain", "failed"].includes(job.state))
        throw Error(`${id}: reconcile ${job.state} before another submission`);
      const deadline = Date.now() + 15 * 60 * 1000;
      while (job.state !== "complete") {
        if (Date.now() > deadline)
          throw Error(`${id}: still pending; rerun to resume, not resubmit`);
        const status = await request(job.status_url);
        if (status.status === "COMPLETED") {
          try {
            job.result = await request(job.response_url);
            job.state = "complete";
          } catch (e) {
            job.state = "failed";
            writeJSON(ledgerPath, ledger);
            throw e;
          }
          writeJSON(ledgerPath, ledger);
        } else if (status.status === "FAILED") {
          job.state = "failed";
          writeJSON(ledgerPath, ledger);
          throw Error(`${id}: provider failed`);
        } else await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      const output = `${ROOT}/originals/${id}.bin`;
      if (!fs.existsSync(output)) {
        const response = await fetch(job.result.audio.url, {
          signal: AbortSignal.timeout(60000),
        });
        if (!response.ok) throw Error(`Audio download HTTP ${response.status}`);
        const bytes = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(`${output}.tmp`, bytes);
        fs.renameSync(`${output}.tmp`, output);
      }
      job.sha256 = hash(fs.readFileSync(output));
      job.original = output;
      writeJSON(ledgerPath, ledger);
      console.log(
        `${id}: saved; reserved total $${Object.values(ledger.jobs)
          .reduce((s, j) => s + j.reserveUSD, 0)
          .toFixed(2)}`,
      );
    }
  }
} finally {
  fs.rmdirSync(lock);
}
