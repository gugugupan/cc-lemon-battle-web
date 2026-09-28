import { type AiParams, decide, rollTell } from "./ai";
import {
  combineMods,
  type Consumable,
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
import { type ActionId, type Fighter, type Grade, judge, mirrored, resolve, type RoundResult, type Winner, winnerOf } from "./rules";

export const BEATS_PER_BAR = 4;
/** The 「モン」 beat (0-based): the only beat an action is judged on. */
export const ACTION_BEAT = 3;
export const FEVER_THRESHOLD = 10;

export interface EnemySpec {
  nameIndex: number;
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

/**
 * One fight. Call `onBeat`/`onOffbeat` with absolute beat numbers as they are heard, and
 * `pressAction`/`useItem` with the input's beat position. Bar 0 is a count-in rest bar, and every
 * resolved action turns the next bar into a rest bar where relic effects play out.
 */
export class Battle {
  readonly player: Fighter;
  readonly enemy: Fighter;
  readonly mods: Modifiers;
  readonly feverThreshold: number;
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
  private pendingRound: RoundResult | null = null;
  private nullifyNext = false;
  private playerRelics: RelicRunner;
  private enemyRelics: RelicRunner;

  constructor(
    readonly spec: EnemySpec,
    readonly loadout: Loadout,
    private rng: Rng,
    private emit: (e: BattleEvent) => void = () => {},
  ) {
    this.mods = combineMods(loadout.relics);
    const enemyMods = combineMods(spec.relics);
    this.player = { hp: loadout.hp, maxHp: loadout.maxHp, energy: 0, maxEnergy: 3 + this.mods.maxEnergyAdd };
    this.enemy = { hp: spec.maxHp, maxHp: spec.maxHp, energy: spec.startEnergy, maxEnergy: spec.maxEnergy + enemyMods.maxEnergyAdd };
    this.feverThreshold = Math.max(1, FEVER_THRESHOLD + this.mods.feverThresholdAdd);
    this.playerRelics = new RelicRunner(loadout.relics);
    this.enemyRelics = new RelicRunner(spec.relics);
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
      if (b === 1 && this.pendingRound && !this.finished) {
        const round = this.pendingRound;
        this.pendingRound = null;
        for (const event of roundEvents(round)) this.fire("player", event, round);
        const flipped = mirrored(round);
        for (const event of roundEvents(flipped)) this.fire("enemy", event, flipped);
        this.checkWinner();
      }
      return;
    }
    if (b === 0) this.enemyChoice = this.decideEnemy();
    if (b === 1 && this.enemyChoice) {
      const chance = this.spec.tellChance * this.mods.tellChanceMult;
      const accuracy = Math.min(1, this.spec.tellAccuracy + this.mods.tellAccuracyAdd);
      const tell = rollTell(this.enemy, this.enemyChoice, chance, accuracy, this.waitsInRow, this.rng);
      if (tell) this.emit({ type: "tell", action: tell, forced: false });
    }
  }

  /** Called half a beat after each beat; after the action beat an unanswered bar becomes a wait. */
  onOffbeat(beat: number): void {
    if (this.finished || beat % BEATS_PER_BAR !== ACTION_BEAT) return;
    const bar = Math.floor(beat / BEATS_PER_BAR);
    if (this.isRestBar(bar) || this.actedBars.has(bar)) return;
    this.enemyChoice = null;
    this.waitsInRow++;
    this.perfectStreak = 0;
    this.setCombo(0);
    this.emit({ type: "wait" });
  }

  /** Returns the grade, or null when the press didn't count (wrong beat, rest bar, already acted). */
  pressAction(action: ActionId, beatPos: number, secondsPerBeat: number): Grade | null {
    if (this.finished) return null;
    const nearest = Math.round(beatPos);
    const bar = Math.floor(nearest / BEATS_PER_BAR);
    if (nearest % BEATS_PER_BAR !== ACTION_BEAT || this.isRestBar(bar) || this.actedBars.has(bar)) return null;
    const enemyAction = this.enemyChoice ?? this.decideEnemy();
    const delta = (beatPos - nearest) * secondsPerBeat;
    const grade = judge(delta, this.mods.perfectWindowMult);
    this.actedBars.add(bar);
    this.restBars.add(bar + 1);
    this.emit({ type: "judge", grade, delta, what: "action" });
    this.trackPerfect(grade);
    this.setCombo(this.combo + 1);

    const result = resolve(this.player, action, this.enemy, enemyAction, {
      playerDamageMult: 1,
      playerCanGuard: this.mods.canGuard,
      enemyNullified: this.nullifyNext,
    });
    result.player.grade = grade;
    this.nullifyNext = false;
    this.enemyChoice = null;
    this.waitsInRow = 0;
    this.playerHistory.push(action);
    this.pendingRound = result;
    this.emit({ type: "reveal", result });
    if (grade === "perfect") this.fire("player", "perfect", result);
    return grade;
  }

  /** Items go on beats 1–3 of a call bar (never the action beat), at most one per beat. */
  useItem(slot: number, beatPos: number, secondsPerBeat: number): Grade | null {
    const item = this.loadout.slots[slot];
    if (this.finished || !item) return null;
    const nearest = Math.round(beatPos);
    const bar = Math.floor(nearest / BEATS_PER_BAR);
    if (nearest % BEATS_PER_BAR === ACTION_BEAT || this.isRestBar(bar) || this.itemBeats.has(nearest)) return null;
    this.itemBeats.add(nearest);
    const delta = (beatPos - nearest) * secondsPerBeat;
    const grade = judge(delta, this.mods.perfectWindowMult);
    this.emit({ type: "judge", grade, delta, what: "item" });
    this.trackPerfect(grade);
    this.loadout.slots[slot] = null;

    const ctx = this.context("player", null);
    const reports = useConsumable(item, grade === "perfect", ctx);
    if (ctx.requests.nullify) this.nullifyNext = true;
    if (ctx.requests.trueTell) {
      this.enemyChoice ??= this.decideEnemy();
      this.emit({ type: "tell", action: this.enemyChoice, forced: true });
    }
    this.emit({ type: "item", slot, item, grade, reports });
    if (grade === "perfect") this.fire("player", "perfect", null);
    this.checkWinner();
    return grade;
  }

  private decideEnemy(): ActionId {
    return decide(this.enemy, this.player, this.playerHistory, this.spec.ai, this.rng);
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
    if (started) this.fire("player", "fever_start", null);
  }

  private context(side: "player" | "enemy", round: RoundResult | null): EffectContext {
    const mine = side === "player";
    return {
      self: mine ? this.player : this.enemy,
      foe: mine ? this.enemy : this.player,
      round,
      perfectStreak: mine ? this.perfectStreak : 0,
      fever: mine && this.fever,
      requests: { nullify: false, trueTell: false },
    };
  }

  private fire(side: "player" | "enemy", event: Trigger, round: RoundResult | null): void {
    const runner = side === "player" ? this.playerRelics : this.enemyRelics;
    for (const notice of runner.fire(event, this.context(side, round))) {
      this.emit({ type: "notice", side, notice });
    }
  }

  private checkWinner(): void {
    if (this.finished) return;
    const w = winnerOf(this.player, this.enemy);
    if (w === null) return;
    this.winner = w;
    this.emit({ type: "finished", winner: w });
  }
}
