import { ACTIONS, type ActionId, affordable, canAfford, type Fighter } from "./rules";
import type { Rng } from "./rng";

export interface AiParams {
  aggression: number;
  caution: number;
  readSkill: number;
  randomness: number;
  historyWindow: number;
  lowHpRatio: number;
  /** Multiplies the special's weight. */
  specialBias: number;
  /** Added to the attack weight right after this enemy blocked a hit (guard, then strike back). */
  counterBias: number;
}

export const DEFAULT_AI: AiParams = {
  aggression: 1,
  caution: 1,
  readSkill: 1,
  randomness: 0.15,
  historyWindow: 5,
  lowHpRatio: 0.34,
  specialBias: 1,
  counterBias: 0,
};

export type Personality = "brawler" | "guardian" | "charger" | "reader" | "wild";

export const PERSONALITIES: Personality[] = ["brawler", "guardian", "charger", "reader", "wild"];

/**
 * How each personality bends the shared brain. Multipliers apply to the fight's scaled
 * parameters; `chargeBonus` is extra energy per charge and `tellMult` scales the tell chance.
 */
export const PERSONALITY_TUNING: Record<
  Personality,
  { aggression: number; caution: number; readSkill: number; randomness: number; specialBias: number; counterBias: number; historyWindow: number; chargeBonus: number; tellMult: number }
> = {
  brawler: { aggression: 1.4, caution: 0.5, readSkill: 0.8, randomness: 1, specialBias: 0.9, counterBias: 0, historyWindow: 5, chargeBonus: 0, tellMult: 1 },
  guardian: { aggression: 0.8, caution: 1.8, readSkill: 1, randomness: 1, specialBias: 1, counterBias: 1.6, historyWindow: 5, chargeBonus: 0, tellMult: 1 },
  charger: { aggression: 0.8, caution: 1, readSkill: 1, randomness: 1, specialBias: 1.8, counterBias: 0, historyWindow: 5, chargeBonus: 1, tellMult: 1 },
  reader: { aggression: 1, caution: 1, readSkill: 1.8, randomness: 0.5, specialBias: 1, counterBias: 0, historyWindow: 8, chargeBonus: 0, tellMult: 0.8 },
  wild: { aggression: 1.1, caution: 0.8, readSkill: 0.5, randomness: 2.2, specialBias: 1, counterBias: 0, historyWindow: 5, chargeBonus: 0, tellMult: 1.4 },
};

const MIN_WEIGHT = 0.05;

/** Guesses the opponent's next move: what usually follows their last move, else their most frequent. */
export function predict(history: readonly ActionId[], window: number): ActionId | null {
  const recent = history.slice(-window);
  if (recent.length === 0) return null;
  const last = recent[recent.length - 1];
  const follow = new Map<ActionId, number>();
  for (let i = 0; i < recent.length - 1; i++) {
    if (recent[i] === last) follow.set(recent[i + 1], (follow.get(recent[i + 1]) ?? 0) + 1);
  }
  const counts = follow.size > 0 ? follow : tally(recent);
  let best: ActionId | null = null;
  let bestCount = 0;
  let bestAt = -1;
  for (const [action, count] of counts) {
    const at = recent.lastIndexOf(action);
    if (count > bestCount || (count === bestCount && at > bestAt)) {
      best = action;
      bestCount = count;
      bestAt = at;
    }
  }
  return best;
}

function tally(list: readonly ActionId[]): Map<ActionId, number> {
  const m = new Map<ActionId, number>();
  for (const a of list) m.set(a, (m.get(a) ?? 0) + 1);
  return m;
}

/** What the enemy remembers about the last round, for follow-ups. */
export interface AiMemory {
  /** The enemy's last action landed damage on the player. */
  lastHit: boolean;
  /** The enemy's last round blocked the player's attack. */
  lastGuarded?: boolean;
}

/** Moves the enemy may pick. Hard rules: never guard an opponent who can't attack, never charge at full. */
function options(self: Fighter, foe: Fighter): ActionId[] {
  let moves = affordable(self);
  if (!canAfford(foe, "attack")) moves = moves.filter((a) => a !== "guard");
  if (self.energy >= self.maxEnergy) moves = moves.filter((a) => a !== "charge");
  return moves.length > 0 ? moves : ["charge"];
}

/**
 * One enemy brain for everyone, tuned by parameters. Never picks what it can't pay for, never
 * charges at full energy, never guards when the player has no energy to attack with, and guards
 * more when the player is full (a special may be coming).
 */
export function decide(self: Fighter, foe: Fighter, foeHistory: readonly ActionId[], params: AiParams, rng: Rng, memory: AiMemory = { lastHit: false }): ActionId {
  const moves = options(self, foe);
  if (rng.chance(params.randomness)) return rng.pick(moves);
  return weighted(self, foe, foeHistory, params, rng, memory, moves);
}

function weighted(self: Fighter, foe: Fighter, foeHistory: readonly ActionId[], p: AiParams, rng: Rng, memory: AiMemory, moves: ActionId[]): ActionId {
  const threat = canAfford(foe, "attack");
  const foeFull = foe.energy >= foe.maxEnergy;
  let predicted = predict(foeHistory, p.historyWindow);
  if (predicted !== null && !canAfford(foe, predicted)) predicted = null;
  const lowHp = self.hp / self.maxHp <= p.lowHpRatio;
  const expectsHit = predicted === "attack" || predicted === "special";

  const weight: Record<ActionId, number> = {
    charge: 0.7 + (self.energy === 0 ? 0.6 : 0) + (self.energy === 2 ? 0.4 * p.aggression : 0) + (threat ? 0 : 0.5) - (expectsHit ? 0.5 * p.readSkill : 0),
    guard: (0.15 + (threat ? 0.5 * p.caution : 0) + (expectsHit ? 1.0 * p.readSkill : 0)) * (lowHp && threat ? 1.4 : 1) * (foeFull ? 2.5 : 1),
    attack:
      (1.1 +
        (threat ? 0 : 0.7) +
        (predicted === "charge" ? 1.2 * p.readSkill : 0) -
        (predicted === "guard" ? 0.4 * p.readSkill : 0) +
        (memory.lastHit ? 0.8 : 0) +
        (memory.lastGuarded ? p.counterBias : 0)) *
      p.aggression,
    special: (3.2 + (predicted === "guard" || predicted === "charge" ? p.readSkill : 0) + (memory.lastHit ? 0.5 : 0) + (memory.lastGuarded ? p.counterBias : 0)) * p.aggression * p.specialBias,
  };
  return rng.weighted(moves.map((a) => [a, Math.max(MIN_WEIGHT, weight[a])] as [ActionId, number]));
}

export const TELL_WAIT_DECAY = 0.5;

/**
 * Rolls whether the enemy gives away its move this bar, and whether the tell is honest.
 * A lie always names a move the enemy could actually make.
 */
export function rollTell(self: Fighter, real: ActionId, chance: number, accuracy: number, waitsInRow: number, rng: Rng): ActionId | null {
  if (!rng.chance(chance * TELL_WAIT_DECAY ** waitsInRow)) return null;
  if (rng.chance(accuracy)) return real;
  let lies = affordable(self).filter((a) => a !== real);
  if (self.energy >= self.maxEnergy) lies = lies.filter((a) => a !== "charge");
  return lies.length > 0 ? rng.pick(lies) : real;
}

export function isAttack(a: ActionId): boolean {
  return ACTIONS[a].attack > 0;
}
