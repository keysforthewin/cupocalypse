import { useMemo, useLayoutEffect } from "react";
import * as T from "three";
import { weatheredTexture } from "./textures";
let stripes: T.CanvasTexture;
function hazardPaint() {
  if (stripes) return stripes;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 64;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#ccaa5c";
  c.fillRect(0, 0, 512, 64);
  c.fillStyle = "#273333";
  for (let x = -64; x < 576; x += 64) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x + 30, 0);
    c.lineTo(x - 2, 64);
    c.lineTo(x - 32, 64);
    c.fill();
  }
  for (let i = 0; i < 700; i++) {
    c.fillStyle = i % 2 ? "#b8b6a54a" : "#242b272a";
    c.fillRect((i * 73) % 512, (i * 17) % 64, 2 + (i % 5), 1);
  }
  stripes = new T.CanvasTexture(canvas);
  stripes.colorSpace = T.SRGBColorSpace;
  stripes.anisotropy = 8;
  return stripes;
}
export function Barricade({ width }: { width: number }) {
  const geometry = useMemo(() => {
    const section = new T.Shape(
      [
        [-0.42, 0.04],
        [0.42, 0.04],
        [0.42, 0.2],
        [0.2, 0.48],
        [0.2, 0.86],
        [-0.2, 0.86],
        [-0.2, 0.48],
        [-0.42, 0.2],
      ].map(([x, y]) => new T.Vector2(x, y)),
    );
    const g = new T.ExtrudeGeometry(section, {
      depth: width,
      bevelEnabled: true,
      bevelSize: 0.035,
      bevelThickness: 0.025,
      bevelSegments: 1,
      steps: 1,
    });
    g.translate(0, 0, -width / 2).rotateY(Math.PI / 2);
    return g;
  }, [width]);
  useLayoutEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[0, 0, 1.7]}>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color="#999c89"
          map={weatheredTexture("concrete")}
          bumpMap={weatheredTexture("concrete")}
          bumpScale={0.025}
          roughness={0.9}
        />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[0, 0.64, side * 0.241]}
            rotation={[0, side === -1 ? Math.PI : 0, 0]}
          >
            <planeGeometry args={[width - 0.16, 0.27]} />
            <meshStandardMaterial map={hazardPaint()} roughness={0.85} />
          </mesh>
          <mesh
            position={[side * (width / 2 - 0.3), 0.07, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[0.45, 0.14, 0.98]} />
            <meshStandardMaterial color="#36403c" roughness={0.7} />
          </mesh>
          <mesh position={[side * (width / 2 - 0.17), 0.89, 0]}>
            <boxGeometry args={[0.13, 0.055, 0.3]} />
            <meshStandardMaterial
              color="#ffc570"
              emissive="#ffa74d"
              emissiveIntensity={0.5}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}
