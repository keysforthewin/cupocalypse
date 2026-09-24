import { useMemo, useEffect } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Enemy } from "../game/types";
import { characterPose, createRig } from "./motion";
import { AttackEffects } from "./AttackEffects";
import type { Simulation } from "../game/simulation";
// Wound and phase markers are shared geometry and material, attached to the
// spine bone directly. A react-three-fiber portal per enemy used to do this,
// but each portal mirrors the root store, subscribes to it for the lifetime of
// the canvas, and rebuilds its state every frame with a closure over the
// previous state, so every enemy that ever spawned kept growing the heap.
const woundGeometry = new T.SphereGeometry(1, 12, 8);
const woundMaterial = new T.MeshStandardMaterial({
  color: "#732d27",
  roughness: 0.35,
});
const phaseGeometry = new T.SphereGeometry(1, 14, 10);
const phaseMaterial = new T.MeshStandardMaterial({
  color: "#742b29",
  roughness: 0.25,
});
export function Character({
  url,
  enemy,
  sim,
}: {
  url: string;
  enemy: Enemy;
  sim: Simulation;
}) {
  const gltf = useGLTF(url);
  const model = useMemo(() => {
    const model = clone(gltf.scene);
    model.name = `animated-${enemy.kind}-${enemy.id}`;
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
        // Generated GLBs omit PBR factors (glTF defaults them to fully metallic).
        // Skin and cloth need diffuse light so the moving anatomy stays readable.
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          const m = material as T.MeshStandardMaterial;
          m.metalness =
            enemy.kind === "Bulwark" || enemy.kind === "Riot Guard"
              ? 0.35
              : 0.05;
          m.roughness = 0.76;
        }
      }
    });
    return model;
  }, [gltf.scene, enemy.kind, enemy.id]);
  const spine = useMemo(() => model.getObjectByName("spine") ?? model, [model]);
  const markers = useMemo(() => {
    const wound = new T.Mesh(woundGeometry, woundMaterial);
    wound.position.set(0.15, 0.15, 0.2);
    wound.scale.set(0.15, 0.22, 0.055);
    wound.visible = false;
    const phase = new T.Mesh(phaseGeometry, phaseMaterial);
    phase.position.set(0, 0.16, 0.24);
    phase.scale.set(0.14, 0.2, 0.035);
    phase.visible = false;
    return { wound, phase };
  }, []);
  useEffect(() => {
    spine.add(markers.wound, markers.phase);
    return () => {
      spine.remove(markers.wound, markers.phase);
    };
  }, [spine, markers]);
  const poseRig = useMemo(() => createRig(model), [model]);
  const scale =
    enemy.kind === "Bulwark"
      ? 2.6
      : enemy.kind === "Broodmass"
        ? 1.3
        : enemy.kind === "Congregation"
          ? 3.6
          : enemy.kind === "Crawler"
            ? 0.48
            : enemy.kind === "Screamer"
              ? 1.35
              : 1.15;
  useEffect(() => {
    return () => {
      model.traverse((o) => {
        if (o instanceof T.Mesh) {
          if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    };
  }, [model]);
  useFrame(() => {
    const preparing = enemy.prepareUntil > sim.tick;
    markers.wound.visible = 1 - enemy.hp / enemy.maxHp > 0.25;
    markers.phase.visible = enemy.phase === 2 && enemy.boss;
    const pose = characterPose(enemy, sim.tick);
    poseRig(pose);
    model.position.y = pose.y;
    model.rotation.set(pose.lean, pose.turn, 0);
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        for (const material of materials) {
          const m = material as T.MeshStandardMaterial;
          m.emissive?.set(
            enemy.hit > sim.tick
              ? "#973d27"
              : enemy.buffUntil > sim.tick
                ? "#461713"
                : preparing
                  ? "#332515"
                  : "#000000",
          );
          m.emissiveIntensity =
            enemy.hit > sim.tick
              ? 0.6
              : Math.max(0.1, Math.sin(sim.time * 8) * 0.35);
          if (enemy.kind === "Broodmass") m.color.set("#b69b83");
        }
      }
    });
  });
  return (
    <group>
      <AttackEffects enemy={enemy} sim={sim} scale={scale} />
      <group scale={scale}>
        <primitive object={model} />
      </group>
    </group>
  );
}
