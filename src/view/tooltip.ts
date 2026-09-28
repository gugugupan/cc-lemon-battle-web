import type { Item } from "../core/items";
import { t } from "../i18n";
import { itemDesc, itemName, seriesLabel } from "./hud";

const GAP = 10;
const EDGE = 8;

let box: HTMLDivElement | null = null;
let owner: HTMLElement | null = null;

function ensureBox(): HTMLDivElement {
  if (!box) {
    box = document.createElement("div");
    box.className = "tooltip hidden";
    document.body.append(box);
  }
  return box;
}

function escape(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

function show(target: HTMLElement, item: Item): void {
  const tip = ensureBox();
  owner = target;
  const tag = item.kind === "relic" ? t("relicTag") : t("items");
  tip.innerHTML = `<div class="tip-head"><span class="tip-icon">${item.icon}</span><span class="tip-name">${escape(itemName(item.id))}</span><span class="tip-tag ${item.kind}">${tag}</span></div><div class="tip-desc">${escape(itemDesc(item.id))}</div>${item.series ? `<div class="tip-series series-${item.series}">${escape(seriesLabel(item))}</div>` : ""}`;
  tip.classList.remove("hidden");
  const r = target.getBoundingClientRect();
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  let x = r.left + r.width / 2 - w / 2;
  x = Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, x));
  let y = r.top - h - GAP;
  if (y < EDGE) y = r.bottom + GAP;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}

export function hideTooltip(): void {
  owner = null;
  box?.classList.add("hidden");
}

/**
 * Shows the item's name and effect while a mouse hovers the element. With `tapToShow`, a touch
 * tap toggles it too — only for things a tap doesn't otherwise use (relic chips, not item slots).
 */
export function attachTooltip(target: HTMLElement, item: Item, tapToShow = false): void {
  target.addEventListener("pointerenter", (e) => {
    if (e.pointerType === "mouse") show(target, item);
  });
  target.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse" && owner === target) hideTooltip();
  });
  if (tapToShow) {
    target.addEventListener("pointerup", (e) => {
      if (e.pointerType === "mouse") return;
      if (owner === target) hideTooltip();
      else show(target, item);
    });
  }
}

window.addEventListener("pointerdown", (e) => {
  if (owner && e.pointerType !== "mouse" && !owner.contains(e.target as Node)) hideTooltip();
});
