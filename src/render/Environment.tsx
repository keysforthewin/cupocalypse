import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as T from "three";
import { presentedDistance } from "./presentation";
import { Simulation } from "../game/simulation";
import {
  roadChunkZ,
  ROAD_CHUNK_COUNT,
  SUN_OFFSET,
  SUN_TARGET,
  SHADOW_BOUNDS,
  FOG_FAR,
} from "./roadMath";
import {
  BIOMES,
  atmosphereAt,
  smooth,
  type BiomeReview,
  type BiomeAsset,
} from "./biomes";
import {
  sceneryLibrary,
  createSceneryChunk,
  beginSceneryChunk,
} from "./biomeModels";
import manifest from "./biomeAssets.json";
import { BiomeAtmosphere } from "./BiomeAtmosphere";

declare global {
  interface Window {
    __biomeReview?: BiomeReview;
    __biomeStatus?: {
      from: string;
      to: string;
      blend: number;
      chunks: number;
      assets: number;
      revision: string;
    };
  }
}
export function Environment({
  sim,
  quality,
}: {
  sim: Simulation;
  quality: string;
}) {
  const { scene } = useThree();
  const library = useMemo(() => sceneryLibrary(), []);
  const root = useMemo(() => new T.Group(), []);
  const state = useRef({
    signature: "",
    preparing: null as {
      route: number;
      task: ReturnType<typeof beginSceneryChunk>;
    } | null,
    chunks: new Map<number, ReturnType<typeof createSceneryChunk>>(),
  });
  const sun = useRef<T.DirectionalLight>(null),
    hemi = useRef<T.HemisphereLight>(null),
    fill = useRef<T.DirectionalLight>(null);
  const target = useMemo(() => {
    const o = new T.Object3D();
    o.position.set(...SUN_TARGET);
    return o;
  }, []);
  const colors = useMemo(() => [new T.Color(), new T.Color()], []);
  const loaded = useGLTF(
    (manifest as BiomeAsset[]).map((asset) =>
      quality === "high" ? asset.url : asset.lowUrl,
    ),
  ) as unknown as { scene: T.Group }[];
  const assets = useMemo(() => {
    const map = new Map<string, T.Group>();
    loaded.forEach((gltf, i) => {
      gltf.scene.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.userData.sharedAsset = true;
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      gltf.scene.userData.assetHeight = manifest[i].height;
      map.set(manifest[i].id, gltf.scene);
    });
    return map;
  }, [loaded]);
  useLayoutEffect(
    () => () => {
      for (const chunk of state.current.chunks.values()) chunk.dispose();
      state.current.preparing = null;
      state.current.chunks.clear();
      root.clear();
      library.dispose();
    },
    [root, library],
  );
  useFrame(() => {
    const review = import.meta.env.DEV ? window.__biomeReview : undefined;
    const seed = review?.seed ?? sim.seed;
    const displacement =
      review?.from && review.to
        ? 480 + Math.max(0, Math.min(1, review.progress ?? 0)) * 160
        : presentedDistance(sim) * 2.5;
    const signature = `${seed}:${quality}:${review?.biome}:${review?.from}:${review?.to}:${manifest.map((a) => a.hash.slice(0, 6)).join(":")}`;
    if (signature !== state.current.signature) {
      for (const c of state.current.chunks.values()) {
        root.remove(c.root);
        c.dispose();
      }
      state.current.preparing = null;
      state.current.chunks.clear();
      state.current.signature = signature;
    }
    const active = new Set<number>();
    for (let slot = 0; slot < ROAD_CHUNK_COUNT; slot++) {
      const z = roadChunkZ(slot, displacement),
        route = Math.round((displacement - z) / 20) * 20;
      active.add(route);
      let chunk = state.current.chunks.get(route);
      if (!chunk) {
        chunk = createSceneryChunk(
          library,
          seed,
          route,
          quality,
          review,
          assets,
        );
        state.current.chunks.set(route, chunk);
      }
      if (chunk.root.parent !== root) root.add(chunk.root);
      chunk.root.position.z = z;
    }
    const nextRoute = Math.max(...active) + 20;
    for (const [route, chunk] of state.current.chunks)
      if (!active.has(route) && route !== nextRoute) {
        root.remove(chunk.root);
        chunk.dispose();
        state.current.chunks.delete(route);
      }
    if (!state.current.chunks.has(nextRoute)) {
      if (state.current.preparing?.route !== nextRoute)
        state.current.preparing = {
          route: nextRoute,
          task: beginSceneryChunk(
            library,
            seed,
            nextRoute,
            quality,
            review,
            assets,
          ),
        };
      const step = state.current.preparing.task.next();
      if (step.done) {
        state.current.chunks.set(nextRoute, step.value);
        state.current.preparing = null;
      }
    }
    const sample = review?.biome
      ? { from: review.biome, to: review.biome, blend: 0 }
      : review?.from && review.to
        ? {
            from: review.from,
            to: review.to,
            blend: smooth(review.progress ?? 0),
          }
        : atmosphereAt(seed, displacement / 8);
    const a = BIOMES[sample.from],
      b = BIOMES[sample.to];
    const blend = (one: string, two: string) =>
      colors[0].set(one).lerp(colors[1].set(two), sample.blend);
    (scene.background as T.Color).copy(blend(a.sky, b.sky));
    (scene.fog as T.Fog).color.copy(blend(a.fog, b.fog));
    if (sun.current) {
      sun.current.color.copy(blend(a.sun, b.sun));
      sun.current.intensity = T.MathUtils.lerp(
        a.intensity,
        b.intensity,
        sample.blend,
      );
    }
    hemi.current?.color.copy(blend(a.ambient, b.ambient));
    hemi.current?.groundColor.copy(blend(a.ground, b.ground));
    fill.current?.color.copy(blend(a.ambient, b.ambient));
    if (import.meta.env.DEV || import.meta.env.VITE_PERF_HOOKS)
      window.__biomeStatus = {
        ...sample,
        chunks: root.children.length,
        assets: assets.size,
        revision: signature,
      };
  });
  return (
    <>
      <color attach="background" args={["#83979b"]} />
      <fog attach="fog" args={["#83979b", 55, FOG_FAR]} />
      <hemisphereLight ref={hemi} args={["#c8dce5", "#565e55", 1.8]} />
      <ambientLight intensity={0.28} />
      <directionalLight ref={fill} position={[12, 18, 8]} intensity={0.85} />
      <primitive object={target} />
      <directionalLight
        ref={sun}
        position={[
          SUN_TARGET[0] + SUN_OFFSET[0],
          SUN_TARGET[1] + SUN_OFFSET[1],
          SUN_TARGET[2] + SUN_OFFSET[2],
        ]}
        target={target}
        color="#ffe1b8"
        intensity={2.5}
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
      <primitive object={root} />
      <BiomeAtmosphere sim={sim} quality={quality} />
    </>
  );
}
