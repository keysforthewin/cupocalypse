import { PerspectiveCamera, Plane, Ray, Vector3 } from "three";
import { FORMATION_BACK } from "../game/formation";

/** Keep the rear rank above the HUD without changing the camera's viewing angle. */
export function frameSquadRear(
  camera: PerspectiveCamera,
  height: number,
  barTop: number,
  bossHeight = 0,
) {
  camera.position.set(0, 16, 18);
  const pitch = bossHeight
    ? (Math.max(6, 28 - bossHeight * 0.36) * Math.PI) / 180
    : Math.atan2(16, 26);
  camera.fov = bossHeight >= 70 ? 60 : bossHeight ? 56 : 47;
  const target = new Vector3(
    0,
    16 - Math.sin(pitch) * 30,
    18 - Math.cos(pitch) * 30,
  );
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const rearY = barTop - 18; // Space for feet and the small squad-count label.
  const point = new Vector3(0, 1 - (rearY / height) * 2, 0.5).unproject(camera);
  const ray = new Ray(
    camera.position.clone(),
    point.sub(camera.position).normalize(),
  );
  const ground = ray.intersectPlane(
    new Plane(new Vector3(0, 1, 0), 0),
    new Vector3(),
  );
  if (!ground) return;
  const shift = FORMATION_BACK - ground.z;
  camera.position.z += shift;
  target.z += shift;
  camera.lookAt(target);
  camera.updateMatrixWorld();
}
