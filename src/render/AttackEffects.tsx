import { effectRandom } from "../game/deaths";
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { Enemy } from "../game/types";
import type { Simulation } from "../game/simulation";
import { activeMotion, motionReleaseTick } from "../game/attacks";

export function AttackEffects({
  enemy: e,
  sim,
  scale,
}: {
  enemy: Enemy;
  sim: Simulation;
  scale: number;
}) {
  const ring = useRef<T.Mesh>(null),
    spray = useRef<T.InstancedMesh>(null);
  const dummy = useMemo(() => new T.Object3D(), []);
  useFrame(() => {
    const m = activeMotion(e, sim.tick);
    if (ring.current) ring.current.visible = false;
    if (spray.current) spray.current.count = 0;
    if (!m) return;
    const after = (sim.tick - m.strike) / 60;
    const slam = m.kind === "slam" || m.kind === "strike";
    const scream = m.kind === "scream";
    if (
      ring.current &&
      after >= 0 &&
      after < 0.85 &&
      (slam || scream || m.kind === "summon")
    ) {
      const r = ring.current;
      r.visible = true;
      r.position.set(0, scream ? scale * 1.4 : 0.05, scream ? 0 : scale * 0.65);
      r.rotation.set(scream ? 0 : -Math.PI / 2, 0, 0);
      r.scale.setScalar(0.25 + after * (e.boss ? 8 : 4));
      const mat = r.material as T.MeshBasicMaterial;
      mat.opacity = (1 - after / 0.85) * 0.55;
      mat.color.set(scream ? "#c8d9a0" : "#bba37d");
    }
    if (!spray.current) return;
    const spit = m.kind === "pool";
    // Spit leaves the mouth during the windup and reaches the warned lane at strike.
    const flight = (sim.tick - motionReleaseTick(m)) / 27;
    if (m.kind === "burst" && after >= 0 && after < 0.12) {
      spray.current.count = 2;
      const from = new T.Vector3(0.2, scale * 1.12, scale * 0.4);
      const to = new T.Vector3((m.lane - 1) * 3 - e.x, 0.3, e.z);
      dummy.position.copy(from);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.13 * (1 - after / 0.12));
      dummy.updateMatrix();
      spray.current.setMatrixAt(0, dummy.matrix);
      dummy.position.copy(from).lerp(to, 0.5);
      dummy.lookAt(to);
      dummy.scale.set(0.025, 0.025, from.distanceTo(to) * 0.5);
      dummy.updateMatrix();
      spray.current.setMatrixAt(1, dummy.matrix);
      (spray.current.material as T.MeshStandardMaterial).color.set("#ffd085");
      spray.current.instanceMatrix.needsUpdate = true;
      return;
    }
    const visible = spit
      ? flight >= 0 && flight < 1
      : after >= 0 && after < 0.65;
    if (!visible || scream || m.kind === "charge" || m.kind === "burst") return;
    spray.current.count = 14;
    for (let i = 0; i < 14; i++) {
      const seed = e.id * 977 + m.strike;
      const random = effectRandom(seed, i);
      const a = random * Math.PI * 2;
      if (spit) {
        dummy.position.set(
          ((m.lane - 1) * 3 - e.x) * flight + Math.sin(a) * 0.25 * flight,
          (e.kind === "Broodmass" ? 0.95 : 1.45) * scale * (1 - flight) +
            Math.sin(flight * Math.PI) * 3 +
            Math.cos(a) * 0.12,
          scale * 0.4 + (e.z - scale * 0.4) * flight,
        );
        dummy.scale.setScalar(0.08 + (i % 3) * 0.025);
      } else {
        const spread =
          0.1 + random * 0.6 + after * (1.5 + effectRandom(seed, i + 18) * 4);
        dummy.position.set(
          Math.sin(a) * spread,
          0.07 +
            Math.sin((after / 0.65) * Math.PI) *
              (0.25 + effectRandom(seed, i + 30) * 0.8),
          scale * 0.65 + Math.cos(a) * spread,
        );
        dummy.scale.setScalar((1 - after / 0.65) * (e.boss ? 0.13 : 0.07));
      }
      dummy.rotation.set(a, after * (4 + random * 9), a + random);
      dummy.updateMatrix();
      spray.current.setMatrixAt(i, dummy.matrix);
    }
    (spray.current.material as T.MeshStandardMaterial).color.set(
      spit ? "#9fb55b" : "#857767",
    );
    spray.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh ref={ring} visible={false}>
        <ringGeometry args={[0.9, 1, 48]} />
        <meshBasicMaterial
          transparent
          opacity={0.5}
          depthWrite={false}
          side={T.DoubleSide}
        />
      </mesh>
      <instancedMesh
        ref={spray}
        args={[undefined, undefined, 14]}
        frustumCulled={false}
      >
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
    </group>
  );
}
