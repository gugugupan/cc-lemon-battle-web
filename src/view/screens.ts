import type { BeatClock } from "../audio/clock";
import { type EnemySpec, fightBpm } from "../core/battle";
import type { Item } from "../core/items";
import { type Run, sellPrice, SERVICES, type ServiceId } from "../core/run";
import { t } from "../i18n";
import { itemDesc, itemName, pips } from "./hud";
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

export function enemyName(spec: EnemySpec): string {
  return t(`name${spec.nameIndex}` as Parameters<typeof t>[0]);
}

export function enemyRank(spec: EnemySpec): string {
  return t(`rank${spec.rank}` as Parameters<typeof t>[0]);
}

/** Full-screen overlay panels. Enter presses the panel's primary button. */
export class Screens {
  readonly root = h(`<div class="overlay hidden"></div>`);
  private primary: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => boolean) | null = null;
  sfx: () => void = () => {};

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

  title(best: number, onStart: () => void, onCalibrate: () => void, onHowto: () => void, onLang: () => void): void {
    const panel = h(`<div class="panel title-panel">
      <div class="logo"><span class="logo-lemon">🍋</span><div><h1>${t("title")}</h1><p class="subtitle">${t("subtitle")}</p></div></div>
      ${best > 0 ? `<div class="best">${t("best", best)}</div>` : ""}
    </div>`);
    this.show(panel, [
      { label: t("start"), onClick: onStart, primary: true },
      { label: t("howto"), onClick: onHowto },
      { label: t("calibrate"), onClick: onCalibrate },
      { label: t("language"), onClick: onLang, ghost: true },
    ], "title");
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
    const relics = e.relics.length ? e.relics.map(itemRow).join("") : `<p class="muted">${t("none")}</p>`;
    const panel = h(`<div class="panel intro-panel" style="--accent:${e.color}">
      <div class="intro-head"><span class="vs">${t("introVs")}</span><span class="round-chip">${t("round", run.round)}</span></div>
      <div class="intro-body">
        <div class="avatar" style="background:${e.color}"><span>${escape(enemyName(e).slice(-1))}</span></div>
        <div class="intro-info">
          <div class="intro-name">${escape(enemyName(e))}</div>
          <div class="rank-tag">${escape(enemyRank(e))}</div>
          <dl class="stats">
            <dt>${t("hp")}</dt><dd class="hearts">${pips(e.maxHp, e.maxHp, "heart", "heart empty")}</dd>
            <dt>${t("energy")}</dt><dd class="energy">${pips(e.startEnergy, e.maxEnergy, "lemon", "lemon empty")}</dd>
            <dt>${t("tempo")}</dt><dd>♩ ${fightBpm(e, run.relics)}</dd>
            <dt>${t("tellRate")}</dt><dd>${Math.round(e.tellChance * 100)}%</dd>
          </dl>
        </div>
      </div>
      <h3>${t("relics")}</h3><div class="item-list">${relics}</div>
      <p class="muted center">${t("tapToStart")}</p>
    </div>`);
    this.show(panel, [{ label: t("fight"), onClick: onFight, primary: true }], "dim");
  }

  victory(gold: number, onNext: () => void): void {
    const panel = h(`<div class="panel banner-panel win"><h1>${t("win")}</h1><p>${t("reward", gold)}</p></div>`);
    this.show(panel, [{ label: t("toShop"), onClick: onNext, primary: true }], "dim");
  }

  shop(run: Run, onNext: () => void, feedback: (ok: boolean) => void): void {
    let selected: number | null = null;
    let message = "";
    const render = () => {
      const stock = run.stock
        .map((s, i) => {
          const tag = s.item.kind === "relic" ? `<span class="tag">${t("relicTag")}</span>` : "";
          return `<button class="shop-card ${s.item.kind} ${s.sold ? "sold" : ""}" data-buy="${i}" ${s.sold ? "disabled" : ""}>
            <span class="item-icon big">${s.item.icon}</span>
            <span class="item-name">${escape(itemName(s.item.id))} ${tag}</span>
            <span class="item-desc">${escape(itemDesc(s.item.id))}</span>
            <span class="price">${s.sold ? t("sold") : t("buy", s.item.price)}</span></button>`;
        })
        .join("");
      const services = (Object.keys(SERVICES) as ServiceId[])
        .map((id) => `<button class="service" data-service="${id}" ${run.serviceAvailable(id) ? "" : "disabled"}><span>${t(`svc_${id}`)}</span><span class="price">${t("buy", SERVICES[id].price)}</span></button>`)
        .join("");
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
        <div class="stock">${stock}</div>
        <h3>${t("services")}</h3><div class="services">${services}</div>
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
          feedback(result === "ok");
          render();
        }),
      );
      panel.querySelectorAll<HTMLElement>("[data-service]").forEach((b) =>
        b.addEventListener("click", () => {
          const result = run.buyService(b.dataset.service as ServiceId);
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

  gameOver(wins: number, newBest: boolean, onAgain: () => void, onTitle: () => void): void {
    const panel = h(`<div class="panel banner-panel lose"><h1>${t("gameOver")}</h1><p>${t("result", wins)}</p>${newBest ? `<p class="new-best">${t("newBest")}</p>` : ""}</div>`);
    this.show(panel, [
      { label: t("again"), onClick: onAgain, primary: true },
      { label: t("toTitle"), onClick: onTitle },
    ], "dim");
  }
}
