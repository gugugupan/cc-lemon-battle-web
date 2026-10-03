import type { BeatClock } from "../audio/clock";
import { type EnemySpec, enemyStats, fightBpm } from "../core/battle";
import type { Item, Relic } from "../core/items";
import { type Character, startItems, startRelics } from "../core/characters";
import { GOAL_ROUNDS, REST_HEAL, REST_PRICE, type Run, sellPrice } from "../core/run";
import { type EventId, type EventOutcome, EVENTS } from "../core/events";
import type { ClearRecord, Volume } from "../game/progress";
import { currentLang, t } from "../i18n";
import { itemDesc, itemName, pips, seriesLabel } from "./hud";
import { attachTooltip, hideTooltip } from "./tooltip";

type Button = { label: string; onClick: () => void; primary?: boolean; ghost?: boolean; disabled?: boolean };

function h(html: string): HTMLElement {
  const wrap = document.createElement("div");
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild as HTMLElement;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function itemRow(item: Item): string {
  return `<div class="item-row"><span class="item-icon">${item.icon}</span><div><div class="item-name">${escape(itemName(item.id))}</div><div class="item-desc">${escape(itemDesc(item.id))}</div></div></div>`;
}

export function roundLabel(run: Run): string {
  return run.endless || run.round > GOAL_ROUNDS ? t("roundEndless", run.round) : t("roundGoal", run.round, GOAL_ROUNDS);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(currentLang() === "zh" ? "zh-CN" : "ja-JP", { year: "numeric", month: "short", day: "numeric" });
}

export function enemyName(spec: EnemySpec): string {
  if (spec.boss) return t("tut_sennin");
  return t(`name${spec.nameIndex}` as Parameters<typeof t>[0]);
}

export function enemyRank(spec: EnemySpec): string {
  return spec.elite ? `${t("eliteTag")}・${t(`rank${spec.rank}` as Parameters<typeof t>[0])}` : t(`rank${spec.rank}` as Parameters<typeof t>[0]);
}

export function personalityName(spec: EnemySpec): string {
  return t(`personality_${spec.personality}` as Parameters<typeof t>[0]);
}

/** Music and sound-effect sliders that apply as they move. */
function volumeSliders(current: Volume, onChange: (v: Volume) => void, preview: () => void): HTMLElement {
  const value = { ...current };
  const row = (key: keyof Volume) => `<label class="vol-row"><span class="vol-name">${t(key === "music" ? "volMusic" : "volSfx")}</span>
    <input type="range" min="0" max="100" step="5" value="${Math.round(value[key] * 100)}" data-vol="${key}">
    <span class="vol-value">${Math.round(value[key] * 100)}%</span></label>`;
  const wrap = h(`<div class="vol-sliders">${row("music")}${row("sfx")}</div>`);
  wrap.querySelectorAll<HTMLInputElement>("[data-vol]").forEach((input) => {
    const key = input.dataset.vol as keyof Volume;
    const label = input.parentElement!.querySelector(".vol-value")!;
    input.addEventListener("input", () => {
      value[key] = Number(input.value) / 100;
      label.textContent = value[key] === 0 ? t("volOff") : `${input.value}%`;
      onChange({ ...value });
    });
    if (key === "sfx") input.addEventListener("change", preview);
    if (value[key] === 0) label.textContent = t("volOff");
  });
  return wrap;
}

const EVENT_ICONS: Record<EventId, string> = { vending: "🥤", dagashi: "🍬", homework: "📒", infirmary: "🛏️", transfer: "🌀", shrine: "⛩️" };

const PERSONALITY_ICONS: Record<EnemySpec["personality"], string> = { brawler: "🔥", guardian: "🛡️", charger: "⚡", reader: "🧠", wild: "🎲" };

/** Full-screen overlay panels. Enter presses the panel's primary button. */
export class Screens {
  readonly root = h(`<div class="overlay hidden"></div>`);
  private primary: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  sfx: () => void = () => {};
  chestSfx: (phase: "shake" | "open" | "pick") => void = () => {};

  constructor(parent: HTMLElement) {
    parent.append(this.root);
  }

  get open(): boolean {
    return !this.root.classList.contains("hidden");
  }

  /** Returns true when the overlay consumed the key. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.open) return false;
    if (this.keyHandler?.(e)) return true;
    if ((e.key === "Enter" || e.key === " ") && this.primary) {
      e.preventDefault();
      this.primary();
      return true;
    }
    return true;
  }

  hide(): void {
    hideTooltip();
    this.root.classList.add("hidden");
    this.root.innerHTML = "";
    this.primary = null;
    this.keyHandler = null;
  }

  get onTitle(): boolean {
    return this.root.classList.contains("title");
  }

  private show(panel: HTMLElement, buttons: Button[], cls = ""): void {
    this.root.innerHTML = "";
    this.root.className = `overlay ${cls}`;
    this.primary = null;
    this.keyHandler = null;
    if (buttons.length) {
      const row = h(`<div class="button-row"></div>`);
      for (const b of buttons) {
        const button = h(`<button class="btn ${b.primary ? "primary" : ""} ${b.ghost ? "ghost" : ""}">${escape(b.label)}</button>`) as HTMLButtonElement;
        button.disabled = !!b.disabled;
        button.addEventListener("click", () => {
          this.sfx();
          b.onClick();
        });
        row.append(button);
        if (b.primary) this.primary = b.onClick;
      }
      panel.append(row);
    }
    this.root.append(panel);
  }

  title(
    best: number,
    clear: ClearRecord | null,
    tutorialDone: boolean,
    onTutorial: () => void,
    onStart: () => void,
    onCalibrate: () => void,
    onHowto: () => void,
    onLang: () => void,
    onVolume: () => void = () => {},
  ): void {
    const badge = clear
      ? `<div class="cleared-badge"><span class="cleared-main">${t("clearedBadge")}</span><span class="cleared-date">${t("clearedOn", formatDate(clear.first))}${clear.count > 1 ? t("clearedTimes", clear.count) : ""}</span></div>`
      : "";
    const panel = h(`<div class="panel title-panel ${clear ? "cleared" : ""}">
      <div class="logo"><span class="logo-lemon">${clear ? '<span class="crown">👑</span>' : ""}🍋</span><div><h1>${t("title")}</h1><p class="subtitle">${t("subtitle")}</p></div></div>
      ${badge}
      ${best > 0 ? `<div class="best">${t("best", best)}</div>` : ""}
      ${tutorialDone ? "" : `<p class="first-time">${t("tutorialFirst")}</p>`}
    </div>`);
    this.show(panel, [
      { label: t("start"), onClick: onStart, primary: true },
      { label: `${t("tutorial")}${tutorialDone ? " ✓" : ""}`, onClick: onTutorial },
      { label: t("howto"), onClick: onHowto },
      { label: t("calibrate"), onClick: onCalibrate },
      { label: t("volume"), onClick: onVolume, ghost: true },
      { label: t("language"), onClick: onLang, ghost: true },
    ], "title");
  }

  /**
   * Character select. `index` is the one shown first; `onShow` fires for every character browsed
   * (the stage shows its model).
   */
  select(
    characters: Character[],
    index: number,
    unlocked: (c: Character) => boolean,
    best: (c: Character) => number,
    onShow: (c: Character, unlocked: boolean) => void,
    onStart: (c: Character) => void,
    onBack: () => void,
  ): void {
    let i = index;
    const render = () => {
      const c = characters[i];
      const open = unlocked(c);
      onShow(c, open);
      const kit = [...startRelics(c), ...startItems(c)];
      const unlockText =
        c.unlock.type === "wins" ? t("unlockWins", c.unlock.n) : c.unlock.type === "buy" ? t("unlockBuy", itemName(c.unlock.item)) : "";
      const dots = characters
        .map((ch, j) => {
          const label = unlocked(ch) ? t(`char_${ch.id}` as Parameters<typeof t>[0]) : t("locked");
          return `<button class="char-dot ${j === i ? "on" : ""} ${unlocked(ch) ? "" : "locked"}" data-char="${j}" title="${escape(label)}" aria-label="${escape(label)}">${unlocked(ch) ? ch.icon : "🔒"}</button>`;
        })
        .join("");
      const panel = h(`<div class="panel select-panel">
        <div class="select-head"><h2>${t("chooseTitle")}</h2><span class="muted small">${t("chooseHint")}</span></div>
        <div class="char-dots">${dots}</div>
        <div class="char-card ${open ? "" : "locked"}">
          <button class="char-arrow" data-step="-1">◀</button>
          <div class="char-info">
            <div class="char-name">${open ? escape(t(`char_${c.id}` as Parameters<typeof t>[0])) : "？？？"}</div>
            <div class="char-role">${open ? escape(t(`char_${c.id}_role` as Parameters<typeof t>[0])) : escape(unlockText)}</div>
            ${open ? `
            <div class="char-stats"><span class="hearts">${pips(c.hp, c.hp, "heart", "heart empty")}</span><span class="gold">🪙 ${t("startGold", c.gold)}</span></div>
            <h3>${t("startKit")}</h3>
            <div class="item-list">${kit.length ? kit.map(itemRow).join("") : `<p class="muted">${t("none")}</p>`}</div>
            <div class="char-best">${best(c) > 0 ? t("charBest", best(c)) : t("charBestNone")}</div>` : `<div class="char-lock">${t("locked")}</div>`}
          </div>
          <button class="char-arrow" data-step="1">▶</button>
        </div>
      </div>`);
      panel.querySelectorAll<HTMLElement>("[data-step]").forEach((b) => b.addEventListener("click", () => step(Number(b.dataset.step))));
      panel.querySelectorAll<HTMLElement>("[data-char]").forEach((b) =>
        b.addEventListener("click", () => {
          i = Number(b.dataset.char);
          render();
        }),
      );
      this.show(panel, [
        { label: t("chooseStart"), onClick: () => onStart(c), primary: open, disabled: !open },
        { label: t("back"), onClick: onBack, ghost: true },
      ], "select");
      if (!open) this.primary = null;
      this.keyHandler = (e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          step(e.key === "ArrowLeft" ? -1 : 1);
          return true;
        }
        if (e.key === "Escape") {
          onBack();
          return true;
        }
        return false;
      };
    };
    const step = (d: number) => {
      i = (i + d + characters.length) % characters.length;
      this.sfx();
      render();
    };
    render();
  }

  /** Music and sound-effect sliders; changes apply (and are saved) as they move. */
  volume(current: Volume, onChange: (v: Volume) => void, preview: () => void, onBack: () => void): void {
    const panel = h(`<div class="panel vol-panel"><h2>${t("volume")}</h2><p class="muted small">${t("volHint")}</p></div>`);
    panel.querySelector("h2")!.after(volumeSliders(current, onChange, preview));
    this.show(panel, [{ label: t("back"), onClick: onBack, primary: true }]);
    this.keyHandler = (e) => {
      if (e.key === "Escape") {
        onBack();
        return true;
      }
      return false;
    };
  }

  /** Mid-fight pause: resume, volume, or give up the run (asks twice). */
  pause(current: Volume, onChange: (v: Volume) => void, onResume: () => void, onQuit: () => void): void {
    const panel = h(`<div class="panel vol-panel pause-panel"><h2>⏸ ${t("paused")}</h2></div>`);
    panel.append(volumeSliders(current, onChange, () => {}));
    let armed = false;
    this.show(panel, [
      { label: t("resume"), onClick: onResume, primary: true },
      {
        label: t("quitRun"),
        ghost: true,
        onClick: () => {
          if (armed) return onQuit();
          armed = true;
          const button = [...panel.querySelectorAll<HTMLButtonElement>(".btn")].pop()!;
          button.textContent = t("quitConfirm");
          button.classList.add("danger");
        },
      },
    ], "dim");
    this.keyHandler = (e) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        onResume();
        return true;
      }
      return false;
    };
  }

  /** 3・2・1 before a paused fight goes on; the beat is frozen meanwhile. */
  countdown(onDone: () => void): void {
    const panel = h(`<div class="countdown"></div>`);
    this.show(panel, [], "countdown-overlay");
    this.keyHandler = () => true;
    let n = 3;
    const tick = () => {
      if (n === 0) return onDone();
      panel.textContent = String(n);
      panel.classList.remove("pop");
      void panel.offsetWidth;
      panel.classList.add("pop");
      this.sfx();
      n--;
      window.setTimeout(tick, 600);
    };
    tick();
  }

  howto(onBack: () => void): void {
    const panel = h(`<div class="panel"><h2>${t("howto")}</h2><p class="howto">${escape(t("howtoBody")).replace(/\n/g, "<br>")}</p></div>`);
    this.show(panel, [{ label: t("back"), onClick: onBack, primary: true }]);
  }

  /** Plays clicks at 100 BPM; eight taps on the beat set the input offset to their average error. */
  calibrate(clock: BeatClock, onDone: () => void): void {
    const panel = h(`<div class="panel cal-panel"><h2>${t("calTitle")}</h2><p>${t("calHint")}</p>
      <div class="cal-dots">${"<i></i>".repeat(8)}</div><div class="cal-beat"></div>
      <p class="cal-status">${t("calCurrent", Math.round(clock.inputOffset * 1000))}</p></div>`);
    const dots = [...panel.querySelectorAll(".cal-dots i")] as HTMLElement[];
    const status = panel.querySelector(".cal-status")!;
    const pulse = panel.querySelector(".cal-beat") as HTMLElement;
    const deltas: number[] = [];
    const finish = () => {
      clock.stop();
      clock.groove = true;
      clock.onBeat = () => {};
      onDone();
    };
    const tap = (event: { timeStamp: number }) => {
      if (deltas.length >= 8) return;
      const pos = clock.inputBeat(event);
      if (pos < 1.5) return;
      deltas.push((pos - Math.round(pos)) * clock.secondsPerBeat);
      dots[deltas.length - 1].classList.add("on");
      if (deltas.length === 8) {
        const sorted = [...deltas].sort((a, b) => a - b).slice(1, 7);
        const avg = sorted.reduce((s, d) => s + d, 0) / sorted.length;
        clock.setInputOffset(clock.inputOffset + avg);
        status.textContent = t("calResult", Math.round(avg * 1000));
      }
    };
    clock.groove = false;
    clock.barSound = () => "call";
    clock.onBeat = () => {
      pulse.classList.remove("go");
      void pulse.offsetWidth;
      pulse.classList.add("go");
    };
    clock.start(100, 0.5);
    panel.addEventListener("pointerdown", (e) => {
      if ((e.target as HTMLElement).closest("button")) return;
      tap(e);
    });
    this.show(panel, [
      { label: t("calReset"), onClick: () => { clock.setInputOffset(0); status.textContent = t("calCurrent", 0); deltas.length = 0; dots.forEach((d) => d.classList.remove("on")); }, ghost: true },
      { label: t("done"), onClick: finish, primary: true },
    ]);
    this.keyHandler = (e) => {
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) tap(e);
        return true;
      }
      return false;
    };
  }

  intro(run: Run, onFight: () => void): void {
    const e = run.enemy;
    const stats = enemyStats(e);
    const relics = e.relics.length ? e.relics.map(itemRow).join("") : `<p class="muted">${t("none")}</p>`;
    const panel = h(`<div class="panel intro-panel ${e.elite ? "elite" : ""}" style="--accent:${e.color}">
      <div class="intro-head"><span class="vs">${e.boss ? `<span class="elite-tag">👑 ${t("bossTag")}</span>` : e.elite ? `<span class="elite-tag">⚠ ${t("eliteTag")}</span>` : t("introVs")}</span><span class="round-chip">${roundLabel(run)}</span></div>
      <div class="intro-body">
        <div class="avatar" style="background:${e.color}"><span>${PERSONALITY_ICONS[e.personality]}</span></div>
        <div class="intro-info">
          <div class="intro-name">${escape(enemyName(e))}</div>
          <div class="rank-tag">${escape(enemyRank(e))}</div>
          <div class="personality"><span class="personality-name">${escape(personalityName(e))}</span><span class="personality-hint">${escape(t(`personality_${e.personality}_hint` as Parameters<typeof t>[0]))}</span></div>
          <dl class="stats">
            <dt>${t("hp")}</dt><dd class="hearts">${pips(stats.maxHp, stats.maxHp, "heart", "heart empty")}</dd>
            <dt>${t("energy")}</dt><dd class="energy">${pips(stats.startEnergy, stats.maxEnergy, "lemon", "lemon empty")}</dd>
            <dt>${t("tempo")}</dt><dd>♩ ${fightBpm(e, run.relics)}</dd>
            <dt>${t("tellRate")}</dt><dd>${Math.round(e.tellChance * 100)}%</dd>
            ${e.chargeBonus > 0 ? `<dt>${t("action_charge")}</dt><dd class="warn">${t("chargeBonusNote")}</dd>` : ""}
          </dl>
        </div>
      </div>
      ${e.boss ? `<p class="boss-note">⚠ ${t("bossHint", e.boss.relics.length)}</p>` : ""}
      <h3>${t("relics")}</h3><div class="item-list">${relics}</div>
      <p class="muted center">${t("tapToStart")}</p>
    </div>`);
    this.show(panel, [{ label: t("fight"), onClick: onFight, primary: true }], "dim");
  }

  cleared(record: ClearRecord, run: Run, unlockedNames: string[], onEnd: () => void, onEndless: () => void): void {
    const letters = [...t("clearTitle")].map((c, i) => `<span style="animation-delay:${i * 0.08}s">${escape(c)}</span>`).join("");
    const panel = h(`<div class="panel banner-panel clear-panel">
      <div class="trophy">🏆</div>
      <h1 class="clear-title">${letters}</h1>
      <p>${t("clearBody", GOAL_ROUNDS)}</p>
      <p class="muted">${t("clearCount", record.count)}</p>
      <p class="muted small">${t("clearEndlessHint")}</p>
      ${unlockedNames.map((n) => `<p class="unlock-note">${escape(t("unlockedNew", n))}</p>`).join("")}
      ${runSummary(run, false)}
    </div>`);
    this.attachSummaryTips(panel, run);
    this.show(panel, [
      { label: t("clearEndless"), onClick: onEndless, primary: true },
      { label: t("clearEnd"), onClick: onEnd },
    ], "dim clear");
  }

  /**
   * Treasure chest: it shakes, pops open and deals out the relics on offer; one must be taken.
   * Used for the shop's chest and an elite's free reward alike.
   */
  chest(relics: Relic[], title: string, onPick: (index: number) => void): void {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const cards = relics
      .map(
        (r, i) => `<button class="shop-card relic chest-card" data-pick="${i}" style="--i:${i};--n:${relics.length}" disabled>
          <span class="item-icon big">${r.icon}</span><span class="item-name">${escape(itemName(r.id))}</span>${r.series ? `<span class="series-chip series-${r.series}">${escape(seriesLabel(r))}</span>` : ""}<span class="item-desc">${escape(itemDesc(r.id))}</span>
          <span class="card-key">${i + 1}</span></button>`,
      )
      .join("");
    const bubbles = Array.from({ length: 14 }, (_, i) => `<i style="--a:${(i * 360) / 14}deg;--d:${0.6 + (i % 4) * 0.25}"></i>`).join("");
    const panel = h(`<div class="panel pick-panel chest-panel">
      <h2>🎁 ${escape(title)}</h2>
      <div class="chest-stage">
        <div class="chest-glow"></div>
        <div class="chest-bubbles">${bubbles}</div>
        <div class="chest"><div class="chest-lid"><span class="chest-band"></span></div><div class="chest-body"><span class="chest-band"></span><span class="chest-lock"></span></div></div>
      </div>
      <div class="stock pick chest-cards">${cards}</div>
    </div>`);
    let picked = false;
    let ready = false;
    const timers: number[] = [];
    const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, reduced ? Math.min(ms, 60) : ms));
    const reveal = () => {
      if (ready) return;
      ready = true;
      timers.forEach((id) => window.clearTimeout(id));
      panel.classList.add("shaking", "open", "dealt");
      panel.querySelectorAll<HTMLButtonElement>("[data-pick]").forEach((b) => (b.disabled = false));
    };
    const pick = (i: number) => {
      if (picked || !ready || i < 0 || i >= relics.length) return;
      picked = true;
      this.chestSfx("pick");
      panel.classList.add("picked");
      panel.querySelector(`[data-pick="${i}"]`)?.classList.add("chosen");
      window.setTimeout(() => onPick(i), reduced ? 0 : 650);
    };
    panel.querySelectorAll<HTMLElement>("[data-pick]").forEach((b) => b.addEventListener("click", () => pick(Number(b.dataset.pick))));
    panel.querySelector(".chest-stage")!.addEventListener("click", reveal);
    this.show(panel, [], "dim");
    panel.querySelectorAll<HTMLElement>("[data-pick]").forEach((b, i) => attachTooltip(b, relics[i]));
    this.keyHandler = (e) => {
      const n = Number(e.key);
      if (n >= 1 && n <= relics.length) pick(n - 1);
      else if (e.key === "Enter" || e.key === " ") reveal();
      return true;
    };
    later(80, () => {
      panel.classList.add("shaking");
      this.chestSfx("shake");
    });
    later(950, () => {
      panel.classList.add("open");
      this.chestSfx("open");
    });
    later(1250, () => panel.classList.add("dealt"));
    later(1250 + 160 * relics.length + 450, reveal);
  }

  /** A between-fights event: pick a choice, see what happened, then go on. */
  event(id: EventId, run: Run, onChoose: (index: number) => EventOutcome | null, onDone: (outcome: EventOutcome) => void): void {
    const choices = EVENTS[id]
      .map((c, i) => {
        const blocked = c.blocked(run);
        const cost = c.cost ? `<span class="price">${t("buy", c.cost)}</span>` : "";
        return `<button class="event-choice" data-choice="${i}" ${blocked ? "disabled" : ""}><span>${escape(t(c.label as Parameters<typeof t>[0]))}</span>${cost}${blocked ? `<small>${escape(t(blocked as Parameters<typeof t>[0]))}</small>` : ""}</button>`;
      })
      .join("");
    const panel = h(`<div class="panel event-panel">
      <div class="event-icon">${EVENT_ICONS[id]}</div>
      <h2>${escape(t(`ev_${id}` as Parameters<typeof t>[0]))}</h2>
      <p class="event-text">${escape(t(`ev_${id}_text` as Parameters<typeof t>[0]))}</p>
      <div class="event-status"><span class="hearts">${pips(run.hp, run.maxHp, "heart", "heart empty")}</span><span class="gold">🪙 ${t("gold", run.gold)}</span></div>
      <div class="event-choices">${choices}</div>
    </div>`);
    panel.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((b) =>
      b.addEventListener("click", () => {
        const outcome = onChoose(Number(b.dataset.choice));
        if (!outcome) return;
        this.sfx();
        const gained = outcome.item ? t("ev_gained", escape(itemName(outcome.item))) : "";
        const result = h(`<div class="panel event-panel">
          <div class="event-icon">${EVENT_ICONS[id]}</div>
          <p class="event-text">${escape(t(outcome.result as Parameters<typeof t>[0]))}</p>
          ${gained ? `<p class="event-gain">${gained}</p>` : ""}
          <div class="event-status"><span class="hearts">${pips(run.hp, run.maxHp, "heart", "heart empty")}</span><span class="gold">🪙 ${t("gold", run.gold)}</span></div>
        </div>`);
        this.show(result, [{ label: t("next"), onClick: () => onDone(outcome), primary: true }], "dim");
      }),
    );
    this.show(panel, [], "dim");
    this.keyHandler = (e) => {
      const n = Number(e.key);
      const button = panel.querySelector<HTMLButtonElement>(`[data-choice="${n - 1}"]`);
      if (button && !button.disabled) button.click();
      return true;
    };
  }

  victory(gold: number, elite: boolean, onNext: () => void): void {
    const panel = h(`<div class="panel banner-panel win"><h1>${t("win")}</h1><p>${elite ? t("eliteReward", gold) : t("reward", gold)}</p></div>`);
    this.show(panel, [{ label: t("toShop"), onClick: onNext, primary: true }], "dim");
  }

  /** `onBought` may return a line to add under the purchase message (e.g. a new unlock). */
  shop(run: Run, onNext: () => void, feedback: (ok: boolean) => void, onBought: () => string = () => ""): void {
    let selected: number | null = null;
    let message = "";
    const render = () => {
      const stock = run.stock
        .map((s, i) => {
          return `<button class="shop-card ${s.item.kind} ${s.sold ? "sold" : ""}" data-buy="${i}" ${s.sold ? "disabled" : ""}>
            <span class="item-icon big">${s.item.icon}</span>
            <span class="item-name">${escape(itemName(s.item.id))}</span>
            ${s.item.series ? `<span class="series-chip series-${s.item.series}">${escape(seriesLabel(s.item))}</span>` : ""}
            <span class="item-desc">${escape(itemDesc(s.item.id))}</span>
            <span class="price">${s.sold ? t("sold") : t("buy", s.item.price)}</span></button>`;
        })
        .join("");
      const rest = `<button class="shop-card rest ${run.canRest() ? "" : "sold"}" data-rest ${run.canRest() ? "" : "disabled"}>
            <span class="item-icon big">🛏️</span>
            <span class="item-name">${t("restName")}</span>
            <span class="item-desc">${t("restDesc", REST_HEAL)}</span>
            <span class="price">${run.canRest() ? t("buy", REST_PRICE) : t("hpFull")}</span></button>`;
      const chestOpen = !run.chestSold;
      const chest = `<button class="shop-card chest-offer ${chestOpen ? "" : "sold"}" data-chest ${chestOpen ? "" : "disabled"}>
            <span class="item-icon big"><span class="mini-chest"></span></span>
            <span class="chest-text"><span class="item-name">${t("chestName")} <span class="tag">${t("relicTag")}</span></span>
            <span class="item-desc">${t("chestDesc")}</span></span>
            <span class="price">${chestOpen ? t("buy", run.chestPrice()) : t("sold")}</span></button>`;
      const slots = run.slots
        .map((s, i) => `<button class="slot ${s ? "" : "empty"} ${selected === i ? "selected" : ""}" data-slot="${i}"><span class="slot-key">${i + 1}</span><span class="slot-icon">${s?.icon ?? ""}</span></button>`)
        .join("");
      const sellRow = (item: Item, attr: string) =>
        `<div class="sell-row ${item.kind}"><span class="item-icon">${item.icon}</span><span class="sell-name">${escape(itemName(item.id))}<span class="tag">${item.kind === "relic" ? t("relicTag") : t("items")}</span></span><button class="sell" ${attr}>${t("sell", sellPrice(item))}</button></div>`;
      const owned = [
        ...run.relics.map((r, i) => sellRow(r, `data-sell-relic="${i}"`)),
        ...run.slots.flatMap((s, i) => (s ? [sellRow(s, `data-sell-slot="${i}"`)] : [])),
      ].join("") || `<p class="muted">${t("none")}</p>`;
      const panel = h(`<div class="panel shop-panel">
        <div class="shop-head"><h2>🏪 ${t("shop")}</h2><div class="gold">🪙 ${t("gold", run.gold)}</div></div>
        <p class="muted">${t("shopHint")}</p>
        <div class="stock featured">${chest}</div>
        <div class="stock">${rest}${stock}</div>
        <h3>${t("owned")}</h3>
        <div class="owned"><div class="hearts">${pips(run.hp, run.maxHp, "heart", "heart empty")}</div><div class="slots">${slots}</div></div>
        <div class="sell-list">${owned}</div>
        <p class="muted small">${t("slotsHint")}</p>
        <p class="shop-msg">${message}</p>
      </div>`);
      panel.querySelectorAll<HTMLElement>("[data-buy]").forEach((b) =>
        b.addEventListener("click", () => {
          const result = run.buy(Number(b.dataset.buy));
          message = t(result);
          if (result === "ok") {
            const extra = onBought();
            if (extra) message = `${message}　${extra}`;
          }
          feedback(result === "ok");
          render();
        }),
      );
      panel.querySelectorAll<HTMLElement>("[data-chest]").forEach((b) =>
        b.addEventListener("click", () => {
          const result = run.buyChest();
          feedback(result === "ok");
          if (result !== "ok") {
            message = t(result === "sold_out" && !run.chestSold && run.relicPick.length === 0 ? "chestEmpty" : result);
            render();
            return;
          }
          this.chest(run.relicPick, t("chestTitle"), (i) => {
            const relic = run.takePick(i);
            message = relic ? t("chestGot", escape(itemName(relic.id))) : "";
            const extra = onBought();
            if (extra) message = `${message}　${extra}`;
            render();
          });
        }),
      );
      panel.querySelectorAll<HTMLElement>("[data-rest]").forEach((b) =>
        b.addEventListener("click", () => {
          const result = run.rest();
          message = t(result);
          feedback(result === "ok");
          render();
        }),
      );
      hideTooltip();
      panel.querySelectorAll<HTMLElement>("[data-sell-relic]").forEach((b) => attachTooltip(b.closest(".sell-row") as HTMLElement, run.relics[Number(b.dataset.sellRelic)]));
      panel.querySelectorAll<HTMLElement>("[data-sell-slot]").forEach((b) => attachTooltip(b.closest(".sell-row") as HTMLElement, run.slots[Number(b.dataset.sellSlot)]!));
      panel.querySelectorAll<HTMLElement>("[data-sell-relic]").forEach((b) =>
        b.addEventListener("click", () => {
          const gold = run.sellRelic(Number(b.dataset.sellRelic));
          message = t("soldFor", gold);
          feedback(gold > 0);
          render();
        }),
      );
      panel.querySelectorAll<HTMLElement>("[data-sell-slot]").forEach((b) =>
        b.addEventListener("click", () => {
          const gold = run.sellSlot(Number(b.dataset.sellSlot));
          message = t("soldFor", gold);
          feedback(gold > 0);
          selected = null;
          render();
        }),
      );
      panel.querySelectorAll<HTMLElement>("[data-slot]").forEach((b) => {
        const item = run.slots[Number(b.dataset.slot)];
        if (item) attachTooltip(b, item);
      });
      panel.querySelectorAll<HTMLElement>("[data-slot]").forEach((b) =>
        b.addEventListener("click", () => {
          const i = Number(b.dataset.slot);
          if (selected === null) selected = i;
          else {
            run.swapSlots(selected, i);
            selected = null;
          }
          render();
        }),
      );
      this.show(panel, [{ label: t("next"), onClick: onNext, primary: true }], "dim scroll");
    };
    render();
  }

  gameOver(run: Run, newBest: boolean, unlockedNames: string[], onAgain: () => void, onTitle: () => void): void {
    const unlocks = unlockedNames.map((n) => `<p class="unlock-note">${escape(t("unlockedNew", n))}</p>`).join("");
    const panel = h(`<div class="panel banner-panel lose summary-panel"><h1>${t("gameOver")}</h1><p>${t("result", run.wins)}</p>${newBest ? `<p class="new-best">${t("newBest")}</p>` : ""}${unlocks}${runSummary(run, true)}</div>`);
    this.attachSummaryTips(panel, run);
    this.show(panel, [
      { label: t("again"), onClick: onAgain, primary: true },
      { label: t("toTitle"), onClick: onTitle },
    ], "dim scroll");
  }

  private attachSummaryTips(panel: HTMLElement, run: Run): void {
    const items: Item[] = [...run.relics, ...run.enemy.relics, ...run.slots.filter((s): s is NonNullable<typeof s> => !!s)];
    panel.querySelectorAll<HTMLElement>("[data-tip]").forEach((chip) => {
      const item = items.find((i) => i.id === chip.dataset.tip);
      if (item) attachTooltip(chip, item);
    });
  }
}

/** Stats, kit and (after a loss) the enemy that ended the run. */
function runSummary(run: Run, lost: boolean): string {
  const s = run.stats;
  const chip = (i: Item) => `<span class="relic-chip" data-tip="${i.id}">${i.icon}</span>`;
  const kit = [...run.relics, ...run.slots.filter((x): x is NonNullable<typeof x> => !!x)];
  const tile = (value: string | number, label: string) => `<div class="stat-tile"><b>${value}</b><span>${label}</span></div>`;
  const e = run.enemy;
  const killer = lost
    ? `<h3>${t("sumDefeatedBy")}</h3><div class="killer" style="--accent:${e.color}"><span class="avatar small" style="background:${e.color}">${PERSONALITY_ICONS[e.personality]}</span>
        <div><div class="killer-name">${escape(enemyName(e))}</div><div class="muted small">${escape(personalityName(e))}${e.elite ? ` ・ ${t("eliteTag")}` : ""}</div>
        <div class="chips">${e.relics.map(chip).join("") || `<span class="muted small">${t("none")}</span>`}</div></div></div>`
    : "";
  return `<div class="run-summary">
    <div class="sum-head"><span>${escape(t(`char_${run.character.id}` as Parameters<typeof t>[0]))}</span><span>${roundLabel(run)}</span></div>
    <div class="stat-grid">
      ${tile(s.bestCombo, t("sumCombo"))}
      ${tile(s.judged ? `${Math.round((s.perfects / s.judged) * 100)}%` : "—", t("sumPerfect"))}
      ${tile(s.damageDealt, t("sumDealt"))}
      ${tile(s.damageTaken, t("sumTaken"))}
      ${tile(s.fevers, t("sumFever"))}
    </div>
    ${killer}
    <h3>${t("sumKit")}</h3><div class="chips">${kit.map(chip).join("") || `<span class="muted small">${t("none")}</span>`}</div>
  </div>`;
}
