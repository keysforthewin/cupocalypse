/// <reference types="vite/client" />

declare const __PUBLIC_ASSET_VERSIONS__: Record<string, string>;

declare module "virtual:asset-sizes" {
  /** Byte size of each file under public/assets, keyed by its root-relative URL path. */
  const sizes: Record<string, number>;
  export default sizes;
}
