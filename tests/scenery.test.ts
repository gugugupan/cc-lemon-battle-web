import * as THREE from "three";
import { expect, it } from "vitest";
import { Animator } from "../src/view/models";
import { Scenery } from "../src/view/scenery";

it("makes the whole crowd and every pet jump together, then land", () => {
  const scenery = new Scenery(new THREE.Scene());
  const fakeGltf = { animations: [] } as never;
  const internals = scenery as unknown as {
    spectators: { root: THREE.Object3D; anim: Animator; hop: number; jump: number; baseY: number }[];
    pets: { root: THREE.Object3D; anim: Animator; arc: [number, number]; radius: [number, number]; target: null; pause: number; hop: number; jump: number; hopsOnBeat: boolean }[];
  };
  for (let i = 0; i < 3; i++) {
    const root = new THREE.Group();
    internals.spectators.push({ root, anim: new Animator(root, fakeGltf), hop: 0, jump: 0, baseY: -0.3 });
  }
  const petRoot = new THREE.Group();
  internals.pets.push({ root: petRoot, anim: new Animator(petRoot, fakeGltf), arc: [220, 260], radius: [6, 6.5], target: null, pause: 99, hop: 0, jump: 0, hopsOnBeat: false });

  scenery.jumpAll();
  scenery.tick(0.2);
  for (const s of internals.spectators) expect(s.root.position.y).toBeGreaterThan(s.baseY + 0.3);
  expect(petRoot.position.y).toBeGreaterThan(-0.3 + 0.2);

  for (let i = 0; i < 10; i++) scenery.tick(0.1);
  for (const s of internals.spectators) expect(s.root.position.y).toBeCloseTo(s.baseY, 5);
  expect(petRoot.position.y).toBeCloseTo(-0.3, 5);
});
