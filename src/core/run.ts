import { DEFAULT_AI, type Personality, PERSONALITY_TUNING } from "./ai";
import { type Character, CHARACTERS, startItems, startRelics } from "./characters";
import type { BattleEvent, EnemySpec, Loadout } from "./battle";
import { type Consumable, CONSUMABLES, ENEMY_RELICS, type Item, type Relic, RELICS } from "./items";
import { EVENT_CHANCE, type EventId, type EventOutcome, EVENTS, eventPool } from "./events";
import { Rng } from "./rng";

export const SLOTS = 4;
/** Winning this many fights clears the game; the run can then go on as endless mode. */
export const GOAL_ROUNDS = 20;
export const VICTORY_HEAL = 2;
export const ENEMY_NAME_COUNT = 12;
export const MAX_ENEMY_RELICS = 6;
/** Tell lines per action, ordered from blunt to subtle. */
export const TELL_LINES = 5;

/** How many of the tell lines an enemy in the n-th fight picks from: 1 at first, all 5 by fight 9. */
export function tellVariety(n: number): number {
  return Math.min(TELL_LINES, 1 + Math.floor((n - 1) / 2));
}
/** Which models can play each enemy name (index = name number), so タカシ isn't drawn as a girl. */
const NAME_BODIES: ("male" | "female" | "any")[] = ["male", "male", "female", "female", "any", "male", "female", "any", "female", "male", "male", "any"];
const MODELS = {
  male: ["character-male-a", "character-male-b", "character-male-c", "character-male-d", "character-male-e", "character-male-f"],
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

/** What the end-of-run summary shows. */
export interface RunStats {
  bestCombo: number;
  /** Graded presses (actions and items) and how many were Perfect. */
  judged: number;
  perfects: number;
  damageDealt: number;
  damageTaken: number;
  fevers: number;
}

export interface StockEntry {
  item: Consumable;
  sold: boolean;
}

/** Every n-th fight is an elite: tougher, and its reward includes a free relic pick. */
export const ELITE_EVERY = 5;
/** From this fight on every enemy gets +1 energy per charge (chargers always do). */
export const STRONG_CHARGE_FROM = 15;
export const RELIC_PICK_SIZE = 3;
/** The impatient relic (enemy acts while the player waits): 30% of enemies at this fight… */
export const IMPATIENT_FROM = 6;
/** …rising evenly to every enemy from this fight on. */
export const IMPATIENT_ALWAYS_FROM = 15;

/** Every n-th fight is the boss, レモン仙人 (the goal fight, then again and again in endless mode). */
export const BOSS_EVERY = GOAL_ROUNDS;
export const BOSS_MODEL = "character-male-e";
export const BOSS_COLOR = "#ffd43b";

export function impatientChance(n: number): number {
  if (n < IMPATIENT_FROM) return 0;
  return Math.min(1, 0.3 + (0.7 * (n - IMPATIENT_FROM)) / (IMPATIENT_ALWAYS_FROM - IMPATIENT_FROM));
}
/** The shop's treasure chest: one per visit, opens to a relic pick; dearer for every relic owned. */
export const CHEST_PRICE = 45;
export const CHEST_PRICE_STEP = 0.15;

/** Personality odds by stage: easy-to-read styles early, the reader later. */
function personalityFor(n: number, rng: Rng): Personality {
  const weights: [Personality, number][] =
    n <= 4
      ? [["brawler", 35], ["wild", 35], ["guardian", 15], ["charger", 15], ["reader", 0]]
      : n <= 10
        ? [["brawler", 25], ["wild", 20], ["guardian", 20], ["charger", 20], ["reader", 15]]
        : [["brawler", 20], ["wild", 10], ["guardian", 20], ["charger", 20], ["reader", 30]];
  return rng.weighted(weights);
}

/**
 * Enemy for the n-th fight (1-based). Everything ramps with n: more HP, faster tempo, a sharper
 * and more aggressive brain, fewer tells, more energy, and a relic from the seventh fight on (one
 * more every fifth fight, up to six), drawn from stronger tiers as the run goes. Each enemy has
 * a personality that bends its brain; every fifth fight is an elite. From the sixth fight more
 * and more enemies are impatient (they act even when the player waits), all of them from the 15th.
 */
export function enemyFor(n: number, rng: Rng, playerModel = ""): EnemySpec {
  const spec = regularEnemy(n, rng, playerModel);
  return n % BOSS_EVERY === 0 ? asBoss(spec, n) : spec;
}

/**
 * The boss keeps the stage's stats with 1 more HP and the reader's brain. At half HP it pulls out
 * two hidden relics (one more each later visit), speeds up by 15 BPM and turns aggressive.
 */
function asBoss(spec: EnemySpec, n: number): EnemySpec {
  const visit = n / BOSS_EVERY;
  const hidden = ["power_bank", "iron_wall", "fang", "boxing_gloves"].slice(0, 1 + visit).map((id) => ENEMY_RELICS.find((r) => r.id === id)!);
  const p = PERSONALITY_TUNING.reader;
  return {
    ...spec,
    personality: "reader",
    elite: true,
    model: BOSS_MODEL,
    color: BOSS_COLOR,
    maxHp: spec.maxHp + visit,
    relics: spec.relics.filter((r) => !hidden.includes(r)),
    ai: { ...spec.ai, readSkill: Math.min(1.3, 0.3 + 0.04 * (n - 1)) * p.readSkill, randomness: spec.ai.randomness * p.randomness, historyWindow: p.historyWindow },
    boss: { relics: hidden, bpmAdd: 15, ai: { ...spec.ai, aggression: spec.ai.aggression * 1.15, randomness: 0.05, readSkill: 1.3, specialBias: 1.2 } },
  };
}

function regularEnemy(n: number, rng: Rng, playerModel: string): EnemySpec {
  const k = n - 1;
  const elite = n % ELITE_EVERY === 0;
  const relicCount = Math.min(MAX_ENEMY_RELICS, Math.max(0, Math.floor((k - 1) / 5)) + (elite && n >= 10 ? 1 : 0));
  const tier = n >= 10 ? 3 : n >= 6 ? 2 : 1;
  const nameIndex = rng.int(0, ENEMY_NAME_COUNT - 1);
  const body = NAME_BODIES[nameIndex];
  const personality = personalityFor(n, rng);
  const p = PERSONALITY_TUNING[personality];
  return {
    nameIndex,
    personality,
    elite,
    chargeBonus: Math.min(1, p.chargeBonus + (n >= STRONG_CHARGE_FROM ? 1 : 0)),
    model: rng.pick((body === "any" ? [...MODELS.male, ...MODELS.female] : MODELS[body]).filter((m) => m !== playerModel)),
    rank: Math.min(RANK_COUNT - 1, Math.floor(k / 3)),
    color: rng.pick(ENEMY_COLORS),
    maxHp: Math.min(11, 3 + Math.floor(k / 5) - (n >= 10 && n < 15 ? 1 : 0) + (elite ? (n >= 10 ? 2 : 1) : 0)),
    maxEnergy: n >= 10 ? 4 : 3,
    startEnergy: n >= 12 ? 2 : n >= 6 ? 1 : 0,
    tellChance: Math.min(0.9, Math.max(0.25, 0.5 - 0.015 * k) * p.tellMult),
    tellAccuracy: Math.max(0.6, 0.8 - 0.015 * k),
    ai: {
      ...DEFAULT_AI,
      aggression: Math.min(1.7, 1.0 + 0.04 * k) * p.aggression * (elite ? 1.05 : 1),
      readSkill: Math.min(1.3, 0.3 + 0.04 * k) * p.readSkill,
      caution: 0.8 * p.caution,
      randomness: Math.min(0.6, Math.max(0.05, 0.35 - 0.02 * k) * p.randomness),
      specialBias: p.specialBias,
      counterBias: p.counterBias,
      historyWindow: p.historyWindow,
    },
    relics: [
      ...rng.shuffle(ENEMY_RELICS.filter((r) => (r.tier ?? 1) <= tier && r.id !== "impatient")).slice(0, relicCount),
      ...(rng.chance(impatientChance(n)) ? ENEMY_RELICS.filter((r) => r.id === "impatient") : []),
    ],
    bpm: Math.min(156, 92 + 3 * k + (elite ? 6 : 0)),
  };
}

export class Run {
  readonly rng: Rng;
  readonly character: Character;
  round = 1;
  hp: number;
  maxHp: number;
  gold: number;
  relics: Relic[];
  slots: (Consumable | null)[] = new Array(SLOTS).fill(null);
  stock: StockEntry[] = [];
  enemy: EnemySpec;
  /** Set once the player chooses to keep going after the goal. */
  endless = false;
  /** Relics on offer from an open chest (an elite's free one or a bought one); empty otherwise. */
  relicPick: Relic[] = [];
  /** Whether this shop visit's chest has been bought. */
  chestSold = false;
  /** An event waiting before the shop, or null. */
  event: EventId | null = null;
  readonly stats: RunStats = { bestCombo: 0, judged: 0, perfects: 0, damageDealt: 0, damageTaken: 0, fevers: 0 };
  /** Called after every purchase and every relic taken from a chest (for item-based unlocks). */
  onPurchase: (item: Item) => void = () => {};

  constructor(seed?: number, character: Character = CHARACTERS[0]) {
    this.rng = new Rng(seed);
    this.character = character;
    this.hp = this.maxHp = character.hp;
    this.gold = character.gold;
    this.relics = startRelics(character);
    startItems(character).forEach((item, i) => (this.slots[i] = item));
    this.enemy = enemyFor(this.round, this.rng, character.model);
  }

  /** Adds a fight's event to the run's stats. */
  record(e: BattleEvent): void {
    const s = this.stats;
    const hurt = (side: "self" | "foe", amount: number, mine: boolean) => {
      if ((side === "foe") === mine) s.damageDealt += amount;
      else s.damageTaken += amount;
    };
    switch (e.type) {
      case "judge":
        s.judged++;
        if (e.grade === "perfect") s.perfects++;
        break;
      case "combo":
        s.bestCombo = Math.max(s.bestCombo, e.combo);
        break;
      case "fever":
        if (e.on) s.fevers++;
        break;
      case "reveal":
        s.damageDealt += e.result.player.damageDealt;
        s.damageTaken += e.result.player.damageTaken;
        break;
      case "notice":
      case "item": {
        const reports = e.type === "notice" ? e.notice.reports : e.reports;
        const mine = e.type === "item" || e.side === "player";
        for (const r of reports) if (r.type === "damage" || r.type === "hurtSelf") hurt(r.side, r.amount, mine);
        break;
      }
    }
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

  /**
   * Returns the gold won; after a win the next enemy is rolled and the shop restocked. Beating an
   * elite doubles the gold and opens a free chest (`relicPick`).
   */
  finishBattle(won: boolean, hpLeft: number): number {
    this.hp = Math.max(0, Math.min(this.maxHp, hpLeft));
    if (!won) return 0;
    const wasElite = this.enemy.elite;
    const gold = this.goldFor(this.round) * (wasElite && !this.enemy.challenger ? 2 : 1);
    this.relicPick = wasElite ? this.rollChest() : [];
    this.gold += gold;
    this.hp = Math.min(this.maxHp, this.hp + VICTORY_HEAL);
    this.round++;
    this.enemy = enemyFor(this.round, this.rng, this.character.model);
    this.rollShop();
    this.event = !wasElite && this.rng.chance(EVENT_CHANCE) ? this.rng.pick(eventPool(this.enemy.elite)) : null;
    return gold;
  }

  rollShop(): void {
    this.stock = this.rng.shuffle(CONSUMABLES).slice(0, 3).map((item) => ({ item, sold: false }));
    this.chestSold = false;
  }

  /** Takes choice `index` of the waiting event; null when there's no event or the choice is blocked. */
  chooseEvent(index: number): EventOutcome | null {
    if (!this.event) return null;
    const choice = EVENTS[this.event][index];
    if (!choice || choice.blocked(this)) return null;
    this.event = null;
    return choice.apply(this, this.rng);
  }

  /** The challenger event: the next fight becomes an elite (tougher; winning opens a free chest). */
  makeNextElite(): void {
    const e = this.enemy;
    if (e.elite) return;
    this.enemy = { ...e, elite: true, challenger: true, maxHp: e.maxHp + (this.round >= 10 ? 3 : 2), bpm: e.bpm + 6, ai: { ...e.ai, aggression: e.ai.aggression * 1.05 } };
  }

  /** Three unowned relics, for a chest. */
  offerChest(): Relic[] {
    return this.rollChest();
  }

  private rollChest(): Relic[] {
    return this.rng.shuffle(RELICS.filter((r) => !this.hasRelic(r.id))).slice(0, RELIC_PICK_SIZE);
  }

  chestPrice(): number {
    return Math.round((CHEST_PRICE * (1 + CHEST_PRICE_STEP * this.relics.length)) / 5) * 5;
  }

  /** Pays for this visit's chest and fills `relicPick`; the player must then `takePick` one. */
  buyChest(): Purchase {
    if (this.chestSold || this.relicPick.length > 0) return "sold_out";
    const offer = this.rollChest();
    if (offer.length === 0) return "sold_out";
    const price = this.chestPrice();
    if (this.gold < price) return "no_gold";
    this.gold -= price;
    this.chestSold = true;
    this.relicPick = offer;
    return "ok";
  }

  hasRelic(id: string): boolean {
    return this.relics.some((r) => r.id === id);
  }

  buy(index: number): Purchase {
    const entry = this.stock[index];
    if (!entry || entry.sold) return "sold_out";
    if (this.gold < entry.item.price) return "no_gold";
    const free = this.slots.indexOf(null);
    if (free < 0) return "bag_full";
    this.slots[free] = entry.item;
    this.gold -= entry.item.price;
    entry.sold = true;
    this.onPurchase(entry.item);
    return "ok";
  }

  /** Takes one relic from the open chest; an out-of-range index takes nothing and keeps it open. */
  takePick(index: number): Relic | null {
    const relic = this.relicPick[index] ?? null;
    if (!relic) return null;
    this.relics.push(relic);
    this.relicPick = [];
    this.onPurchase(relic);
    return relic;
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
