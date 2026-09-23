// Uses the actual game camera and materials. Diagnostic sheets retain native
// gameplay pixel size; no zoom or model scaling is used to obtain a passing view.
import fs from "node:fs";
import sharp from "sharp";
import { chromium } from "playwright";
import {
  catalog,
  buildingIds,
  buildingHash,
  hashFile,
} from "./building-quality.mjs";
import { sourceHash } from "./biome-evidence.mjs";
const output = process.env.OUTPUT || "artifacts/buildings/final";
fs.mkdirSync(`${output}/cases`, { recursive: true });
const manifest = JSON.parse(fs.readFileSync("src/render/biomeAssets.json"));
const report = {
  sourceHash: buildingHash(),
  biomeSourceHash: sourceHash(),
  assetHashes: {},
  errors: [],
  captures: [],
  camera: null,
  inspections: {},
};
for (const id of buildingIds)
  for (const quality of catalog.qualities) {
    const asset = manifest.find((a) => a.id === id);
    report.assetHashes[`${id}/${quality}`] = asset
      ? hashFile(
          "public" +
            (quality === "high" ? asset.url : asset.lowUrl).split("?")[0],
        )
      : report.sourceHash;
  }
const browser = await chromium.connectOverCDP(
  process.env.CDP || "http://192.168.8.111:9222",
);
try {
  for (const quality of catalog.qualities) {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1000 },
    });
    page.setDefaultTimeout(120000);
    page.on("pageerror", (e) => report.errors.push(e.message));
    await page.addInitScript(
      (q) =>
        localStorage.setItem(
          "gate-runner-profile",
          JSON.stringify({
            quality: q,
            muted: true,
            upgrades: [0, 0, 0],
            currency: 0,
            records: {},
            runs: 0,
          }),
        ),
      quality,
    );
    await page.goto(process.env.GAME_URL || "http://localhost:5173");
    await page.waitForFunction(() => window.__gateRunner);
    await page.evaluate(() => {
      window.__gateRunner.freeze();
      window.__gateRunner.start();
    });
    await page.waitForFunction(
      () => window.__biomeStatus && window.__sceneReview,
    );
    await page.addStyleTag({
      content:
        "body *{visibility:hidden !important} canvas{visibility:visible !important}",
    });
    report.camera = await page.evaluate(async () => {
      const T = await import("/node_modules/.vite/deps/three.js");
      const { GLTFLoader } =
        await import("/node_modules/three/examples/jsm/loaders/GLTFLoader.js");
      const { sceneryLibrary, createBuildingFixture } =
        await import("/src/render/biomeModels.ts");
      const { auditGeometry } = await import("/scripts/building-geometry.mjs");
      window.__buildingTools = {
        T,
        loader: new GLTFLoader(),
        library: sceneryLibrary(),
        createBuildingFixture,
        auditGeometry,
        cache: new Map(),
      };
      const c = window.__sceneReview.camera;
      return {
        position: c.position.toArray(),
        quaternion: c.quaternion.toArray(),
        fov: c.fov,
        aspect: c.aspect,
      };
    });
    const ids = process.env.IDS ? process.env.IDS.split(",") : buildingIds;
    const seeds = process.env.SMOKE ? catalog.seeds.slice(0, 1) : catalog.seeds;
    for (const seed of seeds)
      for (const id of ids) {
        const asset = manifest.find((a) => a.id === id);
        const url = asset
          ? quality === "high"
            ? asset.url
            : asset.lowUrl
          : null;
        const crops = [];
        let audit,
          clips = [],
          clippedOrientations = [];
        for (const angle of [0, 90, 180, 270]) {
          const result = await page.evaluate(
            async ({ id, url, angle, seed }) => {
              const {
                T,
                loader,
                library,
                createBuildingFixture,
                auditGeometry,
                cache,
              } = window.__buildingTools;
              const { scene, camera } = window.__sceneReview;
              if (window.__buildingModel) {
                scene.remove(window.__buildingModel);
                if (!url)
                  window.__buildingModel.traverse((o) => {
                    if (o.isMesh) o.geometry.dispose();
                  });
              }
              const kind = id.startsWith("procedural-")
                ? id.split("-")[1]
                : id.split("-")[0];
              const biome =
                { house: "suburb", barn: "country", ruin: "ash" }[kind] || kind;
              window.__biomeReview = { biome, seed };
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
              scene.traverse((o) => {
                if (o.isMesh || o.isPoints) o.visible = false;
              });
              let model;
              if (url) {
                if (!cache.has(url))
                  cache.set(url, (await loader.loadAsync(url)).scene);
                model = cache.get(url).clone(true);
              } else
                model = createBuildingFixture(
                  library,
                  kind,
                  Number(id.split("-").at(-1)),
                  seed,
                );
              model.traverse((o) => {
                if (o.isMesh) {
                  o.visible = true;
                  o.castShadow = true;
                  o.receiveShadow = true;
                }
              });
              model.rotation.y = (angle * Math.PI) / 180;
              model.position.set(
                id === "city-kiosk" ? 7 : 12,
                0,
                id === "city-kiosk" ? -10 : -22,
              );
              scene.add(model);
              window.__buildingModel = model;
              model.updateMatrixWorld(true);
              const total = {};
              model.traverse((o) => {
                if (o.isMesh)
                  for (const [k, v] of Object.entries(
                    auditGeometry(o.geometry, {
                      requireUV: (Array.isArray(o.material)
                        ? o.material
                        : [o.material]
                      ).some(
                        (m) =>
                          m.map ||
                          m.normalMap ||
                          m.roughnessMap ||
                          m.metalnessMap,
                      ),
                    }),
                  ))
                    total[k] = (total[k] || 0) + v;
              });
              const box = new T.Box3().setFromObject(model),
                points = [];
              for (const x of [box.min.x, box.max.x])
                for (const y of [box.min.y, box.max.y])
                  for (const z of [box.min.z, box.max.z])
                    points.push(new T.Vector3(x, y, z).project(camera));
              const canvas = document.querySelector("canvas"),
                rect = canvas.getBoundingClientRect();
              const xs = points.map(
                  (p) => rect.x + ((p.x + 1) * rect.width) / 2,
                ),
                ys = points.map((p) => rect.y + ((1 - p.y) * rect.height) / 2);
              const left = Math.max(0, Math.floor(Math.min(...xs)) - 12),
                top = Math.max(0, Math.floor(Math.min(...ys)) - 12);
              const right = Math.min(1600, Math.ceil(Math.max(...xs)) + 12),
                bottom = Math.min(1000, Math.ceil(Math.max(...ys)) + 12);
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
              return {
                audit: total,
                clip: {
                  x: left,
                  y: top,
                  width: right - left,
                  height: bottom - top,
                },
                clipped:
                  Math.min(...xs) < 0 ||
                  Math.max(...xs) > 1600 ||
                  Math.min(...ys) < 0 ||
                  Math.max(...ys) > 1000,
              };
            },
            { id, url, angle, seed },
          );
          if (result.clipped) clippedOrientations.push(angle);
          const buffer = await page.screenshot({ clip: result.clip });
          crops.push(buffer);
          audit = result.audit;
          clips.push(result.clip);
          if (seed === "BIOME-A" && quality === "high") {
            await page.evaluate(async () => {
              const { T } = window.__buildingTools;
              const { camera } = window.__sceneReview;
              window.__buildingCamera = camera.clone();
              const box = new T.Box3().setFromObject(window.__buildingModel);
              const center = box.getCenter(new T.Vector3()),
                size = box.getSize(new T.Vector3());
              const span = Math.max(size.x, size.y, size.z);
              camera.position
                .copy(center)
                .add(new T.Vector3(1, 0.85, 1.4).multiplyScalar(span * 1.3));
              camera.lookAt(center);
              camera.updateMatrixWorld(true);
              await new Promise(requestAnimationFrame);
              await new Promise(requestAnimationFrame);
            });
            fs.mkdirSync(`${output}/inspection`, { recursive: true });
            const diagnostic = `${output}/inspection/${id}-${angle}.png`;
            await page.screenshot({ path: diagnostic });
            (report.inspections[id] ??= []).push(diagnostic);
            await page.evaluate(() => {
              window.__sceneReview.camera.copy(window.__buildingCamera);
              window.__sceneReview.camera.updateMatrixWorld(true);
            });
          }
        }
        const metadata = await Promise.all(
          crops.map((c) => sharp(c).metadata()),
        );
        const width = Math.max(...metadata.map((m) => m.width)),
          height = Math.max(...metadata.map((m) => m.height));
        const file = `${output}/cases/${id}-${seed}-${quality}.png`;
        await sharp({
          create: {
            width: width * 2,
            height: height * 2,
            channels: 3,
            background: "#85989b",
          },
        })
          .composite(
            crops.map((input, i) => ({
              input,
              left: (i % 2) * width,
              top: Math.floor(i / 2) * height,
            })),
          )
          .png()
          .toFile(file);
        report.captures.push({
          id,
          seed,
          quality,
          file,
          orientations: [0, 90, 180, 270],
          clips,
          clippedOrientations,
          hash: report.assetHashes[`${id}/${quality}`],
          audit,
        });
        fs.writeFileSync(
          `${output}/report.json`,
          JSON.stringify(report, null, 2),
        );
        console.log(id, seed, quality, JSON.stringify(audit));
      }
    await page.close();
  }
} finally {
  await browser.close();
}
if (buildingHash() !== report.sourceHash)
  report.errors.push("Source changed during capture");
fs.writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2));
if (report.errors.length) process.exitCode = 1;
