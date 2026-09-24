import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { bossDefinition, isNewBoss } from "../game/bosses";
import { PICKUPS } from "../game/weapons";
import type { Simulation } from "../game/simulation";
import { presentedDistance } from "./presentation";

// three.js compiles the light count into every lit shader. When a pickup or a
// boss brought its own point light, each new count recompiled every lit
// material in view mid-run. These pools keep the count fixed: unused lights
// stay in the scene at zero intensity.
export const PICKUP_LIGHTS = 3;

export function SceneLights({ sim }: { sim: Simulation }) {
  const key = useRef<T.PointLight>(null),
    rim = useRef<T.PointLight>(null);
  const pickups = useRef<(T.PointLight | null)[]>([]);
  const nearest = useRef<Simulation["drops"]>([]);
  useFrame(() => {
    // The living boss owns the rig; its remains keep it through the death animation.
    let boss = sim.boss && isNewBoss(sim.boss.kind) ? sim.boss : undefined;
    for (let i = sim.bossRemains.length - 1; !boss && i >= 0; i--)
      if (isNewBoss(sim.bossRemains[i].kind)) boss = sim.bossRemains[i];
    if (key.current && rim.current) {
      if (boss) {
        const d = bossDefinition(boss.kind),
          z = -boss.z - d.visualZ;
        key.current.position.set(
          -d.span * 0.25,
          d.height * 0.85,
          z + d.height * 0.8,
        );
        key.current.intensity = d.height * d.height * 4;
        key.current.distance = d.height * 2.5;
        rim.current.position.set(
          d.span * 0.4,
          d.height * 0.55,
          z - d.height * 0.3,
        );
        rim.current.intensity = d.height * d.height * 2;
        rim.current.distance = d.height * 2;
        rim.current.color.set(d.color);
      } else {
        key.current.intensity = 0;
        rim.current.intensity = 0;
      }
    }
    // The drops closest to the squad get the glow; distant ones sit in fog.
    const drops = nearest.current;
    drops.length = 0;
    for (const drop of sim.drops) {
      let at = drops.length;
      while (at > 0 && drops[at - 1].z > drop.z) at--;
      if (at < PICKUP_LIGHTS) {
        drops.splice(at, 0, drop);
        if (drops.length > PICKUP_LIGHTS) drops.pop();
      }
    }
    const scroll = (sim.distance - presentedDistance(sim)) * 2.5;
    pickups.current.forEach((light, i) => {
      if (!light) return;
      const drop = drops[i];
      if (!drop) {
        light.intensity = 0;
        return;
      }
      light.position.set(drop.x, 1.5, -drop.z - scroll + 0.8);
      light.color.set(PICKUPS[drop.kind].color);
      light.intensity = 5;
    });
  });
  return (
    <>
      <pointLight
        ref={key}
        intensity={0}
        decay={2}
        color="#ffe3c5"
        name="boss-key-light"
      />
      <pointLight ref={rim} intensity={0} decay={2} name="boss-rim-light" />
      {Array.from({ length: PICKUP_LIGHTS }, (_, i) => (
        <pointLight
          key={i}
          ref={(light) => {
            pickups.current[i] = light;
          }}
          intensity={0}
          distance={4}
          decay={2}
          name="pickup-light"
        />
      ))}
    </>
  );
}
