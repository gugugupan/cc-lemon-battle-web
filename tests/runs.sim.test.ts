import { expect, it } from "vitest";
import { CHARACTERS } from "../src/core/characters";
import { CASUAL, type PlayerModel, sampleBuilds, type Shopper, simulateRun, SKILLED } from "../src/core/sim";

const ENABLED = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM;
const RUNS = 300;
/** Clear-rate target for a skilled player who shops for the strongest relics. */
const SKILLED_CLEAR = { min: 0.25, max: 0.4 };

function clearRate(player: PlayerModel, shopper: Shopper, characterId: string): { clear: number; wins: number } {
  const c = CHARACTERS.find((x) => x.id === characterId)!;
  let clears = 0;
  let wins = 0;
  for (let g = 0; g < RUNS; g++) {
    const w = simulateRun(c, player, g + 1, shopper);
    wins += w;
    if (w >= 20) clears++;
  }
  return { clear: clears / RUNS, wins: wins / RUNS };
}

/** Full-run balance report per character: `npm run sim:runs` (skipped in the normal test run). */
it.runIf(ENABLED)("clear rate per character over full runs", () => {
  const ranking = sampleBuilds(15, 7, 7, SKILLED, 300, 40).marginal.map((m) => m.id);
  console.log(`relic ranking used by the greedy shopper: ${ranking.join(", ")}`);
  const rows = ["| Character | casual | skilled, random picks | skilled, greedy picks |", "|---|---|---|---|"];
  const greedy: number[] = [];
  for (const c of CHARACTERS) {
    const cells = [clearRate(CASUAL, "random", c.id), clearRate(SKILLED, "random", c.id), clearRate(SKILLED, { ranking }, c.id)];
    greedy.push(cells[2].clear);
    rows.push(`| ${c.id} | ${cells.map((r) => `${(r.clear * 100).toFixed(0)}% / ${r.wins.toFixed(1)}`).join(" | ")} |`);
  }
  console.log(`clear % / average wins\n${rows.join("\n")}`);
  const average = greedy.reduce((a, b) => a + b, 0) / greedy.length;
  console.log(`skilled greedy average clear ${(average * 100).toFixed(0)}% (target ${SKILLED_CLEAR.min * 100}–${SKILLED_CLEAR.max * 100}%)`);
  expect(average).toBeGreaterThanOrEqual(SKILLED_CLEAR.min);
  expect(average).toBeLessThanOrEqual(SKILLED_CLEAR.max);
}, 1_800_000);

/** Stacked-equipment report: `npm run sim:builds`. */
it.runIf(ENABLED)("random relic builds per stage", () => {
  for (const [round, count, hp] of [[10, 4, 6], [15, 6, 7], [20, 8, 8]]) {
    const r = sampleBuilds(round, count, hp, SKILLED, 400, 40);
    const q = (p: number) => `${(r.rates[Math.floor(p * (r.rates.length - 1))] * 100).toFixed(0)}%`;
    console.log(`\nfight ${round}, ${count} relics, ${hp} HP: best ${q(0)}  top 10% ${q(0.1)}  median ${q(0.5)}  bottom 10% ${q(0.9)}`);
    console.log(r.marginal.map((m) => `  ${m.id.padEnd(13)} ${(m.delta * 100).toFixed(1).padStart(6)}`).join("\n"));
    console.log(`  best builds:\n${r.top.map((b) => `    ${(b.rate * 100).toFixed(0)}% ${b.ids.join(", ")}`).join("\n")}`);
  }
}, 1_800_000);
