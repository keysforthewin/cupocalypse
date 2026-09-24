import { bossDefinition } from "./game/bosses";
import { SuperHud, ControlsHelp, SuperArmory } from "./ui/SuperWeapons";
import { ShieldHud } from "./ui/ShieldHud";
import { Leaderboards } from "./ui/Leaderboards";
import {
  loadPlayerId,
  playerName,
  MAX_PLAYER_NAME,
  submitScore,
} from "./game/leaderboard";
import { SUPERS, validSuperReplay, type SuperId } from "./game/superWeapons";
import { iconPath } from "./game/icons";
import { ARSENAL, GUNS } from "./game/projectiles";
import { PICKUPS, weaponStats } from "./game/weapons";
import type { Boost } from "./game/types";
import { steer } from "./game/steering";
import { beforeTick, setFrameAlpha } from "./render/presentation";
import { useState, useEffect, useRef, useCallback } from "react";
import { Scene } from "./render/Scene";
import { preloadAssets } from "./render/assetLibrary";
import { AssetLoading } from "./ui/AssetLoading";
import { RenderBoundary } from "./render/RenderBoundary";
import { Simulation, VERSION, clamp } from "./game/simulation";
import {
  MODES,
  ENEMIES,
  BOSSES,
  UPGRADE_PERCENT,
  type Mode,
  type Replay,
} from "./game/types";
import {
  loadProfile,
  saveProfile,
  settle,
  earnings,
  claimEarnings,
  setSuperLoadout,
  purchase,
  PRICES,
  modeDescriptions,
} from "./game/persistence";
import { audio } from "./game/audio";
import { bot } from "./game/bot";
import "./style.css";
const preview = () => {
  const s = new Simulation("OUTBREAK-01");
  s.spawnGate();
  s.gates[0].z = 15;
  s.gates[0].left = "+";
  s.gates[0].a = 24;
  s.gates[0].right = "×";
  s.gates[0].b = 1.5;
  for (let i = 0; i < 7; i++)
    s.spawnEnemy(
      i % 3 === 0 ? "Riot Guard" : "Walker",
      ((i % 3) - 1) * 2.8,
      25 + Math.floor(i / 3) * 4,
    );
  s.army = 36;
  return s;
};
type Screen = "menu" | "playing" | "paused" | "over" | "victory";
function randomSeed(previous = "") {
  let next: string;
  do {
    next = `OP-${crypto.getRandomValues(new Uint32Array(1))[0].toString(36).toUpperCase()}`;
  } while (next === previous);
  return next;
}
export default function App() {
  const [sim, setSim] = useState(preview);
  const [profile, setProfile] = useState(loadProfile);
  const [screen, setScreen] = useState<Screen>("menu");
  const [playerId] = useState(loadPlayerId);
  const [nameDraft, setNameDraft] = useState("");
  const [scoreStatus, setScoreStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [scoreRevision, setScoreRevision] = useState(0);
  const runId = useRef(crypto.randomUUID());
  const scoreInFlight = useRef(false);
  const [ready, setReady] = useState(false);
  const sceneReady = useCallback(() => setReady(true), []);
  const [armoryTab, setArmoryTab] = useState<"upgrades" | "supers">("supers");
  const pendingSuper = useRef({ previous: false, next: false, fire: false });
  const [panel, setPanel] = useState<"none" | "armory" | "intel" | "settings">(
    "none",
  );
  const [mode, setMode] = useState<Mode>("Classic");
  const [seed, setSeed] = useState(() => profile.pinnedSeed ?? randomSeed());
  const seedPinned = profile.pinnedSeed !== null;
  const toggleSeedPin = () => {
    if (seedPinned) {
      setSeed(randomSeed(seed));
      setProfile((p) => ({ ...p, pinnedSeed: null }));
    } else if (seed.trim()) {
      const pinnedSeed = seed.trim();
      setSeed(pinnedSeed);
      setProfile((p) => ({ ...p, pinnedSeed }));
    }
  };
  const [debug, setDebug] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [fps, setFps] = useState(60);
  const [error, setError] = useState("");
  const [, draw] = useState(0);
  const keys = useRef(new Set<string>());
  const target = useRef(0);
  const aim = useRef<number | undefined>(undefined);
  const setAim = useCallback((x: number) => {
    aim.current = x;
  }, []);
  useEffect(() => {
    audio.setActive(screen === "playing" || screen === "victory");
    pendingSuper.current = { previous: false, next: false, fire: false };
    return () => audio.setActive(false);
  }, [screen]);
  useEffect(() => {
    if (screen !== "victory") return;
    const timer = window.setTimeout(() => setScreen("over"), 8000);
    return () => window.clearTimeout(timer);
  }, [screen]);
  const velocity = useRef(0);
  const drag = useRef<{ x: number; target: number } | null>(null);
  const replay = useRef<Replay | null>(null);
  const replayLoadoutIndex = useRef(0);
  const settled = useRef(false);
  const claimedCredits = useRef(0);
  const openArmory = () => {
    if (screen !== "menu" && !settled.current && !replay.current) {
      const claimed = claimedCredits.current;
      claimedCredits.current = earnings(sim);
      setProfile((p) => claimEarnings(p, sim, claimed));
    }
    keys.current.clear();
    velocity.current = 0;
    drag.current = null;
    pendingSuper.current = { previous: false, next: false, fire: false };
    if (screen === "playing") setScreen("paused");
    setPanel("armory");
  };
  const changeLoadout = (ids: SuperId[]) => {
    const next = setSuperLoadout(profile, ids);
    setProfile(next);
    if ((screen === "playing" || screen === "paused") && !replay.current)
      sim.setSuperLoadout(next.superLoadout);
  };
  const qaFrozen = useRef(false);
  const qaAutopilot = useRef(false);
  // Advances whenever the scene's React tree must reconcile: entity membership
  // changed, or a coarse 10 Hz refresh for label text and LOD state.
  const worldRevision = useRef(0);
  const worldSignature = useRef("");
  const qaStats = useRef({ simMs: 0, simTicks: 0, frames: 0, maxSimMs: 0 });
  const frameTimes = useRef<number[]>([]);
  const runRef = useRef(sim);
  runRef.current = sim;
  useEffect(() => {
    setStorageError(!saveProfile(profile));
    audio.muted = profile.muted;
  }, [profile]);
  // Stream every model and sound in while the player is on the menu, after the
  // page itself (and its key art) has finished loading.
  useEffect(() => {
    const begin = () => preloadAssets(profile.quality);
    if (document.readyState === "complete") begin();
    else {
      window.addEventListener("load", begin, { once: true });
      return () => window.removeEventListener("load", begin);
    }
  }, [profile.quality]);
  const start = useCallback(
    (record?: Replay) => {
      if (!record && !seed.trim()) return;
      if (record && (record.version !== VERSION || !validSuperReplay(record))) {
        setError("This replay uses a different balance version.");
        return;
      }
      const next = new Simulation(
        record?.seed ?? seed,
        record?.mode || mode,
        record?.upgrades || profile.upgrades,
        record?.superLoadout ?? profile.superLoadout,
      );
      next.debug = !!record || debug;
      replay.current = record || null;
      replayLoadoutIndex.current = 0;
      settled.current = false;
      claimedCredits.current = 0;
      runId.current = crypto.randomUUID();
      scoreInFlight.current = false;
      setScoreStatus("idle");
      setNameDraft("");
      target.current = 0;
      aim.current = undefined;
      velocity.current = 0;
      keys.current.clear();
      pendingSuper.current = { previous: false, next: false, fire: false };
      setReady(false);
      qaFrozen.current = false;
      setSim(next);
      setScreen("playing");
      setPanel("none");
      audio.init();
    },
    [seed, mode, profile.upgrades, profile.superLoadout, debug],
  );
  const postScore = useCallback(
    async (name: string) => {
      if (
        !playerName(name) ||
        sim.debug ||
        !sim.over ||
        scoreInFlight.current ||
        scoreStatus === "saved"
      )
        return;
      const submittedRun = runId.current;
      scoreInFlight.current = true;
      setScoreStatus("saving");
      try {
        await submitScore({
          runId: submittedRun,
          playerId,
          name: playerName(name),
          distance: Math.floor(sim.distance),
          kills: sim.kills,
          mode: sim.mode,
        });
        setScoreRevision((n) => n + 1);
        if (runId.current === submittedRun) setScoreStatus("saved");
      } catch {
        if (runId.current === submittedRun) setScoreStatus("error");
      } finally {
        if (runId.current === submittedRun) scoreInFlight.current = false;
      }
    },
    [sim, playerId, scoreStatus],
  );
  useEffect(() => {
    if (
      screen === "over" &&
      panel === "none" &&
      playerName(profile.playerName) &&
      scoreStatus === "idle"
    )
      void postScore(profile.playerName);
  }, [screen, panel, profile.playerName, scoreStatus, postScore]);
  useEffect(() => {
    let raf = 0,
      previous = performance.now(),
      accumulator = 0,
      lastDraw = 0,
      lastWorldDraw = 0,
      frames = 0,
      lastFps = previous;
    const loop = (now: number) => {
      const actualElapsed = now - previous;
      const elapsed = Math.min(actualElapsed / 1000, 0.1);
      previous = now;
      if (screen === "playing" && ready && !qaFrozen.current) {
        accumulator += elapsed;
        while (accumulator >= 1 / 60) {
          const direction =
            (keys.current.has("d") || keys.current.has("arrowright") ? 1 : 0) -
            (keys.current.has("a") || keys.current.has("arrowleft") ? 1 : 0);
          if (qaAutopilot.current) target.current = bot(sim);
          else if (!drag.current) {
            const next = steer(target.current, velocity.current, direction);
            target.current = next.target;
            velocity.current = next.velocity;
          }
          const recorded = replay.current?.inputs[sim.tick];
          const changes = replay.current?.superLoadoutChanges ?? [];
          while (changes[replayLoadoutIndex.current]?.tick === sim.tick) {
            sim.setSuperLoadout(changes[replayLoadoutIndex.current].loadout);
            replayLoadoutIndex.current++;
          }
          if (replay.current && recorded === undefined) {
            setScreen("paused");
            break;
          }
          const command = replay.current?.superInputs[sim.tick];
          const cycle =
            command !== undefined
              ? command % 3 === 1
                ? -1
                : command % 3 === 2
                  ? 1
                  : 0
              : Number(pendingSuper.current.next) -
                Number(pendingSuper.current.previous);
          const fire =
            command !== undefined ? command >= 3 : pendingSuper.current.fire;
          pendingSuper.current = { previous: false, next: false, fire: false };
          beforeTick(sim);
          const simStart = performance.now();
          sim.update({
            superCycle: cycle as -1 | 0 | 1,
            superPressed: fire,
            x: recorded ?? Math.round(target.current * 1000) / 1000,
            aim: replay.current ? replay.current.aims?.[sim.tick] : aim.current,
          });
          const simElapsed = performance.now() - simStart;
          qaStats.current.simMs += simElapsed;
          qaStats.current.simTicks++;
          if (simElapsed > qaStats.current.maxSimMs)
            qaStats.current.maxSimMs = simElapsed;
          accumulator -= 1 / 60;
          if (sim.over) {
            if (!settled.current) {
              settled.current = true;
              const claimed = claimedCredits.current;
              setProfile((p) => settle(p, sim, claimed));
            }
            setScreen(sim.outcome === "victory" ? "victory" : "over");
            break;
          }
        }
        setFrameAlpha(sim, accumulator * 60);
        audio.update(sim.shots, sim.damageEvents, sim.kills);
        audio.weapons(sim);
        audio.telegraph(sim);
        audio.supers(sim);
        audio.ambience(sim);
        qaStats.current.frames++;
        frameTimes.current.push(actualElapsed);
        if (frameTimes.current.length > 7200)
          frameTimes.current.splice(0, 3600);
      }
      if (screen !== "menu" && now - lastDraw > 50) {
        const signature = `${sim.id}:${sim.enemies.length}:${sim.gates.length}:${sim.hazards.length}:${sim.drops.length}:${sim.bossRemains.length}:${sim.bossIndex}:${sim.over}`;
        if (
          signature !== worldSignature.current ||
          now - lastWorldDraw >= 100
        ) {
          worldSignature.current = signature;
          worldRevision.current++;
          lastWorldDraw = now;
        }
        draw((n) => n + 1);
        lastDraw = now;
      }
      frames++;
      if (now - lastFps >= 1000) {
        setFps(frames);
        frames = 0;
        lastFps = now;
        // React's development build records a user-timing measure per
        // component render and the browser keeps them all; drop them so a
        // long session does not accumulate hundreds of thousands of entries.
        if (import.meta.env.DEV) {
          performance.clearMeasures();
          performance.clearMarks();
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sim, screen, ready]);
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const element = e.target instanceof HTMLElement ? e.target : null;
      if (element?.closest("input, select, textarea, [contenteditable=true]"))
        return;
      const k = e.key.toLowerCase();
      if (k === "h" && !e.repeat) {
        setProfile((p) => ({ ...p, helpVisible: !p.helpVisible }));
        return;
      }
      if (["q", "e", " "].includes(k)) {
        if (screen === "playing" && panel === "none" && !replay.current) {
          e.preventDefault();
          if (!e.repeat) {
            if (k === "q") pendingSuper.current.previous = true;
            if (k === "e") pendingSuper.current.next = true;
            if (k === " ") pendingSuper.current.fire = true;
          }
        }
        return;
      }
      if (["arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (e.repeat && ["escape", "p", "`"].includes(k)) return;
      keys.current.add(k);
      if (k === "escape" || k === "p") {
        if (panel !== "none") {
          e.preventDefault();
          setPanel("none");
          return;
        }
        setScreen((s) =>
          s === "playing" ? "paused" : s === "paused" ? "playing" : s,
        );
      }
      if (k === "`") {
        setDebug((v) => !v);
        sim.debug = true;
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const blur = () => {
      keys.current.clear();
      velocity.current = 0;
      pendingSuper.current = { previous: false, next: false, fire: false };
      drag.current = null;
      setScreen((s) => (s === "playing" ? "paused" : s));
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [sim, screen, panel]);
  useEffect(() => {
    if (!import.meta.env.DEV && !import.meta.env.VITE_PERF_HOOKS) return;
    Object.assign(window, {
      __gateRunner: {
        get audio() {
          return audio;
        },
        get sim() {
          return runRef.current;
        },
        freeze: (value = true) => {
          qaFrozen.current = value;
        },
        autopilot: (value = true) => {
          qaAutopilot.current = value;
        },
        stats: () => {
          const s = { ...qaStats.current };
          qaStats.current = { simMs: 0, simTicks: 0, frames: 0, maxSimMs: 0 };
          return s;
        },
        advance: (ticks: number) => {
          for (let i = 0; i < ticks && !runRef.current.over; i++)
            runRef.current.update({ x: bot(runRef.current) }, false);
          draw((n) => n + 1);
        },
        superScenario: (ids: SuperId[]) => {
          const s = new Simulation("SUPER-REVIEW", "Classic", [0, 0, 0], ids);
          s.debug = true;
          s.army = 80;
          s.shield = 500;
          s.nextEncounter = s.nextBoss = s.nextSupply = 1e9;
          for (let i = 0; i < 18; i++)
            s.spawnEnemy(
              i % 4 === 0 ? "Riot Guard" : "Walker",
              ((i % 3) - 1) * 3,
              14 + Math.floor(i / 3) * 4,
            );
          qaFrozen.current = true;
          settled.current = false;
          claimedCredits.current = 0;
          setReady(false);
          setSim(s);
          setScreen("playing");
          setPanel("none");
        },
        dense: () => {
          const s = new Simulation("QA-DENSE");
          s.debug = true;
          s.army = 240;
          s.shield = 300;
          s.nextEncounter = 99999;
          s.nextBoss = 99999;
          for (let i = 0; i < 35; i++)
            s.spawnEnemy(
              ENEMIES[i % 10],
              ((i % 3) - 1) * 3,
              12 + Math.floor(i / 3) * 2.8,
            );
          s.warn(0, [0, 1], "pool", 15, 1.8, 2);
          setReady(false);
          setSim(s);
          setScreen("playing");
        },
        start: (m: Mode = "Classic") => {
          const s = new Simulation("QA-SEED", m);
          s.debug = true;
          settled.current = false;
          claimedCredits.current = 0;
          setReady(false);
          setSim(s);
          setScreen("playing");
        },
        scenario: (kind: string) => {
          const s = new Simulation("QA-SCENARIO");
          s.debug = true;
          s.army = 120;
          s.nextEncounter = 99999;
          s.nextBoss = 99999;
          const isBoss = BOSSES.includes(kind as (typeof BOSSES)[number]);
          s.bossActive = isBoss;
          if (isBoss) {
            s.bossIndex = BOSSES.indexOf(kind as (typeof BOSSES)[number]);
            s.bossKills = s.bossIndex;
            s.distance = (s.bossIndex + 1) * 150;
          }
          s.spawnEnemy(kind as (typeof ENEMIES)[number], 0, 22, isBoss);
          setReady(false);
          setSim(s);
          setScreen("playing");
        },
        get frames() {
          return frameTimes.current;
        },
      },
    });
  }, []);
  const download = () => {
    const blob = new Blob([JSON.stringify(sim.replay())], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `the-last-fruit-cupocalypse-${sim.seed.replace(/[^\w-]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const boss = sim.boss;
  const weapon = weaponStats(sim.boosts);
  return (
    <main className={`app ${screen === "menu" ? "in-menu" : ""}`}>
      <div
        className="scene"
        onPointerDown={(e) => {
          if (screen !== "playing" || e.button !== 0) return;
          velocity.current = 0;
          drag.current = { x: e.clientX, target: target.current };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current)
            target.current = clamp(
              drag.current.target + (e.clientX - drag.current.x) / 65,
              -3.8,
              3.8,
            );
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
      >
        {screen !== "menu" && (
          <RenderBoundary key={profile.quality}>
            <Scene
              sim={sim}
              menu={false}
              quality={profile.quality}
              onReady={sceneReady}
              onAim={setAim}
              revision={worldRevision.current}
            />
          </RenderBoundary>
        )}
      </div>
      {screen === "menu" && (
        <div
          className="menu-art"
          role="img"
          aria-label="Five Rust-inspired guild survivors in hazmat gear and scrap armor stand together in a ruined industrial compound."
        />
      )}
      <div className="film-grain" />
      <div className="screen-shade" />
      {screen === "playing" && !ready && (
        <div className="deployment-loading" role="status">
          <span className="eyebrow">THE LAST FRUIT: CUPOCALYPSE</span>
          <h2>DEPLOYING SQUAD</h2>
          <p>Getting the guild ready for the Cupocalypse…</p>
          <AssetLoading variant="deploy" />
        </div>
      )}
      <header>
        <button
          className="brand"
          onClick={() => {
            if (screen === "playing") setScreen("paused");
            else if (screen === "menu") setPanel("none");
          }}
          aria-label="The Last Fruit: Cupocalypse home"
        >
          <span className="brand-mark" aria-hidden="true">
            TF
          </span>
          <span>
            THE LAST FRUIT<small>CUPOCALYPSE</small>
          </span>
        </button>
        <div className="header-right">
          <span className="live-indicator" />
          GUILD ONLINE <span className="header-divider" />{" "}
          <button
            onClick={() => setProfile((p) => ({ ...p, muted: !p.muted }))}
            aria-label={profile.muted ? "Unmute audio" : "Mute audio"}
          >
            {profile.muted ? "SOUND OFF" : "SOUND ON"}
          </button>
          <button
            className="settings-button"
            onClick={() => {
              if (screen === "playing") setScreen("paused");
              setPanel("settings");
            }}
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </header>
      {screen === "menu" && (
        <>
          <div className="menu-veil" />
          <section className="main-menu">
            <div className="eyebrow">
              <span /> A RUST GUILD’S LAST STAND
            </div>
            <h1 aria-label="The Last Fruit: Cupocalypse">
              <span className="title-prefix">THE LAST FRUIT:</span>
              <em>CUPOCALYPSE</em>
            </h1>
            <p className="intro">
              The world’s wiped. The guild hasn’t.
              <br />
              Gear up. Stick together. Outlive the horde.
            </p>
            <div className="mission-meta">
              <span>ENDLESS SURVIVAL</span>
              <i />
              <span>ACTUAL GAMEPLAY INCLUDED</span>
            </div>
            <div className="mode-select">
              <label htmlFor="mode">MISSION PROTOCOL</label>
              <select
                id="mode"
                value={mode}
                onChange={(e) => setMode(e.target.value as Mode)}
              >
                {MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <p>{modeDescriptions[mode]}</p>
            </div>
            <div className="seed-row">
              <div className="seed-label">
                <label htmlFor="seed">SEED</label>
                <button
                  type="button"
                  className="seed-pin"
                  aria-label={seedPinned ? "Unpin seed" : "Pin seed"}
                  aria-pressed={seedPinned}
                  title={
                    seedPinned
                      ? "Unpin and generate a new seed"
                      : "Keep this seed across reloads"
                  }
                  disabled={!seed.trim()}
                  onClick={toggleSeedPin}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M8 3h8l-1 7 4 4v2H5v-2l4-4-1-7Z" />
                    <path d="M12 16v6" />
                  </svg>
                </button>
              </div>
              <input
                id="seed"
                maxLength={40}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                readOnly={seedPinned}
                spellCheck={false}
              />
              <button
                title="Generate a new seed"
                aria-label="Generate a new seed"
                disabled={seedPinned}
                onClick={() => setSeed(randomSeed(seed))}
              >
                ↻
              </button>
            </div>
            <button
              className="menu-super-loadout"
              onClick={() => {
                setArmoryTab("supers");
                openArmory();
              }}
            >
              <span>SUPER LOADOUT</span>
              <strong>
                {profile.superLoadout.length
                  ? profile.superLoadout
                      .map((id) => SUPERS[id].name)
                      .join(" / ")
                  : "NONE EQUIPPED"}
              </strong>
              <small>CONFIGURE →</small>
            </button>
            <button
              className="deploy"
              disabled={!seed.trim()}
              onClick={() => start()}
            >
              <span>DEPLOY SQUAD</span>
              <span>↗</span>
            </button>
            <AssetLoading variant="menu" />
            <div className="menu-secondary">
              <button onClick={openArmory}>
                ARMORY <span>{profile.currency} CR</span>
              </button>
              <button onClick={() => setPanel("intel")}>FIELD MANUAL ↗</button>
            </div>
            <div className="personal-best">
              <span>PERSONAL BEST · {mode.toUpperCase()}</span>
              <b>
                {(profile.records[mode] || 0).toLocaleString()}
                <small> M</small>
              </b>
            </div>
          </section>
          <div className="menu-leaderboards">
            <Leaderboards
              key={mode}
              mode={mode}
              revision={scoreRevision}
              playerId={playerId}
            />
          </div>
          <footer>
            <span>01 / RALLY THE GUILD</span>
            <span>02 / CHOOSE YOUR GATES</span>
            <span>03 / SURVIVE THE CUPOCALYPSE</span>
          </footer>
        </>
      )}
      {screen !== "menu" && (
        <>
          <section className="hud-left">
            <span className="eyebrow">DISTANCE COVERED</span>
            <div className="distance">
              {Math.floor(sim.distance).toLocaleString()}
              <small>m</small>
            </div>
            <div className="sector-progress">
              <i style={{ width: `${(sim.distance % 250) / 2.5}%` }} />
            </div>
            <p>
              {Math.max(0, Math.ceil(sim.nextBoss - sim.distance))} M TO
              CONTAINMENT TARGET
            </p>
            <div className="hud-stat">
              <span>
                SQUAD{" "}
                <small>
                  {" "}
                  / {sim.army > 100 ? "WIDE FORMATION" : "SINGLE LANE"}
                </small>
              </span>
              <b>{sim.army}</b>
            </div>
            <ShieldHud sim={sim} />
            <div className="hud-stat">
              <span>ELIMINATED</span>
              <b>{sim.kills}</b>
            </div>
            <div className="active-boosts">
              <p className="arsenal-title">
                {1 + GUNS.filter((k) => sim.guns[k] > 0).length} GUNS FIRING
              </p>
              <div className="arsenal-list">
                <span style={{ color: ARSENAL.pulse.color }}>
                  ◆ KINETIC <b>∞</b>
                </span>
                {GUNS.filter((k) => sim.guns[k] > 0).map((kind) => (
                  <span
                    key={kind}
                    style={{ color: ARSENAL[kind].color }}
                    title={ARSENAL[kind].description}
                  >
                    <PickupGlyph kind={kind} /> {ARSENAL[kind].name}{" "}
                    <b>LV {sim.guns[kind]}</b>
                  </span>
                ))}
              </div>
              {sim.guns.cursor > 0 && (
                <p className="aim-hint">
                  MOVE MOUSE TO GUIDE WISP
                  <br />A / D TO STEER SQUAD
                </p>
              )}

              <p className="weapon-combination">
                KINETIC {weapon.offsets.length} SHOTS ·{" "}
                {(weapon.damage * weapon.shotScale).toFixed(2)}× DAMAGE
                <br />
                {weapon.cadence.toFixed(2)}× FIRE RATE · UPGRADES STACK
              </p>
              {Object.entries(sim.boosts)
                .filter(([, level]) => level > 0)
                .map(([name, level]) => (
                  <div key={name} title={PICKUPS[name as Boost].detail}>
                    <span>
                      <PickupGlyph kind={name as Boost} />{" "}
                      {PICKUPS[name as Boost].name}
                    </span>
                    <b>LV {level} · ∞</b>
                    <i
                      style={{
                        width: "100%",
                        background: PICKUPS[name as Boost].color,
                      }}
                    />
                  </div>
                ))}
            </div>
          </section>
          <section className="hud-right">
            <span className="eyebrow">{sim.mode.toUpperCase()} PROTOCOL</span>
            <p>{sim.seed}</p>
            <button className="outline" onClick={() => setScreen("paused")}>
              Ⅱ PAUSE <kbd>ESC</kbd>
            </button>
            {screen === "playing" && (
              <button className="outline" onClick={openArmory}>
                ARMORY
              </button>
            )}
            {sim.debug && (
              <div className="debug-badge">PRACTICE · NO REWARDS</div>
            )}
          </section>
          {boss && (
            <div className="boss-hud">
              <span>
                TARGET {sim.bossIndex + 1} / 8 · PHASE {boss.phase}
              </span>
              <h2>{boss.kind.toUpperCase()}</h2>
              <p className="boss-title">{bossDefinition(boss.kind).title}</p>
              {boss.motions.length > 1 && (
                <div className="strike-sequence">
                  {sim.hazards
                    .filter((h) => h.source === boss.id && h.endAt >= sim.tick)
                    .map((h, i) => (
                      <span
                        className={sim.tick >= h.warnAt ? "current" : ""}
                        key={h.id}
                      >
                        {i + 1} ·{" "}
                        {h.lanes
                          .map((l) => ["LEFT", "CENTER", "RIGHT"][l])
                          .join("+")}
                      </span>
                    ))}
                </div>
              )}
              <div className="boss-bar">
                <i
                  style={{
                    width: `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`,
                  }}
                />
              </div>
              <small>
                {Math.ceil(boss.hp)} HP{" "}
                {boss.armor > 0 ? ` / ${Math.ceil(boss.armor)} ARMOR` : ""}
              </small>
            </div>
          )}
          {sim.rewardUntil > sim.tick && (
            <div
              className={`reward ${sim.lastReward.startsWith("−") || sim.lastReward.startsWith("MISSED ·") ? "loss" : ""}`}
              key={sim.rewardUntil}
            >
              {sim.lastReward}
            </div>
          )}
          <SuperHud sim={sim} paused={screen !== "playing"} />
          <ControlsHelp
            visible={profile.helpVisible}
            onToggle={() =>
              setProfile((p) => ({ ...p, helpVisible: !p.helpVisible }))
            }
          />
        </>
      )}
      {screen === "victory" && (
        <div className="victory-reveal">
          <span>CONTAINMENT COMPLETE</span>
          <h1>THE WORLD IS QUIET.</h1>
          <p>Eight targets eliminated. Your squad endured.</p>
          <button onClick={() => setScreen("over")}>VIEW RESULTS →</button>
        </div>
      )}
      {(screen === "paused" || screen === "over") && panel === "none" && (
        <div className="modal-backdrop">
          <section className="dialog end-dialog">
            <span className="eyebrow">
              {screen === "over"
                ? sim.outcome === "victory"
                  ? "VICTORY · EIGHT TARGETS ELIMINATED"
                  : "OPERATION CONCLUDED"
                : "OPERATION ON HOLD"}
            </span>
            <h2>
              {screen === "over"
                ? sim.outcome === "victory"
                  ? "THE WORLD IS QUIET."
                  : "THE LAST STAND."
                : "HOLD THE LINE."}
            </h2>
            <p>
              {screen === "over"
                ? sim.reason
                : "Take a breath. Your squad is waiting."}
            </p>
            {screen === "over" && (
              <>
                <div className="result-distance">
                  {Math.floor(sim.distance)}
                  <small> METERS</small>
                </div>
                <div className="results-grid">
                  <div>
                    <b>{sim.peak}</b>
                    <span>PEAK SQUAD</span>
                  </div>
                  <div>
                    <b>{sim.kills}</b>
                    <span>ELIMINATIONS</span>
                  </div>
                  <div>
                    <b>+{earnings(sim)}</b>
                    <span>CREDITS{sim.debug ? " · PRACTICE" : ""}</span>
                  </div>
                </div>
                <p className="seed-summary">
                  {sim.mode} · {sim.seed}
                </p>
                {!sim.debug && (
                  <div className="score-submission">
                    {!playerName(profile.playerName) &&
                    scoreStatus === "idle" ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const name = playerName(nameDraft);
                          if (name)
                            setProfile((p) => ({ ...p, playerName: name }));
                        }}
                      >
                        <label htmlFor="score-name">
                          YOUR NAME ON THE LEADERBOARD
                        </label>
                        <div className="score-name-row">
                          <input
                            id="score-name"
                            value={nameDraft}
                            onChange={(e) => setNameDraft(e.target.value)}
                            maxLength={MAX_PLAYER_NAME}
                            autoComplete="nickname"
                            placeholder="Enter your name"
                            required
                          />
                          <button
                            className="outline"
                            disabled={!playerName(nameDraft)}
                          >
                            SAVE SCORE
                          </button>
                        </div>
                        <p>Remembered on this device. Change it in settings.</p>
                      </form>
                    ) : (
                      <p role="status">
                        {scoreStatus === "saved"
                          ? `Score saved as ${profile.playerName}.`
                          : scoreStatus === "error"
                            ? "Score could not be saved. "
                            : "Saving your score…"}
                        {scoreStatus === "error" && (
                          <button
                            onClick={() => void postScore(profile.playerName)}
                          >
                            RETRY
                          </button>
                        )}
                      </p>
                    )}
                  </div>
                )}
                {sim.debug && (
                  <p className="leaderboard-note">
                    Practice runs and replays do not enter the leaderboards.
                  </p>
                )}
                <Leaderboards
                  key={sim.mode}
                  mode={sim.mode}
                  revision={scoreRevision}
                  playerId={playerId}
                />
              </>
            )}
            <button
              className="deploy"
              onClick={() =>
                screen === "paused" ? setScreen("playing") : start()
              }
            >
              {screen === "paused" ? "RESUME OPERATION" : "DEPLOY AGAIN"}{" "}
              <span>→</span>
            </button>
            <div className="dialog-actions">
              <button
                onClick={() => {
                  setScreen("menu");
                  setSim(preview());
                  setPanel("none");
                }}
              >
                RETURN TO BASE
              </button>
              <button onClick={openArmory}>ARMORY</button>
              <button onClick={download}>SAVE REPLAY</button>
            </div>
          </section>
        </div>
      )}
      {panel !== "none" && (
        <div className="modal-backdrop">
          <section
            className={`dialog ${panel === "intel" ? "wide" : ""} ${panel === "armory" && armoryTab === "supers" ? "super-dialog" : ""}`}
          >
            <button
              className="close"
              onClick={() => setPanel("none")}
              aria-label="Close panel"
            >
              ×
            </button>
            <span className="eyebrow">THE LAST FRUIT / GUILD HQ</span>
            <h2>
              {panel === "armory"
                ? "SQUAD READINESS."
                : panel === "intel"
                  ? "KNOW THE THREAT."
                  : "PREFERENCES."}
            </h2>
            {panel === "armory" && (
              <>
                <nav className="armory-tabs">
                  <button
                    className={armoryTab === "supers" ? "selected" : ""}
                    onClick={() => setArmoryTab("supers")}
                  >
                    SUPER WEAPONS <small>27</small>
                  </button>
                  <button
                    className={armoryTab === "upgrades" ? "selected" : ""}
                    onClick={() => setArmoryTab("upgrades")}
                  >
                    SQUAD UPGRADES
                  </button>
                </nav>
                <p>Permanent unlocks. Shared across all protocols.</p>
                <div className="wallet">
                  {profile.currency} <small>CREDITS AVAILABLE</small>
                </div>
                {replay.current && screen !== "menu" && (
                  <p>
                    Loadout edits during replay playback apply to your next
                    deployment.
                  </p>
                )}
                {armoryTab === "supers" ? (
                  <SuperArmory
                    profile={profile}
                    setProfile={setProfile}
                    onLoadoutChange={changeLoadout}
                  />
                ) : (
                  <>
                    {["Starting army", "Weapon damage", "Fire rate"].map(
                      (name, i) => (
                        <div className="upgrade" key={name}>
                          <div>
                            <h3>{name}</h3>
                            <p>
                              +{UPGRADE_PERCENT[i] * profile.upgrades[i]}% ·
                              LEVEL {profile.upgrades[i]} / 5
                            </p>
                            <div className="upgrade-level">
                              {Array.from({ length: 5 }, (_, j) => (
                                <i
                                  className={
                                    j < profile.upgrades[i] ? "filled" : ""
                                  }
                                  key={j}
                                />
                              ))}
                            </div>
                          </div>
                          <button
                            disabled={
                              profile.upgrades[i] >= 5 ||
                              profile.currency < PRICES[profile.upgrades[i]]
                            }
                            onClick={() => setProfile((p) => purchase(p, i))}
                          >
                            {profile.upgrades[i] >= 5
                              ? "MAX LEVEL"
                              : `${PRICES[profile.upgrades[i]]} CR →`}
                          </button>
                        </div>
                      ),
                    )}
                    <p className="fine-print">
                      Earned credits are available whenever you open the Armory.
                      <br />
                      Upgrades apply when you deploy a new squad.
                    </p>
                  </>
                )}
              </>
            )}
            {panel === "intel" && (
              <>
                <div className="manual-intro">
                  <p>
                    <b>Three reactors. One selected charge.</b> Equip up to
                    three purchased super weapons in the Armory. Q / E selects
                    the previous / next slot; only that slot gains energy from
                    ordinary kills. Space unleashes it when full. Switch to
                    combine active powers. H shows or hides the controls guide.
                    Open the Armory anytime to buy or change super weapons.
                  </p>
                  <p>
                    <b>Move horizontally. Fire automatically.</b> Use A/D, arrow
                    keys, or drag. Collect guns to fire them all together. Move
                    the mouse to guide Wisp orbs; use A/D to steer
                    independently. Gates absorb fire and improve as you shoot.
                    Cross one side to apply its value. Division rounds down.
                  </p>
                  <p>
                    <b>Steer the tip. Protect the ranks.</b> The firing tip
                    leads a rounded crowd with a flat rear. About 100 soldiers
                    fit one lane. The crowd trails your turns and bunches
                    against the curb, pushing the tip forward under pressure.
                    Enemies and barricades can catch the rear ranks. The
                    sidewalk can crush soldiers even with a shield; replenish
                    losses at gates and supplies.
                  </p>
                  <p>
                    <b>Read the road.</b> Amber lanes warn of attacks; red lanes
                    are active. Armor absorbs bullets, but contact becomes more
                    dangerous as your formation grows. Shields absorb damage
                    first. Weapon upgrades last the entire run. Collect
                    duplicates to increase their level. Spread grows from three
                    to seven shots; later levels add damage. Shields remain
                    consumable. Early upgrades are spaced out, and multiplier
                    gates appear only after 100 m. After the first boss
                    encounter, supplies arrive almost twice as often and enemies
                    can drop loot. Boss victories award a weapon and a modifier.
                    All sixteen guns fire together; all fourteen modifiers stack
                    across the arsenal.
                  </p>
                </div>
                <div className="enemy-manual">
                  {ENEMIES.map((name, i) => (
                    <article key={name}>
                      <span>{String(i + 1).padStart(2, "0")}</span>
                      <div>
                        <h3>{name}</h3>
                        <p>
                          {
                            [
                              "Slow advance. Clear it before contact.",
                              "Fast soldier. Cut it down early.",
                              "Low crawling swarms. Spread fire helps.",
                              "Break its shield to expose the body.",
                              "A committed lane rush. Leave the warning.",
                              "Marked fluid pools. Keep clear after impact.",
                              "Explodes on death. Use its blast on infected.",
                              "Accelerates nearby infected. Prioritize it.",
                              "Releases Crawlers until killed.",
                              "Warned bursts. Reposition before firing.",
                            ][i]
                          }
                        </p>
                      </div>
                    </article>
                  ))}
                </div>
                <p className="fine-print">
                  Boss sequence: {BOSSES.join(" → ")}. All eight targets must be
                  eliminated. Travel pauses in each arena. Defeat The Last
                  Witness to complete the campaign.
                </p>
              </>
            )}
            {panel === "settings" && (
              <>
                <div className="setting player-name-setting">
                  <label htmlFor="player-name">Leaderboard name</label>
                  <input
                    id="player-name"
                    maxLength={MAX_PLAYER_NAME}
                    autoComplete="nickname"
                    placeholder="Enter your name"
                    value={profile.playerName}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, playerName: e.target.value }))
                    }
                    onBlur={(e) =>
                      setProfile((p) => ({
                        ...p,
                        playerName: playerName(e.target.value),
                      }))
                    }
                  />
                </div>
                <p className="fine-print">
                  Saved on this device. Your new name applies to future scores.
                </p>
                <div className="setting">
                  <label htmlFor="sound">Audio</label>
                  <button
                    id="sound"
                    onClick={() =>
                      setProfile((p) => ({ ...p, muted: !p.muted }))
                    }
                  >
                    {profile.muted ? "MUTED" : "ENABLED"}
                  </button>
                </div>
                <div className="setting">
                  <label htmlFor="quality">Rendering</label>
                  <select
                    id="quality"
                    value={profile.quality}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        quality: e.target.value as "high" | "performance",
                      }))
                    }
                  >
                    <option value="high">High · bloom + antialiasing</option>
                    <option value="performance">Performance</option>
                  </select>
                </div>
                <div className="setting">
                  <label>Last operation</label>
                  <button
                    disabled={!profile.lastReplay}
                    onClick={() =>
                      profile.lastReplay && start(profile.lastReplay)
                    }
                  >
                    WATCH REPLAY →
                  </button>
                </div>
                <label className="replay-import">
                  LOAD REPLAY FILE
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      try {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const r = JSON.parse(await file.text());
                        if (
                          !MODES.includes(r.mode) ||
                          (Array.isArray(r.inputs) && !validSuperReplay(r)) ||
                          !Array.isArray(r.inputs) ||
                          r.inputs.length > 216000 ||
                          !r.inputs.every(
                            (n: unknown) =>
                              typeof n === "number" &&
                              Number.isFinite(n) &&
                              Math.abs(n) <= 3.8,
                          ) ||
                          (r.aims !== undefined &&
                            (!Array.isArray(r.aims) ||
                              r.aims.length !== r.inputs.length ||
                              !r.aims.every(
                                (n: unknown) =>
                                  typeof n === "number" &&
                                  Number.isFinite(n) &&
                                  Math.abs(n) <= 4.5,
                              ))) ||
                          !Array.isArray(r.upgrades) ||
                          r.upgrades.length !== 3 ||
                          !r.upgrades.every(
                            (n: unknown) =>
                              typeof n === "number" &&
                              Number.isInteger(n) &&
                              n >= 0 &&
                              n <= 5,
                          ) ||
                          typeof r.seed !== "string"
                        )
                          throw Error();
                        start(r);
                      } catch {
                        setError("This replay file is invalid.");
                      }
                    }}
                  />
                </label>
                <p className="fine-print">
                  Progress saves locally in this browser. Replays preserve seed,
                  protocol, starting upgrades, and every tick input.
                </p>
              </>
            )}
            {error && <p role="alert">{error}</p>}
          </section>
        </div>
      )}
      {debug && (
        <aside className="debug-panel">
          <b>SIMULATION INSPECTOR</b>
          <span>
            {fps} FPS · TICK {sim.tick}
          </span>
          <span>
            {sim.template} · DIFF {sim.difficulty.toFixed(2)}
          </span>
          <span>
            {sim.seed} · {sim.mode}
          </span>
          <label>
            Mode override
            <select
              value={sim.mode}
              onChange={(e) => {
                sim.mode = e.target.value as Mode;
                sim.debug = true;
                setMode(sim.mode);
              }}
            >
              {MODES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <span>
            {sim.enemies.length} ENEMIES ·{" "}
            {sim.effects.filter((e) => e.active).length} FX
          </span>
          <button
            onClick={() => {
              sim.debug = true;
              sim.gates = [];
              sim.enemies = [];
              sim.drops = [];
              sim.hazards = [];
              sim.bossPending = false;
              sim.bossActive = true;
              sim.spawnEnemy(
                BOSSES[Math.min(sim.bossIndex, BOSSES.length - 1)],
                0,
                26,
                true,
              );
            }}
          >
            SPAWN BOSS
          </button>
          <small>DEBUG RUNS DO NOT EARN REWARDS</small>
        </aside>
      )}
      {storageError && (
        <div className="storage-error" role="alert">
          Browser storage unavailable. Progress cannot be saved.
        </div>
      )}
      <div className="desktop-only">
        <span className="eyebrow">THE LAST FRUIT: CUPOCALYPSE</span>
        <h2>
          A WIDER
          <br />
          FIELD OF VIEW.
        </h2>
        <p>
          The Last Fruit: Cupocalypse requires a desktop browser, keyboard or
          mouse, and a window at least 900 pixels wide.
        </p>
      </div>
    </main>
  );
}

function PickupGlyph({ kind }: { kind: import("./game/types").Pickup }) {
  const path = iconPath(kind);
  return path ? (
    <svg className="pickup-glyph" viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="currentColor" fillRule="evenodd" />
    </svg>
  ) : (
    <span aria-hidden="true">◆</span>
  );
}
