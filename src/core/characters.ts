import { type Consumable, itemById, type Relic } from "./items";

/** How a character becomes selectable. Unlocks are permanent once earned. */
export type Unlock =
  | { type: "default" }
  /** Best streak with any character reaches this many wins. */
  | { type: "wins"; n: number }
  /** This item has been bought in the shop at least once, in any run. */
  | { type: "buy"; item: string };

export interface Character {
  id: string;
  /** Model file under public/models. */
  model: string;
  hp: number;
  gold: number;
  relics: string[];
  items: string[];
  unlock: Unlock;
}

export const CHARACTERS: Character[] = [
  { id: "normal", model: "character-male-a", hp: 5, gold: 40, relics: [], items: ["bandage"], unlock: { type: "default" } },
  { id: "librarian", model: "character-female-e", hp: 5, gold: 40, relics: ["tea_break"], items: ["bandage"], unlock: { type: "default" } },
  { id: "baseball", model: "character-male-f", hp: 5, gold: 30, relics: ["follow_up"], items: ["wraps"], unlock: { type: "default" } },
  { id: "prefect", model: "character-male-c", hp: 5, gold: 20, relics: ["counter"], items: ["shield_sticker"], unlock: { type: "default" } },
  { id: "brass", model: "character-female-b", hp: 5, gold: 20, relics: ["breathing"], items: ["ramune"], unlock: { type: "buy", item: "breathing" } },
  { id: "sleuth", model: "character-female-d", hp: 5, gold: 20, relics: ["detective"], items: [], unlock: { type: "buy", item: "detective" } },
  { id: "blaster", model: "character-male-d", hp: 4, gold: 20, relics: ["discount"], items: ["lemon_bomb"], unlock: { type: "wins", n: 8 } },
  { id: "transfer", model: "character-female-a", hp: 3, gold: 50, relics: ["double_time", "hot_blood"], items: [], unlock: { type: "wins", n: 20 } },
];

export function characterById(id: string): Character {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function startRelics(c: Character): Relic[] {
  return c.relics.map((id) => itemById(id) as Relic);
}

export function startItems(c: Character): Consumable[] {
  return c.items.map((id) => itemById(id) as Consumable);
}

/** Whether the unlock is earned, given the best streak ever and every item ever bought. */
export function isUnlocked(c: Character, bestWins: number, bought: ReadonlySet<string>): boolean {
  switch (c.unlock.type) {
    case "default":
      return true;
    case "wins":
      return bestWins >= c.unlock.n;
    case "buy":
      return bought.has(c.unlock.item);
  }
}
