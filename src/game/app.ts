import { BeatClock } from "../audio/clock";
import { MusicPlayer, STYLES, type StyleId } from "../audio/music";
import { Battle, type BattleEvent, MAX_BPM, MIN_BPM } from "../core/battle";
import { Rng } from "../core/rng";
import type { ActionId, RoundResult } from "../core/rules";
import { type Character, CHARACTERS, characterById, isUnlocked } from "../core/characters";
import { enemyFor, Run, tellVariety } from "../core/run";
import { STRONG_HINT_AFTER, TUTORIAL_BPM, TUTORIAL_STEPS, type TutorialInput, type TutorialStep, TutorialTracker } from "../core/tutorial";
import { type Consumable, type EffectReport, itemById } from "../core/items";
import { chooseLang, currentLang, hasKey, setLang, t, watchLang } from "../i18n";
import { Hud, itemName } from "../view/hud";
import { enemyName, personalityName, roundLabel, Screens } from "../view/screens";
import {
  loadBest,
  loadBests,
  loadBought,
  loadClear,
  loadLastCharacter,
  loadVolume,
  loadTutorialDone,
  recordBought,
  recordClear,
  saveBestFor,
  saveLastCharacter,
  saveVolume,
  saveTutorialDone,
} from "./progress";
import { Stage } from "../view/stage";

const KEY_ACTIONS: Record<string, ActionId> = { ArrowRight: "attack", ArrowLeft: "guard", ArrowDown: "charge", ArrowUp: "special" };
const END_DELAY_MS = 1300;
const NORMAL_PLAYLIST: StyleId[] = ["lofi", "lofi2", "lofi3"];
const MUSIC_VOLUME = 0.5;
/** Glow of the special's lemon and juice: lemon for the player, raspberry for the enemy. */
const SPECIAL_TINT = { player: "#ffd43b", enemy: "#e64980" } as const;
/** Sway relic: every this many bars the tempo moves by the step, never further than the max from the fight's own tempo. */
const TEMPO_SWAY_BARS = 4;
const TEMPO_SWAY_STEP = 8;
const TEMPO_SWAY_MAX = 16;
/** Beat ticks stay audible under the music so the 「ケン」 beat is still easy to hear. */
const MUSIC_TICK_LEVEL = 0.45;
const TUTORIAL_DUMMY = "character-male-b";
/** How long the confetti plays before the clear panel appears. */
const CELEBRATION_MS = 2200;

/** Glues the pieces together: clock → battle engine → stage + HUD, and the screens between fights. */
export class App {
  private clock = new BeatClock();
  private music = new MusicPlayer(this.clock.ctx);
  private volume = loadVolume();
  /** The fight's own tempo, and a tempo shift waiting for its bar (the sway relic). */
  private baseBpm = 0;
  private pendingTempo: { bar: number; bpm: number } | null = null;
  private playlistIndex = 0;
  private stage: Stage;
  private hud: Hud;
  private screens: Screens;
  private run: Run | null = null;
  private battle: Battle | null = null;
  private lastCharacter = loadLastCharacter();
  private character: Character = characterById(this.lastCharacter);
  /** Characters unlocked so far, to announce new ones. */
  private known = new Set(this.unlockedIds());
  private tut: { index: number; line: number; tracker: TutorialTracker | null; fails: number; practicing: boolean; exitArmed: number } | null = null;
  private idle = 0;
  private paused = false;

  constructor(root: HTMLElement) {
    const canvas = root.querySelector("canvas")!;
    this.stage = new Stage(canvas);
    this.hud = new Hud(root);
    this.screens = new Screens(root);
    this.screens.sfx = () => this.clock.synth.ui();
    this.screens.chestSfx = (phase) => this.clock.synth.chest(phase);
    this.hud.onAction = (a, e) => this.act(a, e);
    this.hud.onItem = (slot, e) => this.useItem(slot, e);
    this.hud.onDialogue = () => this.tut && !this.tut.practicing && this.advanceTutorial();
    this.hud.onExit = () => this.tut && this.exitTutorial();
    this.hud.onPause = () => this.pause();
    document.addEventListener("visibilitychange", () => document.hidden && this.pause());
    this.stage.onFrame = (dt) => this.frame(dt);
    this.applyVolume();
    const idle = characterById(this.lastCharacter).model;
    void this.stage.player.setModel(idle);
    void this.stage.enemy.setModel("character-female-b");
    void this.stage.scenery.rebuild(Date.now(), [idle, "character-female-b"], this.compact());
    this.applyLang();
    watchLang((next) => {
      setLang(next);
      if (this.screens.onTitle) this.showTitle();
    });
    window.addEventListener("keydown", (e) => this.key(e));
    this.showTitle();
  }

  /** Portrait / small screens get a lighter park. */
  private compact(): boolean {
    return window.innerWidth < window.innerHeight || window.innerWidth < 700;
  }

  private applyLang(): void {
    setLang(currentLang());
  }

  private frame(dt: number): void {
    this.clock.update();
    if (!this.battle || this.battle.finished || !this.clock.running) {
      this.idle += dt;
      if (this.idle > 0.6) {
        this.idle = 0;
        this.stage.player.bounce();
        this.stage.enemy.bounce();
      }
    }
    const p = this.stage.screenOf("enemy", 2.3);
    this.hud.placeTell(p.x, p.y);
  }

  private key(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.screens.handleKey(e)) return;
    if ((e.key === "p" || e.key === "P" || (e.key === "Escape" && !this.tut)) && this.canPause()) {
      e.preventDefault();
      return this.pause();
    }
    if (this.tut) {
      if (e.key === "Escape") return this.exitTutorial();
      if (!this.tut.practicing && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        return this.advanceTutorial();
      }
    }
    const action = KEY_ACTIONS[e.key];
    if (action) {
      e.preventDefault();
      this.act(action, e);
      return;
    }
    const digit = Number(e.key);
    if (digit >= 1 && digit <= 4) this.useItem(digit - 1, e);
  }

  private showTitle(): void {
    this.stopBeat();
    this.battle = null;
    this.hud.show(false);
    this.stage.setFever(false);
    this.stage.player.setSilhouette(false);
    void this.stage.player.setModel(this.character.model);
    this.screens.title(
      loadBest(),
      loadClear(),
      loadTutorialDone(),
      () => void this.unlockThen(() => this.startTutorial()),
      () => void this.unlockThen(() => this.showSelect()),
      () => void this.unlockThen(() => this.screens.calibrate(this.clock, () => this.showTitle())),
      () => this.screens.howto(() => this.showTitle()),
      () => {
        chooseLang(currentLang() === "ja" ? "zh" : "ja");
        this.showTitle();
      },
      () =>
        this.screens.volume(
          this.volume,
          (v) => {
            this.volume = v;
            saveVolume(v);
            this.applyVolume();
          },
          () => this.clock.synth.coin(),
          () => this.showTitle(),
        ),
    );
  }

  private applyVolume(): void {
    this.music.setVolume(MUSIC_VOLUME * this.volume.music);
    this.clock.synth.setVolume(this.volume.sfx);
  }

  private async unlockThen(next: () => void): Promise<void> {
    await this.clock.unlock();
    next();
  }

  private unlockedIds(): string[] {
    const best = loadBest();
    const bought = loadBought();
    return CHARACTERS.filter((c) => isUnlocked(c, best, bought)).map((c) => c.id);
  }

  /** Names of characters unlocked since the last check. */
  private newUnlocks(): string[] {
    const fresh = this.unlockedIds().filter((id) => !this.known.has(id));
    for (const id of fresh) this.known.add(id);
    return fresh.map((id) => t(`char_${id}` as Parameters<typeof t>[0]));
  }

  private showSelect(): void {
    const bests = loadBests();
    const start = Math.max(0, CHARACTERS.findIndex((c) => c.id === this.character.id));
    this.screens.select(
      CHARACTERS,
      start,
      (c) => this.known.has(c.id),
      (c) => bests[c.id] ?? 0,
      (c, open) => {
        void this.stage.player.setModel(c.model);
        this.stage.player.setSilhouette(!open);
      },
      (c) => {
        this.character = c;
        this.lastCharacter = c.id;
        saveLastCharacter(c.id);
        this.stage.player.setSilhouette(false);
        this.startRun();
      },
      () => this.showTitle(),
    );
  }

  private startRun(): void {
    this.playlistIndex = 0;
    this.run = new Run(undefined, this.character);
    this.run.onPurchase = (item) => recordBought(item.id);
    this.showIntro();
  }

  private openShop(run: Run): void {
    this.hud.show(false);
    this.screens.shop(
      run,
      () => this.showIntro(),
      (ok) => (ok ? this.clock.synth.coin() : this.clock.synth.ui()),
      () => this.newUnlocks().map((n) => t("unlockedNew", n)).join("　"),
    );
  }

  private showIntro(): void {
    const run = this.run!;
    this.battle = null;
    this.stopBeat();
    this.stage.setEnemyColor(run.enemy.color);
    void this.stage.player.setModel(run.character.model);
    void this.stage.enemy.setModel(run.enemy.model);
    void this.stage.scenery.rebuild(run.rng.int(0, 2 ** 30), [run.character.model, run.enemy.model], this.compact());
    this.stage.setFever(false);
    this.hud.show(false);
    this.screens.intro(run, () => this.beginBattle());
  }

  private beginBattle(): void {
    const run = this.run!;
    const spec = run.enemy;
    const battle = new Battle(spec, run.loadout(), new Rng(), (e) => this.onEvent(e));
    const tag = spec.boss ? t("bossTag") : `${personalityName(spec)}${spec.elite ? ` ${t("eliteTag")}` : ""}`;
    this.mountBattle(battle, enemyName(spec), tag, roundLabel(run));
  }

  /** Shows a battle on the HUD and starts its beat. */
  private mountBattle(battle: Battle, name: string, tag: string, roundText: string, bpm = battle.bpm): void {
    const spec = battle.spec;
    this.screens.hide();
    this.stage.cardLife = battle.options.restBars ? 1.3 : 0.85;
    this.battle = battle;
    this.hud.show(true);
    this.hud.hideTell();
    this.hud.setNames(name, tag, spec.color);
    this.hud.setRound(roundText, bpm);
    this.hud.setItemsLocked(battle.itemsLocked);
    this.hud.setCosts((a) => battle.costOf(a));
    this.hud.setRelics("player", battle.loadout.relics);
    this.hud.setRelics("enemy", spec.relics);
    this.hud.setSlots(battle.loadout.slots);
    this.hud.setCombo(0, battle.feverThreshold, false);
    this.hud.setSmoke(false);
    this.hud.setGuardOnly(false);
    this.baseBpm = bpm;
    this.pendingTempo = null;
    this.clock.groove = true;
    this.clock.barSound = (bar) => (battle.isRestBar(bar) ? "rest" : "call");
    this.clock.onBeat = (b) => battle.onBeat(b);
    this.clock.onOffbeat = (b) => battle.onOffbeat(b);
    battle.start();
    this.hud.setStats(battle.player, battle.enemy);
    this.clock.start(bpm);
    this.startMusic(battle, bpm);
  }

  /** Normal fights cycle through the lo-fi tracks in order; elites get the funk track. */
  private startMusic(battle: Battle, bpm: number): void {
    const on = this.volume.music > 0;
    this.clock.groove = !on;
    this.clock.tickLevel = on ? MUSIC_TICK_LEVEL : 1;
    if (!on) return;
    const style = battle.spec.elite ? STYLES.funk : STYLES[NORMAL_PLAYLIST[this.playlistIndex++ % NORMAL_PLAYLIST.length]];
    this.music.bpm = bpm;
    this.music.fever = false;
    this.music.start(style, this.clock.startTime);
  }

  private stopBeat(): void {
    this.clock.stop();
    this.music.stop();
  }

  // ---------- tutorial ----------

  private startTutorial(): void {
    this.screens.hide();
    this.run = null;
    this.battle = null;
    this.tut = { index: 0, line: 0, tracker: null, fails: 0, practicing: false, exitArmed: 0 };
    this.stage.player.setSilhouette(false);
    void this.stage.player.setModel(this.character.model);
    void this.stage.enemy.setModel(TUTORIAL_DUMMY);
    this.stage.setEnemyColor("#b0b0b0");
    void this.stage.scenery.rebuild(7, [this.character.model, TUTORIAL_DUMMY], this.compact());
    this.hud.show(true);
    this.hud.setTutorial(true);
    this.hud.setRoundText(t("tutorial"));
    this.showTutorialStep();
  }

  private showTutorialStep(): void {
    const tut = this.tut!;
    const step = TUTORIAL_STEPS[tut.index];
    this.stopBeat();
    tut.line = 0;
    tut.practicing = false;
    tut.tracker = null;
    this.hud.hint(null);
    this.hud.focus(null);
    this.hud.dialogue(this.tutText(step.lines[0]));
  }

  /** Enter during the guide's lines: next line, then practice (or the next step). */
  private advanceTutorial(): void {
    const tut = this.tut!;
    if (tut.practicing) return;
    const step = TUTORIAL_STEPS[tut.index];
    if (tut.line < step.lines.length - 1) {
      tut.line++;
      this.hud.dialogue(this.tutText(step.lines[tut.line]));
      this.clock.synth.ui();
      return;
    }
    this.hud.dialogue(null);
    if (step.goal === "confirm") this.nextTutorialStep();
    else this.startTutorialPractice();
  }

  private nextTutorialStep(): void {
    const tut = this.tut!;
    tut.index++;
    if (tut.index >= TUTORIAL_STEPS.length) {
      saveTutorialDone();
      this.tut = null;
      this.hud.dialogue(null);
      this.hud.hint(null);
      this.hud.focus(null);
      this.hud.setTutorial(false);
      this.showTitle();
      return;
    }
    this.showTutorialStep();
  }

  private startTutorialPractice(): void {
    const tut = this.tut!;
    const step = TUTORIAL_STEPS[tut.index];
    const fight = step.goal === "win";
    const spec = enemyFor(1, new Rng(tut.index + 1), this.character.model);
    spec.relics = [];
    spec.model = TUTORIAL_DUMMY;
    if (!fight) {
      spec.maxHp = 5;
      spec.tellChance = step.honestTells ? 1 : 0;
      spec.tellAccuracy = 1;
    }
    const slots: (Consumable | null)[] = [null, null, null, null];
    if (step.item) slots[0] = itemById(step.item) as Consumable;
    if (fight) slots.splice(0, 2, itemById("bandage") as Consumable, itemById("lemon_bomb") as Consumable);
    const battle = new Battle(spec, { hp: 5, maxHp: 5, relics: [], slots }, new Rng(), (e) => this.onEvent(e), {
      restBars: false,
      enemyScript: step.enemy,
      noDefeat: !fight,
    });
    if (step.playerEnergy !== undefined) battle.player.energy = step.playerEnergy;
    tut.tracker = new TutorialTracker(step);
    tut.fails = 0;
    tut.practicing = true;
    this.hud.hint(this.tutText(step.hint));
    this.hud.focus(step.focus ?? null);
    this.mountBattle(battle, fight ? enemyName(spec) : t("tut_dummy"), "", t("tutorial"), TUTORIAL_BPM);
  }

  /** Runs every battle event through the current step's goal. */
  private tutorialEvent(e: BattleEvent): void {
    const tut = this.tut;
    const battle = this.battle;
    if (!tut?.practicing || !tut.tracker || !battle) return;
    const step = TUTORIAL_STEPS[tut.index];
    if (e.type === "beat" && e.beat === 0 && !e.rest && step.enemyEnergy !== undefined) battle.enemy.energy = step.enemyEnergy;
    const verdict = tut.tracker.onEvent(e);
    if (verdict === "success") {
      tut.practicing = false;
      const at = this.stage.project(this.stage.cardMeet());
      this.hud.popup(t("tut_good"), at.x, at.y - 60, "outcome");
      this.clock.synth.win();
      window.setTimeout(() => this.nextTutorialStep(), 1300);
    } else if (verdict === "fail") {
      this.tutorialFail(step);
    }
  }

  private tutorialFail(step: TutorialStep): void {
    const tut = this.tut!;
    if (step.goal === "win") {
      tut.practicing = false;
      this.stopBeat();
      this.hud.dialogue(t("tut_fight_lost"));
      tut.line = step.lines.length - 1;
      return;
    }
    tut.fails++;
    if (tut.fails >= STRONG_HINT_AFTER) this.hud.hint(`${this.tutText(step.hint)}　${t("tut_strong")}`, true);
  }

  /** Blocks inputs the current step doesn't teach. Returns true when the press may go through. */
  private tutorialAllows(input: TutorialInput): boolean {
    const tut = this.tut;
    if (!tut) return true;
    if (!tut.practicing) return false;
    const step = TUTORIAL_STEPS[tut.index];
    if (step.allowed.includes(input)) return true;
    this.hud.hint(t("tut_blocked"), true);
    window.setTimeout(() => tut.practicing && this.hud.hint(this.tutText(step.hint)), 900);
    if (step.goal === "wait") this.tutorialFail(step);
    return false;
  }

  private exitTutorial(): void {
    const tut = this.tut!;
    if (performance.now() - tut.exitArmed > 2000) {
      tut.exitArmed = performance.now();
      this.hud.hint(this.tutText("tut_exit"), true);
      return;
    }
    this.leaveTutorial();
  }

  /** Tutorial text, using the touch wording (buttons instead of keys) on touch screens when there is one. */
  private tutText(key: string): string {
    const touch = window.matchMedia?.("(pointer: coarse)").matches && hasKey(`${key}_touch`);
    return t((touch ? `${key}_touch` : key) as Parameters<typeof t>[0]);
  }

  private leaveTutorial(): void {
    this.tut = null;
    this.hud.dialogue(null);
    this.hud.hint(null);
    this.hud.focus(null);
    this.hud.setTutorial(false);
    this.showTitle();
  }

  private act(action: ActionId, event: { timeStamp: number }): void {
    const battle = this.battle;
    if (!battle || battle.finished || !this.clock.running) return;
    if (!this.tutorialAllows(action)) return;
    const grade = battle.pressAction(action, this.clock.inputBeat(event), this.clock.secondsPerBeat);
    this.hud.press(action, grade !== null);
  }

  private useItem(slot: number, event: { timeStamp: number }): void {
    const battle = this.battle;
    if (!battle || battle.finished || !this.clock.running) return;
    if (!this.tutorialAllows("item")) return;
    const grade = battle.useItem(slot, this.clock.inputBeat(event), this.clock.secondsPerBeat);
    if (grade === null) this.hud.nopeSlot(slot);
  }

  private onEvent(e: BattleEvent): void {
    this.tutorialEvent(e);
    if (!this.tut) this.run?.record(e);
    const battle = this.battle!;
    const synth = this.clock.synth;
    switch (e.type) {
      case "beat":
        this.stage.beat(e.beat, e.rest);
        this.hud.beat(e.beat, e.rest);
        if (e.beat === 0) {
          this.hud.hideTell();
          this.disturb(battle, e.bar, e.rest);
        }
        break;
      case "tell":
        this.hud.tell(e.hidden ? t("tellHidden") : this.tellLine(e.action), e.forced);
        break;
      case "phase": {
        this.hud.setRelics("enemy", battle.enemyRelicList);
        this.stage.shake(16);
        this.stage.sparks(this.stage.chest("enemy"), "#ffd43b", 60, 6);
        synth.fever();
        const at = this.stage.screenOf("enemy", 2.9);
        this.hud.popup(t("bossSerious"), at.x, at.y - 30, "outcome boss");
        const next = Math.min(MAX_BPM, this.clock.bpm + e.bpmAdd);
        const bar = Math.floor(this.clock.heardBeat() / 4) + 2;
        this.clock.setBpmAt(bar * 4, next);
        if (this.music.playing) this.music.setBpmAt(bar * 4, next);
        this.pendingTempo = { bar, bpm: next };
        this.baseBpm += e.bpmAdd;
        break;
      }
      case "stun": {
        this.hud.setGuardOnly(e.on);
        if (e.on) {
          const at = this.stage.screenOf("player", 2.6);
          this.hud.popup(t("stunned"), at.x, at.y - 40, "outcome");
        }
        break;
      }
      case "judge": {
        const at = this.stage.project(this.stage.cardMeet());
        this.hud.popup(t(e.grade), at.x, at.y + (e.what === "item" ? 150 : 110), `grade ${e.grade}`);
        if (e.grade === "perfect") synth.perfect();
        break;
      }
      case "reveal":
        this.reveal(e.result);
        break;
      case "notice": {
        this.hud.flashRelic(e.side, e.notice.item.id);
        this.effects(e.side, `${e.notice.item.icon} ${itemName(e.notice.item.id)}`, e.notice.reports);
        this.hud.setStats(battle.player, battle.enemy);
        break;
      }
      case "item":
        this.hud.setSlots(battle.loadout.slots);
        if (e.fumbled) {
          synth.ui();
          const at = this.stage.screenOf("player", 2.6);
          this.hud.popup(`${e.item.icon} ${t("fumble")}`, at.x, at.y, "outcome");
          break;
        }
        synth.item();
        this.effects("player", `${e.item.icon} ${itemName(e.item.id)}`, e.reports);
        this.hud.setStats(battle.player, battle.enemy);
        break;
      case "combo":
        this.hud.setCombo(e.combo, e.threshold, e.fever);
        break;
      case "fever":
        this.stage.setFever(e.on);
        this.music.fever = e.on;
        if (e.on) synth.fever();
        break;
      case "wait": {
        const at = this.stage.project(this.stage.cardMeet());
        this.hud.popup(t("wait"), at.x, at.y, "wait");
        break;
      }
      case "finished":
        this.stage.tweens.delay(0.35, () => {
          this.stage.player.play(e.winner === "player" ? "win" : "lose");
          this.stage.enemy.play(e.winner === "enemy" ? "win" : "lose");
          this.stage.scenery.react(e.winner === "player" ? "win" : "lose");
        });
        if (!this.tut) window.setTimeout(() => this.endBattle(e.winner), END_DELAY_MS);
        break;
    }
  }

  /** Bar-start effects of enemy relics that bother the player: smoke hides the beat display, sway shifts the tempo. */
  private disturb(battle: Battle, bar: number, rest: boolean): void {
    const mods = battle.enemyMods;
    this.hud.setSmoke(mods.smoke && !rest && bar % 3 === 2);
    if (this.pendingTempo && this.pendingTempo.bar === bar) {
      const faster = this.pendingTempo.bpm > Number(this.hud.bpmShown);
      this.hud.setBpm(this.pendingTempo.bpm);
      const at = this.stage.project(this.stage.cardMeet());
      this.hud.popup(t(faster ? "tempoUp" : "tempoDown"), at.x, at.y - 110, "outcome");
      this.pendingTempo = null;
    }
    if (mods.tempoSway && bar > 0 && bar % TEMPO_SWAY_BARS === TEMPO_SWAY_BARS - 1) {
      const shift = Math.random() < 0.5 ? -TEMPO_SWAY_STEP : TEMPO_SWAY_STEP;
      let next = this.clock.bpm + shift;
      if (Math.abs(next - this.baseBpm) > TEMPO_SWAY_MAX) next = this.clock.bpm - shift;
      next = Math.min(MAX_BPM, Math.max(MIN_BPM, next));
      const beat = (bar + 1) * 4;
      this.clock.setBpmAt(beat, next);
      if (this.music.playing) this.music.setBpmAt(beat, next);
      this.pendingTempo = { bar: bar + 1, bpm: next };
    }
  }

  private canPause(): boolean {
    return !this.paused && !!this.battle && !this.battle.finished && this.clock.running && !this.screens.open;
  }

  /** Freezes the whole audio clock (beat, music, judging) and shows the pause panel. */
  private pause(): void {
    if (!this.canPause()) return;
    this.paused = true;
    void this.clock.ctx.suspend();
    this.showPause();
  }

  private showPause(): void {
    this.screens.pause(
      this.volume,
      (v) => {
        this.volume = v;
        saveVolume(v);
        this.applyVolume();
      },
      () =>
        this.screens.countdown(() => {
          this.screens.hide();
          this.paused = false;
          void this.clock.ctx.resume();
        }),
      () => {
        this.paused = false;
        void this.clock.ctx.resume();
        this.screens.hide();
        if (this.tut) return this.leaveTutorial();
        if (this.run) saveBestFor(this.run.character.id, this.run.wins);
        this.showTitle();
      },
    );
  }

  private tellLine(action: ActionId): string {
    const variety = tellVariety(this.run?.round ?? 1);
    const line = Math.floor(Math.random() * variety);
    return t(`tell_${action}_${line}` as Parameters<typeof t>[0]);
  }

  /** Shows who got hit by an item or relic effect, anchored at the fighter it landed on. */
  private effects(owner: "player" | "enemy", title: string, reports: EffectReport[]): void {
    const foe = owner === "player" ? "enemy" : "player";
    const head = this.stage.screenOf(owner, 3.4);
    this.hud.popup(title, head.x, head.y, `notice ${owner}`);
    reports.forEach((r, i) => {
      const target = r.side === "self" ? owner : foe;
      const at = this.stage.screenOf(target, 2.4 - i * 0.35);
      if (r.type === "damage" && r.amount > 0) {
        this.stage.fighter(target).hurt();
        this.stage.sparks(this.stage.chest(target), "#ff8787", 26, 4, 6);
        this.stage.shake(8);
        this.clock.synth.hit();
        this.hud.popup(t("fx_damage", r.amount), at.x, at.y, "damage");
      } else if (r.type === "heal" && r.amount > 0) {
        this.stage.sparks(this.stage.chest(target), "#69db7c", 22, 2.5);
        this.hud.popup(r.fill ? t("fx_heal_full") : t("fx_heal", r.amount), at.x, at.y, "heal");
      } else if (r.type === "energy" && r.amount > 0) {
        this.stage.fighter(target).charge(this.stage.tweens);
        this.hud.popup(r.fill ? t("fx_energy_full") : t("fx_energy", r.amount), at.x, at.y, "energy");
      } else if (r.type === "spend" && r.amount > 0) {
        this.hud.popup(t("fx_drain", r.amount), at.x, at.y, "energy");
      } else if (r.type === "buffNextHit") {
        this.hud.popup(t("fx_hit_bonus", r.amount), at.x, at.y, "energy");
      } else if (r.type === "shieldNext") {
        this.hud.popup(t("fx_shield"), at.x, at.y, "heal");
      } else if (r.type === "tellNext") {
        this.hud.popup(t("fx_tell_next"), at.x, at.y, "energy");
      } else if (r.type === "drain" && r.amount > 0) {
        this.hud.popup(t("fx_drain", r.amount), at.x, at.y, "damage");
      } else if (r.type === "hurtSelf" && r.amount > 0) {
        this.stage.fighter(target).hurt();
        this.stage.shake(10);
        this.clock.synth.hit();
        this.hud.popup(t("fx_hurt_self", r.amount), at.x, at.y, "damage");
      } else if (r.type === "nullify") {
        this.hud.popup(t("fx_nullify"), at.x, at.y, "energy");
      } else if (r.type === "trueTell") {
        this.hud.popup(t("fx_true_tell"), at.x, at.y, "energy");
      }
    });
  }

  private reveal(r: RoundResult): void {
    const labels = { attack: t("action_attack"), guard: t("action_guard"), charge: t("action_charge"), special: t("action_special") };
    const mark = (s: RoundResult["player"]) => (s.nullified ? t("nullified") : s.whiffed ? t("whiff") : undefined);
    const synth = this.clock.synth;
    for (const side of ["player", "enemy"] as const) {
      const s = r[side];
      if (s.whiffed) continue;
      const fighter = this.stage.fighter(side);
      if (s.action === "attack" || s.action === "special") fighter.lunge();
      fighter.play(s.action);
      if (s.action === "charge") {
        this.stage.fighter(side).charge(this.stage.tweens);
        synth.charge();
      }
      if (s.action === "special") {
        this.stage.fighter(side).charge(this.stage.tweens, "#e599f7", 1.6);
        synth.special();
      }
    }
    const sides = ["player", "enemy"] as const;
    const specials = sides.filter((side) => r[side].action === "special" && !r[side].whiffed);
    const other = (side: "player" | "enemy") => (side === "player" ? "enemy" : "player");
    /** Sides whose outcome waits for a special's lemon to land (everything, when it's a clash). */
    const waiting = new Set<"player" | "enemy">(r.clash && specials.length ? sides : specials.map(other));
    if (specials.length) this.specialWindUp(specials);
    this.stage.reveal(r.playerIdle ? null : r.player.action, r.enemy.action, labels, { player: mark(r.player), enemy: mark(r.enemy) }, () => {
      this.stage.scenery.jumpAll();
      this.impact(r, sides.filter((side) => !waiting.has(side)), waiting.size === 0);
    });
    if (!specials.length) return;
    let landed = 0;
    this.stage.tweens.delay(0.12, () => {
      for (const side of specials) {
        const target = r[other(side)];
        const end = r.clash ? "clash" : target.damageTaken > 0 ? "hit" : "blocked";
        this.stage.lemonShot(side, end, SPECIAL_TINT[side], () => {
          if (++landed < specials.length) return;
          this.specialLanded(r, side, end);
          this.impact(r, [...waiting]);
        });
      }
    });
  }

  /** The special's wind-up: camera push, cut-in and charge-up, tinted by who throws it. */
  private specialWindUp(specials: readonly ("player" | "enemy")[]): void {
    const side = specials.length === 2 ? "both" : specials[0];
    this.stage.focus(side);
    this.hud.cutIn(t("specialCutIn"), specials.includes("player") ? "player" : "enemy");
  }

  private specialLanded(r: RoundResult, side: "player" | "enemy", end: "hit" | "blocked" | "clash"): void {
    const target = side === "player" ? "enemy" : "player";
    const tint = SPECIAL_TINT[side];
    this.clock.synth.specialImpact();
    if (end === "clash") {
      this.stage.juice(this.stage.cardMeet(), "#ffffff");
      this.hud.flash("#fff");
      return;
    }
    if (end === "blocked") {
      this.stage.sparks(this.stage.chest(target), "#a5d8ff", 30, 4);
      this.stage.shake(8);
      return;
    }
    if (r[target].action === "guard" && !r[target].whiffed) this.stage.shatter(target);
    this.stage.juice(this.stage.chest(target), tint);
    this.hud.flash(side === "player" ? "rgba(255, 236, 153, 0.9)" : "rgba(247, 131, 172, 0.8)");
  }

  /** Clash, guard and damage effects for the given sides of a round; stats refresh once nothing waits. */
  private impact(r: RoundResult, sides: readonly ("player" | "enemy")[], refresh = true): void {
    const battle = this.battle;
    if (!battle) return;
    const synth = this.clock.synth;
    const meet = this.stage.project(this.stage.cardMeet());
    if (r.clash && sides.length === 2) {
      this.stage.knockCards();
      this.stage.sparks(this.stage.cardMeet(), "#ffe066", 40, 5);
      this.stage.shake(5);
      synth.clash();
      if (r.player.damageTaken === 0 && r.enemy.damageTaken === 0) this.hud.popup(t("clash"), meet.x, meet.y - 70, "outcome");
    }
    for (const side of sides) {
      const s = r[side];
      if (s.guarded) {
        this.stage.fighter(side).guard(this.stage.tweens);
        this.stage.sparks(this.stage.chest(side), "#74c0fc", 20, 3);
        synth.guard();
        this.hud.popup(t("blocked"), meet.x, meet.y - 70, "outcome");
      }
      if (s.damageTaken > 0) {
        this.stage.fighter(side).hurt();
        this.stage.sparks(this.stage.chest(side), side === "player" ? "#ff8787" : "#ffe066", 30, 4.5, 6);
        this.stage.shake(side === "player" ? 14 : 8);
        synth.hit();
        const at = this.stage.screenOf(side, 2.6);
        this.hud.popup(t("fx_damage", s.damageTaken), at.x, at.y, "damage big");
        this.stage.tweens.delay(0.4, () => this.stage.scenery.react(side === "enemy" ? "yay" : "aww"));
        const other = side === "player" ? r.enemy : r.player;
        if (!r.clash && other.action === "special" && s.action === "guard") this.hud.popup(t("guardBreak"), meet.x, meet.y - 70, "outcome");
      }
    }
    if (refresh) this.hud.setStats(battle.player, battle.enemy);
  }

  private endBattle(winner: "player" | "enemy" | "draw"): void {
    const run = this.run;
    const battle = this.battle;
    if (!run || !battle || this.battle !== battle) return;
    this.stopBeat();
    this.hud.hideTell();
    this.stage.setFever(false);
    const won = winner === "player";
    const gold = run.finishBattle(won, battle.player.hp);
    if (won && run.justCleared) {
      this.celebrate(run);
      return;
    }
    if (won) {
      this.clock.synth.win();
      this.clock.synth.coin();
      const elite = run.relicPick.length > 0;
      this.screens.victory(gold, elite, () => {
        if (!elite) return this.afterWin(run);
        this.screens.chest(run.relicPick, t("pickTitle"), (i) => {
          run.takePick(i);
          this.afterWin(run);
        });
      });
      return;
    }
    this.clock.synth.lose();
    const newBest = saveBestFor(run.character.id, run.wins);
    this.screens.gameOver(run, newBest, this.newUnlocks(), () => this.startRun(), () => this.showTitle());
  }

  /** A waiting event comes before the shop; a choice that opens a chest shows it first. */
  private afterWin(run: Run): void {
    if (!run.event) return this.openShop(run);
    this.screens.event(
      run.event,
      run,
      (i) => run.chooseEvent(i),
      (outcome) => {
        if (!outcome.chest || !run.relicPick.length) return this.openShop(run);
        this.screens.chest(run.relicPick, t("chestTitle"), (i) => {
          run.takePick(i);
          this.openShop(run);
        });
      },
    );
  }

  /** The goal fight is won: confetti, then the choice to stop here or keep going endlessly. */
  private celebrate(run: Run): void {
    const record = recordClear();
    saveBestFor(run.character.id, run.wins);
    this.hud.show(false);
    this.stage.celebrate();
    this.clock.synth.win();
    this.clock.synth.fever();
    window.setTimeout(() => {
      this.screens.cleared(
        record,
        run,
        this.newUnlocks(),
        () => this.showTitle(),
        () => {
          run.endless = true;
          this.openShop(run);
        },
      );
    }, CELEBRATION_MS);
  }
}
