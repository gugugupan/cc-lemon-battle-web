import "./style.css";
import { App } from "./game/app";
import { applyHudScale } from "./view/hud";

applyHudScale();
window.addEventListener("resize", applyHudScale);

const app = new App(document.getElementById("app")!);
if (import.meta.env.DEV) Object.assign(window, { app });
