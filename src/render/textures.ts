import * as T from "three";
const cache = new Map<string, T.CanvasTexture>();
export function weatheredTexture(
  kind: "concrete" | "fabric" | "metal" | "ground",
) {
  if (cache.has(kind)) return cache.get(kind)!;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = 31;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  ctx.fillStyle = "#b9bdb4";
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16000; i++) {
    const v = 110 + Math.floor(random() * 110);
    ctx.fillStyle = `rgba(${v},${v},${v - 8},${random() * 0.5})`;
    ctx.fillRect(
      random() * 256,
      random() * 256,
      random() * 3 + 0.5,
      random() * 3 + 0.5,
    );
  }
  if (kind === "fabric") {
    for (let i = 0; i < 256; i += 3) {
      ctx.strokeStyle = i % 2 ? "#333a3322" : "#dae1ca33";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 256);
      ctx.moveTo(0, i);
      ctx.lineTo(256, i);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 45; i++) {
      const x = random() * 256,
        y = random() * 256,
        w = random() * 4 + 1,
        h = random() * 90;
      const grad = ctx.createLinearGradient(x, y, x, y + h);
      grad.addColorStop(0, "#222a2644");
      grad.addColorStop(1, "#333a3300");
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, w, h);
    }
    for (let i = 0; i < 7; i++) {
      let x = random() * 256,
        y = random() * 256;
      ctx.strokeStyle = "#27342f88";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += random() * 25 - 8;
        y += random() * 15;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(kind, texture);
  return texture;
}

export function streetTexture(kind: "asphalt" | "brick" | "paving" | "glass") {
  if (cache.has(kind)) return cache.get(kind)!;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1024;
  const c = canvas.getContext("2d")!;
  let seed = 419;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  c.fillStyle =
    kind === "asphalt"
      ? "#737b7d"
      : kind === "brick"
        ? "#57504a"
        : kind === "glass"
          ? "#3c5965"
          : "#a5aaa5";
  c.fillRect(0, 0, 1024, 1024);
  if (kind === "brick" || kind === "paving") {
    const h = kind === "brick" ? 48 : 128,
      w = kind === "brick" ? 128 : 256;
    for (let y = 0; y < 1024; y += h)
      for (let x = -w; x < 1024; x += w) {
        const v = Math.floor(115 + rand() * 55);
        c.fillStyle =
          kind === "brick"
            ? `rgb(${v},${v * 0.85},${v * 0.74})`
            : `rgb(${v + 20},${v + 24},${v + 20})`;
        c.fillRect(x + (((y / h) % 2) * w) / 2 + 2, y + 2, w - 4, h - 4);
        c.fillStyle = "#ffffff16";
        c.fillRect(x + (((y / h) % 2) * w) / 2 + 3, y + 3, w - 6, 2);
      }
  }
  for (let i = 0; i < 180000; i++) {
    const v = Math.floor(75 + rand() * 160);
    c.fillStyle = `rgba(${v},${v},${v},${rand() * 0.25})`;
    c.fillRect(
      rand() * 1024,
      rand() * 1024,
      rand() * 1.7 + 0.5,
      rand() * 1.7 + 0.5,
    );
  }
  if (kind === "asphalt") {
    // Subtle longitudinal wheel polish; all wear travels with the road mesh.
    for (const x of [210, 360, 660, 810]) {
      const gradient = c.createLinearGradient(x - 35, 0, x + 35, 0);
      gradient.addColorStop(0, "#18252600");
      gradient.addColorStop(0.5, "#18252623");
      gradient.addColorStop(1, "#18252600");
      c.fillStyle = gradient;
      c.fillRect(x - 35, 0, 70, 1024);
    }
    for (let i = 0; i < 18; i++) {
      let x = rand() * 1024,
        y = rand() * 1024;
      c.beginPath();
      c.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += rand() * 28 - 14;
        y += rand() * 18;
        c.lineTo(x, y);
      }
      c.strokeStyle = "#29333566";
      c.lineWidth = 1.4;
      c.stroke();
    }
    // Tar-sealed repair, softly mottled rather than a floating decal.
    c.fillStyle = "#424c4d44";
    c.fillRect(70, 630, 95, 180);
    c.strokeStyle = "#303b3b77";
    c.lineWidth = 2;
    c.strokeRect(70, 630, 95, 180);
  }
  if (kind === "glass") {
    const g = c.createLinearGradient(0, 0, 1024, 1024);
    g.addColorStop(0, "#c1d5db77");
    g.addColorStop(0.45, "#0d263111");
    g.addColorStop(0.5, "#071a2866");
    g.addColorStop(1, "#759cb044");
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 1024);
  }
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  cache.set(kind, texture);
  return texture;
}
