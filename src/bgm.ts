import { MusicPlayer, STYLES, type StyleId } from "./audio/music";

/** Dev-only page for auditioning the synthesized BGM styles before one goes into the game. */

const INFO: Record<StyleId, { title: string; tag: string; desc: string; color: string; bpm: number }> = {
  pop: { title: "A. 明快流行", tag: "8-bit / 游戏机", desc: "方波旋律 + 三角波贝斯，C 大调 C–G–Am–F 循环。轻快、易上头，最有「小游戏」的感觉。", color: "#ffd43b", bpm: 120 },
  lofi: { title: "B. 放学后 Lo-fi", tag: "Chill / 摇摆节奏", desc: "慵懒的摇摆鼓点、电钢琴七和弦、唱片底噪。放松，适合慢慢读破绽。", color: "#9fa8ff", bpm: 92 },
  matsuri: { title: "C. 夏日祭典", tag: "太鼓 / 笛子 / 五声音阶", desc: "低音太鼓、缔太鼓、拍手和日本五声音阶的笛声。最贴近「8 月 31 日」的夏天氛围。", color: "#ff8a80", bpm: 110 },
  funk: { title: "D. 电子 Funk", tag: "四踩舞曲 / 厚贝斯", desc: "四拍底鼓、切分贝斯、和弦刺击。最有冲劲，FEVER 时特别带感。", color: "#3ddbb0", bpm: 124 },
};

const root = document.getElementById("bgm")!;
root.innerHTML = `
<style>
  :root { font-family: "Noto Sans SC", "M PLUS Rounded 1c", system-ui, sans-serif; color: #1f2a44; }
  body { margin: 0; min-height: 100vh; background: linear-gradient(180deg, #5cc8ff, #b8f5e6 55%, #fff3b0); }
  main { max-width: 920px; margin: 0 auto; padding: 28px 16px 60px; }
  h1 { margin: 0 0 4px; font-weight: 900; }
  .sub { margin: 0 0 18px; font-weight: 700; color: #55607a; }
  .controls { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; background: rgba(255,255,255,.85); border-radius: 20px; padding: 14px 18px; box-shadow: 0 10px 30px rgba(31,42,68,.15); margin-bottom: 18px; font-weight: 800; }
  .controls label { display: flex; gap: 8px; align-items: center; }
  input[type=range] { width: 180px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .card { background: rgba(255,255,255,.92); border-radius: 22px; padding: 18px; box-shadow: 0 10px 30px rgba(31,42,68,.15); border: 3px solid transparent; transition: transform .1s; }
  .card.on { border-color: var(--c); transform: translateY(-3px); }
  .card h2 { margin: 0; font-weight: 900; font-size: 20px; }
  .tag { display: inline-block; margin: 6px 0; font-size: 12px; font-weight: 800; padding: 2px 10px; border-radius: 99px; background: var(--c); }
  .card p { font-weight: 700; color: #55607a; line-height: 1.6; font-size: 14px; }
  button { font: inherit; font-weight: 900; border: none; border-radius: 99px; padding: 10px 22px; cursor: pointer; background: var(--c, #ffd43b); box-shadow: 0 4px 0 rgba(31,42,68,.2); }
  button:active { transform: translateY(3px); box-shadow: none; }
  .eq { display: inline-flex; gap: 3px; height: 18px; align-items: flex-end; margin-left: 10px; vertical-align: middle; }
  .eq i { width: 4px; background: var(--c); border-radius: 2px; height: 4px; }
  .card.on .eq i { animation: eq .5s ease-in-out infinite alternate; }
  .card.on .eq i:nth-child(2) { animation-delay: .15s } .card.on .eq i:nth-child(3) { animation-delay: .3s }
  @keyframes eq { to { height: 18px; } }
</style>
<h1>🎵 BGM 风格试听</h1>
<p class="sub">全部由 Web Audio 实时合成，没有音频文件。可以调 BPM（游戏里 BPM 会随对手变化），也可以打开 FEVER 层听听进入 FEVER 时的加强版。</p>
<div class="controls">
  <label>BPM <input id="bpm" type="range" min="90" max="180" value="120" /> <span id="bpmv">120</span></label>
  <label><input id="fever" type="checkbox" /> FEVER 层</label>
  <label>音量 <input id="vol" type="range" min="0" max="100" value="70" /></label>
  <button id="stop" style="--c:#e9ecef">■ 停止</button>
</div>
<div class="grid">
  ${(Object.keys(INFO) as StyleId[])
    .map((id) => `<div class="card" id="card-${id}" style="--c:${INFO[id].color}"><h2>${INFO[id].title}<span class="eq"><i></i><i></i><i></i></span></h2><span class="tag">${INFO[id].tag}</span><p>${INFO[id].desc}</p><button data-play="${id}">▶ 播放（建议 ${INFO[id].bpm} BPM）</button></div>`)
    .join("")}
</div>`;

let ctx: AudioContext | null = null;
let player: MusicPlayer | null = null;
const bpm = document.getElementById("bpm") as HTMLInputElement;
const bpmv = document.getElementById("bpmv")!;
const fever = document.getElementById("fever") as HTMLInputElement;
const vol = document.getElementById("vol") as HTMLInputElement;

function ensure(): MusicPlayer {
  ctx ??= new AudioContext({ latencyHint: "interactive" });
  void ctx.resume();
  player ??= new MusicPlayer(ctx);
  return player;
}

root.querySelectorAll<HTMLButtonElement>("[data-play]").forEach((b) =>
  b.addEventListener("click", () => {
    const id = b.dataset.play as StyleId;
    const p = ensure();
    bpm.value = String(INFO[id].bpm);
    bpmv.textContent = bpm.value;
    p.bpm = INFO[id].bpm;
    p.fever = fever.checked;
    p.setVolume(Number(vol.value) / 100);
    p.start(STYLES[id]);
    root.querySelectorAll(".card").forEach((c) => c.classList.toggle("on", c.id === `card-${id}`));
  }),
);
bpm.addEventListener("input", () => {
  bpmv.textContent = bpm.value;
  if (player) player.bpm = Number(bpm.value);
});
fever.addEventListener("change", () => player && (player.fever = fever.checked));
vol.addEventListener("input", () => player?.setVolume(Number(vol.value) / 100));
document.getElementById("stop")!.addEventListener("click", () => {
  player?.stop();
  root.querySelectorAll(".card").forEach((c) => c.classList.remove("on"));
});
