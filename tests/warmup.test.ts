import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { compileWarmup } from "../src/render/compileWarmup";

test("redeployment shader warm-up tolerates disposed materials while waiting for live shaders", async () => {
  const removed = new T.MeshBasicMaterial();
  const live = new T.MeshBasicMaterial();
  let ready = false;
  const properties = new Map<
    T.Material,
    { currentProgram: { isReady: () => boolean } }
  >([
    [removed, { currentProgram: { isReady: () => false } }],
    [live, { currentProgram: { isReady: () => ready } }],
  ]);
  const renderer = {
    compile: () => new Set([removed, live]),
    properties: {
      get: (material: T.Material) => properties.get(material) ?? {},
    },
  } as unknown as Pick<T.WebGLRenderer, "compile" | "properties">;
  let finished = false;
  const warmup = compileWarmup(renderer, new T.Scene(), new T.Camera()).then(
    () => {
      finished = true;
    },
  );
  properties.delete(removed);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(finished, false);
  ready = true;
  await warmup;
  assert.equal(finished, true);
  removed.dispose();
  live.dispose();
});
