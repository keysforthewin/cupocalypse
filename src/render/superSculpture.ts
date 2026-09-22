import * as T from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { SUPERS, type SuperId } from "../game/superWeapons";

/** Small collectible sculptures: dark structural metal, enamel, cut edges and restrained light. */
export function sculptSuper(id: SuperId) {
  const d = SUPERS[id],
    root = new T.Group();
  const organic = [
    "panda",
    "platypus",
    "pokey",
    "meesh",
    "kuttula",
    "strawberry",
    "baezil",
  ].includes(id);
  const materials = {
    shell: new T.MeshStandardMaterial({
      color: d.color,
      metalness: organic ? 0.28 : 0.62,
      roughness: organic ? 0.43 : 0.3,
    }),
    edge: new T.MeshStandardMaterial({
      color: d.accent,
      metalness: 0.78,
      roughness: 0.22,
    }),
    dark: new T.MeshStandardMaterial({
      color: "#17232c",
      metalness: 0.72,
      roughness: 0.31,
    }),
    ink: new T.MeshStandardMaterial({
      color: "#080f18",
      metalness: organic ? 0.08 : 0.3,
      roughness: organic ? 0.62 : 0.39,
    }),
    ivory: new T.MeshStandardMaterial({
      color: "#f3eddb",
      metalness: id === "panda" ? 0.04 : 0.25,
      roughness: id === "panda" ? 0.58 : 0.3,
    }),
    plume: new T.MeshBasicMaterial({
      color: d.color,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: T.AdditiveBlending,
    }),
    light: new T.MeshStandardMaterial({
      color: d.accent,
      emissive: d.color,
      emissiveIntensity: 1.15,
      metalness: 0.2,
      roughness: 0.23,
    }),
  };
  type Finish = keyof typeof materials;
  const add = (
    g: T.BufferGeometry,
    x = 0,
    y = 0,
    z = 0,
    finish: Finish = "shell",
    parent: T.Group = root,
  ) => {
    const m = new T.Mesh(g, materials[finish]);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    depth: number,
    f: Finish = "shell",
    p = root,
  ) =>
    add(
      new RoundedBoxGeometry(w, h, depth, 2, Math.min(w, h, depth) * 0.16),
      x,
      y,
      z,
      f,
      p,
    );
  const orb = (
    x: number,
    y: number,
    z: number,
    r: number,
    f: Finish = "shell",
    sx = 1,
    sy = 1,
    sz = 1,
    p = root,
  ) => {
    const m = add(new T.SphereGeometry(r, 24, 16), x, y, z, f, p);
    m.scale.set(sx, sy, sz);
    return m;
  };
  const rod = (
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    f: Finish = "shell",
    p = root,
    rt = r,
  ) => add(new T.CylinderGeometry(rt, r, h, 24), x, y, z, f, p);
  const ring = (
    x: number,
    y: number,
    z: number,
    r: number,
    tube = 0.035,
    f: Finish = "edge",
    p = root,
    arc = Math.PI * 2,
  ) => add(new T.TorusGeometry(r, tube, 8, 64, arc), x, y, z, f, p);
  const gem = (
    x: number,
    y: number,
    z: number,
    r: number,
    f: Finish = "light",
    p = root,
  ) => add(new T.OctahedronGeometry(r), x, y, z, f, p);
  const path = (points: number[][], r = 0.04, f: Finish = "edge", p = root) =>
    add(
      new T.TubeGeometry(
        new T.CatmullRomCurve3(points.map((v) => new T.Vector3(...v))),
        48,
        r,
        8,
        false,
      ),
      0,
      0,
      0,
      f,
      p,
    );
  const plate = (
    pts: number[][],
    depth = 0.12,
    f: Finish = "shell",
    p = root,
  ) => {
    const s = new T.Shape();
    s.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach((v) => s.lineTo(v[0], v[1]));
    s.closePath();
    const g = new T.ExtrudeGeometry(s, {
      depth,
      steps: 1,
      bevelEnabled: true,
      bevelSegments: 3,
      bevelSize: 0.025,
      bevelThickness: 0.025,
      curveSegments: 24,
    });
    g.translate(0, 0, -depth / 2);
    return add(g, 0, 0, 0, f, p);
  };
  const link = (
    a: number[],
    b: number[],
    r: number,
    f: Finish = "edge",
    p = root,
  ) => {
    const av = new T.Vector3(...a),
      bv = new T.Vector3(...b);
    const m = rod(0, 0, 0, r, av.distanceTo(bv), f, p);
    m.position.copy(av).lerp(bv, 0.5);
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      bv.sub(av).normalize(),
    );
    return m;
  };
  const bolt = (x: number, y: number, z: number, p = root) => {
    rod(x, y, z, 0.055, 0.045, "dark", p).rotation.x = Math.PI / 2;
    box(x, y, z + 0.03, 0.055, 0.014, 0.014, "edge", p);
  };
  const dial = (r: number, n: number, z: number, p = root) => {
    for (let i = 0; i < n; i++) {
      const a = (i * Math.PI * 2) / n;
      const m = box(
        Math.sin(a) * r,
        Math.cos(a) * r,
        z,
        0.025,
        i % 5 === 0 ? 0.13 : 0.065,
        0.025,
        i % 5 === 0 ? "light" : "edge",
        p,
      );
      m.rotation.z = -a;
    }
  };
  const eyes = (x: number, y: number, z: number, p = root) => {
    for (const s of [-1, 1]) {
      orb(s * x, y, z, 0.1, "ink", 1.25, 0.65, 0.4, p);
      orb(s * x, y, z + 0.035, 0.038, "light", 0.7, 1, 0.5, p);
    }
  };
  const petal = (
    x: number,
    y: number,
    z: number,
    a: number,
    len: number,
    width: number,
    f: Finish = "shell",
    p = root,
  ) => {
    const m = plate(
      [
        [0, 0],
        [-width * 0.5, len * 0.35],
        [-width * 0.34, len * 0.72],
        [0, len],
        [width * 0.34, len * 0.72],
        [width * 0.5, len * 0.35],
      ],
      0.06,
      f,
      p,
    );
    m.position.set(x, y, z);
    m.rotation.z = a;
    return m;
  };
  const group = (x = 0, y = 0, z = 0, a = 0) => {
    const g = new T.Group();
    g.position.set(x, y, z);
    g.rotation.z = a;
    root.add(g);
    return g;
  };
  switch (id) {
    case "mortal": {
      const scythe = group(-0.25, 0, 0.15, -0.22);
      rod(0, -0.1, 0, 0.067, 3.8, "dark", scythe);
      for (let i = 0; i < 12; i++)
        ring(0, -1.35 + i * 0.1, 0, 0.078, 0.018, "edge", scythe).rotation.x =
          Math.PI / 2;
      rod(0, 0.5, 0, 0.038, 1.5, "edge", scythe);
      const blade = plate(
        [
          [-0.16, 1.65],
          [0.28, 1.82],
          [0.96, 1.66],
          [1.5, 1.19],
          [1.75, 0.58],
          [1.81, -0.03],
          [1.52, 0.48],
          [1.04, 0.92],
          [0.55, 1.14],
          [0.04, 1.19],
        ],
        0.14,
        "ivory",
        scythe,
      );
      blade.position.z = 0.03;
      path(
        [
          [0.08, 1.59, 0.14],
          [0.7, 1.47, 0.14],
          [1.28, 1.07, 0.14],
          [1.68, 0.39, 0.14],
        ],
        0.025,
        "light",
        scythe,
      );
      gem(0, 1.27, 0.18, 0.18, "edge", scythe);
      orb(-0.15, 0.45, -0.42, 1.18, "ink", 1, 1, 0.14);
      ring(-0.15, 0.45, -0.41, 1.2, 0.023, "light");
      for (let i = 0; i < 7; i++) {
        const a = 0.4 + i * 0.46;
        gem(
          Math.cos(a) * 1.25 - 0.15,
          Math.sin(a) * 1.25 + 0.45,
          -0.4,
          0.042,
          "edge",
        );
      }
      break;
    }
    case "keys": {
      for (let i = 0; i < 3; i++) {
        const g = group(
          (i - 1) * 0.79,
          i === 1 ? 0.17 : 0,
          (1 - Math.abs(i - 1)) * 0.25,
          (1 - i) * 0.18,
        );
        ring(0, 0.65, 0, 0.33, 0.09, "shell", g);
        ring(0, 0.65, 0.035, 0.23, 0.025, "edge", g);
        gem(0, 1.05, 0, 0.1, "light", g);
        rod(0, -0.25, 0, 0.085, 1.3, "shell", g);
        box(0, -0.26, 0.078, 0.027, 0.9, 0.014, "light", g);
        for (const y of [-0.65, -0.88]) {
          box(0.17, y, 0, 0.4, 0.13, 0.16, "shell", g);
          box(0.32, y + 0.065, 0, 0.1, 0.16, 0.16, "edge", g);
        }
        ring(0, 0.21, 0, 0.12, 0.04, "edge", g).rotation.x = Math.PI / 2;
      }
      break;
    }
    case "sybex": {
      const g = group();
      g.rotation.set(0.13, -0.24, 0);
      for (const x of [-0.9, 0.9])
        for (const y of [-0.9, 0.9])
          for (const z of [-0.55, 0.55]) {
            gem(x, y, z, 0.13, "edge", g);
            for (let axis = 0; axis < 3; axis++) {
              const a = [x, y, z],
                b = [x, y, z];
              b[axis] *= -1;
              link(a, b, 0.023, "shell", g);
            }
          }
      rod(0, 0, 0, 0.85, 0.22, "dark", g).rotation.x = Math.PI / 2;
      ring(0, 0, 0.15, 0.79, 0.055, "edge", g);
      ring(0, 0, 0.16, 0.65, 0.014, "light", g);
      dial(0.72, 60, 0.19, g);
      box(0, 0.2, 0.23, 0.044, 0.42, 0.045, "ivory", g);
      link([0, 0, 0.24], [0.35, -0.13, 0.24], 0.024, "light", g);
      gem(0, 0, 0.28, 0.085, "light", g);
      const shard = plate(
        [
          [0, 0],
          [0.17, 0.38],
          [0.45, 0.53],
          [0.32, 0.1],
        ],
        0.04,
        "edge",
        g,
      );
      shard.position.set(0.62, 0.65, 0.2);
      break;
    }
    case "tuna": {
      orb(0, 0, 0, 0.69, "shell", 1.7, 0.84, 0.72);
      orb(-0.64, 0, 0.02, 0.47, "edge", 1, 0.94, 0.85);
      const tail = plate(
        [
          [0, 0],
          [-0.2, 0.62],
          [0.35, 0.3],
          [0.58, 0.02],
          [0.35, -0.3],
          [-0.2, -0.62],
        ],
        0.1,
        "shell",
      );
      tail.position.x = 1.28;
      petal(-0.05, 0.35, 0, -0.5, 0.78, 0.43, "dark");
      petal(-0.02, -0.2, 0.48, -2.2, 0.6, 0.38, "edge");
      orb(-0.92, 0.12, 0.37, 0.105, "ink");
      orb(-0.94, 0.14, 0.45, 0.045, "light");
      for (let i = 0; i < 3; i++)
        path(
          [
            [-0.56 + i * 0.11, 0.32, 0.42],
            [-0.48 + i * 0.11, 0, 0.51],
            [-0.54 + i * 0.11, -0.29, 0.43],
          ],
          0.016,
          "dark",
        );
      path(
        [
          [-1, -0.14, 0.35],
          [-0.5, -0.35, 0.41],
          [0.3, -0.33, 0.4],
          [0.9, -0.11, 0.2],
        ],
        0.025,
        "light",
      );
      for (let i = 0; i < 4; i++)
        petal(0.35 + i * 0.16, 0.32 - i * 0.06, 0, -0.55, 0.22, 0.13, "edge");
      break;
    }
    case "nitro": {
      for (const s of [-1, 1]) {
        const g = group(s * 0.55, 0, 0, -s * 0.13);
        rod(0, 0.3, 0, 0.28, 1.3, "dark", g);
        rod(0, 0.2, 0, 0.3, 0.64, "shell", g);
        rod(0, 1.02, 0, 0.18, 0.2, "edge", g, 0.09);
        for (const y of [-0.39, -0.28, 0.62])
          ring(0, y, 0, 0.3, 0.045, "edge", g).rotation.x = Math.PI / 2;
        box(0, 0.21, 0.3, 0.11, 0.43, 0.055, "light", g);
        rod(0, -0.51, 0, 0.23, 0.15, "ink", g);
        rod(0, -1.04, 0, 0.012, 0.94, "light", g, 0.075);
        rod(0, -1.03, 0, 0.025, 1.05, "plume", g, 0.23);
        for (let i = 0; i < 4; i++) {
          const a = (i * Math.PI) / 2;
          link(
            [Math.sin(a) * 0.26, -0.31, Math.cos(a) * 0.26],
            [Math.sin(a) * 0.4, -0.55, Math.cos(a) * 0.4],
            0.035,
            "shell",
            g,
          );
        }
      }
      box(0, 0.4, 0, 0.5, 0.33, 0.35, "dark");
      gem(0, 0.43, 0.28, 0.17);
      break;
    }
    case "baezil": {
      path(
        [
          [0, -1.6, 0],
          [-0.18, -0.85, 0.1],
          [0, 0, 0],
        ],
        0.065,
        "dark",
      );
      // Nested, cupped petals curl toward the ember. Their concave faces catch
      // the studio key light while the dark outer edges keep the blossom legible.
      for (let layer = 0; layer < 3; layer++) {
        const count = 7 - layer,
          length = 1.04 - layer * 0.22;
        for (let i = 0; i < count; i++) {
          const angle = (i * Math.PI * 2) / count + layer * 0.47;
          const vertices: number[] = [],
            indices: number[] = [];
          for (let row = 0; row <= 12; row++)
            for (let col = 0; col <= 8; col++) {
              const u = row / 12,
                v = col / 4 - 1;
              const width = Math.sin(u * Math.PI) * (0.4 - layer * 0.065);
              const x = v * width,
                y = u * length;
              const z =
                0.08 +
                layer * 0.16 +
                Math.sin(u * Math.PI) * 0.28 +
                v * v * 0.1 -
                u * u * 0.18;
              vertices.push(
                x * Math.cos(angle) - y * Math.sin(angle),
                x * Math.sin(angle) + y * Math.cos(angle),
                z,
              );
            }
          for (let row = 0; row < 12; row++)
            for (let col = 0; col < 8; col++) {
              const n = row * 9 + col;
              indices.push(n, n + 1, n + 9, n + 1, n + 10, n + 9);
            }
          const geo = new T.BufferGeometry();
          geo.setAttribute(
            "position",
            new T.Float32BufferAttribute(vertices, 3),
          );
          geo.setIndex(indices);
          geo.computeVertexNormals();
          add(geo, 0, 0, 0, layer === 1 ? "edge" : "shell");
        }
      }
      materials.shell.side = materials.edge.side = T.DoubleSide;
      gem(0, 0, 0.57, 0.21, "light");
      ring(0, 0, 0.44, 0.25, 0.028, "dark");
      for (const s of [-1, 1]) {
        petal(0, -1.15, 0, -s * 0.9, 0.8, 0.33, "dark");
        link([0, -1.1, 0.07], [s * 0.5, -0.65, 0.07], 0.023, "edge");
        gem(s * 0.2, -0.6, 0.04, 0.12, "edge");
      }
      break;
    }
    case "pauly": {
      plate(
        [
          [-0.86, 0.85],
          [0, 1.1],
          [0.86, 0.85],
          [0.77, -0.35],
          [0, -1.15],
          [-0.77, -0.35],
        ],
        0.22,
        "edge",
      );
      const inlay = plate(
        [
          [-0.7, 0.73],
          [0, 0.94],
          [0.7, 0.73],
          [0.61, -0.28],
          [0, -0.92],
          [-0.61, -0.28],
        ],
        0.13,
        "dark",
      );
      inlay.position.z = 0.18;
      path(
        [
          [-0.37, 0.43, 0.3],
          [0.26, 0.43, 0.3],
          [0.35, 0.16, 0.3],
          [-0.3, -0.04, 0.3],
          [-0.28, -0.34, 0.3],
          [0.32, -0.34, 0.3],
        ],
        0.055,
        "shell",
      );
      box(0, 0.04, 0.32, 0.045, 1.03, 0.045, "edge");
      for (const s of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const x = s * (1 + i * 0.05),
            y = 0.5 - i * 0.45;
          rod(x, y, -0.06, 0.23, 0.07, "shell").rotation.x = Math.PI / 2;
          ring(x, y, 0.0, 0.17, 0.018, "edge");
          gem(x, y, 0.05, 0.07, "edge");
        }
      break;
    }
    case "machinegunqueen": {
      rod(0, -0.29, 0, 0.83, 0.3, "dark");
      for (const y of [-0.43, -0.18])
        ring(0, y, 0, 0.87, 0.046, "edge").rotation.x = Math.PI / 2;
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7,
          g = group(Math.sin(a) * 0.77, 0, Math.cos(a) * 0.77);
        g.rotation.y = a;
        const h = i % 2 ? 0.62 : 0.89;
        plate(
          [
            [-0.28, -0.17],
            [-0.21, 0.16],
            [0, h],
            [0.21, 0.16],
            [0.28, -0.17],
          ],
          0.12,
          "shell",
          g,
        );
        link([-0.17, 0.06, 0.085], [0, h - 0.19, 0.085], 0.024, "edge", g);
        link([0.17, 0.06, 0.085], [0, h - 0.19, 0.085], 0.024, "edge", g);
        const jewel = gem(0, h - 0.16, 0.1, 0.089, "light", g);
        jewel.scale.set(0.75, 1.3, 0.6);
        bolt(0, -0.07, 0.09, g);
      }
      box(0, -0.13, 0.6, 1.28, 0.29, 0.48, "dark");
      for (const x of [-0.4, 0, 0.4]) {
        rod(x, -0.1, 0.97, 0.12, 1.25, "dark").rotation.x = Math.PI / 2;
        for (const z of [0.47, 0.74, 1.42])
          ring(x, -0.1, z, 0.135, 0.027, "edge");
        rod(x, -0.1, 1.54, 0.12, 0.13, "shell").rotation.x = Math.PI / 2;
        orb(x, -0.1, 1.615, 0.075, "ink", 1, 1, 0.25);
        orb(x, -0.1, 1.635, 0.031, "light", 1, 1, 0.2);
      }
      gem(0, 0.09, 0, 0.29, "edge");
      ring(0, -0.13, 0, 0.48, 0.039, "shell").rotation.x = Math.PI / 2;

      break;
    }
    case "meesh": {
      // Curved mantle with a scalloped open hem, rather than a sphere on tubes.
      const vertices: number[] = [],
        indices: number[] = [];
      const rows = 24,
        cols = 48;
      for (let y = 0; y <= rows; y++) {
        const u = y / rows;
        for (let j = 0; j <= cols; j++) {
          const a = (j / cols) * Math.PI * 2;
          const r = Math.sin(u * Math.PI * 0.7) * 0.65 + u * u * 0.23;
          vertices.push(
            Math.cos(a) * r,
            1.25 - u * 2.25 + Math.pow(u, 6) * Math.cos(a * 7) * 0.22,
            Math.sin(a) * r,
          );
        }
      }
      for (let y = 0; y < rows; y++)
        for (let j = 0; j < cols; j++) {
          const n = y * (cols + 1) + j;
          indices.push(
            n,
            n + cols + 1,
            n + 1,
            n + 1,
            n + cols + 1,
            n + cols + 2,
          );
        }
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mantle = add(geo);
      mantle.material = materials.shell;
      materials.shell.side = T.DoubleSide;
      orb(0, 0.5, 0.4, 0.42, "ink", 0.88, 1.18, 0.3);
      eyes(0.17, 0.54, 0.55);
      for (const s of [-1, 1])
        path(
          [
            [s * 0.12, 1.1, 0.18],
            [s * 0.4, 0.51, 0.39],
            [s * 0.47, -0.38, 0.58],
            [s * 0.8, -1.07, 0.28],
          ],
          0.025,
          "edge",
        );
      gem(0, -0.18, 0.66, 0.13, "light");
      break;
    }
    case "zunneh": {
      for (let i = 0; i < 3; i++) {
        const g = group(
          (i - 1) * 1.13,
          i === 1 ? 0.4 : -0.22,
          i === 1 ? 0.16 : 0,
          (1 - i) * 0.12,
        );
        g.scale.setScalar(i === 1 ? 0.88 : 0.66);
        orb(0, 0.02, 0, 0.27, "dark", 0.6, 1.35, 0.75, g);
        orb(0, 0.4, 0.02, 0.16, "shell", 0.85, 1, 1, g);
        const beak = gem(0, 0.34, 0.2, 0.1, "edge", g);
        beak.scale.set(0.7, 0.7, 1.6);
        for (const side of [-1, 1]) {
          orb(side * 0.067, 0.43, 0.147, 0.024, "light", 1, 1, 0.4, g);
          const bone = plate(
            [
              [0, 0.17],
              [side * 0.45, 0.59],
              [side * 1.05, 0.71],
              [side * 0.75, 0.12],
              [side * 0.25, -0.13],
            ],
            0.1,
            "dark",
            g,
          );
          bone.rotation.x = 0.12;
          for (let feather = 0; feather < 5; feather++) {
            const x = side * (0.23 + feather * 0.15),
              y = 0.25 + feather * 0.065;
            const quill = plate(
              [
                [x, y],
                [x + side * 0.24, y + 0.27],
                [x + side * (0.51 - feather * 0.025), y + 0.39],
                [x + side * 0.16, y - 0.28 + feather * 0.035],
                [x, y - 0.12],
              ],
              0.06,
              feather % 2 ? "edge" : "shell",
              g,
            );
            quill.position.z = 0.06 + feather * 0.016;
            quill.rotation.x = -0.1 - feather * 0.035;
            link(
              [x + side * 0.04, y, 0.13 + feather * 0.016],
              [x + side * 0.28, y + 0.22, 0.13 + feather * 0.016],
              0.012,
              "edge",
              g,
            );
          }
          petal(
            side * 0.06,
            -0.21,
            0,
            Math.PI + side * 0.2,
            0.46,
            0.16,
            "shell",
            g,
          );
        }
        gem(0, 0.03, 0.21, 0.083, "light", g);
      }

      break;
    }
    case "rae": {
      rod(0, 0, 0, 0.64, 0.2, "dark").rotation.x = Math.PI / 2;
      orb(0, 0, 0.13, 0.47, "edge", 1, 1, 0.45);
      ring(0, 0, 0.32, 0.33, 0.033, "dark");
      orb(0, 0, 0.34, 0.24, "light", 1, 1, 0.32);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        link(
          [Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0.31],
          [Math.sin(a + 0.22) * 0.44, Math.cos(a + 0.22) * 0.44, 0.25],
          0.022,
          "dark",
        );
      }
      ring(0, 0, 0.15, 0.64, 0.065, "edge");
      ring(0, 0, 0.13, 0.83, 0.017, "shell");
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        const g = group(Math.sin(a) * 0.67, Math.cos(a) * 0.67, 0, -a);
        plate(
          [
            [-0.1, 0],
            [0, 0.66],
            [0.14, 0.15],
            [0.08, -0.03],
          ],
          0.1,
          "shell",
          g,
        );
        link([0, 0.08, 0.065], [0, 0.41, 0.065], 0.018, "edge", g);
      }
      dial(0.74, 36, 0.16);
      ring(0, 0, 0.3, 0.38, 0.016, "ivory");
      break;
    }
    case "doc": {
      plate(
        [
          [-0.28, 0.92],
          [0.28, 0.92],
          [0.28, 0.28],
          [0.92, 0.28],
          [0.92, -0.28],
          [0.28, -0.28],
          [0.28, -0.92],
          [-0.28, -0.92],
          [-0.28, -0.28],
          [-0.92, -0.28],
          [-0.92, 0.28],
          [-0.28, 0.28],
        ],
        0.23,
        "ivory",
      );
      box(0, 0, 0.18, 0.31, 1.56, 0.045, "shell");
      box(0, 0, 0.19, 1.56, 0.31, 0.045, "shell");
      path(
        [
          [-1.1, 0, 0.28],
          [-0.58, 0, 0.28],
          [-0.31, 0.25, 0.28],
          [-0.08, -0.39, 0.28],
          [0.19, 0.43, 0.28],
          [0.43, 0, 0.28],
          [1.1, 0, 0.28],
        ],
        0.023,
        "light",
      );
      for (const s of [-1, 1]) {
        const r = ring(0, 0, -0.12, 1.23, 0.04, "edge", root, Math.PI * 0.78);
        r.rotation.z = s === 1 ? 0.35 : Math.PI + 0.35;
        gem(s * 1.13, -s * 0.47, -0.12, 0.08, "light");
      }
      break;
    }
    case "kismet": {
      for (let i = 0; i < 3; i++) {
        const g = group(
          (i - 1) * 0.67,
          0.1 - Math.abs(i - 1) * 0.08,
          i * 0.1,
          (1 - i) * 0.22,
        );
        box(0, 0, 0, 0.78, 1.48, 0.085, "edge", g);
        box(0, 0, 0.055, 0.68, 1.38, 0.025, "dark", g);
        box(0, 0, 0.075, 0.58, 1.26, 0.01, "shell", g);
        const diamond = gem(0, 0, 0.15, 0.25, "edge", g);
        diamond.scale.set(0.85, 1.45, 0.35);
        for (const s of [-1, 1]) {
          gem(s * 0.21, s * 0.47, 0.13, 0.064, "light", g);
          link([-0.22, s * 0.34, 0.1], [0.22, s * 0.34, 0.1], 0.013, "edge", g);
        }
      }
      break;
    }
    case "mmiguel": {
      for (const side of [-1, 1]) {
        const g = group(side * 0.63, 0, side * 0.03, -side * 0.065),
          finish = side === 1 ? "edge" : "shell";
        orb(0, 0.82, 0, 0.225, "dark", 1, 1.23, 0.92, g);
        const helmet = plate(
          [
            [-0.2, 0.96],
            [-0.13, 1.1],
            [0.13, 1.1],
            [0.2, 0.96],
            [0.17, 0.77],
            [-0.17, 0.77],
          ],
          0.18,
          finish,
          g,
        );
        helmet.position.z = 0.06;
        box(0, 0.87, 0.19, 0.32, 0.076, 0.08, "ink", g);
        box(0, 0.88, 0.235, 0.26, 0.022, 0.018, "light", g);
        box(0, 0.65, 0, 0.33, 0.09, 0.32, "dark", g);
        const armor = plate(
          [
            [-0.24, 0.59],
            [0.24, 0.59],
            [0.2, 0.14],
            [0.12, 0.02],
            [-0.12, 0.02],
            [-0.2, 0.14],
          ],
          0.29,
          finish,
          g,
        );
        armor.position.z = 0.035;
        for (const sign of [-1, 1]) {
          link(
            [sign * 0.04, 0.48, 0.22],
            [sign * 0.17, 0.38, 0.22],
            0.025,
            "dark",
            g,
          );
          orb(sign * 0.29, 0.48, 0, 0.16, finish, 1.05, 0.8, 1, g);
          path(
            [
              [sign * 0.29, 0.42, 0],
              [sign * 0.36, 0.19, 0.09],
              [sign * 0.22, 0.14, 0.31],
            ],
            0.072,
            "dark",
            g,
          );
          orb(sign * 0.21, 0.14, 0.32, 0.087, finish, 1, 1, 1, g);
          const thigh = rod(
            sign * 0.115,
            -0.16,
            0,
            0.104,
            0.4,
            "dark",
            g,
            0.135,
          );
          thigh.rotation.z = -sign * 0.08;
          orb(sign * 0.14, -0.39, 0.04, 0.1, finish, 1, 0.9, 0.7, g);
          rod(sign * 0.15, -0.57, 0, 0.077, 0.32, "dark", g, 0.085);
          box(sign * 0.15, -0.79, 0.08, 0.21, 0.18, 0.37, finish, g);
        }
        box(0, 0.1, 0, 0.43, 0.09, 0.33, "dark", g);
        gem(0, 0.1, 0.21, 0.055, "edge", g);
        box(0, 0.26, 0.34, 0.62, 0.12, 0.15, "dark", g);
        box(side * 0.34, 0.27, 0.35, 0.3, 0.067, 0.08, "edge", g);
        for (let i = 0; i < 3; i++)
          box(-0.12 + i * 0.12, 0.27, 0.43, 0.035, 0.05, 0.017, finish, g);
        const cape = plate(
          [
            [-0.23, 0.57],
            [0.23, 0.57],
            [0.37, -0.61],
            [0.07, -0.72],
            [-0.36, -0.57],
          ],
          0.05,
          "dark",
          g,
        );
        cape.position.z = -0.22;
        path(
          [
            [-0.21, 0.47, -0.27],
            [-0.3, -0.04, -0.28],
            [-0.31, -0.53, -0.28],
          ],
          0.018,
          finish,
          g,
        );
        gem(0, 0.43, 0.21, 0.069, "light", g);
      }
      path(
        [
          [-0.61, -1.04, 0],
          [0, -1.2, 0.22],
          [0.61, -1.04, 0],
        ],
        0.018,
        "light",
      );

      break;
    }
    case "strawberry": {
      const pts = [];
      for (let i = 0; i <= 28; i++) {
        const u = i / 28;
        pts.push(
          new T.Vector2(
            Math.sin(Math.PI * u) * 0.78 * (0.6 + 0.4 * u),
            -1.05 + u * 1.95,
          ),
        );
      }
      add(new T.LatheGeometry(pts, 48));
      for (let row = 0; row < 6; row++) {
        const u = 0.22 + row * 0.115,
          r = Math.sin(Math.PI * u) * 0.78 * (0.6 + 0.4 * u);
        for (let j = 0; j < 9; j++) {
          const a = (j * Math.PI * 2) / 9 + row * 0.42;
          const seed = orb(
            Math.sin(a) * (r + 0.012),
            -1.05 + u * 1.95,
            Math.cos(a) * (r + 0.012),
            0.047,
            "edge",
            0.65,
            1.5,
            0.45,
          );
          seed.rotation.y = a;
        }
      }
      for (let i = 0; i < 7; i++) {
        const a = (i * Math.PI * 2) / 7;
        const p = petal(0, 0.77, 0, -a, 0.6, 0.26, "edge");
        p.rotation.x = 0.9;
      }
      path(
        [
          [0, 0.7, 0],
          [0.06, 1.08, 0],
          [0.25, 1.14, 0],
        ],
        0.054,
        "dark",
      );
      break;
    }
    case "nemesis": {
      rod(0, 0, 0, 0.78, 0.2, "dark").rotation.x = Math.PI / 2;
      ring(0, 0, 0.12, 0.8, 0.07, "shell");
      ring(0, 0, 0.14, 0.58, 0.025, "edge");
      dial(0.7, 32, 0.18);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        const g = group(Math.sin(a) * 1.08, Math.cos(a) * 1.08, 0, -a);
        plate(
          [
            [-0.35, 0.1],
            [0.35, 0.1],
            [0.35, -0.15],
            [0.12, -0.15],
            [0, -0.34],
            [-0.12, -0.15],
            [-0.35, -0.15],
          ],
          0.13,
          "shell",
          g,
        );
      }
      for (const s of [-1, 1]) {
        box(s * 0.29, 0, 0.21, 0.32, 0.026, 0.025, "light");
        box(0, s * 0.29, 0.21, 0.026, 0.32, 0.025, "light");
      }
      gem(0, 0, 0.23, 0.11, "light");
      break;
    }
    case "bronze-leopard": {
      // A low stalking pose with continuous bronze anatomy and incised rosettes.
      orb(0, -0.03, -0.12, 0.56, "shell", 0.72, 0.8, 1.7);
      orb(0, 0.12, 0.53, 0.4, "shell", 0.9, 1.2, 1.2);
      orb(0, 0.43, 0.94, 0.36, "shell", 1.05, 0.82, 1.05);
      for (const side of [-1, 1]) {
        const ear = plate(
          [
            [side * 0.13, 0.58],
            [side * 0.29, 0.85],
            [side * 0.36, 0.55],
          ],
          0.075,
          "shell",
        );
        ear.position.z = 0.79;
        const inside = plate(
          [
            [side * 0.19, 0.59],
            [side * 0.28, 0.76],
            [side * 0.3, 0.58],
          ],
          0.025,
          "dark",
        );
        inside.position.z = 0.84;
        orb(side * 0.14, 0.26, 1.22, 0.15, "edge", 1.15, 0.6, 0.66);
        orb(side * 0.19, 0.45, 1.235, 0.084, "ink", 1.35, 0.42, 0.25);
        orb(side * 0.19, 0.45, 1.26, 0.035, "light", 0.55, 0.8, 0.22);
        path(
          [
            [side * 0.1, 0.55, 1.13],
            [side * 0.21, 0.53, 1.2],
            [side * 0.3, 0.5, 1.11],
          ],
          0.025,
          "edge",
        );
        path(
          [
            [side * 0.29, -0.12, 0.49],
            [side * 0.34, -0.37, 0.55],
            [side * 0.35, -0.65, 0.81],
            [side * 0.35, -0.74, 1.04],
          ],
          0.105,
          "shell",
        );
        orb(side * 0.3, -0.14, -0.65, 0.25, "shell", 0.8, 1.3, 1.25);
        path(
          [
            [side * 0.31, -0.24, -0.65],
            [side * 0.38, -0.47, -0.87],
            [side * 0.38, -0.71, -0.65],
          ],
          0.092,
          "shell",
        );
        for (const z of [1.07, -0.58]) {
          orb(side * 0.35, -0.74, z, 0.2, "shell", 0.9, 0.47, 1.2);
          for (let j = 0; j < 3; j++) {
            path(
              [
                [side * 0.35 + (j - 1) * 0.075, -0.74, z + 0.13],
                [side * 0.35 + (j - 1) * 0.075, -0.76, z + 0.23],
              ],
              0.023,
              "ivory",
            );
          }
        }
        for (let row = 0; row < 3; row++)
          for (let j = 0; j < 5; j++) {
            const angle = (row - 1) * 0.47,
              x = side * Math.cos(angle) * 0.405,
              y = Math.sin(angle) * 0.39 + 0.015,
              z = -0.65 + j * 0.27;
            const mark = ring(x, y, z, 0.047 + (j % 2) * 0.01, 0.011, "dark");
            mark.rotation.y = (side * Math.PI) / 2;
            mark.rotation.x = angle;
            mark.scale.y = 0.8;
          }
      }
      gem(0, 0.29, 1.34, 0.072, "ink");
      path(
        [
          [-0.11, 0.18, 1.28],
          [0, 0.15, 1.3],
          [0.11, 0.18, 1.28],
        ],
        0.014,
        "dark",
      );
      path(
        [
          [0, 0.03, -1],
          [0.25, 0.13, -1.4],
          [0.69, 0.38, -1.55],
          [0.81, 0.64, -1.28],
          [0.66, 0.7, -1.15],
        ],
        0.051,
        "shell",
      );

      break;
    }
    case "five10": {
      box(0, 0, -0.25, 2.28, 1.47, 0.74, "dark");
      box(0, 0, 0.16, 2.14, 1.34, 0.11, "shell");
      for (let i = 0; i < 10; i++) {
        const x = ((i % 5) - 2) * 0.4,
          y = i < 5 ? 0.36 : -0.36;
        rod(x, y, 0.36, 0.157, 0.38, "dark").rotation.x = Math.PI / 2;
        ring(x, y, 0.57, 0.154, 0.025, "edge");
        ring(x, y, 0.49, 0.158, 0.02, "shell");
        orb(x, y, 0.545, 0.115, "ink", 1, 1, 0.12);
        gem(x, y, 0.58, 0.056, "light").scale.z = 0.3;
      }
      for (const side of [-1, 1]) {
        box(side * 1.14, 0, -0.1, 0.13, 1.69, 0.89, "edge");
        for (const y of [-0.74, 0.74]) bolt(side * 1.14, y, 0.38);
        for (let i = 0; i < 5; i++)
          box(side * 1.218, -0.42 + i * 0.2, -0.16, 0.04, 0.045, 0.45, "dark");
      }
      box(0, 0, 0.62, 1.35, 0.27, 0.15, "dark");
      const segments = [
        [-0.48, 0.08, 0.2, 0.027],
        [-0.57, 0.04, 0.027, 0.08],
        [-0.48, 0, 0.2, 0.027],
        [-0.39, -0.04, 0.027, 0.08],
        [-0.48, -0.08, 0.2, 0.027],
        [0.05, 0, 0.027, 0.19],
        [0.3, 0, 0.027, 0.19],
        [0.51, 0, 0.027, 0.19],
        [0.4, 0.08, 0.2, 0.027],
        [0.4, -0.08, 0.2, 0.027],
      ];
      for (const [x, y, w, h] of segments)
        box(x, y, 0.71, w, h, 0.025, "ivory");
      for (const side of [-1, 1])
        link(
          [side * 0.8, -0.68, -0.3],
          [side * 1.06, -0.96, 0.18],
          0.09,
          "dark",
        );

      break;
    }
    case "shannondoa": {
      for (let i = 0; i < 3; i++) {
        const pts = Array.from({ length: 18 }, (_, j) => [
          (i - 1) * 0.52 + Math.sin(j * 0.31 + i * 0.32) * 0.23,
          1.45 - j * 0.17,
          Math.sin(j * 0.3) * 0.1,
        ]);
        path(pts, i === 1 ? 0.078 : 0.047, i === 1 ? "light" : "shell");
      }
      for (const s of [-1, 1]) {
        path(
          [
            [s * 0.85, -1.1, 0],
            [s * 1.01, 0, 0],
            [s * 0.7, 1.08, 0],
          ],
          0.027,
          "edge",
        );
        for (let i = 0; i < 4; i++) {
          petal(
            s * (0.89 - i * 0.03),
            -0.75 + i * 0.45,
            0,
            -s * 0.8,
            0.41,
            0.18,
            "edge",
          );
        }
      }
      gem(0, -1.4, 0, 0.12, "shell");
      break;
    }
    case "kuttula": {
      orb(0, -0.56, 0, 0.55, "dark", 1, 0.65, 0.8);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        const s = Math.sin(a),
          c = Math.cos(a);
        const points = [
          [0, -0.75, 0],
          [s * 0.7, -0.4, c * 0.7],
          [s * 1.05, 0.25, c * 1.05],
          [s * 0.96, 0.92, c * 0.96],
          [s * 0.63, 1.17, c * 0.63],
          [s * 0.47, 0.92, c * 0.47],
        ];
        path(points, 0.1, "shell");
        for (let j = 0; j < 5; j++) {
          const u = j / 4;
          orb(
            s * (0.66 + Math.sin(u * Math.PI) * 0.31),
            -0.3 + u * 1.22,
            c * (0.66 + Math.sin(u * Math.PI) * 0.31) + 0.07,
            0.071,
            "edge",
            1,
            0.65,
            0.6,
          );
        }
      }
      eyes(0.17, -0.49, 0.43);
      break;
    }
    case "gimmy": {
      const g = group(0, 0, 0, -0.16);
      ring(0, -0.1, 0, 0.73, 0.19, "dark", g, Math.PI).rotation.z = Math.PI;
      ring(0, -0.1, 0.17, 0.73, 0.045, "shell", g, Math.PI).rotation.z =
        Math.PI;
      for (const s of [-1, 1]) {
        box(s * 0.73, 0.36, 0, 0.37, 0.91, 0.36, "shell", g);
        box(s * 0.73, 0.82, 0, 0.39, 0.23, 0.4, "edge", g);
        box(s * 0.73, 0.95, 0, 0.28, 0.035, 0.3, "light", g);
        for (let i = 0; i < 5; i++)
          box(s * 0.73, 0.02 + i * 0.11, 0.19, 0.4, 0.025, 0.023, "dark", g);
      }
      for (let i = 0; i < 5; i++) {
        const a = i * 1.4;
        const q = gem(
          Math.sin(a) * 0.45,
          1.2 + i * 0.13,
          Math.cos(a) * 0.24,
          0.095,
          "edge",
        );
        q.rotation.z = a;
      }
      break;
    }
    case "haut-carl": {
      for (let i = 0; i < 3; i++) {
        const g = group(
          (i - 1) * 0.69,
          i === 1 ? 0.17 : -0.11,
          i === 1 ? 0.18 : 0,
          (1 - i) * 0.14,
        );
        box(0, 0, 0, 0.59, 1.24, 0.5, "shell", g);
        box(0, 0, 0.28, 0.61, 0.23, 0.07, "dark", g);
        box(0, 0, 0.3, 0.12, 1.27, 0.065, "edge", g);
        rod(0, 0.73, 0, 0.18, 0.18, "dark", g, 0.08);
        path(
          [
            [0, 0.8, 0],
            [0.13, 1, 0],
            [0.3, 0.91, 0],
          ],
          0.025,
          "edge",
          g,
        );
        gem(0.3, 0.91, 0, 0.075, "light", g);
        for (const s of [-1, 1]) {
          box(s * 0.17, -0.73, 0, 0.09, 0.28, 0.45, "dark", g);
          bolt(s * 0.19, s * 0.4, 0.27, g);
        }
      }
      break;
    }
    case "hondo": {
      for (let i = 0; i < 3; i++) {
        const g = group((i - 1) * 0.82, i === 1 ? 0.15 : 0, 0);
        g.rotation.y = (i - 1) * -0.16;
        plate(
          [
            [-0.37, -0.82],
            [-0.37, 0.7],
            [-0.25, 0.85],
            [0.25, 0.85],
            [0.37, 0.7],
            [0.37, -0.82],
          ],
          0.22,
          "dark",
          g,
        );
        box(0, 0.03, 0.16, 0.59, 1.37, 0.13, "shell", g);
        box(0, 0.24, 0.25, 0.42, 0.1, 0.03, "light", g);
        for (const y of [-0.48, 0.53]) {
          box(0, y, 0.27, 0.62, 0.1, 0.08, "edge", g);
          for (const s of [-1, 1]) bolt(s * 0.24, y, 0.33, g);
        }
        for (const s of [-1, 1])
          link([s * 0.22, -0.7, 0], [s * 0.3, -1.1, 0.3], 0.07, "edge", g);
      }
      break;
    }
    case "panda": {
      orb(0, -0.18, 0, 0.68, "ivory", 1, 1.07, 0.72);
      orb(0, 0.69, 0.03, 0.59, "ivory", 1, 0.88, 0.8);
      for (const s of [-1, 1]) {
        orb(s * 0.46, 1.05, 0, 0.22, "ink", 1, 1, 0.7);
        orb(s * 0.46, 1.05, 0.13, 0.13, "dark", 1, 1, 0.3);
        const patch = orb(s * 0.25, 0.74, 0.45, 0.2, "ink", 0.85, 1.15, 0.25);
        patch.rotation.z = -s * 0.3;
        orb(s * 0.23, 0.76, 0.5, 0.064, "ivory", 0.8, 1, 0.3);
        orb(s * 0.23, 0.76, 0.52, 0.037, "ink", 1, 1, 0.3);
        const arm = group(s * 0.49, 0.3, 0.04);
        arm.userData.rig = "panda-arm";
        arm.userData.side = s;
        orb(s * 0.12, -0.42, 0, 0.28, "ink", 0.9, 1.57, 1, arm);
        ring(s * 0.12, -0.49, 0, 0.27, 0.038, "edge", arm).rotation.x =
          Math.PI / 2;
        orb(s * 0.36, -0.87, 0.15, 0.27, "ink", 1, 0.8, 1.3);
      }
      orb(0, 0.51, 0.49, 0.22, "ivory", 1, 0.7, 0.4);
      gem(0, 0.56, 0.6, 0.083, "ink");
      path(
        [
          [-0.12, 0.42, 0.57],
          [0, 0.39, 0.59],
          [0.12, 0.42, 0.57],
        ],
        0.014,
        "ink",
      );
      box(0, -0.21, 0.47, 0.7, 0.14, 0.09, "dark");
      gem(0, -0.21, 0.57, 0.14, "edge");
      break;
    }
    case "pokey": {
      orb(0, -0.1, -0.14, 0.63, "dark", 1, 0.8, 1.1);
      orb(0, -0.18, 0.43, 0.4, "shell", 1, 0.8, 0.8);
      orb(0, -0.26, 0.7, 0.2, "shell", 0.9, 0.7, 1);
      eyes(0.2, -0.1, 0.68);
      gem(0, -0.25, 0.87, 0.079, "ink");
      for (const side of [-1, 1]) {
        orb(side * 0.33, 0.1, 0.45, 0.13, "dark", 1, 0.9, 0.55);
        for (const z of [-0.46, 0.39])
          orb(side * 0.42, -0.55, z, 0.16, "shell", 1, 0.5, 1.5);
      }
      for (let row = 0; row < 3; row++)
        for (let i = 0; i < 9; i++) {
          const a = (i / 8) * Math.PI - Math.PI / 2,
            z = -0.68 + row * 0.34;
          const start = new T.Vector3(
            Math.sin(a) * 0.51,
            Math.cos(a) * 0.48 - 0.05,
            z,
          );
          const direction = new T.Vector3(
            Math.sin(a) * 0.8,
            Math.cos(a),
            -0.32,
          ).normalize();
          const len = 0.38 + ((i + row) % 3) * 0.1;
          const quill = rod(0, 0, 0, 0.052, len, "edge", root, 0.004);
          quill.position.copy(start).addScaledVector(direction, len * 0.38);
          quill.quaternion.setFromUnitVectors(
            new T.Vector3(0, 1, 0),
            direction,
          );
        }

      break;
    }
    case "platypus": {
      orb(0, -0.04, -0.12, 0.67, "shell", 0.9, 0.6, 1.36);
      orb(0, 0.17, 0.55, 0.4, "shell", 1, 0.85, 0.95);
      orb(0, -0.05, 0.99, 0.48, "edge", 1, 0.23, 1.12);
      eyes(0.24, 0.34, 0.79);
      for (const s of [-1, 1])
        for (const z of [-0.5, 0.44]) {
          orb(s * 0.59, -0.37, z, 0.28, "dark", 1, 0.2, 1.3);
          for (let j = 0; j < 3; j++)
            link(
              [s * 0.52, -0.32, z],
              [s * (0.69 + j * 0.06), -0.36, z + 0.18 - j * 0.12],
              0.024,
              "edge",
            );
        }
      orb(0, -0.13, -1.1, 0.5, "edge", 0.72, 0.17, 1.2);
      for (let i = 0; i < 4; i++)
        link(
          [-0.22, -0.035, -0.84 - i * 0.14],
          [0.22, -0.035, -0.84 - i * 0.14],
          0.012,
          "dark",
        );
      break;
    }
    case "so1ician": {
      const g = group(0, 0.25, 0, -0.5);
      rod(0, -0.35, 0, 0.085, 1.72, "dark", g);
      for (let i = 0; i < 7; i++)
        ring(0, -0.68 + i * 0.09, 0, 0.085, 0.018, "edge", g).rotation.x =
          Math.PI / 2;
      rod(0, 0.62, 0, 0.28, 1.16, "shell", g).rotation.z = Math.PI / 2;
      for (const s of [-1, 1]) {
        rod(s * 0.5, 0.62, 0, 0.33, 0.15, "edge", g).rotation.z = Math.PI / 2;
        ring(s * 0.38, 0.62, 0, 0.28, 0.026, "dark", g).rotation.y =
          Math.PI / 2;
      }
      gem(0, 0.62, 0.3, 0.16, "light", g);
      rod(0, -1.06, 0.02, 0.75, 0.18, "dark");
      rod(0, -0.94, 0.02, 0.65, 0.1, "edge");
      for (let i = 0; i < 3; i++)
        path(
          [
            [-1.17 - i * 0.11, -0.38 + i * 0.32, 0],
            [-1.09 - i * 0.11, 0.03 + i * 0.32, 0],
            [-0.86 - i * 0.11, 0.33 + i * 0.32, 0],
          ],
          0.016,
          "shell",
        );
      break;
    }
  }
  // Bake by finish: detail costs vertices rather than one draw call per bolt/seed.
  root.updateMatrixWorld(true);
  const rigs = root.children.filter((child) => child.userData.rig);
  const rigMaterials = new Set<T.Material>();
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  root.traverse((o) => {
    if (o instanceof T.Mesh) {
      let parent = o.parent;
      while (parent && parent !== root) {
        if (parent.userData.rig) {
          rigMaterials.add(o.material);
          return;
        }
        parent = parent.parent;
      }
      const geo = o.geometry.index
        ? o.geometry.toNonIndexed()
        : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      geo.deleteAttribute("uv");
      const a = batches.get(o.material) || [];
      a.push(geo);
      batches.set(o.material, a);
      o.geometry.dispose();
    }
  });
  root.clear();
  for (const [material, geometries] of batches) {
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (merged) root.add(new T.Mesh(merged, material));
  }
  if (rigs.length) root.add(...rigs);
  for (const m of Object.values(materials))
    if (!batches.has(m) && !rigMaterials.has(m)) m.dispose();
  root.userData.id = id;
  return root;
}
