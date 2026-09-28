import { DEFAULT_AI } from "./ai";
import type { EnemySpec, Loadout } from "./battle";
import { type Consumable, CONSUMABLES, ENEMY_RELICS, type Item, itemById, type Relic, RELICS } from "./items";
import { Rng } from "./rng";

export const START_HP = 5;
export const START_GOLD = 20;
export const SLOTS = 4;
/** Winning this many fights clears the game; the run can then go on as endless mode. */
export const GOAL_ROUNDS = 20;
export const VICTORY_HEAL = 1;
export const ENEMY_NAME_COUNT = 12;
export const MAX_ENEMY_RELICS = 6;
/** Tell lines per action, ordered from blunt to subtle. */
export const TELL_LINES = 5;

/** How many of the tell lines an enemy in the n-th fight picks from: 1 at first, all 5 by fight 9. */
export function tellVariety(n: number): number {
  return Math.min(TELL_LINES, 1 + Math.floor((n - 1) / 2));
}
export const PLAYER_MODEL = "character-male-a";
/** Which models can play each enemy name (index = name number), so タカシ isn't drawn as a girl. */
const NAME_BODIES: ("male" | "female" | "any")[] = ["male", "male", "female", "female", "any", "male", "female", "any", "female", "male", "male", "any"];
const MODELS = {
  male: ["character-male-b", "character-male-c", "character-male-d", "character-male-e", "character-male-f"],
  female: ["character-female-a", "character-female-b", "character-female-c", "character-female-d", "character-female-e", "character-female-f"],
};
export const RANK_COUNT = 5;
export const ENEMY_COLORS = ["#ff8a80", "#8bd17c", "#f6a5c0", "#ffcc66", "#9fa8ff", "#6fd6d0", "#c792ea", "#ffab70"];

/** The shop's always-available rest: pay to recover HP. */
export const REST_PRICE = 10;
export const REST_HEAL = 1;

export type Purchase = "ok" | "no_gold" | "bag_full" | "sold_out" | "maxed";

/** What the shop pays back for an owned item: half its price, at least 5. */
export function sellPrice(item: Item): number {
  return Math.max(5, Math.floor(item.price / 2));
}

export interface StockEntry {
  item: Item;
  sold: boolean;
}

/**
 * Enemy for the n-th fight (1-based). Everything ramps with n: more HP, faster tempo, a sharper
 * and more aggressive brain, fewer tells, more energy, and a relic every third fight from the
 * fourth on (up to six), drawn from stronger tiers as the run goes.
 */
export function enemyFor(n: number, rng: Rng): EnemySpec {
  const k = n - 1;
  const relicCount = Math.min(MAX_ENEMY_RELICS, Math.floor(k / 3));
  const tier = n >= 10 ? 3 : n >= 6 ? 2 : 1;
  const nameIndex = rng.int(0, ENEMY_NAME_COUNT - 1);
  const body = NAME_BODIES[nameIndex];
  return {
    nameIndex,
    model: rng.pick(body === "any" ? [...MODELS.male, ...MODELS.female] : MODELS[body]),
    rank: Math.min(RANK_COUNT - 1, Math.floor(k / 3)),
    color: rng.pick(ENEMY_COLORS),
    maxHp: Math.min(9, 3 + Math.floor(k / 4)),
    maxEnergy: n >= 10 ? 4 : 3,
    startEnergy: n >= 12 ? 2 : n >= 6 ? 1 : 0,
    tellChance: Math.max(0.25, 0.5 - 0.015 * k),
    tellAccuracy: Math.max(0.6, 0.8 - 0.015 * k),
    ai: {
      ...DEFAULT_AI,
      aggression: Math.min(1.8, 1.0 + 0.08 * k),
      readSkill: Math.min(1.3, 0.3 + 0.06 * k),
      caution: 0.8,
      randomness: Math.max(0.05, 0.35 - 0.02 * k),
    },
    relics: rng.shuffle(ENEMY_RELICS.filter((r) => (r.tier ?? 1) <= tier)).slice(0, relicCount),
    bpm: Math.min(150, 92 + 3 * k),
  };
}

export class Run {
  readonly rng: Rng;
  round = 1;
  hp = START_HP;
  maxHp = START_HP;
  gold = START_GOLD;
  relics: Relic[] = [];
  slots: (Consumable | null)[] = new Array(SLOTS).fill(null);
  stock: StockEntry[] = [];
  enemy: EnemySpec;
  /** Set once the player chooses to keep going after the goal. */
  endless = false;

  constructor(seed?: number) {
    this.rng = new Rng(seed);
    this.slots[0] = itemById("bandage") as Consumable;
    this.enemy = enemyFor(this.round, this.rng);
  }

  get wins(): number {
    return this.round - 1;
  }

  /** True right after the goal fight is won, until the player picks endless mode. */
  get justCleared(): boolean {
    return !this.endless && this.wins === GOAL_ROUNDS;
  }

  loadout(): Loadout {
    return { hp: this.hp, maxHp: this.maxHp, relics: this.relics, slots: this.slots };
  }

  goldFor(n: number): number {
    return 15 + 3 * n;
  }

  /** Returns the gold won; after a win the next enemy is rolled and the shop restocked. */
  finishBattle(won: boolean, hpLeft: number): number {
    this.hp = Math.max(0, Math.min(this.maxHp, hpLeft));
    if (!won) return 0;
    const gold = this.goldFor(this.round);
    this.gold += gold;
    this.hp = Math.min(this.maxHp, this.hp + VICTORY_HEAL);
    this.round++;
    this.enemy = enemyFor(this.round, this.rng);
    this.rollShop();
    return gold;
  }

  rollShop(): void {
    const consumables = this.rng.shuffle(CONSUMABLES).slice(0, 3);
    const relics = this.rng.shuffle(RELICS.filter((r) => !this.hasRelic(r.id))).slice(0, 2);
    this.stock = [...consumables, ...relics].map((item) => ({ item, sold: false }));
  }

  hasRelic(id: string): boolean {
    return this.relics.some((r) => r.id === id);
  }

  buy(index: number): Purchase {
    const entry = this.stock[index];
    if (!entry || entry.sold) return "sold_out";
    if (this.gold < entry.item.price) return "no_gold";
    if (entry.item.kind === "consumable") {
      const free = this.slots.indexOf(null);
      if (free < 0) return "bag_full";
      this.slots[free] = entry.item;
    } else {
      this.relics.push(entry.item);
    }
    this.gold -= entry.item.price;
    entry.sold = true;
    return "ok";
  }

  canRest(): boolean {
    return this.hp < this.maxHp;
  }

  /** Pays to recover HP; can be bought again and again until HP is full. */
  rest(): Purchase {
    if (!this.canRest()) return "maxed";
    if (this.gold < REST_PRICE) return "no_gold";
    this.gold -= REST_PRICE;
    this.hp = Math.min(this.maxHp, this.hp + REST_HEAL);
    return "ok";
  }

  /** Sells an owned relic (by index in `relics`); returns the gold received, or 0 if there was none. */
  sellRelic(index: number): number {
    const relic = this.relics[index];
    if (!relic) return 0;
    this.relics.splice(index, 1);
    const gold = sellPrice(relic);
    this.gold += gold;
    return gold;
  }

  /** Sells the consumable in a slot; returns the gold received, or 0 for an empty slot. */
  sellSlot(slot: number): number {
    const item = this.slots[slot];
    if (!item) return 0;
    this.slots[slot] = null;
    const gold = sellPrice(item);
    this.gold += gold;
    return gold;
  }

  swapSlots(a: number, b: number): void {
    if (a < 0 || b < 0 || a >= this.slots.length || b >= this.slots.length) return;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]];
  }
}
