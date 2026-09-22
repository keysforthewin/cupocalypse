import * as T from "three";
import test from "node:test";
import assert from "node:assert/strict";
import {
  roadChunkZ,
  ROAD_CHUNK_COUNT,
  ROAD_CHUNK_LENGTH,
  ROAD_NEAR_RECYCLE,
  ROAD_FAR_RECYCLE,
  CITY_MAX_HEIGHT,
  SUN_OFFSET,
  SUN_TARGET,
  SHADOW_BOUNDS,
  FOG_FAR,
} from "../src/render/roadMath";
import { steer } from "../src/game/steering";
import { selectedGate, bulletGate } from "../src/game/gateLayout";
import { Simulation } from "../src/game/simulation";
import {
  beforeTick,
  setFrameAlpha,
  presentedX,
  presentedDistance,
} from "../src/render/presentation";
test("road remains contiguous through repeated recycling; wraps outside view", () => {
  for (let displacement = 0; displacement < 1000; displacement += 0.37) {
    const zs = Array.from({ length: ROAD_CHUNK_COUNT }, (_, i) =>
      roadChunkZ(i, displacement),
    ).sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++)
      assert.ok(Math.abs(zs[i] - zs[i - 1] - ROAD_CHUNK_LENGTH) < 1e-9);
    for (let i = 0; i < ROAD_CHUNK_COUNT; i++) {
      const old = roadChunkZ(i, displacement),
        next = roadChunkZ(i, displacement + 0.01);
      if (next < old)
        assert.ok(
          old > ROAD_NEAR_RECYCLE - 0.02 && next < ROAD_FAR_RECYCLE + 0.02,
        );
      else assert.ok(Math.abs(next - old - 0.01) < 1e-9);
    }
  }
});
test("held steering accelerates continuously, brakes promptly, reverses and respects bounds", () => {
  let state = { target: 0, velocity: 0 };
  let last = 0;
  for (let i = 0; i < 20; i++) {
    state = steer(state.target, state.velocity, 1);
    assert.ok(state.target > last);
    last = state.target;
  }
  const release = state.target;
  for (let i = 0; i < 10; i++) state = steer(state.target, state.velocity, 0);
  assert.equal(state.velocity, 0);
  assert.ok(state.target - release < 0.25);
  for (let i = 0; i < 100; i++) state = steer(state.target, state.velocity, -1);
  assert.equal(state.target, -3.8);
  assert.equal(state.velocity, 0);
});
test("reward lanes have an unambiguous center gap, including mirrored bullets", () => {
  assert.equal(selectedGate(0), undefined);
  assert.equal(selectedGate(-3), "a");
  assert.equal(selectedGate(3), "b");
  assert.equal(bulletGate(-3.95, "Mirror"), "a");
  assert.equal(bulletGate(0.95, "Mirror"), "b");
  assert.equal(bulletGate(2.45, "Mirror"), undefined);
  for (const x of [0, -3, 3]) {
    const s = new Simulation("gate-layout");
    s.nextBoss = s.nextEncounter = 1e9;
    s.fireClock = 100;
    s.x = x;
    s.spawnGate();
    Object.assign(s.gates[0], { z: 0.05, left: "+", a: 10, right: "+", b: 20 });
    const army = s.army;
    s.update({ x });
    assert.equal(s.army, army + (x === 0 ? 0 : x < 0 ? 10 : 20));
  }
});
test("render interpolation preserves simulation and fills between fixed ticks", () => {
  const s = new Simulation("interpolation");
  beforeTick(s);
  s.update({ x: 3 });
  setFrameAlpha(s, 0.5);
  assert.equal(presentedX(s), s.x * 0.5);
  assert.equal(presentedDistance(s), s.distance * 0.5);
  assert.equal(s.tick, 1);
});

test("city recycling and the entire visible receiver corridor retain shadow casters", () => {
  const shadowReach = CITY_MAX_HEIGHT * Math.abs(SUN_OFFSET[2] / SUN_OFFSET[1]);
  assert.ok(
    ROAD_FAR_RECYCLE + ROAD_CHUNK_LENGTH / 2 + shadowReach < -FOG_FAR - 20,
  );
  assert.ok(ROAD_NEAR_RECYCLE - ROAD_CHUNK_LENGTH / 2 > 40);
  const b = SHADOW_BOUNDS;
  const camera = new T.OrthographicCamera(
    b.left,
    b.right,
    b.top,
    b.bottom,
    b.near,
    b.far,
  );
  camera.position.set(
    SUN_TARGET[0] + SUN_OFFSET[0],
    SUN_TARGET[1] + SUN_OFFSET[1],
    SUN_TARGET[2] + SUN_OFFSET[2],
  );
  camera.lookAt(new T.Vector3(...SUN_TARGET));
  camera.updateMatrixWorld(true);
  // Includes off-screen rooftops that can project onto the visible road.
  for (const x of [-50, 50])
    for (const y of [0, CITY_MAX_HEIGHT + 2])
      for (const z of [-180, 50]) {
        const p = new T.Vector3(x, y, z).project(camera);
        assert.ok(
          Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98 && Math.abs(p.z) < 0.98,
          `clipped caster ${x},${y},${z}: ${p.toArray()}`,
        );
      }
});
