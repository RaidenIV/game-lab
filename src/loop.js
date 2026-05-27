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
let _fpsEMA = 60;

export function tick() {
  requestAnimationFrame(tick);

  // Cap at 50ms — without this, tabbing away and back causes a single enormous
  // delta that teleports the player and breaks dash timers.
  const rawDelta = clock.getDelta();
  const delta    = Math.min(rawDelta, 0.05);

  // FPS — exponential moving average, update display every frame
  _fpsEMA = _fpsEMA * 0.9 + (1 / Math.max(rawDelta, 0.001)) * 0.1;
  const fpsEl = document.getElementById('fps-val');
  if (fpsEl) fpsEl.textContent = Math.round(_fpsEMA);

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
