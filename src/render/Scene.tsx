import {
  bossModelUrl,
  BossCharacter,
  BossOrdnance,
  BossAssetBoundary,
  BossFallback,
} from "./BossCharacter";
import { isNewBoss, bossDefinition } from "../game/bosses";
import { SuperWeaponEffects } from "./SuperWeaponEffects";
import {
  ARMY_RENDER_BUDGET,
  soldierPosition,
  crowdEnvelope,
  edgeExposure,
} from "../game/formation";
import { DeathEffects } from "./DeathEffects";
import { characterPose } from "./motion";
import { squadMaterial, advanceSquadMotion } from "./squadMotion";
import { frameSquadRear } from "./squadFraming";
import { PickupView } from "./Pickups";
import { Projectiles } from "./Projectiles";
import { GATE_CENTER, GATE_WIDTH, selectedGate } from "../game/gateLayout";
import { presentedX, presentedCrowdX, presentedDistance } from "./presentation";
import {
  Suspense,
  memo,
  useMemo,
  useRef,
  useLayoutEffect,
  useEffect,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, Text, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as T from "three";
import { Environment } from "./Environment";
import { Simulation, LANES, formationPositions } from "../game/simulation";
import { humanoid } from "./models";
import { Character } from "./Character";
import assets from "./assets.json";
import { Barricade } from "./Barricade";
import { BOSSES } from "../game/types";
import type { Enemy, Gate, Hazard } from "../game/types";
const font = "/assets/BarlowCondensed-Bold.woff";
function Unit({ enemy: e, sim }: { enemy: Enemy; sim: Simulation }) {
  const model = useMemo(() => humanoid(e.kind), [e.kind]);
  const assetKind =
    !e.boss && e.maxArmor > 0 && e.armor <= 0
      ? e.kind === "Bulwark"
        ? "charger"
        : e.kind === "Riot Guard"
          ? "runner"
          : e.kind.toLowerCase().replaceAll(" ", "-")
      : e.kind.toLowerCase().replaceAll(" ", "-");
  const url = (assets as Record<string, string>)[assetKind]?.replace(
    ".glb",
    e.z > 32 && !e.boss ? "-lod.glb" : ".glb",
  );
  const ref = useRef<T.Group>(null);
  const buff = useRef<T.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(e.x, 0, -e.z);
    if (buff.current) {
      buff.current.visible = e.buffUntil > sim.tick;
      (buff.current.material as T.MeshBasicMaterial).opacity =
        0.1 + 0.08 * Math.sin(sim.time * 10);
    }
    if (!model.parent) return;
    const { limbs, torso, armor } = model.userData;
    const pose = characterPose(e, sim.tick);
    const names = ["armL", "legL", "armR", "legR"];
    limbs.forEach((limb: T.Group, i: number) =>
      limb.rotation.set(...pose.joints[names[i]]),
    );
    torso.rotation.set(...pose.joints.spine);
    armor.visible = e.armor > 0;
    model.position.y = pose.y;
    model.rotation.y = pose.turn;
  });
  return (
    <group ref={ref} position={[e.x, 0, -e.z]}>
      {url ? (
        <Suspense fallback={<primitive object={model} />}>
          <Character url={url} enemy={e} sim={sim} />
        </Suspense>
      ) : (
        <primitive object={model} />
      )}
      {(e.boss ||
        (e.z < 26 &&
          !sim.enemies.some(
            (other) =>
              !other.dead &&
              other.id !== e.id &&
              Math.abs(other.x - e.x) < 1.25 &&
              other.z < e.z - 0.1,
          ))) && (
        <Html
          position={[0, e.boss ? 6.8 : e.kind === "Screamer" ? 2.9 : 2.25, 0]}
          center
          distanceFactor={30}
          zIndexRange={[8, 0]}
        >
          <div
            className={`enemy-label ${e.boss ? "boss-label" : ""} ${e.kind === "Crawler" ? "small-label" : ""} ${e.z > 20 ? "distant-label" : ""}`}
          >
            <span>
              {e.boss ? e.kind : e.kind === "Walker" || e.z > 18 ? "" : e.kind}
            </span>
            <b>{Math.max(0, Math.ceil(e.hp))}</b>
            {e.armor > 0 && <em>▰ {Math.ceil(e.armor)}</em>}
          </div>
        </Html>
      )}
      <mesh ref={buff} position={[0, 1, 0]} visible={false}>
        <sphereGeometry args={[0.68, 12, 8]} />
        <meshBasicMaterial
          color="#c04536"
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
function GateLabel({
  gate: g,
  side,
  sim,
}: {
  gate: Gate;
  side: "a" | "b";
  sim: Simulation;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHits = useRef(g[side === "a" ? "hitsA" : "hitsB"]);
  const hitTick = useRef(-100);
  useFrame(() => {
    const el = ref.current;
    if (!el) return;
    const op = side === "a" ? g.left : g.right;
    const value = g[side];
    const hits = g[side === "a" ? "hitsA" : "hitsB"];
    if (hits !== lastHits.current) {
      lastHits.current = hits;
      hitTick.current = sim.tick;
    }
    const pulse = Math.max(0, 1 - (sim.tick - hitTick.current) / 7);
    const good = op === "+" || op === "×" || (op === "÷" && value <= 1);
    el.className = `gate-number ${good ? "positive" : "negative"} ${sim.mode === "Mirror" ? "mirrored" : ""}`;
    el.style.transform = `scale(${1 + pulse * 0.08})`;
    el.style.filter = `brightness(${1 + pulse * 0.8})`;
    const texts = [
      g.revealed
        ? selectedGate(sim.x) === side
          ? "SELECTED"
          : side === "a"
            ? "LEFT LANE"
            : "RIGHT LANE"
        : "UNIDENTIFIED",
      g.revealed ? `${op}${Math.round(value * 1000) / 1000}` : "?",
      g.revealed ? "EVERY HIT COUNTS" : "FIRE TO REVEAL",
    ];
    texts.forEach((text, i) => {
      if (el.children[i].textContent !== text)
        el.children[i].textContent = text;
    });
  });
  // Sign text follows the render frame, independent of the slower HUD refresh.
  return (
    <Html
      center
      position={[0, 2.2, 0.1]}
      distanceFactor={28}
      zIndexRange={[9, 0]}
    >
      <div ref={ref} className="gate-number">
        <small />
        <strong />
        <span />
      </div>
    </Html>
  );
}
function GateView({ gate: g, sim }: { gate: Gate; sim: Simulation }) {
  const ref = useRef<T.Group>(null);
  const planes = useRef<(T.Mesh | null)[]>([]);
  useFrame(() => {
    if (ref.current)
      ref.current.position.z =
        -g.z - (sim.distance - presentedDistance(sim)) * 2.5;
    const selected = selectedGate(sim.x);
    planes.current.forEach((plane, index) => {
      if (!plane) return;
      const side = index % 2 ? "b" : "a";
      (plane.material as T.MeshBasicMaterial).opacity =
        selected === side ? 0.22 : 0.08;
    });
  });
  return (
    <group ref={ref} position={[0, 0, -g.z]}>
      {(sim.mode === "Mirror" ? [-1, 1, 1, -1] : [-1, 1]).map((side, index) => {
        const i = side === -1 ? 0 : 1;
        const copy = index >= 2;
        const op = i ? g.right : g.left,
          value = i ? g.b : g.a;
        const good = op === "+" || op === "×" || (op === "÷" && value <= 1);
        const color = good ? "#51d4c3" : "#f07459";
        return (
          <group
            key={index}
            scale={[sim.mode === "Mirror" ? 0.5 : 1, 1, 1]}
            position={[
              sim.mode === "Mirror"
                ? (copy ? 1 : -1) * (2.45 - side * GATE_CENTER * 0.5)
                : side * GATE_CENTER,
              0,
              0,
            ]}
          >
            <mesh
              position={[0, 0.035, 0.7]}
              rotation={[-Math.PI / 2, 0, 0]}
              ref={(mesh) => {
                planes.current[index] = mesh;
              }}
            >
              <planeGeometry args={[GATE_WIDTH, 1.4]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.08}
                depthWrite={false}
              />
            </mesh>
            <mesh position={[0, 1.8, 0]}>
              <boxGeometry args={[GATE_WIDTH, 3.6, 0.07]} />
              <meshBasicMaterial
                color={color}
                transparent
                opacity={0.07}
                depthWrite={false}
              />
            </mesh>
            {[-GATE_WIDTH / 2, GATE_WIDTH / 2].map((x) => (
              <mesh key={x} position={[x, 1.8, 0]}>
                <boxGeometry args={[0.065, 3.6, 0.12]} />
                <meshStandardMaterial
                  color={color}
                  emissive={color}
                  emissiveIntensity={1.5}
                />
              </mesh>
            ))}
            <mesh position={[0, 3.6, 0]}>
              <boxGeometry args={[GATE_WIDTH, 0.065, 0.12]} />
              <meshStandardMaterial
                color={color}
                emissive={color}
                emissiveIntensity={1.5}
              />
            </mesh>
            <GateLabel gate={g} side={i ? "b" : "a"} sim={sim} />
            {g.wall === i && (
              <>
                <Barricade width={GATE_WIDTH} />
                <Text
                  font={font}
                  position={[0, 1.12, 1.95]}
                  fontSize={0.17}
                  color="#f4d395"
                >
                  BARRICADE · WATCH YOUR FLANK
                </Text>
              </>
            )}
          </group>
        );
      })}
    </group>
  );
}
function Warning({ hazard: h, sim }: { hazard: Hazard; sim: Simulation }) {
  const root = useRef<T.Group>(null);
  const planes = useRef<Record<number, T.Mesh | null>>({});
  const labels = useRef<Record<number, HTMLDivElement | null>>({});
  // Countdown text and lane tint follow the render frame; the React tree only
  // changes when the hazard itself appears or disappears.
  useFrame(() => {
    const group = root.current;
    if (!group) return;
    const shown = sim.tick >= h.warnAt;
    group.visible = shown;
    if (!shown) return;
    const active = sim.tick >= h.strikeAt;
    const converted = !!sim.supers.active("platypus");
    const text = converted
      ? "REVERSED · FRIENDLY"
      : active
        ? "DANGER"
        : `${h.kind.toUpperCase()} ${(Math.max(0, h.strikeAt - sim.tick) / 60).toFixed(1)}`;
    const className = `lane-warning${converted ? " converted" : ""}`;
    for (const l of h.lanes) {
      const material = planes.current[l]?.material as
        T.MeshBasicMaterial | undefined;
      if (material) {
        material.color.set(
          converted ? "#54dfe8" : active ? "#ff4425" : "#f6ad4f",
        );
        material.opacity = converted
          ? 0.14
          : active
            ? 0.4
            : 0.12 + Math.sin(sim.time * 12) * 0.04;
      }
      const label = labels.current[l];
      if (label) {
        if (label.textContent !== text) label.textContent = text;
        if (label.className !== className) label.className = className;
      }
    }
  });
  return (
    <group ref={root} visible={false}>
      {h.lanes.map((l) => (
        <group key={l} position={[LANES[l], 0.05, -7]}>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            ref={(mesh) => {
              planes.current[l] = mesh;
            }}
          >
            <planeGeometry args={[3, 28]} />
            <meshBasicMaterial
              color="#f6ad4f"
              transparent
              opacity={0.12}
              depthWrite={false}
            />
          </mesh>
          <Html center position={[0, 0.1, 7]} zIndexRange={[12, 0]}>
            <div
              className="lane-warning"
              ref={(el) => {
                labels.current[l] = el;
              }}
            />
          </Html>
        </group>
      ))}
    </group>
  );
}
function Army({ sim }: { sim: Simulation }) {
  const soldierAsset = useGLTF("/assets/soldier-crowd.glb");
  const uniforms = useMemo(
    () => ({ time: { value: 0 }, lateral: { value: 0 } }),
    [],
  );
  const motion = useRef({
    simulation: sim,
    tick: sim.tick,
    x: sim.x,
    velocity: 0,
  });
  const root = useRef<T.Group>(null);
  const marker = useRef<T.Group>(null);
  const meshes = useMemo(() => {
    const model = soldierAsset.scene;
    const pieces: { mesh: T.InstancedMesh; matrix: T.Matrix4 }[] = [];
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (o instanceof T.Mesh) {
        const geometry = o.geometry.clone();
        geometry.applyMatrix4(o.matrixWorld);
        geometry.setAttribute(
          "soldierPhase",
          new T.InstancedBufferAttribute(
            new Float32Array(
              Array.from(
                { length: ARMY_RENDER_BUDGET * 2 },
                (_, i) => i * 2.399,
              ),
            ),
            1,
          ),
        );
        const signs = new T.InstancedBufferAttribute(
          new Float32Array(ARMY_RENDER_BUDGET * 2).fill(1),
          1,
        );
        geometry.setAttribute("formationSign", signs);
        const source = Array.isArray(o.material) ? o.material[0] : o.material;
        const mesh = new T.InstancedMesh(
          geometry,
          squadMaterial(source, uniforms),
          ARMY_RENDER_BUDGET * 2,
        );
        mesh.customDepthMaterial = squadMaterial(source, uniforms, true);
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        pieces.push({ mesh, matrix: new T.Matrix4() });
      }
    });
    return pieces;
  }, [soldierAsset.scene, uniforms]);
  useEffect(
    () => () => {
      for (const { mesh } of meshes) {
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
        mesh.customDepthMaterial?.dispose();
        mesh.dispose();
      }
    },
    [meshes],
  );
  const dummy = useMemo(() => new T.Object3D(), []);
  const temp = useMemo(() => new T.Matrix4(), []);
  const signature = useRef("");
  useFrame(() => {
    advanceSquadMotion(motion.current, sim);
    uniforms.time.value = sim.time;
    uniforms.lateral.value = motion.current.velocity;
    const mirrored = sim.mode === "Mirror",
      count = Math.min(ARMY_RENDER_BUDGET, sim.army);
    const crowd = crowdEnvelope(
      sim.army,
      sim.mode,
      presentedX(sim),
      presentedCrowdX(sim),
    );
    if (marker.current) {
      marker.current.position.set(crowd.rears[0], 0, crowd.back);
      const label = marker.current.userData.label as HTMLDivElement | undefined;
      if (label) {
        label.textContent = sim.army.toLocaleString();
        label.classList.toggle(
          "exposed",
          edgeExposure(sim.army, sim.mode, sim.x, sim.crowdX) > 0.5,
        );
      }
    }
    const phased = !!sim.supers.active("meesh");
    for (const p of meshes) {
      const material = p.mesh.material as T.MeshStandardMaterial;
      if (material.transparent !== phased) {
        material.transparent = phased;
        material.needsUpdate = true;
      }
      material.opacity = phased ? 0.28 : 1;
      material.depthWrite = !phased;
      p.mesh.castShadow = !phased;
      if (material.emissive) {
        material.emissive.set(phased ? "#b597ed" : "#000000");
        material.emissiveIntensity = phased ? 0.6 : 0;
      }
      p.mesh.count = count * (mirrored ? 2 : 1);
      const signs = p.mesh.geometry.getAttribute(
        "formationSign",
      ) as T.InstancedBufferAttribute;
      const layout = `${p.mesh.count}:${mirrored}:${count}`;
      if (signature.current !== layout) {
        for (let i = 0; i < p.mesh.count; i++)
          signs.setX(i, mirrored ? (i >= count ? -0.5 : 0.5) : 1);
        signs.needsUpdate = true;
      }
      const tipX = presentedX(sim),
        rearX = presentedCrowdX(sim);
      for (let i = 0; i < p.mesh.count; i++) {
        const j = i % count;
        const point = soldierPosition(
          j,
          count,
          sim.army,
          tipX,
          rearX,
          sim.mode,
          i >= count ? 1 : 0,
          crowd,
        );
        dummy.position.set(point.x, 0.02, point.z);
        dummy.rotation.set(
          0,
          Math.PI +
            motion.current.velocity * (mirrored && i >= count ? -1 : 1) * 0.18,
          0,
        );
        dummy.scale.setScalar(0.3 + Math.sin(j * 71.3) * 0.012);
        dummy.updateMatrix();
        temp.multiplyMatrices(dummy.matrix, p.matrix);
        p.mesh.setMatrixAt(i, temp);
      }
      p.mesh.instanceMatrix.clearUpdateRanges();
      p.mesh.instanceMatrix.addUpdateRange(0, Math.max(1, p.mesh.count) * 16);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
    signature.current = `${meshes[0]?.mesh.count}:${mirrored}:${count}`;
  });
  return (
    <group ref={root}>
      {meshes.map((p, i) => (
        <primitive key={i} object={p.mesh} />
      ))}
      <group ref={marker} name="army-count-anchor">
        <Html position={[0, 0.05, 0.2]} center zIndexRange={[15, 0]}>
          <div
            ref={(el) => {
              if (marker.current) marker.current.userData.label = el;
            }}
            className="army-label"
            aria-label={`${sim.army} soldiers`}
          >
            {sim.army}
          </div>
        </Html>
      </group>
    </group>
  );
}
function FiringTip({ sim, index = 0 }: { sim: Simulation; index?: number }) {
  const ref = useRef<T.Group>(null);
  const muzzle = useRef<T.Mesh>(null);
  const lastShot = useRef({ count: sim.shots, tick: -100 });
  useFrame(() => {
    if (ref.current)
      ref.current.position.set(
        formationPositions(sim.mode, presentedX(sim))[index],
        0.025,
        crowdEnvelope(sim.army, sim.mode, presentedX(sim), presentedCrowdX(sim))
          .front - 0.12,
      );
    if (muzzle.current) {
      if (sim.shots !== lastShot.current.count)
        lastShot.current = { count: sim.shots, tick: sim.tick };
      muzzle.current.visible = sim.tick - lastShot.current.tick < 3;
      muzzle.current.rotation.z = sim.shots * 2.399;
      muzzle.current.scale.setScalar(0.7 + (sim.shots % 3) * 0.2);
    }
  });
  return (
    <group ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.17, 0.19, 32]} />
        <meshBasicMaterial
          color="#91dbc7"
          transparent
          opacity={0.7}
          depthWrite={false}
        />
      </mesh>
      <mesh
        ref={muzzle}
        position={[0, 0.4, -0.93]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <octahedronGeometry args={[0.16, 0]} />
        <meshBasicMaterial color="#ffe1a3" toneMapped={false} />
      </mesh>
    </group>
  );
}
function AimGuide({
  sim,
  onAim,
}: {
  sim: Simulation;
  onAim?: (x: number) => void;
}) {
  const { camera, gl } = useThree();
  const marker = useRef<T.Group>(null);
  useEffect(() => {
    const ray = new T.Raycaster(),
      point = new T.Vector3(),
      plane = new T.Plane(new T.Vector3(0, 1, 0), -0.72);
    const move = (event: PointerEvent) => {
      const r = gl.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        camera,
      );
      if (ray.ray.intersectPlane(plane, point))
        onAim?.(Math.max(-4.5, Math.min(4.5, point.x)));
    };
    gl.domElement.addEventListener("pointermove", move);
    return () => gl.domElement.removeEventListener("pointermove", move);
  }, [camera, gl, onAim]);
  useFrame(() => {
    if (marker.current) {
      marker.current.visible = sim.guns.cursor > 0;
      marker.current.position.set(sim.aim, 0.08, -16);
      marker.current.rotation.y = sim.time * 0.6;
    }
  });
  return (
    <group ref={marker} visible={false}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.42, 0.45, 40]} />
        <meshBasicMaterial
          color="#d8a1ff"
          transparent
          opacity={0.6}
          depthWrite={false}
        />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh
          key={i}
          position={[
            Math.sin((i * Math.PI) / 2) * 0.65,
            0,
            Math.cos((i * Math.PI) / 2) * 0.65,
          ]}
        >
          <boxGeometry args={[0.07, 0.02, 0.07]} />
          <meshBasicMaterial color="#ead6ff" />
        </mesh>
      ))}
    </group>
  );
}
function World({
  sim,
  menu,
  quality,
  onReady,
  onAim,
}: {
  sim: Simulation;
  menu: boolean;
  quality: string;
  onReady: () => void;
  onAim?: (x: number) => void;
}) {
  useLayoutEffect(onReady, [onReady, sim]);
  useEffect(() => {
    const kind = BOSSES[sim.bossIndex];
    if (kind && isNewBoss(kind))
      useGLTF.preload(bossModelUrl(bossDefinition(kind).id, quality));
  }, [sim.bossIndex, quality]);

  const { camera, gl, scene, size } = useThree();
  useEffect(() => {
    if (import.meta.env.DEV || import.meta.env.VITE_PERF_HOOKS)
      Object.assign(window, { __sceneReview: { camera, scene } });
  }, [camera, scene]);
  gl.info.autoReset = false;
  useFrame(() => {
    if (import.meta.env.DEV || import.meta.env.VITE_PERF_HOOKS)
      Object.assign(window, {
        __renderInfo: {
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length,
        },
      });
    gl.info.reset();
  }, -100);
  useLayoutEffect(() => {
    if (menu) {
      camera.position.set(11, 13, 20);
      camera.lookAt(0, 0, -13);
      camera.updateProjectionMatrix();
    } else if (camera instanceof T.PerspectiveCamera) {
      const top = gl.domElement.getBoundingClientRect().top;
      const barTop =
        document.querySelector(".reactor-shell")?.getBoundingClientRect().top ??
        top + size.height - (size.width <= 1200 ? 18 : 24) - 36;
      const boss = sim.boss ?? sim.bossRemains[0];
      frameSquadRear(
        camera,
        size.height,
        barTop - top,
        boss && isNewBoss(boss.kind) ? bossDefinition(boss.kind).height : 0,
      );
    }
  }, [
    camera,
    gl,
    menu,
    size.width,
    size.height,
    sim.supers.loadout.length,
    sim.boss?.kind,
    sim.bossRemains.length,
  ]);
  return (
    <>
      <Environment sim={sim} quality={quality} />
      <Army sim={sim} />
      {sim.enemies.map((e) =>
        isNewBoss(e.kind) ? (
          <BossAssetBoundary
            key={e.id}
            fallback={<BossFallback enemy={e} sim={sim} />}
          >
            <Suspense fallback={<BossFallback enemy={e} sim={sim} />}>
              <BossCharacter enemy={e} sim={sim} quality={quality} />
            </Suspense>
          </BossAssetBoundary>
        ) : (
          <Unit key={e.id} enemy={e} sim={sim} />
        ),
      )}
      {sim.gates.map((g) => (
        <GateView key={g.id} gate={g} sim={sim} />
      ))}
      {sim.hazards.map((h) => (
        <Warning key={h.id} hazard={h} sim={sim} />
      ))}
      {sim.drops.map((d) => (
        <PickupView key={d.id} drop={d} sim={sim} />
      ))}
      <BossOrdnance sim={sim} />
      {sim.bossRemains
        .filter((e) => isNewBoss(e.kind))
        .map((e) => (
          <BossAssetBoundary key={`remains-${e.id}`} fallback={null}>
            <Suspense fallback={null}>
              <BossCharacter enemy={e} sim={sim} quality={quality} />
            </Suspense>
          </BossAssetBoundary>
        ))}
      <Projectiles sim={sim} />
      {!menu && <SuperWeaponEffects sim={sim} quality={quality} />}
      <AimGuide sim={sim} onAim={onAim} />
      <DeathEffects sim={sim} />
      <FiringTip sim={sim} />
      {sim.mode === "Mirror" && <FiringTip sim={sim} index={1} />}
      {quality === "high" && (
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.3} luminanceThreshold={1.2} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.52} />
        </EffectComposer>
      )}
    </>
  );
}
// The React tree inside the canvas only needs reconciling when entities
// appear or disappear or a few per-entity states flip; per-frame motion lives
// in useFrame handlers. The HUD re-renders more often, so the scene is
// memoized on an explicit revision that the game loop advances.
export const Scene = memo(function Scene({
  sim,
  menu,
  quality,
  onReady,
  onAim,
}: {
  sim: Simulation;
  menu: boolean;
  quality: string;
  onReady: () => void;
  onAim?: (x: number) => void;
  revision?: number;
}) {
  return (
    <Canvas
      shadows
      dpr={1}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      camera={{ position: [11, 13, 20], fov: 47, near: 0.1, far: 400 }}
    >
      <Suspense fallback={null}>
        <World
          sim={sim}
          menu={menu}
          quality={quality}
          onReady={onReady}
          onAim={onAim}
        />
      </Suspense>
    </Canvas>
  );
});
