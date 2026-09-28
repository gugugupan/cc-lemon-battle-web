import { ACTION_BEAT, Battle, type BattleOptions, BEATS_PER_BAR, type EnemySpec, type Loadout } from "./battle";
import { Rng } from "./rng";
import type { ActionId } from "./rules";
import type { Character } from "./characters";
import { GOAL_ROUNDS, Run } from "./run";

export type Strategy = "sensible" | "tell_reader";

const MAX_BARS = 400;

/** Plays a fight without a clock: every call bar the strategy acts on beat 4 (or waits). */
export function simulate(
  spec: EnemySpec,
  loadout: Loadout,
  strategy: Strategy,
  perfectRate: number,
  seed: number,
  options?: Partial<BattleOptions>,
): { won: boolean; hpLeft: number; bars: number; slotsLeft: Loadout["slots"] } {
  const rng = new Rng(seed);
  let tell: ActionId | null = null;
  let waitedForTell = false;
  const battle = new Battle(spec, { ...loadout, slots: [...loadout.slots] }, new Rng(seed + 1), (e) => {
    if (e.type === "tell") tell = e.action;
  }, options);
  const spb = 60 / battle.bpm;
  battle.start();
  let beat = 0;
  for (; beat < MAX_BARS * BEATS_PER_BAR && !battle.finished; beat++) {
    const b = beat % BEATS_PER_BAR;
    if (b === 0) tell = null;
    battle.onBeat(beat);
    const bar = Math.floor(beat / BEATS_PER_BAR);
    if (battle.finished || battle.isRestBar(bar)) continue;
    if (b === 0 && battle.player.hp <= 2) {
      const slot = battle.loadout.slots.findIndex((s) => s?.id === "bandage");
      if (slot >= 0) battle.useItem(slot, beat, spb);
    }
    if (b === ACTION_BEAT) {
      const choice = pick(strategy, battle, tell, waitedForTell, rng);
      if (choice === null) {
        waitedForTell = true;
      } else {
        waitedForTell = false;
        const offset = rng.chance(perfectRate) ? 0 : 0.08 / spb;
        battle.pressAction(choice, beat + offset, spb);
      }
    }
    battle.onOffbeat(beat);
  }
  return { won: battle.winner === "player", hpLeft: battle.player.hp, bars: Math.floor(beat / BEATS_PER_BAR), slotsLeft: battle.loadout.slots };
}

function pick(strategy: Strategy, battle: Battle, tell: ActionId | null, waited: boolean, rng: Rng): ActionId | null {
  const me = battle.player;
  const canAfford = (_: unknown, a: ActionId) => battle.costOf(a) <= me.energy;
  if (strategy === "tell_reader") {
    if (tell === null && !waited) return null;
    if (tell === "attack" || tell === "special") return battle.mods.canGuard ? "guard" : "charge";
    if (tell === "charge") return canAfford(me, "special") ? "special" : canAfford(me, "attack") ? "attack" : "charge";
    if (tell === "guard") return canAfford(me, "special") ? "special" : me.energy < me.maxEnergy ? "charge" : "attack";
  }
  if (canAfford(me, "special")) return "special";
  if (battle.enemy.energy === 0) return canAfford(me, "attack") ? "attack" : "charge";
  const roll = rng.next();
  if (roll < 0.45) return "guard";
  if (roll < 0.8 && me.energy < me.maxEnergy) return "charge";
  return canAfford(me, "attack") ? "attack" : "charge";
}

/**
 * Plays a whole run with one character: fights in a row with HP and gold carried over, and a
 * simple shopper in between (rest when hurt, then random affordable relics, then consumables).
 * Returns how many fights were won before losing, capped at the goal.
 */
export function simulateRun(character: Character, strategy: Strategy, perfectRate: number, seed: number): number {
  const run = new Run(seed, character);
  const shopper = new Rng(seed + 7);
  while (run.wins < GOAL_ROUNDS) {
    const result = simulate(run.enemy, run.loadout(), strategy, perfectRate, seed * 131 + run.round);
    run.slots = result.slotsLeft;
    run.finishBattle(result.won, result.hpLeft);
    if (!result.won) break;
    if (run.relicPick.length) run.takePick(shopper.int(0, run.relicPick.length - 1));
    while (run.hp < run.maxHp - 1 && run.rest() === "ok");
    for (const i of shopper.shuffle(run.stock.map((_, i) => i))) {
      const entry = run.stock[i];
      if (entry.item.kind === "relic") run.buy(i);
    }
    for (let i = 0; i < run.stock.length; i++) run.buy(i);
  }
  return run.wins;
}
