import { SUPER_IDS } from "./superWeapons";
import { GUNS } from "./projectiles";
import { BOOSTS } from "./types";
import { NEW_BOSSES, bossDefinition } from "./bosses";
import approved from "./audioApproved.json";

export type AudioBus = "weapons" | "impacts" | "bosses" | "ui" | "ambience";
export interface AudioCue {
  variants: string[];
  bus: AudioBus;
  gain: number;
  priority: number;
  cooldown: number;
  maxVoices: number;
  start?: number;
  end?: number;
  loop?: boolean;
}
const legacy = [
  "pulse",
  "seeker",
  "helix",
  "scatter",
  "cursor",
  "mortar",
  "impact",
  "detonate",
];
export function cueDefaults(name: string): Omit<AudioCue, "variants"> {
  const boss = name.startsWith("boss-"),
    superCue = name.startsWith("super-");
  const ui = name.startsWith("ui-") || name.startsWith("pickup-");
  const ambience = name.startsWith("ambience-");
  const impact =
    name === "impact" ||
    name === "detonate" ||
    name.startsWith("impact-") ||
    name.startsWith("creature-") ||
    name.startsWith("death-");
  return {
    bus: ambience
      ? "ambience"
      : ui
        ? "ui"
        : boss || superCue
          ? "bosses"
          : impact
            ? "impacts"
            : "weapons",
    gain: 1,
    priority: ui ? 5 : boss || superCue ? 4 : impact ? 2 : ambience ? 0 : 1,
    cooldown:
      name === "pulse" ? 0.1 : name === "impact" ? 0.08 : ui ? 0.08 : 0.15,
    maxVoices: boss || superCue ? 2 : 4,
    ...(ambience ? { loop: true } : {}),
  };
}
export const AUDIO_CUES: Record<string, AudioCue> = Object.fromEntries(
  [
    ...legacy,
    ...GUNS.slice(5),
    ...GUNS.slice(5).map((k) => `impact-${k}`),
    ...BOOSTS.slice(4).map((k) => `pickup-${k}`),
    ...SUPER_IDS.map((k) => `super-${k}`),
    ...NEW_BOSSES.flatMap((k) =>
      ["entrance", "windup", "attack", "impact", "phase", "death"].map(
        (event) => `boss-${bossDefinition(k).id}-${event}`,
      ),
    ),
  ].map((name) => [
    name,
    {
      ...cueDefaults(name),
      variants: [
        name.startsWith("boss-")
          ? `/assets/audio/bosses/${name.slice(5)}.ogg`
          : `/assets/audio/${name}.${legacy.includes(name) ? "mp3" : "wav"}`,
      ],
    },
  ]),
);
// Only explicitly reviewed selections enter the shipping catalog.
for (const [name, cue] of Object.entries(approved) as [string, AudioCue][])
  AUDIO_CUES[name] = { ...cueDefaults(name), ...cue };

export function nextVariant(
  count: number,
  previous: number | undefined,
  random: number,
): number {
  if (count <= 1) return 0;
  const n = Math.min(count - 2, Math.floor(Math.max(0, random) * (count - 1)));
  if (previous === undefined)
    return Math.min(count - 1, Math.floor(Math.max(0, random) * count));
  return n >= previous ? n + 1 : n;
}
