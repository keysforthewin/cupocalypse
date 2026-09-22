import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { Simulation } from "../game/simulation";
import type { SuperCast } from "../game/superSystem";
import { SUPERS } from "../game/superWeapons";

const vertex = `varying vec2 vUv;varying vec3 vColor;void main(){vUv=uv;vColor=instanceColor;vec4 p=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);p.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*p;}`;
const fragment = `varying vec2 vUv;varying vec3 vColor;uniform float kind,life;void main(){vec2 p=(vUv-.5)*2.;float a;if(kind<.5){a=exp(-dot(p,p)*4.)*(1.-smoothstep(.65,1.,length(p)));}else if(kind<1.5){a=max((1.-smoothstep(.19,.27,abs(p.x)))*(1.-smoothstep(.67,.82,abs(p.y))),(1.-smoothstep(.19,.27,abs(p.y)))*(1.-smoothstep(.67,.82,abs(p.x))));}else{float d=min(abs(p.x-p.y),abs(p.x+p.y));a=(1.-smoothstep(.09,.17,d))*(1.-smoothstep(.6,.88,length(p)));}gl_FragColor=vec4(vColor*(1.+a*.25),a*life);}`;

/** Signature accents use cast/event time, with no independent animation clock. */
export function SuperSignatureDetails({
  sim,
  cast: c,
}: {
  sim: Simulation;
  cast: SuperCast;
}) {
  const particles = useRef<T.InstancedMesh>(null),
    coins = useRef<T.InstancedMesh>(null),
    cards = useRef<T.Group>(null);
  const wallBreak = useRef([-1, -1, -1]);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const instanceColors = useMemo(
    () => new T.InstancedBufferAttribute(new Float32Array(96 * 3).fill(1), 3),
    [],
  );
  const work = useMemo(
    () => ({
      dummy: new T.Object3D(),
      color: new T.Color(),
      from: new T.Vector3(),
      to: new T.Vector3(),
    }),
    [],
  );
  const mat = useMemo(
    () =>
      new T.ShaderMaterial({
        uniforms: {
          kind: { value: c.id === "doc" ? 1 : c.id === "so1ician" ? 2 : 0 },
          life: { value: 1 },
        },
        vertexShader: vertex,
        fragmentShader: fragment,
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
      }),
    [c.id],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame(() => {
    if (!particles.current) return;
    const t = (sim.tick - c.start) / 60,
      remaining = (c.end - sim.tick) / 60,
      d = SUPERS[c.id],
      { dummy, color, from, to } = work;
    const life =
      T.MathUtils.smoothstep(t, 0, 0.14) *
      T.MathUtils.smoothstep(remaining, 0, 0.4);
    mat.uniforms.life.value = life * 0.78;
    let n = 0;
    const put = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      tint: string,
    ) => {
      if (n >= 96 || w <= 0) return;
      dummy.position.set(x, y, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w, h, 1);
      dummy.updateMatrix();
      particles.current!.setMatrixAt(n, dummy.matrix);
      particles.current!.setColorAt(n++, color.set(tint));
    };
    if (c.id === "hondo") {
      for (let lane = 0; lane < 3; lane++) {
        if (c.walls[lane] <= 0 && wallBreak.current[lane] < 0)
          wallBreak.current[lane] = sim.tick;
        if (wallBreak.current[lane] < 0) continue;
        const age = (sim.tick - wallBreak.current[lane]) / 60;
        if (age > 0.6) continue;
        for (let j = 0; j < (reduced ? 3 : 9); j++) {
          const a = j * 2.399,
            u = reduced ? 0.06 : age;
          put(
            (lane - 1) * 3 + Math.cos(a) * (0.3 + u * 2),
            Math.max(0.1, 0.8 + Math.sin(a) * u * 2 - u * u * 3),
            -(sim.crowd.push + 8) + Math.sin(a) * u,
            0.22 * (1 - age / 0.6),
            0.12 * (1 - age / 0.6),
            j % 3 ? d.color : d.accent,
          );
        }
      }
    }
    const count = reduced ? 10 : 32;
    if (c.id === "nitro")
      for (let i = 0; i < count; i++) {
        const u = reduced ? (i + 0.5) / count : (t * 2.7 + i * 0.618) % 1,
          side = i % 2 ? 1 : -1;
        put(
          sim.x + side * (0.8 + u * 0.55),
          0.5 + u * 0.25,
          -sim.crowd.push - 1 - u * 4.5,
          0.035 + u * 0.035,
          0.32 * (1 - u) + 0.02,
          i % 3 === 0 ? d.accent : d.color,
        );
      }
    if (c.id === "baezil" || c.id === "haut-carl")
      for (let i = 0; i < count; i++) {
        const point = c.points[i % c.points.length];
        if (!point) continue;
        const u = reduced ? 0.4 : (t * 0.65 + i * 0.618) % 1,
          a = i * 2.399,
          r = 0.45 + (i % 5) * 0.34;
        put(
          point.x + Math.sin(a) * r,
          0.12 + u * 1.5,
          -point.z + Math.cos(a) * r,
          0.1 * (1 - u),
          0.19 * (1 - u),
          i % 4 === 0 ? d.accent : d.color,
        );
      }
    if (c.id === "doc" && t < 1.65)
      for (let i = 0; i < 12; i++) {
        const u = (t - i * 0.025) / 1.25;
        if (u < 0 || u > 1) continue;
        const a = i * 2.399,
          r = 0.6 + (i % 4) * 0.47;
        put(
          sim.x + Math.cos(a) * r,
          0.3 + (reduced ? 0.2 : u * 2),
          -(sim.crowd.push + 1) + Math.sin(a) * r,
          0.18 * (1 - u),
          0.18 * (1 - u),
          i % 3 === 0 ? d.accent : d.color,
        );
      }
    if (c.id === "meesh")
      for (let i = 0; i < (reduced ? 6 : 16); i++) {
        const u = reduced ? i / 16 : (t * 0.23 + i * 0.618) % 1,
          a = i * 2.399 + (reduced ? 0 : t * 0.16);
        put(
          sim.x + Math.cos(a) * 2.3,
          0.3 + u * 1.5,
          -sim.crowd.push - 1 + Math.sin(a) * 2.3,
          0.12 * Math.sin(u * Math.PI),
          0.55 * Math.sin(u * Math.PI),
          d.color,
        );
      }
    if (c.id === "gimmy") {
      const hits = sim.supers.events
        .filter(
          (e) =>
            e.id === c.id &&
            e.kind === "hit" &&
            e.tick >= c.start &&
            sim.tick - e.tick < 36,
        )
        .slice(-24);
      for (const e of hits) {
        const u = T.MathUtils.smoothstep(sim.tick - e.tick, 0, 32);
        from.set(e.x, 0.7, -e.z);
        to.set(e.tx ?? sim.x, 1, -(e.tz ?? 0));
        from.lerp(to, reduced ? 1 : u);
        from.x += reduced ? 0 : Math.sin(u * Math.PI) * 0.65;
        from.y += reduced ? 0 : Math.sin(u * Math.PI) * 1.2;
        put(
          from.x,
          from.y,
          from.z,
          0.2 * (1 - u) + 0.04,
          0.2 * (1 - u) + 0.04,
          d.accent,
        );
      }
    }
    if (c.id === "so1ician")
      for (const e of sim.supers.events
        .filter(
          (e) =>
            e.id === c.id &&
            e.kind === "hit" &&
            e.tick >= c.start &&
            sim.tick - e.tick < 24,
        )
        .slice(-12)) {
        const u = (sim.tick - e.tick) / 24;
        put(
          e.tx ?? e.x,
          2.3,
          -(e.tz ?? e.z),
          0.85 * (1 - u),
          0.85 * (1 - u),
          d.accent,
        );
      }
    particles.current.count = n;
    particles.current.instanceMatrix.needsUpdate = true;
    if (particles.current.instanceColor)
      particles.current.instanceColor.needsUpdate = true;
    if (coins.current) {
      const hits = sim.supers.events
        .filter(
          (e) =>
            e.id === "pauly" &&
            e.kind === "hit" &&
            e.tick >= c.start &&
            sim.tick - e.tick < 18,
        )
        .slice(-16);
      let count = 0;
      for (const e of hits) {
        const u = T.MathUtils.clamp((sim.tick - e.tick) / 12, 0, 1);
        from.set(e.x, 1.2, -e.z);
        to.set(e.tx ?? e.x, 1.25, -(e.tz ?? e.z));
        dummy.position.copy(from).lerp(to, reduced ? 1 : u);
        dummy.position.y += reduced ? 0 : Math.sin(u * Math.PI) * 1.2;
        dummy.rotation.set(Math.PI / 2, reduced ? 0 : u * 9, 0);
        dummy.scale.setScalar((1 - u) * 0.55 + 0.6);
        dummy.updateMatrix();
        coins.current.setMatrixAt(count++, dummy.matrix);
      }
      coins.current.count = count;
      coins.current.instanceMatrix.needsUpdate = true;
    }
    if (cards.current) {
      const gate = sim.gates.find((g) => !g.passed && g.z > 0 && g.z < 48);
      cards.current.position.set(
        gate ? 0 : sim.x,
        gate ? 4.8 : 2.6,
        -(gate ? gate.z : sim.crowd.push + 2),
      );
      cards.current.children.forEach((card, i) => {
        card.visible = i < 3 - c.count;
        card.rotation.y = reduced ? 0 : Math.sin(t * 0.6 + i) * 0.12;
        card.rotation.z = (i - 1) * -0.15;
        card.position.set(
          (i - 1) * 0.74,
          reduced ? 0 : Math.sin(t + i) * 0.025,
          0,
        );
        card.scale.setScalar(life);
      });
    }
  });
  const d = SUPERS[c.id];
  return (
    <>
      <instancedMesh
        ref={particles}
        args={[undefined, undefined, 96]}
        frustumCulled={false}
        instanceColor={instanceColors}
        material={mat}
      >
        <planeGeometry />
      </instancedMesh>
      {c.id === "pauly" && (
        <instancedMesh
          ref={coins}
          args={[undefined, undefined, 16]}
          frustumCulled={false}
        >
          <cylinderGeometry args={[0.19, 0.19, 0.042, 24]} />
          <meshStandardMaterial
            color={d.color}
            emissive={d.color}
            emissiveIntensity={0.35}
            metalness={0.75}
            roughness={0.26}
          />
        </instancedMesh>
      )}
      {c.id === "kismet" && (
        <group ref={cards}>
          {[0, 1, 2].map((i) => (
            <group key={i}>
              <mesh>
                <boxGeometry args={[0.61, 0.95, 0.045]} />
                <meshStandardMaterial
                  color={d.color}
                  metalness={0.72}
                  roughness={0.27}
                />
              </mesh>
              <mesh position={[0, 0, 0.03]}>
                <planeGeometry args={[0.54, 0.87]} />
                <meshBasicMaterial color="#15232c" />
              </mesh>
              <mesh position={[0, 0, 0.05]} scale={[0.85, 1.2, 0.25]}>
                <octahedronGeometry args={[0.19]} />
                <meshBasicMaterial color={d.accent} />
              </mesh>
              {Array.from({ length: i + 1 }, (_, n) => (
                <mesh key={n} position={[(n - i * 0.5) * 0.11, -0.31, 0.05]}>
                  <planeGeometry args={[0.05, 0.025]} />
                  <meshBasicMaterial color={d.color} />
                </mesh>
              ))}
              <mesh position={[-0.18, 0.3, 0.05]}>
                <planeGeometry args={[0.08, 0.018]} />
                <meshBasicMaterial color={d.color} />
              </mesh>
            </group>
          ))}
        </group>
      )}
    </>
  );
}
