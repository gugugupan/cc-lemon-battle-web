import * as THREE from "three";
import { Rng } from "../core/rng";
import { Animator, instance, loadModel } from "./models";

/** Every character model; spectators are drawn from the ones not fighting. */
export const CHARACTER_MODELS = [
  "character-male-a", "character-male-b", "character-male-c", "character-male-d", "character-male-e", "character-male-f",
  "character-female-a", "character-female-b", "character-female-c", "character-female-d", "character-female-e", "character-female-f",
];
const PETS = ["cat", "dog", "chick", "bunny", "penguin", "pig", "fox", "panda"];

const SPECTATOR_HEIGHT = 1.75;
const PET_HEIGHT = 0.95;
const PET_SPEED = 0.9;
const FENCE_RADIUS = 6.9;
/** Spots behind the fence for the crowd, leaving the middle (behind the beat orbs) clear. */
const CROWD_SEATS = [214, 228, 242, 256, 284, 298, 312, 326];

/** Angle (degrees) and radius around the arena → ground position. 270° is straight behind it. */
function around(deg: number, r: number): THREE.Vector3 {
  const a = (deg * Math.PI) / 180;
  return new THREE.Vector3(Math.cos(a) * r, -0.3, Math.sin(a) * r);
}

function faceCenter(obj: THREE.Object3D): void {
  obj.rotation.y = Math.atan2(-obj.position.x, -obj.position.z);
}

interface Spectator {
  root: THREE.Object3D;
  anim: Animator;
  /** Small beat bob, and a bigger together-jump; both decay 1 → 0. */
  hop: number;
  jump: number;
  baseY: number;
}

interface Pet {
  root: THREE.Object3D;
  anim: Animator;
  /** Arc it patrols, in degrees, and its radius range. */
  arc: [number, number];
  radius: [number, number];
  target: THREE.Vector3 | null;
  pause: number;
  hop: number;
  jump: number;
  hopsOnBeat: boolean;
}

/**
 * The park around the arena: trees, rocks, fences, a vending machine, a few spectators
 * who react to the beat and the fight, and small animals wandering the edges. Rebuilt with a new
 * random layout for every fight.
 */
export class Scenery {
  readonly group = new THREE.Group();
  private spectators: Spectator[] = [];
  private pets: Pet[] = [];
  private rng = new Rng(1);
  private build = 0;
  private fever = false;

  constructor(scene: THREE.Scene) {
    const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: "#b5e8a0", roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.31;
    ground.receiveShadow = true;
    scene.add(ground, this.group);
  }

  /** Lays out a new park. `exclude` are the fighters' models, kept out of the crowd. */
  async rebuild(seed: number, exclude: string[], compact: boolean): Promise<void> {
    const build = ++this.build;
    this.rng = new Rng(seed);
    const rng = this.rng;
    const staticParts: [string, number, THREE.Vector3, number?][] = [];

    const trees = compact ? 7 : 11;
    for (let i = 0; i < trees; i++) {
      const deg = 185 + (i / (trees - 1)) * 170 + rng.int(-6, 6);
      staticParts.push([rng.chance(0.5) ? "forest/tree-high" : "forest/tree", 3.6 + rng.next() * 2.2, around(deg, 10 + rng.next() * 3.5)]);
    }
    for (const deg of [168, 12]) staticParts.push(["forest/tree-high", 5, around(deg + rng.int(-4, 4), 11 + rng.next() * 2)]);
    for (let i = 0; i < (compact ? 4 : 7); i++) {
      staticParts.push([rng.chance(0.5) ? "forest/rocks-high" : "forest/rocks-low", 0.8 + rng.next() * 0.9, around(160 + rng.next() * 220, 7.6 + rng.next() * 4)]);
    }
    for (let i = 0; i < (compact ? 6 : 12); i++) {
      staticParts.push([rng.chance(0.5) ? "forest/plant" : "forest/stones", 0.35 + rng.next() * 0.3, around(150 + rng.next() * 240, 7.3 + rng.next() * 5)]);
    }
    for (let i = 0; i < 8; i++) {
      staticParts.push(["forest/patch-grass", 0.25, around(150 + rng.next() * 240, 7.5 + rng.next() * 5), 2 + rng.next() * 1.5]);
    }
    staticParts.push(["forest/tent", 2.6, around(240 + rng.int(-10, 10), 13)]);
    staticParts.push(["arcade/vending-machine", 2.3, around(236 + rng.int(-4, 4), 8.6)]);
    staticParts.push([rng.chance(0.5) ? "arcade/claw-machine" : "arcade/arcade-machine", 2.1, around(304 + rng.int(-4, 4), 8.8)]);
    for (const deg of [214, 326]) staticParts.push(["forest/flag", 1.6, around(deg, FENCE_RADIUS - 0.2)]);

    const fence: number[] = [];
    for (let deg = 200; deg <= 340; deg += 14.5) if (!rng.chance(0.2)) fence.push(deg);

    const crowd = rng.shuffle(CHARACTER_MODELS.filter((m) => !exclude.includes(m))).slice(0, compact ? 3 : 5);
    const petKinds = rng.shuffle(PETS).slice(0, compact ? 2 : 3);

    const paths = new Set([...staticParts.map((p) => p[0]), "forest/fence", ...crowd, ...petKinds.map((p) => `pets/animal-${p}`)]);
    let loaded: Map<string, Awaited<ReturnType<typeof loadModel>>>;
    try {
      loaded = new Map(await Promise.all([...paths].map(async (p) => [p, await loadModel(p)] as const)));
    } catch {
      return;
    }
    if (build !== this.build) return;

    this.clear();
    for (const [path, height, pos, spread] of staticParts) {
      const { root } = instance(loaded.get(path)!, height);
      root.position.add(pos);
      if (spread) root.scale.set(spread, 1, spread);
      root.rotation.y = rng.next() * Math.PI * 2;
      if (path.startsWith("arcade/") || path === "forest/tent" || path === "forest/flag") faceCenter(root);
      this.group.add(root);
    }
    for (const deg of fence) {
      const { root } = instance(loaded.get("forest/fence")!, 0.7);
      root.scale.x *= 2.2;
      root.position.add(around(deg, FENCE_RADIUS));
      root.rotation.y = -((deg * Math.PI) / 180) - Math.PI / 2;
      this.group.add(root);
    }

    const seats = rng.shuffle(CROWD_SEATS).slice(0, crowd.length);
    crowd.forEach((model, i) => {
      const deg = seats[i] + rng.int(-3, 3);
      const gltf = loaded.get(model)!;
      const { root } = instance(gltf, SPECTATOR_HEIGHT, true);
      root.position.add(around(deg, 7.7 + rng.next() * 0.6));
      faceCenter(root);
      const anim = new Animator(root.children[0], gltf);
      anim.mixer.update(rng.next() * 2);
      this.group.add(root);
      this.spectators.push({ root, anim, hop: 0, jump: 0, baseY: root.position.y });
    });

    petKinds.forEach((kind, i) => {
      const gltf = loaded.get(`pets/animal-${kind}`)!;
      const { root } = instance(gltf, PET_HEIGHT, true);
      const arc: [number, number] = i % 2 === 0 ? [218, 262] : [278, 322];
      const radius: [number, number] = [6.05, 6.55];
      root.position.add(around(arc[0] + rng.next() * (arc[1] - arc[0]), radius[0] + rng.next() * (radius[1] - radius[0])));
      root.rotation.y = rng.next() * Math.PI * 2;
      const anim = new Animator(root.children[0], gltf);
      this.group.add(root);
      this.pets.push({ root, anim, arc, radius, target: null, pause: rng.next() * 3, hop: 0, jump: 0, hopsOnBeat: kind === "chick" || kind === "bunny" });
    });
  }

  private clear(): void {
    for (const s of [...this.spectators, ...this.pets]) s.anim.mixer.stopAllAction();
    this.spectators = [];
    this.pets = [];
    this.group.clear();
  }

  /** Crowd bobs on every beat; in FEVER everyone also jumps on 「ケン」. */
  beat(beatInBar: number, rest: boolean): void {
    for (const s of this.spectators) s.hop = Math.max(s.hop, rest ? 0.4 : 0.7);
    for (const p of this.pets) if (p.hopsOnBeat) p.hop = Math.max(p.hop, 0.6);
    if (beatInBar === 3 && !rest && this.fever) this.jumpAll();
  }

  /** Everyone jumps together — the moment a round is settled. */
  jumpAll(): void {
    for (const s of this.spectators) {
      s.anim.once("jump", 1.3);
      s.hop = 1;
      s.jump = 1;
    }
    for (const p of this.pets) {
      p.hop = 1;
      p.jump = 1;
    }
  }

  setFever(on: boolean): void {
    this.fever = on;
    for (const p of this.pets) {
      if (on) {
        p.target = null;
        p.pause = 999;
        p.anim.loop("dance");
      } else if (p.pause === 999) {
        p.pause = 1;
        p.anim.loop("idle");
      }
    }
  }

  /** Crowd reaction: "yay" for a player hit or win, "aww" when the player gets hit or loses. */
  react(kind: "yay" | "aww" | "win" | "lose"): void {
    for (const s of this.spectators) {
      if ((kind === "yay" || kind === "aww") && !this.rng.chance(0.5)) continue;
      if (kind === "win") s.anim.loop("jump", 1.2);
      else s.anim.once(kind === "yay" ? "emote-yes" : "emote-no", 1.2);
    }
    for (const p of this.pets) {
      if (kind === "win" || kind === "lose") {
        p.target = null;
        p.pause = 999;
        p.anim.loop(kind === "win" ? "gesture-positive" : "gesture-negative");
      }
    }
  }

  /** Back to calm idling, e.g. when a new fight starts in the same park. */
  calm(): void {
    for (const s of this.spectators) s.anim.loop("idle");
    for (const p of this.pets) {
      p.pause = 1 + this.rng.next() * 2;
      p.target = null;
      p.anim.loop("idle");
    }
  }

  tick(dt: number): void {
    for (const s of this.spectators) {
      s.anim.update(dt);
      s.hop = Math.max(0, s.hop - dt * 5);
      s.jump = Math.max(0, s.jump - dt * 2.4);
      s.root.position.y = s.baseY + Math.sin(s.hop * Math.PI) * 0.08 + Math.sin(s.jump * Math.PI) * 0.45;
    }
    for (const p of this.pets) {
      p.anim.update(dt);
      p.hop = Math.max(0, p.hop - dt * 4);
      p.jump = Math.max(0, p.jump - dt * 2.6);
      p.root.position.y = -0.3 + Math.sin(p.hop * Math.PI) * 0.18 + Math.sin(p.jump * Math.PI) * 0.35;
      if (p.pause === 999) continue;
      if (!p.target) {
        p.pause -= dt;
        if (p.pause > 0) continue;
        const [a0, a1] = p.arc;
        p.target = around(a0 + this.rng.next() * (a1 - a0), p.radius[0] + this.rng.next() * (p.radius[1] - p.radius[0]));
        p.anim.loop("walk");
        continue;
      }
      const to = p.target.clone().sub(p.root.position);
      to.y = 0;
      const dist = to.length();
      if (dist < 0.1) {
        p.target = null;
        p.pause = 1.5 + this.rng.next() * 3;
        p.anim.loop(this.rng.chance(0.35) ? "eat" : "idle");
        continue;
      }
      const step = Math.min(dist, PET_SPEED * dt);
      p.root.position.addScaledVector(to.normalize(), step);
      const heading = Math.atan2(to.x, to.z);
      let turn = heading - p.root.rotation.y;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      p.root.rotation.y += turn * Math.min(1, dt * 6);
    }
  }
}
