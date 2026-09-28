import { ACTIONS, type ActionId, affordable, canAfford, type Fighter } from "./rules";
import type { Rng } from "./rng";

export interface AiParams {
  aggression: number;
  caution: number;
  readSkill: number;
  randomness: number;
  historyWindow: number;
  lowHpRatio: number;
}

export const DEFAULT_AI: AiParams = {
  aggression: 1,
  caution: 1,
  readSkill: 1,
  randomness: 0.15,
  historyWindow: 5,
  lowHpRatio: 0.34,
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

/**
 * One enemy brain for everyone, tuned by parameters. Never picks what it can't pay for and never
 * charges at full energy.
 */
export function decide(self: Fighter, foe: Fighter, foeHistory: readonly ActionId[], params: AiParams, rng: Rng): ActionId {
  let choice: ActionId;
  if (rng.chance(params.randomness)) {
    choice = rng.pick(affordable(self));
  } else {
    choice = weighted(self, foe, foeHistory, params, rng);
  }
  if (!canAfford(self, choice)) choice = "charge";
  if (choice === "charge" && self.energy >= self.maxEnergy) {
    choice = rng.pick(affordable(self).filter((a) => a !== "charge"));
  }
  return choice;
}

function weighted(self: Fighter, foe: Fighter, foeHistory: readonly ActionId[], p: AiParams, rng: Rng): ActionId {
  const threat = canAfford(foe, "attack");
  let predicted = predict(foeHistory, p.historyWindow);
  if (predicted !== null && !canAfford(foe, predicted)) predicted = null;
  const lowHp = self.hp / self.maxHp <= p.lowHpRatio;
  const expectsHit = predicted === "attack" || predicted === "special";

  const weights: [ActionId, number][] = [];
  if (self.energy < self.maxEnergy) {
    weights.push(["charge", 1 + (threat ? 0 : 1) - (expectsHit ? 0.6 * p.readSkill : 0)]);
  }
  let guard = 0.2 + (threat ? 0.8 * p.caution : 0) + (expectsHit ? 1.2 * p.readSkill : 0);
  if (lowHp && threat) guard *= 1.5;
  weights.push(["guard", guard]);
  if (canAfford(self, "attack")) {
    let attack = 0.6 + (threat ? 0 : 0.6);
    if (predicted === "charge") attack += 1.2 * p.readSkill;
    if (predicted === "guard") attack -= 0.5 * p.readSkill;
    weights.push(["attack", attack * p.aggression]);
  }
  if (canAfford(self, "special")) {
    const special = 1.5 + (predicted === "guard" || predicted === "charge" ? p.readSkill : 0);
    weights.push(["special", special * p.aggression]);
  }
  return rng.weighted(weights.map(([a, w]) => [a, Math.max(MIN_WEIGHT, w)] as [ActionId, number]));
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
