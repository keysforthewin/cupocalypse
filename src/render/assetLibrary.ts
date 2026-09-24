import { use, useSyncExternalStore } from "react";
import {
  GLTFLoader,
  type GLTF,
} from "three/examples/jsm/loaders/GLTFLoader.js";
import sizes from "virtual:asset-sizes";
import { publicPath } from "../game/paths";
import { NEW_BOSSES, bossDefinition } from "../game/bosses";
import { audio } from "../game/audio";
import enemyAssets from "./assets.json";
import biomeManifest from "./biomeAssets.json";
import type { BiomeAsset } from "./biomes";
import { streetTexture, weatheredTexture } from "./textures";

// Every model, sound and font a run can use is downloaded and parsed before
// the run starts. Loading one on demand when an enemy or boss first appears
// stalls the frame that parses it and the next frame that uploads it.

export const CROWD_MODEL = "/assets/soldier-crowd.glb";
export const TEXT_FONT = publicPath("/assets/BarlowCondensed-Bold.woff");

export const bossModelUrl = (id: string, quality: string) =>
  publicPath(
    `/assets/bosses/${id}${quality === "performance" ? "-lod" : ""}.glb`,
  );
export const enemyModelUrl = (asset: string, lod: boolean) =>
  publicPath(lod ? asset.replace(".glb", "-lod.glb") : asset);
export const biomeModelUrl = (asset: BiomeAsset, quality: string) =>
  publicPath(quality === "high" ? asset.url : asset.lowUrl);

/** Model URLs a run at this quality can render, grouped by how they are drawn. */
export function modelCatalogue(quality: string) {
  const enemies = Object.values(enemyAssets as Record<string, string>);
  return {
    crowd: [publicPath(CROWD_MODEL)],
    biomes: (biomeManifest as BiomeAsset[]).map((a) =>
      biomeModelUrl(a, quality),
    ),
    enemies: [
      ...enemies.map((a) => enemyModelUrl(a, false)),
      ...enemies.map((a) => enemyModelUrl(a, true)),
    ],
    bosses: NEW_BOSSES.map((k) => bossModelUrl(bossDefinition(k).id, quality)),
  };
}

// ---------------------------------------------------------------- progress

interface Task {
  bytes: number;
  loaded: number;
  done: boolean;
  failed: boolean;
}
export interface LoadingState {
  /** Bytes received for the requested quality. */
  loaded: number;
  total: number;
  files: number;
  filesDone: number;
  failed: number;
  /** Every download for the requested quality has finished or failed. */
  complete: boolean;
  /** GPU preparation of the current scene (shader compile, texture upload). */
  warm: { active: boolean; fraction: number; label: string };
}
const tasks = new Map<string, Task>();
const listeners = new Set<() => void>();
let requested: string[] = [];
let warm: LoadingState["warm"] = { active: false, fraction: 0, label: "" };
let snapshot: LoadingState | null = null;
let queued = false;

function emit() {
  snapshot = null;
  if (queued) return;
  queued = true;
  // Progress events arrive per network chunk; a few notifications a second is
  // plenty. A timer (not a frame callback) keeps this running in hidden tabs.
  setTimeout(() => {
    queued = false;
    for (const l of listeners) l();
  }, 40);
}
export function loadingState(): LoadingState {
  if (snapshot) return snapshot;
  let loaded = 0,
    total = 0,
    filesDone = 0,
    failed = 0;
  for (const key of requested) {
    const t = tasks.get(key);
    if (!t) continue;
    total += t.bytes;
    loaded += t.done ? t.bytes : Math.min(t.loaded, t.bytes * 0.98);
    if (t.done) filesDone++;
    if (t.failed) failed++;
  }
  snapshot = {
    loaded,
    total,
    files: requested.length,
    filesDone,
    failed,
    complete: requested.length > 0 && filesDone === requested.length,
    warm,
  };
  return snapshot;
}
export function subscribeLoading(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
export function useLoadingState() {
  return useSyncExternalStore(subscribeLoading, loadingState);
}
export function setWarmProgress(next: LoadingState["warm"]) {
  warm = next;
  emit();
}

const sizeOf = (url: string) => {
  const path = new URL(url, location.href).pathname;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    sizes[path.startsWith(base) ? path.slice(base.length) : path] ?? 250_000
  );
};
function track(key: string, url: string) {
  let t = tasks.get(key);
  if (!t) {
    t = { bytes: sizeOf(url), loaded: 0, done: false, failed: false };
    tasks.set(key, t);
    emit();
  }
  return t;
}
function finish(key: string, failed = false) {
  const t = tasks.get(key);
  if (t) {
    t.done = true;
    t.failed = failed;
    emit();
  }
}

// ------------------------------------------------------------ download queue

// A handful of parallel requests keeps the connection busy without letting a
// 20 MB boss starve the small files a run needs first.
const PARALLEL = 6;
let running = 0;
const waiting: { key: string; start: () => void }[] = [];
function schedule<T>(key: string, job: () => Promise<T>, urgent = false) {
  return new Promise<T>((resolve, reject) => {
    const start = () => {
      running++;
      job()
        .then(resolve, reject)
        .finally(() => {
          running--;
          waiting.shift()?.start();
        });
    };
    if (running < PARALLEL) start();
    else if (urgent) waiting.unshift({ key, start });
    else waiting.push({ key, start });
  });
}
function promote(key: string) {
  const i = waiting.findIndex((w) => w.key === key);
  if (i > 0) waiting.unshift(...waiting.splice(i, 1));
}

// ------------------------------------------------------------------- models

type Tracked<T> = Promise<T> & {
  status?: "pending" | "fulfilled" | "rejected";
  value?: T;
  reason?: unknown;
};
const models = new Map<string, Tracked<GLTF>>();
const loader = new GLTFLoader();

/** Starts (or returns) the one shared load of a model; parsed once per page. */
export function loadModel(url: string, urgent = false): Tracked<GLTF> {
  const existing = models.get(url);
  if (existing) {
    if (urgent) promote(url);
    return existing;
  }
  const task = track(url, url);
  const promise: Tracked<GLTF> = schedule(
    url,
    () =>
      new Promise<GLTF>((resolve, reject) =>
        loader.load(
          url,
          resolve,
          (event) => {
            task.loaded = event.loaded;
            if (event.lengthComputable && event.total) task.bytes = event.total;
            emit();
          },
          reject,
        ),
      ),
    urgent,
  );
  // React's `use` reads these fields, so an already-loaded model never suspends.
  promise.status = "pending";
  promise.then(
    (value) => {
      promise.status = "fulfilled";
      promise.value = value;
      finish(url);
    },
    (reason) => {
      promise.status = "rejected";
      promise.reason = reason;
      finish(url, true);
      console.warn(`Model unavailable: ${url}`);
    },
  );
  models.set(url, promise);
  return promise;
}
/** Suspends until the model is parsed; instant once it has been preloaded. */
export function useModel(url: string): GLTF {
  return use<GLTF>(loadModel(url, true) as Promise<GLTF>);
}
const modelSets = new Map<string, GLTF[]>();
/** Like useModel for a list; the returned array keeps its identity between renders. */
export function useModels(urls: string[]): GLTF[] {
  const values = urls.map((url) =>
    use<GLTF>(loadModel(url, true) as Promise<GLTF>),
  );
  const key = urls.join("\n");
  const previous = modelSets.get(key);
  if (previous && previous.every((v, i) => v === values[i])) return previous;
  modelSets.set(key, values);
  return values;
}
export function loadedModel(url: string) {
  const p = models.get(url);
  return p?.status === "fulfilled" ? p.value : undefined;
}

// -------------------------------------------------------------------- sound

function prefetchSound(url: string) {
  const key = `sound:${url}`;
  if (tasks.has(key)) return;
  const task = track(key, publicPath(url));
  const bytes = schedule(key, async () => {
    const response = await fetch(publicPath(url));
    if (!response.ok || !response.body) throw Error("Audio asset missing");
    const length = Number(response.headers.get("Content-Length")) || 0;
    if (length) task.bytes = length;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      task.loaded = received;
      emit();
    }
    const data = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.length;
    }
    return data.buffer;
  }).then(
    (buffer) => {
      finish(key);
      return buffer;
    },
    () => {
      finish(key, true);
      return null;
    },
  );
  audio.prefetch(url, bytes);
}

// ------------------------------------------------------- procedural textures

// The scenery's canvas-drawn textures take over a second to paint (one is
// 180,000 rectangles). They are cached for the page, so paint them while the
// player is idle on the menu instead of on the first deployment screen.
let painting = false;
function paintSceneryTextures() {
  if (painting) return;
  painting = true;
  const jobs = [
    () => weatheredTexture("concrete"),
    () => weatheredTexture("ground"),
    () => streetTexture("asphalt"),
    () => streetTexture("brick"),
    () => streetTexture("paving"),
    () => streetTexture("glass"),
  ];
  const idle = (next: () => void) =>
    "requestIdleCallback" in window
      ? requestIdleCallback(next)
      : setTimeout(next, 50);
  const step = () => {
    jobs.shift()?.();
    if (jobs.length) idle(step);
  };
  idle(step);
}

// ------------------------------------------------------------------ preload

/**
 * Queues every asset a run at this quality needs, most urgent first: the
 * scenery and squad on screen at deployment, then enemies, sounds and bosses.
 */
export function preloadAssets(quality: string) {
  const catalogue = modelCatalogue(quality);
  const urls = [
    ...catalogue.crowd,
    ...catalogue.biomes,
    ...catalogue.enemies,
  ];
  requested = [...urls];
  for (const url of urls) loadModel(url);
  for (const url of audio.sampleUrls()) {
    requested.push(`sound:${url}`);
    prefetchSound(url);
  }
  for (const url of catalogue.bosses) {
    requested.push(url);
    loadModel(url);
  }
  paintSceneryTextures();
  emit();
}

/** Resolves once every download for the requested quality has settled. */
export function whenAssetsLoaded() {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!loadingState().complete) return false;
      unsubscribe();
      resolve();
      return true;
    };
    const unsubscribe = subscribeLoading(check);
    check();
  });
}
