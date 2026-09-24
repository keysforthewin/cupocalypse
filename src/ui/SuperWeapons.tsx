import {
  useState,
  useId,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { SUPER_IDS, SUPERS, type SuperId } from "../game/superWeapons";
import { purchaseSuper, type Profile } from "../game/persistence";
import type { Simulation } from "../game/simulation";
import { SuperPreview } from "../render/SuperWeaponEffects";
import { SUPER_GLYPHS } from "./superGlyphs";
import { audio } from "../game/audio";

export function SuperGlyph({ id }: { id: SuperId }) {
  const uid = useId().replace(/:/g, ""),
    d = SUPERS[id],
    art = SUPER_GLYPHS[id];
  return (
    <svg viewBox="-2 -2 28 28" aria-hidden="true" className="super-glyph">
      <defs>
        <linearGradient id={uid} x1="0" y1="0" x2="0.7" y2="1">
          <stop stopColor={d.accent} />
          <stop offset="0.48" stopColor={d.color} />
          <stop offset="1" stopColor={d.color} stopOpacity="0.68" />
        </linearGradient>
      </defs>
      <path
        d={art.body}
        transform="translate(0 0.7)"
        fill="#020909"
        stroke="#020909"
        strokeWidth="1.3"
        fillRule="evenodd"
      />
      <path
        d={art.body}
        fill={`url(#${uid})`}
        fillRule="evenodd"
        stroke={d.accent}
        strokeWidth="0.35"
        strokeLinejoin="round"
      />
      {art.accent && (
        <path
          d={art.accent}
          fill={d.accent}
          stroke={d.accent}
          strokeWidth="0.2"
          strokeLinejoin="round"
        />
      )}
      <path
        d={art.detail}
        fill="none"
        stroke={
          ["pauly", "sybex", "nemesis"].includes(id) ? d.accent : "#12221f"
        }
        strokeWidth="1.15"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SuperHud({
  sim,
  paused,
}: {
  sim: Simulation;
  paused: boolean;
}) {
  const system = sim.supers,
    slot = system.slot;
  const def = slot ? SUPERS[slot.id] : undefined,
    fraction = Math.min(1, system.charge / system.quota),
    active = slot && system.active(slot.id),
    ready = !!slot && fraction >= 1 && !active,
    available = !sim.over && system.readySlots.length > 0;
  return (
    <section
      className={`super-hud ${paused ? "frozen" : ""} ${ready && !sim.over ? "is-ready" : ""}`}
      aria-label="Universal super charge"
      style={
        {
          "--super-color": def?.color ?? "#e9bf61",
          "--super-accent": def?.accent ?? "#fff0bd",
        } as CSSProperties
      }
    >
      <div
        className="reactor-shell"
        role="progressbar"
        aria-label="Shared super charge"
        aria-valuemin={0}
        aria-valuemax={system.quota}
        aria-valuenow={system.charge}
        aria-valuetext={
          fraction >= 1
            ? ready
              ? "Super ready — fire the selected weapon or switch weapons"
              : slot
                ? "Super charged — select a weapon that is not already active"
                : "Super charged — equip a weapon in the Armory"
            : `${Math.floor(fraction * 100)}% shared super charge`
        }
      >
        <div
          className="reactor-fluid"
          style={{ transform: `scaleX(${fraction})` }}
        />
      </div>
      <span className="super-weapon-name">
        SHARED SUPER · {Math.floor(fraction * 100)}%
        <br />
        {def?.name ?? "EQUIP A WEAPON IN THE ARMORY"}
      </span>
      {available && (
        <span className="super-ready-prompt" role="status">
          {ready ? (
            <>
              SUPER READY · <kbd>SPACE</kbd> TO FIRE
            </>
          ) : (
            <>
              SUPER READY · <kbd>Q</kbd> / <kbd>E</kbd> TO SELECT
            </>
          )}
        </span>
      )}
    </section>
  );
}

export function ControlsHelp({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <aside className={`controls-help ${visible ? "expanded" : ""}`}>
      <button className="help-toggle" onClick={onToggle}>
        <kbd>H</kbd> {visible ? "HIDE HELP" : "SHOW HELP"}
      </button>
      {visible && (
        <div className="help-content">
          <strong>FIELD CONTROLS</strong>
          <p>
            <span>
              <kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd>
            </span>{" "}
            Move squad
          </p>
          <p>
            <span>DRAG</span> Steer · firing is automatic
          </p>
          <p>
            <span>MOUSE</span> Aim Wisp & solar beam
          </p>
          <p>
            <span>
              <kbd>Q</kbd> <kbd>E</kbd>
            </span>{" "}
            Select super weapon
          </p>
          <p>
            <span>
              <kbd>SPACE</kbd>
            </span>{" "}
            Unleash selected super
          </p>
          <p>
            <span>
              <kbd>ESC</kbd> / <kbd>P</kbd>
            </span>{" "}
            Pause / resume
          </p>
          <p className="help-rule">
            Kills fill one shared super meter. Switch weapons freely; firing any
            weapon spends the full charge.
          </p>
        </div>
      )}
    </aside>
  );
}
export function SuperArmory({
  profile,
  setProfile,
  onLoadoutChange,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  onLoadoutChange: (ids: SuperId[]) => void;
}) {
  const [inspect, setInspect] = useState<SuperId>("mortal"),
    [slot, setSlot] = useState(0),
    [filter, setFilter] = useState("all");
  const d = SUPERS[inspect],
    owned = profile.ownedSuperWeapons.includes(inspect),
    equipped = profile.superLoadout.includes(inspect);
  const update = (ids: SuperId[]) => {
    onLoadoutChange(ids);
  };
  const equip = () => {
    if (!owned || equipped) return;
    const ids = [...profile.superLoadout];
    ids[Math.min(slot, ids.length)] = inspect;
    update(ids);
  };
  return (
    <div className="super-armory">
      <div className="loadout-editor">
        <div>
          <span className="eyebrow">SUPER WEAPON LOADOUT</span>
          <p>Three weapons. One shared charge. Choose which one to fire.</p>
        </div>
        <div className="loadout-slots">
          {Array.from({ length: 3 }, (_, i) => {
            const id = profile.superLoadout[i];
            return (
              <div
                key={i}
                className={`loadout-cell ${slot === i ? "chosen" : ""}`}
              >
                <button
                  onClick={() => {
                    setSlot(i);
                    if (id) setInspect(id);
                  }}
                  aria-label={`Select loadout slot ${i + 1}`}
                >
                  <small>0{i + 1}</small>
                  {id ? (
                    <>
                      <SuperGlyph id={id} />
                      <strong>{SUPERS[id].name}</strong>
                    </>
                  ) : (
                    <strong>+ EMPTY</strong>
                  )}
                </button>
                {id && (
                  <div className="loadout-actions">
                    <button
                      disabled={i === 0}
                      onClick={() => {
                        const a = [...profile.superLoadout];
                        [a[i - 1], a[i]] = [a[i], a[i - 1]];
                        update(a);
                      }}
                      aria-label={`Move ${SUPERS[id].name} earlier`}
                    >
                      ←
                    </button>
                    <button
                      onClick={() =>
                        update(profile.superLoadout.filter((_, n) => n !== i))
                      }
                      aria-label={`Unequip ${SUPERS[id].name}`}
                    >
                      REMOVE
                    </button>
                    <button
                      disabled={i === profile.superLoadout.length - 1}
                      onClick={() => {
                        const a = [...profile.superLoadout];
                        [a[i], a[i + 1]] = [a[i + 1], a[i]];
                        update(a);
                      }}
                      aria-label={`Move ${SUPERS[id].name} later`}
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="loadout-note">
        Change weapons anytime. Your shared charge carries across every weapon,
        including newly equipped ones. Active powers finish normally.
      </p>
      <div className="super-collection-layout">
        <div className="super-collection">
          <div className="collection-filter">
            <span>{profile.ownedSuperWeapons.length} / 27 OWNED</span>
            <select
              aria-label="Filter super weapons"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All weapons</option>
              <option value="owned">Owned</option>
              <option value="50">50 CR</option>
              <option value="500">500 CR</option>
              <option value="1000">1000 CR</option>
            </select>
          </div>
          <div className="super-card-grid">
            {SUPER_IDS.filter(
              (id) =>
                filter === "all" ||
                (filter === "owned"
                  ? profile.ownedSuperWeapons.includes(id)
                  : SUPERS[id].price === Number(filter)),
            ).map((id) => {
              const def = SUPERS[id],
                own = profile.ownedSuperWeapons.includes(id),
                eq = profile.superLoadout.includes(id);
              return (
                <button
                  key={id}
                  className={`super-card ${inspect === id ? "inspected" : ""}`}
                  style={{ "--card-color": def.color } as CSSProperties}
                  onClick={() => setInspect(id)}
                >
                  <SuperGlyph id={id} />
                  <span>
                    <strong>{def.name}</strong>
                    <small>{def.role}</small>
                  </span>
                  <em>{eq ? "EQUIPPED" : own ? "OWNED" : `${def.price} CR`}</em>
                </button>
              );
            })}
          </div>
        </div>
        <article
          className="super-detail"
          style={
            {
              "--super-color": d.color,
              "--super-accent": d.accent,
            } as CSSProperties
          }
        >
          <div className="super-preview">
            <SuperPreview id={inspect} />
            <span className="preview-label">
              REACTOR SIGNATURE /{" "}
              {String(SUPER_IDS.indexOf(inspect) + 1).padStart(2, "0")}
            </span>
          </div>
          <span className="eyebrow">
            {d.role} · {d.duration}s
          </span>
          <h3>{d.name}</h3>
          <h4>{d.title}</h4>
          <p>{d.description}</p>
          <p className="boss-adaptation">
            <b>BOSS RESPONSE</b>
            {d.boss}
          </p>
          <button
            className="sound-preview"
            disabled={profile.muted}
            onClick={() => void audio.previewSuper(inspect)}
          >
            ♫ AUDITION SIGNATURE{profile.muted ? " · MUTED" : ""}
          </button>
          {!owned ? (
            <button
              className="super-buy"
              disabled={profile.currency < d.price}
              onClick={() => setProfile((p) => purchaseSuper(p, inspect))}
            >
              UNLOCK · {d.price} CR <span>→</span>
            </button>
          ) : (
            <button className="super-buy" disabled={equipped} onClick={equip}>
              {equipped
                ? `EQUIPPED · SLOT ${profile.superLoadout.indexOf(inspect) + 1}`
                : `EQUIP IN SLOT ${Math.min(slot, profile.superLoadout.length) + 1}`}
              <span>→</span>
            </button>
          )}
          <small className="super-fine">
            Permanent unlock. Select with Q / E. Unleash with Space. All weapons
            use the same super meter.
          </small>
        </article>
      </div>
    </div>
  );
}
