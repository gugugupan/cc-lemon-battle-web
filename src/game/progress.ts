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

export function loadBest(): number {
  return Number(read(BEST_KEY) ?? 0) || 0;
}

export function saveBest(wins: number): void {
  write(BEST_KEY, String(wins));
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
