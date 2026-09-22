import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { SUPER_IDS } from "../src/game/superWeapons";
import { superModel, disposeSuperModel } from "../src/render/superModels";
import {
  superPreviewFraming,
  SUPER_PREVIEW_HEIGHT,
  SUPER_PREVIEW_SWAY,
} from "../src/render/superPreviewFraming";

test("all super sculptures remain framed throughout a turntable sweep at desktop and narrow armory sizes", () => {
  for (const id of SUPER_IDS) {
    const model = superModel(id);
    for (const aspect of [410 / 190, 280 / 160]) {
      const fit = superPreviewFraming(model, id, aspect),
        h = SUPER_PREVIEW_HEIGHT;
      const camera = new T.OrthographicCamera(
        (-h * aspect) / 2,
        (h * aspect) / 2,
        h / 2,
        -h / 2,
        0.1,
        100,
      );
      camera.position.set(0, 0, 12);
      camera.updateMatrixWorld();
      for (const sway of [
        -SUPER_PREVIEW_SWAY,
        -SUPER_PREVIEW_SWAY / 2,
        0,
        SUPER_PREVIEW_SWAY / 2,
        SUPER_PREVIEW_SWAY,
      ]) {
        const rotation = new T.Matrix4().makeRotationFromEuler(
          new T.Euler(fit.pitch, fit.yaw + sway, 0),
        );
        const v = new T.Vector3();
        let width = 0,
          height = 0;
        model.traverse((o) => {
          if (!(o instanceof T.Mesh)) return;
          const vertices = o.geometry.getAttribute("position");
          for (let i = 0; i < vertices.count; i++) {
            v.fromBufferAttribute(vertices, i)
              .applyMatrix4(o.matrixWorld)
              .sub(fit.center)
              .multiplyScalar(fit.scale)
              .applyMatrix4(rotation)
              .project(camera);
            assert.ok(
              Number.isFinite(v.x) &&
                Number.isFinite(v.y) &&
                Math.abs(v.x) < 0.84 &&
                Math.abs(v.y) < 0.84,
              `${id}: clipped turntable pose`,
            );
            width = Math.max(width, Math.abs(v.x));
            height = Math.max(height, Math.abs(v.y));
          }
        });
        assert.ok(
          Math.max(width, height) > 0.38,
          `${id}: excessive empty space in preview`,
        );
      }
    }
    disposeSuperModel(model);
  }
});

import { superTraceProgress } from "../src/render/superTraceProgress";

test("super projectile trails never extend beyond the muzzle or target", () => {
  for (let tick = 0; tick <= 48; tick++) {
    const [tail, tip] = superTraceProgress(tick / 60);
    assert.ok(
      tail >= 0 && tail <= tip && tip <= 1,
      `unbounded trail at tick ${tick}`,
    );
  }
  assert.deepEqual(
    superTraceProgress(0.2),
    [1, 1],
    "old hits must collapse rather than form off-screen streaks",
  );
});
