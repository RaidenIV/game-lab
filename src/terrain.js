// src/terrain.js
import * as THREE from 'three';
import { scene } from './renderer.js';

const CHUNK_SIZE  = 20;
const CHUNK_RANGE = 3; // chunks visible in each direction — 7×7 grid total

const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0c1020, roughness: 0.88, metalness: 0.08,
});

const chunks = new Map();
let _lastCX = null;
let _lastCZ = null;

function buildChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return;

  const grp = new THREE.Group();
  grp.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);

  // Floor plane — PlaneGeometry faces up (XY plane), rotate to XZ
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE),
    floorMat
  );
  ground.rotation.x    = -Math.PI / 2;
  ground.receiveShadow = true;
  ground.userData.isFloor = true;
  grp.add(ground);

  // Grid — sits just above floor to avoid z-fighting
  const grid = new THREE.GridHelper(CHUNK_SIZE, CHUNK_SIZE, 0x1a2a4a, 0x1a2a4a);
  grid.material.transparent = true;
  grid.material.opacity     = 0.2;
  grid.material.depthWrite  = false;
  grid.position.y           = 0.004;
  grid.userData.isGrid      = true;
  grp.add(grid);

  scene.add(grp);
  chunks.set(key, grp);
}

function removeChunk(key) {
  const grp = chunks.get(key);
  if (!grp) return;
  scene.remove(grp);
  // dispose geometry to free GPU memory
  grp.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  chunks.delete(key);
}

// Called every frame. Rebuild only when player crosses a chunk boundary.
export function updateChunks(playerPos) {
  const cx = Math.round(playerPos.x / CHUNK_SIZE);
  const cz = Math.round(playerPos.z / CHUNK_SIZE);
  if (cx === _lastCX && cz === _lastCZ) return; // no change, skip rebuild

  const needed = new Set();
  for (let dx = -CHUNK_RANGE; dx <= CHUNK_RANGE; dx++) {
    for (let dz = -CHUNK_RANGE; dz <= CHUNK_RANGE; dz++) {
      const key = `${cx + dx},${cz + dz}`;
      needed.add(key);
      if (!chunks.has(key)) buildChunk(cx + dx, cz + dz);
    }
  }
  for (const key of [...chunks.keys()]) {
    if (!needed.has(key)) removeChunk(key); // dispose geometry, remove from scene
  }

  _lastCX = cx; _lastCZ = cz;
}

export function setFloorVisible(v) {
  chunks.forEach(grp =>
    grp.traverse(o => { if (o.userData.isFloor) o.visible = v; })
  );
}

export function setGridVisible(v) {
  chunks.forEach(grp =>
    grp.traverse(o => { if (o.userData.isGrid) o.visible = v; })
  );
}

export function setFloorColor(hex) {
  floorMat.color.set(hex);
}
