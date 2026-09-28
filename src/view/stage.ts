import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { loadModel } from "./models";
import { Scenery } from "./scenery";
import type { ActionId } from "../core/rules";
import { ease, Tweens } from "./tween";

export type Side = "player" | "enemy";

const SKY_TOP = new THREE.Color("#5cc8ff");
const SKY_MID = new THREE.Color("#b8f5e6");
const SKY_LOW = new THREE.Color("#fff3b0");
const FEVER_TOP = new THREE.Color("#ff9f43");
const FEVER_MID = new THREE.Color("#ffd166");
const FEVER_LOW = new THREE.Color("#fff1c1");
const LEMON = new THREE.Color("#ffd43b");
const MINT = new THREE.Color("#3ddbb0");
const REST = new THREE.Color("#8d8fd8");

export const ACTION_ICONS: Record<ActionId, string> = { attack: "👊", guard: "✋", charge: "🔋", special: "💥" };
export const ACTION_COLORS: Record<ActionId, string> = { attack: "#ff6b6b", guard: "#4dabf7", charge: "#ffd43b", special: "#cc5de8" };

function softDot(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function bubbleRing(): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.strokeStyle = "rgba(255,255,255,0.95)";
  g.lineWidth = 4;
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.beginPath();
  g.arc(22, 22, 6, 0, Math.PI * 2);
  g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type Motion = "attack" | "special" | "guard" | "charge" | "hit" | "win" | "lose";

/** Clip names inside the Kenney Mini Characters files for each motion. */
const CLIPS: Record<Motion, string> = {
  attack: "attack-melee-right",
  special: "attack-kick-right",
  guard: "crouch",
  charge: "emote-yes",
  hit: "emote-no",
  win: "jump",
  lose: "die",
};
const MODEL_HEIGHT = 2.1;
/** The crouch clip is a 0.17 s pose; guard holds it this long before standing up. */
const GUARD_HOLD = 0.5;
/** Turn the models a little toward the camera so faces read, instead of pure profile. */
const FACE_CAMERA = 0.45;

/**
 * One fighter. Shows a rigged glTF character once loaded, and a chunky capsule kid until then
 * (or if loading fails). Beat hops, lunges and knock-backs are procedural and stack on top of
 * the character's clips.
 */
class FighterModel {
  readonly root = new THREE.Group();
  private proc = new THREE.Group();
  private body: THREE.Mesh;
  private bodyMat: THREE.MeshStandardMaterial;
  private headMat: THREE.MeshStandardMaterial;
  private fist: THREE.Mesh;
  private shield: THREE.Mesh;
  private aura: THREE.Mesh;
  private rig: THREE.Object3D | null = null;
  private rigMaterials: THREE.MeshStandardMaterial[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private clips = new Map<string, THREE.AnimationClip>();
  private idle: THREE.AnimationAction | null = null;
  private current: THREE.AnimationAction | null = null;
  private modelUrl = "";
  private releaseIn = 0;
  private bob = 0;
  private hurtT = 0;
  private lungeT = 0;
  private knockT = 0;
  readonly home: THREE.Vector3;

  constructor(readonly side: Side, color: string) {
    const dir = side === "player" ? 1 : -1;
    this.home = new THREE.Vector3(-2.3 * dir, 0.2, 0);
    this.root.position.copy(this.home);
    this.bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.05 });
    this.headMat = new THREE.MeshStandardMaterial({ color: "#ffe9d6", roughness: 0.6 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.7, 6, 16), this.bodyMat);
    this.body.position.y = 1.0;
    this.body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 18), this.headMat);
    head.position.y = 2.05;
    head.castShadow = true;
    const eyeMat = new THREE.MeshStandardMaterial({ color: "#1f2a44", roughness: 0.3 });
    for (const z of [-0.18, 0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), eyeMat);
      eye.position.set(0.42 * dir, 2.12, z);
      this.proc.add(eye);
    }
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.54, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.3), this.bodyMat);
    hair.position.y = 2.1;
    hair.rotation.z = 0.25 * dir;
    this.fist = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), this.headMat);
    this.fist.position.set(0.62 * dir, 1.15, 0.25);
    this.fist.castShadow = true;
    this.proc.add(this.body, head, hair, this.fist);
    this.shield = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 6),
      new THREE.MeshBasicMaterial({ color: "#74c0fc", transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.shield.position.set(0.95 * dir, 1.3, 0);
    this.shield.rotation.y = Math.PI / 2;
    this.aura = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.05, 8, 40),
      new THREE.MeshBasicMaterial({ color: "#ffe066", transparent: true, opacity: 0, depthWrite: false }),
    );
    this.aura.rotation.x = Math.PI / 2;
    this.aura.position.y = 0.3;
    this.root.add(this.proc, this.shield, this.aura);
  }

  setColor(color: string): void {
    this.bodyMat.color.set(color);
  }

  /** Swaps in a rigged character (path under public/models); the capsule stays up until it has loaded. */
  async setModel(path: string): Promise<void> {
    if (path === this.modelUrl) return this.reset();
    this.modelUrl = path;
    let gltf: GLTF;
    try {
      gltf = await loadModel(path);
    } catch {
      return;
    }
    if (path !== this.modelUrl) return;
    if (this.rig) this.root.remove(this.rig);
    const rig = cloneSkinned(gltf.scene);
    this.rigMaterials = [];
    rig.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = mat;
      this.rigMaterials.push(mat);
    });
    const box = new THREE.Box3().setFromObject(rig);
    rig.scale.setScalar(MODEL_HEIGHT / Math.max(0.01, box.max.y - box.min.y));
    rig.rotation.y = this.side === "player" ? Math.PI / 2 - FACE_CAMERA : -Math.PI / 2 + FACE_CAMERA;
    this.rig = rig;
    this.root.add(rig);
    this.proc.visible = false;
    this.mixer = new THREE.AnimationMixer(rig);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.current && this.current.loop === THREE.LoopOnce && this.current.clampWhenFinished === false) this.backToIdle();
    });
    this.reset();
  }

  /** Back to the idle loop, e.g. at the start of a fight after a win or loss pose. */
  reset(): void {
    if (!this.mixer) return;
    this.mixer.stopAllAction();
    this.releaseIn = 0;
    const clip = this.clips.get("idle");
    this.idle = clip ? this.mixer.clipAction(clip) : null;
    this.idle?.reset().play();
    this.current = this.idle;
  }

  /** Plays a one-shot motion and blends back to idle; win/lose poses hold their last frame. */
  play(motion: Motion): void {
    const clip = this.mixer && this.clips.get(CLIPS[motion]);
    if (!this.mixer || !clip) return;
    const action = this.mixer.clipAction(clip);
    const hold = motion === "lose" || motion === "guard";
    this.releaseIn = motion === "guard" ? GUARD_HOLD : 0;
    action.reset();
    action.setLoop(motion === "win" ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = hold;
    action.timeScale = motion === "attack" || motion === "special" ? 1.6 : 1.2;
    action.fadeIn(0.08).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.08);
    this.current = action;
  }

  private backToIdle(): void {
    if (!this.idle || !this.current) return;
    this.idle.reset().fadeIn(0.15).play();
    this.current.fadeOut(0.15);
    this.current = this.idle;
  }

  bounce(): void {
    this.bob = 1;
  }

  hurt(): void {
    this.hurtT = 1;
    this.knockT = 1;
    this.play("hit");
  }

  lunge(): void {
    this.lungeT = 1;
  }

  guard(tweens: Tweens): void {
    const mat = this.shield.material as THREE.MeshBasicMaterial;
    tweens.add(0.6, (k) => {
      mat.opacity = 0.55 * (1 - k);
      this.shield.scale.setScalar(0.7 + 0.4 * ease.outCubic(Math.min(1, k * 3)));
    });
  }

  charge(tweens: Tweens, color = "#ffe066", strength = 1): void {
    const mat = this.aura.material as THREE.MeshBasicMaterial;
    mat.color.set(color);
    tweens.add(0.7, (k) => {
      mat.opacity = 0.9 * (1 - k) * strength;
      this.aura.position.y = 0.3 + 2 * k;
      this.aura.scale.setScalar(1 + 0.3 * k * strength);
    });
  }

  tick(dt: number): void {
    const dir = this.side === "player" ? 1 : -1;
    this.mixer?.update(dt);
    if (this.releaseIn > 0) {
      this.releaseIn -= dt;
      if (this.releaseIn <= 0) this.backToIdle();
    }
    this.bob = Math.max(0, this.bob - dt * 5);
    this.hurtT = Math.max(0, this.hurtT - dt * 2.5);
    this.lungeT = Math.max(0, this.lungeT - dt * 4);
    this.knockT = Math.max(0, this.knockT - dt * 3);
    const hop = Math.sin(this.bob * Math.PI) * 0.18;
    this.root.position.y = this.home.y + hop;
    const squash = 1 + (this.bob > 0.85 ? (this.bob - 0.85) * 1.2 : 0);
    this.body.scale.set(squash, 1 / squash, squash);
    const lunge = Math.sin(this.lungeT * Math.PI) * 0.9;
    const knock = Math.sin(this.knockT * Math.PI) * 0.45;
    this.root.position.x = this.home.x + dir * (lunge - knock);
    this.fist.position.x = (0.62 + lunge * 0.4) * dir;
    const flash = this.hurtT > 0 ? Math.abs(Math.sin(this.hurtT * 18)) * this.hurtT : 0;
    this.bodyMat.emissive.setRGB(flash, 0.1 * flash, 0.1 * flash);
    this.headMat.emissive.setRGB(flash * 0.6, 0, 0);
    for (const mat of this.rigMaterials) mat.emissive.setRGB(flash * 0.8, 0.05 * flash, 0.05 * flash);
  }
}

const CONFETTI_COUNT = 360;
const CONFETTI_COLORS = ["#ffd43b", "#ff6b6b", "#4dabf7", "#69db7c", "#cc5de8", "#ff922b", "#ffffff"];

/** Paper confetti raining over the arena for a few seconds. */
class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private spin: THREE.Vector3[] = [];
  private rot: THREE.Euler[] = [];
  private dummy = new THREE.Object3D();
  life: number;

  constructor(seconds: number) {
    this.life = seconds;
    this.mesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.16, 0.24),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true, fog: false }),
      CONFETTI_COUNT,
    );
    const color = new THREE.Color();
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      this.pos.push(new THREE.Vector3((Math.random() - 0.5) * 14, 6 + Math.random() * 10, (Math.random() - 0.5) * 8));
      this.vel.push(new THREE.Vector3((Math.random() - 0.5) * 0.6, -1.4 - Math.random() * 1.2, (Math.random() - 0.5) * 0.6));
      this.spin.push(new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      this.rot.push(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6));
      this.mesh.setColorAt(i, color.set(CONFETTI_COLORS[i % CONFETTI_COLORS.length]));
    }
    this.mesh.renderOrder = 30;
  }

  tick(dt: number): void {
    this.life -= dt;
    const t = performance.now() / 1000;
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      const p = this.pos[i];
      p.addScaledVector(this.vel[i], dt);
      p.x += Math.sin(t * 2 + i) * dt * 0.4;
      if (p.y < -0.2) p.y += 12;
      const r = this.rot[i];
      r.set(r.x + this.spin[i].x * dt, r.y + this.spin[i].y * dt, r.z + this.spin[i].z * dt);
      this.dummy.position.copy(p);
      this.dummy.rotation.copy(r);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.life);
  }
}

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  gravity: number;
}

/**
 * The 3D arena. Owns the renderer, camera, fighters, beat orbs and effects; knows nothing about
 * game rules — the app tells it what to show.
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  readonly tweens = new Tweens();
  readonly player: FighterModel;
  readonly enemy: FighterModel;
  readonly scenery: Scenery;

  private skyUniforms = { top: { value: SKY_TOP.clone() }, mid: { value: SKY_MID.clone() }, low: { value: SKY_LOW.clone() } };
  private ring: THREE.Mesh;
  private orbs: THREE.Mesh[] = [];
  private orbLabels: THREE.Sprite[] = [];
  private orbLevel = [0, 0, 0, 0];
  private orbColor: THREE.Color[] = [MINT.clone(), MINT.clone(), MINT.clone(), LEMON.clone()];
  private bursts: Burst[] = [];
  private bubbles: THREE.Points;
  private bubbleSpeed: Float32Array;
  private dot = softDot();
  private feverK = 0;
  private feverOn = false;
  private punch = 0;
  private shakeT = 0;
  private shakeStrength = 0;
  private cameraBase = new THREE.Vector3(0, 2.9, 10);
  private lookAt = new THREE.Vector3(0, 1.5, 0);
  private cards: THREE.Mesh[] = [];
  private confetti: Confetti | null = null;
  private cardCache = new Map<string, THREE.Texture>();
  /** Seconds the gesture cards stay up; shorter when the next bar follows without a rest. */
  cardLife = 1.3;
  private clock = new THREE.Clock();
  onFrame: (dt: number) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.Fog("#c9f4ea", 16, 40);
    this.buildSky();
    this.buildLights();
    this.ring = this.buildArena();
    this.scenery = new Scenery(this.scene);
    this.buildOrbs();
    this.player = new FighterModel("player", "#4dabf7");
    this.enemy = new FighterModel("enemy", "#ff8a80");
    this.scene.add(this.player.root, this.enemy.root);
    const { points, speeds } = this.buildBubbles();
    this.bubbles = points;
    this.bubbleSpeed = speeds;

    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private buildSky(): void {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: this.skyUniforms,
        vertexShader: "varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
        fragmentShader:
          "uniform vec3 top; uniform vec3 mid; uniform vec3 low; varying vec3 vPos; void main(){ float h = normalize(vPos).y; vec3 c = h > 0.1 ? mix(mid, top, smoothstep(0.1, 0.6, h)) : mix(low, mid, smoothstep(-0.2, 0.1, h)); gl_FragColor = vec4(c, 1.0); }",
      }),
    );
    this.scene.add(sky);
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#9be7d2", 1.4));
    const sun = new THREE.DirectionalLight("#fff6e0", 2.2);
    sun.position.set(4, 9, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    sun.shadow.camera.far = 40;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const rim = new THREE.PointLight("#b8f5ff", 18, 20);
    rim.position.set(0, 4, -4);
    this.scene.add(rim);
  }

  private buildArena(): THREE.Mesh {
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.6, 0.5, 64),
      new THREE.MeshStandardMaterial({ color: "#f4fffb", roughness: 0.35, metalness: 0.05 }),
    );
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    const inner = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 64),
      new THREE.MeshStandardMaterial({ color: "#d3f9ec", roughness: 0.5 }),
    );
    inner.rotation.x = -Math.PI / 2;
    inner.position.y = 0.205;
    inner.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4.7, 0.08, 12, 96),
      new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: MINT.clone(), emissiveIntensity: 0.6 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.22;
    const lemon = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 48),
      new THREE.MeshStandardMaterial({ color: "#fff3a3", emissive: LEMON.clone(), emissiveIntensity: 0.25 }),
    );
    lemon.rotation.x = -Math.PI / 2;
    lemon.position.y = 0.21;
    this.scene.add(floor, inner, ring, lemon);
    return ring;
  }

  private buildOrbs(): void {
    for (let i = 0; i < 4; i++) {
      const big = i === 3;
      const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: this.orbColor[i].clone(), emissiveIntensity: 0.1, roughness: 0.2, transparent: true, opacity: 0.9 });
      const orb = new THREE.Mesh(new THREE.SphereGeometry(big ? 0.42 : 0.3, 24, 16), mat);
      orb.position.set(-2.1 + i * 1.4, 3.95, -1.2);
      this.scene.add(orb);
      this.orbs.push(orb);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
      label.position.copy(orb.position).add(new THREE.Vector3(0, 0, 0.5));
      label.scale.set(0.7, 0.7, 1);
      this.scene.add(label);
      this.orbLabels.push(label);
    }
  }

  setChant(labels: string[]): void {
    labels.forEach((text, i) => {
      const c = document.createElement("canvas");
      c.width = c.height = 128;
      const g = c.getContext("2d")!;
      g.font = `900 ${text.length > 1 ? 52 : 64}px "M PLUS Rounded 1c", "Noto Sans SC", sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineWidth = 10;
      g.strokeStyle = "rgba(31,42,68,0.85)";
      g.strokeText(text, 64, 68);
      g.fillStyle = "#ffffff";
      g.fillText(text, 64, 68);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const mat = this.orbLabels[i].material as THREE.SpriteMaterial;
      mat.map?.dispose();
      mat.map = tex;
      mat.needsUpdate = true;
    });
  }

  private buildBubbles(): { points: THREE.Points; speeds: Float32Array } {
    const count = 140;
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 18;
      positions[i * 3 + 1] = Math.random() * 10;
      positions[i * 3 + 2] = -3 - Math.random() * 8;
      speeds[i] = 0.3 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.35, map: bubbleRing(), transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.scene.add(points);
    return { points, speeds };
  }

  /** Confetti, a gold sky and the crowd going wild — for clearing the game. */
  celebrate(seconds = 6): void {
    if (this.confetti) this.scene.remove(this.confetti.mesh);
    this.confetti = new Confetti(seconds);
    this.scene.add(this.confetti.mesh);
    this.setFever(true);
    this.player.play("win");
    this.enemy.play("lose");
    this.scenery.react("win");
    this.punch = 1;
  }

  setEnemyColor(color: string): void {
    this.enemy.setColor(color);
  }

  /** A beat as heard. Beats 1–3 light their orb and keep it lit; 「モン」 flashes everything. */
  beat(beatInBar: number, rest: boolean): void {
    this.player.bounce();
    this.enemy.bounce();
    this.scenery.beat(beatInBar, rest);
    if (beatInBar === 0) this.orbLevel = [0, 0, 0, 0];
    const color = rest ? REST : null;
    this.orbColor.forEach((c, i) => c.copy(color ?? (i === 3 || this.feverOn ? LEMON : MINT)));
    if (beatInBar < 3) {
      this.orbLevel[beatInBar] = rest ? 0.35 : 1;
    } else {
      this.orbLevel = rest ? [0.35, 0.35, 0.35, 0.5] : [1.3, 1.3, 1.3, 2];
      if (!rest) this.punch = 1;
    }
    const ringMat = this.ring.material as THREE.MeshStandardMaterial;
    ringMat.emissive.copy(rest ? REST : this.feverOn ? LEMON : MINT);
    ringMat.emissiveIntensity = beatInBar === 3 && !rest ? 2.2 : 1.0;
  }

  setFever(on: boolean): void {
    if (on !== this.feverOn) this.scenery.setFever(on);
    this.feverOn = on;
  }

  /** Throws both gesture cards to the middle; `onImpact` fires when they meet. */
  reveal(playerAction: ActionId, enemyAction: ActionId, labels: Record<ActionId, string>, marks: { player?: string; enemy?: string }, onImpact: () => void): void {
    this.clearCards();
    const specs: [Side, ActionId, string | undefined][] = [
      ["player", playerAction, marks.player],
      ["enemy", enemyAction, marks.enemy],
    ];
    for (const [side, action, mark] of specs) {
      const dir = side === "player" ? -1 : 1;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(1.05, 1.35),
        new THREE.MeshBasicMaterial({ map: this.cardTexture(action, labels[action], mark), transparent: true, depthWrite: false, fog: false }),
      );
      card.renderOrder = 10;
      const from = new THREE.Vector3(2.3 * dir, 1.6, 0.6);
      const to = new THREE.Vector3(0.62 * dir, 2.95, 1.4);
      card.position.copy(from);
      card.scale.setScalar(0.3);
      this.scene.add(card);
      this.cards.push(card);
      this.tweens.add(0.22, (k) => {
        const e = ease.outBack(k);
        card.position.lerpVectors(from, to, e);
        card.scale.setScalar(0.3 + 0.7 * e);
        card.rotation.z = (1 - k) * 0.6 * dir;
      });
    }
    this.tweens.delay(0.22, onImpact);
    this.tweens.delay(this.cardLife, () => this.fadeCards());
  }

  private cardTexture(action: ActionId, label: string, mark?: string): THREE.Texture {
    const key = `${action}|${label}|${mark ?? ""}`;
    const cached = this.cardCache.get(key);
    if (cached) return cached;
    const c = document.createElement("canvas");
    c.width = 250;
    c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgba(0,0,0,0.18)";
    roundRect(g, 10, 16, 230, 296, 30);
    g.fill();
    g.fillStyle = "#ffffff";
    roundRect(g, 6, 6, 230, 296, 30);
    g.fill();
    g.lineWidth = 12;
    g.strokeStyle = ACTION_COLORS[action];
    roundRect(g, 12, 12, 218, 284, 26);
    g.stroke();
    g.font = "120px sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.globalAlpha = mark ? 0.35 : 1;
    g.fillText(ACTION_ICONS[action], 121, 130);
    g.globalAlpha = 1;
    g.font = '900 40px "M PLUS Rounded 1c", "Noto Sans SC", sans-serif';
    g.fillStyle = "#1f2a44";
    g.fillText(label, 121, 250);
    if (mark) {
      g.font = '900 36px "M PLUS Rounded 1c", "Noto Sans SC", sans-serif';
      g.fillStyle = "#e03131";
      g.fillText(mark, 121, 130);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.cardCache.set(key, tex);
    return tex;
  }

  knockCards(): void {
    for (const card of this.cards) {
      const dir = Math.sign(card.position.x) || 1;
      const start = card.position.clone();
      this.tweens.add(0.25, (k) => {
        card.position.x = start.x + dir * 0.35 * Math.sin(k * Math.PI);
        card.rotation.z = dir * 0.25 * Math.sin(k * Math.PI);
      });
    }
  }

  private fadeCards(): void {
    for (const card of this.cards) {
      const mat = card.material as THREE.MeshBasicMaterial;
      const y = card.position.y;
      this.tweens.add(0.3, (k) => {
        mat.opacity = 1 - k;
        card.position.y = y + 0.3 * k;
      }, () => {
        this.scene.remove(card);
        card.geometry.dispose();
      });
    }
    this.cards = [];
  }

  private clearCards(): void {
    for (const card of this.cards) {
      this.scene.remove(card);
      card.geometry.dispose();
    }
    this.cards = [];
  }

  sparks(at: THREE.Vector3, color: string, count = 28, speed = 4, gravity = 0): void {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions.set([at.x, at.y, at.z], i * 3);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      velocities.set([dir.x, dir.y + (gravity ? 2.5 : 0), dir.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color, size: 0.28, map: this.dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }),
    );
    points.renderOrder = 20;
    this.scene.add(points);
    this.bursts.push({ points, velocities, life: 1, gravity });
  }

  cardMeet(): THREE.Vector3 {
    return new THREE.Vector3(0, 2.95, 1.4);
  }

  fighter(side: Side): FighterModel {
    return side === "player" ? this.player : this.enemy;
  }

  chest(side: Side): THREE.Vector3 {
    return this.fighter(side).root.position.clone().add(new THREE.Vector3(0, 1.3, 0.3));
  }

  shake(strength: number): void {
    this.shakeT = 1;
    this.shakeStrength = strength;
  }

  /** Screen position (CSS px) of a point above a fighter's head, for DOM bubbles and popups. */
  screenOf(side: Side, height = 2.9): { x: number; y: number } {
    const p = this.fighter(side).root.position.clone();
    p.y += height;
    return this.project(p);
  }

  project(p: THREE.Vector3): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
  }

  private resize(): void {
    const canvas = this.renderer.domElement;
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const portrait = w / h < 1;
    this.camera.fov = portrait ? 62 : 40;
    this.cameraBase.set(0, portrait ? 3.4 : 2.9, portrait ? 13.5 : 10);
    this.lookAt.set(0, portrait ? 0.9 : 1.5, 0);
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.tweens.tick(dt);
    this.player.tick(dt);
    this.enemy.tick(dt);
    this.scenery.tick(dt);
    if (this.confetti) {
      this.confetti.tick(dt);
      if (this.confetti.life <= 0) {
        this.scene.remove(this.confetti.mesh);
        this.confetti.mesh.geometry.dispose();
        this.confetti = null;
      }
    }
    this.onFrame(dt);

    this.feverK += ((this.feverOn ? 1 : 0) - this.feverK) * Math.min(1, dt * 3);
    this.skyUniforms.top.value.copy(SKY_TOP).lerp(FEVER_TOP, this.feverK);
    this.skyUniforms.mid.value.copy(SKY_MID).lerp(FEVER_MID, this.feverK);
    this.skyUniforms.low.value.copy(SKY_LOW).lerp(FEVER_LOW, this.feverK);

    this.orbs.forEach((orb, i) => {
      this.orbLevel[i] *= i === 3 ? 0.9 : 0.995;
      const mat = orb.material as THREE.MeshStandardMaterial;
      mat.emissive.lerp(this.orbColor[i], 0.3);
      mat.emissiveIntensity = 0.08 + this.orbLevel[i];
      orb.scale.setScalar(1 + 0.15 * Math.min(1, this.orbLevel[i]));
      orb.position.y = 3.95 + Math.sin(performance.now() / 600 + i) * 0.06;
      this.orbLabels[i].position.y = orb.position.y;
    });
    const ringMat = this.ring.material as THREE.MeshStandardMaterial;
    ringMat.emissiveIntensity += (0.6 - ringMat.emissiveIntensity) * Math.min(1, dt * 4);

    const pos = this.bubbles.geometry.getAttribute("position") as THREE.BufferAttribute;
    const lift = 1 + this.feverK * 2.5;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + this.bubbleSpeed[i] * dt * lift;
      if (y > 10) y = -0.5;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(y * 2 + i) * dt * 0.1);
    }
    pos.needsUpdate = true;
    (this.bubbles.material as THREE.PointsMaterial).opacity = 0.4 + this.feverK * 0.5;

    for (const burst of this.bursts) {
      burst.life -= dt * 1.6;
      const attr = burst.points.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        burst.velocities[i * 3 + 1] -= burst.gravity * dt;
        attr.setXYZ(i, attr.getX(i) + burst.velocities[i * 3] * dt, attr.getY(i) + burst.velocities[i * 3 + 1] * dt, attr.getZ(i) + burst.velocities[i * 3 + 2] * dt);
      }
      attr.needsUpdate = true;
      (burst.points.material as THREE.PointsMaterial).opacity = Math.max(0, burst.life);
    }
    this.bursts = this.bursts.filter((b) => {
      if (b.life > 0) return true;
      this.scene.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
      return false;
    });

    this.punch = Math.max(0, this.punch - dt * 5);
    this.shakeT = Math.max(0, this.shakeT - dt * 3);
    const s = this.shakeT * this.shakeStrength * 0.03;
    const zoom = 1 - 0.04 * this.punch;
    this.camera.position.copy(this.cameraBase).sub(this.lookAt).multiplyScalar(zoom).add(this.lookAt);
    this.camera.position.x += (Math.random() - 0.5) * s;
    this.camera.position.y += (Math.random() - 0.5) * s;
    this.camera.lookAt(this.lookAt);
    this.renderer.render(this.scene, this.camera);
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
