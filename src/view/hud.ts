import type { Consumable, Relic } from "../core/items";
import type { ActionId, Fighter } from "../core/rules";
import { ACTIONS } from "../core/rules";
import { t } from "../i18n";
import { ACTION_COLORS, ACTION_ICONS } from "./stage";

export const ACTION_KEYS: Record<ActionId, string> = { special: "↑", guard: "←", attack: "→", charge: "↓" };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function itemName(id: string): string {
  return t(`item_${id}` as Parameters<typeof t>[0]);
}

export function itemDesc(id: string): string {
  return t(`item_${id}_desc` as Parameters<typeof t>[0]);
}

export function pips(count: number, max: number, filled: string, empty: string): string {
  let out = "";
  for (let i = 0; i < max; i++) out += `<i class="${i < count ? filled : empty}"></i>`;
  return out;
}

interface Side {
  root: HTMLElement;
  name: HTMLElement;
  tag: HTMLElement;
  hearts: HTMLElement;
  energy: HTMLElement;
  relics: HTMLElement;
}

/** The DOM layer over the 3D stage: stats, action pad, item slots, combo and popups. */
export class Hud {
  readonly root = el("div", "hud hidden");
  readonly pad = new Map<ActionId, HTMLButtonElement>();
  readonly slotButtons: HTMLButtonElement[] = [];
  onAction: (action: ActionId, event: PointerEvent) => void = () => {};
  onItem: (slot: number, event: PointerEvent) => void = () => {};

  private player: Side;
  private enemy: Side;
  private round = el("div", "round-badge");
  private bpm = el("div", "bpm");
  private slots = el("div", "slots");
  private combo = el("div", "combo");
  private comboCount = el("div", "combo-count");
  private comboLabel = el("div", "combo-label");
  private comboBar = el("div", "combo-bar");
  private bubble = el("div", "tell-bubble hidden");
  private popups = el("div", "popups");

  constructor(parent: HTMLElement) {
    const top = el("div", "hud-top");
    this.player = this.side("player");
    this.enemy = this.side("enemy");
    const center = el("div", "hud-center");
    center.append(this.round, this.bpm);
    top.append(this.player.root, center, this.enemy.root);

    const bottom = el("div", "hud-bottom");
    const slotWrap = el("div", "slot-wrap");
    slotWrap.append(el("div", "hud-label", t("items")), this.slots);
    const padWrap = el("div", "pad");
    for (const action of ["special", "guard", "attack", "charge"] as ActionId[]) {
      const button = el("button", `pad-btn pad-${action}`);
      button.style.setProperty("--c", ACTION_COLORS[action]);
      const cost = ACTIONS[action].cost;
      button.innerHTML = `<span class="key">${ACTION_KEYS[action]}</span><span class="icon">${ACTION_ICONS[action]}</span><span class="label">${t(`action_${action}`)}</span><span class="cost">${cost === 0 ? "±0" : cost < 0 ? "+" + -cost : "-" + cost}</span>`;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.onAction(action, e);
      });
      padWrap.append(button);
      this.pad.set(action, button);
    }
    this.comboBar.append(el("div", "fill"));
    this.combo.append(this.comboCount, this.comboLabel, this.comboBar);
    bottom.append(slotWrap, padWrap, this.combo);

    this.root.append(top, bottom, this.bubble, this.popups);
    parent.append(this.root);
  }

  private side(kind: "player" | "enemy"): Side {
    const root = el("div", `fighter-card ${kind}`);
    const head = el("div", "fighter-head");
    const name = el("div", "fighter-name");
    const tag = el("div", "fighter-tag");
    head.append(name, tag);
    const hearts = el("div", "hearts");
    const energy = el("div", "energy");
    const relics = el("div", "relic-row");
    root.append(head, hearts, energy, relics);
    return { root, name, tag, hearts, energy, relics };
  }

  show(visible: boolean): void {
    this.root.classList.toggle("hidden", !visible);
  }

  setNames(enemyName: string, enemyTag: string, enemyColor: string): void {
    this.player.name.textContent = t("you");
    this.player.tag.textContent = "";
    this.enemy.name.textContent = enemyName;
    this.enemy.tag.textContent = enemyTag;
    this.enemy.root.style.setProperty("--accent", enemyColor);
  }

  setRound(round: number, bpm: number): void {
    this.round.textContent = t("round", round);
    this.bpm.textContent = `♩ ${bpm}`;
  }

  beat(rest: boolean): void {
    this.root.classList.toggle("resting", rest);
  }

  setStats(player: Fighter, enemy: Fighter): void {
    for (const [side, f] of [[this.player, player], [this.enemy, enemy]] as const) {
      side.hearts.innerHTML = pips(f.hp, f.maxHp, "heart", "heart empty");
      side.energy.innerHTML = pips(f.energy, f.maxEnergy, "lemon", "lemon empty");
    }
    for (const [action, button] of this.pad) {
      button.classList.toggle("poor", ACTIONS[action].cost > player.energy);
    }
  }

  setRelics(side: "player" | "enemy", relics: readonly Relic[]): void {
    const row = side === "player" ? this.player.relics : this.enemy.relics;
    row.innerHTML = "";
    for (const r of relics) {
      const chip = el("span", "relic-chip", r.icon);
      chip.dataset.id = r.id;
      chip.title = `${itemName(r.id)}\n${itemDesc(r.id)}`;
      row.append(chip);
    }
  }

  flashRelic(side: "player" | "enemy", id: string): void {
    const row = side === "player" ? this.player.relics : this.enemy.relics;
    const chip = row.querySelector<HTMLElement>(`[data-id="${id}"]`);
    if (!chip) return;
    chip.classList.remove("flash");
    void chip.offsetWidth;
    chip.classList.add("flash");
  }

  setSlots(slots: readonly (Consumable | null)[]): void {
    this.slots.innerHTML = "";
    this.slotButtons.length = 0;
    slots.forEach((item, i) => {
      const button = el("button", `slot ${item ? "" : "empty"}`);
      button.innerHTML = `<span class="slot-key">${i + 1}</span><span class="slot-icon">${item?.icon ?? ""}</span>`;
      if (item) button.title = `${itemName(item.id)}\n${itemDesc(item.id)}`;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.onItem(i, e);
      });
      this.slots.append(button);
      this.slotButtons.push(button);
    });
  }

  setCombo(combo: number, threshold: number, fever: boolean): void {
    this.comboCount.textContent = String(combo);
    this.comboLabel.textContent = fever ? t("fever") : t("toFever", Math.max(0, threshold - combo));
    (this.comboBar.firstElementChild as HTMLElement).style.width = `${fever ? 100 : Math.min(100, (combo / threshold) * 100)}%`;
    this.combo.classList.toggle("fever", fever);
    this.root.classList.toggle("fever", fever);
    if (combo > 0) {
      this.comboCount.classList.remove("pop");
      void this.comboCount.offsetWidth;
      this.comboCount.classList.add("pop");
    }
  }

  press(action: ActionId, counted: boolean): void {
    const button = this.pad.get(action);
    if (!button) return;
    const cls = counted ? "hit" : "nope";
    button.classList.remove("hit", "nope");
    void button.offsetWidth;
    button.classList.add(cls);
  }

  tell(text: string, forced: boolean): void {
    this.bubble.textContent = forced ? `${text} ${t("tellTrue")}` : text;
    this.bubble.classList.toggle("forced", forced);
    this.bubble.classList.remove("hidden");
  }

  hideTell(): void {
    this.bubble.classList.add("hidden");
  }

  placeTell(x: number, y: number): void {
    this.bubble.style.left = `${x}px`;
    this.bubble.style.top = `${y}px`;
  }

  popup(text: string, x: number, y: number, cls = ""): void {
    const node = el("div", `popup ${cls}`, text);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    this.popups.append(node);
    node.addEventListener("animationend", () => node.remove());
  }
}
