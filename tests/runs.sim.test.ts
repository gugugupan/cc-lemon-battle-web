import { it } from "vitest";
import { CHARACTERS } from "../src/core/characters";
import { simulateRun, type Strategy } from "../src/core/sim";

const ENABLED = !!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SIM;
const RUNS = 300;

/** Full-run balance report per character: `npm run sim:runs` (skipped in the normal test run). */
it.runIf(ENABLED)("clear rate per character over full runs", () => {
  const rows = ["| Character | sensible clear / avg wins | tell_reader clear / avg wins |", "|---|---|---|"];
  for (const c of CHARACTERS) {
    const cells = (["sensible", "tell_reader"] as Strategy[]).map((s) => {
      let clears = 0;
      let wins = 0;
      for (let g = 0; g < RUNS; g++) {
        const w = simulateRun(c, s, 0.6, g + 1);
        wins += w;
        if (w >= 20) clears++;
      }
      return `${((clears / RUNS) * 100).toFixed(0)}% / ${(wins / RUNS).toFixed(1)}`;
    });
    rows.push(`| ${c.id} | ${cells.join(" | ")} |`);
  }
  console.log(rows.join("\n"));
}, 1_800_000);
