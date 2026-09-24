import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { SUPERS, type SuperId } from "../game/superWeapons";
import type { Simulation } from "../game/simulation";
import type { SuperCast } from "../game/superSystem";
import {
  superPreviewFraming,
  SUPER_PREVIEW_HEIGHT,
  SUPER_PREVIEW_SWAY,
} from "./superPreviewFraming";
import { SuperSignatureDetails } from "./SuperSignatureDetails";
import { SuperGround, SuperVolume, SuperImpactEffects } from "./SuperVfx";
import { superModel, disposeSuperModel } from "./superModels";

function Identity({
  id,
  preview = false,
  sim,
  cast,
}: {
  id: SuperId;
  preview?: boolean;
  sim?: Simulation;
  cast?: SuperCast;
}) {
  const model = useMemo(() => superModel(id), [id]);
  const { size, camera } = useThree();
  const motion = useRef<T.Group>(null);
  const fit = useMemo(
    () => superPreviewFraming(model, id, size.width / size.height),
    [model, id, size.width, size.height],
  );
  useEffect(() => {
    if (preview && camera instanceof T.OrthographicCamera) {
      camera.zoom = size.height / SUPER_PREVIEW_HEIGHT;
      camera.updateProjectionMatrix();
    }
  }, [camera, preview, size.height]);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(() => () => disposeSuperModel(model), [model]);
  useFrame(({ clock }) => {
    if (id === "panda" && sim && cast) {
      const remaining = (cast.end - sim.tick) / 60;
      const clap = reduced
        ? remaining <= 0
          ? 1
          : 0
        : 1 - T.MathUtils.smoothstep(remaining, 0.015, 0.32);
      for (const rig of model.children)
        if (rig.userData.rig === "panda-arm") {
          rig.rotation.z = -rig.userData.side * clap * 0.94;
          rig.position.z = 0.04 + clap * 0.53;
        }
    }
    if (preview && !reduced && motion.current) {
      const t = clock.elapsedTime;
      motion.current.rotation.y =
        fit.yaw + Math.sin(t * 0.35) * SUPER_PREVIEW_SWAY;
      motion.current.position.y = Math.sin(t * 1.1) * 0.035;
    }
  });
  return preview ? (
    <group ref={motion} scale={fit.scale} rotation={[fit.pitch, fit.yaw, 0]}>
      <group position={fit.center.clone().multiplyScalar(-1)}>
        <primitive object={model} />
      </group>
    </group>
  ) : (
    <primitive object={model} />
  );
}
function PreviewStudio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new T.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const target = generator.fromScene(room, 0.04);
    scene.environment = target.texture;
    scene.environmentIntensity = 0.8;
    return () => {
      scene.environment = null;
      target.dispose();
      room.dispose();
      generator.dispose();
    };
  }, [gl, scene]);
  return (
    <>
      <ambientLight intensity={0.32} />
      <directionalLight position={[-3, 5, 4]} intensity={3.2} color="#fff1db" />
      <directionalLight position={[4, 1, -2]} intensity={4} color="#a8d8ff" />
      <directionalLight position={[0, -3, 3]} intensity={0.7} />
    </>
  );
}
export function SuperPreview({ id }: { id: SuperId }) {
  return (
    <Canvas
      orthographic
      dpr={[1, 2]}
      camera={{ position: [0, 0, 12], zoom: 46 }}
      gl={{ alpha: true, antialias: true }}
    >
      <PreviewStudio />
      <Identity key={id} id={id} preview />
    </Canvas>
  );
}
export function CastEffect({
  sim,
  cast: c,
}: {
  sim: Simulation;
  cast: SuperCast;
}) {
  const ref = useRef<T.Group>(null),
    shape = useRef<T.Group>(null);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useFrame(() => {
    if (!ref.current || !shape.current) return;
    const t = (sim.tick - c.start) / 60,
      remaining = (c.end - sim.tick) / 60;
    const target = sim.enemies.find((e) => e.id === c.target && !e.dead);
    const e = sim.supers.events
      .slice()
      .reverse()
      .find((e) => e.id === c.id && e.kind === "hit" && e.tick >= c.start);
    let x = sim.x,
      z = 8,
      y = 3,
      scale = 0.78;
    if (["mortal", "five10"].includes(c.id)) {
      x = 0;
      z = 20;
      y = 6;
      scale = c.id === "mortal" ? 2.5 : 0.9;
    }
    if (c.id === "nemesis" && target) {
      x = target.x;
      z = target.z;
      y = target.boss ? 5 : 2;
      scale = target.boss ? 2 : 1.2;
    }
    if (c.id === "tuna") {
      x = 0;
      z = Math.min(48, t * 16);
      y = 1.8 + Math.sin(Math.min(1, t / 3) * Math.PI) * 3;
      scale = 1.6;
    }
    if (c.id === "bronze-leopard" && e) {
      x = e.tx ?? e.x;
      z = e.tz ?? e.z;
      const next =
        sim.supers.targets().find((target) => !target.boss) ||
        sim.supers.targets()[0];
      const leap =
        !reduced && c.count < 6 && next
          ? T.MathUtils.smoothstep(sim.tick - e.tick, 13, 24)
          : 0;
      if (next) {
        x = T.MathUtils.lerp(x, next.x, leap);
        z = T.MathUtils.lerp(z, next.z, leap);
      }
      y = 1.1 + Math.sin(leap * Math.PI) * 1.8;
      scale = 1.5;
    }
    if (c.id === "rae") {
      x = sim.aim;
      z = 3;
      y = 2.4;
      scale = 1.4;
    }
    if (
      [
        "panda",
        "meesh",
        "mmiguel",
        "pokey",
        "doc",
        "pauly",
        "nitro",
        "gimmy",
      ].includes(c.id)
    ) {
      z = sim.crowd.push + 1;
      y = c.id === "panda" ? 4 : 2.5;
      scale = c.id === "panda" ? 1.7 : c.id === "mmiguel" ? 1.55 : 0.85;
      if (c.id === "mmiguel") y = 1.5;
    }
    if (["hondo", "shannondoa", "kuttula", "baezil"].includes(c.id)) {
      x = 0;
      z = 15;
      y = 1.5;
      scale = 0.85;
    }
    shape.current.visible =
      c.id !== "kismet" && (c.id !== "nemesis" || !!target);
    ref.current.position.set(x, y, -z);
    const entrance = Math.min(1, t * 7 + 0.1),
      exit =
        c.id === "panda"
          ? 1 - T.MathUtils.smoothstep(-remaining, 0.05, 0.36)
          : Math.min(1, remaining * 4);
    shape.current.scale.setScalar(scale * Math.max(0.01, entrance * exit));
    shape.current.rotation.y = [
      "tuna",
      "bronze-leopard",
      "panda",
      "platypus",
    ].includes(c.id)
      ? 0
      : reduced
        ? 0
        : Math.sin(t * 1.4) * 0.12;
    if (c.id === "mortal")
      shape.current.rotation.z =
        -0.35 - T.MathUtils.smoothstep(t, 0.42, 0.86) * 1.6;
    else shape.current.rotation.z = 0;
    if (c.id === "machinegunqueen") {
      shape.current.rotation.y = e
        ? Math.atan2((e.tx ?? x) - x, -((e.tz ?? z + 10) - z))
        : Math.PI;
      shape.current.position.z =
        e && !reduced ? Math.exp(-(sim.tick - e.tick) * 0.6) * 0.1 : 0;
    }
    if (c.id === "so1ician" && e && sim.tick - e.tick < 24) {
      ref.current.position.set(e.tx ?? e.x, 2.7, -(e.tz ?? e.z));
      shape.current.rotation.z = reduced
        ? 0
        : Math.sin(((sim.tick - e.tick) / 24) * Math.PI) * -0.55;
    }
    if (["shannondoa", "kuttula", "hondo", "five10", "baezil"].includes(c.id))
      shape.current.scale.multiplyScalar(0.65 + 0.35 * Math.exp(-t * 2));
    if (c.id === "tuna")
      shape.current.scale.multiplyScalar(
        1 - T.MathUtils.smoothstep(t, 2.8, 3.5),
      );
  });
  return (
    <>
      <group ref={ref}>
        <group ref={shape}>
          <Identity id={c.id} sim={sim} cast={c} />
        </group>
      </group>
      <SuperGround sim={sim} cast={c} />
      <SuperVolume sim={sim} cast={c} />
      <SuperSignatureDetails sim={sim} cast={c} />
    </>
  );
}
function ChargeMotes({ sim }: { sim: Simulation }) {
  const { camera, size } = useThree(),
    group = useRef<T.Group>(null);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useFrame(() => {
    if (!group.current) return;
    const events = sim.supers.events
      .filter((e) => e.kind === "charge" && sim.tick - e.tick < 30)
      .slice(-18);
    group.current.children.forEach((o, i) => {
      const e = events[i];
      o.visible = !!e && !reduced;
      if (!e) return;
      const u = (sim.tick - e.tick) / 30;
      const world = new T.Vector3(e.x, 1, -e.z).project(camera);
      world.lerp(
        new T.Vector3(0, -1 + (2 * 100) / size.height, world.z),
        u * u,
      );
      o.position.copy(world.unproject(camera));
      o.scale.setScalar(0.035 + Math.sin(u * Math.PI) * 0.07);
      (o as T.Mesh).material instanceof T.MeshBasicMaterial &&
        ((o as T.Mesh).material as T.MeshBasicMaterial).color.set(
          SUPERS[e.id].color,
        );
    });
  });
  return (
    <group ref={group}>
      {Array.from({ length: 18 }, (_, i) => (
        <mesh key={i} renderOrder={50}>
          <sphereGeometry args={[1, 6, 4]} />
          <meshBasicMaterial depthTest={false} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
function CameraKick({ sim }: { sim: Simulation }) {
  const { camera } = useThree();
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useFrame(() => {
    if (reduced) return;
    const last = sim.supers.events
      .slice()
      .reverse()
      .find((e) => e.kind === "fire");
    const age = last ? (sim.tick - last.tick) / 60 : 10;
    const kick = age < 0.35 ? Math.sin(age * 70) * (0.35 - age) * 0.24 : 0;
    camera.position.x = kick;
    camera.position.y = 16 + Math.abs(kick);
  });
  return null;
}
export function SuperWeaponEffects({
  sim,
  quality,
}: {
  sim: Simulation;
  quality: string;
}) {
  return (
    <>
      <CameraKick sim={sim} />
      {[
        ...sim.supers.casts,
        ...[...sim.supers.archive.values()].filter(
          (c) => c.id === "panda" && c.end <= sim.tick && sim.tick - c.end < 22,
        ),
      ].map((c) => (
        <CastEffect key={c.serial} sim={sim} cast={c} />
      ))}
      <EnemySuperStates sim={sim} />
      <SuperImpactEffects sim={sim} quality={quality} />
      <ChargeMotes sim={sim} />
    </>
  );
}

/** Status markers are instanced independently of the headline weapon silhouette. */
function EnemySuperStates({ sim }: { sim: Simulation }) {
  const cages = useRef<T.InstancedMesh>(null),
    locks = useRef<T.InstancedMesh>(null),
    seeds = useRef<T.InstancedMesh>(null);
  const dummy = useMemo(() => new T.Object3D(), []);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const lockGeometry = useMemo(() => {
    const shackle = new T.TorusGeometry(
      0.48,
      0.09,
      8,
      24,
      Math.PI * 1.65,
    ).toNonIndexed();
    shackle.rotateZ(-0.35);
    shackle.translate(0, 0.28, 0);
    const body = new T.BoxGeometry(0.91, 0.64, 0.18).toNonIndexed();
    body.translate(0, -0.36, 0);
    const geometry = mergeGeometries([shackle, body])!;
    shackle.dispose();
    body.dispose();
    return geometry;
  }, []);
  useEffect(() => () => lockGeometry.dispose(), [lockGeometry]);

  useFrame(() => {
    const clock = sim.supers.active("sybex"),
      key = sim.supers.active("keys"),
      berry = sim.supers.active("strawberry");
    let nc = 0,
      nk = 0,
      ns = 0;
    for (const e of sim.enemies) {
      if (e.dead || e.z < 0 || e.z > 48) continue;
      const radius = e.boss ? 2.8 : 0.85;
      if (
        clock &&
        (!e.boss || sim.tick - (clock.bossSeen.get(e.id) ?? sim.tick) < 120) &&
        nc < 128
      ) {
        dummy.position.set(e.x, e.boss ? 2.5 : 1, -e.z);
        dummy.rotation.set(0, reduced ? 0 : Math.sin(sim.time) * 0.07, 0);
        dummy.scale.set(radius * 1.4, e.boss ? 5 : 2.3, radius * 1.4);
        dummy.updateMatrix();
        cages.current?.setMatrixAt(nc++, dummy.matrix);
      }
      if (key && nk < 128) {
        dummy.position.set(e.x, e.boss ? 5.5 : 2.2, -e.z);
        dummy.rotation.set(-0.2, reduced ? 0 : Math.sin(sim.time) * 0.3, -0.2);
        dummy.scale.setScalar(radius * 0.55);
        dummy.updateMatrix();
        locks.current?.setMatrixAt(nk++, dummy.matrix);
      }
      if (berry?.seeds.some((seed) => seed.target === e.id) && ns < 128) {
        dummy.position.set(e.x, 1.3, -e.z);
        dummy.rotation.set(0, reduced ? 0 : sim.time * 1.5, 0);
        dummy.scale.setScalar(
          0.25 + (reduced ? 0 : Math.sin(sim.time * 5) * 0.04),
        );
        dummy.updateMatrix();
        seeds.current?.setMatrixAt(ns++, dummy.matrix);
      }
    }
    for (const [ref, count] of [
      [cages, nc],
      [locks, nk],
      [seeds, ns],
    ] as const) {
      if (ref.current) {
        ref.current.count = count;
        ref.current.instanceMatrix.needsUpdate = true;
      }
    }
  });
  return (
    <>
      <instancedMesh
        ref={cages}
        args={[undefined, undefined, 128]}
        frustumCulled={false}
      >
        <boxGeometry />
        <shaderMaterial
          transparent
          depthWrite={false}
          side={T.DoubleSide}
          blending={T.AdditiveBlending}
          vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.); }`}
          fragmentShader={`varying vec2 vUv;void main(){vec2 e=min(vUv,1.-vUv);float edge=1.-smoothstep(.008,.018,min(e.x,e.y));float corner=step(.36,max(abs(vUv.x-.5),abs(vUv.y-.5)));float a=edge*(.16+corner*.5);gl_FragColor=vec4(.35,.72,1.,a);}`}
        />
      </instancedMesh>
      <instancedMesh
        ref={locks}
        args={[undefined, undefined, 128]}
        frustumCulled={false}
      >
        <primitive object={lockGeometry} attach="geometry" />
        <meshBasicMaterial color="#e9bf61" toneMapped={false} />
      </instancedMesh>
      <instancedMesh
        ref={seeds}
        args={[undefined, undefined, 128]}
        frustumCulled={false}
      >
        <octahedronGeometry />
        <meshBasicMaterial color="#ff5278" toneMapped={false} />
      </instancedMesh>
    </>
  );
}
