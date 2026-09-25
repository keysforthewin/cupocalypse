/** Permanent super catalog. Runtime geometry/audio use the same stable identities. */
export const SUPER_IDS = [
  "mortal",
  "keys",
  "sybex",
  "tuna",
  "nitro",
  "baezil",
  "pauly",
  "machinegunqueen",
  "meesh",
  "zunneh",
  "rae",
  "doc",
  "kismet",
  "mmiguel",
  "strawberry",
  "nemesis",
  "bronze-leopard",
  "five10",
  "shannondoa",
  "kuttula",
  "gimmy",
  "haut-carl",
  "hondo",
  "panda",
  "pokey",
  "platypus",
  "so1ician",
] as const;
export type SuperId = (typeof SUPER_IDS)[number];
export interface SuperDefinition {
  id: SuperId;
  name: string;
  title: string;
  price: number;
  duration: number;
  color: string;
  accent: string;
  role: string;
  description: string;
  boss: string;
  glyph: string;
}
const rows: [
  string,
  string,
  number,
  number,
  string,
  string,
  string,
  string,
  string,
  string,
][] = [
  [
    "Mortal",
    "Last Rites",
    1000,
    30,
    "#f5eee2",
    "#795ca9",
    "EXECUTION",
    "A colossal scythe remains for 30s, executing the ordinary enemies ahead once after a 0.6s windup and erasing their hazards.",
    "Deals up to 35% maximum boss health.",
    "M3 21L15 3Q24 3 21 13L15 7M13 7L3 21",
  ],
  [
    "Keys",
    "Skeleton Key",
    500,
    30,
    "#e9bf61",
    "#fff0bd",
    "EXPOSE",
    "For 30s, strip ordinary enemy armor and let the next arsenal hit execute them.",
    "Removes half current armor; next arsenal hit adds 25% maximum health damage.",
    "M15 3a5 5 0 1 0 0 10a5 5 0 0 0 0-10M11 12L3 20M4 19L7 22M7 16L10 19",
  ],
  [
    "Sybex",
    "Clockbreak",
    500,
    30,
    "#72cfff",
    "#dfedff",
    "STASIS",
    "Suspend ordinary enemies and their attack clocks for 30s, preserving warning time.",
    "Bosses and their attacks freeze for 2s.",
    "M12 2L22 7V17L12 22L2 17V7ZM12 6V12L16 15M2 7L12 12L22 7",
  ],
  [
    "Tuna",
    "Broadside Tide",
    500,
    7,
    "#68d7ed",
    "#e0fbff",
    "DISPLACEMENT",
    "A giant tidal fish deals 60% maximum durability, clears hazards and pushes enemies back 12m. Survivors slow for 15s.",
    "Resists displacement; damage capped at 35% maximum health.",
    "M2 12Q10 0 18 12Q10 24 2 12ZM18 12L23 5V19ZM8 9L8 10",
  ],
  [
    "Nitro",
    "Redline",
    50,
    15,
    "#ff863e",
    "#fff3b7",
    "OVERDRIVE",
    "All ordinary guns fire at triple cadence and deal 1.5× damage for 15s.",
    "Bonus damage capped at 35% maximum health per activation.",
    "M13 2L4 14H11L9 23L21 9H14Z",
  ],
  [
    "Baezil",
    "Infernal Garden",
    500,
    15,
    "#f35a77",
    "#ffb55c",
    "BURN FIELD",
    "Three thorn sigils burn enemies for 25% maximum durability per second for 15s.",
    "Combined damage capped at 35% maximum health.",
    "M12 22V9M12 16L4 12M12 12L20 7M12 3C2 0 1 11 12 13C23 11 22 0 12 3Z",
  ],
  [
    "Pauly",
    "Protection Racket",
    50,
    15,
    "#edc24c",
    "#fff6cf",
    "RETALIATION",
    "Prevent 75% of combat damage for 15s. Blocking an attack fires a retaliatory coin at its source.",
    "Retaliation deals 30% maximum durability, with the shared boss cap.",
    "M12 2L21 6V13Q20 20 12 23Q4 20 3 13V6ZM15 8H10V12H14V16H9M12 6V18",
  ],
  [
    "MachineGunQueen",
    "Royal Fusillade",
    1000,
    30,
    "#ff66bb",
    "#f5d778",
    "TURRET",
    "A crown turret fires 12 rounds a second for 30s, each dealing 20% maximum durability.",
    "Focuses ordinary threats first; total boss damage capped at 35%.",
    "M3 18L1 5L8 10L12 2L16 10L23 5L21 18ZM4 22H20M7 14V18M12 12V18M17 14V18",
  ],
  [
    "Meesh",
    "Ghostwalk",
    50,
    60,
    "#c6a8ff",
    "#f8eaff",
    "PHASE",
    "Phase through contact, hazards and curbs for 60s. Gates still apply; enemies passing through give no rewards.",
    "Boss contact and attacks cannot harm the phased squad.",
    "M4 21V10C4-2 20-2 20 10V21L16 18L12 22L8 18ZM8 9V12M16 9V12",
  ],
  [
    "Zunneh",
    "Storm Parliament",
    500,
    15,
    "#64a7ff",
    "#d9f5ff",
    "CHAIN STORM",
    "Three birds arc lightning through up to five enemies every 0.75s for 15s, dealing 45% durability per strike.",
    "Combined boss damage capped at 35% maximum health.",
    "M1 6L8 9L12 4L16 9L23 6L18 14L12 11L6 14ZM13 13L8 19H13L11 24",
  ],
  [
    "Rae",
    "Daybreak Lance",
    1000,
    30,
    "#ffd75a",
    "#ffffe5",
    "AIMED BEAM",
    "Aim a 2m-wide solar beam with the mouse for 30s. Deals 100% maximum durability per second.",
    "Combined boss damage capped at 35% maximum health.",
    "M12 1V4M12 20V23M1 12H4M20 12H23M4 4L6 6M18 18L20 20M4 20L6 18M18 6L20 4M12 6a6 6 0 1 0 0 12a6 6 0 0 0 0-12",
  ],
  [
    "Doc",
    "Second Opinion",
    50,
    60,
    "#72f0bf",
    "#eafff5",
    "RECOVERY",
    "Restore 60% of unrecovered combat casualties from the last 15s. Gain temporary shield for 60s equal to half your army, minimum 30.",
    "Temporary shield absorbs boss attacks for up to 60s.",
    "M8 2H16V8H22V16H16V22H8V16H2V8H8ZM2 12H7L10 9L13 15L16 12H22",
  ],
  [
    "Kismet",
    "Loaded Fate",
    50,
    60,
    "#ffcc78",
    "#ccabff",
    "FORTUNE",
    "For 60s or three gates, use the better side, double recruitment gains and neutralize losses.",
    "Sudden Death keeps neutral gates and grants 40 shield per crossing.",
    "M5 2H19V22H5ZM12 6L16 12L12 18L8 12ZM2 5V19M22 5V19",
  ],
  [
    "Mmiguel",
    "Dos Amigos",
    500,
    15,
    "#62e8d4",
    "#ff947c",
    "COMPANIONS",
    "Two spectral companions duplicate your ordinary arsenal for 15s, each at 50% damage.",
    "Companion damage shares one 35% boss-health budget.",
    "M6 3a3 3 0 1 0 0 6a3 3 0 0 0 0-6M18 3a3 3 0 1 0 0 6a3 3 0 0 0 0-6M2 22V13L6 11L10 13V22M14 22V13L18 11L22 13V22M10 16H14",
  ],
  [
    "Strawberry",
    "Sweet Rot",
    500,
    4.5,
    "#ff5278",
    "#b9ee91",
    "CONTAGION",
    "Seed five enemies. Bursts deal 60% durability and spread twice for three generations, up to 35 seeds. Kills recover one soldier each.",
    "Burst damage capped at 35% maximum boss health.",
    "M12 6C0-2-2 12 12 23C26 12 24-2 12 6ZM5 2L12 5L19 2M8 10V11M16 10V11M12 14V15",
  ],
  [
    "Nemesis",
    "Personal Matter",
    1000,
    30,
    "#ff435d",
    "#ffd5da",
    "DUEL",
    "Mark the toughest threat: ordinary arsenal hits gain 200% bonus damage for 30s. Transfers on death, up to three targets.",
    "Prioritizes bosses; bonus damage capped at 35% maximum health.",
    "M2 8V2H8M16 2H22V8M22 16V22H16M8 22H2V16M12 6V18M6 12H18M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8",
  ],
  [
    "Bronze Leopard",
    "Six Pounces",
    50,
    30,
    "#dba066",
    "#fff1bc",
    "HUNTER",
    "A bronze leopard remains for 30s and executes six nearby ordinary threats in rapid succession.",
    "Remaining pounces deal 10% maximum health each, capped at 35%.",
    "M3 4L8 8L12 5L16 8L21 4L20 17L12 23L4 17ZM7 12H9M15 12H17M9 17L12 19L15 17",
  ],
  [
    "Five10",
    "Ten Count",
    1000,
    30,
    "#91aaff",
    "#edf5ff",
    "BOMBARDMENT",
    "Five paired bombardments repeat every 5s for 30s, hitting ten columns across the road for 100% maximum durability each.",
    "All bombardments share a 35% boss-health damage budget per activation.",
    "M2 3H10V11H3V20H10M15 3V21M20 3H24V21H20ZM0 24H24",
  ],
  [
    "Shannondoa",
    "River’s Mercy",
    50,
    30,
    "#6ddbc8",
    "#d9f2ee",
    "SAFE CORRIDOR",
    "Push enemies out of the center lane, slow their advance by 60% and extinguish center-lane hazards for 30s.",
    "Resists displacement; future attack cooldowns grow by 25%.",
    "M4 1Q12 6 4 12Q-4 18 4 23M12 1Q20 6 12 12Q4 18 12 23M20 1Q28 6 20 12Q12 18 20 23",
  ],
  [
    "Kuttula",
    "Below the Asphalt",
    500,
    15,
    "#b980ed",
    "#f5bfed",
    "GRAPPLE",
    "Six tentacles hold and crush enemies for 35% maximum durability per second for 15s.",
    "Uses two tentacles, roots for at most 2s; damage capped at 35%.",
    "M3 23C18 10-3 9 4 2M8 23C24 9 5 8 12 1M14 23C30 12 13 9 20 3M20 23C30 19 17 15 24 9",
  ],
  [
    "Gimmy",
    "Mine, Mine, Mine",
    50,
    60,
    "#b8ee58",
    "#f1ffce",
    "SALVAGE",
    "Magnetize all existing pickups and apply each twice. For 60s, every third eligible kill recruits five soldiers, up to five times.",
    "Salvage and recruitment work during boss encounters.",
    "M3 3H8V13Q12 21 16 13V3H21V14Q12 30 3 14ZM3 8H8M16 8H21M10 1H14",
  ],
  [
    "Haut Carl",
    "Special Delivery",
    500,
    7.5,
    "#d6ac51",
    "#f2d1a2",
    "STICKY ARTILLERY",
    "Six parcels hit enemy clusters for 80% durability each, leaving 4s patches that burn for 15% per second.",
    "All parcels and patches share a 35% boss-health damage budget.",
    "M3 6L12 2L21 6V19L12 23L3 19ZM3 6L12 11L21 6M12 11V23M8 4L17 8V13",
  ],
  [
    "Hondo",
    "Hold the Line",
    500,
    30,
    "#ee7662",
    "#ffcdc0",
    "BARRICADE",
    "Three walls hold ordinary enemies for 30s. Each has durability equal to your army; friendly shots pass through.",
    "Bosses break a wall after 2s of contact.",
    "M1 7H7V22H1ZM9 2H15V22H9ZM17 7H23V22H17ZM1 15H23",
  ],
  [
    "Panda",
    "Gentle Giant",
    1000,
    30,
    "#eef2e7",
    "#9ab9b4",
    "ABSORB / RELEASE",
    "Absorb combat damage up to twice your army for up to 30s, then clap: each point absorbed adds 1% durability damage, up to 100%.",
    "Clap damage capped at 35% maximum boss health.",
    "M5 3a3 3 0 1 0 0 6M19 3a3 3 0 1 1 0 6M12 4C-2 4 0 22 12 22C24 22 26 4 12 4ZM6 10L9 13M18 10L15 13M10 17H14",
  ],
  [
    "Pokey",
    "Keep Your Distance",
    50,
    15,
    "#ffb077",
    "#fff2d3",
    "PROXIMITY GUARD",
    "Orbit 24 quills for up to 15s. Fire one every 0.15s at threats within 12m, dealing 60% durability.",
    "Quills share a 35% boss-health damage budget.",
    "M2 19L1 9L6 12L5 3L11 9L14 1L17 10L23 5L21 16L24 20ZM3 22H22",
  ],
  [
    "Platypus",
    "Wrong-Way Warfare",
    500,
    30,
    "#54dfe8",
    "#c08bff",
    "HAZARD REVERSAL",
    "For 30s, hazards spare your squad and hit enemies in their lanes for 35% durability. Pools tick each second.",
    "Converted attacks share a 35% boss-health damage budget.",
    "M3 8Q3 1 12 3Q21 1 21 8L24 12L20 16H4L0 12ZM5 19L2 23H9L10 19M14 19L15 23H22L19 19",
  ],
  [
    "So1ician",
    "Final Objection",
    500,
    30,
    "#ddd4ff",
    "#ffffff",
    "SILENCE",
    "For 30s, cancel pending and new attacks or summons and punish each canceled action for 40% durability. Active hazards continue.",
    "Each cancellation deals 5% maximum health, capped at 35%.",
    "M7 2L17 8L13 15L3 9ZM13 12L22 21M2 22H16M6 18H12",
  ],
];
export const SUPERS = Object.fromEntries(
  rows.map((r, i) => [
    SUPER_IDS[i],
    {
      id: SUPER_IDS[i],
      name: r[0],
      title: r[1],
      price: r[2],
      duration: r[3],
      color: r[4],
      accent: r[5],
      role: r[6],
      description: r[7],
      boss: r[8],
      glyph: r[9],
    },
  ]),
) as Record<SuperId, SuperDefinition>;
export const isSuperId = (v: unknown): v is SuperId =>
  typeof v === "string" && (SUPER_IDS as readonly string[]).includes(v);
export function sanitizeLoadout(
  v: unknown,
  owned: readonly SuperId[] = SUPER_IDS,
): SuperId[] {
  return Array.isArray(v)
    ? [
        ...new Set(
          v.filter((id): id is SuperId => isSuperId(id) && owned.includes(id)),
        ),
      ].slice(0, 3)
    : [];
}
export function validSuperReplay(r: {
  inputs: unknown[];
  superLoadout?: unknown;
  superInputs?: unknown;
  superLoadoutChanges?: unknown;
}) {
  return (
    Array.isArray(r.inputs) &&
    Array.isArray(r.superLoadout) &&
    r.superLoadout.length <= 3 &&
    r.superLoadout.every(isSuperId) &&
    new Set(r.superLoadout).size === r.superLoadout.length &&
    Array.isArray(r.superInputs) &&
    r.superInputs.length === r.inputs.length &&
    r.superInputs.every(
      (n) => Number.isInteger(n) && Number(n) >= 0 && Number(n) <= 5,
    ) &&
    (r.superLoadoutChanges === undefined ||
      (Array.isArray(r.superLoadoutChanges) &&
        r.superLoadoutChanges.every(
          (change, i, changes) =>
            change !== null &&
            typeof change === "object" &&
            Number.isInteger(change.tick) &&
            change.tick >= 0 &&
            change.tick <= r.inputs.length &&
            (i === 0 || change.tick >= changes[i - 1].tick) &&
            Array.isArray(change.loadout) &&
            change.loadout.length <= 3 &&
            change.loadout.every(isSuperId) &&
            new Set(change.loadout).size === change.loadout.length,
        )))
  );
}
