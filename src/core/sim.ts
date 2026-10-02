import { ACTION_BEAT, Battle, type BattleOptions, BEATS_PER_BAR, type EnemySpec, type Loadout } from "./battle";
import { CONSUMABLES, type Relic, RELICS, type Series } from "./items";
import { Rng } from "./rng";
import type { ActionId } from "./rules";
import type { Character } from "./characters";
import { enemyFor, GOAL_ROUNDS, Run } from "./run";

export type Strategy = "sensible" | "tell_reader";

/** How the simulated player plays. */
export interface PlayerModel {
  strategy: Strategy;
  /** Share of inputs that land Perfect (the rest are Good). */
  perfectRate: number;
  /** Uses every consumable with a simple rule (bomb first, shield on an attack tell, …); otherwise only bandages at low HP. */
  useItems: boolean;
  /** Leans its moves toward what its relics reward (chains for combo relics, guards for guard relics, …). */
  buildAware: boolean;
  /**
   * Seconds between a tell (beat 2) and the action beat that a human needs to act on it; below
   * this the tell is caught less and less often, down to never at half of it. 0 = reacts instantly.
   */
  reaction: number;
}

/** A naive player: the old bot, used for the single-fight curve. */
export const CASUAL: PlayerModel = { strategy: "sensible", perfectRate: 0.6, useItems: false, buildAware: false, reaction: 0 };
/** A strong player: reads tells, keeps good time, uses items and plays to its build. */
export const SKILLED: PlayerModel = { strategy: "tell_reader", perfectRate: 0.85, useItems: true, buildAware: true, reaction: 0.7 };

const MAX_BARS = 400;

/** Plays a fight without a clock: every call bar the player may use items on beats 1–3, then acts on beat 4 (or waits). */
export function simulate(
  spec: EnemySpec,
  loadout: Loadout,
  player: PlayerModel,
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
  const catchTell = catchChance(2 * spb, player.reaction);
  const style = player.buildAware ? buildStyle(loadout.relics) : NO_STYLE;
  const offset = () => (rng.chance(player.perfectRate) ? 0 : 0.08 / spb);
  battle.start();
  let beat = 0;
  for (; beat < MAX_BARS * BEATS_PER_BAR && !battle.finished; beat++) {
    const b = beat % BEATS_PER_BAR;
    if (b === 0) tell = null;
    battle.onBeat(beat);
    const bar = Math.floor(beat / BEATS_PER_BAR);
    if (battle.finished || battle.isRestBar(bar)) continue;
    if (b === 1 && tell !== null && !rng.chance(catchTell)) tell = null;
    if (b < ACTION_BEAT && !battle.itemsLocked) {
      const slot = player.useItems ? itemToUse(battle, b, tell) : b === 0 && battle.player.hp <= 2 ? battle.loadout.slots.findIndex((s) => s?.id === "bandage") : -1;
      if (slot >= 0) battle.useItem(slot, beat + offset(), spb);
    }
    if (b === ACTION_BEAT) {
      const choice = pick(player.strategy, style, battle, tell, waitedForTell, rng);
      if (choice === null) {
        waitedForTell = true;
      } else {
        waitedForTell = false;
        battle.pressAction(choice, beat + offset(), spb);
      }
    }
    battle.onOffbeat(beat);
  }
  return { won: battle.winner === "player", hpLeft: battle.player.hp, bars: Math.floor(beat / BEATS_PER_BAR), slotsLeft: battle.loadout.slots };
}

/** Chance to act on a tell given the time left to react. */
export function catchChance(window: number, reaction: number): number {
  if (reaction <= 0) return 1;
  return Math.min(1, Math.max(0, (window - reaction / 2) / (reaction / 2)));
}

/** Which consumable to use on this beat of a call bar (-1 = none). */
function itemToUse(battle: Battle, beatInBar: number, tell: ActionId | null): number {
  const me = battle.player;
  const slots = battle.loadout.slots;
  const find = (id: string) => slots.findIndex((s) => s?.id === id);
  const incoming = tell === "attack" || tell === "special";
  const opening = tell === "charge" || tell === "guard";
  const candidates: [string, boolean][] =
    beatInBar === 0
      ? [
          ["lemon_bomb", true],
          ["bandage", me.hp <= Math.max(1, me.maxHp - 3) || me.hp <= 2],
          ["honey_lemon", me.hp <= me.maxHp - 2],
        ]
      : beatInBar === 1
        ? [
            ["ramune", battle.costOf("special") > me.energy && battle.costOf("special") - me.energy <= 2],
            ["honey_lemon", me.hp < me.maxHp && me.energy < me.maxEnergy],
          ]
        : [
            ["shield_sticker", incoming],
            ["pause", incoming],
            ["wraps", opening && battle.costOf("attack") <= me.energy],
          ];
  for (const [id, when] of candidates) {
    const slot = find(id);
    if (when && slot >= 0) return slot;
  }
  return -1;
}

/** How a build-aware player bends its default moves. */
interface Style {
  attack: number;
  guard: number;
  charge: number;
  /** Never waits for a tell (FEVER builds keep the combo going). */
  noWait: boolean;
  /** Waits for a tell even after waiting once (wait builds get paid to). */
  patientWait: boolean;
  chargeAtFull: boolean;
  /** Attacks right after two guards in a row. */
  attackAfterGuards: boolean;
}

const NO_STYLE: Style = { attack: 0, guard: 0, charge: 0, noWait: false, patientWait: false, chargeAtFull: false, attackAfterGuards: false };

export function buildStyle(relics: readonly Relic[]): Style {
  const count = (s: Series) => relics.filter((r) => r.series === s).length;
  const has = (id: string) => relics.some((r) => r.id === id);
  return {
    attack: 0.25 * count("combo"),
    guard: 0.25 * count("guard"),
    charge: 0.25 * count("charge"),
    noWait: count("fever") >= 2,
    patientWait: has("composure") || has("detective"),
    chargeAtFull: has("overflow"),
    attackAfterGuards: has("patience"),
  };
}

function pick(strategy: Strategy, style: Style, battle: Battle, tell: ActionId | null, waited: boolean, rng: Rng): ActionId | null {
  const me = battle.player;
  const can = (a: ActionId) => battle.costOf(a) <= me.energy;
  if (strategy === "tell_reader") {
    if (tell === null && !style.noWait && (!waited || (style.patientWait && rng.chance(0.5)))) return null;
    if (tell === "attack" || tell === "special") return battle.mods.canGuard ? "guard" : "charge";
    if (tell === "charge") return can("special") ? "special" : can("attack") ? "attack" : "charge";
    if (tell === "guard") return can("special") ? "special" : me.energy < me.maxEnergy || style.chargeAtFull ? "charge" : "attack";
  }
  if (can("special")) return "special";
  if (battle.enemy.energy === 0) return can("attack") ? "attack" : "charge";
  if (style.attackAfterGuards && can("attack") && battle.lastActions(2).join() === "guard,guard") return "attack";
  const weights: [ActionId, number][] = [
    ["guard", 0.45 + style.guard],
    ["charge", me.energy < me.maxEnergy || style.chargeAtFull ? 0.35 + style.charge : 0],
    ["attack", can("attack") ? 0.2 + style.attack : 0],
  ];
  return rng.weighted(weights.filter(([, w]) => w > 0));
}

/** How the simulated player spends gold between fights. */
export type Shopper = "random" | { ranking: readonly string[] };

/**
 * Plays a whole run with one character: fights in a row with HP and gold carried over, and a
 * shopper in between (rest when hurt, then the chest, then consumables). The random shopper picks
 * any relic; a ranking shopper always takes the best-ranked one on offer.
 * Returns how many fights were won before losing, capped at the goal.
 */
export function simulateRun(character: Character, player: PlayerModel, seed: number, shopper: Shopper = "random"): number {
  const run = new Run(seed, character);
  const rng = new Rng(seed + 7);
  const choose = (offer: readonly Relic[]) => (shopper === "random" ? rng.int(0, offer.length - 1) : bestOf(offer, shopper.ranking));
  while (run.wins < GOAL_ROUNDS) {
    const result = simulate(run.enemy, run.loadout(), player, seed * 131 + run.round);
    run.slots = result.slotsLeft;
    run.finishBattle(result.won, result.hpLeft);
    if (!result.won) break;
    if (run.relicPick.length) run.takePick(choose(run.relicPick));
    while (run.hp < run.maxHp - 1 && run.rest() === "ok");
    if (run.buyChest() === "ok") run.takePick(choose(run.relicPick));
    for (let i = 0; i < run.stock.length; i++) run.buy(i);
  }
  return run.wins;
}

function bestOf(offer: readonly Relic[], ranking: readonly string[]): number {
  const rank = (r: Relic) => (ranking.includes(r.id) ? ranking.indexOf(r.id) : ranking.length);
  return offer.reduce((best, r, i) => (rank(r) < rank(offer[best]) ? i : best), 0);
}

export function winRate(round: number, loadout: Loadout, player: PlayerModel, games: number, seed = 0): number {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const spec = enemyFor(round, new Rng(seed + round * 1000 + g));
    if (simulate(spec, loadout, player, seed + g).won) wins++;
  }
  return wins / games;
}

export interface BuildReport {
  round: number;
  relicCount: number;
  /** Win rates of the sampled builds, best first. */
  rates: number[];
  /** Average win rate with the relic minus without it, best first. */
  marginal: { id: string; delta: number }[];
  top: { ids: string[]; rate: number }[];
}

/**
 * Stress test for stacked equipment: random builds of `relicCount` relics plus a full bag of
 * random consumables, each played `games` times against the given fight. A relic's marginal is
 * how much better the builds holding it did than the builds without it.
 */
export function sampleBuilds(round: number, relicCount: number, hp: number, player: PlayerModel, builds: number, games: number, seed = 1): BuildReport {
  const rng = new Rng(seed);
  const results: { ids: string[]; rate: number }[] = [];
  for (let i = 0; i < builds; i++) {
    const relics = rng.shuffle(RELICS).slice(0, relicCount);
    const slots = [0, 1, 2, 3].map(() => rng.pick(CONSUMABLES));
    results.push({ ids: relics.map((r) => r.id), rate: winRate(round, { hp, maxHp: hp, relics, slots }, player, games, seed * 7919 + i * 101) });
  }
  results.sort((a, b) => b.rate - a.rate);
  const avg = (list: number[]) => (list.length ? list.reduce((s, v) => s + v, 0) / list.length : 0);
  const marginal = RELICS.map((r) => ({
    id: r.id,
    delta: avg(results.filter((x) => x.ids.includes(r.id)).map((x) => x.rate)) - avg(results.filter((x) => !x.ids.includes(r.id)).map((x) => x.rate)),
  })).sort((a, b) => b.delta - a.delta);
  return { round, relicCount, rates: results.map((r) => r.rate), marginal, top: results.slice(0, 5) };
}
