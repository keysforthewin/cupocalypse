import { RNG } from "./rng";
import { GUNS, type Gun } from "./projectiles";
import { BOOSTS, type Boost, type Pickup } from "./types";

/** Separate stream: loot never consumes encounter randomness. */
export class LootDeck {
  rng: RNG;
  weapons: Gun[] = [];
  modifiers: Boost[] = [];
  constructor(seed: string) {
    this.rng = new RNG(`${seed}:loot`);
  }
  draw(
    category: "weapon" | "modifier",
    owned: Partial<Record<Pickup, number>>,
  ): Pickup {
    const keys = category === "weapon" ? GUNS : BOOSTS;
    const duplicates = keys.filter((k) => (owned[k] ?? 0) > 0);
    if (duplicates.length && this.rng.next() < 0.25)
      return duplicates[this.rng.int(duplicates.length)];
    const bag: Pickup[] = category === "weapon" ? this.weapons : this.modifiers;
    if (!bag.length) {
      bag.push(...keys);
      for (let i = bag.length - 1; i > 0; i--) {
        const j = this.rng.int(i + 1);
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    return bag.pop()!;
  }
  next(owned: Partial<Record<Pickup, number>>): Pickup {
    const roll = this.rng.next();
    if (roll < 0.4) return this.draw("weapon", owned);
    if (roll < 0.9) return this.draw("modifier", owned);
    return this.rng.next() < 0.5 ? "shield" : "recruit";
  }
}
