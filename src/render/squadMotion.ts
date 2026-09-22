import * as T from "three";
import type { Simulation } from "../game/simulation";

export interface SquadMotionState {
  simulation: Simulation;
  tick: number;
  x: number;
  velocity: number;
}
export function advanceSquadMotion(state: SquadMotionState, sim: Simulation) {
  if (state.simulation !== sim || sim.tick < state.tick) {
    state.simulation = sim;
    state.tick = sim.tick;
    state.x = sim.x;
    state.velocity = 0;
  }
  const dt = (sim.tick - state.tick) / 60;
  if (dt > 0) {
    const velocity = Math.max(-1, Math.min(1, (sim.x - state.x) / dt / 6));
    state.velocity += (velocity - state.velocity) * (1 - Math.exp(-dt * 14));
    state.x = sim.x;
    state.tick = sim.tick;
  }
}

// Deform the normalized static soldier around anatomical pivots on the GPU.
// Both the color and shadow passes use the same hip/knee/shoulder articulation.
// Instance phases keep a large crowd animated without per-soldier draw calls.
export function squadMaterial(
  source: T.Material,
  uniforms: { time: { value: number }; lateral: { value: number } },
  depth = false,
) {
  const material = depth
    ? new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking })
    : source.clone();
  if (material instanceof T.MeshStandardMaterial) {
    material.metalness = 0.08;
    material.roughness = 0.82;
  }
  material.onBeforeCompile = (shader) => {
    shader.uniforms.squadTime = uniforms.time;
    shader.uniforms.squadLateral = uniforms.lateral;
    shader.vertexShader =
      `
      uniform float squadTime;
      uniform float squadLateral;
      attribute float soldierPhase;
      attribute float formationSign;
      mat3 rotateX(float a) { float c=cos(a),s=sin(a); return mat3(1.,0.,0.,0.,c,s,0.,-s,c); }
      mat3 rotateZ(float a) { float c=cos(a),s=sin(a); return mat3(c,s,0.,-s,c,0.,0.,0.,1.); }
      vec3 pivot(vec3 p, vec3 o, mat3 r) { return o + r*(p-o); }
      void soldierMotion(inout vec3 p, inout vec3 n) {
        float lateral = -squadLateral * formationSign;
        float strafe = abs(lateral);
        float phase = squadTime * 14.0 + soldierPhase;
        float side = p.x < 0.0 ? -1.0 : 1.0;
        float stride = sin(phase + (side < 0.0 ? 3.14159265 : 0.0));
        float leg = 1.0 - smoothstep(.76,.92,p.y);
        float knee = 1.0 - smoothstep(.37,.51,p.y);
        // Lift the recovery foot, open the leading leg sideways, then bring the trailing foot through.
        float flex = max(0.0,-stride) * (.7 + strafe*.35);
        mat3 k = rotateX(-flex*knee);
        p = pivot(p,vec3(side*.14,.44,0.),k); n=k*n;
        mat3 h = rotateZ((stride*lateral*.65 + side*.055*strafe)*leg) * rotateX(stride*.5*(1.0-strafe*.8)*leg);
        p = pivot(p,vec3(side*.14,.83,0.),h); n=h*n;
        float arm = smoothstep(.23,.36,abs(p.x))*smoothstep(.84,1.08,p.y)*(1.0-smoothstep(1.40,1.55,p.y));
        mat3 a = rotateX((-.12-stride*.18)*arm);
        p=pivot(p,vec3(side*.30,1.39,0.),a); n=a*n;
        float torso = smoothstep(.8,1.25,p.y);
        mat3 lean = rotateZ(-lateral*.10*torso);
        p=pivot(p,vec3(0.,.83,0.),lean); n=lean*n;
        // Keep the straight support leg planted as the hips open sideways.
        float support = abs(sin(phase));
        float hx = support*.5*(1.0-strafe*.8);
        float hz = support*lateral*.65;
        p.y -= .83*(1.0-cos(hx)*cos(hz));
        p.y += .012*abs(cos(phase));
      }
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <beginnormal_vertex>",
      "#include <beginnormal_vertex>\nvec3 motionPosition = position;\nsoldierMotion(motionPosition, objectNormal);",
    );
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      "vec3 transformed = position; vec3 motionNormal = normal; soldierMotion(transformed, motionNormal);",
    );
  };
  material.customProgramCacheKey = () => "squad-articulation-v1";
  return material;
}
