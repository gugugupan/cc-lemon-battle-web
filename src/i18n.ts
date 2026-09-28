export type Lang = "ja" | "zh";

const STRINGS = {
  title: { ja: "CCレモン バトル", zh: "CC柠檬 对战" },
  subtitle: { ja: "4 拍目の「モン」で技を出せ。何戦勝ち抜ける？", zh: "在第 4 拍「檬」出招。你能连赢几场？" },
  start: { ja: "スタート", zh: "开始" },
  calibrate: { ja: "タイミング調整", zh: "节拍校准" },
  howto: { ja: "遊び方", zh: "玩法" },
  best: { ja: "最高記録 %d 勝", zh: "最高纪录 %d 胜" },
  language: { ja: "中文", zh: "日本語" },
  chant: { ja: "C,C,レ,モン", zh: "C,C,柠,檬" },
  rest: { ja: "結算", zh: "结算" },
  round: { ja: "第 %d 戦", zh: "第 %d 战" },
  gold: { ja: "コイン %d", zh: "金币 %d" },
  you: { ja: "あなた", zh: "你" },
  fever: { ja: "FEVER!", zh: "FEVER!" },
  combo: { ja: "%d コンボ", zh: "%d 连击" },
  toFever: { ja: "FEVER まで %d", zh: "距 FEVER 还差 %d" },
  perfect: { ja: "PERFECT", zh: "PERFECT" },
  good: { ja: "GOOD", zh: "GOOD" },
  miss: { ja: "MISS", zh: "MISS" },
  wait: { ja: "様子見", zh: "观望" },
  whiff: { ja: "空振り", zh: "挥空" },
  nullified: { ja: "無効", zh: "无效" },
  clash: { ja: "相殺！", zh: "相杀！" },
  guardBreak: { ja: "ガードブレイク！", zh: "破防！" },
  blocked: { ja: "防いだ！", zh: "挡住了！" },
  action_attack: { ja: "攻撃", zh: "攻击" },
  action_guard: { ja: "ガード", zh: "防御" },
  action_charge: { ja: "ため", zh: "蓄力" },
  action_special: { ja: "必殺技", zh: "必杀技" },
  tell_attack: { ja: "拳を握った…", zh: "握紧了拳头…" },
  tell_guard: { ja: "身構えた…", zh: "摆好了架势…" },
  tell_charge: { ja: "深呼吸…", zh: "深呼吸…" },
  tell_special: { ja: "オーラが…！", zh: "气场涌起…！" },
  tellTrue: { ja: "（見えた！）", zh: "（看穿了！）" },
  introVs: { ja: "次の相手", zh: "下一个对手" },
  hp: { ja: "HP", zh: "HP" },
  energy: { ja: "エネルギー", zh: "能量" },
  startEnergy: { ja: "開始時エネルギー", zh: "开局能量" },
  tempo: { ja: "テンポ", zh: "节奏" },
  tellRate: { ja: "クセの出やすさ", zh: "破绽出现率" },
  relics: { ja: "持ち物", zh: "携带遗物" },
  none: { ja: "なし", zh: "无" },
  fight: { ja: "勝負！", zh: "开打！" },
  tapToStart: { ja: "Enter / タップで開始", zh: "Enter / 点击开始" },
  win: { ja: "勝ち！", zh: "胜利！" },
  lose: { ja: "負け…", zh: "失败…" },
  draw: { ja: "引き分け…（負け扱い）", zh: "平局…（算失败）" },
  reward: { ja: "コイン +%d　♥+1", zh: "金币 +%d　♥+1" },
  toShop: { ja: "購買部へ", zh: "去小卖部" },
  shop: { ja: "購買部", zh: "小卖部" },
  shopHint: { ja: "コインで強くなろう。次の相手はもっと強い。", zh: "用金币变强吧。下一个对手会更强。" },
  items: { ja: "アイテム", zh: "道具" },
  relicTag: { ja: "遺物", zh: "遗物" },
  services: { ja: "サービス", zh: "服务" },
  svc_heal: { ja: "ひと休み　♥+1", zh: "休息　♥+1" },
  svc_maxHp: { ja: "特訓　最大 HP +1", zh: "特训　最大 HP +1" },
  svc_slot: { ja: "大きいカバン　アイテム枠 +1", zh: "大书包　道具栏 +1" },
  buy: { ja: "%d コイン", zh: "%d 金币" },
  sold: { ja: "売り切れ", zh: "已售出" },
  no_gold: { ja: "コインが足りない", zh: "金币不够" },
  bag_full: { ja: "カバンがいっぱい", zh: "道具栏满了" },
  sold_out: { ja: "売り切れ", zh: "已售出" },
  maxed: { ja: "もう必要ない", zh: "不需要了" },
  ok: { ja: "毎度あり！", zh: "谢谢惠顾！" },
  owned: { ja: "所持品", zh: "持有" },
  slotsHint: { ja: "枠をクリックして入れ替え", zh: "点击两个格子可交换位置" },
  next: { ja: "次の戦いへ", zh: "下一战" },
  gameOver: { ja: "ゲームオーバー", zh: "游戏结束" },
  result: { ja: "%d 勝で力尽きた", zh: "连胜 %d 场后倒下" },
  newBest: { ja: "最高記録更新！", zh: "刷新纪录！" },
  again: { ja: "もう一度", zh: "再来一次" },
  toTitle: { ja: "タイトルへ", zh: "回到标题" },
  calTitle: { ja: "タイミング調整", zh: "节拍校准" },
  calHint: { ja: "クリック音に合わせて、Space かタップを 8 回。", zh: "跟着咔哒声，按空格或点击屏幕 8 次。" },
  calResult: { ja: "ズレ %s ms を補正しました", zh: "已补偿 %s ms 的偏差" },
  calCurrent: { ja: "現在の補正 %s ms", zh: "当前补偿 %s ms" },
  calReset: { ja: "リセット", zh: "重置" },
  done: { ja: "OK", zh: "完成" },
  back: { ja: "戻る", zh: "返回" },
  howtoBody: {
    ja: "4 拍子「C・C・レ・モン」の 4 拍目で技を出す。\n→ 攻撃（-1）　← ガード　↓ ため（+1）　↑ 必殺技（-3）\n攻撃はためを打ち、ガードは攻撃を防ぎ、必殺技はガードを破る。\n何も押さなければ様子見：相手も動かない。相手の吹き出しはクセのヒント。\n1〜4 キーでアイテム（1〜3 拍目）。10 コンボで FEVER。\n勝つたびにコインを得て、購買部で強くなろう。",
    zh: "按 4 拍「C・C・柠・檬」，在第 4 拍出招。\n→ 攻击（-1）　← 防御　↓ 蓄力（+1）　↑ 必杀技（-3）\n攻击打蓄力，防御挡攻击，必杀技破防御。\n什么都不按就是观望：对手也不动。对手的气泡是破绽提示。\n1–4 键用道具（第 1–3 拍）。10 连击进入 FEVER。\n每赢一场得到金币，在小卖部变强。",
  },
  rank0: { ja: "ルーキー", zh: "新手" },
  rank1: { ja: "クラスの実力者", zh: "班级高手" },
  rank2: { ja: "学年トップ", zh: "年级第一" },
  rank3: { ja: "学校最強", zh: "全校最强" },
  rank4: { ja: "伝説", zh: "传说" },
  fx_damage: { ja: "-%d", zh: "-%d" },
  fx_heal: { ja: "♥+%d", zh: "♥+%d" },
  fx_heal_full: { ja: "HP 全回復", zh: "HP 回满" },
  fx_energy: { ja: "エネルギー +%d", zh: "能量 +%d" },
  fx_energy_full: { ja: "エネルギー満タン", zh: "能量回满" },
  fx_nullify: { ja: "次の相手の技を無効化", zh: "对手下一招无效" },
  fx_true_tell: { ja: "クセを見抜いた", zh: "看穿破绽" },
  item_lemon_bomb: { ja: "レモン爆弾", zh: "柠檬炸弹" },
  item_lemon_bomb_desc: { ja: "相手に 1 ダメージ。Perfect +1、FEVER +2。", zh: "对手 -1。Perfect 再 -1，FEVER 再 -2。" },
  item_bandage: { ja: "絆創膏", zh: "创可贴" },
  item_bandage_desc: { ja: "HP +1。Perfect +1、FEVER なら全回復。", zh: "HP +1。Perfect 再 +1，FEVER 回满。" },
  item_ramune: { ja: "ラムネ", zh: "波子汽水" },
  item_ramune_desc: { ja: "エネルギー +1。Perfect +1、FEVER なら満タン。", zh: "能量 +1。Perfect 再 +1，FEVER 回满。" },
  item_pause: { ja: "一時停止", zh: "暂停" },
  item_pause_desc: { ja: "この小節、相手の技を無効にする。", zh: "本小节对手的招式无效。" },
  item_xray: { ja: "透視メガネ", zh: "透视眼镜" },
  item_xray_desc: { ja: "相手の本当の技が見える。", zh: "看穿对手真正要出的招。" },
  item_cold_lemon: { ja: "冷えたレモン", zh: "冰镇柠檬" },
  item_cold_lemon_desc: { ja: "戦闘開始時にエネルギー +1。", zh: "开战时能量 +1。" },
  item_big_bottle: { ja: "大容量ボトル", zh: "大容量水壶" },
  item_big_bottle_desc: { ja: "エネルギー上限 +1、開始時 +1。", zh: "能量上限 +1，开战时能量 +1。" },
  item_diary: { ja: "観察日記", zh: "观察日记" },
  item_diary_desc: { ja: "クセの出る確率 ×2、正確さ +15%。", zh: "破绽出现率 ×2，准确率 +15%。" },
  item_eco: { ja: "省エネ", zh: "节能" },
  item_eco_desc: { ja: "3 回目の攻撃ごとにエネルギー +1。", zh: "每第 3 次攻击返还 1 能量。" },
  item_soda_bubbles: { ja: "炭酸の泡", zh: "碳酸气泡" },
  item_soda_bubbles_desc: { ja: "Perfect 4 連続ごとに HP +1。", zh: "每连续 4 次 Perfect，HP +1。" },
  item_cheer_flag: { ja: "応援団の旗", zh: "应援团旗" },
  item_cheer_flag_desc: { ja: "FEVER に入ったとき HP +2。", zh: "进入 FEVER 时 HP +2。" },
  item_metronome: { ja: "メトロノーム", zh: "节拍器" },
  item_metronome_desc: { ja: "Perfect の判定幅 +20%。", zh: "Perfect 判定窗口 +20%。" },
  item_class_log: { ja: "学級日誌", zh: "班级日志" },
  item_class_log_desc: { ja: "戦闘開始時にエネルギー +1。", zh: "开战时能量 +1。" },
  item_armband: { ja: "風紀の腕章", zh: "风纪袖章" },
  item_armband_desc: { ja: "攻撃を防ぐとエネルギー +1。", zh: "挡住攻击时能量 +1。" },
  item_amulet: { ja: "謎のお守り", zh: "神秘护身符" },
  item_amulet_desc: { ja: "HP が半分以下になると一度だけ HP +2。", zh: "HP 降到一半以下时，仅一次 HP +2。" },
  item_spikes: { ja: "トゲトゲ筆箱", zh: "带刺铅笔盒" },
  item_spikes_desc: { ja: "2 回防ぐごとに相手に 1 ダメージ。", zh: "每挡住 2 次攻击，反伤 1。" },
  name0: { ja: "隣の席のタカシ", zh: "邻座的隆志" },
  name1: { ja: "図書委員のケン", zh: "图书委员阿健" },
  name2: { ja: "給食当番のミカ", zh: "午餐值日生美香" },
  name3: { ja: "学級委員長サクラ", zh: "班长小樱" },
  name4: { ja: "謎の転校生", zh: "神秘转学生" },
  name5: { ja: "野球部のダイチ", zh: "棒球部的大地" },
  name6: { ja: "吹奏楽部のリン", zh: "管乐部的小凛" },
  name7: { ja: "生徒会長ユウ", zh: "学生会长阿悠" },
  name8: { ja: "保健委員のハナ", zh: "保健委员小花" },
  name9: { ja: "昼寝番長ゴロー", zh: "午睡老大五郎" },
  name10: { ja: "早弁のシンジ", zh: "偷吃便当的真司" },
  name11: { ja: "屋上のナゾ先輩", zh: "天台的神秘学长" },
} as const satisfies Record<string, Record<Lang, string>>;

export type StringKey = keyof typeof STRINGS;

let lang: Lang = detect();

function detect(): Lang {
  try {
    const saved = localStorage.getItem("cc-lemon:lang");
    if (saved === "ja" || saved === "zh") return saved;
  } catch {
    // storage can be blocked; fall through to the browser language
  }
  return navigator.language.toLowerCase().startsWith("zh") ? "zh" : "ja";
}

export function currentLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  document.documentElement.lang = next === "zh" ? "zh-CN" : "ja";
  try {
    localStorage.setItem("cc-lemon:lang", next);
  } catch {
    // not saved; the choice still applies for this visit
  }
}

/** Looks up a string and fills `%d` / `%s` placeholders in order. */
export function t(key: StringKey, ...args: (string | number)[]): string {
  let i = 0;
  return STRINGS[key][lang].replace(/%[ds]/g, () => String(args[i++] ?? ""));
}

export function hasKey(key: string): key is StringKey {
  return key in STRINGS;
}

export function allKeys(): StringKey[] {
  return Object.keys(STRINGS) as StringKey[];
}
