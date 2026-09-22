import { superTraceProgress } from "./superTraceProgress";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import type { Simulation } from "../game/simulation";
import type { SuperCast } from "../game/superSystem";
import { SUPERS, type SuperId } from "../game/superWeapons";

const vertex = `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const fragment = `
 varying vec2 vUv;
 uniform vec3 color,accent; uniform float time,life,mode,seed;
 float line(float d,float width){return 1.-smoothstep(width,width+0.008,abs(d));}
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
 void main(){
  vec2 p=(vUv-.5)*2.;float r=length(p),a=atan(p.y,p.x);float hot=0.,mist=0.;
  float n=noise(p*7.+vec2(time*.31,seed));
  if(mode<.5){ // Thorn sigils: fine engraving around a ragged burning interior.
   float edge=.72+.055*sin(a*9.+seed)+.025*sin(a*17.-time);
   hot=line(r-edge,.012)*(.6+.4*sin(a*7.+time)*sin(a*7.+time));
   hot+=line(r-.9,.008)*step(.35,sin(a*12.+seed));
   hot+=line(sin(a*3.+r*8.+seed)*.1,.008)*(1.-smoothstep(.4,.72,r))*.35;
   mist=pow(max(0.,1.-r),2.)*(.12+.24*n);
  }else if(mode<1.5){ // Moving water: a broken crest, thin foam strands and a diffuse wake.
   float wave=p.y+.15*sin(p.x*5.+time*2.)+.05*sin(p.x*13.-time*4.);
   hot=line(wave,.025)*(.5+.5*n)+line(wave+.22,.012)*.6;
   mist=exp(-abs(wave+.28)*6.)*.18*(.4+n);
   hot*=(1.-smoothstep(.6,1.,abs(p.x)));
  }else if(mode<2.5){ // River corridor: streamlines running in the direction of travel.
   float bend=.025*sin(p.y*17.+time*1.6);
   hot=line(abs(p.x+bend)-.88,.014)*.75;
   for(int i=0;i<5;i++){float x=-.62+float(i)*.31;float flow=sin(p.y*31.+time*(3.+float(i)*.3)+float(i)*2.);
    hot+=line(p.x+bend-x,.005)*pow(max(0.,flow),6.)*.65;}
   mist=(1.-smoothstep(.75,1.,abs(p.x)))*.075*(.6+n);
  }else if(mode<3.5){ // Ten Count: dashed anticipation, then a sharp longitudinal strike.
   float phase=fract(time);float strike=exp(-max(0.,phase-.5)*12.)*step(.5,phase);
   hot=line(abs(p.x)-.8,.01)*(.3+strike)+line(p.x,.025)*strike*1.8;
   hot+=line(abs(p.x)-.62,.01)*step(.65,fract(vUv.y*28.-time))*(1.-strike)*.4;
   mist=exp(-abs(p.x)*4.)*strike*.35;
  }else if(mode<4.5){ // Solar lance: white-hot core, turbulent corona and separate filaments.
   float width=.035+.012*sin(p.y*38.-time*18.);
   hot=exp(-abs(p.x)/width)*2.;
   hot+=line(abs(p.x+.02*sin(p.y*29.-time*9.))-.19,.007)*.32;
   mist=exp(-abs(p.x)*7.)*(.23+n*.2);
  }else if(mode<5.5){ // Salvage: inward spirals, never an expanding damage warning.
   hot=line(sin(a*3.+r*16.+time*5.)*.11,.008)*smoothstep(.1,.4,r)*(1.-smoothstep(.65,1.,r))*.7;
   mist=exp(-r*5.)*.15;
  }else if(mode<6.5){ // Stasis/phase: broken clock ticks and very thin orbital bands.
   hot=line(r-.72,.008)*step(.75,sin(a*32.))* .7;
   hot+=line(r-.91,.008)*step(.25,sin(a*3.+seed));
   mist=exp(-r*3.)*.08;
  }else if(mode<7.5){ // Impact shock front with a soft trailing pressure gradient.
   float radius=mix(.04,.89,clamp(time,0.,1.));
   hot=line(r-radius+seed*.012*sin(a*11.),mix(.008,.002,seed))*(1.-time)*mix(1.4,.75,seed);
   mist=exp(-abs(r-radius)*28.)*(1.-time)*.22;
  }else if(mode<8.5){ // Reversal chevrons moving back toward their source.
   float chevron=abs(p.x)*.35;float q=fract(vUv.y*9.-time*1.2+chevron);
   hot=line(q-.5,.022)*(1.-smoothstep(.45,1.,abs(p.x)))*.6;
   mist=.025;
  }else if(mode<9.5) { // Sacred lattice / protection: segmented perimeter with a quiet interior.
   float hex=cos(floor(.5+a/1.0472)*1.0472-a)*r;
   hot=line(hex-.73,.008)+line(hex-.83,.006)*.4;
   hot*=.55+.45*step(.5,sin(a*18.+seed));
   mist=exp(-r*4.)*.08;
  }else if(mode<10.5) {
   hot=line(r-.986,.004)*.85;
   mist=smoothstep(.86,.98,r)*.24*(.5+n*.5);
   float angular=smoothstep(0.,.14,a)*(1.-smoothstep(2.65,2.98,a));
   hot*=angular;mist*=angular;
  }else {
   float border=.76+(n-.5)*.16;
   hot=line(r-border,.007)*(.2+.35*n);
   hot+=pow(max(0.,noise(p*18.+time*.16)-.68),2.)*12.*(1.-smoothstep(.4,.75,r));
   mist=(1.-smoothstep(.1,.85,r))*(.09+.11*n);
  }
  float edge=(1.-smoothstep(.93,1.,abs(p.x)))*(1.-smoothstep(.93,1.,abs(p.y)));
  float alpha=clamp((hot+mist)*life*edge,0.,.92);
  gl_FragColor=vec4(mix(color,accent,clamp(hot*.65,0.,1.))*(1.+hot*.6),alpha);
 }`;
function fieldMaterial(id: SuperId, mode: number, seed = 0) {
  return new T.ShaderMaterial({
    uniforms: {
      color: { value: new T.Color(SUPERS[id].color) },
      accent: { value: new T.Color(SUPERS[id].accent) },
      time: { value: 0 },
      life: { value: 0 },
      mode: { value: mode },
      seed: { value: seed },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.AdditiveBlending,
    toneMapped: false,
  });
}
const envelope = (t: number, remaining: number) =>
  T.MathUtils.smoothstep(t, 0, 0.22) *
  T.MathUtils.smoothstep(remaining, 0, 0.55);

/** Terrain-aligned effects use the same positions and extents as the authoritative power. */
export function SuperGround({
  sim,
  cast: c,
}: {
  sim: Simulation;
  cast: SuperCast;
}) {
  const ref = useRef<T.Group>(null);
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const mode =
    c.id === "haut-carl"
      ? 11
      : c.id === "tuna"
        ? 1
        : c.id === "shannondoa"
          ? 2
          : c.id === "five10"
            ? 3
            : c.id === "rae"
              ? 4
              : c.id === "gimmy"
                ? 5
                : ["sybex", "meesh"].includes(c.id)
                  ? 6
                  : c.id === "platypus"
                    ? 8
                    : ["baezil", "haut-carl", "kuttula", "strawberry"].includes(
                          c.id,
                        )
                      ? 0
                      : 9;
  const count =
    c.id === "baezil"
      ? 3
      : ["haut-carl", "kuttula"].includes(c.id)
        ? 6
        : c.id === "five10"
          ? 2
          : 1;
  const materials = useMemo(
    () =>
      Array.from({ length: count }, (_, i) =>
        fieldMaterial(c.id, mode, i * 1.9),
      ),
    [c.id, mode, count],
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useFrame(() => {
    if (!ref.current) return;
    const t = (sim.tick - c.start) / 60,
      life = envelope(t, (c.end - sim.tick) / 60);
    ref.current.children.forEach((o, i) => {
      const m = materials[i];
      m.uniforms.time.value = reduced && mode !== 3 ? 0 : t;
      m.uniforms.life.value = life;
      o.visible = true;
      o.position.set(sim.x, 0.075, -(sim.crowd.push + 1));
      o.scale.set(6, 6, 1);
      if (c.id === "baezil" || c.id === "haut-carl") {
        const p = c.points[i];
        o.visible = !!p;
        if (p) {
          o.position.set(p.x, 0.08, -p.z);
          o.scale.set(5.5, 5.5, 1);
        }
      } else if (c.id === "kuttula") {
        const target = sim.enemies.find(
          (e) => e.id === c.targets[i] && !e.dead,
        );
        o.visible =
          !!target &&
          (!target.boss ||
            sim.tick - (c.bossSeen.get(target.id) ?? sim.tick) < 120);
        if (target) {
          o.position.set(target.x, 0.08, -target.z);
          o.scale.setScalar(target.boss ? 5 : 2.6);
        }
      } else if (c.id === "five10") {
        const pair = Math.min(4, Math.floor(t));
        o.position.set(
          i === 0 ? -4.05 + pair * 0.9 : 4.05 - pair * 0.9,
          0.09,
          -24,
        );
        o.scale.set(0.98, 48, 1);
        m.uniforms.time.value = Math.min(t, 4.999);
        m.uniforms.life.value *= 1 - T.MathUtils.smoothstep(t, 4.85, 5.3);
      } else if (c.id === "shannondoa") {
        o.position.set(0, 0.09, -24);
        o.scale.set(4.4, 48, 1);
      } else if (c.id === "rae") {
        o.position.set(sim.aim, 1.05, -24);
        o.scale.set(2.6, 48, 1);
      } else if (c.id === "tuna") {
        o.position.set(0, 0.12, -Math.min(48, t * 16));
        o.scale.set(10, 7, 1);
        m.uniforms.life.value *= 1 - T.MathUtils.smoothstep(t, 2.7, 3.4);
      } else if (c.id === "platypus") {
        o.position.set(0, 0.09, -23);
        o.scale.set(9, 44, 1);
      } else if (
        [
          "mortal",
          "keys",
          "bronze-leopard",
          "nemesis",
          "hondo",
          "zunneh",
          "machinegunqueen",
          "mmiguel",
          "nitro",
          "strawberry",
          "kismet",
          "so1ician",
          "pokey",
        ].includes(c.id)
      ) {
        o.visible = false;
      } else if (c.id === "gimmy") {
        o.scale.set(10, 10, 1);
      }
    });
  });
  return (
    <group ref={ref}>
      {materials.map((material, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} material={material}>
          <planeGeometry />
        </mesh>
      ))}
    </group>
  );
}

const shellVertex = `varying vec3 vNormal;varying vec3 vView;varying vec3 vPos;void main(){vec4 p=modelViewMatrix*vec4(position,1.);vNormal=normalize(normalMatrix*normal);vView=normalize(-p.xyz);vPos=position;gl_Position=projectionMatrix*p;}`;
const shellFragment = `uniform vec3 color,accent;uniform float time,life,phase;varying vec3 vNormal,vView,vPos;void main(){float rim=pow(1.-abs(dot(normalize(vNormal),normalize(vView))),2.8);float scan=pow(max(0.,sin(vPos.y*19.-time*2.)),24.)*.07;float hex=pow(max(0.,cos(vPos.x*14.+sin(vPos.y*12.))*cos(vPos.y*12.)),18.)*.09;float alpha;if(phase<.5){alpha=rim*.16+scan*.35;}else if(phase<1.5){alpha=rim*.24+scan*1.1;}else if(phase<2.5){alpha=rim*.34+hex;}else{alpha=rim*.3+scan*.2+.008;}gl_FragColor=vec4(mix(color,accent,rim)*(1.+rim*.5),alpha*life);}`;

export function SuperVolume({
  sim,
  cast: c,
}: {
  sim: Simulation;
  cast: SuperCast;
}) {
  const ref = useRef<T.Group>(null),
    shell = useRef<T.Mesh>(null),
    sweep = useRef<T.Mesh>(null),
    rays = useRef<T.Group>(null);
  const bombardMaterial = useMemo(() => fieldMaterial("five10", 4), []);
  useEffect(() => () => bombardMaterial.dispose(), [bombardMaterial]);
  const sweepMaterial = useMemo(() => fieldMaterial(c.id, 10), [c.id]);
  useEffect(() => () => sweepMaterial.dispose(), [sweepMaterial]);
  const shield = ["meesh", "doc", "panda", "pauly"].includes(c.id);
  const material = useMemo(
    () =>
      new T.ShaderMaterial({
        uniforms: {
          color: { value: new T.Color(SUPERS[c.id].color) },
          accent: { value: new T.Color(SUPERS[c.id].accent) },
          time: { value: 0 },
          life: { value: 0 },
          phase: {
            value:
              c.id === "meesh"
                ? 0
                : c.id === "doc"
                  ? 1
                  : c.id === "pauly"
                    ? 2
                    : 3,
          },
        },
        vertexShader: shellVertex,
        fragmentShader: shellFragment,
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
      }),
    [c.id],
  );
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(() => () => material.dispose(), [material]);
  useFrame(() => {
    const t = (sim.tick - c.start) / 60,
      life = envelope(t, (c.end - sim.tick) / 60);
    const phase = t % 1;
    bombardMaterial.uniforms.time.value = reduced ? 0 : t;
    bombardMaterial.uniforms.life.value =
      t < 5
        ? T.MathUtils.smoothstep(phase, 0.45, 0.5) *
          (1 - T.MathUtils.smoothstep(phase, 0.58, 0.9)) *
          life
        : 0;
    material.uniforms.time.value = reduced ? 0 : t;
    material.uniforms.life.value = life;
    if (ref.current) ref.current.position.set(sim.x, 0, -(sim.crowd.push + 1));
    if (shell.current) {
      shell.current.position.y = 0.85;
      shell.current.scale.set(3.4, 2.3, 3.4);
      if (c.id === "panda") {
        const stored = Math.min(1, c.absorbed / Math.max(1, c.army * 2));
        shell.current.scale.multiplyScalar(1 + stored * 0.2);
        material.uniforms.life.value *= 0.8 + stored * 0.6;
      }
    }
    if (sweep.current) {
      const u = T.MathUtils.clamp((t - 0.44) / 0.57, 0, 1);
      sweep.current.visible = t > 0.44 && t < 1.1;
      sweep.current.rotation.z = -u * Math.PI * 0.8;
      sweep.current.scale.setScalar(2 + u * 18);
      sweepMaterial.uniforms.life.value = Math.sin(u * Math.PI) * 0.85;
      sweepMaterial.uniforms.time.value = t;
    }
    rays.current?.children.forEach((o, i) => {
      if (c.id === "five10") {
        const pair = Math.min(4, Math.floor(t));
        const x = i % 2 === 0 ? -4.05 + pair * 0.9 : 4.05 - pair * 0.9;
        o.position.set(
          x - sim.x,
          5,
          -(5 + Math.floor(i / 2) * 12) + sim.crowd.push + 1,
        );
        o.scale.set(0.85, 10, 1);
        o.visible = t < 5 && phase > 0.44 && phase < 0.9;
      } else if (c.id === "nitro") {
        o.position.set((i % 2 ? 1 : -1) * 1.15, 0.6, -(i >> 1) * 0.6);
        o.scale.set(
          0.07,
          0.08,
          1.5 + (reduced ? 0 : Math.sin(t * 13 + i) * 0.3),
        );
      } else if (c.id === "pokey") {
        const available = Math.max(0, 24 - c.count),
          a = (i * Math.PI * 2) / 24 + (reduced ? 0 : t * 0.22);
        o.visible = i < available;
        o.position.set(
          Math.sin(a) * 2.8,
          1.1 + Math.sin(a * 2) * 0.15,
          Math.cos(a) * 2.8,
        );
        o.rotation.set(Math.PI / 2, 0, -a);
        o.scale.setScalar(0.7);
      } else if (c.id === "zunneh") {
        o.position.set(
          (i - 1) * 2,
          3.4 + (reduced ? 0 : Math.sin(t * 2 + i) * 0.15),
          -7,
        );
        o.rotation.z = reduced ? 0 : Math.sin(t * 3 + i) * 0.09;
      } else if (c.id === "hondo") {
        o.position.set((i - 1) * 3 - sim.x, 1, -7);
        o.visible = c.walls[i] > 0;
      } else if (c.id === "kuttula") {
        const e = sim.enemies.find((e) => e.id === c.targets[i] && !e.dead);
        o.visible =
          !!e &&
          (!e.boss || sim.tick - (c.bossSeen.get(e.id) ?? sim.tick) < 120);
        if (e) {
          o.position.set(e.x - sim.x, 0, -e.z + sim.crowd.push + 1);
          o.rotation.y = (reduced ? 0 : t * 0.3) + i;
          o.scale.setScalar(e.boss ? 1.4 : 1);
        }
      } else if (c.id === "kismet") {
        const g = sim.gates.find((g) => !g.passed && g.z > 0 && g.z < 48);
        o.visible = !!g;
        if (g) {
          o.position.set((i - 1) * 3 - sim.x, 2.5, -g.z + sim.crowd.push + 1);
          o.rotation.z = Math.PI / 4;
        }
      }
    });
  });
  const d = SUPERS[c.id];
  return (
    <group ref={ref}>
      {shield && (
        <mesh ref={shell} material={material}>
          <sphereGeometry
            args={[1, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.64]}
          />
        </mesh>
      )}
      {c.id === "mortal" && (
        <mesh
          ref={sweep}
          position={[0, 1.6, -19]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[0.87, 1, 96, 1, 0, Math.PI * 0.95]} />
          <primitive object={sweepMaterial} attach="material" />
        </mesh>
      )}
      <group ref={rays}>
        {c.id === "five10" &&
          Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} material={bombardMaterial}>
              <planeGeometry />
            </mesh>
          ))}
        {c.id === "nitro" &&
          Array.from({ length: 12 }, (_, i) => (
            <mesh key={i}>
              <boxGeometry />
              <meshBasicMaterial
                color={i % 3 === 0 ? d.accent : d.color}
                transparent
                opacity={0.52}
                depthWrite={false}
                blending={T.AdditiveBlending}
              />
            </mesh>
          ))}
        {c.id === "pokey" &&
          Array.from({ length: 24 }, (_, i) => (
            <mesh key={i}>
              <coneGeometry args={[0.085, 0.9, 6]} />
              <meshStandardMaterial
                color={d.accent}
                emissive={d.color}
                emissiveIntensity={0.5}
                metalness={0.6}
                roughness={0.25}
              />
            </mesh>
          ))}
        {c.id === "hondo" &&
          [0, 1, 2].map((i) => (
            <group key={i}>
              <mesh>
                <boxGeometry args={[2.75, 1.7, 0.27]} />
                <meshStandardMaterial
                  color="#25343c"
                  metalness={0.65}
                  roughness={0.32}
                />
              </mesh>
              <mesh position={[0, 0, 0.17]}>
                <boxGeometry args={[2.57, 1.48, 0.08]} />
                <meshStandardMaterial
                  color={d.color}
                  metalness={0.6}
                  roughness={0.35}
                />
              </mesh>
              {[-0.57, 0.57].map((y) => (
                <mesh key={y} position={[0, y, 0.25]}>
                  <boxGeometry args={[2.7, 0.08, 0.06]} />
                  <meshBasicMaterial color={d.accent} toneMapped={false} />
                </mesh>
              ))}
              <mesh position={[0, 0.17, 0.26]}>
                <boxGeometry args={[1.95, 0.035, 0.04]} />
                <meshBasicMaterial color={d.accent} />
              </mesh>
              {[-1.05, 1.05].map((x) => (
                <mesh key={x} position={[x, -0.8, 0.23]} rotation={[0.2, 0, 0]}>
                  <boxGeometry args={[0.18, 0.6, 0.7]} />
                  <meshStandardMaterial
                    color="#a7adb0"
                    metalness={0.75}
                    roughness={0.3}
                  />
                </mesh>
              ))}
            </group>
          ))}
        {c.id === "kuttula" &&
          Array.from({ length: 6 }, (_, i) => (
            <Tentacle key={i} index={i} color={d.color} accent={d.accent} />
          ))}
      </group>
    </group>
  );
}
function Tentacle({
  index,
  color,
  accent,
}: {
  index: number;
  color: string;
  accent: string;
}) {
  const geometry = useMemo(
    () =>
      new T.TubeGeometry(
        new T.CatmullRomCurve3(
          Array.from({ length: 20 }, (_, i) => {
            const u = i / 19,
              a = u * Math.PI * 2.2 + index;
            return new T.Vector3(
              Math.sin(a) * (0.75 - u * 0.4),
              u * 2.7,
              Math.cos(a) * (0.75 - u * 0.4),
            );
          }),
        ),
        40,
        0.1,
        7,
        false,
      ),
    [index],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group>
      <mesh geometry={geometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.22}
          metalness={0.4}
          roughness={0.3}
        />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => {
        const u = i / 7,
          a = u * Math.PI * 2.2 + index;
        return (
          <mesh
            key={i}
            position={[
              Math.sin(a) * (0.78 - u * 0.4),
              u * 2.7,
              Math.cos(a) * (0.78 - u * 0.4),
            ]}
          >
            <sphereGeometry args={[0.085, 8, 6]} />
            <meshBasicMaterial color={accent} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Bounded, event-driven traces. Lightning bends; projectiles arc; impacts retain a release tail. */
export function SuperImpactEffects({
  sim,
  quality,
}: {
  sim: Simulation;
  quality: string;
}) {
  const beams = useRef<T.InstancedMesh>(null),
    sparks = useRef<T.InstancedMesh>(null),
    waves = useRef<T.Group>(null);
  const work = useMemo(
    () => ({
      dummy: new T.Object3D(),
      color: new T.Color(),
      from: new T.Vector3(),
      to: new T.Vector3(),
      dir: new T.Vector3(),
      up: new T.Vector3(0, 1, 0),
    }),
    [],
  );
  const waveMaterials = useMemo(
    () => Array.from({ length: 12 }, () => fieldMaterial("mortal", 7)),
    [],
  );
  const reduced = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  useEffect(
    () => () => waveMaterials.forEach((m) => m.dispose()),
    [waveMaterials],
  );
  useFrame(() => {
    if (!beams.current || !sparks.current) return;
    const { dummy, color, from, to, dir, up } = work;
    let nb = 0,
      ns = 0;
    const events = sim.supers.events
      .filter(
        (e) =>
          (e.kind === "hit" || e.kind === "end" || e.kind === "fire") &&
          sim.tick - e.tick < 48,
      )
      .slice(quality === "high" ? -56 : -28);
    const beam = (a: T.Vector3, b: T.Vector3, r: number, tint: string) => {
      if (nb >= 768) return;
      dummy.position.copy(a).lerp(b, 0.5);
      dir.copy(b).sub(a);
      const length = dir.length();
      dummy.quaternion.setFromUnitVectors(up, dir.normalize());
      dummy.scale.set(r, Math.max(0.001, length), r);
      dummy.updateMatrix();
      beams.current!.setMatrixAt(nb, dummy.matrix);
      beams.current!.setColorAt(nb++, color.set(tint));
    };
    for (const e of events) {
      const age = (sim.tick - e.tick) / 60,
        fade = Math.max(0, 1 - age / 0.55),
        d = SUPERS[e.id];
      const isHit = e.kind === "hit",
        release = e.kind === "end";
      if (isHit && fade > 0 && e.tx !== undefined && e.tz !== undefined) {
        from.set(e.x, 1.1, -e.z);
        to.set(e.tx, 1.15, -e.tz);
        if (e.id === "machinegunqueen") {
          from.set(e.x, 3.1, -8);
          from.addScaledVector(dir.copy(to).sub(from).normalize(), 0.65);
        }
        if (e.id === "zunneh" && e.z === 6) from.set(e.x, 3.4, -8);
        const dist = from.distanceTo(to);
        if (
          dist > 0.3 &&
          ["zunneh", "haut-carl", "pokey", "machinegunqueen"].includes(e.id)
        ) {
          if (e.id === "zunneh") {
            const last = from.clone(),
              p = new T.Vector3();
            for (let j = 1; j <= 9; j++) {
              const u = j / 9;
              p.copy(from).lerp(to, u);
              const w = Math.sin(u * Math.PI);
              p.x += Math.sin(j * 12.7 + e.serial) * w * 0.5;
              p.y += Math.cos(j * 8.3 + e.serial) * w * 0.4;
              beam(last, p, 0.044 * fade, d.color);
              beam(last, p, 0.014 * fade, d.accent);
              if (j % 3 === 0) {
                const branch = p.clone().add(new T.Vector3(0.6, 0.28, 0.4));
                beam(p, branch, 0.015 * fade, d.color);
              }
              last.copy(p);
            }
          } else if (e.id === "haut-carl") {
            const last = from.clone(),
              p = new T.Vector3();
            for (let j = 1; j <= 12; j++) {
              const u = j / 12;
              p.copy(from).lerp(to, u);
              p.y += Math.sin(u * Math.PI) * 5;
              beam(last, p, 0.025 * fade, d.accent);
              last.copy(p);
            }
          } else {
            const [tailProgress, tipProgress] = superTraceProgress(age);
            const tip = from.clone().lerp(to, tipProgress);
            const tail = from.clone().lerp(to, tailProgress);
            if (tip.distanceTo(tail) > 0.01) {
              beam(tail, tip, 0.044 * fade, d.color);
              beam(tail, tip, 0.015 * fade, d.accent);
            }
          }
        }
      }
      const particles =
        e.id === "gimmy" ? 0 : reduced ? 3 : quality === "high" ? 12 : 7;
      // Persistent powers have subtle dust; releases and executions carry the larger burst.
      const big = [
        "mortal",
        "five10",
        "haut-carl",
        "strawberry",
        "panda",
        "tuna",
      ].includes(e.id);
      for (let j = 0; j < particles && ns < 768; j++) {
        const a = j * 2.399 + e.serial * 0.72,
          speed = (big ? 3.2 : 1.45) * (0.45 + (j % 4) * 0.2);
        const travel = reduced ? 0.08 : age * speed;
        const x = e.tx ?? e.x,
          z = e.tz ?? e.z;
        dummy.position.set(
          x + Math.cos(a) * travel,
          Math.max(
            0.12,
            0.85 +
              Math.sin(j * 8.1) * travel +
              age * (big ? 2.3 : 1) -
              age * age * 3,
          ),
          -z + Math.sin(a) * travel,
        );
        dummy.rotation.set(a + age, age * 2, a);
        const size =
          (big ? 0.115 : 0.07) *
          Math.max(0, 1 - age / 0.8) *
          (release ? 0.7 : 1);
        dummy.scale.set(size, size * (j % 3 === 0 ? 2.5 : 1), size);
        dummy.updateMatrix();
        sparks.current.setMatrixAt(ns, dummy.matrix);
        sparks.current.setColorAt(
          ns++,
          color.set(j % 3 === 0 ? d.accent : d.color).multiplyScalar(1.25),
        );
      }
    }
    beams.current.count = nb;
    sparks.current.count = ns;
    for (const m of [beams.current, sparks.current]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const shock = events
      .filter(
        (e) =>
          (e.kind === "hit" &&
            [
              "five10",
              "haut-carl",
              "strawberry",
              "so1ician",
              "bronze-leopard",
            ].includes(e.id)) ||
          (e.kind === "end" && e.id === "panda") ||
          e.kind === "fire",
      )
      .slice(-12);
    waves.current?.children.forEach((o, i) => {
      const e = shock[i];
      o.visible = !!e;
      if (!e) return;
      const age = (sim.tick - e.tick) / 48,
        m = waveMaterials[i];
      m.uniforms.time.value = age;
      m.uniforms.seed.value = e.id === "panda" ? 1 : 0;
      m.uniforms.life.value = 1;
      m.uniforms.color.value.set(SUPERS[e.id].color);
      m.uniforms.accent.value.set(SUPERS[e.id].accent);
      o.position.set(e.tx ?? e.x, 0.1, -(e.tz ?? e.z));
      const r =
        e.id === "panda"
          ? 22
          : e.id === "mortal"
            ? 12
            : e.kind === "fire"
              ? 5
              : 3.5;
      o.scale.set(r, r, 1);
    });
  });
  return (
    <>
      <instancedMesh
        ref={beams}
        args={[undefined, undefined, 768]}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 5]} />
        <meshBasicMaterial
          transparent
          opacity={0.82}
          depthWrite={false}
          blending={T.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={sparks}
        args={[undefined, undefined, 768]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          transparent
          opacity={0.8}
          depthWrite={false}
          blending={T.AdditiveBlending}
          toneMapped={false}
        />
      </instancedMesh>
      <group ref={waves}>
        {waveMaterials.map((m, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} material={m}>
            <planeGeometry />
          </mesh>
        ))}
      </group>
    </>
  );
}
