import { Battle, BEATS_PER_BAR, ACTION_BEAT, type EnemySpec, type Loadout } from "./battle";
import { Rng } from "./rng";
import { type ActionId, canAfford } from "./rules";

export type Strategy = "sensible" | "tell_reader";

const MAX_BARS = 400;

/** Plays a fight without a clock: every call bar the strategy acts on beat 4 (or waits). */
export function simulate(spec: EnemySpec, loadout: Loadout, strategy: Strategy, perfectRate: number, seed: number): { won: boolean; hpLeft: number; bars: number } {
  const rng = new Rng(seed);
  let tell: ActionId | null = null;
  let waitedForTell = false;
  const battle = new Battle(spec, { ...loadout, slots: [...loadout.slots] }, new Rng(seed + 1), (e) => {
    if (e.type === "tell") tell = e.action;
  });
  const spb = 60 / spec.bpm;
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
  return { won: battle.winner === "player", hpLeft: battle.player.hp, bars: Math.floor(beat / BEATS_PER_BAR) };
}

function pick(strategy: Strategy, battle: Battle, tell: ActionId | null, waited: boolean, rng: Rng): ActionId | null {
  const me = battle.player;
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
