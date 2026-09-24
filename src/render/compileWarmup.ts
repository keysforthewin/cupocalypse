import type { Camera, Object3D, Scene, WebGLRenderer } from "three";

/** Warm-up may outlive a React material that is replaced during redeployment. */
export function compileWarmup(
  renderer: Pick<WebGLRenderer, "compile" | "properties">,
  object: Object3D,
  camera: Camera,
  scene?: Scene,
): Promise<void> {
  const materials = renderer.compile(object, camera, scene);
  return new Promise((resolve, reject) => {
    const check = () => {
      try {
        for (const material of materials) {
          const { currentProgram: program } = renderer.properties.get(
            material,
          ) as {
            currentProgram?: { isReady(): boolean };
          };
          // Disposing a material removes its renderer properties. It no longer
          // needs warming; three.js compileAsync assumes it still has a program
          // and otherwise throws in its timer, leaving the promise pending.
          if (!program || program.isReady()) materials.delete(material);
        }
        if (materials.size) setTimeout(check, 10);
        else resolve();
      } catch (error) {
        reject(error);
      }
    };
    check();
  });
}
