import * as T from "three";
export { sculptSuper as superModel } from "./superSculpture";
export function disposeSuperModel(root: T.Object3D) {
  const materials = new Set<T.Material>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
    }
  });
  materials.forEach((m) => m.dispose());
}
