import type { ActionId, Fighter, RoundResult } from "./rules";
import { clamp } from "./rules";

export type Trigger = "battle_start" | "round" | "perfect" | "clash" | "hit" | "guarded" | "damaged" | "fever_start";

export type Condition =
  | { type: "everyNth"; n: number }
  | { type: "inFever" }
  | { type: "perfectAction" }
  | { type: "used"; action: ActionId }
  | { type: "perfectStreakEvery"; n: number }
  | { type: "hpBelow"; ratio: number }
  | { type: "once" };

export type Effect =
  | { type: "damage"; amount: number }
  | { type: "heal"; amount: number; fill?: boolean }
  | { type: "energy"; amount: number; fill?: boolean }
  | { type: "nullify" }
  | { type: "trueTell" };

export interface Modifiers {
  maxEnergyAdd: number;
  perfectWindowMult: number;
  tellChanceMult: number;
  tellAccuracyAdd: number;
  canGuard: boolean;
  feverThresholdAdd: number;
}

export const NEUTRAL_MODS: Modifiers = {
  maxEnergyAdd: 0,
  perfectWindowMult: 1,
  tellChanceMult: 1,
  tellAccuracyAdd: 0,
  canGuard: true,
  feverThresholdAdd: 0,
};

interface ItemBase {
  id: string;
  icon: string;
  price: number;
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
  { id: "lemon_bomb", kind: "consumable", icon: "💣", price: 25, use: [{ type: "damage", amount: 1 }], perfect: [{ type: "damage", amount: 1 }], fever: [{ type: "damage", amount: 2 }] },
  { id: "bandage", kind: "consumable", icon: "🩹", price: 25, use: [{ type: "heal", amount: 1 }], perfect: [{ type: "heal", amount: 1 }], fever: [{ type: "heal", amount: 0, fill: true }] },
  { id: "ramune", kind: "consumable", icon: "🥤", price: 20, use: [{ type: "energy", amount: 1 }], perfect: [{ type: "energy", amount: 1 }], fever: [{ type: "energy", amount: 0, fill: true }] },
  { id: "pause", kind: "consumable", icon: "⏸️", price: 35, use: [{ type: "nullify" }] },
  { id: "xray", kind: "consumable", icon: "👓", price: 30, use: [{ type: "trueTell" }] },
];

export const RELICS: Relic[] = [
  { id: "cold_lemon", kind: "relic", icon: "🍋", price: 40, triggers: [{ on: "battle_start", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "big_bottle", kind: "relic", icon: "🧃", price: 60, mods: { maxEnergyAdd: 1 }, triggers: [{ on: "battle_start", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "diary", kind: "relic", icon: "📓", price: 50, mods: { tellChanceMult: 2, tellAccuracyAdd: 0.15 } },
  { id: "eco", kind: "relic", icon: "♻️", price: 55, triggers: [{ on: "round", when: [{ type: "used", action: "attack" }, { type: "everyNth", n: 3 }], effects: [{ type: "energy", amount: 1 }] }] },
  { id: "soda_bubbles", kind: "relic", icon: "🫧", price: 60, triggers: [{ on: "perfect", when: [{ type: "perfectStreakEvery", n: 4 }], effects: [{ type: "heal", amount: 1 }] }] },
  { id: "cheer_flag", kind: "relic", icon: "🚩", price: 55, triggers: [{ on: "fever_start", effects: [{ type: "heal", amount: 2 }] }] },
  { id: "metronome", kind: "relic", icon: "⏱️", price: 50, mods: { perfectWindowMult: 1.2 } },
];

/** Relics only enemies carry; the endless run hands them out as enemies grow. */
export const ENEMY_RELICS: Relic[] = [
  { id: "class_log", kind: "relic", icon: "📒", price: 0, triggers: [{ on: "battle_start", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "armband", kind: "relic", icon: "🛡️", price: 0, triggers: [{ on: "guarded", effects: [{ type: "energy", amount: 1 }] }] },
  { id: "amulet", kind: "relic", icon: "🧿", price: 0, triggers: [{ on: "damaged", when: [{ type: "hpBelow", ratio: 0.5 }, { type: "once" }], effects: [{ type: "heal", amount: 2 }] }] },
  { id: "spikes", kind: "relic", icon: "🌵", price: 0, triggers: [{ on: "guarded", when: [{ type: "everyNth", n: 2 }], effects: [{ type: "damage", amount: 1 }] }] },
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
    m.perfectWindowMult *= r.mods.perfectWindowMult ?? 1;
    m.tellChanceMult *= r.mods.tellChanceMult ?? 1;
    m.tellAccuracyAdd += r.mods.tellAccuracyAdd ?? 0;
    m.canGuard &&= r.mods.canGuard ?? true;
    m.feverThresholdAdd += r.mods.feverThresholdAdd ?? 0;
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
  fever: boolean;
  requests: { nullify: boolean; trueTell: boolean };
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
      case "perfectAction":
        return ctx.round?.player.grade === "perfect";
      case "used":
        return ctx.round?.player.action === c.action && !ctx.round.player.whiffed;
      case "perfectStreakEvery":
        return ctx.perfectStreak > 0 && ctx.perfectStreak % c.n === 0;
      case "hpBelow":
        return ctx.self.hp / ctx.self.maxHp <= c.ratio;
      case "once": {
        const onceKey = `${key}:once`;
        if (this.counters.has(onceKey)) return false;
        this.counters.set(onceKey, 1);
        return true;
      }
    }
  }
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
