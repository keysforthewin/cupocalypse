import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  utimesSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { assetManifest, ASSET_MANIFEST } from "../server/assetManifest";
import { staticHandler, IMMUTABLE_CACHE } from "../server/static";
import { versionAssetUrl } from "../src/game/paths";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cupocalypse-cache-"));
  mkdirSync(join(root, "assets"));
  writeFileSync(join(root, "assets/model.glb"), "model-a");
  writeFileSync(join(root, "assets/sound.ogg"), "sound-a");
  return root;
}

test("content versions survive rebuilds, change only with file contents, and support a global reset", () => {
  const root = fixture();
  try {
    const first = assetManifest(root);
    utimesSync(join(root, "assets/model.glb"), new Date(0), new Date(0));
    assert.deepEqual(assetManifest(root), first);
    writeFileSync(join(root, "assets/model.glb"), "model-b");
    const next = assetManifest(root);
    assert.notEqual(
      next.versions["/assets/model.glb"],
      first.versions["/assets/model.glb"],
    );
    assert.equal(
      next.versions["/assets/sound.ogg"],
      first.versions["/assets/sound.ogg"],
    );
    const reset = assetManifest(root, "2");
    for (const path of Object.keys(next.versions))
      assert.notEqual(reset.versions[path], next.versions[path]);
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("asset URLs replace legacy versions while preserving other parameters and fragments", () => {
  const versions = { "/assets/model.glb": "new-hash" };
  assert.equal(
    versionAssetUrl("/assets/model.glb?v=quality2&detail=low#mesh", versions),
    "/assets/model.glb?v=new-hash&detail=low#mesh",
  );
  assert.equal(
    versionAssetUrl("/assets/model.glb", versions),
    "/assets/model.glb?v=new-hash",
  );
  for (const url of [
    "/api/leaderboards?mode=Classic",
    "https://other.example/assets/model.glb",
    "//other.example/assets/model.glb",
  ])
    assert.equal(versionAssetUrl(url, versions), url);
});

test("static HTTP caches versioned assets for a year, revalidates entrypoints, and safely handles old URLs", async () => {
  const root = fixture();
  const manifest = assetManifest(root);
  writeFileSync(join(root, ASSET_MANIFEST), JSON.stringify(manifest));
  writeFileSync(join(root, "index.html"), "<html>game</html>");
  writeFileSync(join(root, "assets/index-aBcd1234.js"), "console.log('game')");
  const handler = staticHandler(root);
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    for (const [path, hash] of Object.entries(manifest.versions)) {
      const url = `${base}${path}?v=${hash}`;
      const first = await fetch(url);
      assert.equal(first.status, 200);
      assert.equal(first.headers.get("cache-control"), IMMUTABLE_CACHE);
      const body = await first.text();
      const etag = first.headers.get("etag")!;
      const cached = await fetch(url, {
        headers: { "If-None-Match": `"other", W/${etag}` },
      });
      assert.equal(cached.status, 304);
      assert.equal(cached.headers.get("cache-control"), IMMUTABLE_CACHE);
      assert.equal(await cached.text(), "");
      const head = await fetch(url, { method: "HEAD" });
      assert.equal(head.headers.get("content-length"), String(body.length));
      assert.equal(await head.text(), "");
      const unversioned = await fetch(`${base}${path}`);
      assert.equal(unversioned.headers.get("cache-control"), "no-cache");
      const old = await fetch(`${base}${path}?v=old`, { redirect: "manual" });
      assert.equal(old.status, 307);
      assert.equal(old.headers.get("cache-control"), "no-store");
      assert.equal(old.headers.get("location"), `?v=${hash}`);
      assert.equal((await fetch(`${base}${path}?v=old`)).url, url);
    }
    const html = await fetch(base);
    assert.equal(html.headers.get("cache-control"), "no-cache");
    const etag = html.headers.get("etag")!;
    assert.equal(
      (await fetch(base, { headers: { "If-None-Match": etag } })).status,
      304,
    );
    writeFileSync(join(root, "index.html"), "<html>new release</html>");
    assert.equal(
      (await fetch(base, { headers: { "If-None-Match": etag } })).status,
      200,
    );
    assert.equal(
      (await fetch(`${base}/assets/index-aBcd1234.js`)).headers.get(
        "cache-control",
      ),
      IMMUTABLE_CACHE,
    );
    for (const url of ["/missing.glb?v=anything", "/%00", "/assets/"]) {
      const response = await fetch(base + url);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
    }
    assert.equal((await fetch(base, { method: "POST" })).status, 405);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(root, { recursive: true });
  }
});
