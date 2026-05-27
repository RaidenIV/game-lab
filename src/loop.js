// src/loop.js
import * as THREE from 'three';
import {
  renderer, scene, camera, labelRenderer,
  setActiveCamera, updateIsoCamera, updateThirdCamera,
  getMoveForward, getMoveRight,
} from './renderer.js';
import { state } from './state.js';
import { updateSunPosition } from './lighting.js';
import { updateChunks } from './terrain.js';
import { playerGroup, updatePlayer, updateDashStreaks } from './player.js';

const clock = new THREE.Clock();

export function tick() {
  requestAnimationFrame(tick);

  // Cap at 50ms — without this, tabbing away and back causes a single enormous
  // delta that teleports the player and breaks dash timers.
  const delta = Math.min(clock.getDelta(), 0.05);

  setActiveCamera(state.params.cameraMode);

  if (state.params.cameraMode === 'third') {
    updateThirdCamera(playerGroup.position, delta);
  } else {
    updateIsoCamera(playerGroup.position);
  }

  updateChunks(playerGroup.position);
  updateSunPosition(playerGroup.position);
  updatePlayer(delta, getMoveForward(), getMoveRight());
  updateDashStreaks(delta);

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
