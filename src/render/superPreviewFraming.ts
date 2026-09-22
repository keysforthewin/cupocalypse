import * as T from "three";
import type { SuperId } from "../game/superWeapons";

export const SUPER_PREVIEW_HEIGHT = 4.1;
export const SUPER_PREVIEW_SWAY = 0.22;
/** Orthographic product framing, including the complete turntable sweep.
 * Projected width matters for long animals; depth alone must never shrink them. */
export function superPreviewFraming(
  model: T.Object3D,
  id: SuperId,
  aspect: number,
) {
  const bounds = new T.Box3().setFromObject(model),
    center = bounds.getCenter(new T.Vector3());
  const yaw = ["platypus", "bronze-leopard"].includes(id) ? -0.7 : -0.16,
    pitch = 0.12;
  let halfWidth = 0,
    halfHeight = 0;
  const p = new T.Vector3(),
    matrix = new T.Matrix4();
  for (const sway of [-SUPER_PREVIEW_SWAY, 0, SUPER_PREVIEW_SWAY]) {
    matrix.makeRotationFromEuler(new T.Euler(pitch, yaw + sway, 0));
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          p.set(x, y, z).sub(center).applyMatrix4(matrix);
          halfWidth = Math.max(halfWidth, Math.abs(p.x));
          halfHeight = Math.max(halfHeight, Math.abs(p.y));
        }
  }
  const scale = Math.min(
    (SUPER_PREVIEW_HEIGHT * 0.38) / Math.max(0.01, halfHeight),
    (SUPER_PREVIEW_HEIGHT * aspect * 0.38) / Math.max(0.01, halfWidth),
  );
  return { center, scale, yaw, pitch };
}
