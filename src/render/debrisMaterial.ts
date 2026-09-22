import * as T from "three";
import type { DebrisKind } from "./debris";

export function debrisMaterial(kind: DebrisKind) {
  if (kind === "spark") return new T.MeshBasicMaterial({ toneMapped: false });
  const organic = kind === "chunk" || kind === "head";
  const material = new T.MeshStandardMaterial({
    roughness: organic ? 0.48 : kind === "plate" ? 0.52 : 0.88,
    metalness: kind === "plate" ? 0.38 : 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `varying vec3 vFragmentPosition;\n` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "#include <begin_vertex>\nvFragmentPosition = position;",
    );
    shader.fragmentShader =
      `varying vec3 vFragmentPosition;
      float debrisNoise(vec3 p) { return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
    ` + shader.fragmentShader;
    const torn = kind === "torso" || kind === "limb" || kind === "head";
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      float grain = debrisNoise(floor(vFragmentPosition * 23.));
      diffuseColor.rgb *= .70 + grain * .35;
      ${
        torn
          ? `float tear = smoothstep(.25,.48,abs(vFragmentPosition.y) + (grain-.5)*.19);
      diffuseColor.rgb = mix(diffuseColor.rgb,vec3(.12,.016,.012),tear*.8);`
          : ""
      }
    `,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <roughnessmap_fragment>",
      `#include <roughnessmap_fragment>
      roughnessFactor = clamp(roughnessFactor + (grain-.5)*.18, .25, .98);
    `,
    );
  };
  material.customProgramCacheKey = () => `debris-surface-${kind}-v1`;
  return material;
}
