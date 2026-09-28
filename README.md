# CC Lemon Battle（网页版）

以手游戏「CCレモン」为原型的节奏对战网页游戏，是 Godot 版《8月31日のレモン》（`../cc-lemon-roguelike`）的简化衍生版：
没有剧情、没有 Boss，只有**无限连战**——每赢一场敌人就更强，玩家用金币在小卖部买道具和强化来变强，看能连赢几场。

## 运行

```bash
npm install
npm run dev      # http://localhost:5188
npm test         # 单元测试 + 难度曲线模拟
npm run build    # 输出静态网站到 dist/
```

## 玩法

- 每小节 4 拍「C・C・レ・モン」，**只在第 4 拍出招**：→ 攻击（-1 能量）、← 防御、↓ 蓄力（+1）、↑ 必杀技（-3）。
- 攻击打蓄力，防御挡攻击，必杀技破防；双方都出攻击时相杀，只打出差值。
- 不按键 = 观望，对手也不动。出招后下一小节是「结算」小节，不能输入。
  标题画面的「结算小节：开 / 关」可以关掉它（测试用）：关闭后出招的下一小节直接是新的出招小节，回合在第 4 拍的半拍后结算。
- 对手头上的气泡是破绽提示（不一定是真的）。出现率第 1 场 50%，每场 −1.5%，最低 25%。
- 1–4 键在第 1–3 拍使用道具；判定 PERFECT 时效果加成。连续 10 次出招进入 FEVER。
- 手机上可以直接点屏幕上的十字键和道具格。
- 第一次玩建议先做「节拍校准」，补偿耳机和设备的延迟。

## 结构

```
src/core/     纯规则（不依赖浏览器），全部可测试
  rules.ts    招式、判定窗口、结算表
  ai.ts       敌人 AI（权重 + 预测玩家下一招）、破绽
  items.ts    道具 / 遗物数据与触发器（事件 + 条件 + 效果）
  battle.ts   一场战斗的状态机：按拍号推进，处理出招、道具、结算小节、连击 / FEVER
  run.ts      无限模式：敌人成长公式、金币、小卖部
  sim.ts      不走时钟的战斗模拟，用来调难度
src/audio/    Web Audio 节拍时钟（以 AudioContext.currentTime 为准）+ 全合成音效，无音频文件
src/view/     Three.js 舞台（stage.ts）、DOM HUD（hud.ts）、各画面（screens.ts）
src/game/     把时钟、战斗、画面串起来（app.ts）
tests/        vitest
```

- 节拍判定：按键事件的 `timeStamp` 换算回音频时间，再扣掉输出延迟和校准值；判定窗口 PERFECT ±50ms、GOOD ±110ms。
- 敌人成长（`enemyFor`）：HP 每 4 场 +1、BPM 每场 +3（上限 150）、AI 更敢攻、更会读、更少随机，破绽变少，第 4 场起带遗物。
  `npm test` 会打印每场的模拟胜率（不带任何道具时）。
- 开发模式下 `window.app` 可在控制台访问，方便调试。

## 素材

- 角色模型：`public/models/` 来自 [Kenney · Mini Characters](https://kenney.nl/assets/mini-characters)（CC0，许可见 `public/models/License.txt`）。
  每个 `.glb` 自带动画，`src/view/stage.ts` 的 `CLIPS` 把招式对应到动画名（出拳 / 踢腿 / 蹲下 / 点头 / 摇头 / 跳 / 倒下）；
  模型加载前或加载失败时，显示原来的胶囊小人。敌人按名字的性别从模型池里抽。
- 其余没有外部图片和音频：舞台是 Three.js 几何体，图标用 emoji，音效由 Web Audio 实时合成。
字体从 Google Fonts 加载（M PLUS Rounded 1c、Noto Sans SC，OFL）。
