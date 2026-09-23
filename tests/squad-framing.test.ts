import test from "node:test";
import assert from "node:assert/strict";
import { PerspectiveCamera, Vector3 } from "three";
import {
  crowdEnvelope,
  soldierPosition,
  FORMATION_BACK,
} from "../src/game/formation";
import { frameSquadRear } from "../src/render/squadFraming";
import { Simulation } from "../src/game/simulation";
import { MODES } from "../src/game/types";

test("growth and sideways compression keep the rear fixed while advancing the front", () => {
  for (const mode of MODES) {
    for (const x of [-3.8, 0, 3.8]) {
      let previousFront = Infinity;
      for (const army of [1, 24, 100, 600, 2400]) {
        const crowd = crowdEnvelope(army, mode, x);
        assert.equal(crowd.back, FORMATION_BACK);
        assert.ok(crowd.front < previousFront);
        previousFront = crowd.front;
        const count = Math.min(army, 1600);
        for (const copy of mode === "Mirror" ? [0, 1] : [0]) {
          const rear = soldierPosition(
            count - 1,
            count,
            army,
            x,
            x,
            mode,
            copy,
          );
          assert.ok(Math.abs(rear.z - FORMATION_BACK) < 1e-9);
        }
      }
    }
  }
});

test("camera keeps rear feet above the charge bar across viewport sizes and lateral movement", () => {
  const camera = new PerspectiveCamera(47, 1, 0.1, 180);
  for (const [width, height] of [
    [1440, 900],
    [900, 720],
    [1920, 1080],
  ]) {
    camera.aspect = width / height;
    const barTop = height - (width <= 1200 ? 18 : 24) - 36;
    frameSquadRear(camera, height, barTop);
    for (const x of [-5, 0, 5]) {
      const point = new Vector3(x, 0, FORMATION_BACK).project(camera);
      const pixels = ((1 - point.y) * height) / 2;
      assert.ok(Math.abs(pixels - (barTop - 18)) < 1e-6);
    }
  }
});

test("shots and longitudinal collisions follow the advancing front", () => {
  for (const army of [24, 100, 600]) {
    const s = new Simulation("rear-anchor");
    s.army = army;
    s.launch("pulse", 0, 0, 1);
    const bullet = s.bullets.find((b) => b.active)!;
    assert.ok(-bullet.z < s.crowd.front);
    assert.equal(
      s.exposure(-10, 10, FORMATION_BACK + 0.1, FORMATION_BACK + 2),
      0,
    );
    assert.equal(s.exposure(-10, 10, s.crowd.front, s.crowd.back), army);
  }
});

test("recruitment collects a pickup swept by the advancing front", () => {
  const s = new Simulation("growth-pickup");
  s.nextBoss = s.nextEncounter = s.nextSupply = 1e9;
  s.x = s.crowdX = -2;
  s.spawnGate();
  Object.assign(s.gates[0], {
    z: s.crowd.push + 0.05,
    left: "+",
    a: 400,
    wall: -1,
  });
  s.drops.push({ id: s.id++, x: -2, z: s.crowd.push + 0.1, kind: "damage" });
  s.update({ x: -2 }, false);
  assert.ok(s.army > 400);
  assert.equal(s.boosts.damage, 1);
  assert.equal(s.crowd.back, FORMATION_BACK);
});

test("giant boss heads stay in frame while rear feet remain above the controls", async () => {
  const { NEW_BOSSES, bossDefinition } = await import("../src/game/bosses");
  for (const [width, height] of [
    [900, 720],
    [1200, 900],
    [1920, 1080],
  ])
    for (const kind of NEW_BOSSES) {
      const d = bossDefinition(kind),
        camera = new PerspectiveCamera(47, width / height, 0.1, 400);
      const barTop = height - (width <= 1200 ? 18 : 24) - 36;
      frameSquadRear(camera, height, barTop, d.height);
      // The Witness masks project forward from the skull; testing only the
      // model origin missed their clipping during the quality-pass review.
      const forwardMaskDepth = kind === "The Last Witness" ? 32 : 0;
      const head = new Vector3(
        0,
        d.height * (forwardMaskDepth ? 1.03 : 1),
        -d.arenaZ - d.visualZ + forwardMaskDepth,
      ).project(camera);
      assert.ok(
        head.y < 0.97 && head.y > -0.8,
        `${kind}/${width}: head cropped`,
      );
      const rear = new Vector3(0, 0, FORMATION_BACK).project(camera);
      assert.ok(Math.abs(((1 - rear.y) * height) / 2 - (barTop - 18)) < 1e-6);
    }
});
