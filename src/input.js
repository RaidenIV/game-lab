// src/input.js
// Keyboard state is stored on state.keys so movement code can poll it every
// frame rather than reacting to events. Dash fires on keydown only.
import * as THREE from 'three';
import { state } from './state.js';
import { getMoveForward, getMoveRight } from './renderer.js';

let _togglePanel = null;

export function initInput({ togglePanel }) {
  _togglePanel = togglePanel;
}

const _dv = new THREE.Vector3();

window.addEventListener('keydown', e => {
  if (e.key === 'Tab') { e.preventDefault(); _togglePanel?.(); return; }

  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup')    state.keys.w = true;
  if (k === 's' || k === 'arrowdown')  state.keys.s = true;
  if (k === 'a' || k === 'arrowleft')  state.keys.a = true;
  if (k === 'd' || k === 'arrowright') state.keys.d = true;

  if (e.key === 'Shift' && state.params.dashEnabled) {
    e.preventDefault();
    if (state.dashCooldown <= 0 && state.dashTimer <= 0) {
      // Build direction from currently held keys + camera-relative vectors
      _dv.set(0, 0, 0);
      if (state.keys.w) _dv.addScaledVector(getMoveForward(),  1);
      if (state.keys.s) _dv.addScaledVector(getMoveForward(), -1);
      if (state.keys.a) _dv.addScaledVector(getMoveRight(),   -1);
      if (state.keys.d) _dv.addScaledVector(getMoveRight(),    1);

      // If no key held, fall back to last walk direction — dash always goes somewhere useful
      if (_dv.lengthSq() > 0) {
        _dv.normalize();
        state.lastMoveX = _dv.x;
        state.lastMoveZ = _dv.z;
      }

      state.dashVX       = state.lastMoveX;
      state.dashVZ       = state.lastMoveZ;
      state.dashTimer    = state.params.dashDuration;
      state.dashCooldown = state.params.dashCooldown;
      state.dashGhostTimer = 0;
    }
  }
});

window.addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (k === 'w' || k === 'arrowup')    state.keys.w = false;
  if (k === 's' || k === 'arrowdown')  state.keys.s = false;
  if (k === 'a' || k === 'arrowleft')  state.keys.a = false;
  if (k === 'd' || k === 'arrowright') state.keys.d = false;
});
