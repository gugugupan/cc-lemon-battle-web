import type { Consumable, Item, Relic } from "../core/items";
import type { ActionId, Fighter } from "../core/rules";
import { ACTIONS } from "../core/rules";
import { t } from "../i18n";
import { ACTION_COLORS, ACTION_ICONS } from "./stage";
import { attachTooltip, hideTooltip } from "./tooltip";

/** Design size the HUD is laid out for; it is zoomed to fit the actual window. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 720;
const PORTRAIT_WIDTH = 390;

/** Sets `--hud-scale` so the battle HUD (buttons included) grows and shrinks with the window. */
export function applyHudScale(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const scale = w < h ? clamp(w / PORTRAIT_WIDTH, 0.85, 1.4) : clamp(Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT), 0.8, 1.8);
  document.documentElement.style.setProperty("--hud-scale", scale.toFixed(3));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

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

export function seriesLabel(item: Item): string {
  return item.series ? t("seriesTag", t(`series_${item.series}` as Parameters<typeof t>[0])) : "";
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
  /** Tapping the tutorial guide's box (same as Enter). */
  onDialogue: () => void = () => {};
  /** The tutorial's exit button (same as Esc). */
  onExit: () => void = () => {};
  onPause: () => void = () => {};
  private costOf: (action: ActionId) => number = (a) => ACTIONS[a].cost;

  private player: Side;
  private enemy: Side;
  private round = el("div", "round-badge");
  private bpm = el("div", "bpm");
  private slots = el("div", "slots");
  private slotsLabel = el("div", "hud-label", t("items"));
  private combo = el("div", "combo");
  private comboCount = el("div", "combo-count");
  private comboLabel = el("div", "combo-label");
  private comboBar = el("div", "combo-bar");
  private bubble = el("div", "tell-bubble hidden");
  private dialogueBox = el("div", "dialogue hidden");
  private hintBar = el("div", "tut-hint hidden");
  private popups = el("div", "popups");
  private tellAt = { x: 0, y: 0 };
  private exitButton = el("button", "tut-exit hidden", "✕") as HTMLButtonElement;
  private beatPips = el("div", "pad-beat");
  private beatFrame = el("div", "beat-frame");

  constructor(parent: HTMLElement) {
    const top = el("div", "hud-top");
    this.player = this.side("player");
    this.enemy = this.side("enemy");
    const center = el("div", "hud-center");
    const pause = el("button", "pause-btn", "⏸") as HTMLButtonElement;
    pause.setAttribute("aria-label", t("paused"));
    pause.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onPause();
    });
    const badges = el("div", "round-row");
    badges.append(this.round, pause);
    center.append(badges, this.bpm);
    top.append(center, this.enemy.root);

    const bottom = el("div", "hud-bottom");
    const slotWrap = el("div", "slot-wrap");
    slotWrap.append(this.player.root, this.slotsLabel, this.slots);
    const padWrap = el("div", "pad");
    for (const action of ["special", "guard", "attack", "charge"] as ActionId[]) {
      const button = el("button", `pad-btn pad-${action}`);
      button.style.setProperty("--c", ACTION_COLORS[action]);
      button.innerHTML = `<span class="key">${ACTION_KEYS[action]}</span><span class="icon">${ACTION_ICONS[action]}</span><span class="label">${t(`action_${action}`)}</span><span class="cost"></span>`;
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.onAction(action, e);
      });
      padWrap.append(button);
      this.pad.set(action, button);
    }
    this.beatPips.innerHTML = "<i></i><i></i><i></i><i>🍋</i>";
    padWrap.append(this.beatPips);
    this.setCosts((a) => ACTIONS[a].cost);
    this.comboBar.append(el("div", "fill"));
    this.combo.append(this.comboCount, this.comboLabel, this.comboBar);
    bottom.append(slotWrap, padWrap, this.combo);

    this.dialogueBox.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onDialogue();
    });
    this.exitButton.setAttribute("aria-label", t("tut_exitLabel"));
    this.exitButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.onExit();
    });
    this.beatFrame.innerHTML = '<i class="edge top"></i><i class="edge right"></i><i class="edge bottom"></i><i class="edge left"></i>';
    this.root.append(this.beatFrame, top, bottom, this.bubble, this.hintBar, this.dialogueBox, this.exitButton, this.popups);
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

  setRound(label: string, bpm: number): void {
    this.round.textContent = label;
    this.setBpm(bpm);
  }

  setBpm(bpm: number): void {
    this.bpm.textContent = `♩ ${bpm}`;
    this.bpm.dataset.bpm = String(bpm);
  }

  get bpmShown(): string {
    return this.bpm.dataset.bpm ?? "0";
  }

  /** Smoke relic: hides the beat frame and the pad's beat meter for a bar. */
  setSmoke(on: boolean): void {
    this.root.classList.toggle("smoky", on);
  }

  /** Stun relic: every pad button but guard is locked for a bar. */
  setGuardOnly(on: boolean): void {
    for (const [action, button] of this.pad) button.classList.toggle("stun-locked", on && action !== "guard");
    this.pad.get("guard")!.classList.toggle("stun-only", on);
  }

  /** Marks the beat on the pad: pips fill on 1–3 and the pad lights up on the action beat. */
  beat(beatInBar: number, rest: boolean): void {
    this.root.classList.toggle("resting", rest);
    const pad = this.beatPips.parentElement!;
    pad.classList.toggle("cue-ready", !rest && beatInBar === 2);
    pad.classList.remove("cue-now");
    this.beatPips.classList.toggle("rest", rest);
    this.beatPips.querySelectorAll("i").forEach((pip, i) => pip.classList.toggle("on", i <= beatInBar));
    this.beatFrame.classList.toggle("rest", rest);
    this.beatFrame.querySelectorAll(".edge").forEach((edge, i) => edge.classList.toggle("on", i <= beatInBar));
    this.beatFrame.classList.remove("mon");
    if (beatInBar === 3 && !rest) {
      void this.beatFrame.offsetWidth;
      this.beatFrame.classList.add("mon");
    }
    if (!rest && beatInBar === 3) {
      void pad.offsetWidth;
      pad.classList.add("cue-now");
    }
  }

  /** Shows the tutorial's exit button. */
  setTutorial(on: boolean): void {
    this.exitButton.classList.toggle("hidden", !on);
  }

  /** Shows each action's energy cost (relics can change it). */
  setCosts(costOf: (action: ActionId) => number): void {
    this.costOf = costOf;
    for (const [action, button] of this.pad) {
      const cost = costOf(action);
      button.querySelector(".cost")!.textContent = cost === 0 ? "±0" : cost < 0 ? `+${-cost}` : `-${cost}`;
      button.classList.toggle("discounted", cost < ACTIONS[action].cost);
    }
  }

  setStats(player: Fighter, enemy: Fighter): void {
    for (const [side, f] of [[this.player, player], [this.enemy, enemy]] as const) {
      side.hearts.innerHTML = pips(f.hp, f.maxHp, "heart", "heart empty");
      side.energy.innerHTML = pips(f.energy, f.maxEnergy, "lemon", "lemon empty");
    }
    for (const [action, button] of this.pad) {
      button.classList.toggle("poor", this.costOf(action) > player.energy);
    }
  }

  setRelics(side: "player" | "enemy", relics: readonly Relic[]): void {
    const row = side === "player" ? this.player.relics : this.enemy.relics;
    row.innerHTML = "";
    for (const r of relics) {
      const chip = el("span", "relic-chip", r.icon);
      chip.dataset.id = r.id;
      attachTooltip(chip, r, true);
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
    hideTooltip();
    this.slots.innerHTML = "";
    this.slotButtons.length = 0;
    slots.forEach((item, i) => {
      const button = el("button", `slot ${item ? "" : "empty"}`);
      button.innerHTML = `<span class="slot-key">${i + 1}</span><span class="slot-icon">${item?.icon ?? ""}</span>`;
      if (item) attachTooltip(button, item);
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.onItem(i, e);
      });
      this.slots.append(button);
      this.slotButtons.push(button);
    });
  }

  /** Tutorial guide's speech box (Enter advances). */
  dialogue(text: string | null): void {
    if (text === null) {
      this.dialogueBox.classList.add("hidden");
      return;
    }
    this.dialogueBox.innerHTML = `<div class="dialogue-face">🍋</div><div class="dialogue-body"><div class="dialogue-name">${t("tut_sennin")}</div><div class="dialogue-text"></div><div class="dialogue-next">${t(window.matchMedia?.("(pointer: coarse)").matches ? "tut_next_touch" : "tut_next")}</div></div>`;
    this.dialogueBox.querySelector(".dialogue-text")!.textContent = text;
    this.dialogueBox.classList.remove("hidden");
  }

  /** Tutorial goal line under the round badge; `strong` makes it pop. */
  hint(text: string | null, strong = false): void {
    this.hintBar.classList.toggle("hidden", !text);
    this.hintBar.classList.toggle("strong", strong);
    this.hintBar.textContent = text ?? "";
    if (strong) {
      this.hintBar.classList.remove("pop");
      void this.hintBar.offsetWidth;
      this.hintBar.classList.add("pop");
    }
  }

  /** Highlights one pad button, the item slots, the beat dots, or nothing. */
  focus(target: ActionId | "slots" | "beat" | null): void {
    for (const [action, button] of this.pad) button.classList.toggle("tut-focus", target === action);
    this.slots.classList.toggle("tut-focus", target === "slots");
    this.beatPips.classList.toggle("tut-focus", target === "beat");
  }

  setRoundText(text: string): void {
    this.round.textContent = text;
  }

  setItemsLocked(locked: boolean): void {
    this.slots.classList.toggle("locked", locked);
    this.slotsLabel.textContent = locked ? t("itemsLocked") : t("items");
  }

  nopeSlot(slot: number): void {
    const button = this.slotButtons[slot];
    if (!button) return;
    button.classList.remove("nope");
    void button.offsetWidth;
    button.classList.add("nope");
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
    this.bubble.classList.remove("hidden", "show");
    this.fitTell();
    void this.bubble.offsetWidth;
    this.bubble.classList.add("show");
  }

  hideTell(): void {
    this.bubble.classList.add("hidden");
  }

  placeTell(x: number, y: number): void {
    this.tellAt = { x, y };
    this.fitTell();
  }

  /** Keeps the bubble on screen; its tail still points at the speaker. */
  private fitTell(): void {
    const { x, y } = this.tellAt;
    const half = this.bubble.offsetWidth / 2;
    const margin = 8;
    const left = half ? Math.min(Math.max(x, half + margin), window.innerWidth - half - margin) : x;
    this.bubble.style.left = `${left}px`;
    this.bubble.style.top = `${y}px`;
    const reach = Math.max(0, half - 18);
    this.bubble.style.setProperty("--tail", `${Math.min(reach, Math.max(-reach, x - left))}px`);
  }

  popup(text: string, x: number, y: number, cls = ""): void {
    const node = el("div", `popup ${cls}`, text);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    this.popups.append(node);
    node.addEventListener("animationend", () => node.remove());
  }
}
