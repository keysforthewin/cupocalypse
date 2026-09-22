import { debrisMaterial } from "./debrisMaterial";
import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import type { Simulation } from "../game/simulation";
import type { Effect } from "../game/types";
import { deathTint, effectRandom } from "../game/deaths";
import {
  debrisPose,
  debrisRecipe,
  type DebrisKind,
  type DebrisPiece,
} from "./debris";
import { effectSurface } from "./effectShaders";

const CAPACITY = 180 * 28;
export function DeathEffects({ sim }: { sim: Simulation }) {
  const { camera } = useThree();
  const batches = useMemo(() => {
    const geometries: Record<DebrisKind, T.BufferGeometry> = {
      torso: new T.CylinderGeometry(0.8, 0.6, 1, 6, 1).scale(1, 1, 0.8),
      limb: new T.CapsuleGeometry(0.65, 0.7, 3, 6).scale(1, 0.5, 1),
      head: new T.IcosahedronGeometry(1, 1),
      plate: new T.BoxGeometry(1, 1, 1),
      bone: new T.CylinderGeometry(0.7, 0.9, 1, 5),
      chunk: new T.IcosahedronGeometry(1, 0),
      spark: new T.OctahedronGeometry(1, 0),
    };
    const debris = Object.fromEntries(
      Object.entries(geometries).map(([kind, geometry]) => {
        const mat = debrisMaterial(kind as DebrisKind);
        const mesh = new T.InstancedMesh(geometry, mat, CAPACITY);
        mesh.name = `death-${kind}`;
        mesh.frustumCulled = false;
        mesh.receiveShadow = true;
        mesh.castShadow = kind !== "spark" && kind !== "chunk";
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        mesh.setColorAt(0, new T.Color("#ffffff"));
        mesh.count = 0;
        return [kind, mesh];
      }),
    ) as unknown as Record<DebrisKind, T.InstancedMesh>;
    const surfaces = Object.fromEntries(
      (["mist", "ring", "stain", "flash", "shadow"] as const).map((layer) => {
        const geo = new T.PlaneGeometry(2, 2);
        geo.setAttribute(
          "fxData",
          new T.InstancedBufferAttribute(
            new Float32Array(CAPACITY * 4),
            4,
          ).setUsage(T.DynamicDrawUsage),
        );
        const mesh = new T.InstancedMesh(geo, effectSurface(layer), CAPACITY);
        mesh.name = `death-${layer}`;
        mesh.frustumCulled = false;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
        mesh.setColorAt(0, new T.Color("#ffffff"));
        mesh.count = 0;
        mesh.renderOrder = layer === "stain" || layer === "shadow" ? 1 : 2;
        return [layer, mesh];
      }),
    ) as unknown as Record<
      "mist" | "ring" | "stain" | "flash" | "shadow",
      T.InstancedMesh
    >;
    return {
      debris,
      surfaces,
      all: [...Object.values(debris), ...Object.values(surfaces)],
    };
  }, []);
  useEffect(
    () => () => {
      for (const mesh of batches.all) {
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
        mesh.dispose();
      }
    },
    [batches],
  );
  const cache = useMemo(
    () => new WeakMap<Effect, { seed: number; recipe: DebrisPiece[] }>(),
    [],
  );
  const dummy = useMemo(() => new T.Object3D(), []);
  const color = useMemo(() => new T.Color(), []);
  useFrame(() => {
    for (const mesh of batches.all) mesh.count = 0;
    const surface = (
      layer: keyof typeof batches.surfaces,
      e: Effect,
      size: number,
      y: number,
      tint: string,
      fade = 1,
    ) => {
      const mesh = batches.surfaces[layer];
      const n = mesh.count++;
      dummy.position.set(e.x, y, -e.z);
      if (layer === "stain" || layer === "ring")
        dummy.rotation.set(-Math.PI / 2, 0, effectRandom(e.seed, 42) * 6.28);
      else dummy.quaternion.copy(camera.quaternion);
      dummy.scale.set(size, layer === "mist" ? size * 0.85 : size, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(n, dummy.matrix);
      mesh.setColorAt(n, color.set(tint));
      (
        mesh.geometry.getAttribute("fxData") as T.InstancedBufferAttribute
      ).setXYZW(n, e.age, effectRandom(e.seed, 11), e.energy, fade);
    };
    for (const e of sim.effects) {
      if (!e.active) continue;
      const body = e.kind === "corpse";
      const tint = deathTint(e);
      if (e.kind !== "blast") {
        let saved = cache.get(e);
        if (!saved || saved.seed !== e.seed) {
          saved = { seed: e.seed, recipe: debrisRecipe(e) };
          cache.set(e, saved);
        }
        for (const p of saved.recipe) {
          if (e.age >= p.life) continue;
          const pose = debrisPose(e, p);
          const mesh = batches.debris[p.kind];
          const n = mesh.count++;
          dummy.position.set(e.x + pose.x, pose.y, -e.z + pose.z);
          dummy.rotation.set(pose.rx, pose.ry, pose.rz);
          dummy.scale.set(
            p.size[0] * pose.fade,
            p.size[1] * pose.fade,
            p.size[2] * pose.fade,
          );
          if (p.kind === "spark") dummy.scale.y *= 2.5;
          dummy.updateMatrix();
          mesh.setMatrixAt(n, dummy.matrix);
          mesh.setColorAt(n, color.set(p.tint));
          if (p.kind !== "spark") {
            const shadow = batches.surfaces.shadow;
            const slot = shadow.count++;
            dummy.position.set(e.x + pose.x, 0.014, -e.z + pose.z);
            dummy.rotation.set(-Math.PI / 2, 0, pose.ry);
            const spread = 1 + pose.y * 0.4;
            dummy.scale.set(
              Math.max(p.size[0], p.size[1] * 0.6) * spread,
              Math.max(p.size[2], p.size[1] * 0.6) * spread,
              1,
            );
            dummy.updateMatrix();
            shadow.setMatrixAt(slot, dummy.matrix);
            shadow.setColorAt(slot, color.set("#0b1210"));
            (
              shadow.geometry.getAttribute(
                "fxData",
              ) as T.InstancedBufferAttribute
            ).setXYZW(slot, e.age, 0, 1, pose.fade * Math.exp(-pose.y * 1.2));
          }
        }
      }
      if (body) {
        const fade = Math.min(1, (e.life - e.age) / 0.7);
        const radius = (0.48 + effectRandom(e.seed, 33) * 0.5) * e.value;
        surface(
          "stain",
          e,
          radius * (0.45 + Math.min(1, e.age * 3) * 0.55),
          0.017,
          e.style === "acid" ? "#495122" : "#51201b",
          fade,
        );
        if (e.age < 1.6)
          surface(
            "mist",
            e,
            (0.5 + e.age * 1.4) * e.energy,
            0.5 + e.age * 0.7,
            tint,
          );
      } else if (e.kind === "blast") {
        const explosive =
          e.style === "rupture" || e.style === "armor" || e.style === "shred";
        if (e.age < 0.25)
          surface(
            "flash",
            e,
            (0.7 + e.age * 5) * e.energy,
            0.85,
            e.style === "acid" ? "#b0c369" : explosive ? "#ebad60" : "#b7432b",
            explosive ? 1 : 0.25,
          );
        if (explosive)
          surface(
            "ring",
            e,
            (0.15 + e.age * 6) * e.energy,
            0.035,
            e.style === "rupture" ? "#b89659" : "#b3b8a9",
          );
      } else if (e.age < 0.6 && e.kind !== "reward") {
        surface(
          "mist",
          e,
          0.25 + e.age * 0.8,
          0.8 + e.age * 0.3,
          e.kind === "armor" ? "#88887a" : tint,
          0.6,
        );
      }
    }
    for (const mesh of batches.all) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const data = mesh.geometry.getAttribute("fxData");
      if (data) data.needsUpdate = true;
    }
  });
  return (
    <group name="death-effects">
      {batches.all.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}
