import { useState } from "react";
import type { Simulation } from "../game/simulation";

export function ShieldHud({ sim }: { sim: Simulation }) {
  const amount =
    Math.max(0, sim.shield) +
    sim.supers.casts.reduce(
      (total, cast) =>
        total + (cast.end > sim.tick ? Math.max(0, cast.shield) : 0),
      0,
    );
  // Shields stack without a fixed cap. Keep the scale stable as damage drains
  // them, then reset it when protection is depleted or a new run starts.
  const [scale, setScale] = useState({ sim, peak: amount });
  const peak =
    scale.sim !== sim || amount === 0 ? amount : Math.max(scale.peak, amount);
  if (scale.sim !== sim || scale.peak !== peak) setScale({ sim, peak });
  if (amount <= 0) return null;
  return (
    <section className="shield-hud" aria-label="Shield protection">
      <div className="hud-stat">
        <span>SHIELD</span>
        <b>{Math.ceil(amount)}</b>
      </div>
      <div
        className="shield-meter"
        role="progressbar"
        aria-label="Shield remaining"
        aria-valuemin={0}
        aria-valuemax={Math.ceil(peak)}
        aria-valuenow={Math.ceil(amount)}
        aria-valuetext={`${Math.ceil(amount)} shield remaining`}
      >
        <div
          className="shield-fill"
          style={{ transform: `scaleX(${amount / peak})` }}
        />
      </div>
    </section>
  );
}
