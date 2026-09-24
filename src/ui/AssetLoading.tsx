import { useState } from "react";
import { loadingState, useLoadingState } from "../render/assetLibrary";

const mb = (bytes: number) => (bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0);

/**
 * Download and GPU-preparation progress. On the menu it is a quiet status
 * line while assets stream in; on the deployment screen it is the loading bar.
 */
export function AssetLoading({ variant }: { variant: "menu" | "deploy" }) {
  const s = useLoadingState();
  // Usually the menu has finished the downloads, and the bar covers only the
  // GPU preparation. Deploying mid-download gives downloads the first 75%.
  const [downloadShare] = useState(() => (loadingState().complete ? 0 : 0.75));
  const download = s.total ? s.loaded / s.total : 0;
  const warm = s.warm.active ? s.warm.fraction : 0;
  const fraction =
    variant === "menu"
      ? download
      : s.complete
        ? downloadShare + (1 - downloadShare) * warm
        : downloadShare * download;
  const percent = Math.floor(fraction * 100);
  if (variant === "menu" && s.complete)
    return (
      <p className="asset-loading asset-loading-menu is-ready" role="status">
        ASSETS READY
        {s.failed > 0 && ` · ${s.failed} UNAVAILABLE`}
      </p>
    );
  const detail = !s.files
    ? "Starting"
    : !s.complete
      ? `Downloading · ${mb(s.loaded)} / ${mb(s.total)} MB · ${s.filesDone} of ${s.files} files`
      : s.warm.active
        ? `Preparing graphics · ${s.warm.label}`
        : "Preparing graphics";
  const bar = (
    <div
      className="asset-bar"
      role="progressbar"
      aria-label={variant === "menu" ? "Preloading assets" : "Deploying"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <i style={{ transform: `scaleX(${fraction})` }} />
    </div>
  );
  if (variant === "menu")
    return (
      <div className="asset-loading asset-loading-menu">
        {bar}
        <p>
          <span>
            PRELOADING ASSETS
            {s.total > 0 && ` · ${mb(s.loaded)} / ${mb(s.total)} MB`}
          </span>
          <b>{percent}%</b>
        </p>
      </div>
    );
  return (
    <div className="asset-loading asset-loading-deploy">
      {bar}
      <p>
        <span>{detail}</span>
        <b>{percent}%</b>
      </p>
      {s.failed > 0 && (
        <small>
          {s.failed} file{s.failed === 1 ? "" : "s"} unavailable; continuing
          without {s.failed === 1 ? "it" : "them"}
        </small>
      )}
    </div>
  );
}
