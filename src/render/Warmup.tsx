import { Suspense, useEffect, useRef, useState, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import * as T from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Simulation } from "../game/simulation";
import type { SuperCast } from "../game/superSystem";
import type { SuperId } from "../game/superWeapons";
import { PICKUPS } from "../game/weapons";
import type { Enemy, Pickup } from "../game/types";
import { GATE_WIDTH } from "../game/gateLayout";
import {
  TEXT_FONT,
  loadedModel,
  modelCatalogue,
  setWarmProgress,
  whenAssetsLoaded,
} from "./assetLibrary";
import { Barricade } from "./Barricade";
import { AttackEffects } from "./AttackEffects";
import { PickupBase, pickupIcon } from "./Pickups";
import { CastEffect } from "./SuperWeaponEffects";
import type { BiomeId } from "./biomes";

/** Builds one representative scenery section per biome with the live library. */
export interface SceneryWarmup {
  biomes: readonly BiomeId[];
  /** The scenery library's shared materials, drawn both plain and instanced. */
  materials: Record<string, T.Material>;
  build(biome: BiomeId): { root: T.Object3D; dispose(): void };
}

// An enemy with no attack in progress: its effects stay hidden but mounted.
const IDLE_ENEMY = {
  id: -1,
  kind: "Walker",
  boss: false,
  x: 0,
  z: 0,
  motions: [],
} as unknown as Enemy;

// A cast that ended long ago: its effects mount with all their materials.
const idleCast = (id: SuperId, i: number): SuperCast => ({
  serial: -1 - i,
  id,
  start: -1e6,
  end: -1e6,
  army: 0,
  next: 0,
  count: 0,
  shield: 0,
  absorbed: 0,
  target: -1,
  targets: [],
  hits: new Set(),
  bossDamage: new Map(),
  bossSeen: new Map(),
  points: [],
  walls: [],
  seeds: [],
});

const DIVIDER = new T.BoxGeometry(0.01, 0.01, 0.01);
const DIVIDER_MATERIAL = new T.MeshStandardMaterial();
/**
 * A shadow caster of the opposite instancing kind to `model`, so the shared
 * shadow material switches shaders on the model; see the note in Warmup.
 */
const divider = (model: T.Object3D) => {
  let instanced = false;
  model.traverse((o) => {
    if (o instanceof T.InstancedMesh) instanced = true;
  });
  const mesh = instanced
    ? new T.Mesh(DIVIDER, DIVIDER_MATERIAL)
    : new T.InstancedMesh(DIVIDER, DIVIDER_MATERIAL, 1);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
};
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const meshes = (root: T.Object3D) => {
  const list: T.Mesh[] = [];
  root.traverse((o) => {
    if (o instanceof T.Mesh) list.push(o);
  });
  return list;
};
const materialsOf = (mesh: T.Mesh) =>
  Array.isArray(mesh.material) ? mesh.material : [mesh.material];
/** A material copy, with the per-object shader hooks that clone() leaves out. */
function copyMaterial(material: T.Material) {
  const copy = material.clone();
  if (Object.hasOwn(material, "onBeforeCompile"))
    copy.onBeforeCompile = material.onBeforeCompile;
  if (Object.hasOwn(material, "customProgramCacheKey"))
    copy.customProgramCacheKey = material.customProgramCacheKey;
  return copy;
}
/** Three vertices with the attribute layout a shader variant depends on. */
function layoutOf(source: T.BufferGeometry) {
  const geometry = new T.BufferGeometry();
  const blank = (a: T.BufferAttribute | T.InterleavedBufferAttribute) =>
    new T.BufferAttribute(new Float32Array(a.itemSize * 3), a.itemSize);
  for (const [name, a] of Object.entries(source.attributes))
    geometry.setAttribute(name, blank(a));
  for (const name of ["position", "normal", "color"] as const) {
    const list = source.morphAttributes[name];
    if (list) geometry.morphAttributes[name] = list.map(blank);
  }
  geometry.morphTargetsRelative = source.morphTargetsRelative;
  for (const group of source.groups)
    geometry.addGroup(0, 3, group.materialIndex);
  return geometry;
}
/**
 * Tiny stand-ins for everything drawable under `source`: the same kind of
 * object with the same attribute layout and copies of its materials, so they
 * share its shader programs. While a stand-in exists three.js keeps those
 * programs after the source unmounts, and the next copy of the source draws
 * without compiling anything.
 */
function standIns(source: T.Object3D) {
  const list: T.Object3D[] = [];
  const release: (() => void)[] = [];
  source.traverse((o) => {
    if (
      o instanceof T.SkinnedMesh ||
      !(o instanceof T.Mesh || o instanceof T.Points || o instanceof T.Line)
    )
      return;
    const geometry = layoutOf(o.geometry);
    const materials = materialsOf(o as T.Mesh).map(copyMaterial);
    const material = Array.isArray(o.material) ? materials : materials[0];
    let copy: T.Mesh | T.Points | T.Line;
    if (o instanceof T.InstancedMesh) {
      const mesh = new T.InstancedMesh(geometry, material, 1);
      if (o.instanceColor) mesh.setColorAt(0, new T.Color("#ffffff"));
      copy = mesh;
    } else if (o instanceof T.Points) copy = new T.Points(geometry, material);
    else if (o instanceof T.LineSegments)
      copy = new T.LineSegments(geometry, material);
    else if (o instanceof T.LineLoop) copy = new T.LineLoop(geometry, material);
    else if (o instanceof T.Line) copy = new T.Line(geometry, material);
    else copy = new T.Mesh(geometry, material);
    const depth = [o.customDepthMaterial, o.customDistanceMaterial].map(
      (m) => m && copyMaterial(m),
    );
    copy.customDepthMaterial = depth[0];
    copy.customDistanceMaterial = depth[1];
    list.push(copy);
    release.push(() => {
      geometry.dispose();
      for (const m of [...materials, ...depth]) m?.dispose();
      if (copy instanceof T.InstancedMesh) copy.dispose();
    });
  });
  return { list, release: () => release.forEach((step) => step()) };
}
function texturesOf(material: T.Material, into: Set<T.Texture>) {
  const values: unknown[] = Object.values(material);
  if (material instanceof T.ShaderMaterial)
    for (const u of Object.values(material.uniforms)) values.push(u.value);
  for (const value of values)
    if (value instanceof T.Texture && !value.isRenderTargetTexture)
      into.add(value);
}

/**
 * Prepares the GPU for everything a run can show, while the deployment screen
 * covers the canvas: every shader variant is compiled (in parallel where the
 * browser supports KHR_parallel_shader_compile), every texture is uploaded and
 * every model is drawn once, including into the shadow map. Without this,
 * each of those happens on the frame an enemy, boss, pickup or biome first
 * appears and the game hitches.
 */
export function Warmup({
  sim,
  quality,
  scenery,
  onReady,
}: {
  sim: Simulation;
  quality: string;
  scenery: RefObject<SceneryWarmup | null>;
  onReady: () => void;
}) {
  const { gl, scene, camera } = useThree();
  const [staging, setStaging] = useState<"off" | "shown" | "hidden">("off");
  const frames = useRef(0);
  const textSynced = useRef<(() => void) | null>(null);
  // The staging text stays mounted after its first sync and never syncs
  // again, so later warm-ups (a redeploy) must not wait for it.
  const textDone = useRef(false);
  // Copies of every model stay in the scene, hidden, for the life of the
  // renderer. A material that is never disposed keeps its compiled program
  // alive; disposing the copies would let three.js delete the boss shaders
  // and recompile them when the boss spawns.
  const kept = useRef<{
    root: T.Group;
    /** Super weapons whose cast effects have stand-ins in `root`. */
    supers: Set<SuperId>;
    release: (() => void)[];
    dispose(): void;
  } | null>(null);
  // Cast effects of the equipped super weapons, mounted during a warm-up.
  const [casts, setCasts] = useState<SuperCast[]>([]);
  const castRoot = useRef<T.Group>(null);
  useFrame(() => {
    frames.current++;
  });
  useEffect(
    () => () => {
      kept.current?.dispose();
      kept.current = null;
    },
    [scene],
  );
  useEffect(() => {
    let cancelled = false;
    const cleanup: (() => void)[] = [];
    const progress = (fraction: number, label: string) =>
      setWarmProgress({ active: true, fraction, label });
    const afterFrames = (count: number) =>
      new Promise<void>((resolve) => {
        const target = frames.current + count;
        const check = () =>
          frames.current >= target || cancelled
            ? resolve()
            : requestAnimationFrame(check);
        check();
      });
    const prepare = (object: T.Object3D) => {
      for (const mesh of meshes(object)) {
        mesh.frustumCulled = false;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
      return object;
    };

    const build = async () => {
      const root = new T.Group();
      root.name = "warmup";
      root.visible = false;
      const release: (() => void)[] = [];
      const catalogue = modelCatalogue(quality);
      for (const url of catalogue.enemies) {
        const model = loadedModel(url);
        if (model) root.add(prepare(cloneSkinned(model.scene)));
      }
      for (const url of catalogue.bosses) {
        const model = loadedModel(url);
        if (!model) continue;
        const boss = cloneSkinned(model.scene);
        // BossCharacter renders bosses without fog, a separate shader variant.
        for (const mesh of meshes(boss)) {
          const copies = materialsOf(mesh).map((m) => {
            const copy = m.clone() as T.MeshStandardMaterial;
            copy.fog = false;
            return copy;
          });
          mesh.material = copies.length === 1 ? copies[0] : copies;
          release.push(() => copies.forEach((m) => m.dispose()));
        }
        root.add(prepare(boss));
      }
      // Scenery draws each shared asset primitive as an InstancedMesh.
      for (const url of catalogue.biomes) {
        const model = loadedModel(url);
        if (!model) continue;
        for (const source of meshes(model.scene)) {
          root.add(
            prepare(new T.InstancedMesh(source.geometry, source.material, 1)),
          );
        }
      }
      for (const kind of Object.keys(PICKUPS) as Pickup[]) {
        root.add(prepare(pickupIcon(kind)));
        progress(0.02, "Building pickups");
        await nextTask();
      }
      // Scenery library materials appear on merged meshes and on instanced
      // plants; which variant a section uses depends on its content.
      const library = scenery.current;
      if (library) {
        const shape = new T.BoxGeometry(0.2, 0.2, 0.2);
        shape.setAttribute(
          "color",
          new T.BufferAttribute(
            new Float32Array(shape.getAttribute("position").count * 3).fill(1),
            3,
          ),
        );
        release.push(() => shape.dispose());
        for (const material of Object.values(library.materials)) {
          root.add(prepare(new T.Mesh(shape, material)));
          root.add(prepare(new T.InstancedMesh(shape, material, 1)));
        }
      }
      root.traverse((o) => {
        if (o instanceof T.SkinnedMesh)
          release.push(() => o.skeleton.dispose());
      });
      // three.js draws every shadow with one shared depth material and only
      // picks a new shader for it when skinning or instancing changes from
      // one caster to the next; the side (single or double) is baked in at
      // that moment. A caster of the other kind before each model forces that
      // switch, so every model's own shadow variant compiles here rather than
      // when a boss first steps into the light.
      const models = [...root.children];
      root.clear();
      for (const model of models) root.add(divider(model), model);
      scene.add(root);
      return {
        root,
        supers: new Set<SuperId>(),
        release,
        dispose() {
          scene.remove(root);
          root.traverse((o) => {
            if (o instanceof T.InstancedMesh) o.dispose();
          });
          release.forEach((step) => step());
        },
      };
    };

    const run = async () => {
      // Draw nothing until the shaders are ready. The first frame would
      // otherwise compile the opening scene's shaders one by one on the main
      // thread instead of in parallel below. The loading screen covers it.
      scene.visible = false;
      cleanup.push(() => (scene.visible = true));
      progress(0, "Waiting for downloads");
      await whenAssetsLoaded();
      if (cancelled) return;
      if (!kept.current) {
        const built = await build();
        if (cancelled || kept.current) {
          built.dispose();
          if (cancelled) return;
        } else kept.current = built;
      }
      const root = kept.current!.root;

      // Representative scenery for every biome, built with the live library.
      // Its materials and textures persist in the library, so the sections
      // themselves are dropped again afterwards.
      const sections = new T.Group();
      root.add(sections);
      cleanup.push(() => {
        root.remove(sections);
        for (const child of sections.children)
          if (child instanceof T.InstancedMesh) child.dispose();
      });
      const sceneryBuilder = scenery.current;
      if (sceneryBuilder)
        for (const biome of sceneryBuilder.biomes) {
          progress(0.05, `Building ${biome} scenery`);
          const section = sceneryBuilder.build(biome);
          cleanup.push(() => section.dispose());
          sections.add(divider(section.root), prepare(section.root));
          await nextTask();
          if (cancelled) return;
        }

      // Super weapons build their effects, with fresh materials, when cast,
      // and dispose them when the cast ends. Each equipped one is mounted
      // here once and left behind as stand-ins.
      const supers = sim.supers.loadout.filter(
        (id) => !kept.current!.supers.has(id),
      );
      setCasts(supers.map(idleCast));
      cleanup.push(() => setCasts([]));

      // Barricade signage renders through troika text, which loads its font
      // and glyph atlas asynchronously and suspends the first time it mounts.
      setStaging("shown");
      cleanup.push(() => setStaging("hidden"));
      if (!textDone.current) {
        let timer = 0;
        await new Promise<void>((resolve) => {
          textSynced.current = resolve;
          timer = window.setTimeout(resolve, 5000);
        });
        clearTimeout(timer);
        textSynced.current = null;
      }
      if (cancelled) return;
      if (supers.length) {
        progress(0.08, "Staging super weapons");
        for (
          let wait = 0;
          wait < 30 && (castRoot.current?.children.length ?? 0) < supers.length;
          wait++
        )
          await afterFrames(1);
        if (cancelled) return;
        if (castRoot.current) {
          const copies = standIns(castRoot.current);
          for (const copy of copies.list)
            root.add(divider(copy), prepare(copy));
          kept.current!.release.push(copies.release);
          for (const id of supers) kept.current!.supers.add(id);
        }
      }

      // Compile. The high preset renders the scene into the post-processing
      // buffer, which selects different tone-mapping variants than the screen.
      progress(0.1, "Compiling shaders");
      const offscreen =
        quality === "high" ? new T.WebGLRenderTarget(1, 1) : null;
      const previous = gl.getRenderTarget();
      gl.setRenderTarget(offscreen);
      // compile() gathers lights from the visible scene graph.
      scene.visible = true;
      let compiled = 0;
      const parts = [...root.children, ...sections.children];
      const compiling = parts.map((part) =>
        gl.compileAsync(part, camera, scene).then(() => {
          compiled++;
          progress(0.1 + (0.5 * compiled) / parts.length, "Compiling shaders");
        }),
      );
      // Effect pools (projectiles, debris, super effects) are mounted but hidden.
      compiling.push(gl.compileAsync(scene, camera).then(() => undefined));
      scene.visible = false;
      gl.setRenderTarget(previous);
      await Promise.all(compiling);
      offscreen?.dispose();
      if (cancelled) return;

      // Upload every texture the scene references, yielding between batches
      // so the progress bar keeps moving.
      const textures = new Set<T.Texture>();
      scene.traverse((o) => {
        if (o instanceof T.Mesh)
          for (const m of materialsOf(o)) texturesOf(m, textures);
      });
      let uploaded = 0,
        slice = performance.now();
      for (const texture of textures) {
        gl.initTexture(texture);
        uploaded++;
        if (performance.now() - slice > 12) {
          progress(
            0.6 + (0.3 * uploaded) / textures.size,
            "Uploading textures",
          );
          await nextTask();
          if (cancelled) return;
          slice = performance.now();
        }
      }

      // Draw everything once: uploads vertex buffers and compiles the
      // shadow-map variants, which only exist once something casts a shadow.
      progress(0.92, "Final checks");
      scene.visible = true;
      root.visible = true;
      cleanup.push(() => (root.visible = false));
      await afterFrames(2);
    };

    run()
      .catch((error) => console.warn("Warm-up incomplete", error))
      .finally(() => {
        for (const step of cleanup.splice(0).reverse()) step();
        if (cancelled) return;
        setWarmProgress({ active: false, fraction: 1, label: "" });
        onReady();
      });
    return () => {
      cancelled = true;
      for (const step of cleanup.splice(0).reverse()) step();
    };
    // A new simulation is a new run: warm again, since a finished run frees
    // each defeated boss's textures and vertex buffers.
  }, [sim, quality, gl, scene, camera, scenery, onReady]);

  // Kept mounted (hidden) after the first warm-up for the same reason as the
  // model copies: its materials hold their compiled programs.
  return staging === "off" ? null : (
    <group
      position={[0, 0, -30]}
      scale={0.001}
      visible={staging === "shown"}
      name="warmup-staging"
    >
      <Barricade width={GATE_WIDTH} />
      {/* Every enemy mounts these effects with its own materials. When the
          last enemy of a wave unmounts, three.js deletes the shaders and the
          next wave recompiles them; this copy keeps them alive. */}
      <AttackEffects enemy={IDLE_ENEMY} sim={sim} scale={1} />
      <PickupBase color="#ffffff" />
      <group ref={castRoot}>
        {casts.map((cast) => (
          <CastEffect key={cast.serial} sim={sim} cast={cast} />
        ))}
      </group>
      <Suspense fallback={null}>
        <Text
          font={TEXT_FONT}
          fontSize={0.17}
          color="#f4d395"
          onSync={() => {
            textDone.current = true;
            textSynced.current?.();
          }}
        >
          BARRICADE · WATCH YOUR FLANK
        </Text>
      </Suspense>
    </group>
  );
}
