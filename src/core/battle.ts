import { type AiParams, decide, type Personality, rollTell } from "./ai";
import {
  combineMods,
  type Consumable,
  costAdjust,
  type EffectContext,
  type EffectReport,
  type Modifiers,
  type Notice,
  type Relic,
  RelicRunner,
  roundEvents,
  type Trigger,
  useConsumable,
} from "./items";
import type { Rng } from "./rng";
import { type ActionId, canAfford, costOf, type CostAdjust, type Fighter, type Grade, judge, mirrored, resolve, type RoundResult, type Winner, winnerOf } from "./rules";

export const BEATS_PER_BAR = 4;
/** The 「モン」 beat (0-based): the only beat an action is judged on. */
export const ACTION_BEAT = 3;
export const FEVER_THRESHOLD = 10;
export const MIN_BPM = 60;
export const MAX_BPM = 260;

export interface EnemySpec {
  nameIndex: number;
  /** Fighting style, shown on the intro card. */
  personality: Personality;
  /** Every fifth fight: tougher, with a relic pick as the reward. */
  elite: boolean;
  /** Extra energy this enemy gains per charge. */
  chargeBonus: number;
  /** Character model file name (without extension) under public/models. */
  model: string;
  rank: number;
  color: string;
  maxHp: number;
  maxEnergy: number;
  startEnergy: number;
  tellChance: number;
  tellAccuracy: number;
  ai: AiParams;
  relics: Relic[];
  bpm: number;
}

export interface BattleOptions {
  /**
   * With rest bars every resolved action is followed by a 4-beat bar with no input, where relic
   * effects play out. Without them (the default) the next bar is a call bar straight away and the
   * round settles half a beat after the action beat. Left out, it follows the player's relics
   * (the tea break relic turns rest bars on).
   */
  restBars: boolean;
  /** Tutorial: the enemy always plays this move (if it can pay; otherwise it charges). */
  enemyScript?: ActionId;
  /** Tutorial: nobody can drop below 1 HP, so the fight never ends. */
  noDefeat?: boolean;
}

export interface Loadout {
  hp: number;
  maxHp: number;
  relics: Relic[];
  slots: (Consumable | null)[];
}

export type BattleEvent =
  | { type: "beat"; bar: number; beat: number; rest: boolean }
  | { type: "tell"; action: ActionId; forced: boolean }
  | { type: "judge"; grade: Grade; delta: number; what: "action" | "item" }
  | { type: "reveal"; result: RoundResult }
  | { type: "notice"; side: "player" | "enemy"; notice: Notice }
  | { type: "item"; slot: number; item: Consumable; grade: Grade; reports: EffectReport[] }
  | { type: "combo"; combo: number; fever: boolean; threshold: number }
  | { type: "fever"; on: boolean }
  | { type: "wait" }
  | { type: "finished"; winner: Exclude<Winner, null> };

/** The enemy's stats once its own relics are applied (what the intro card shows). */
export function enemyStats(spec: EnemySpec): { maxHp: number; maxEnergy: number; startEnergy: number } {
  const mods = combineMods(spec.relics);
  const maxEnergy = spec.maxEnergy + mods.maxEnergyAdd;
  return { maxHp: spec.maxHp + mods.maxHpAdd, maxEnergy, startEnergy: Math.min(maxEnergy, spec.startEnergy) };
}

/** Tempo of a fight against `spec` after both sides' relics. */
export function fightBpm(spec: EnemySpec, playerRelics: readonly Relic[]): number {
  const mine = combineMods(playerRelics);
  const theirs = combineMods(spec.relics);
  const bpm = (spec.bpm + mine.bpmAdd + theirs.bpmAdd) * mine.bpmMult * theirs.bpmMult;
  return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
}

/**
 * One fight. Call `onBeat`/`onOffbeat` with absolute beat numbers as they are heard, and
 * `pressAction`/`useItem` with the input's beat position. Bar 0 is a count-in rest bar; see
 * `BattleOptions` for what follows a resolved action.
 */
export class Battle {
  readonly player: Fighter;
  readonly enemy: Fighter;
  readonly mods: Modifiers;
  readonly enemyMods: Modifiers;
  readonly options: BattleOptions;
  readonly feverThreshold: number;
  /** Tempo for this fight after both sides' relics. */
  readonly bpm: number;
  combo = 0;
  fever = false;
  perfectStreak = 0;
  winner: Winner = null;

  private restBars = new Set<number>([0]);
  private actedBars = new Set<number>();
  private itemBeats = new Set<number>();
  private enemyChoice: ActionId | null = null;
  private waitsInRow = 0;
  private playerHistory: ActionId[] = [];
  /** Player rounds including waits, for chain-based relics. */
  private playerSequence: (ActionId | "wait")[] = [];
  private nextHitBonus = 0;
  private enemyLastHit = false;
  private enemyLastGuarded = false;
  private shieldNext = false;
  private tellNextBar = false;
  readonly costs: CostAdjust;
  private pendingRound: RoundResult | null = null;
  private nullifyNext = false;
  private playerRelics: RelicRunner;
  private enemyRelics: RelicRunner;

  constructor(
    readonly spec: EnemySpec,
    readonly loadout: Loadout,
    private rng: Rng,
    private emit: (e: BattleEvent) => void = () => {},
    options?: Partial<BattleOptions>,
  ) {
    this.mods = combineMods(loadout.relics);
    this.options = { ...options, restBars: options?.restBars ?? this.mods.restBars };
    this.costs = costAdjust(this.mods);
    const enemyMods = combineMods(spec.relics);
    this.enemyMods = enemyMods;
    this.player = { hp: loadout.hp, maxHp: loadout.maxHp, energy: 0, maxEnergy: 3 + this.mods.maxEnergyAdd };
    const stats = enemyStats(spec);
    this.enemy = { hp: stats.maxHp, maxHp: stats.maxHp, energy: stats.startEnergy, maxEnergy: stats.maxEnergy };
    this.bpm = fightBpm(spec, loadout.relics);
    this.feverThreshold = Math.max(1, FEVER_THRESHOLD + this.mods.feverThresholdAdd + enemyMods.feverThresholdAdd);
    this.playerRelics = new RelicRunner(loadout.relics);
    this.enemyRelics = new RelicRunner(spec.relics);
  }

  /** Energy the player's action costs after relics (negative = gives energy). */
  costOf(action: ActionId): number {
    return costOf(action, this.costs);
  }

  /** The player's last `n` resolved actions, oldest first. */
  lastActions(n: number): ActionId[] {
    return this.playerHistory.slice(-n);
  }

  get perfectWindowMult(): number {
    return this.mods.perfectWindowMult * this.enemyMods.perfectWindowMult;
  }

  /** An enemy relic can forbid consumables for the whole fight. */
  get itemsLocked(): boolean {
    return this.enemyMods.locksItems;
  }

  get finished(): boolean {
    return this.winner !== null;
  }

  start(): void {
    this.fire("player", "battle_start", null);
    this.fire("enemy", "battle_start", null);
  }

  isRestBar(bar: number): boolean {
    return this.restBars.has(bar);
  }

  onBeat(beat: number): void {
    if (this.finished) return;
    const bar = Math.floor(beat / BEATS_PER_BAR);
    const b = beat % BEATS_PER_BAR;
    const rest = this.isRestBar(bar);
    this.emit({ type: "beat", bar, beat: b, rest });
    if (rest) {
      if (b === 0 && this.pendingRound) this.checkWinner();
      if (b === 1) this.settleRound();
      return;
    }
    if (b === 0) this.enemyChoice = this.decideEnemy();
    if (b === 1 && this.enemyChoice) {
      const always = this.mods.alwaysTell || this.enemyMods.alwaysTell || this.tellNextBar;
      this.tellNextBar = false;
      const chance = always ? 1 : this.spec.tellChance * this.mods.tellChanceMult * this.enemyMods.tellChanceMult;
      const accuracy = Math.min(1, Math.max(0, this.spec.tellAccuracy + this.mods.tellAccuracyAdd + this.enemyMods.tellAccuracyAdd));
      const tell = rollTell(this.enemy, this.enemyChoice, chance, accuracy, always ? 0 : this.waitsInRow, this.rng);
      if (tell) this.emit({ type: "tell", action: tell, forced: false });
    }
  }

  /**
   * Called half a beat after each beat. After the action beat, an unanswered bar becomes a wait;
   * without rest bars an answered one settles here.
   */
  onOffbeat(beat: number): void {
    if (this.finished || beat % BEATS_PER_BAR !== ACTION_BEAT) return;
    const bar = Math.floor(beat / BEATS_PER_BAR);
    if (this.isRestBar(bar)) return;
    if (this.actedBars.has(bar)) {
      if (!this.options.restBars) {
        this.checkWinner();
        this.settleRound();
      }
      return;
    }
    this.enemyChoice = null;
    this.waitsInRow++;
    this.perfectStreak = 0;
    this.nextHitBonus = 0;
    this.shieldNext = false;
    this.playerSequence.push("wait");
    this.emit({ type: "wait" });
    this.setCombo(0);
    this.fire("player", "wait", null);
    this.fire("enemy", "wait", null);
    this.checkWinner();
  }

  /** Returns the grade, or null when the press didn't count (wrong beat, rest bar, already acted). */
  pressAction(action: ActionId, beatPos: number, secondsPerBeat: number): Grade | null {
    if (this.finished) return null;
    const nearest = Math.round(beatPos);
    const bar = Math.floor(nearest / BEATS_PER_BAR);
    if (nearest % BEATS_PER_BAR !== ACTION_BEAT || this.isRestBar(bar) || this.actedBars.has(bar)) return null;
    const enemyAction = this.enemyChoice ?? this.decideEnemy();
    const delta = (beatPos - nearest) * secondsPerBeat;
    const grade = judge(delta, this.perfectWindowMult);
    this.actedBars.add(bar);
    if (this.options.restBars) this.restBars.add(bar + 1);
    this.emit({ type: "judge", grade, delta, what: "action" });
    this.trackPerfect(grade);

    const result = resolve(this.player, action, this.enemy, enemyAction, {
      playerDamageBonus: this.mods.damageBonus + (this.fever ? this.mods.feverDamageBonus : 0) + this.nextHitBonus,
      enemyDamageBonus: this.enemyMods.damageBonus + (this.fever ? this.enemyMods.damageVsFeverAdd : 0),
      playerGuardBonus: this.mods.guardDefenseAdd,
      enemyGuardBonus: this.enemyMods.guardDefenseAdd,
      playerCanGuard: this.mods.canGuard,
      enemyNullified: this.nullifyNext,
      playerCostAdjust: this.costs,
      playerShielded: this.shieldNext,
      enemyChargeBonus: this.spec.chargeBonus,
    });
    this.nextHitBonus = 0;
    this.shieldNext = false;
    result.player.grade = grade;
    this.nullifyNext = false;
    this.enemyChoice = null;
    this.waitsInRow = 0;
    this.playerHistory.push(action);
    this.playerSequence.push(action);
    this.pendingRound = result;
    this.enemyLastHit = result.enemy.damageDealt > 0;
    this.enemyLastGuarded = result.enemy.guarded;
    this.emit({ type: "reveal", result });
    // The combo (and so FEVER, and relics reacting to it) moves after the round resolves, so a
    // FEVER-start effect never changes the action that triggered it.
    this.setCombo(this.combo + 1);
    if (grade === "perfect") this.fire("player", "perfect", result);
    return grade;
  }

  /** Items go on beats 1–3 of a call bar (never the action beat), at most one per beat. */
  useItem(slot: number, beatPos: number, secondsPerBeat: number): Grade | null {
    const item = this.loadout.slots[slot];
    if (this.finished || !item || this.itemsLocked) return null;
    const nearest = Math.round(beatPos);
    const bar = Math.floor(nearest / BEATS_PER_BAR);
    if (nearest % BEATS_PER_BAR === ACTION_BEAT || this.isRestBar(bar) || this.itemBeats.has(nearest)) return null;
    this.itemBeats.add(nearest);
    const delta = (beatPos - nearest) * secondsPerBeat;
    const grade = judge(delta, this.perfectWindowMult);
    this.emit({ type: "judge", grade, delta, what: "item" });
    this.trackPerfect(grade);
    this.loadout.slots[slot] = null;

    const ctx = this.context("player", null);
    const reports = useConsumable(item, grade === "perfect", ctx);
    this.applyRequests(ctx);
    this.emit({ type: "item", slot, item, grade, reports });
    if (grade === "perfect") this.fire("player", "perfect", null);
    this.checkWinner();
    return grade;
  }

  /** Fires both sides' round relics for the pending round, then checks for a winner. */
  private settleRound(): void {
    const round = this.pendingRound;
    if (!round || this.finished) return;
    this.pendingRound = null;
    for (const event of roundEvents(round)) this.fire("player", event, round);
    const flipped = mirrored(round);
    for (const event of roundEvents(flipped)) this.fire("enemy", event, flipped);
    this.checkWinner();
  }

  private decideEnemy(): ActionId {
    const script = this.options.enemyScript;
    if (script) return canAfford(this.enemy, script) ? script : "charge";
    return decide(this.enemy, this.player, this.playerHistory, this.spec.ai, this.rng, { lastHit: this.enemyLastHit, lastGuarded: this.enemyLastGuarded });
  }

  private trackPerfect(grade: Grade): void {
    this.perfectStreak = grade === "perfect" ? this.perfectStreak + 1 : 0;
  }

  private setCombo(combo: number): void {
    this.combo = combo;
    const fever = combo >= this.feverThreshold;
    const started = fever && !this.fever;
    const ended = !fever && this.fever;
    this.fever = fever;
    this.emit({ type: "combo", combo, fever, threshold: this.feverThreshold });
    if (started || ended) this.emit({ type: "fever", on: fever });
    if (started) {
      this.fire("player", "fever_start", null);
      this.fire("enemy", "foe_fever_start", null);
    }
    if (ended) {
      this.fire("player", "fever_end", null);
      this.fire("enemy", "foe_fever_end", null);
    }
  }

  private context(side: "player" | "enemy", round: RoundResult | null): EffectContext {
    const mine = side === "player";
    return {
      self: mine ? this.player : this.enemy,
      foe: mine ? this.enemy : this.player,
      round,
      perfectStreak: mine ? this.perfectStreak : 0,
      combo: mine ? this.combo : 0,
      fever: mine && this.fever,
      foeFever: !mine && this.fever,
      history: mine ? this.playerSequence : [],
      requests: { nullify: false, trueTell: false, hitBonus: 0, shield: false, tellNext: false },
    };
  }

  /** Effects that change the next round rather than the fighters (player side only). */
  private applyRequests(ctx: EffectContext): void {
    const r = ctx.requests;
    if (r.nullify) this.nullifyNext = true;
    this.nextHitBonus += r.hitBonus;
    if (r.shield) this.shieldNext = true;
    if (r.tellNext) this.tellNextBar = true;
    if (r.trueTell) {
      this.enemyChoice ??= this.decideEnemy();
      this.emit({ type: "tell", action: this.enemyChoice, forced: true });
    }
  }

  private fire(side: "player" | "enemy", event: Trigger, round: RoundResult | null): void {
    const runner = side === "player" ? this.playerRelics : this.enemyRelics;
    const ctx = this.context(side, round);
    for (const notice of runner.fire(event, ctx)) {
      this.emit({ type: "notice", side, notice });
    }
    if (side === "player") this.applyRequests(ctx);
  }

  private checkWinner(): void {
    if (this.finished) return;
    if (this.options.noDefeat) {
      this.player.hp = Math.max(1, this.player.hp);
      this.enemy.hp = Math.max(1, this.enemy.hp);
      return;
    }
    const w = winnerOf(this.player, this.enemy);
    if (w === null) return;
    this.winner = w;
    this.emit({ type: "finished", winner: w });
  }
}
