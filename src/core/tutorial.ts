import type { BattleEvent } from "./battle";
import type { ActionId } from "./rules";

export type TutorialGoal = "confirm" | "watch" | "action" | "hit" | "guarded" | "guardBreak" | "wait" | "useItem" | "win";

/** What the player may press during a step's practice. */
export type TutorialInput = ActionId | "item";

export interface TutorialStep {
  /** String keys shown one per Enter before practice starts. */
  lines: string[];
  goal: TutorialGoal;
  /** For "action": the move to play. For "watch": bars to sit through. */
  action?: ActionId;
  bars?: number;
  allowed: TutorialInput[];
  /** The dummy plays this every bar; the final fight uses a real enemy instead. */
  enemy?: ActionId;
  /** Player energy when practice starts. */
  playerEnergy?: number;
  /** Dummy energy, reset every bar so it can keep repeating its move. */
  enemyEnergy?: number;
  /** Consumable placed in slot 1 for the step. */
  item?: string;
  /** Tells are always shown and always true (the "read the tell" lesson). */
  honestTells?: boolean;
  /** HUD element to highlight: an action pad button, "slots" or "beat" (the beat dots in the pad). */
  focus?: ActionId | "slots" | "beat";
  hint: string;
}

export const TUTORIAL_BPM = 80;
/** Failed tries before the strong hint appears. */
export const STRONG_HINT_AFTER = 3;

export const TUTORIAL_STEPS: TutorialStep[] = [
  { lines: ["tut_intro_1", "tut_intro_2"], goal: "confirm", allowed: [], hint: "" },
  { lines: ["tut_beat_1", "tut_beat_2"], goal: "watch", bars: 2, allowed: [], enemy: "guard", enemyEnergy: 0, focus: "beat", hint: "tut_beat_hint" },
  { lines: ["tut_charge_1"], goal: "action", action: "charge", allowed: ["charge"], enemy: "guard", playerEnergy: 0, enemyEnergy: 0, focus: "charge", hint: "tut_charge_hint" },
  { lines: ["tut_attack_1"], goal: "hit", allowed: ["attack"], enemy: "charge", playerEnergy: 1, enemyEnergy: 0, focus: "attack", hint: "tut_attack_hint" },
  { lines: ["tut_guard_1", "tut_guard_2"], goal: "guarded", allowed: ["guard"], enemy: "attack", playerEnergy: 0, enemyEnergy: 1, honestTells: true, focus: "guard", hint: "tut_guard_hint" },
  { lines: ["tut_special_1", "tut_special_2"], goal: "guardBreak", allowed: ["charge", "special"], enemy: "guard", playerEnergy: 2, enemyEnergy: 0, focus: "special", hint: "tut_special_hint" },
  { lines: ["tut_wait_1", "tut_wait_2"], goal: "wait", allowed: [], enemy: "guard", enemyEnergy: 0, focus: "beat", hint: "tut_wait_hint" },
  { lines: ["tut_item_1", "tut_item_2"], goal: "useItem", allowed: ["item"], enemy: "guard", enemyEnergy: 0, item: "lemon_bomb", focus: "slots", hint: "tut_item_hint" },
  { lines: ["tut_fight_1"], goal: "win", allowed: ["attack", "guard", "charge", "special", "item"], hint: "tut_fight_hint" },
  { lines: ["tut_outro_1", "tut_outro_2"], goal: "confirm", allowed: [], hint: "" },
];

export type TutorialVerdict = "success" | "fail" | null;

/** Judges one practice step from the battle's events. */
export class TutorialTracker {
  private bars = 0;

  constructor(readonly step: TutorialStep) {}

  onEvent(e: BattleEvent): TutorialVerdict {
    const s = this.step;
    switch (s.goal) {
      case "watch":
        if (e.type === "beat" && e.beat === 0 && !e.rest) this.bars++;
        return this.bars > (s.bars ?? 2) ? "success" : null;
      case "wait":
        if (e.type === "wait") return "success";
        return e.type === "reveal" ? "fail" : null;
      case "useItem":
        return e.type === "item" ? "success" : null;
      case "win":
        if (e.type !== "finished") return null;
        return e.winner === "player" ? "success" : "fail";
    }
    if (e.type === "wait") return "fail";
    if (e.type !== "reveal") return null;
    const me = e.result.player;
    switch (s.goal) {
      case "action":
        return me.action === s.action && !me.whiffed ? "success" : "fail";
      case "hit":
        return me.damageDealt > 0 ? "success" : "fail";
      case "guarded":
        return me.guarded ? "success" : "fail";
      case "guardBreak":
        if (me.action === "special" && me.damageDealt > 0 && e.result.enemy.action === "guard") return "success";
        return me.action === "charge" && !me.whiffed ? null : "fail";
      default:
        return null;
    }
  }
}
