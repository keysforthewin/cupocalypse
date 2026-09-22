import fs from "node:fs";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
const env = Object.fromEntries(
  fs
    .readFileSync(".env", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const key = env.ELEVEN_LABS_KEY || env.ELEVENLABS_API_KEY;
if (!key) throw Error("Missing ElevenLabs key");
const dir = "assets/originals/weapon-audio",
  out = "public/assets/audio";
fs.mkdirSync(dir, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const sounds = {
  pulse:
    "Single futuristic kinetic rifle shot. Tight chesty mechanical thud, warm low bass punch, subtle bolt click. Very short dry decay.",
  seeker:
    "Single heavy micro missile launch. Deep pneumatic tube thump into short smoky rocket whoosh, powerful rounded sub bass. No whistle.",
  helix:
    "Single liquid plasma discharge. Warm bubbling electronic whomp, rounded resonant low mid pulse with soft swirling stereo tail. No laser squeal.",
  scatter:
    "Single crystal shard shotgun discharge. Thick crunchy low metallic clack with a soft granular scattering tail and deep bass body. No glass shriek.",
  cursor:
    "Single telekinetic energy orb launch. Smooth deep magnetic throb with a velvety reversed air swell and short warm oscillating tail.",
  mortar:
    "Single heavy siege cannon launch. Weighty low cannon thoom, tactile mechanical recoil and deep cinematic sub bass, soft short smoky tail.",
  impact:
    "Single compact sci fi energy impact. Dense warm bass pop, crumbling debris, soft fizz. Tight restrained transient.",
  detonate:
    "Single powerful sci fi missile explosion. Deep layered cinematic bass boom, broad warm pressure wave, rumbling debris falling away. No harsh crack.",
};
for (const [name, description] of Object.entries(sounds)) {
  const raw = `${dir}/${name}.mp3`,
    meta = `${dir}/${name}.json`;
  if (!fs.existsSync(raw)) {
    if (fs.existsSync(meta))
      throw Error(
        `${name} already submitted; inspect metadata before resubmitting`,
      );
    const request = {
      text: `Professional AAA video game sound effect: ${description} One isolated event starting immediately, no speech, no music, no background ambience, no high pitched screeching.`,
      duration_seconds: name === "detonate" ? 2 : 1,
      prompt_influence: 0.65,
      model_id: "eleven_text_to_sound_v2",
    };
    fs.writeFileSync(
      meta,
      JSON.stringify(
        {
          provider: "ElevenLabs",
          state: "submitted",
          request,
          submittedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    const response = await fetch(
      "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
      {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify(request),
      },
    );
    if (!response.ok) throw Error(`${name}: provider HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(raw, bytes);
    fs.writeFileSync(
      meta,
      JSON.stringify(
        {
          provider: "ElevenLabs",
          state: "complete",
          request,
          createdAt: new Date().toISOString(),
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
          characterCost: response.headers.get("character-cost"),
        },
        null,
        2,
      ),
    );
    console.log(`Generated ${name}: ${bytes.length} bytes`);
  }
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    raw,
    "-af",
    `silenceremove=start_periods=1:start_duration=0.005:start_threshold=-48dB,highpass=f=32,${name === "scatter" ? "equalizer=f=130:t=q:w=0.5:g=12," : ""}loudnorm=I=-20:TP=-3:LRA=5,lowpass=f=3200,lowpass=f=3200,afade=t=in:d=0.006,areverse,afade=t=in:d=0.08,areverse,alimiter=limit=0.5:level=false,volume=0.8`,
    "-ar",
    "44100",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "128k",
    `${out}/${name}.mp3`,
  ]);
  console.log(`Mastered ${name}`);
}
