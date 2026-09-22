import { useLayoutEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { presentedDistance } from "./presentation";
import { Simulation } from "../game/simulation";
import { weatheredTexture, streetTexture } from "./textures";
import {
  roadChunkZ,
  ROAD_CHUNK_LENGTH,
  ROAD_CHUNK_COUNT,
  SUN_OFFSET,
  SUN_TARGET,
  SHADOW_BOUNDS,
  FOG_FAR,
} from "./roadMath";

// All grounded geometry shares one world transform. No independent UV conveyor.
function makeStreet(truckSource: T.Group) {
  const root = new T.Group();
  const materials: T.Material[] = [];
  const material = (color: string, roughness = 0.9, textured = true) => {
    const m = new T.MeshStandardMaterial({
      color,
      roughness,
      map: textured ? weatheredTexture("concrete") : null,
    });
    materials.push(m);
    return m;
  };
  const roadTexture = streetTexture("asphalt");
  const asphalt = material("#7c8587", 0.86, false);
  asphalt.map = roadTexture;
  asphalt.bumpMap = roadTexture;
  asphalt.bumpScale = 0.035;
  const sidewalk = material("#89908b");
  sidewalk.map = streetTexture("paving");
  sidewalk.bumpMap = sidewalk.map;
  sidewalk.bumpScale = 0.025;
  const curb = material("#8a9085");
  const yellow = material("#c2ac69", 1, false);
  const white = material("#aeb7af", 1, false);
  const concrete = material("#69736f");
  const brick = material("#a28d79");
  brick.map = streetTexture("brick");
  brick.bumpMap = brick.map;
  brick.bumpScale = 0.045;
  const darkConcrete = material("#465753");
  const glass = material("#7297a4", 0.23, false);
  glass.map = streetTexture("glass");
  glass.metalness = 0.45;
  const steel = material("#354341", 0.65);
  const brass = material("#af9563", 0.48, false);
  brass.metalness = 0.5;
  const paint = material("#b1ada0", 0.8, false);
  const warning = material("#e5b95f", 0.78, false);
  const rubber = material("#273235", 0.95, false);
  const litGlass = material("#c4b28b", 0.38, false);
  litGlass.emissive.set("#e8bd79");
  litGlass.emissiveIntensity = 0.35;
  const rubble = material("#5b625b");
  const lamp = material("#e0c49b", 0.5, false);
  lamp.emissive.set("#f2b561");
  lamp.emissiveIntensity = 1.5;
  const ground = material("#3e4943");
  const stain = material("#303632", 0.95, false);
  const ownedGeometries: T.BufferGeometry[] = [];
  const matrix = new T.Matrix4();
  const pos = new T.Vector3(),
    scale = new T.Vector3();
  const quat = new T.Quaternion();
  const unit = new T.BoxGeometry(1, 1, 1);
  for (let index = 0; index < ROAD_CHUNK_COUNT; index++) {
    const chunk = new T.Group();
    // Full material identity AND shadow policy define a batch, never just color.
    const batches = new Map<
      string,
      { mat: T.Material; casts: boolean; geometries: T.BufferGeometry[] }
    >();
    const box = (
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      casts = true,
      angle = 0,
    ) => {
      const key = `${mat.uuid}:${casts}`;
      if (!batches.has(key)) batches.set(key, { mat, casts, geometries: [] });
      pos.set(x, y, z);
      scale.set(w, h, d);
      quat.setFromAxisAngle(T.Object3D.DEFAULT_UP, angle);
      matrix.compose(pos, quat, scale);
      const geometry = unit.clone();
      // Architectural textures use world scale; tall facades must not stretch
      // one giant brick pattern from ground to roof.
      if (mat === brick || mat === sidewalk) {
        const tile = mat === brick ? 2.4 : 4;
        const uv = geometry.getAttribute("uv");
        for (let vertex = 0; vertex < uv.count; vertex++) {
          const face = Math.floor(vertex / 4);
          const u = face < 2 ? d : w;
          const v = face < 2 ? h : face < 4 ? d : h;
          uv.setXY(
            vertex,
            (uv.getX(vertex) * u) / tile,
            (uv.getY(vertex) * v) / tile,
          );
        }
      }
      batches.get(key)!.geometries.push(geometry.applyMatrix4(matrix));
    };
    const addGeometry = (
      g: T.BufferGeometry,
      mat: T.Material,
      x: number,
      y: number,
      z: number,
      casts = true,
    ) => {
      const key = `${mat.uuid}:${casts}`;
      if (!batches.has(key)) batches.set(key, { mat, casts, geometries: [] });
      g.translate(x, y, z);
      batches.get(key)!.geometries.push(g);
    };
    // Solid road slab and raised sidewalks: no coincident transparent planes.
    box(ground, 0, -0.35, 0, 160, 0.3, 20, false);
    box(asphalt, 0, -0.1, 0, 10.5, 0.2, 20, false);
    for (const side of [-1, 1]) {
      box(sidewalk, side * 8.2, 0.02, 0, 5.8, 0.24, 20, false);
      box(curb, side * 5.4, 0.12, 0, 0.28, 0.24, 20, false);
      box(darkConcrete, side * 5.12, 0.006, 0, 0.24, 0.012, 20, false);
      for (let z = -9; z < 10; z += 2) {
        box(steel, side * 5.405, 0.245, z, 0.29, 0.008, 0.025, false);
        box(steel, side * 5.13, 0.021, z, 0.23, 0.014, 0.48, false);
        for (let slot = 0; slot < 4; slot++)
          box(
            curb,
            side * 5.13,
            0.032,
            z - 0.17 + slot * 0.11,
            0.18,
            0.012,
            0.035,
            false,
          );
      }
      box(yellow, side * 4.85, 0.008, 0, 0.075, 0.012, 20, false);
      // Buildings meet a continuous pavement, with plinths, bays, recessed
      // window bands, parapets and rooftop equipment instead of blank cubes.
      const height = 11 + ((index * 7 + (side + 1) * 3) % 5) * 3;
      const width = 7 + (index % 3);
      const x = side * (11.3 + width / 2);
      const facade =
        index % 3 === 0 ? brick : index % 3 === 1 ? concrete : darkConcrete;
      box(facade, x, height / 2 + 0.14, 0, width, height, 17.5);
      box(darkConcrete, x, 0.65, 0, width + 0.3, 1, 17.8);
      box(curb, x, height + 0.3, 0, width + 0.35, 0.32, 17.9);
      box(steel, x + side, height + 0.8, -3, 2, 1, 2.6);
      for (let floor = 0; floor < Math.floor((height - 2) / 2.6); floor++) {
        const y = 2.4 + floor * 2.6;
        // Road-facing bays, fully opaque dark glazing.
        for (let bay = 0; bay < 5; bay++) {
          const z = -6.8 + bay * 3.3;
          box(
            (floor + bay + index) % 11 === 0 ? litGlass : glass,
            side * 11.28,
            y,
            z,
            0.06,
            1.55,
            2.1,
            false,
          );
          box(steel, side * 11.21, y + 0.15, z, 0.12, 0.065, 2.1, false);
          box(curb, side * 11.2, y - 0.86, z, 0.24, 0.12, 2.3, false);
          box(steel, side * 11.22, y, z, 0.1, 1.55, 0.07, false);
        }
        for (let bay = 0; bay < 3; bay++) {
          const wx = x + (bay - 1) * 2.2;
          box(glass, wx, y, 8.78, 1.55, 1.55, 0.06, false);
          box(curb, wx, y - 0.86, 8.83, 1.8, 0.12, 0.16, false);
        }
      }
      // Stone piers and cornices articulate the full facade, plus a shopfront.
      for (const z of [-8.5, -2, 8.5])
        box(curb, side * 11.2, height / 2, z, 0.25, height, 0.28);
      for (const y of [3.3, height - 0.6])
        box(curb, side * 11.08, y, 0, 0.35, 0.18, 17.7);
      box(glass, side * 11.12, 1.55, -4.2, 0.16, 2.25, 5, false);
      for (const z of [-6.7, -4.2, -1.7])
        box(brass, side * 10.98, 1.55, z, 0.18, 2.35, 0.075, false);
      box(steel, side * 10.8, 2.9, -4.2, 0.8, 0.18, 5.4);
      box(brass, side * 10.38, 2.89, -4.2, 0.055, 0.1, 5.4, false);
      box(steel, side * 11.18, 1.3, 3.5, 0.15, 2.3, 2.5);
      box(curb, side * 10.6, 2.65, 3.5, 1.4, 0.16, 3.1);
      // Far blocks supply depth without hovering above a featureless plane.
      box(
        darkConcrete,
        side * 25,
        16 + (index % 4),
        1,
        12,
        32 + 2 * (index % 4),
        17,
      );
      box(concrete, side * 38, 22, 4, 10, 44, 13);
      // Curb-level barriers and debris have explicit ground contact.
      for (const z of [-6, 2]) {
        const barrier = new T.CylinderGeometry(
          0.36,
          0.65,
          0.82,
          4,
          1,
          false,
          Math.PI / 4,
        );
        barrier.scale(1, 1, 4.2);
        addGeometry(barrier, concrete, side * 6.15, 0.55, z);
        box(rubber, side * 6.15, 0.2, z, 0.86, 0.18, 3.65);
        for (const end of [-1, 1]) {
          box(
            warning,
            side * 5.83,
            0.76,
            z + end * 1.25,
            0.03,
            0.2,
            0.45,
            false,
          );
          box(paint, side * 5.81, 0.76, z + end * 1.25, 0.035, 0.2, 0.1, false);
        }
        box(curb, side * 6.15, 0.98, z, 0.72, 0.08, 3.6);
      }
      addGeometry(
        new T.CylinderGeometry(0.12, 0.18, 7.4, 8),
        steel,
        side * 7.8,
        3.85,
        -6,
      );
      box(steel, side * 7.8, 0.35, -6, 0.48, 0.42, 0.48);
      // A utility cabinet, vent grille, bollards and curb reflectors.
      box(steel, side * 9.9, 0.78, -7.7, 0.75, 1.25, 0.65);
      box(curb, side * 9.9, 1.44, -7.7, 0.82, 0.08, 0.72);
      for (let j = 0; j < 6; j++)
        box(rubber, side * 9.5, 0.6 + j * 0.1, -7.7, 0.03, 0.025, 0.45, false);
      for (const z of [-9, 8]) {
        addGeometry(
          new T.CylinderGeometry(0.085, 0.11, 0.75, 8),
          steel,
          side * 6.1,
          0.52,
          z,
        );
        addGeometry(
          new T.CylinderGeometry(0.09, 0.09, 0.12, 8),
          warning,
          side * 6.1,
          0.79,
          z,
          false,
        );
      }
      box(steel, side * 6.7, 7.5, -6, 2.3, 0.12, 0.14);
      box(lamp, side * 5.6, 7.4, -6, 0.75, 0.08, 0.32, false);
      for (let j = 0; j < 4; j++) {
        const h = 0.08 + (j % 3) * 0.05;
        box(
          rubble,
          side * (8.2 + (j % 2) * 1.1),
          0.14 + h / 2,
          -8 + j * 4.2,
          0.3 + j * 0.08,
          h,
          0.6,
          true,
          j * 0.7,
        );
      }
      box(steel, side * 7, 0.148, 6, 0.6, 0.012, 1.1, false);
      // Small opaque road wear patches do not cast false hovering shadows.
      box(stain, side * 4.1, 0.009, index % 2 ? 4 : -3, 0.3, 0.01, 1.8, false);
    }
    // Recessed service covers and patched asphalt read as grounded street detail.
    if (index % 2 === 0) {
      addGeometry(
        new T.CylinderGeometry(0.43, 0.43, 0.015, 24),
        steel,
        2.7,
        0.012,
        3,
        false,
      );
      addGeometry(
        new T.TorusGeometry(0.39, 0.015, 4, 24).rotateX(Math.PI / 2),
        curb,
        2.7,
        0.024,
        3,
        false,
      );
      for (let k = -2; k <= 2; k++)
        box(rubber, 2.7, 0.022, 3 + k * 0.11, 0.58, 0.009, 0.025, false);
    }
    for (const x of [-1.5, 1.5])
      for (const z of [-7.5, -2.5, 2.5, 7.5])
        box(white, x, 0.008, z, 0.07, 0.012, 2.3, false);
    for (const { mat, casts, geometries } of batches.values()) {
      const merged = mergeGeometries(geometries)!;
      geometries.forEach((g) => g.dispose());
      ownedGeometries.push(merged);
      const mesh = new T.Mesh(merged, mat);
      mesh.castShadow = casts;
      mesh.receiveShadow = true;
      chunk.add(mesh);
    }
    if (index % 3 === 1) {
      const truck = truckSource.clone(true);
      const side = index % 2 ? 1 : -1;
      truck.scale.setScalar(0.95);
      truck.rotation.y = side * 0.18;
      truck.position.set(side * 8.9, 0, -1);
      truck.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(truck);
      truck.position.y += 0.14 - bounds.min.y;
      truck.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      chunk.add(truck);
    }
    chunk.position.z = roadChunkZ(index, 0);
    root.add(chunk);
  }
  unit.dispose();
  return {
    root,
    dispose() {
      ownedGeometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
export function Environment({
  sim,
  quality,
}: {
  sim: Simulation;
  quality: string;
}) {
  const sunTarget = useMemo(() => {
    const o = new T.Object3D();
    o.position.set(...SUN_TARGET);
    return o;
  }, []);
  const truck = useGLTF("/assets/runtime/wreck-truck-lod.glb");
  const street = useMemo(() => makeStreet(truck.scene), [truck.scene]);
  useLayoutEffect(() => () => street.dispose(), [street]);
  useFrame(() => {
    street.root.children.forEach((chunk, i) => {
      chunk.position.z = roadChunkZ(i, presentedDistance(sim) * 2.5);
    });
  });
  return (
    <>
      <color attach="background" args={["#758786"]} />
      <fog attach="fog" args={["#758786", 55, FOG_FAR]} />
      <hemisphereLight args={["#b6d0d9", "#42473d", 2]} />
      <ambientLight intensity={0.35} />
      <directionalLight
        position={[12, 18, 8]}
        color="#c2d9e5"
        intensity={1.1}
      />
      <primitive object={sunTarget} />
      <directionalLight
        position={[
          SUN_TARGET[0] + SUN_OFFSET[0],
          SUN_TARGET[1] + SUN_OFFSET[1],
          SUN_TARGET[2] + SUN_OFFSET[2],
        ]}
        target={sunTarget}
        color="#ffd4a3"
        intensity={2.6}
        castShadow
        shadow-mapSize={quality === "high" ? [4096, 4096] : [2048, 2048]}
        shadow-camera-left={SHADOW_BOUNDS.left}
        shadow-camera-right={SHADOW_BOUNDS.right}
        shadow-camera-top={SHADOW_BOUNDS.top}
        shadow-camera-bottom={SHADOW_BOUNDS.bottom}
        shadow-camera-near={SHADOW_BOUNDS.near}
        shadow-camera-far={SHADOW_BOUNDS.far}
        shadow-bias={-0.00008}
        shadow-normalBias={0.06}
      />
      <primitive object={street.root} />
    </>
  );
}
