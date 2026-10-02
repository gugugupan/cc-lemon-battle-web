import { CONSUMABLES, RELICS } from "./items";
import type { Rng } from "./rng";
import type { Run } from "./run";

export type EventId = "vending" | "dagashi" | "homework" | "infirmary" | "transfer" | "shrine";

export const EVENT_IDS: EventId[] = ["vending", "dagashi", "homework", "infirmary", "transfer", "shrine"];

/** Chance of an event after a regular win, before the shop. */
export const EVENT_CHANCE = 0.35;

/** What a choice did, for the result line (`result` is an i18n key; `item` names what was gained). */
export interface EventOutcome {
  result: string;
  item?: string;
  /** The choice opened a chest: the run's `relicPick` is waiting to be taken. */
  chest?: boolean;
}

export interface EventChoice {
  /** i18n key of the button. */
  label: string;
  /** Gold it costs, shown on the button. */
  cost?: number;
  /** Why it can't be picked right now (an i18n key), or null. */
  blocked(run: Run): string | null;
  apply(run: Run, rng: Rng): EventOutcome;
}

const leave: EventChoice = { label: "ev_leave", blocked: () => null, apply: () => ({ result: "ev_left" }) };

function freeSlot(run: Run): number {
  return run.slots.indexOf(null);
}

function giveConsumable(run: Run, rng: Rng): string | undefined {
  const slot = freeSlot(run);
  if (slot < 0) return undefined;
  const item = rng.pick(CONSUMABLES);
  run.slots[slot] = item;
  return item.id;
}

const needsGold = (cost: number) => (run: Run) => (run.gold < cost ? "no_gold" : null);
const needsSlot = (run: Run) => (freeSlot(run) < 0 ? "bag_full" : null);

export const EVENTS: Record<EventId, EventChoice[]> = {
  vending: [
    {
      label: "ev_vending_buy",
      cost: 15,
      blocked: needsGold(15),
      apply: (run) => {
        run.gold -= 15;
        run.hp = Math.min(run.maxHp, run.hp + 2);
        return { result: "ev_vending_buy_r" };
      },
    },
    {
      label: "ev_vending_kick",
      blocked: () => null,
      apply: (run, rng) => {
        if (rng.chance(0.5) && freeSlot(run) >= 0) return { result: "ev_vending_kick_win", item: giveConsumable(run, rng) };
        run.hp = Math.max(1, run.hp - 1);
        return { result: "ev_vending_kick_lose" };
      },
    },
    leave,
  ],
  dagashi: [
    {
      label: "ev_dagashi_buy",
      cost: 15,
      blocked: (run) => needsGold(15)(run) ?? needsSlot(run),
      apply: (run, rng) => {
        run.gold -= 15;
        return { result: "ev_dagashi_buy_r", item: giveConsumable(run, rng) };
      },
    },
    leave,
  ],
  homework: [
    {
      label: "ev_homework_return",
      blocked: () => null,
      apply: (run) => {
        run.gold += 20;
        return { result: "ev_homework_return_r" };
      },
    },
    {
      label: "ev_homework_copy",
      blocked: (run) => (RELICS.every((r) => run.hasRelic(r.id)) ? "chestEmpty" : null),
      apply: (run, rng) => {
        const relic = rng.pick(RELICS.filter((r) => !run.hasRelic(r.id)));
        run.relics.push(relic);
        run.onPurchase(relic);
        run.hp = Math.max(1, run.hp - 3);
        return { result: "ev_homework_copy_r", item: relic.id };
      },
    },
  ],
  infirmary: [
    {
      label: "ev_infirmary_rest",
      blocked: () => null,
      apply: (run) => {
        run.hp = Math.min(run.maxHp, run.hp + 1);
        return { result: "ev_infirmary_rest_r" };
      },
    },
    {
      label: "ev_infirmary_bandage",
      blocked: needsSlot,
      apply: (run) => {
        run.slots[freeSlot(run)] = CONSUMABLES.find((c) => c.id === "bandage")!;
        return { result: "ev_infirmary_bandage_r", item: "bandage" };
      },
    },
  ],
  transfer: [
    {
      label: "ev_transfer_accept",
      blocked: () => null,
      apply: (run) => {
        run.makeNextElite();
        return { result: "ev_transfer_accept_r" };
      },
    },
    leave,
  ],
  shrine: [
    {
      label: "ev_shrine_pray",
      blocked: (run) => (run.maxHp <= 2 ? "ev_shrine_too_weak" : RELICS.every((r) => run.hasRelic(r.id)) ? "chestEmpty" : null),
      apply: (run) => {
        run.maxHp -= 1;
        run.hp = Math.min(run.hp, run.maxHp);
        run.relicPick = run.offerChest();
        return { result: "ev_shrine_pray_r", chest: true };
      },
    },
    leave,
  ],
};

/** Events that make sense before the given next fight (no challenger before an elite or the boss). */
export function eventPool(nextIsElite: boolean): EventId[] {
  return EVENT_IDS.filter((id) => !(id === "transfer" && nextIsElite));
}
