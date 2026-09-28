import * as THREE from "three";
import { type GLTF, GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

export function modelUrl(path: string): string {
  return `${import.meta.env.BASE_URL}models/${path}.glb`;
}

export function loadModel(path: string): Promise<GLTF> {
  let cached = cache.get(path);
  if (!cached) {
    cached = loader.loadAsync(modelUrl(path));
    cache.set(path, cached);
  }
  return cached;
}

/**
 * A fresh copy of a loaded model scaled to `height` scene units, standing on y = 0, with its own
 * materials (so tinting one copy doesn't tint the rest) and shadows on.
 */
export function instance(gltf: GLTF, height: number, skinned = false): { root: THREE.Object3D; materials: THREE.MeshStandardMaterial[] } {
  const root = skinned ? cloneSkinned(gltf.scene) : gltf.scene.clone(true);
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = !skinned;
    if (skinned) {
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mesh.material = mat;
      materials.push(mat);
    }
  });
  const box = new THREE.Box3().setFromObject(root);
  const scale = height / Math.max(0.01, box.max.y - box.min.y);
  root.scale.setScalar(scale);
  root.position.y = -box.min.y * scale;
  const holder = new THREE.Group();
  holder.add(root);
  return { root: holder, materials };
}

/** Plays a character's named clips: an idle loop plus one-shots that blend back to it. */
export class Animator {
  readonly mixer: THREE.AnimationMixer;
  private clips: Map<string, THREE.AnimationClip>;
  private idle: THREE.AnimationAction | null = null;
  private current: THREE.AnimationAction | null = null;

  constructor(root: THREE.Object3D, gltf: GLTF, idleClip = "idle") {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.current && !this.current.clampWhenFinished) this.loop(idleClip);
    });
    this.loop(idleClip);
  }

  has(name: string): boolean {
    return this.clips.has(name);
  }

  duration(name: string): number {
    return this.clips.get(name)?.duration ?? 0;
  }

  /** Switches to a looping clip (idle, walk, dance…). */
  loop(name: string, speed = 1): void {
    const action = this.action(name);
    if (!action || action === this.current) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = speed;
    this.crossTo(action);
    if (name === "idle") this.idle = action;
  }

  /** Plays a clip once, then returns to the last looping clip's idle. */
  once(name: string, speed = 1, hold = false): void {
    const action = this.action(name);
    if (!action) return;
    action.reset().setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = hold;
    action.timeScale = speed;
    this.crossTo(action);
  }

  get idleAction(): THREE.AnimationAction | null {
    return this.idle;
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  private action(name: string): THREE.AnimationAction | null {
    const clip = this.clips.get(name);
    return clip ? this.mixer.clipAction(clip) : null;
  }

  private crossTo(action: THREE.AnimationAction): void {
    action.fadeIn(0.12).play();
    if (this.current && this.current !== action) this.current.fadeOut(0.12);
    this.current = action;
  }
}
