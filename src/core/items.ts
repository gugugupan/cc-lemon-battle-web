import type { ActionId, CostAdjust, Fighter, RoundResult } from "./rules";
import { clamp } from "./rules";

/** `foe_fever_*` fire for the other side's relics when this side's FEVER starts or ends. */
export type Trigger =
  | "battle_start"
  | "round"
  | "perfect"
  | "clash"
  | "hit"
  | "guarded"
  | "damaged"
  | "wait"
  | "fever_start"
  | "fever_end"
  | "foe_fever_start"
  | "foe_fever_end";

export type Condition =
  | { type: "everyNth"; n: number }
  | { type: "inFever" }
  | { type: "foeInFever" }
  | { type: "perfectAction" }
  | { type: "used"; action: ActionId }
  | { type: "perfectStreakEvery"; n: number }
  | { type: "comboEvery"; n: number }
  /** The side's previous round (a wait counts as a round) was this action. */
  | { type: "prev"; action: ActionId }
  /** This action has now been used this many times in a row (every n-th time). */
  | { type: "chainEvery"; action: ActionId; n: number }
  /** Before this round, the side had used this action at least n times in a row. */
  | { type: "prevChain"; action: ActionId; n: number }
  | { type: "foeUsed"; action: ActionId }
  /** The side's attack was stopped by a guard this round. */
  | { type: "blocked" }
  | { type: "hasEnergy"; n: number }
  /** The side charged while already at full energy. */
  | { type: "chargedAtFull" }
  | { type: "hpBelow"; ratio: number }
  | { type: "once" }
  | { type: "upTo"; n: number };

export type Effect =
  | { type: "damage"; amount: number }
  | { type: "heal"; amount: number; fill?: boolean }
  | { type: "energy"; amount: number; fill?: boolean }
  | { type: "hurtSelf"; amount: number }
  | { type: "drain"; amount: number }
  /** Pays energy from the side's own pool. */
  | { type: "spend"; amount: number }
  /** The side's next landed action hit this bar deals this much more. */
  | { type: "buffNextHit"; amount: number }
  /** The side takes no damage from this bar's round. */
  | { type: "shieldNext" }
  /** Next call bar shows a tell no matter the chance (it can still be a lie). */
  | { type: "tellNext" }
  | { type: "nullify" }
  | { type: "trueTell" };

/**
 * Rule changes a side's relics make. Some fields always describe the player or the enemy,
 * whichever side carries the relic: tell fields are about the *enemy's* tells (the player's diary
 * sharpens them, the enemy's poker face muddies them), and the Perfect window and FEVER threshold
 * are the *player's* (a metronome widens it, an enemy's pressure narrows it).
 */
export interface Modifiers {
  maxEnergyAdd: number;
  /** The carrier's max HP. */
  maxHpAdd: number;
  perfectWindowMult: number;
  tellChanceMult: number;
  tellAccuracyAdd: number;
  /** A tell every call bar, ignoring the chance (it can still be a lie). */
  alwaysTell: boolean;
  canGuard: boolean;
  feverThresholdAdd: number;
  /** Added to this side's action damage whenever it lands. */
  damageBonus: number;
  /** Like `damageBonus`, only while in FEVER. */
  feverDamageBonus: number;
  /** Like `damageBonus`, only while the *other* side is in FEVER. */
  damageVsFeverAdd: number;
  /** A guard by this side also stops this much extra attack (1 = blocks the special). */
  guardDefenseAdd: number;
  /** Fight tempo: (base + add) × mult. */
  bpmAdd: number;
  bpmMult: number;
  /** Carried by an enemy: the player can't use consumables this fight. */
  locksItems: boolean;
  /** Carried by the player: every resolved action is followed by a 4-beat rest bar. */
  restBars: boolean;
  /** Carried by the player: added to the special's energy cost. */
  specialCostAdd: number;
}

export const NEUTRAL_MODS: Modifiers = {
  maxEnergyAdd: 0,
  maxHpAdd: 0,
  perfectWindowMult: 1,
  tellChanceMult: 1,
  tellAccuracyAdd: 0,
  alwaysTell: false,
  canGuard: true,
  feverThresholdAdd: 0,
  damageBonus: 0,
  feverDamageBonus: 0,
  damageVsFeverAdd: 0,
  guardDefenseAdd: 0,
  bpmAdd: 0,
  bpmMult: 1,
  locksItems: false,
  restBars: false,
  specialCostAdd: 0,
};

/** Build families for the player's items; shown in the shop and tooltips. */
export type Series = "general" | "combo" | "guard" | "charge" | "special" | "wait" | "tell" | "fever";

export const SERIES: Series[] = ["general", "combo", "guard", "charge", "special", "wait", "tell", "fever"];

interface ItemBase {
  id: string;
  icon: string;
  price: number;
  /** Player items only. */
  series?: Series;
  /** Enemy relics: the earliest stage of the run (1–3) they can show up in. */
  tier?: number;
}

export interface Consumable extends ItemBase {
  kind: "consumable";
  use: Effect[];
  perfect?: Effect[];
  fever?: Effect[];
}

export interface RelicTrigger {
  on: Trigger;
  when?: Condition[];
  effects: Effect[];
}

export interface Relic extends ItemBase {
  kind: "relic";
  mods?: Partial<Modifiers>;
  triggers?: RelicTrigger[];
}

export type Item = Consumable | Relic;

export const CONSUMABLES: Consumable[] = [
  { id: "lemon_bomb", series: "general", kind: "consumable", icon: "💣", price: 25, use: [{ type: "damage", amount: 1 }], perfect: [{ type: "damage", amount: 1 }], fever: [{ type: "damage", amount: 2 }] },
  { id: "bandage", series: "general", kind: "consumable", icon: "🩹", price: 25, use: [{ type: "heal", amount: 1 }], perfect: [{ type: "heal", amount: 1 }], fever: [{ type: "heal", amount: 0, fill: true }] },
  { id: "ramune", series: "charge", kind: "consumable", icon: "🥤", price: 20, use: [{ type: "energy", amount: 1 }], perfect: [{ type: "energy", amount: 1 }], fever: [{ type: "energy", amount: 0, fill: true }] },
  { id: "pause", series: "guard", kind: "consumable", icon: "⏸️", price: 35, use: [{ type: "nullify" }] },
  { id: "wraps", series: "combo", kind: "consumable", icon: "🎗️", price: 20, use: [{ type: "buffNextHit", amount: 1 }], fever: [{ type: "buffNextHit", amount: 1 }] },
  { id: "shield_sticker", series: "guard", kind: "consumable", icon: "🔰", price: 30, use: [{ type: "shieldNext" }] },
  { id: "honey_lemon", series: "charge", kind: "consumable", icon: "🍯", price: 30, use: [{ type: "heal", amount: 1 }, { type: "energy", amount: 1 }], perfect: [{ type: "energy", amount: 1 }] },
];

export const RELICS: Relic[] = [
  {
    id: "cold_lemon",
    series: "general",
    kind: "relic",
    icon: "🍋",
    price: 40,
    triggers: [
      { on: "battle_start", effects: [{ type: "energy", amount: 1 }] },
      { on: "damaged", when: [{ type: "hpBelow", ratio: 0.5 }, { type: "once" }], effects: [{ type: "heal", amount: 1 }] },
    ],
  },
  { id: "big_bottle", series: "charge", kind: "relic", icon: "🧃", price: 60, mods: { maxEnergyAdd: 1 }, triggers: [{ on: "battle_start", effects: [{ type: "energy", amount: 2 }] }] },
  { id: "diary", series: "tell", kind: "relic", icon: "📓", price: 55, mods: { tellChanceMult: 1.5, tellAccuracyAdd: 0.1 } },
  { id: "xray", series: "tell", kind: "relic", icon: "👓", price: 65, mods: { alwaysTell: true } },
  { id: "eco", series: "combo", kind: "relic", icon: "♻️", price: 55, triggers: [{ on: "round", when: [{ type: "used", action: "attack" }, { type: "everyNth", n: 3 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "soda_bubbles", series: "fever", kind: "relic", icon: "🫧", price: 60, triggers: [{ on: "perfect", when: [{ type: "perfectStreakEvery", n: 4 }], effects: [{ type: "heal", amount: 1 }] }] },
  { id: "cheer_flag", series: "fever", kind: "relic", icon: "🚩", price: 55, triggers: [{ on: "round", when: [{ type: "comboEvery", n: 6 }, { type: "upTo", n: 2 }], effects: [{ type: "heal", amount: 1 }] }] },
  { id: "metronome", series: "fever", kind: "relic", icon: "⏱️", price: 50, mods: { perfectWindowMult: 1.5 }, triggers: [{ on: "perfect", when: [{ type: "perfectStreakEvery", n: 3 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "double_time", series: "general", kind: "relic", icon: "⏩", price: 70, mods: { bpmMult: 2, damageBonus: 1 } },
  { id: "tea_break", series: "general", kind: "relic", icon: "🍵", price: 30, mods: { restBars: true } },
  { id: "hot_blood", series: "fever", kind: "relic", icon: "🔥", price: 55, mods: { feverDamageBonus: 1 }, triggers: [{ on: "fever_end", effects: [{ type: "hurtSelf", amount: 1 }] }] },
  { id: "follow_up", series: "combo", kind: "relic", icon: "⏭️", price: 35, triggers: [{ on: "hit", when: [{ type: "used", action: "attack" }, { type: "prev", action: "attack" }, { type: "foeUsed", action: "charge" }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "persistence", series: "combo", kind: "relic", icon: "💪", price: 30, triggers: [{ on: "round", when: [{ type: "used", action: "attack" }, { type: "prev", action: "attack" }, { type: "blocked" }, { type: "upTo", n: 2 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "triple", series: "combo", kind: "relic", icon: "3️⃣", price: 50, triggers: [{ on: "hit", when: [{ type: "chainEvery", action: "attack", n: 3 }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "finisher", series: "combo", kind: "relic", icon: "🏁", price: 45, triggers: [{ on: "hit", when: [{ type: "used", action: "special" }, { type: "prevChain", action: "attack", n: 2 }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "counter", series: "guard", kind: "relic", icon: "↩️", price: 55, triggers: [{ on: "guarded", when: [{ type: "hasEnergy", n: 1 }], effects: [{ type: "spend", amount: 1 }, { type: "damage", amount: 1 }] }] },
  { id: "standoff", series: "guard", kind: "relic", icon: "🤝", price: 45, triggers: [{ on: "round", when: [{ type: "used", action: "guard" }, { type: "foeUsed", action: "guard" }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "wristguard", series: "guard", kind: "relic", icon: "🦾", price: 55, mods: { guardDefenseAdd: 1 } },
  { id: "patience", series: "guard", kind: "relic", icon: "🧘", price: 30, triggers: [{ on: "hit", when: [{ type: "used", action: "attack" }, { type: "prevChain", action: "guard", n: 2 }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "breathing", series: "charge", kind: "relic", icon: "🌬️", price: 55, triggers: [{ on: "round", when: [{ type: "used", action: "charge" }, { type: "everyNth", n: 2 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "spring", series: "charge", kind: "relic", icon: "🌀", price: 45, triggers: [{ on: "damaged", when: [{ type: "used", action: "charge" }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "overflow", series: "charge", kind: "relic", icon: "⛲", price: 45, triggers: [{ on: "round", when: [{ type: "chargedAtFull" }, { type: "upTo", n: 3 }], effects: [{ type: "heal", amount: 1 }] }] },
  { id: "amp", series: "special", kind: "relic", icon: "🔊", price: 55, triggers: [{ on: "hit", when: [{ type: "used", action: "special" }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "discount", series: "special", kind: "relic", icon: "🏷️", price: 65, mods: { specialCostAdd: -1 } },
  { id: "guard_crush", series: "special", kind: "relic", icon: "🔨", price: 35, triggers: [{ on: "hit", when: [{ type: "used", action: "special" }, { type: "foeUsed", action: "guard" }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "composure", series: "wait", kind: "relic", icon: "🍃", price: 40, triggers: [{ on: "wait", when: [{ type: "upTo", n: 3 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "detective", series: "wait", kind: "relic", icon: "🕵️", price: 55, triggers: [{ on: "wait", effects: [{ type: "tellNext" }] }] },
];

/** Relics only enemies carry; the endless run hands them out as enemies grow, stronger tiers later. */
export const ENEMY_RELICS: Relic[] = [
  { id: "class_log", kind: "relic", icon: "📒", price: 0, tier: 1, triggers: [{ on: "battle_start", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "armband", kind: "relic", icon: "🛡️", price: 0, tier: 1, triggers: [{ on: "guarded", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "amulet", kind: "relic", icon: "🧿", price: 0, tier: 1, triggers: [{ on: "damaged", when: [{ type: "hpBelow", ratio: 0.5 }, { type: "once" }], effects: [{ type: "heal", amount: 2 }] }] },
  { id: "spikes", kind: "relic", icon: "🌵", price: 0, tier: 1, triggers: [{ on: "guarded", when: [{ type: "everyNth", n: 2 }], effects: [{ type: "damage", amount: 1 }] }] },
  { id: "onigiri", kind: "relic", icon: "🍙", price: 0, tier: 1, triggers: [{ on: "round", when: [{ type: "everyNth", n: 4 }], effects: [{ type: "heal", amount: 1 }] }] },
  { id: "alarm_clock", kind: "relic", icon: "⏰", price: 0, tier: 1, triggers: [{ on: "wait", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "mirror", kind: "relic", icon: "🪞", price: 0, tier: 1, triggers: [{ on: "clash", effects: [{ type: "damage", amount: 1 }] }] },
  { id: "boo", kind: "relic", icon: "📢", price: 0, tier: 1, triggers: [{ on: "foe_fever_start", effects: [{ type: "energy", amount: 2 }] }] },
  { id: "grudge", kind: "relic", icon: "😤", price: 0, tier: 1, triggers: [{ on: "foe_fever_end", effects: [{ type: "heal", amount: 2 }] }] },
  { id: "iron_wall", kind: "relic", icon: "🧱", price: 0, tier: 2, mods: { guardDefenseAdd: 1 } },
  { id: "extinguisher", kind: "relic", icon: "🧯", price: 0, tier: 2, triggers: [{ on: "foe_fever_start", effects: [{ type: "drain", amount: 9 }] }] },
  { id: "rain_cloud", kind: "relic", icon: "🌧️", price: 0, tier: 2, triggers: [{ on: "round", when: [{ type: "foeInFever" }, { type: "everyNth", n: 2 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "poker_face", kind: "relic", icon: "🃏", price: 0, tier: 2, mods: { tellAccuracyAdd: -0.4 } },
  { id: "allegro", kind: "relic", icon: "🎵", price: 0, tier: 2, mods: { bpmAdd: 20 } },
  { id: "power_bank", kind: "relic", icon: "🔋", price: 0, tier: 2, mods: { maxEnergyAdd: 1 }, triggers: [{ on: "battle_start", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "magnet", kind: "relic", icon: "🧲", price: 0, tier: 2, triggers: [{ on: "guarded", effects: [{ type: "drain", amount: 1 }] }] },
  { id: "backpack", kind: "relic", icon: "🎒", price: 0, tier: 2, mods: { maxHpAdd: 2 } },
  { id: "mask", kind: "relic", icon: "🎭", price: 0, tier: 2, mods: { tellChanceMult: 0 } },
  { id: "fang", kind: "relic", icon: "🧛", price: 0, tier: 2, triggers: [{ on: "hit", effects: [{ type: "heal", amount: 1 }] }] },
  { id: "silence", kind: "relic", icon: "🔇", price: 0, tier: 3, mods: { locksItems: true } },
  { id: "boxing_gloves", kind: "relic", icon: "🥊", price: 0, tier: 3, mods: { damageBonus: 1 } },
  { id: "pressure", kind: "relic", icon: "😰", price: 0, tier: 3, mods: { perfectWindowMult: 0.7 } },
  { id: "yawn", kind: "relic", icon: "🥱", price: 0, tier: 3, mods: { feverThresholdAdd: 4 } },
  { id: "mark", kind: "relic", icon: "🎯", price: 0, tier: 3, mods: { damageVsFeverAdd: 1 } },
  { id: "cold_shoulder", kind: "relic", icon: "🥶", price: 0, tier: 3, triggers: [{ on: "foe_fever_end", effects: [{ type: "damage", amount: 1 }, { type: "energy", amount: 1 }] }] },
];

export const ALL_ITEMS: Item[] = [...CONSUMABLES, ...RELICS, ...ENEMY_RELICS];

export function itemById(id: string): Item {
  const item = ALL_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`unknown item ${id}`);
  return item;
}

export function combineMods(relics: readonly Relic[]): Modifiers {
  const m = { ...NEUTRAL_MODS };
  for (const r of relics) {
    if (!r.mods) continue;
    m.maxEnergyAdd += r.mods.maxEnergyAdd ?? 0;
    m.maxHpAdd += r.mods.maxHpAdd ?? 0;
    m.perfectWindowMult *= r.mods.perfectWindowMult ?? 1;
    m.tellChanceMult *= r.mods.tellChanceMult ?? 1;
    m.tellAccuracyAdd += r.mods.tellAccuracyAdd ?? 0;
    m.alwaysTell ||= r.mods.alwaysTell ?? false;
    m.canGuard &&= r.mods.canGuard ?? true;
    m.feverThresholdAdd += r.mods.feverThresholdAdd ?? 0;
    m.damageBonus += r.mods.damageBonus ?? 0;
    m.feverDamageBonus += r.mods.feverDamageBonus ?? 0;
    m.damageVsFeverAdd += r.mods.damageVsFeverAdd ?? 0;
    m.guardDefenseAdd += r.mods.guardDefenseAdd ?? 0;
    m.bpmAdd += r.mods.bpmAdd ?? 0;
    m.bpmMult *= r.mods.bpmMult ?? 1;
    m.locksItems ||= r.mods.locksItems ?? false;
    m.restBars ||= r.mods.restBars ?? false;
    m.specialCostAdd += r.mods.specialCostAdd ?? 0;
  }
  return m;
}

/** What an effect did, for the view to show. `side` is who the effect landed on. */
export interface EffectReport {
  type: Effect["type"];
  amount: number;
  fill: boolean;
  side: "self" | "foe";
}

export interface EffectContext {
  self: Fighter;
  foe: Fighter;
  /** From `self`'s point of view; null outside round events. */
  round: RoundResult | null;
  perfectStreak: number;
  /** The side's rounds so far, oldest first, including this one; waits are recorded as "wait". */
  history: (ActionId | "wait")[];
  /** Actions in a row (only the player has a combo; enemy relics see 0). */
  combo: number;
  fever: boolean;
  /** Whether the other side is in FEVER (only the player can be, so this is for enemy relics). */
  foeFever: boolean;
  requests: { nullify: boolean; trueTell: boolean; hitBonus: number; shield: boolean; tellNext: boolean };
}

export function applyEffect(effect: Effect, ctx: EffectContext): EffectReport {
  const report: EffectReport = { type: effect.type, amount: 0, fill: false, side: "self" };
  switch (effect.type) {
    case "damage":
      report.side = "foe";
      report.amount = Math.min(effect.amount, ctx.foe.hp);
      ctx.foe.hp -= report.amount;
      break;
    case "heal": {
      const before = ctx.self.hp;
      ctx.self.hp = effect.fill ? ctx.self.maxHp : clamp(ctx.self.hp + effect.amount, 0, ctx.self.maxHp);
      report.amount = ctx.self.hp - before;
      report.fill = !!effect.fill;
      break;
    }
    case "energy": {
      const before = ctx.self.energy;
      ctx.self.energy = effect.fill ? ctx.self.maxEnergy : clamp(ctx.self.energy + effect.amount, 0, ctx.self.maxEnergy);
      report.amount = ctx.self.energy - before;
      report.fill = !!effect.fill;
      break;
    }
    case "spend": {
      const before = ctx.self.energy;
      ctx.self.energy = Math.max(0, ctx.self.energy - effect.amount);
      report.amount = before - ctx.self.energy;
      break;
    }
    case "buffNextHit":
      ctx.requests.hitBonus += effect.amount;
      report.amount = effect.amount;
      break;
    case "shieldNext":
      ctx.requests.shield = true;
      break;
    case "tellNext":
      ctx.requests.tellNext = true;
      break;
    case "drain":
      report.side = "foe";
      report.amount = Math.min(effect.amount, ctx.foe.energy);
      ctx.foe.energy -= report.amount;
      break;
    case "hurtSelf":
      report.amount = Math.min(effect.amount, ctx.self.hp);
      ctx.self.hp -= report.amount;
      break;
    case "nullify":
      ctx.requests.nullify = true;
      break;
    case "trueTell":
      ctx.requests.trueTell = true;
      break;
  }
  return report;
}

export interface Notice {
  item: Item;
  reports: EffectReport[];
}

/** Runs one side's relics. Counters live here, so each fight starts fresh. */
export class RelicRunner {
  private counters = new Map<string, number>();

  constructor(private relics: readonly Relic[]) {}

  fire(event: Trigger, ctx: EffectContext): Notice[] {
    const notices: Notice[] = [];
    for (const relic of this.relics) {
      (relic.triggers ?? []).forEach((trigger, index) => {
        if (trigger.on !== event) return;
        const key = `${relic.id}:${index}`;
        if (!(trigger.when ?? []).every((c) => this.check(c, key, ctx))) return;
        notices.push({ item: relic, reports: trigger.effects.map((e) => applyEffect(e, ctx)) });
      });
    }
    return notices;
  }

  /** Conditions are checked in order and stop at the first failure, so counters only see earlier passes. */
  private check(c: Condition, key: string, ctx: EffectContext): boolean {
    switch (c.type) {
      case "everyNth": {
        const count = (this.counters.get(key) ?? 0) + 1;
        this.counters.set(key, count);
        return count % c.n === 0;
      }
      case "inFever":
        return ctx.fever;
      case "foeInFever":
        return ctx.foeFever;
      case "perfectAction":
        return ctx.round?.player.grade === "perfect";
      case "used":
        return ctx.round?.player.action === c.action && !ctx.round.player.whiffed;
      case "prev":
        return ctx.history.length >= 2 && ctx.history[ctx.history.length - 2] === c.action;
      case "chainEvery": {
        const n = streak(ctx.history, c.action);
        return n > 0 && n % c.n === 0;
      }
      case "prevChain":
        return streak(ctx.history.slice(0, -1), c.action) >= c.n;
      case "foeUsed":
        return ctx.round?.enemy.action === c.action && !ctx.round.enemy.whiffed;
      case "blocked":
        return !!ctx.round?.player.blocked;
      case "hasEnergy":
        return ctx.self.energy >= c.n;
      case "chargedAtFull":
        return ctx.round?.player.action === "charge" && !ctx.round.player.whiffed && ctx.round.player.energyBefore >= ctx.self.maxEnergy;
      case "comboEvery":
        return ctx.combo > 0 && ctx.combo % c.n === 0;
      case "perfectStreakEvery":
        return ctx.perfectStreak > 0 && ctx.perfectStreak % c.n === 0;
      case "hpBelow":
        return ctx.self.hp / ctx.self.maxHp <= c.ratio;
      case "upTo": {
        const countKey = `${key}:upTo`;
        const count = this.counters.get(countKey) ?? 0;
        if (count >= c.n) return false;
        this.counters.set(countKey, count + 1);
        return true;
      }
      case "once": {
        const onceKey = `${key}:once`;
        if (this.counters.has(onceKey)) return false;
        this.counters.set(onceKey, 1);
        return true;
      }
    }
  }
}

function streak(history: readonly (ActionId | "wait")[], action: ActionId): number {
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === action; i--) n++;
  return n;
}

/** The player's action costs after their relics. */
export function costAdjust(mods: Modifiers): CostAdjust {
  return mods.specialCostAdd ? { special: mods.specialCostAdd } : {};
}

export function useConsumable(item: Consumable, perfect: boolean, ctx: EffectContext): EffectReport[] {
  const effects = [...item.use, ...(perfect ? item.perfect ?? [] : []), ...(ctx.fever ? item.fever ?? [] : [])];
  return effects.map((e) => applyEffect(e, ctx));
}

/** Round events in firing order, from the given side's point of view. */
export function roundEvents(r: RoundResult): Trigger[] {
  const events: Trigger[] = ["round"];
  if (r.clash) events.push("clash");
  if (r.player.damageDealt > 0) events.push("hit");
  if (r.player.guarded) events.push("guarded");
  if (r.player.damageTaken > 0) events.push("damaged");
  return events;
}
