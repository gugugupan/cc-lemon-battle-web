export type ActionId = "attack" | "guard" | "charge" | "special";

export interface ActionDef {
  id: ActionId;
  /** Negative cost gives energy. */
  cost: number;
  attack: number;
  defense: number;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  attack: { id: "attack", cost: 1, attack: 1, defense: 0 },
  guard: { id: "guard", cost: 0, attack: 0, defense: 1 },
  charge: { id: "charge", cost: -1, attack: 0, defense: 0 },
  special: { id: "special", cost: 3, attack: 2, defense: 0 },
};

export const ACTION_IDS: ActionId[] = ["attack", "guard", "charge", "special"];

export interface Fighter {
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
}

export type CostAdjust = Partial<Record<ActionId, number>>;

export function costOf(action: ActionId, adjust: CostAdjust = {}): number {
  return ACTIONS[action].cost + (adjust[action] ?? 0);
}

export function canAfford(f: Fighter, action: ActionId, adjust: CostAdjust = {}): boolean {
  return costOf(action, adjust) <= f.energy;
}

export function affordable(f: Fighter): ActionId[] {
  return ACTION_IDS.filter((a) => canAfford(f, a));
}

export type Grade = "perfect" | "good" | "miss";

export const PERFECT_WINDOW = 0.05;
export const GOOD_WINDOW = 0.11;

export function judge(deltaSeconds: number, perfectMult = 1): Grade {
  const d = Math.abs(deltaSeconds);
  if (d <= PERFECT_WINDOW * perfectMult) return "perfect";
  if (d <= GOOD_WINDOW) return "good";
  return "miss";
}

export interface SideOutcome {
  action: ActionId;
  whiffed: boolean;
  nullified: boolean;
  damageDealt: number;
  damageTaken: number;
  blocked: boolean;
  guarded: boolean;
  grade: Grade | null;
  /** Energy before paying for this round's action. */
  energyBefore: number;
}

export type Winner = "player" | "enemy" | "draw" | null;

export interface RoundResult {
  player: SideOutcome;
  enemy: SideOutcome;
  clash: boolean;
}

export interface RoundRules {
  playerDamageMult: number;
  /** Added to each side's damage when its hit lands. */
  playerDamageBonus: number;
  enemyDamageBonus: number;
  /** Extra defense a side's guard gives. */
  playerGuardBonus: number;
  enemyGuardBonus: number;
  playerCanGuard: boolean;
  enemyNullified: boolean;
  /** Changes to what the player's actions cost (e.g. a cheaper special). */
  playerCostAdjust: CostAdjust;
  /** The player takes no damage this round. */
  playerShielded: boolean;
  /** Extra energy the enemy gains when it charges. */
  enemyChargeBonus: number;
}

export const DEFAULT_RULES: RoundRules = {
  playerDamageMult: 1,
  playerDamageBonus: 0,
  enemyDamageBonus: 0,
  playerGuardBonus: 0,
  enemyGuardBonus: 0,
  playerCanGuard: true,
  enemyNullified: false,
  playerCostAdjust: {},
  playerShielded: false,
  enemyChargeBonus: 0,
};

function side(action: ActionId, energyBefore: number): SideOutcome {
  return { action, whiffed: false, nullified: false, damageDealt: 0, damageTaken: 0, blocked: false, guarded: false, grade: null, energyBefore };
}

/**
 * Both sides pay first; an action that can't be paid (or is locked / nullified) whiffs as 0/0.
 * Two attacks clash and only the difference lands; otherwise each side hits for attack − defense.
 */
export function resolve(p: Fighter, pa: ActionId, e: Fighter, ea: ActionId, partial: Partial<RoundRules> = {}): RoundResult {
  const rules = { ...DEFAULT_RULES, ...partial };
  const ps = side(pa, p.energy);
  const es = side(ea, e.energy);
  ps.whiffed = !canAfford(p, pa, rules.playerCostAdjust) || (pa === "guard" && !rules.playerCanGuard);
  es.nullified = rules.enemyNullified;
  es.whiffed = es.nullified || !canAfford(e, ea);

  if (!ps.whiffed) p.energy = clamp(p.energy - costOf(pa, rules.playerCostAdjust), 0, p.maxEnergy);
  if (!es.whiffed) e.energy = clamp(e.energy - costOf(ea) + (ea === "charge" ? rules.enemyChargeBonus : 0), 0, e.maxEnergy);

  const pAtk = ps.whiffed ? 0 : ACTIONS[pa].attack;
  const pDef = ps.whiffed ? 0 : ACTIONS[pa].defense + (pa === "guard" ? rules.playerGuardBonus : 0);
  const eAtk = es.whiffed ? 0 : ACTIONS[ea].attack;
  const eDef = es.whiffed ? 0 : ACTIONS[ea].defense + (ea === "guard" ? rules.enemyGuardBonus : 0);
  const clash = pAtk > 0 && eAtk > 0;

  let toEnemy = 0;
  let toPlayer = 0;
  if (clash) {
    toEnemy = Math.max(0, pAtk - eAtk);
    toPlayer = Math.max(0, eAtk - pAtk);
  } else {
    toEnemy = Math.max(0, pAtk - eDef);
    toPlayer = Math.max(0, eAtk - pDef);
    if (pAtk > 0 && toEnemy === 0) {
      ps.blocked = true;
      es.guarded = true;
    }
    if (eAtk > 0 && toPlayer === 0) {
      es.blocked = true;
      ps.guarded = true;
    }
  }
  if (toEnemy > 0) toEnemy = toEnemy * rules.playerDamageMult + rules.playerDamageBonus;
  if (toPlayer > 0) toPlayer += rules.enemyDamageBonus;
  if (rules.playerShielded) toPlayer = 0;

  e.hp = Math.max(0, e.hp - toEnemy);
  p.hp = Math.max(0, p.hp - toPlayer);
  ps.damageDealt = es.damageTaken = toEnemy;
  es.damageDealt = ps.damageTaken = toPlayer;
  return { player: ps, enemy: es, clash };
}

/** Swaps the sides, so enemy relics can reuse the player's trigger rules. */
export function mirrored(r: RoundResult): RoundResult {
  return { player: r.enemy, enemy: r.player, clash: r.clash };
}

export function winnerOf(p: Fighter, e: Fighter): Winner {
  if (p.hp <= 0 && e.hp <= 0) return "draw";
  if (e.hp <= 0) return "player";
  if (p.hp <= 0) return "enemy";
  return null;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
