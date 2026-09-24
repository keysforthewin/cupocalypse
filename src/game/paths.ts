// Vite's `base` (set by deploy.sh from DEPLOY_URL) lets the game live under a
// subpath such as /cup/. Runtime asset and API URLs are written as root-relative
// strings, so they are prefixed here at the point where they are requested.
const base: string = (
  (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"
).replace(/\/$/, "");

export const publicPath = (url: string) =>
  url.startsWith("/") ? base + url : url;
