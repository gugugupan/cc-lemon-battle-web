import { BeatClock } from "../audio/clock";
import { Battle, type BattleEvent } from "../core/battle";
import type { EffectReport } from "../core/items";
import { Rng } from "../core/rng";
import type { ActionId, RoundResult } from "../core/rules";
import { type Character, CHARACTERS, characterById, isUnlocked } from "../core/characters";
import { Run, tellVariety } from "../core/run";
import { currentLang, setLang, t } from "../i18n";
import { Hud, itemName } from "../view/hud";
import { enemyName, enemyRank, roundLabel, Screens } from "../view/screens";
import { loadBest, loadBests, loadBought, loadClear, loadLastCharacter, recordBought, recordClear, saveBestFor, saveLastCharacter } from "./progress";
import { Stage } from "../view/stage";

const KEY_ACTIONS: Record<string, ActionId> = { ArrowRight: "attack", ArrowLeft: "guard", ArrowDown: "charge", ArrowUp: "special" };
const END_DELAY_MS = 1300;
/** How long the confetti plays before the clear panel appears. */
const CELEBRATION_MS = 2200;

/** Glues the pieces together: clock → battle engine → stage + HUD, and the screens between fights. */
export class App {
  private clock = new BeatClock();
  private stage: Stage;
  private hud: Hud;
  private screens: Screens;
  private run: Run | null = null;
  private battle: Battle | null = null;
  private lastCharacter = loadLastCharacter();
  private character: Character = characterById(this.lastCharacter);
  /** Characters unlocked so far, to announce new ones. */
  private known = new Set(this.unlockedIds());
  private idle = 0;

  constructor(root: HTMLElement) {
    const canvas = root.querySelector("canvas")!;
    this.stage = new Stage(canvas);
    this.hud = new Hud(root);
    this.screens = new Screens(root);
    this.screens.sfx = () => this.clock.synth.ui();
    this.hud.onAction = (a, e) => this.act(a, e);
    this.hud.onItem = (slot, e) => this.useItem(slot, e);
    this.stage.onFrame = (dt) => this.frame(dt);
    const idle = characterById(this.lastCharacter).model;
    void this.stage.player.setModel(idle);
    void this.stage.enemy.setModel("character-female-b");
    void this.stage.scenery.rebuild(Date.now(), [idle, "character-female-b"], this.compact());
    this.applyLang();
    window.addEventListener("keydown", (e) => this.key(e));
    this.showTitle();
  }

  /** Portrait / small screens get a lighter park. */
  private compact(): boolean {
    return window.innerWidth < window.innerHeight || window.innerWidth < 700;
  }

  private applyLang(): void {
    setLang(currentLang());
    this.stage.setChant(t("chant").split(","));
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
    const p = this.stage.screenOf("enemy", 3.1);
    this.hud.placeTell(p.x, p.y);
  }

  private key(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (this.screens.handleKey(e)) return;
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
    this.clock.stop();
    this.battle = null;
    this.hud.show(false);
    this.stage.setFever(false);
    this.stage.player.setSilhouette(false);
    void this.stage.player.setModel(this.character.model);
    this.screens.title(
      loadBest(),
      loadClear(),
      () => void this.unlockThen(() => this.showSelect()),
      () => void this.unlockThen(() => this.screens.calibrate(this.clock, () => this.showTitle())),
      () => this.screens.howto(() => this.showTitle()),
      () => {
        setLang(currentLang() === "ja" ? "zh" : "ja");
        this.applyLang();
        this.showTitle();
      },
    );
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
    this.clock.stop();
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
    this.screens.hide();
    const battle = new Battle(spec, run.loadout(), new Rng(), (e) => this.onEvent(e));
    this.stage.cardLife = battle.options.restBars ? 1.3 : 0.85;
    this.battle = battle;
    this.hud.show(true);
    this.hud.hideTell();
    this.hud.setNames(enemyName(spec), enemyRank(spec), spec.color);
    this.hud.setRound(roundLabel(run), battle.bpm);
    this.hud.setItemsLocked(battle.itemsLocked);
    this.hud.setCosts((a) => battle.costOf(a));
    this.hud.setRelics("player", run.relics);
    this.hud.setRelics("enemy", spec.relics);
    this.hud.setSlots(run.slots);
    this.hud.setCombo(0, battle.feverThreshold, false);
    this.hud.setStats(battle.player, battle.enemy);
    this.clock.groove = true;
    this.clock.barSound = (bar) => (battle.isRestBar(bar) ? "rest" : "call");
    this.clock.onBeat = (b) => battle.onBeat(b);
    this.clock.onOffbeat = (b) => battle.onOffbeat(b);
    battle.start();
    this.hud.setStats(battle.player, battle.enemy);
    this.clock.start(battle.bpm);
  }

  private act(action: ActionId, event: { timeStamp: number }): void {
    const battle = this.battle;
    if (!battle || battle.finished || !this.clock.running) return;
    const grade = battle.pressAction(action, this.clock.inputBeat(event), this.clock.secondsPerBeat);
    this.hud.press(action, grade !== null);
  }

  private useItem(slot: number, event: { timeStamp: number }): void {
    const battle = this.battle;
    if (!battle || battle.finished || !this.clock.running) return;
    const grade = battle.useItem(slot, this.clock.inputBeat(event), this.clock.secondsPerBeat);
    if (grade === null) this.hud.nopeSlot(slot);
  }

  private onEvent(e: BattleEvent): void {
    const battle = this.battle!;
    const synth = this.clock.synth;
    switch (e.type) {
      case "beat":
        this.stage.beat(e.beat, e.rest);
        this.hud.beat(e.rest);
        if (e.beat === 0) this.hud.hideTell();
        break;
      case "tell":
        this.hud.tell(this.tellLine(e.action), e.forced);
        break;
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
        synth.item();
        this.hud.setSlots(battle.loadout.slots);
        this.effects("player", `${e.item.icon} ${itemName(e.item.id)}`, e.reports);
        this.hud.setStats(battle.player, battle.enemy);
        break;
      case "combo":
        this.hud.setCombo(e.combo, e.threshold, e.fever);
        break;
      case "fever":
        this.stage.setFever(e.on);
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
        window.setTimeout(() => this.endBattle(e.winner), END_DELAY_MS);
        break;
    }
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
    this.stage.reveal(r.player.action, r.enemy.action, labels, { player: mark(r.player), enemy: mark(r.enemy) }, () => {
      const battle = this.battle;
      if (!battle) return;
      this.stage.scenery.jumpAll();
      const meet = this.stage.project(this.stage.cardMeet());
      if (r.clash) {
        this.stage.knockCards();
        this.stage.sparks(this.stage.cardMeet(), "#ffe066", 40, 5);
        this.stage.shake(5);
        synth.clash();
        if (r.player.damageTaken === 0 && r.enemy.damageTaken === 0) this.hud.popup(t("clash"), meet.x, meet.y - 70, "outcome");
      }
      for (const side of ["player", "enemy"] as const) {
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
      this.hud.setStats(battle.player, battle.enemy);
    });
  }

  private endBattle(winner: "player" | "enemy" | "draw"): void {
    const run = this.run;
    const battle = this.battle;
    if (!run || !battle || this.battle !== battle) return;
    this.clock.stop();
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
      this.screens.victory(gold, () => this.openShop(run));
      return;
    }
    this.clock.synth.lose();
    const newBest = saveBestFor(run.character.id, run.wins);
    this.screens.gameOver(run.wins, newBest, this.newUnlocks(), () => this.startRun(), () => this.showTitle());
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
