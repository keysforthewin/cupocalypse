import { useMemo, useRef, type RefObject } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ICON_SHAPES } from "../game/icons";
import { PICKUPS } from "../game/weapons";
import type { Drop, Pickup } from "../game/types";
import type { Simulation } from "../game/simulation";
import { presentedDistance } from "./presentation";

// Real silhouettes, polished housings and emissive inlays; three draw calls per icon.
function buildIcon(kind: Pickup) {
  const group = new T.Group();
  const color = PICKUPS[kind].color;
  const materials = [
    new T.MeshStandardMaterial({
      color: "#b7ced8",
      metalness: 0.72,
      roughness: 0.24,
    }),
    new T.MeshStandardMaterial({
      color: "#152735",
      metalness: 0.55,
      roughness: 0.35,
    }),
    new T.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.65,
      roughness: 0.24,
    }),
  ];
  const batches: T.BufferGeometry[][] = [[], [], []];
  const add = (
    g: T.BufferGeometry,
    m: number,
    x = 0,
    y = 0,
    z = 0,
    angle = 0,
  ) => {
    g.rotateZ(angle).translate(x, y, z);
    const geometry = g.index ? g.toNonIndexed() : g;
    if (geometry !== g) g.dispose();
    batches[m].push(geometry);
  };
  const box = (
    m: number,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    angle = 0,
  ) => add(new T.BoxGeometry(w, h, d), m, x, y, z, angle);
  const ring = (r: number, tube: number, m: number, x = 0, y = 0, z = 0) =>
    add(new T.TorusGeometry(r, tube, 8, 40), m, x, y, z);
  const shape = (points: number[][], m: number, depth: number, z = 0) => {
    const path = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
    add(
      new T.ExtrudeGeometry(path, {
        depth,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.035,
        bevelSegments: 2,
        steps: 1,
      }),
      m,
      0,
      0,
      z - depth / 2,
    );
  };
  const polygons = ICON_SHAPES[kind];
  if (polygons) {
    polygons.forEach((points, i) => {
      const normalized = points.map(([x, y]) => [(x - 12) / 15, (12 - y) / 15]);
      shape(normalized, i % 2 === 0 ? 0 : 2, 0.18, i * 0.035);
      const inset = normalized.map(([x, y]) => [x * 0.78, y * 0.78]);
      shape(inset, 2, 0.025, 0.13 + i * 0.035);
      shape(inset, 2, 0.025, -0.13);
    });
    if (kind === "saw" || kind === "gravity") {
      ring(
        kind === "saw" ? 0.29 : 0.39,
        0.09,
        1,
        kind === "gravity" ? 0.12 : 0,
        0,
        0.18,
      );
      ring(
        kind === "saw" ? 0.29 : 0.39,
        0.025,
        2,
        kind === "gravity" ? 0.12 : 0,
        0,
        -0.18,
      );
    }
  } else if (kind === "seeker") {
    for (const x of [-0.3, 0.3]) {
      add(new T.CylinderGeometry(0.13, 0.17, 0.75, 12), 0, x);
      add(new T.ConeGeometry(0.13, 0.3, 12), 2, x, 0.53);
      box(1, x, -0.3, 0, 0.4, 0.2, 0.18);
    }
  } else if (kind === "helix") {
    for (const x of [-0.24, 0.24]) {
      ring(0.4, 0.07, 2, x);
      add(new T.OctahedronGeometry(0.17), 0, x);
    }
  } else if (kind === "scatter") {
    for (let i = 0; i < 3; i++) {
      const g = new T.OctahedronGeometry(0.27);
      g.scale(0.65, 1.9, 0.7);
      add(g, 2, (i - 1) * 0.4, i === 1 ? 0.14 : 0, 0, (i - 1) * -0.3);
    }
  } else if (kind === "cursor") {
    add(new T.IcosahedronGeometry(0.3, 1), 2);
    ring(0.53, 0.04, 0);
    const r = new T.TorusGeometry(0.53, 0.04, 8, 32);
    r.rotateY(Math.PI / 2);
    add(r, 0);
  } else if (kind === "mortar") {
    add(new T.CapsuleGeometry(0.27, 0.45, 5, 16), 0);
    ring(0.35, 0.08, 2);
    box(1, 0, -0.48, 0, 0.72, 0.13, 0.36);
  } else if (kind === "spread") {
    for (const side of [-1, 0, 1]) {
      const bullet = new T.CylinderGeometry(0.13, 0.16, 0.65, 12);
      add(bullet, 0, side * 0.43, 0.05, 0, -side * 0.38);
      add(
        new T.ConeGeometry(0.13, 0.3, 12),
        2,
        side * 0.56,
        0.49,
        0,
        -side * 0.38,
      );
      box(1, side * 0.37, -0.27, 0, 0.29, 0.14, 0.31, -side * 0.38);
    }
    ring(0.74, 0.028, 2, 0, 0, -0.18);
  } else if (kind === "damage") {
    add(new T.CylinderGeometry(0.27, 0.22, 0.8, 12), 0);
    add(new T.ConeGeometry(0.27, 0.5, 12), 2, 0, 0.65);
    box(1, 0, -0.38, 0, 0.56, 0.16, 0.56);
    for (const x of [-0.35, 0.35]) box(0, x, -0.3, 0, 0.17, 0.5, 0.12, -x);
    for (const z of [-0.255, 0.255]) box(2, 0, 0.02, z, 0.11, 0.48, 0.04);
  } else if (kind === "rate") {
    ring(0.66, 0.1, 0);
    ring(0.66, 0.035, 2, 0, 0, 0.09);
    shape(
      [
        [0.1, 0.71],
        [-0.4, -0.06],
        [-0.06, -0.06],
        [-0.15, -0.68],
        [0.44, 0.16],
        [0.06, 0.16],
      ],
      2,
      0.18,
      0.12,
    );
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      box(1, Math.sin(a) * 0.66, Math.cos(a) * 0.66, 0, 0.16, 0.15, 0.25, -a);
    }
  } else if (kind === "shield") {
    shape(
      [
        [-0.62, 0.53],
        [0, 0.72],
        [0.62, 0.53],
        [0.52, -0.22],
        [0, -0.75],
        [-0.52, -0.22],
      ],
      0,
      0.2,
    );
    shape(
      [
        [-0.48, 0.43],
        [0, 0.57],
        [0.48, 0.43],
        [0.39, -0.17],
        [0, -0.58],
        [-0.39, -0.17],
      ],
      2,
      0.05,
      0.15,
    );
    box(0, 0, 0, 0.23, 0.12, 0.8, 0.06);
    box(0, 0, 0.12, 0.23, 0.58, 0.12, 0.06);
    // A second face keeps the shield readable throughout its rotation.
    box(2, 0, 0, -0.15, 0.12, 0.8, 0.05);
    box(2, 0, 0.12, -0.15, 0.58, 0.12, 0.05);
  } else if (kind === "hero") {
    add(new T.IcosahedronGeometry(0.37, 1), 2);
    for (const a of [-0.8, 0.8]) {
      const orbit = new T.TorusGeometry(0.69, 0.045, 8, 48);
      orbit.rotateY(a).rotateX(a);
      add(orbit, 0);
    }
    for (const side of [-1, 1]) {
      add(new T.OctahedronGeometry(0.17), 2, side * 0.7, 0.2 * side);
      box(0, side * 0.38, -0.5, 0, 0.17, 0.57, 0.19, -side * 0.65);
    }
  } else {
    ring(0.73, 0.08, 0);
    ring(0.73, 0.025, 2, 0, 0, 0.09);
    for (const x of [-0.4, 0, 0.4]) {
      const y = x === 0 ? 0.13 : -0.02;
      add(new T.SphereGeometry(0.13, 12, 8), 0, x, y + 0.22);
      box(2, x, y - 0.12, 0, 0.24, 0.36, 0.22);
      box(0, x, y - 0.34, 0, 0.28, 0.09, 0.25);
    }
  }
  batches.forEach((parts, i) => {
    if (!parts.length) return;
    const geometry = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    const mesh = new T.Mesh(geometry, materials[i]);
    mesh.castShadow = true;
    group.add(mesh);
  });
  return group;
}
// Extruding and merging an icon takes several milliseconds, so each kind is
// built once and every drop of that kind shares its geometry and materials.
const icons = new Map<Pickup, T.Group>();
export function pickupIcon(kind: Pickup) {
  let icon = icons.get(kind);
  if (!icon) icons.set(kind, (icon = buildIcon(kind)));
  return icon.clone();
}
/**
 * The ground ring and orbiting arc under a drop. The warm-up keeps a hidden
 * copy mounted: when the last drop leaves the road three.js deletes these
 * shaders, and the next drop would recompile them mid-run.
 */
export function PickupBase({
  color,
  orbit,
}: {
  color: string;
  orbit?: RefObject<T.Mesh | null>;
}) {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.6, 0.86, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.32}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh
        ref={orbit}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.055, 0]}
      >
        <torusGeometry args={[0.94, 0.025, 6, 48, Math.PI * 1.45]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </>
  );
}
export function PickupView({ drop, sim }: { drop: Drop; sim: Simulation }) {
  const root = useRef<T.Group>(null);
  const orbit = useRef<T.Mesh>(null);
  const icon = useMemo(() => ({ group: pickupIcon(drop.kind) }), [drop.kind]);
  const info = PICKUPS[drop.kind];
  useFrame(() => {
    if (root.current)
      root.current.position.set(
        drop.x,
        0,
        -drop.z - (sim.distance - presentedDistance(sim)) * 2.5,
      );
    icon.group.position.y = 1.28 + Math.sin(sim.time * 2.8 + drop.id) * 0.14;
    icon.group.rotation.set(
      0.12,
      sim.time * 1.35 + drop.id * 0.35,
      Math.sin(sim.time * 1.6) * 0.08,
    );
    if (orbit.current) orbit.current.rotation.z = -sim.time * 0.9;
  });
  return (
    <group ref={root} position={[drop.x, 0, -drop.z]}>
      <primitive object={icon.group} position={[0, 1.28, 0]} />
      <PickupBase color={info.color} orbit={orbit} />
      <Html
        center
        position={[0, 2.65, 0]}
        distanceFactor={25}
        zIndexRange={[7, 0]}
      >
        <div
          className="pickup-label"
          style={{ borderColor: info.color, color: info.color }}
        >
          {info.name}
          <small>{info.detail}</small>
        </div>
      </Html>
    </group>
  );
}
