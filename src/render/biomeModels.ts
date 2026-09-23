import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RNG } from "../game/rng";
import { BIOMES, sampleBiome, type BiomeId, type BiomeReview } from "./biomes";
import { streetTexture, weatheredTexture } from "./textures";

export interface SceneryLibrary {
  materials: Record<string, T.MeshStandardMaterial>;
  trees?: Map<string, T.Group>;
  dispose(): void;
}
export function sceneryLibrary(): SceneryLibrary {
  const materials: Record<string, T.MeshStandardMaterial> = {};
  const add = (id: string, roughness: number, map?: T.Texture, metalness = 0) =>
    (materials[id] = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness,
      metalness,
      map,
      ...(map ? { bumpMap: map, bumpScale: 0.045 } : {}),
    }));
  add("stone", 0.94, weatheredTexture("concrete"));
  add("brick", 0.9, streetTexture("brick"));
  add("road", 0.94, streetTexture("asphalt"));
  add("paving", 0.88, streetTexture("paving"));
  add("wood", 0.87, weatheredTexture("ground"));
  add("metal", 0.6, undefined, 0.45);
  add("glass", 0.23, streetTexture("glass"), 0.35);
  add("leaf", 0.94);
  add("straw", 0.92, foliageTexture(false, true));
  materials.straw.alphaTest = 0.42;
  materials.straw.side = T.DoubleSide;
  materials.straw.bumpMap = null;
  add("broadleaf", 0.92, foliageTexture(true));
  materials.broadleaf.alphaTest = 0.42;
  materials.broadleaf.side = T.DoubleSide;
  materials.broadleaf.bumpMap = null;
  add("needles", 0.92, foliageTexture());
  materials.needles.alphaTest = 0.42;
  materials.needles.side = T.DoubleSide;
  materials.needles.bumpMap = null;
  add("ground", 1, weatheredTexture("ground"));
  add("paint", 0.8);
  add("glow", 0.5);
  materials.glow.emissive.set("#efb45b");
  materials.glow.emissiveIntensity = 1.3;
  const library: SceneryLibrary = {
    materials,
    trees: new Map(),
    dispose: () => {
      for (const tree of library.trees!.values())
        tree.traverse((o) => {
          if (o instanceof T.Mesh) o.geometry.dispose();
        });
      library.trees!.clear();
      materials.straw.map?.dispose();
      materials.needles.map?.dispose();
      materials.broadleaf.map?.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    },
  };
  // Build the small reusable canopy library during scene loading. Normal
  // streaming only places instances; it never remeshes thousands of leaves.
  for (const density of [0, 1])
    for (let variant = 0; variant < 4; variant++)
      pinePrototype(library, density, variant);
  return library;
}
function foliageTexture(broad = false, dry = false) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!,
    r = new RNG("pine-needles");
  ctx.lineCap = "round";
  for (let branch = 0; branch < 13; branch++) {
    const startX = 128,
      startY = 245 - branch * 15,
      sign = branch % 2 ? -1 : 1,
      endX = 128 + sign * (90 - branch * 4),
      endY = startY - 65;
    ctx.strokeStyle = "#a5b991";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    for (let j = 0; j < 28; j++) {
      const t = j / 28,
        x = startX + (endX - startX) * t,
        y = startY + (endY - startY) * t;
      ctx.strokeStyle = ["#d0d9ad", "#a0b58b", "#6d916e"][r.int(3)];
      ctx.lineWidth = 1.5;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + side * (6 + r.next() * 8), y - 13 - r.next() * 10);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = "#96a480";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(128, 256);
  ctx.lineTo(128, 12);
  ctx.stroke();
  if (broad) {
    ctx.clearRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) {
      const a = r.next() * Math.PI * 2,
        d = Math.sqrt(r.next()) * 105,
        x = 128 + Math.cos(a) * d,
        y = 128 + Math.sin(a) * d;
      ctx.strokeStyle = "#8b9870";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(128, 160);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = ["#c6d7a3", "#a5bf86", "#8ba575", "#d3dfb0"][r.int(4)];
      ctx.beginPath();
      ctx.ellipse(x, y, 5 + r.next() * 5, 3 + r.next() * 3, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (dry) {
    const image = ctx.getImageData(0, 0, 256, 256);
    for (let i = 0; i < image.data.length; i += 4) {
      const v =
        image.data[i] * 0.21 +
        image.data[i + 1] * 0.72 +
        image.data[i + 2] * 0.07;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
    }
    ctx.putImageData(image, 0, 0);
  }
  const map = new T.CanvasTexture(canvas);
  map.colorSpace = T.SRGBColorSpace;
  map.anisotropy = 8;
  return map;
}
class Builder {
  batches = new Map<string, T.BufferGeometry[]>();
  root = new T.Group();
  position = new T.Vector3();
  scale = new T.Vector3();
  rotation = new T.Quaternion();
  matrix = new T.Matrix4();
  constructor(
    public library: SceneryLibrary,
    private auditParts = false,
  ) {}
  private partId = 0;
  add(
    g: T.BufferGeometry,
    mat: string,
    color: string,
    x = 0,
    y = 0,
    z = 0,
    sx = 1,
    sy = 1,
    sz = 1,
    rx = 0,
    ry = 0,
    rz = 0,
    casts = true,
  ) {
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.rotation.setFromEuler(new T.Euler(rx, ry, rz));
    this.matrix.compose(this.position, this.rotation, this.scale);
    g.applyMatrix4(this.matrix);
    if (this.auditParts)
      g.setAttribute(
        "_part_id",
        new T.BufferAttribute(
          new Float32Array(g.getAttribute("position").count).fill(
            ++this.partId,
          ),
          1,
        ),
      );
    const rgb = new T.Color(color),
      colors = new Float32Array(g.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = rgb.r;
      colors[i + 1] = rgb.g;
      colors[i + 2] = rgb.b;
    }
    g.setAttribute("color", new T.BufferAttribute(colors, 3));
    if (!g.getAttribute("uv"))
      g.setAttribute(
        "uv",
        new T.BufferAttribute(new Float32Array((colors.length / 3) * 2), 2),
      );
    const key = `${mat}:${casts}`;
    const batch = this.batches.get(key) ?? [];
    batch.push(g);
    this.batches.set(key, batch);
  }
  box(
    mat: string,
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
    casts = true,
  ) {
    const g = new T.BoxGeometry(w, h, d),
      uv = g.getAttribute("uv");
    if (["brick", "wood", "paving", "stone"].includes(mat))
      for (let i = 0; i < uv.count; i++) {
        const f = Math.floor(i / 4);
        uv.setXY(
          i,
          (uv.getX(i) * (f < 2 ? d : w)) / 2.4,
          (uv.getY(i) * (f < 2 ? h : f < 4 ? d : h)) / 2.4,
        );
      }
    this.add(g, mat, c, x, y, z, 1, 1, 1, rx, ry, rz, casts);
  }
  beam(
    mat: string,
    c: string,
    a: number[],
    b: number[],
    r: number,
    r2 = r,
    sides = 7,
  ) {
    const p = new T.Vector3(...a),
      q = new T.Vector3(...b),
      direction = q.clone().sub(p);
    const g = new T.CylinderGeometry(r2, r, direction.length(), sides);
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        direction.clone().normalize(),
      ),
    );
    const middle = p.add(q).multiplyScalar(0.5);
    this.add(g, mat, c, middle.x, middle.y, middle.z);
  }
  finish() {
    for (const [key, gs] of this.batches) {
      const [id, casts] = key.split(":");
      const g = mergeGeometries(
        gs.map((v) => {
          if (!v.index) return v;
          const n = v.toNonIndexed();
          v.dispose();
          return n;
        }),
      )!;
      const mesh = new T.Mesh(g, this.library.materials[id]);
      mesh.castShadow = casts === "true";
      mesh.receiveShadow = true;
      this.root.add(mesh);
      gs.forEach((v) => v.dispose());
    }
    this.batches.clear();
    return this.root;
  }
}

function pinePrototype(
  library: SceneryLibrary,
  density: number,
  variant: number,
) {
  const cache = (library.trees ??= new Map<string, T.Group>()),
    key = `${density}:${variant}`;
  let root = cache.get(key);
  if (!root) {
    const b = new Builder(library);
    buildTree(b, new RNG(`pine-prototype:${key}`), 0, 0, 12, "pine", density);
    root = b.finish();
    root.traverse((o) => {
      if (o instanceof T.Mesh) o.userData.sharedAsset = true;
    });
    cache.set(key, root);
  }
  return root;
}
function tree(
  b: Builder,
  r: RNG,
  x: number,
  z: number,
  h: number,
  kind: "pine" | "leaf" | "burnt",
  density: number,
  ground = 0,
) {
  if (kind !== "pine") return buildTree(b, r, x, z, h, kind, density);
  const model = pinePrototype(b.library, density, r.int(4)).clone(true);
  model.position.set(x, ground, z);
  model.scale.setScalar(h / 12);
  model.rotation.y = r.next() * Math.PI * 2;
  b.root.add(model);
}
function buildTree(
  b: Builder,
  r: RNG,
  x: number,
  z: number,
  h: number,
  kind: "pine" | "leaf" | "burnt",
  density: number,
) {
  const lean = (r.next() - 0.5) * 0.8,
    bark = kind === "burnt" ? "#403a32" : "#70604a";
  b.beam(
    "wood",
    bark,
    [x, 0, z],
    [x + lean, h, z + 0.25],
    h * 0.027,
    h * (kind === "pine" ? 0.0015 : 0.009),
    9,
  );
  for (let i = 0; i < 5; i++) {
    const a = i * 2.4;
    b.beam(
      "wood",
      bark,
      [x + Math.cos(a) * h * 0.08, 0.03, z + Math.sin(a) * h * 0.08],
      [x, h * 0.12, z],
      0.07,
      h * 0.025,
    );
  }
  if (kind === "pine") {
    for (let tier = 0; tier < 14; tier++) {
      const y = h * (0.14 + tier * 0.065),
        radius = h * (0.235 - tier * 0.0165) * (1 + r.next() * 0.13);
      for (let j = 0; j < (density ? 7 : 5); j++) {
        const a = j * 2.399 + tier * 1.71,
          cx = x + (lean * y) / h,
          cz = z + (0.25 * y) / h,
          end = [cx + Math.cos(a) * radius, y - 0.3, cz + Math.sin(a) * radius];
        b.beam(
          "wood",
          bark,
          [x + (lean * y) / h, y + 0.15, z],
          end,
          0.035,
          0.007,
          5,
        );
        for (let k = 0; k < (density ? 4 : 3); k++) {
          const t = 0.28 + k * 0.21,
            px = cx + Math.cos(a) * radius * t,
            pz = cz + Math.sin(a) * radius * t;
          const size = radius * (0.9 - t * 0.4);
          b.add(
            new T.PlaneGeometry(size, size * 1.3),
            "needles",
            "#87a48a",
            px,
            y + 0.12,
            pz,
            1,
            1,
            1,
            -Math.PI / 2 + 0.18,
            a + k * 0.7,
            0.1,
            true,
          );
          b.add(
            new T.PlaneGeometry(size, size * 1.2),
            "needles",
            "#6a9277",
            px,
            y + 0.25,
            pz,
            1,
            1,
            1,
            -0.4,
            a + k * 0.7,
            0.15,
            true,
          );
        }
      }
    }
  } else {
    for (let j = 0; j < (density ? 11 : 7); j++) {
      const a = j * 2.399,
        y = h * (0.45 + r.next() * 0.3),
        length = h * (0.15 + r.next() * 0.17),
        end = [
          x + Math.cos(a) * length,
          y + h * 0.16,
          z + Math.sin(a) * length,
        ];
      b.beam(
        "wood",
        bark,
        [x + lean * 0.5, y, z],
        end,
        h * 0.014,
        h * 0.004,
        6,
      );
      if (kind === "burnt") {
        b.beam(
          "wood",
          bark,
          end,
          [
            end[0] + Math.cos(a + 0.8) * 0.5,
            end[1] + 0.7,
            end[2] + Math.sin(a + 0.8) * 0.5,
          ],
          0.055,
          0.008,
          5,
        );
      } else
        for (let fan = 0; fan < (density ? 9 : 6); fan++) {
          const aa = fan * 2.399;
          b.add(
            new T.PlaneGeometry(h * 0.32, h * 0.32),
            "broadleaf",
            "#b5c890",
            end[0] + Math.cos(aa) * h * 0.09,
            end[1] + Math.sin(aa) * h * 0.08,
            end[2] + Math.sin(aa) * h * 0.09,
            1,
            1,
            1,
            fan * 0.8,
            aa,
            aa * 0.2,
            true,
          );
        }
    }
  }
}
function rock(
  b: Builder,
  r: RNG,
  x: number,
  z: number,
  size: number,
  ash = false,
) {
  const g = new T.IcosahedronGeometry(1, 2),
    p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const f =
      0.9 +
      Math.sin(p.getX(i) * 12.7 + p.getY(i) * 8.3 + p.getZ(i) * 17.1) * 0.12;
    p.setXYZ(i, p.getX(i) * f, p.getY(i) * f, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  b.add(
    g,
    "stone",
    ash ? "#655d50" : "#8b9084",
    x,
    size * 0.35,
    z,
    size,
    size * 0.65,
    size * 0.8,
    0,
    r.next() * 6,
  );
}
function fence(
  b: Builder,
  x: number,
  z: number,
  length: number,
  style: "wood" | "white" | "iron",
) {
  const c =
      style === "white" ? "#d5d2ba" : style === "iron" ? "#475452" : "#96836a",
    mat = style === "iron" ? "metal" : "wood";
  for (let dz = -length / 2; dz <= length / 2; dz += 1.6)
    b.box(mat, c, x, 0.65, z + dz, 0.13, 1.3, 0.13);
  for (const y of [0.4, 0.95]) b.box(mat, c, x, y, z, 0.1, 0.09, length);
  if (style !== "wood")
    for (let dz = -length / 2; dz < length / 2; dz += 0.3)
      b.box(mat, c, x, 0.64, z + dz, 0.075, 1.1, 0.08);
}
function roof(
  b: Builder,
  x: number,
  z: number,
  w: number,
  d: number,
  y: number,
  rise: number,
  c: string,
) {
  const shape = new T.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const g = new T.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  b.add(g, "wood", c, x, y, z);
  const angle = Math.atan2(rise, w / 2),
    slope = Math.hypot(rise, w / 2);
  for (const sign of [-1, 1]) {
    b.box(
      "stone",
      "#53605d",
      x + (sign * w) / 4,
      y + rise / 2 + 0.06,
      z,
      slope + 0.3,
      0.15,
      d + 0.55,
      0,
      0,
      -sign * angle,
    );
    for (let dz = -d / 2; dz < d / 2; dz += 0.65)
      b.box(
        "metal",
        "#6a7269",
        x + (sign * w) / 4,
        y + rise / 2 + 0.15,
        z + dz,
        slope + 0.32,
        0.035,
        0.035,
        0,
        0,
        -sign * angle,
        false,
      );
  }
  b.box("metal", "#81877a", x, y + rise + 0.15, z, 0.17, 0.14, d + 0.6);
}
function house(b: Builder, r: RNG, x: number, z: number, v: number) {
  const w = 6.4 + (v % 2) * 1.4,
    d = 7.7,
    h = 3.7 + (v % 3 === 0 ? 2.5 : 0),
    c = ["#b5baa3", "#9ba9a2", "#bdaf92", "#a3aaa4"][v % 4];
  b.box("stone", "#7d8279", x, 0.28, z, w + 0.3, 0.55, d + 0.35);
  b.box("wood", c, x, h / 2 + 0.4, z, w, h, d);
  for (let y = 0.7; y < h + 0.3; y += 0.25) {
    b.box(
      "wood",
      "#747e7040".slice(0, 7),
      x - w / 2 - 0.02,
      y,
      z,
      0.045,
      0.025,
      d,
    );
    b.box("wood", "#c3c6b2", x, y, z + d / 2 + 0.02, w, 0.025, 0.035);
  }
  roof(b, x, z, w + 0.2, d, h + 0.4, 2.4, c);
  b.box("brick", "#b6a18d", x + w * 0.28, h + 1.2, z - 2, 0.85, 2.8, 0.9);
  b.box("stone", "#c5c1ad", x + w * 0.28, h + 2.65, z - 2, 1, 0.18, 1.05);
  for (const side of [-1, 1])
    for (const dz of [-2.2, 1.2]) {
      b.box(
        "paint",
        "#d9d6bd",
        x + side * (w / 2 + 0.03),
        2,
        z + dz,
        0.12,
        1.85,
        1.5,
      );
      b.box(
        "glass",
        "#8aa4a8",
        x + side * (w / 2 + 0.1),
        2,
        z + dz,
        0.08,
        1.5,
        1.22,
      );
      b.box(
        "paint",
        "#ded9bf",
        x + side * (w / 2 + 0.15),
        2,
        z + dz,
        0.06,
        0.065,
        1.3,
      );
      b.box(
        "paint",
        "#ded9bf",
        x + side * (w / 2 + 0.15),
        2,
        z + dz,
        0.06,
        1.6,
        0.07,
      );
      for (const k of [-1, 1])
        b.box(
          "wood",
          "#566b5e",
          x + side * (w / 2 + 0.15),
          2,
          z + dz + k * 0.95,
          0.12,
          1.8,
          0.35,
        );
    }
  const front = z + d / 2;
  b.box("wood", "#485b50", x, 1.65, front + 0.04, 1.1, 2.5, 0.1);
  b.box("wood", "#c5c6ae", x, 0.5, front + 1.2, w + 0.4, 0.25, 2.2);
  b.box("wood", "#89978a", x, 3.15, front + 1.1, w + 0.7, 0.2, 2.5, 0.07);
  for (const dx of [-w / 2 + 0.2, w / 2 - 0.2]) {
    b.box("paint", "#d4d0b9", x + dx, 1.8, front + 2, 0.18, 2.7, 0.18);
    b.box("stone", "#8b8e7d", x + dx, 0.9, front + 2, 0.42, 0.75, 0.42);
  }
  for (let i = 0; i < 3; i++)
    b.box(
      "stone",
      "#acaf9a",
      x,
      0.13 + i * 0.12,
      front + 2.6 - i * 0.24,
      2,
      0.22,
      0.4,
    );
  b.box(
    "stone",
    "#a7ab99",
    x,
    0.015,
    front + 4,
    1.7,
    0.04,
    2.5,
    0,
    0,
    0,
    false,
  );
}
function building(
  b: Builder,
  r: RNG,
  x: number,
  z: number,
  v: number,
  ruin = false,
) {
  const w = 7 + (v % 3),
    d = 13.5,
    h = ruin ? 8 + v * 2 : 12 + (v % 4) * 4;
  const c = ruin
    ? "#827b6c"
    : ["#b29c83", "#a6b3ab", "#758981", "#aaa28e"][v % 4];
  if (!ruin) b.box(v % 2 ? "stone" : "brick", c, x, h / 2, z, w, h, d);
  else {
    for (let f = 0; f < 3; f++) {
      b.box("stone", c, x, f * 3.1 + 0.3, z, w, 0.27, d * (1 - f * 0.16));
      for (const dx of [-w / 2, w / 2])
        for (const dz of [-d / 2, d / 2])
          b.box(
            "stone",
            "#6e6d61",
            x + dx,
            f * 2.7 + 1.6,
            z + dz,
            0.42,
            3.2,
            0.42,
          );
    }
    for (let j = 0; j < 7; j++) {
      const zz = z - d / 2 + j * 1.85,
        hh = 3 + r.next() * h * 0.7;
      b.box("brick", c, x + w / 2, hh / 2, zz, 0.38, hh, 1.6);
      b.beam(
        "metal",
        "#514b40",
        [x + w / 2, hh, zz],
        [x + w / 2 + 0.25, hh + 1.1, zz + 0.25],
        0.025,
        0.02,
        5,
      );
    }
    for (let j = 0; j < 12; j++)
      rock(
        b,
        r,
        x + (r.next() - 0.5) * w,
        z + (r.next() - 0.5) * d,
        0.3 + r.next() * 0.7,
        true,
      );
  }
  b.box("stone", "#777c70", x, 0.4, z, w + 0.3, 0.8, d + 0.3);
  if (!ruin) {
    for (let floor = 0; floor < Math.floor(h / 2.8); floor++) {
      const y = 1.8 + floor * 2.8;
      for (const side of [-1, 1])
        for (let bay = 0; bay < 5; bay++) {
          const zz = z - 5.2 + bay * 2.6;
          b.box(
            "stone",
            "#c2c5b3",
            x + side * (w / 2 + 0.025),
            y,
            zz,
            0.16,
            1.9,
            1.65,
          );
          b.box(
            (bay + floor + v) % 13 === 0 ? "glow" : "glass",
            "#7596a0",
            x + side * (w / 2 + 0.12),
            y,
            zz,
            0.07,
            1.6,
            1.37,
          );
          b.box(
            "metal",
            "#424e4d",
            x + side * (w / 2 + 0.17),
            y,
            zz,
            0.05,
            1.65,
            0.055,
          );
          b.box(
            "stone",
            "#b0b8a8",
            x + side * (w / 2 + 0.22),
            y - 0.9,
            zz,
            0.35,
            0.12,
            1.85,
          );
        }
      for (let bay = 0; bay < 3; bay++) {
        b.box(
          "glass",
          "#92adb1",
          x + (bay - 1) * 2.1,
          y,
          z + d / 2 + 0.03,
          1.3,
          1.6,
          0.06,
        );
        b.box(
          "stone",
          "#c5c6b4",
          x + (bay - 1) * 2.1,
          y - 0.88,
          z + d / 2 + 0.13,
          1.6,
          0.12,
          0.24,
        );
      }
      if (floor % 2 === 0)
        b.box("stone", "#b1b8a7", x, y + 1.25, z, w + 0.25, 0.16, d + 0.25);
    }
    b.box("stone", "#c2c5b1", x, h + 0.12, z, w + 0.45, 0.3, d + 0.45);
    b.box("stone", "#555e59", x, h + 0.28, z, w - 0.4, 0.1, d - 0.4);
    for (const dx of [-w / 2, w / 2])
      b.box("stone", "#aaaF9c", x + dx, h + 0.55, z, 0.25, 0.75, d);
    b.box("metal", "#6e7d76", x + 1.3, h + 0.9, z - 2, 2.4, 1.1, 2.6);
    for (let j = 0; j < 7; j++)
      b.box(
        "metal",
        "#3a4b48",
        x + 1.3,
        h + 1.47,
        z - 3 + j * 0.3,
        2.1,
        0.045,
        0.07,
      );
    const facing = x > 0 ? -1 : 1;
    b.box(
      "metal",
      "#39544b",
      x + facing * (w / 2 + 0.45),
      3.1,
      z - 3,
      0.9,
      0.25,
      5,
    );
    b.box(
      "glass",
      "#8aaca9",
      x + facing * (w / 2 + 0.04),
      1.6,
      z - 3,
      0.08,
      2.3,
      4.6,
    );
    // Balconies and a continuous iron fire escape on the forward facade.
    for (let y = 4; y < h - 1; y += 3) {
      b.box("metal", "#475853", x - 1.7, y, z + d / 2 + 0.6, 2.2, 0.12, 1.3);
      for (const dx of [-2.7, -0.7])
        b.beam(
          "metal",
          "#475853",
          [x + dx, y, z + d / 2 + 1.2],
          [x + dx, y + 1, z + d / 2 + 1.2],
          0.035,
        );
      b.beam(
        "metal",
        "#475853",
        [x - 2.7, y + 1, z + d / 2 + 1.2],
        [x - 0.7, y + 1, z + d / 2 + 1.2],
        0.04,
      );
      for (let k = 0; k < 8; k++)
        b.box(
          "metal",
          "#475853",
          x - 1.7,
          y + 1.5 - k * 0.32,
          z + d / 2 + 0.7,
          0.75,
          0.05,
          0.05,
        );
    }
  }
}
function barn(b: Builder, r: RNG, x: number, z: number, v: number) {
  const w = 8,
    d = 11,
    h = 5;
  b.box("stone", "#8a8875", x, 0.25, z, w + 0.3, 0.5, d + 0.3);
  b.box("wood", "#98594a", x, 2.8, z, w, h, d);
  for (let dx = -3.8; dx < 4; dx += 0.4)
    b.box("wood", "#be8f70", x + dx, 2.8, z + d / 2 + 0.025, 0.04, 5, 0.035);
  roof(b, x, z, w, d, 5.3, 3.5, "#a57a60");
  b.box("wood", "#554b3e", x, 2.1, z + d / 2 + 0.05, 3.2, 3.7, 0.1);
  for (const sign of [-1, 1])
    b.box(
      "paint",
      "#ddd4af",
      x,
      2.1,
      z + d / 2 + 0.13,
      0.12,
      4.8,
      0.1,
      0,
      0,
      sign * 0.7,
    );
  b.box("paint", "#ddd4af", x, 4.1, z + d / 2 + 0.15, 3.6, 0.15, 0.15);
  const sx = x + (x > 0 ? 1 : -1) * 6;
  b.add(
    new T.CylinderGeometry(1.7, 1.7, 8, 20),
    "metal",
    "#bdc1ae",
    sx,
    4,
    z - 1,
  );
  b.add(
    new T.SphereGeometry(1.72, 20, 16),
    "metal",
    "#b4bcae",
    sx,
    8,
    z - 1,
    1,
    0.7,
    1,
  );
  for (let y = 0.7; y < 8; y += 0.42)
    b.add(
      new T.TorusGeometry(1.72, 0.028, 4, 20),
      "metal",
      "#7b8980",
      sx,
      y,
      z - 1,
      1,
      1,
      1,
      Math.PI / 2,
    );
  if (v % 2 === 0) {
    const tx = x - (x > 0 ? 1 : -1) * 7;
    for (const dx of [-0.7, 0.7])
      b.beam(
        "metal",
        "#758078",
        [tx + dx, 0, z - 3],
        [tx + dx * 0.4, 9, z - 3],
        0.06,
      );
    for (let j = 0; j < 10; j++) {
      const a = (j * Math.PI) / 5;
      b.box(
        "metal",
        "#c5c3a6",
        tx + Math.cos(a) * 1.3,
        9 + Math.sin(a) * 1.3,
        z - 3,
        0.45,
        2,
        0.08,
        0,
        0,
        a - Math.PI / 2,
      );
    }
  }
}
function grass(
  b: Builder,
  r: RNG,
  x: number,
  z: number,
  color: string,
  ash = false,
) {
  if (ash) {
    rock(b, r, x, z, 0.12 + r.next() * 0.15, true);
    return;
  }
  for (let j = 0; j < 3; j++) {
    const g = new T.PlaneGeometry(0.3, 0.4 + r.next() * 0.2);
    b.add(
      g,
      "needles",
      color,
      x + (r.next() - 0.5) * 0.5,
      0.18,
      z + (r.next() - 0.5) * 0.5,
      1,
      1,
      1,
      0,
      r.next() * 6,
      0.25 * (r.next() - 0.5),
      false,
    );
  }
}
function lamp(b: Builder, x: number, z: number) {
  b.beam("metal", "#455957", [x, 0, z], [x, 6.8, z], 0.11, 0.06, 8);
  const sign = x > 0 ? -1 : 1;
  b.beam("metal", "#455957", [x, 6.8, z], [x + sign * 1.5, 6.8, z], 0.07);
  b.box("glow", "#ebcf99", x + sign * 1.5, 6.72, z, 0.7, 0.08, 0.28);
  b.box("metal", "#51635d", x, 0.25, z, 0.35, 0.5, 0.35);
}
export function terrainHeight(x: number, route: number) {
  const edge = Math.max(0, Math.abs(x) - 55) / 25;
  return (
    -0.18 +
    Math.min(1, edge) *
      (1.6 +
        Math.sin(route * 0.016 + x * 0.05) * 1.1 +
        Math.sin(route * 0.041 - x * 0.09) * 0.6)
  );
}
export function* beginSceneryChunk(
  library: SceneryLibrary,
  seed: string,
  route: number,
  quality: string,
  review?: BiomeReview,
  assets?: Map<string, T.Group>,
) {
  const b = new Builder(library),
    high = quality === "high";
  const terrain = new T.PlaneGeometry(160, 20, 40, 10);
  terrain.rotateX(-Math.PI / 2);
  const uv = terrain.getAttribute("uv");
  const p = terrain.getAttribute("position"),
    colors = new Float32Array(p.count * 3),
    color = new T.Color(),
    a = new T.Color(),
    c = new T.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      z = p.getZ(i),
      sample = sampleBiome(seed, route - z, review);
    uv.setXY(i, x / 5, (route - z) / 5);
    p.setY(i, terrainHeight(x, route - z));
    color
      .copy(a.set(BIOMES[sample.from].ground))
      .lerp(c.set(BIOMES[sample.to].ground), sample.blend);
    const noise = 0.92 + Math.sin(x * 2.7 + (route - z) * 3.9) * 0.05;
    color.multiplyScalar(noise);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  terrain.setAttribute("color", new T.BufferAttribute(colors, 3));
  terrain.computeVertexNormals();
  const ground = new T.Mesh(terrain, library.materials.ground);
  ground.receiveShadow = true;
  b.root.add(ground);
  for (let z = -9.5; z < 10; z++) {
    const sample = sampleBiome(seed, route - z, review),
      ash =
        (sample.from === "ash" ? 1 : 0) * (1 - sample.blend) +
        (sample.to === "ash" ? 1 : 0) * sample.blend;
    const c = new T.Color("#abb0aa").lerp(new T.Color("#707770"), ash);
    b.box(
      "road",
      "#" + c.getHexString(),
      0,
      -0.1,
      z,
      10.5,
      0.2,
      1.001,
      0,
      0,
      0,
      false,
    );
  }
  for (const side of [-1, 1]) {
    const r = new RNG(`${seed}:scenery:${route}:side:${side}`);
    for (let z = -9.5; z < 10; z += 1) {
      const sample = sampleBiome(seed, route - z, review);
      const urban =
        (sample.from === "city" ? 1 : sample.from === "suburb" ? 0.55 : 0) *
          (1 - sample.blend) +
        (sample.to === "city" ? 1 : sample.to === "suburb" ? 0.55 : 0) *
          sample.blend;
      b.box(
        "paving",
        urban > 0.1 ? "#a7ae98" : "#7d8170",
        side * (5.5 + urban * 1.2),
        -0.09 + urban * 0.09,
        z,
        0.4 + urban * 2.6,
        0.18 + urban * 0.18,
        1.005,
        0,
        0,
        0,
        false,
      );
      b.box(
        "paint",
        "#ddd2a0",
        side * 4.85,
        0.008,
        z,
        0.07,
        0.012,
        1.005,
        0,
        0,
        0,
        false,
      );
    }
    const positions = [
      { x: side * (12 + r.next() * 2), z: (r.next() - 0.5) * 2 },
      { x: side * (28 + r.next() * 5), z: (r.next() - 0.5) * 3 },
      { x: side * (46 + r.next() * 6), z: 0 },
    ];
    for (const [layer, position] of positions.entries()) {
      let { x, z } = position;
      const r = new RNG(`${seed}:scenery:${route}:${side}:${layer}`);
      const sample = sampleBiome(seed, route - z, review),
        id = r.next() < sample.blend ? sample.to : sample.from,
        v = r.int(4),
        height = terrainHeight(x, route - z);
      const citySource = assets?.get(
        v % 2 === 0 ? "city-tenement" : "city-offices",
      );
      if (id === "country" && layer === 1) x = side * (20 + r.next() * 3);
      // Place each layer in a temporary batch; elevate all of its geometry together.
      const start = new Map([...b.batches].map(([k, gs]) => [k, gs.length]));
      if (id === "city") {
        if (citySource && layer < 2) {
          const model = citySource.clone(true);
          model.position.set(x, height, z);
          model.rotation.y = (side * Math.PI) / 2;
          b.root.add(model);
        } else building(b, r, x, z, v);
        if (layer === 2 && v === 1 && assets?.has("city-water-tower")) {
          const model = assets.get("city-water-tower")!.clone(true);
          model.position.set(x, height + 12 + v * 4 + 0.33, z);
          b.root.add(model);
        }
        if (layer === 0) lamp(b, side * 7.5, -6);
      } else if (id === "suburb") {
        const houseSource = assets?.get(
          v % 2 === 0 ? "suburb-house" : "suburb-cottage",
        );
        if (houseSource && layer < 2) {
          const model = houseSource.clone(true);
          model.position.set(x, height, z);
          model.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
          b.root.add(model);
        } else house(b, r, x, z, v);
        if (layer === 0) {
          fence(b, side * 7.3, 1, 11, "white");
          tree(b, r, side * 10.5, -6, 7 + r.next() * 2, "leaf", high ? 1 : 0);
          b.box("metal", "#57665c", side * 6.5, 0.9, 5, 0.5, 0.35, 0.6);
          b.beam(
            "wood",
            "#796e55",
            [side * 6.5, 0, 5],
            [side * 6.5, 0.8, 5],
            0.07,
          );
        }
      } else if (id === "country") {
        if (layer === 1 && r.next() > 0.35) {
          const barnSource = assets?.get(
            v % 2 === 0 ? "country-barn" : "country-barn-stone",
          );
          if (barnSource) {
            const model = barnSource.clone(true);
            model.position.set(x, height, z);
            model.rotation.y = (side * Math.PI) / 2;
            b.root.add(model);
          } else barn(b, r, x, z, v);
        } else if (layer === 0) {
          fence(b, side * 6.8, 0, 18, "wood");
          if (v < 2)
            for (let j = 0; j < 2 + v; j++)
              b.add(
                new T.CylinderGeometry(0.8, 0.8, 1.5, 16),
                "wood",
                "#cbb16d",
                x + r.next(),
                0.8,
                -5 + j * 3.8,
                1,
                1,
                1,
                0,
                0,
                Math.PI / 2,
              );
          else
            for (let row = 0; row < 9; row++)
              for (let plant = 0; plant < (high ? 24 : 16); plant++) {
                const xx = side * (8.5 + row * 0.75),
                  zz = -9.5 + plant * (high ? 0.8 : 1.2);
                b.add(
                  new T.PlaneGeometry(0.8, 1.1),
                  "straw",
                  "#ead398",
                  xx,
                  0.45,
                  zz,
                  1,
                  1,
                  1,
                  0,
                  row * 0.5,
                );
              }
          if (v === 1) tree(b, r, side * 17, 5, 6, "leaf", high ? 1 : 0);
        } else {
          for (let k = 0; k < (high ? 7 : 4); k++) {
            const xx = x + side * k * 0.65;
            b.box(
              "ground",
              "#ac9a58",
              xx,
              0.08,
              0,
              0.28,
              0.24,
              19.8,
              0,
              0,
              0,
              false,
            );
          }
        }
      } else if (id === "forest") {
        for (let j = 0; j < (high ? 4 : 3); j++)
          tree(
            b,
            new RNG(`${seed}:pine:${route}:${side}:${layer}:${j}`),
            side * Math.max(10.8, Math.abs(x) + (r.next() - 0.5) * 7),
            -7 + j * 4,
            10 + r.next() * 7,
            "pine",
            high ? 1 : 0,
            height,
          );
        if (layer === 0) {
          rock(b, r, side * 7.8, 4, 1.5);
          b.beam(
            "wood",
            "#70614c",
            [side * 8, 0.25, -7],
            [side * 9, 0.4, -3],
            0.36,
            0.27,
            10,
          );
        }
        if (layer === 1 && v === 0 && assets?.has("forest-lookout")) {
          const model = assets.get("forest-lookout")!.clone(true);
          model.position.set(side * 19, height, 0);
          b.root.add(model);
        }
        if (layer === 1 && v === 2 && assets?.has("forest-cabin")) {
          const model = assets.get("forest-cabin")!.clone(true);
          model.position.set(side * 20, height, z);
          model.rotation.y = (side * Math.PI) / 2;
          b.root.add(model);
        }
      } else {
        if (layer === 1 || v === 0) {
          const ruinSource = assets?.get(
            v % 2 === 0 ? "ash-ruin" : "ash-ruin-arcade",
          );
          if (ruinSource) {
            const model = ruinSource.clone(true);
            model.position.set(x, height - 0.18, z);
            model.rotation.y = (v * Math.PI) / 2;
            b.root.add(model);
          } else building(b, r, x, z, v, true);
        } else {
          tree(b, r, x, -4, 7 + r.next() * 4, "burnt", 1);
          for (let j = 0; j < 5; j++)
            rock(
              b,
              r,
              x + (r.next() - 0.5) * 6,
              (r.next() - 0.5) * 14,
              0.4 + r.next() * 1.1,
              true,
            );
        }
        if (layer === 0) {
          if (v === 2 && assets?.has("ash-pylon")) {
            const model = assets.get("ash-pylon")!.clone(true);
            model.position.set(side * 16, height, 0);
            b.root.add(model);
          }
          b.box(
            "metal",
            "#5f5143",
            side * 7.3,
            0.25,
            2,
            0.7,
            0.4,
            4,
            0,
            0,
            side * 0.1,
          );
          for (let j = 0; j < 5; j++)
            b.box(
              "glow",
              "#d28b51",
              side * (8 + r.next() * 3),
              0.04,
              (r.next() - 0.5) * 16,
              0.06,
              0.025,
              0.15,
              0,
              0,
              0,
              false,
            );
        }
      }
      for (const [k, gs] of b.batches)
        for (let i = start.get(k) ?? 0; i < gs.length; i++)
          gs[i].translate(0, height, 0);
      // Authored hero assets replace selected foreground procedural structures.
      if (layer === 0 && assets) {
        const heroIds: Record<BiomeId, string[]> = {
          city: ["city-kiosk", "city-water-tower"],
          suburb: ["suburb-car"],
          country: ["country-tractor"],
          forest: ["forest-rock", "forest-stump"],
          ash: ["ash-wreck"],
        };
        let idAsset =
          heroIds[id][
            Math.abs(Math.floor(route / 20) + (side + 1)) % heroIds[id].length
          ];
        if (idAsset === "city-water-tower" && citySource)
          idAsset = "city-kiosk";
        const source = assets.get(idAsset);
        if (source && new RNG(`${seed}:hero:${route}:${side}`).next() > 0.65) {
          const obj = source.clone(true);
          obj.position.set(
            idAsset === "city-water-tower"
              ? x
              : side * (id === "city" ? 6.8 : 8.8),
            idAsset === "city-water-tower"
              ? 12 + (v % 4) * 4 + 0.47
              : id === "city"
                ? 0.18
                : idAsset === "forest-rock"
                  ? -0.65
                  : -0.18,
            -3,
          );
          obj.rotation.y =
            id === "city" ? side * 0.28 : Math.PI / 2 + side * 0.08;
          obj.traverse((o) => {
            if (o instanceof T.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          b.root.add(obj);
        }
      }
      yield;
    }
    for (let j = 0; j < (high ? 35 : 16); j++) {
      const x = side * (5.9 + r.next() * 13),
        z = -9.7 + r.next() * 19.4,
        sample = sampleBiome(seed, route - z, review),
        id = r.next() < sample.blend ? sample.to : sample.from;
      if (id !== "city") grass(b, r, x, z, BIOMES[id].plants, id === "ash");
    }
  }
  for (const x of [-1.5, 1.5])
    for (const z of [-7.5, -2.5, 2.5, 7.5])
      b.box("paint", "#d4d7c1", x, 0.009, z, 0.065, 0.014, 2.3, 0, 0, 0, false);
  const root = b.finish();
  root.name = `biome-section-${route}`;
  // One draw per shared asset primitive in a section; transforms remain local to
  // the section so recycling moves models and their ground in a single operation.
  root.updateMatrixWorld(true);
  const instances = new Map<string, T.Mesh[]>();
  root.traverse((o) => {
    if (o instanceof T.Mesh && o.userData.sharedAsset) {
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      const key = o.geometry.uuid + materials.map((m) => m.uuid).join(":");
      const meshes = instances.get(key) ?? [];
      meshes.push(o);
      instances.set(key, meshes);
    }
  });
  for (const meshes of instances.values()) {
    const first = meshes[0],
      mesh = new T.InstancedMesh(first.geometry, first.material, meshes.length);
    mesh.userData.sharedAsset = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    meshes.forEach((source, i) => {
      mesh.setMatrixAt(i, source.matrixWorld);
      source.removeFromParent();
    });
    mesh.computeBoundingSphere();
    root.add(mesh);
  }
  return {
    root,
    dispose() {
      root.traverse((o) => {
        if (o instanceof T.InstancedMesh) o.dispose();
        if (o instanceof T.Mesh && !o.userData.sharedAsset)
          o.geometry.dispose();
      });
    },
  };
}

export function createSceneryChunk(
  ...args: Parameters<typeof beginSceneryChunk>
) {
  const task = beginSceneryChunk(...args);
  let step = task.next();
  while (!step.done) step = task.next();
  return step.value;
}

export type BuildingKind = "city" | "house" | "barn" | "ruin";
/** Deterministic isolated fixture for the building audit and browser review. */
export function createBuildingFixture(
  library: SceneryLibrary,
  kind: BuildingKind,
  variant: number,
  seed = "BIOME-A",
) {
  if (!Number.isInteger(variant) || variant < 0 || variant > 3)
    throw new RangeError("Building variant must be 0–3");
  const b = new Builder(library, true);
  const r = new RNG(`${seed}:building:${kind}:${variant}`);
  if (kind === "house") house(b, r, 0, 0, variant);
  else if (kind === "barn") barn(b, r, 0, 0, variant);
  else building(b, r, 0, 0, variant, kind === "ruin");
  const root = b.finish();
  root.name = `building-fixture-${kind}-${variant}`;
  return root;
}
