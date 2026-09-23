import { useMemo, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { RNG } from "../game/rng";
import type { Simulation } from "../game/simulation";
import { atmosphereAt, smooth } from "./biomes";
import { presentedDistance } from "./presentation";
export function BiomeAtmosphere({
  sim,
  quality,
}: {
  sim: Simulation;
  quality: string;
}) {
  const points = useMemo(() => {
    const rng = new RNG("biome-ash"),
      count = quality === "high" ? 320 : 120,
      p = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (i % 2 ? -1 : 1) * (7 + rng.next() * 25);
      p[i * 3 + 1] = rng.next() * 14;
      p[i * 3 + 2] = -rng.next() * 120;
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute("position", new T.BufferAttribute(p, 3));
    const material = new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        travel: { value: 0 },
        strength: { value: 0 },
      },
      vertexShader: `uniform float time;uniform float travel;varying float fade;void main(){vec3 p=position;p.z=mod(p.z+travel+120.,140.)-120.;p.y=mod(p.y-time*.23+140.,14.);p.x+=sin(time*.2+position.z)*.6;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(38./-mv.z,1.,3.);fade=1.-smoothstep(45.,110.,-p.z);}`,
      fragmentShader: `uniform float strength;varying float fade;void main(){float d=length(gl_PointCoord-.5);float a=(1.-smoothstep(.12,.5,d))*strength*fade*.45;if(a<.01)discard;gl_FragColor=vec4(.72,.67,.54,a);}`,
    });
    const points = new T.Points(geometry, material);
    points.frustumCulled = false;
    return points;
  }, [quality]);
  useLayoutEffect(
    () => () => {
      points.geometry.dispose();
      points.material.dispose();
    },
    [points],
  );
  useFrame(() => {
    const review = import.meta.env.DEV ? window.__biomeReview : undefined;
    const sample = review?.biome
      ? { from: review.biome, to: review.biome, blend: 0 }
      : review?.from && review.to
        ? {
            from: review.from,
            to: review.to,
            blend: smooth(review.progress ?? 0),
          }
        : atmosphereAt(sim.seed, sim.time);
    points.material.uniforms.strength.value =
      (sample.from === "ash" ? 1 : 0) * (1 - sample.blend) +
      (sample.to === "ash" ? 1 : 0) * sample.blend;
    points.material.uniforms.time.value = sim.time;
    points.material.uniforms.travel.value = presentedDistance(sim) * 2.5;
    points.visible = points.material.uniforms.strength.value > 0.001;
  });
  return <primitive object={points} />;
}
