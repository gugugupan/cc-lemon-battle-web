import type { BattleEvent } from "./battle";
import type { ActionId } from "./rules";

export type TutorialGoal = "confirm" | "watch" | "win";

/** What the player may press during a step's practice. */
export type TutorialInput = ActionId | "item";

export interface TutorialStep {
  /** String keys shown one per Enter before practice starts. */
  lines: string[];
  goal: TutorialGoal;
  /** For "watch": bars to sit through. */
  bars?: number;
  allowed: TutorialInput[];
  /** The dummy picks one of these it can pay for every bar; left out, the enemy's own brain decides. */
  enemy?: ActionId[];
  enemyHp?: number;
  /** Chance of a tell each bar; tutorial tells are always true. */
  tellChance?: number;
  /** Consumables placed in the slots, from slot 1. */
  items?: string[];
  /** Before the fight the player picks one of three relics, kept for retries. */
  relicPick?: boolean;
  /** The fight is against レモン仙人 himself, with a boss's second phase. */
  boss?: boolean;
  /** HUD elements to highlight: action pad buttons, "slots" or "beat" (the beat dots in the pad). */
  focus?: (ActionId | "slots" | "beat")[];
  hint: string;
}

export const TUTORIAL_BPM = 80;
export const TUTORIAL_PLAYER_HP = 5;
/** Relics offered before the boss: ones whose effect is easy to see in a single fight. */
export const TUTORIAL_RELICS = ["wristguard", "xray", "big_bottle", "follow_up", "counter", "finisher"];

export const TUTORIAL_STEPS: TutorialStep[] = [
  { lines: ["tut_intro_1", "tut_intro_2"], goal: "confirm", allowed: [], hint: "" },
  { lines: ["tut_beat_1", "tut_beat_2"], goal: "watch", bars: 2, allowed: [], enemy: ["guard"], focus: ["beat"], hint: "tut_beat_hint" },
  {
    lines: ["tut_f1_1", "tut_f1_2", "tut_f1_3"],
    goal: "win",
    allowed: ["charge", "attack"],
    enemy: ["charge"],
    enemyHp: 3,
    tellChance: 0,
    focus: ["charge", "attack"],
    hint: "tut_f1_hint",
  },
  {
    lines: ["tut_f2_1", "tut_f2_2", "tut_f2_3"],
    goal: "win",
    allowed: ["charge", "attack", "guard"],
    enemy: ["charge", "attack"],
    enemyHp: 3,
    tellChance: 1,
    focus: ["guard"],
    hint: "tut_f2_hint",
  },
  {
    lines: ["tut_f3_1", "tut_f3_2", "tut_f3_3"],
    goal: "win",
    allowed: ["charge", "attack", "guard", "special"],
    enemy: ["charge", "attack", "guard"],
    enemyHp: 4,
    tellChance: 0.5,
    focus: ["special"],
    hint: "tut_f3_hint",
  },
  {
    lines: ["tut_f4_1", "tut_f4_2"],
    goal: "win",
    allowed: ["charge", "attack", "guard", "special", "item"],
    enemy: ["charge", "attack", "guard"],
    enemyHp: 4,
    tellChance: 0.5,
    items: ["lemon_bomb", "bandage"],
    focus: ["slots"],
    hint: "tut_f4_hint",
  },
  {
    lines: ["tut_boss_1", "tut_boss_2", "tut_boss_3"],
    goal: "win",
    allowed: ["charge", "attack", "guard", "special", "item"],
    enemyHp: 5,
    items: ["lemon_bomb", "bandage"],
    relicPick: true,
    boss: true,
    hint: "tut_boss_hint",
  },
  { lines: ["tut_outro_1", "tut_outro_2"], goal: "confirm", allowed: [], hint: "" },
];

export type TutorialVerdict = "success" | "fail" | null;

/** Judges one practice step from the battle's events. */
export class TutorialTracker {
  private bars = 0;

  constructor(readonly step: TutorialStep) {}

  onEvent(e: BattleEvent): TutorialVerdict {
    switch (this.step.goal) {
      case "watch":
        if (e.type === "beat" && e.beat === 0 && !e.rest) this.bars++;
        return this.bars > (this.step.bars ?? 2) ? "success" : null;
      case "win":
        if (e.type !== "finished") return null;
        return e.winner === "player" ? "success" : "fail";
      default:
        return null;
    }
  }
}
