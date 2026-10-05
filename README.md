# 🍋 レモンパンチ / 柠檬猜拳 / Lemon Punch

**▶ 在线游玩：https://lemon-punch.gratin-game.com/**

以手游戏「CCレモン」为原型的节奏对战 roguelike，浏览器直接玩（电脑键盘 / 手机触屏）。界面支持日文和中文。

> Lemon Punch — a rhythm-battle roguelike based on the Japanese hand game "CC Lemon". Play it in the browser: https://lemon-punch.gratin-game.com/

目标是**连赢 20 场**。每赢一场敌人就更强，HP 会带到下一场；用赢来的金币在小卖部买道具、开宝箱拿遗物，或者休息回血。通关后可以进入**无尽模式**继续挑战。

## 玩法

- 每小节 4 拍「レ・モン・ジャン・ケン」，**只在第 4 拍出招**：
  - → 攻击（-1 能量）
  - ← 防御
  - ↓ 蓄力（+1 能量）
  - ↑ 必杀技（-3 能量）
- 克制关系：攻击打蓄力，防御挡攻击，必杀技破防。双方都出攻击时互相抵消，只打出差值。
- 第 4 拍不按键就是「观望」，对手也不会动。
- 对手头上的气泡是破绽提示，但不一定是真的。
- 1–4 键在第 1–3 拍使用道具，判定 PERFECT 时效果更强。连续出招 10 次进入 **FEVER**。
- 每 5 场有一个**强敌**，打赢后可以从 3 个遗物里挑一个。
- 8 个角色，初始遗物、道具、HP、金币各不相同，靠胜场或拿到特定遗物来解锁。
- 第一次玩建议先看标题画面的「教程」，再做一次「节拍校准」，补偿耳机和设备的延迟。

完整的规则、数值和设计说明见 **[docs/GUIDE.md](docs/GUIDE.md)**。

## 本地运行

需要 Node.js 20.19 以上。

```bash
npm install
npm run dev        # http://localhost:5188
npm test           # 单元测试
npm run sim:runs   # 模拟每个角色完整打 20 场，输出通关率
npm run build      # 输出静态网站到 dist/
```

开发模式下还有一个 BGM 试听页：http://localhost:5188/bgm.html

## 部署

推送到 `main` 后，GitHub Actions（`.github/workflows/deploy.yml`）会依次跑测试、构建，然后把 `dist/` 发布到 GitHub Pages。
整个游戏是纯静态网站，没有服务器，存档（最高纪录、解锁、设置）只保存在浏览器的 localStorage 里。

## 技术

- **Three.js + Vite + TypeScript**，测试用 vitest。
- 节拍时钟以 `AudioContext.currentTime` 为准，不依赖画面帧率。按键会换算回按下的那一刻，再扣掉设备的输出延迟和校准值。
- 所有音效和 BGM 都是 Web Audio 实时合成的，没有音频文件。
- `src/core/` 是纯规则代码，不依赖浏览器，可以直接测试和模拟。

```
src/core/     规则：招式与结算、敌人 AI、道具 / 遗物、战斗状态机、连战与小卖部、角色、教程、模拟器
src/audio/    节拍时钟、音效、BGM 音序器
src/view/     Three.js 舞台与场景、HUD、各画面
src/game/     把时钟、战斗、画面串起来（app.ts）
tests/        vitest
```

## 素材与许可

- 代码以 [MIT License](LICENSE) 发布。
- 3D 模型来自 [Kenney](https://kenney.nl/) 的 [Mini Characters](https://kenney.nl/assets/mini-characters)、[Mini Forest](https://kenney.nl/assets/mini-forest)、[Mini Arcade](https://kenney.nl/assets/mini-arcade)、[Cube Pets](https://kenney.nl/assets/cube-pets)，均为 CC0 许可，许可文件放在 `public/models/` 下各自的文件夹里。
- 字体从 Google Fonts 加载：M PLUS Rounded 1c、Noto Sans SC，均为 SIL OFL 许可。
- 「CCレモン」是三得利（Suntory）的商标。本项目只是以同名手游戏为原型的非商业作品，与三得利没有任何关系。
