import "./style.css";
import { App } from "./game/app";

const app = new App(document.getElementById("app")!);
if (import.meta.env.DEV) Object.assign(window, { app });
