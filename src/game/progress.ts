/** What the browser remembers between visits: best streak and when the game was cleared. */

const BEST_KEY = "cc-lemon:best";
const CLEAR_KEY = "cc-lemon:clear";

export interface ClearRecord {
  /** ISO timestamps. */
  first: string;
  last: string;
  count: number;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // not kept; the game still works for this visit
  }
}

const BESTS_KEY = "cc-lemon:bests";
const BOUGHT_KEY = "cc-lemon:bought";
const LAST_CHARACTER_KEY = "cc-lemon:character";

function readJson<T>(key: string, fallback: T): T {
  const raw = read(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Best streak per character id. */
export function loadBests(): Record<string, number> {
  return readJson<Record<string, number>>(BESTS_KEY, {});
}

/** Best streak with any character (older saves only kept one overall number). */
export function loadBest(): number {
  const legacy = Number(read(BEST_KEY) ?? 0) || 0;
  return Math.max(legacy, 0, ...Object.values(loadBests()));
}

/** Records a finished streak; returns true when it beats this character's best. */
export function saveBestFor(character: string, wins: number): boolean {
  const bests = loadBests();
  if (wins <= (bests[character] ?? 0)) return false;
  bests[character] = wins;
  write(BESTS_KEY, JSON.stringify(bests));
  return true;
}

/** Every item id ever bought in the shop, for purchase-based unlocks. */
export function loadBought(): Set<string> {
  return new Set(readJson<string[]>(BOUGHT_KEY, []));
}

export function recordBought(id: string): void {
  const bought = loadBought();
  if (bought.has(id)) return;
  bought.add(id);
  write(BOUGHT_KEY, JSON.stringify([...bought]));
}

export function loadLastCharacter(): string {
  return read(LAST_CHARACTER_KEY) ?? "normal";
}

export function saveLastCharacter(id: string): void {
  write(LAST_CHARACTER_KEY, id);
}

export function loadClear(): ClearRecord | null {
  const raw = read(CLEAR_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as ClearRecord;
    return typeof record.first === "string" ? record : null;
  } catch {
    return null;
  }
}

export function recordClear(now = new Date()): ClearRecord {
  const previous = loadClear();
  const record: ClearRecord = {
    first: previous?.first ?? now.toISOString(),
    last: now.toISOString(),
    count: (previous?.count ?? 0) + 1,
  };
  write(CLEAR_KEY, JSON.stringify(record));
  return record;
}

const TUTORIAL_KEY = "cc-lemon:tutorial";

export function loadTutorialDone(): boolean {
  return read(TUTORIAL_KEY) === "done";
}

export function saveTutorialDone(): void {
  write(TUTORIAL_KEY, "done");
}
