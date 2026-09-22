import {
  useState,
  useId,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { SUPER_IDS, SUPERS, type SuperId } from "../game/superWeapons";
import {
  purchaseSuper,
  setSuperLoadout,
  type Profile,
} from "../game/persistence";
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
    slot = system.slot,
    def = slot ? SUPERS[slot.id] : undefined;
  const fraction = slot ? slot.charge / slot.quota : 0,
    ready = fraction >= 1;
  const active = slot ? system.active(slot.id) : undefined;
  const recent = system.events.filter(
    (e) => e.id === slot?.id && e.kind === "charge" && sim.tick - e.tick < 25,
  );
  const fire = system.events
    .filter(
      (e) => e.id === slot?.id && e.kind === "fire" && sim.tick - e.tick < 42,
    )
    .at(-1);
  return (
    <section
      className={`super-hud ${paused ? "frozen" : ""} ${ready ? "is-ready" : ""} ${fire ? "is-discharging" : ""}`}
      aria-label="Super weapon loadout"
      data-stage={Math.floor(fraction * 4)}
      style={
        {
          "--super-color": def?.color || "#71847b",
          "--super-accent": def?.accent || "#bbc6bc",
        } as CSSProperties
      }
    >
      <div className="super-slots">
        <span className="super-key-side">
          <kbd>Q</kbd>
          <small>PREVIOUS</small>
        </span>
        {Array.from({ length: 3 }, (_, i) => {
          const s = system.slots[i],
            d = s ? SUPERS[s.id] : undefined,
            a = s ? system.active(s.id) : undefined;
          return (
            <div
              key={i}
              className={`super-slot ${i === system.selected && s ? "selected" : ""} ${s && s.charge >= s.quota ? "ready" : ""}`}
              style={{ "--slot-color": d?.color } as CSSProperties}
              aria-label={
                d
                  ? `${d.name}, ${s.charge} of ${s.quota}${i === system.selected ? ", selected" : ""}`
                  : `Slot ${i + 1} empty`
              }
            >
              <span className="slot-number">0{i + 1}</span>
              {s ? (
                <SuperGlyph id={s.id} />
              ) : (
                <span className="empty-slot">+</span>
              )}
              <div>
                <strong>{d?.name || "EMPTY SLOT"}</strong>
                <small>
                  {a
                    ? `ACTIVE · ${Math.max(0, (a.end - sim.tick) / 60).toFixed(1)}s`
                    : s
                      ? s.charge >= s.quota
                        ? "READY"
                        : `${Math.floor((s.charge / s.quota) * 100)}%${i !== system.selected ? " · STORED" : ""}`
                      : "EQUIP AT BASE"}
                </small>
              </div>
              {s && (
                <i
                  className="slot-charge"
                  style={{ transform: `scaleX(${s.charge / s.quota})` }}
                />
              )}
            </div>
          );
        })}
        <span className="super-key-side">
          <kbd>E</kbd>
          <small>NEXT</small>
        </span>
      </div>
      {slot && def ? (
        <>
          <div className="reactor-heading">
            <span>{def.title.toUpperCase()}</span>
            <span className="charge-numbers">
              <b>
                {Math.floor(fraction * 100)}
                <small>%</small>
              </b>
              <span>
                {slot.charge} / {slot.quota} KILLS
              </span>
            </span>
          </div>
          <div
            className={`reactor-shell ${recent.length ? "receiving" : ""}`}
            role="progressbar"
            aria-label={`${def.name} charge`}
            aria-valuemin={0}
            aria-valuemax={slot.quota}
            aria-valuenow={slot.charge}
          >
            <div
              className={`reactor-fluid texture-${slot.id}`}
              style={{ width: `${fraction * 100}%` }}
            >
              <div className="reactor-stream" />
              <div className="reactor-front" />
            </div>
            <div className="reactor-segments">
              {Array.from({ length: 20 }, (_, i) => (
                <i key={i} />
              ))}
            </div>
            <div className="reactor-emboss">
              <SuperGlyph id={slot.id} />
            </div>
            {recent.length > 0 && (
              <span
                key={recent.at(-1)!.serial}
                className="charge-impact"
                style={{ left: `${Math.max(5, fraction * 100)}%` }}
              >
                +{recent.length}
              </span>
            )}
          </div>
          <div className="reactor-footer">
            <span>
              {active
                ? `POWER ACTIVE · ${((active.end - sim.tick) / 60).toFixed(1)}s`
                : ready
                  ? "REACTOR AT CAPACITY"
                  : fraction >= 0.9
                    ? "CRITICAL CHARGE"
                    : fraction >= 0.75
                      ? "POWER SURGING"
                      : fraction >= 0.5
                        ? "PRESSURE RISING"
                        : fraction >= 0.25
                          ? "REACTOR ENGAGED"
                          : "KILLS CHARGE THIS WEAPON"}
            </span>
            <strong>
              <kbd>SPACE</kbd>{" "}
              {active ? "ACTIVE" : ready ? "UNLEASH" : "CHARGING"}
            </strong>
          </div>
          {fire && (
            <div className="super-release" key={fire.serial}>
              {def.name}
              <small>{def.title}</small>
            </div>
          )}
        </>
      ) : (
        <div className="reactor-empty">
          NO SUPER WEAPON EQUIPPED{" "}
          <span>Build your loadout in the Armory.</span>
        </div>
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
            Kills charge only the selected weapon. Switch to combine ready
            powers.
          </p>
        </div>
      )}
    </aside>
  );
}
export function SuperArmory({
  profile,
  setProfile,
  editable,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  editable: boolean;
}) {
  const [inspect, setInspect] = useState<SuperId>("mortal"),
    [slot, setSlot] = useState(0),
    [filter, setFilter] = useState("all");
  const d = SUPERS[inspect],
    owned = profile.ownedSuperWeapons.includes(inspect),
    equipped = profile.superLoadout.includes(inspect);
  const update = (ids: SuperId[]) => {
    if (editable) setProfile((p) => setSuperLoadout(p, ids));
  };
  const equip = () => {
    if (!editable || !owned || equipped) return;
    const ids = [...profile.superLoadout];
    ids[Math.min(slot, ids.length)] = inspect;
    update(ids);
  };
  return (
    <div className="super-armory">
      <div className="loadout-editor">
        <div>
          <span className="eyebrow">DEPLOYMENT LOADOUT</span>
          <p>Three slots. One selected reactor. Endless combinations.</p>
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
                      disabled={!editable || i === 0}
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
                      disabled={!editable}
                      onClick={() =>
                        update(profile.superLoadout.filter((_, n) => n !== i))
                      }
                      aria-label={`Unequip ${SUPERS[id].name}`}
                    >
                      REMOVE
                    </button>
                    <button
                      disabled={
                        !editable || i === profile.superLoadout.length - 1
                      }
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
      {!editable && (
        <p className="loadout-lock">
          LOADOUT LOCKED · Return to the main menu to purchase or change super
          weapons.
        </p>
      )}
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
              <option value="300">300 CR</option>
              <option value="600">600 CR</option>
              <option value="900">900 CR</option>
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
              disabled={!editable || profile.currency < d.price}
              onClick={() => setProfile((p) => purchaseSuper(p, inspect))}
            >
              UNLOCK · {d.price} CR <span>→</span>
            </button>
          ) : (
            <button
              className="super-buy"
              disabled={!editable || equipped}
              onClick={equip}
            >
              {equipped
                ? `EQUIPPED · SLOT ${profile.superLoadout.indexOf(inspect) + 1}`
                : `EQUIP IN SLOT ${Math.min(slot, profile.superLoadout.length) + 1}`}
              <span>→</span>
            </button>
          )}
          <small className="super-fine">
            Permanent unlock. Select with Q / E. Unleash with Space. Kills fill
            only the selected meter.
          </small>
        </article>
      </div>
    </div>
  );
}
