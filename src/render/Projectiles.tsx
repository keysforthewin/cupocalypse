import { useMemo, useLayoutEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  ARSENAL,
  GUNS,
  shotNoise,
  type ProjectileKind,
} from "../game/projectiles";
import type { Simulation } from "../game/simulation";
// Cosmetic budgets do not limit simulated ordnance.
const VISUAL_CAPACITY = 1024;
// At most this many projectiles of one kind draw per frame; the rest are
// sampled out so a huge volley stays readable instead of a wall of light.
const VISIBLE_PER_KIND = 80;
// Upload only the instances in use. Three otherwise re-sends every buffer in
// full each frame, which for these meshes was several megabytes per frame.
function upload(m: T.InstancedMesh) {
  const n = Math.max(1, m.count);
  m.instanceMatrix.clearUpdateRanges();
  m.instanceMatrix.addUpdateRange(0, n * 16);
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) {
    m.instanceColor.clearUpdateRanges();
    m.instanceColor.addUpdateRange(0, n * 3);
    m.instanceColor.needsUpdate = true;
  }
  const opacity = m.geometry.getAttribute("instanceOpacity") as
    T.InstancedBufferAttribute | undefined;
  if (opacity) {
    opacity.clearUpdateRanges();
    opacity.addUpdateRange(0, n);
    opacity.needsUpdate = true;
  }
}
const kinds: ProjectileKind[] = ["pulse", ...GUNS];
function silhouette(kind: ProjectileKind) {
  const parts: T.BufferGeometry[] = [];
  const add = (g: T.BufferGeometry, x = 0, y = 0, z = 0) => {
    g.translate(x, y, z);
    parts.push(g.index ? g.toNonIndexed() : g);
    if (g.index) g.dispose();
  };
  if (kind === "pulse") {
    const g = new T.ConeGeometry(0.7, 3.5, 5);
    g.rotateX(-Math.PI / 2);
    add(g);
  }
  if (kind === "seeker") {
    const body = new T.CylinderGeometry(0.65, 0.85, 3.4, 10);
    body.rotateX(Math.PI / 2);
    add(body);
    const nose = new T.ConeGeometry(0.65, 1.5, 10);
    nose.rotateX(-Math.PI / 2);
    add(nose, 0, 0, -2.4);
    for (let i = 0; i < 4; i++) {
      const fin = new T.BoxGeometry(0.16, 2.5, 1.6);
      fin.rotateZ((i * Math.PI) / 2);
      add(fin, 0, 0, 1.1);
    }
  } else if (kind === "helix") {
    const disc = new T.TorusGeometry(1, 0.28, 6, 16);
    disc.rotateX(Math.PI / 2);
    add(disc);
    add(new T.OctahedronGeometry(0.85));
  } else if (kind === "scatter") {
    const g = new T.OctahedronGeometry(1);
    g.scale(0.6, 0.65, 2.4);
    add(g);
  } else if (kind === "cursor") {
    add(new T.IcosahedronGeometry(0.8, 1));
    for (let i = 0; i < 2; i++) {
      const ring = new T.TorusGeometry(1.3, 0.09, 5, 24);
      ring.rotateY((i * Math.PI) / 2);
      ring.rotateX(0.5);
      add(ring);
    }
  } else if (kind === "mortar") {
    const body = new T.CapsuleGeometry(0.8, 1.7, 4, 10);
    body.rotateX(Math.PI / 2);
    add(body);
    const ring = new T.TorusGeometry(0.86, 0.15, 6, 16);
    add(ring, 0, 0, 0.4);
  }
  if (kind === "rail" || kind === "needle") {
    const dart = new T.ConeGeometry(
      kind === "rail" ? 0.45 : 0.3,
      kind === "rail" ? 7 : 5,
      5,
    );
    dart.rotateX(-Math.PI / 2);
    add(dart);
    if (kind === "rail")
      for (const x of [-0.65, 0.65]) add(new T.BoxGeometry(0.12, 0.12, 3), x);
  } else if (kind === "storm") {
    for (let i = 0; i < 5; i++) {
      const g = new T.BoxGeometry(0.3, 0.3, 1.1);
      g.rotateY(i % 2 ? 0.65 : -0.65);
      add(g, i % 2 ? 0.3 : -0.3, 0, i - 2);
    }
  } else if (kind === "saw") {
    const disc = new T.CylinderGeometry(1.2, 1.2, 0.18, 16);
    add(disc);
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const g = new T.ConeGeometry(0.3, 0.7, 3);
      g.rotateX(Math.PI / 2).rotateY(a);
      add(g, Math.sin(a) * 1.2, 0, Math.cos(a) * 1.2);
    }
  } else if (kind === "cinder" || kind === "cluster") {
    add(new T.IcosahedronGeometry(1, 0));
    for (let i = 0; i < (kind === "cluster" ? 5 : 3); i++) {
      const a = (i * Math.PI * 2) / (kind === "cluster" ? 5 : 3);
      add(
        new T.OctahedronGeometry(0.38),
        Math.cos(a) * 0.9,
        Math.sin(a) * 0.9,
        0.35,
      );
    }
  } else if (kind === "cryo") {
    const g = new T.OctahedronGeometry(1);
    g.scale(0.7, 0.35, 2.8);
    add(g);
    add(new T.OctahedronGeometry(0.5), 0.7, 0, 0.8);
  } else if (kind === "gravity") {
    add(new T.SphereGeometry(0.7, 12, 8));
    for (const angle of [-0.6, 0.6]) {
      const g = new T.TorusGeometry(1.2, 0.1, 6, 28);
      g.rotateX(angle);
      add(g);
    }
  } else if (kind === "crescent") {
    const path = new T.Shape();
    path.absarc(0, 0, 1.7, 0.2, Math.PI * 1.8, false);
    path.absarc(0.65, 0, 1.35, Math.PI * 1.65, 0.5, true);
    const g = new T.ExtrudeGeometry(path, {
      depth: 0.16,
      bevelEnabled: false,
      curveSegments: 16,
    });
    g.rotateX(Math.PI / 2);
    add(g);
  } else if (kind === "sonic") {
    for (const radius of [2.4, 3.1]) {
      const g = new T.TorusGeometry(radius, 0.09, 5, 28, Math.PI);
      g.rotateX(Math.PI / 2);
      add(g, 0, 0, radius * 0.2);
    }
  }
  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return merged;
}
function glowMaterial(opacity = 1, smoke = false, fire = false) {
  return new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: smoke ? T.NormalBlending : T.AdditiveBlending,
    toneMapped: false,
    uniforms: { opacity: { value: opacity }, time: { value: 0 } },
    vertexShader: `attribute float instanceOpacity; varying vec2 vUv; varying vec3 vColor; varying float vFade; varying float vSeed; void main(){vUv=uv;vColor=instanceColor;vFade=instanceOpacity;vSeed=instanceMatrix[3].x*3.+instanceMatrix[3].z;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;varying vec3 vColor;varying float vFade;varying float vSeed;uniform float opacity;uniform float time;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 p=(vUv-.5)*2.;float r=length(p);float n=noise(p*4.+vSeed-vec2(0,time*2.))*.65+noise(p*9.-time)*.35;
    float a=${fire || smoke ? "pow(max(0.,1.-r+(n-.5)*.4),1.4)*(.4+n*.6)" : "pow(max(0.,1.-r),2.4)"};
    vec3 color=${fire ? "mix(vColor*.35,vColor*2.5,pow(n,2.))" : smoke ? "vColor*(.65+n*.6)" : "vColor"};
    gl_FragColor=vec4(color,a*opacity*vFade);}`,
  });
}
export function Projectiles({ sim }: { sim: Simulation }) {
  const rig = useMemo(() => {
    const root = new T.Group();
    root.name = "projectile-system";
    const mesh = (
      geometry: T.BufferGeometry,
      material: T.Material,
      count: number,
    ) => {
      if (material instanceof T.ShaderMaterial)
        geometry.setAttribute(
          "instanceOpacity",
          new T.InstancedBufferAttribute(new Float32Array(count), 1),
        );
      const m = new T.InstancedMesh(geometry, material, count);
      // Created up front (three.js fills it with white, i.e. untinted): the
      // first tinted shot would otherwise switch the material to another
      // shader variant and recompile it mid-run.
      m.setColorAt(0, new T.Color("#ffffff"));
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      m.count = 0;
      root.add(m);
      return m;
    };
    const bodies = kinds.map((kind) =>
      mesh(
        silhouette(kind),
        new T.MeshStandardMaterial({
          color: ARSENAL[kind].color,
          emissive: ARSENAL[kind].color,
          emissiveIntensity: kind === "seeker" || kind === "mortar" ? 0.35 : 2,
          metalness: 0.6,
          roughness: 0.26,
        }),
        VISUAL_CAPACITY,
      ),
    );
    const trails = mesh(
      new T.CylinderGeometry(1, 1, 1, 5),
      new T.MeshBasicMaterial({
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
      }),
      VISUAL_CAPACITY * 6,
    );
    const cores = mesh(
      new T.SphereGeometry(1, 8, 6),
      new T.MeshBasicMaterial({ toneMapped: false }),
      VISUAL_CAPACITY,
    );
    const glows = mesh(
      new T.PlaneGeometry(1, 1),
      glowMaterial(0.8),
      VISUAL_CAPACITY + 96 * 3,
    );
    const sparks = mesh(
      new T.OctahedronGeometry(1),
      new T.MeshBasicMaterial({ toneMapped: false }),
      96 * 12,
    );
    const rings = mesh(
      new T.TorusGeometry(1, 0.025, 5, 40),
      new T.MeshBasicMaterial({
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: T.AdditiveBlending,
        toneMapped: false,
      }),
      144,
    );
    const smoke = mesh(
      new T.PlaneGeometry(1, 1),
      glowMaterial(0.34, true),
      VISUAL_CAPACITY + 96 * 4,
    );
    const fire = mesh(
      new T.PlaneGeometry(1, 1),
      glowMaterial(0.85, false, true),
      96 * 3 + 144,
    );
    return { root, bodies, trails, cores, glows, sparks, rings, smoke, fire };
  }, []);
  useLayoutEffect(
    () => () => {
      rig.root.traverse((o) => {
        if (o instanceof T.Mesh) {
          o.geometry.dispose();
          (o.material as T.Material).dispose();
        }
      });
    },
    [rig],
  );
  const temp = useMemo(
    () => ({
      d: new T.Object3D(),
      c: new T.Color(),
      a: new T.Vector3(),
      b: new T.Vector3(),
      up: new T.Vector3(0, 1, 0),
    }),
    [],
  );
  useFrame(({ camera }) => {
    const { d, c, a, b, up } = temp;
    for (const m of [
      ...rig.bodies,
      rig.trails,
      rig.cores,
      rig.glows,
      rig.sparks,
      rig.rings,
      rig.smoke,
      rig.fire,
    ])
      m.count = 0;
    const put = (m: T.InstancedMesh, color?: string, fade = 1) => {
      if (m.count >= m.instanceMatrix.count) return;
      const alpha = m.geometry.getAttribute("instanceOpacity") as
        T.InstancedBufferAttribute | undefined;
      if (alpha) alpha.setX(m.count, fade);
      d.updateMatrix();
      m.setMatrixAt(m.count, d.matrix);
      if (color) {
        c.set(color).multiplyScalar(alpha ? 1 : fade);
        m.setColorAt(m.count, c);
      }
      m.count++;
    };
    const billboard = (
      m: T.InstancedMesh,
      x: number,
      y: number,
      z: number,
      size: number,
      color: string,
      fade = 1,
    ) => {
      d.position.set(x, y, -z);
      d.quaternion.copy(camera.quaternion);
      d.scale.setScalar(size);
      put(m, color, fade);
    };
    // Sample each family independently at extreme stack sizes, retaining every weapon silhouette.
    const visibleByKind = new Map<ProjectileKind, number>();
    const activeByKind = new Map<ProjectileKind, number>();
    for (const p of sim.bullets)
      if (p.active)
        activeByKind.set(p.kind, (activeByKind.get(p.kind) ?? 0) + 1);
    for (const p of sim.bullets) {
      if (!p.active) continue;
      const index = visibleByKind.get(p.kind) ?? 0;
      visibleByKind.set(p.kind, index + 1);
      if (
        index %
          Math.max(
            1,
            Math.ceil((activeByKind.get(p.kind) ?? 0) / VISIBLE_PER_KIND),
          ) !==
        0
      )
        continue;
      const def = ARSENAL[p.kind],
        size =
          p.kind === "pulse"
            ? Math.max(0.085 * (p.payload?.size ?? 1), p.width)
            : p.width;
      d.position.set(p.x, p.y, -p.z);
      d.rotation.set(0, -Math.atan2(p.vx, p.vz ?? def.speed), 0);
      if (["helix", "scatter", "cursor", "cluster", "gravity"].includes(p.kind))
        d.rotateZ(p.age * 7 + p.phase);
      if (p.kind === "saw" || p.kind === "crescent") d.rotateY(p.age * 15);
      d.scale.setScalar(size);
      if (p.kind === "sonic") d.scale.x = (1.4 / 3.1) * (p.payload?.size ?? 1);
      put(
        rig.bodies[kinds.indexOf(p.kind)],
        p.kind === "gravity" ? "#241c3e" : def.color,
      );
      d.scale.set(
        size * 0.46,
        size * 0.46,
        size * (p.kind === "pulse" ? 1.8 : 0.7),
      );
      put(rig.cores, p.kind === "pulse" ? p.coreColor : def.core, 1.6);
      billboard(
        rig.glows,
        p.x,
        p.y,
        p.z,
        size * (p.kind === "pulse" ? 5 : 7),
        p.haloColor,
        p.kind === "pulse" ? 0.55 : 0.7,
      );
      for (let i = 1; i < p.trail.length; i++) {
        if (i > (p.kind === "pulse" ? 3 : p.kind === "scatter" ? 4 : 5)) break;
        const from = p.trail[i - 1],
          to = p.trail[i];
        a.set(from[0], from[1], -from[2]);
        b.set(to[0], to[1], -to[2]);
        d.position.copy(a).add(b).multiplyScalar(0.5);
        b.sub(a);
        const length = b.length();
        d.quaternion.setFromUnitVectors(up, b.normalize());
        const width = size * (1 - i / 12) * 0.48;
        d.scale.set(width, length + 0.025, width);
        put(rig.trails, def.color, (1 - i / 12) * 1.6);
      }
      if (p.kind === "seeker" || p.kind === "mortar")
        for (const i of [3, 6, 9]) {
          const t = p.trail[i];
          if (t)
            billboard(
              rig.smoke,
              t[0],
              t[1] + i * 0.025,
              t[2],
              size * (2 + i * 0.35),
              "#9a8b7c",
              0.45 * (1 - i / 13),
            );
        }
      if (p.kind === "cursor")
        for (let i = 0; i < 3; i++) {
          const angle = p.age * 9 + (i * Math.PI * 2) / 3;
          billboard(
            rig.glows,
            p.x + Math.cos(angle) * 0.42,
            p.y + Math.sin(angle) * 0.24,
            p.z + Math.sin(angle) * 0.25,
            0.24,
            def.core,
            0.85,
          );
        }
      if (p.age < 0.09)
        billboard(
          rig.glows,
          p.previousX,
          0.72,
          p.previous,
          1.1 * (1 - p.age / 0.12),
          def.core,
        );
    }
    for (const arc of sim.arcEffects) {
      for (let i = 0; i < 5; i++) {
        const t = i / 5,
          next = (i + 1) / 5;
        const jitter = i === 0 ? 0 : Math.sin(i * 17 + arc.x) * 0.18;
        a.set(
          arc.x + (arc.tx - arc.x) * t + jitter,
          0.8,
          -(arc.z + (arc.tz - arc.z) * t),
        );
        b.set(
          arc.x + (arc.tx - arc.x) * next,
          0.8,
          -(arc.z + (arc.tz - arc.z) * next),
        );
        d.position.copy(a).add(b).multiplyScalar(0.5);
        b.sub(a);
        const length = b.length();
        d.quaternion.setFromUnitVectors(up, b.normalize());
        d.scale.set(0.035, length, 0.035);
        put(rig.trails, arc.color, 1 - arc.age / 0.18);
      }
    }
    for (const f of sim.fields) {
      if (!f.active) continue;
      const color = ARSENAL[f.kind].color;
      d.position.set(f.x, 0.09, -f.z);
      d.rotation.set(-Math.PI / 2, 0, f.age * 2);
      d.scale.setScalar(
        f.radius * (f.kind === "gravity" ? 1 - (f.age % 0.6) * 0.7 : 1),
      );
      put(rig.rings, color, (1 - f.age / 2) * 0.7);
      for (let i = 0; i < 3; i++) {
        const angle = f.age * 5 + (i * Math.PI * 2) / 3;
        billboard(
          f.kind === "gravity" ? rig.glows : rig.fire,
          f.x + Math.cos(angle) * f.radius * 0.45,
          0.2,
          f.z + Math.sin(angle) * f.radius * 0.45,
          f.radius * 0.9,
          color,
          (1 - f.age / 2) * 0.45,
        );
      }
    }
    for (const e of sim.impacts) {
      if (!e.active) continue;
      const def = ARSENAL[e.kind],
        t = e.age / 0.85,
        r = e.radius;
      if (t < 0.42) {
        billboard(
          rig.glows,
          e.x,
          0.65,
          e.z,
          r * (0.8 + t * 4),
          def.color,
          1 - t / 0.42,
        );
        billboard(
          rig.glows,
          e.x,
          0.7,
          e.z,
          r * (0.3 + t * 2),
          def.core,
          (1 - t / 0.42) * 2,
        );
      }
      if (e.kind !== "pulse" && e.kind !== "scatter" && t < 0.72) {
        const heavy = e.kind === "mortar" || e.kind === "seeker";
        for (let i = 0; i < (heavy ? 3 : 1); i++)
          billboard(
            rig.fire,
            e.x + Math.sin(e.seed + i * 3) * r * t * 0.3,
            0.65 + t * (heavy ? 1.4 : 0.6) + i * 0.12,
            e.z + Math.cos(i * 3) * t * 0.2,
            r * (0.7 + t * 1.8) * (i ? 0.65 : 1),
            def.color,
            (1 - t / 0.72) ** 1.4,
          );
      }
      d.position.set(e.x, 0.075, -e.z);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.scale.setScalar(
        r * (0.15 + Math.sqrt(t) * (e.kind === "sonic" ? 3.2 : 1.4)),
      );
      if (e.kind === "rail") d.scale.set(0.2, r * (1 + t * 3), 1);
      put(rig.rings, def.color, (1 - t) ** 2);
      const sparkCount =
        e.kind === "sonic" || e.kind === "gravity"
          ? 3
          : e.kind === "cluster"
            ? 18
            : 12;
      for (let i = 0; i < sparkCount; i++) {
        const angle =
            e.kind === "crescent"
              ? (i / sparkCount) * Math.PI
              : shotNoise(e.seed + i * 37) * Math.PI * 2,
          speed = 0.6 + shotNoise(e.seed + i * 61) * 1.5,
          dist = r * speed * t;
        d.position.set(
          e.x + Math.cos(angle) * dist,
          Math.max(0.07, 0.55 + Math.sin(t * Math.PI) * speed - t * t),
          -e.z + Math.sin(angle) * dist,
        );
        d.rotation.set(angle + t * 7, angle, angle);
        const s = (0.035 + shotNoise(e.seed + i * 53) * 0.06) * (1 - t);
        d.scale.set(
          s * (e.kind === "cryo" ? 2 : 1),
          s * (e.kind === "saw" || e.kind === "rail" ? 6 : 2.8),
          s,
        );
        put(rig.sparks, i % 3 ? def.color : def.core, 1.6 * (1 - t));
      }
      if (e.kind === "mortar" || e.kind === "seeker")
        for (let i = 0; i < 4; i++)
          billboard(
            rig.smoke,
            e.x + Math.sin(i * 4 + e.seed) * t * r * 0.6,
            0.7 + t * (1 + i * 0.2),
            e.z + Math.cos(i * 4) * t * r * 0.4,
            r * (0.5 + t),
            "#554e49",
            (1 - t) * 0.8,
          );
    }
    for (const m of [
      ...rig.bodies,
      rig.trails,
      rig.cores,
      rig.glows,
      rig.sparks,
      rig.rings,
      rig.smoke,
      rig.fire,
    ]) {
      upload(m);
      if (m.material instanceof T.ShaderMaterial)
        m.material.uniforms.time.value = sim.time;
    }
  });
  return <primitive object={rig.root} />;
}
