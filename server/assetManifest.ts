import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const ASSET_MANIFEST = "asset-manifest.json";
export interface AssetManifest {
  cacheVersion: string;
  versions: Record<string, string>;
  sizes: Record<string, number>;
}

/** Content versions survive rebuilds, rsync and container file timestamps. */
export function assetManifest(root: string, cacheVersion = "1"): AssetManifest {
  const versions: Record<string, string> = {};
  const sizes: Record<string, number> = {};
  const walk = (directory: string) => {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name);
      const info = statSync(file);
      if (info.isDirectory()) walk(file);
      else if (info.isFile()) {
        const url = "/" + relative(root, file).split(sep).join("/");
        versions[url] = createHash("sha256")
          .update(cacheVersion)
          .update("\0")
          .update(readFileSync(file))
          .digest("hex")
          .slice(0, 20);
        sizes[url] = info.size;
      }
    }
  };
  walk(root);
  return { cacheVersion, versions, sizes };
}
