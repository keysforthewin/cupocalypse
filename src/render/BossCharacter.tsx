import { Component, type ReactNode, useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as T from "three";
import type { Enemy, Hazard } from "../game/types";
import type { Simulation } from "../game/simulation";
import { activeMotion, motionReleaseTick } from "../game/attacks";
import { bossDefinition, bossProjectilePosition } from "../game/bosses";
export const bossModelUrl = (id: string, quality: string) =>
  `/assets/bosses/${id}${quality === "performance" ? "-lod" : ""}.glb?v=quality2`;
const assetUsers = new Map<string, number>();

export class BossAssetBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("Boss asset unavailable", error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function BossFallback({
  enemy: e,
  sim,
}: {
  enemy: Enemy;
  sim: Simulation;
}) {
  const d = bossDefinition(e.kind);
  return (
    <group>
      <mesh
        position={[e.x, d.height * 0.4, -e.z - d.visualZ]}
        scale={[d.span * 0.3, d.height * 0.5, d.span * 0.15]}
      >
        <icosahedronGeometry args={[1, 2]} />
        <meshStandardMaterial color={d.color} wireframe fog={false} />
      </mesh>
      <NerveAnchors enemy={e} sim={sim} />
    </group>
  );
}

export function BossCharacter({
  enemy: e,
  sim,
  quality,
}: {
  enemy: Enemy;
  sim: Simulation;
  quality: string;
}) {
  const d = bossDefinition(e.kind);
  const url = bossModelUrl(d.id, quality);
  const asset = useGLTF(url);
  const model = useMemo(() => {
    const m = clone(asset.scene);
    m.name = `boss-${d.id}-${e.id}`;
    m.traverse((o) => {
      if (o instanceof T.Mesh) {
        o.frustumCulled = false;
        o.castShadow = true;
        o.receiveShadow = true;
        o.material = Array.isArray(o.material)
          ? o.material.map((x) => x.clone())
          : o.material.clone();
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          material.fog = false;
          const standard = material as T.MeshStandardMaterial;
          if (standard.emissive)
            material.userData.bossEmission = [
              ...standard.emissive.toArray(),
              standard.emissiveIntensity,
            ];
        }
      }
    });
    return m;
  }, [asset.scene, d.id, e.id]);
  const mixer = useMemo(() => new T.AnimationMixer(model), [model]);
  const actions = useMemo(
    () =>
      Object.fromEntries(
        asset.animations.map((c) => {
          const name = c.name
            .split(":")
            .at(-1)!
            .replace(/\.\d+$/, "");
          const clip =
            name === "transform"
              ? T.AnimationUtils.makeClipAdditive(c.clone(), 0)
              : c;
          return [name, mixer.clipAction(clip)];
        }),
      ),
    [asset.animations, mixer],
  );
  const deathTime = useRef(0);
  const stagger = useRef({ until: 0, start: 0 });
  const mounted = useRef<T.Object3D | null>(null);
  useEffect(() => {
    assetUsers.set(url, (assetUsers.get(url) ?? 0) + 1);
    return () => {
      assetUsers.set(url, (assetUsers.get(url) ?? 1) - 1);
      queueMicrotask(() => {
        if (assetUsers.get(url) !== 0) return;
        assetUsers.delete(url);
        useGLTF.clear(url);
        const textures = new Set<T.Texture>();
        asset.scene.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.geometry.dispose();
            for (const mat of Array.isArray(o.material)
              ? o.material
              : [o.material]) {
              for (const value of Object.values(mat))
                if (value instanceof T.Texture) textures.add(value);
              mat.dispose();
            }
          }
        });
        for (const t of textures) t.dispose();
      });
    };
  }, [url, asset.scene]);
  useEffect(() => {
    mounted.current = model;
    return () => {
      mounted.current = null;
      queueMicrotask(() => {
        if (mounted.current === model) return;
        mixer.stopAllAction();
        mixer.uncacheRoot(model);
        model.traverse((o) => {
          if (o instanceof T.Mesh) {
            for (const m of Array.isArray(o.material)
              ? o.material
              : [o.material])
              m.dispose();
            if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
          }
        });
      });
    };
  }, [model, mixer]);
  useFrame((_, delta) => {
    let name = "idle",
      time = sim.tick / 60;
    const motion = activeMotion(e, sim.tick);
    if (e.dead) {
      if (sim.over && !document.hidden)
        deathTime.current = Math.min(
          6,
          deathTime.current + Math.min(delta, 0.1),
        );
      name = "death";
      time = sim.over
        ? deathTime.current
        : (sim.tick - (e.deathTick ?? sim.tick)) / 60;
    } else if (sim.tick - e.phaseTick < 120) {
      name = "idle";
      time = 0;
    } else if (e.age < 2) {
      name = "entrance";
      time = e.age;
    } else if ((e.staggerUntil ?? 0) > sim.tick) {
      if (stagger.current.until !== e.staggerUntil)
        stagger.current = { until: e.staggerUntil!, start: sim.tick };
      name = "stagger";
      time = (sim.tick - stagger.current.start) / 60;
    } else if (motion?.clip) {
      name = motion.clip;
      const release = motionReleaseTick(motion);
      time =
        sim.tick <= release
          ? (1.2 * (sim.tick - motion.start)) /
            Math.max(1, release - motion.start)
          : 1.2 + (sim.tick - release) / 60;
    }
    for (const [key, action] of Object.entries(actions)) {
      action.enabled = key === name;
      action.setEffectiveWeight(key === name ? 1 : 0);
      if (key === name) {
        action.play();
        action.paused = true;
        action.time =
          name === "idle"
            ? time % action.getClip().duration
            : Math.min(action.getClip().duration, Math.max(0, time));
      }
    }
    const transform = actions.transform;
    if (transform && e.phase > 1 && !e.dead) {
      transform.enabled = true;
      transform.play();
      transform.paused = true;
      transform.setEffectiveWeight(e.phase === 3 ? 1.65 : 1);
      transform.time = Math.min(
        transform.getClip().duration,
        Math.max(0, (sim.tick - e.phaseTick) / 60),
      );
    }
    mixer.update(0);
    model.position.set(e.x, 0, -e.z - d.visualZ);
    model.traverse((o) => {
      // Multi-material GLBs can export the aperture as a group of mesh primitives.
      if (o.name.includes("living-core")) o.visible = e.phase > 1;
      if (o instanceof T.Mesh) {
        for (const material of Array.isArray(o.material)
          ? o.material
          : [o.material]) {
          const m = material as T.MeshStandardMaterial;
          if (m.emissive) {
            const base = m.userData.bossEmission as number[] | undefined;
            if (e.hit > sim.tick) {
              m.emissive.set(d.color);
              m.emissiveIntensity = 0.5;
            } else {
              m.emissive.setRGB(base?.[0] ?? 0, base?.[1] ?? 0, base?.[2] ?? 0);
              m.emissiveIntensity =
                (base?.[3] ?? 0) *
                (o.name.includes("living-core")
                  ? 1 + Math.sin(sim.tick * 0.045) * 0.15
                  : 1);
            }
          }
        }
      }
    });
  });
  return (
    <group>
      <primitive object={model} />
      <pointLight
        position={[
          -d.span * 0.25,
          d.height * 0.85,
          -e.z - d.visualZ + d.height * 0.8,
        ]}
        intensity={d.height * d.height * 4}
        distance={d.height * 2.5}
        decay={2}
        color="#ffe3c5"
      />
      <pointLight
        position={[
          d.span * 0.4,
          d.height * 0.55,
          -e.z - d.visualZ - d.height * 0.3,
        ]}
        intensity={d.height * d.height * 2}
        distance={d.height * 2}
        decay={2}
        color={d.color}
      />
      {!e.dead && <NerveAnchors enemy={e} sim={sim} />}
    </group>
  );
}

function NerveAnchors({ enemy: e, sim }: { enemy: Enemy; sim: Simulation }) {
  const d = bossDefinition(e.kind),
    root = useRef<T.Group>(null);
  const paths = useMemo(
    () =>
      [-3, 0, 3].map(
        (x) =>
          new T.CatmullRomCurve3([
            new T.Vector3(x, 0.7, -e.z),
            new T.Vector3(x * 1.3, 1.8, -e.z - 5),
            new T.Vector3(x * 2, 2, -e.z - d.visualZ * 0.55),
            new T.Vector3(x, d.height * 0.3, -e.z - d.visualZ),
          ]),
      ),
    [d, e.z],
  );
  useFrame(() => {
    if (root.current)
      root.current.scale.y = 1 + Math.sin(sim.tick * 0.065) * 0.07;
  });
  return (
    <group ref={root} name="boss-damage-anchors">
      {paths.map((path, i) => (
        <group key={i}>
          <mesh>
            <tubeGeometry args={[path, 24, 0.1, 6, false]} />
            <meshStandardMaterial color="#4d3538" roughness={0.48} />
          </mesh>
          <mesh position={[(i - 1) * 3, 0.6, -e.z]} scale={[0.3, 0.55, 0.3]}>
            <icosahedronGeometry args={[1, 2]} />
            <meshStandardMaterial
              color="#37282b"
              emissive={d.color}
              emissiveIntensity={0.14}
              metalness={0.2}
              roughness={0.58}
            />
          </mesh>
          <mesh position={[(i - 1) * 3, 0.6, -e.z]} scale={[0.55, 0.8, 0.5]}>
            <torusGeometry args={[0.7, 0.18, 8, 20]} />
            <meshStandardMaterial color="#9a9182" roughness={0.8} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Ordnance({
  hazard: h,
  sim,
  lane,
}: {
  hazard: Hazard;
  sim: Simulation;
  lane: number;
}) {
  const ref = useRef<T.Group>(null),
    trail = useRef<T.Mesh>(null);
  const boss = sim.enemies.find((e) => e.id === h.source),
    color = boss ? bossDefinition(boss.kind)?.color : "#efb48c";
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.visible = sim.tick >= (h.releaseAt ?? h.strikeAt) && sim.tick <= h.endAt;
    const [x, y, z] = bossProjectilePosition(h, lane, sim.tick);
    g.position.set(x, y, -z);
    g.rotation.set(sim.tick * 0.06, 0, sim.tick * 0.025);
    const after = Math.max(0, (sim.tick - h.strikeAt) / 60);
    g.scale.setScalar(after ? 1 + after * 7 : 1);
    if (trail.current) {
      const previous = bossProjectilePosition(
        h,
        lane,
        Math.max(h.releaseAt ?? 0, sim.tick - 5),
      );
      const a = new T.Vector3(previous[0], previous[1], -previous[2]),
        b = new T.Vector3(x, y, -z);
      trail.current.visible = g.visible && sim.tick < h.strikeAt;
      trail.current.position.copy(a).lerp(b, 0.5);
      trail.current.lookAt(b);
      trail.current.scale.set(0.09, 0.09, a.distanceTo(b));
    }
  });
  return (
    <>
      <group ref={ref}>
        {h.trajectory === "wave" ? (
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.8, 0.13, 8, 24]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={1.4}
            />
          </mesh>
        ) : (
          <mesh
            scale={
              h.trajectory === "spear" ? [0.15, 0.15, 1.2] : [0.45, 0.45, 0.45]
            }
          >
            <icosahedronGeometry args={[1, 1]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={1.4}
            />
          </mesh>
        )}
        {h.trajectory === "split" &&
          [-1, 1].map((sign) => (
            <mesh key={sign} position={[sign * 0.55, 0, 0]} scale={0.2}>
              <octahedronGeometry />
              <meshStandardMaterial color={color} emissive={color} />
            </mesh>
          ))}
      </group>
      <mesh ref={trail}>
        <boxGeometry />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
    </>
  );
}

export function BossOrdnance({ sim }: { sim: Simulation }) {
  return (
    <group name="boss-ordnance">
      {sim.hazards
        .filter((h) => h.trajectory)
        .flatMap((h) =>
          h.lanes.map((lane) => (
            <Ordnance
              key={`${h.id}-${lane}`}
              hazard={h}
              lane={lane}
              sim={sim}
            />
          )),
        )}
      {sim.hazards
        .filter((h) => h.attack && !h.trajectory)
        .flatMap((h) =>
          h.lanes.map((lane) => (
            <GroundStrike
              key={`${h.id}-${lane}`}
              hazard={h}
              lane={lane}
              sim={sim}
            />
          )),
        )}
    </group>
  );
}

function GroundStrike({
  hazard: h,
  lane,
  sim,
}: {
  hazard: Hazard;
  lane: number;
  sim: Simulation;
}) {
  const root = useRef<T.Group>(null),
    ring = useRef<T.Mesh>(null);
  useFrame(() => {
    if (!root.current) return;
    const t = (sim.tick - h.strikeAt) / 60;
    root.current.visible = t >= 0 && t < 0.7;
    root.current.position.set((lane - 1) * 3, 0.08, -sim.crowd.push * 0.35);
    if (ring.current) {
      ring.current.scale.setScalar(0.2 + Math.max(0, t) * 10);
      (ring.current.material as T.MeshBasicMaterial).opacity = Math.max(
        0,
        0.65 - t,
      );
    }
  });
  return (
    <group ref={root}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.85, 1, 48]} />
        <meshBasicMaterial
          color="#e6b18a"
          transparent
          depthWrite={false}
          side={T.DoubleSide}
        />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[Math.sin(i * 2.4) * 0.9, 0.15, Math.cos(i * 2.4) * 2]}
          rotation={[i, 0.2, i * 0.7]}
          scale={[0.1, 0.5, 0.16]}
        >
          <tetrahedronGeometry />
          <meshStandardMaterial color="#847165" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}
