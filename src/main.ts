void import("./fonts");
import "./style.css";

/** The game (three.js and all) loads after the splash in index.html is on screen. */
async function boot(): Promise<void> {
  const [{ App }, { applyHudScale }] = await Promise.all([import("./game/app"), import("./view/hud")]);
  applyHudScale();
  window.addEventListener("resize", applyHudScale);
  const app = new App(document.getElementById("app")!);
  if (import.meta.env.DEV) Object.assign(window, { app });
  const splash = document.getElementById("splash");
  splash?.classList.add("gone");
  splash?.addEventListener("transitionend", () => splash.remove());
}

void boot();
