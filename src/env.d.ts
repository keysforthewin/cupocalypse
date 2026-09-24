/// <reference types="vite/client" />

declare module "virtual:asset-sizes" {
  /** Byte size of each file under public/assets, keyed by its root-relative URL path. */
  const sizes: Record<string, number>;
  export default sizes;
}
