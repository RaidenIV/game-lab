// src/lighting.js
import * as THREE from 'three';
import { scene } from './renderer.js';
import { state } from './state.js';

export const ambientLight = new THREE.AmbientLight(0x111827, 0.42);
scene.add(ambientLight);

export const hemiLight = new THREE.HemisphereLight(
  0xe7f4ff, // sky — cool blue-white
  0x0a0d12, // ground — near-black
  0.6
);
scene.add(hemiLight);

export const sunLight = new THREE.DirectionalLight(0xf7fbff, 5.8);
sunLight.position.set(16, 28, 14);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near   = 0.1;
sunLight.shadow.camera.far    = 150;
sunLight.shadow.camera.left   = -40;
sunLight.shadow.camera.right  =  40;
sunLight.shadow.camera.top    =  40;
sunLight.shadow.camera.bottom = -40;
sunLight.shadow.bias       = -0.00012;  // eliminate shadow acne on flat surfaces
sunLight.shadow.normalBias =  0.03;
scene.add(sunLight);
scene.add(sunLight.target);

export const fillLight = new THREE.DirectionalLight(0xc7d9ff, 1.35);
fillLight.position.set(-18, 10, -14); // opposite side from sun
scene.add(fillLight);

export const rimLight = new THREE.DirectionalLight(0xaec8ff, 0.82);
rimLight.position.set(6, 5, -26); // behind the player
scene.add(rimLight);

// The sun follows the player so shadows always appear around the player's
// position regardless of how far they've moved.
export function updateSunPosition(playerPos) {
  sunLight.position.set(
    playerPos.x + state.params.sunAngleX,
    28,
    playerPos.z + state.params.sunAngleZ
  );
  sunLight.target.position.copy(playerPos);
  sunLight.target.updateMatrixWorld(); // required when moving the target
}
