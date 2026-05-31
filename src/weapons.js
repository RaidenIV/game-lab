// src/weapons.js
// Screen-aimed player laser gun. The visual follows the two-mesh laser pattern:
// a bright white core plus a larger additive glow shell whose colour is exposed
// through the Weapons sidebar controls.
//
// Aiming uses a two-stage approach (per AIMING.md):
//   Stage 1: camera ray through reticle centre → resolve world aim target
//            (enemy aim volumes first, then fallback to far point)
//   Stage 2: projectile spawns at muzzle, then aims toward that resolved target
// This keeps shots accurate at all distances regardless of camera offset.
import * as THREE from 'three';
import { state } from './state.js';
import { scene, camera } from './renderer.js';
import { playerGroup, playerMesh } from './player.js';
import { damageEnemiesAt, getEnemies } from './enemies.js';
import { isPlacedObjectHit } from './placer.js';

const _up = new THREE.Vector3(0, 1, 0);
const _spawnPos = new THREE.Vector3();
const _tmpQuat = new THREE.Quaternion();
const _aimRaycaster = new THREE.Raycaster();
const _aimNdc = new THREE.Vector2(0, 0); // always reticle centre

// ── Aim constants (from AIMING.md) ───────────────────────────────────────────
const AIM_FALLBACK_DISTANCE = 1000;
const AIM_ENEMY_RADIUS_PADDING = 0.15;
const AIM_MIN_TARGET_DISTANCE = 0.75;

// ── Aim result cached each frame — shared between firing and reticle hover ───
// Stored outside state so Three.js objects don't pollute serialisable state.
export const aimResult = {
  type: 'fallback',       // 'enemy' | 'fallback'
  point: new THREE.Vector3(),
  enemy: null,
};

// ── Player rifle visual ───────────────────────────────────────────────────────
// A simple geometric rifle: a long barrel (cylinder) + a small body block.
// It is parented to playerGroup so it inherits player position automatically.
// Each frame updateRifle() repositions it flush against the capsule side and
// rotates it to point toward the resolved aim target.

const _rifleGroup = new THREE.Group();
_rifleGroup.name = 'PlayerRifle';

const _rifleMat = new THREE.MeshStandardMaterial({
  color: 0x222222,
  metalness: 0.82,
  roughness: 0.22,
});
const _rifleAccentMat = new THREE.MeshStandardMaterial({
  color: 0x0044cc,
  metalness: 0.6,
  roughness: 0.3,
  emissive: 0x0044cc,
  emissiveIntensity: 0.12,
});

// Barrel — CapsuleGeometry oriented along Y; rotated 90° in the group so it
// aligns with the local Z-forward direction of the rifle.
const _barrelGeo  = new THREE.CapsuleGeometry(0.045, 0.72, 4, 8);
const _barrelMesh = new THREE.Mesh(_barrelGeo, _rifleMat);
_barrelMesh.rotation.x = Math.PI / 2; // tip pointing toward +Z (forward)
_barrelMesh.position.z = 0.36;        // centre barrel at half its length forward
_barrelMesh.castShadow = false;
_rifleGroup.add(_barrelMesh);

// Body block
const _bodyGeo  = new THREE.BoxGeometry(0.09, 0.11, 0.32);
const _bodyMesh = new THREE.Mesh(_bodyGeo, _rifleMat);
_bodyMesh.position.z = -0.04;
_bodyMesh.castShadow = false;
_rifleGroup.add(_bodyMesh);

// Accent strip (gives it a blue glow matching player colour)
const _accentGeo  = new THREE.BoxGeometry(0.04, 0.04, 0.28);
const _accentMesh = new THREE.Mesh(_accentGeo, _rifleAccentMat);
_accentMesh.position.set(0, 0.075, 0.0);
_accentMesh.castShadow = false;
_rifleGroup.add(_accentMesh);

playerGroup.add(_rifleGroup);

// Reusable vectors for rifle update — allocated once to avoid per-frame GC.
const _rifleAimDir   = new THREE.Vector3();
const _rifleRight    = new THREE.Vector3();
const _rifleWorldPos = new THREE.Vector3();
const _rifleQuat     = new THREE.Quaternion();
const _rifleForward  = new THREE.Vector3(0, 0, 1); // rifle's local +Z = forward

/**
 * Called every frame after resolveAimTarget().
 * Positions the rifle flush against the right side of the player capsule and
 * rotates it so the barrel points toward aimResult.point.
 */
export function updateRifle() {
  const p = state.params;
  const radius = Math.max(0.25, Number(p.playerRadius) || 0.4);
  const length = Math.max(0.1, Number(p.playerLength) || 1.2);

  // Vertical centre of the capsule in local (group) space
  const capsuleCentreY = radius + length / 2;
  // Shoulder height — slightly above capsule centre, matching muzzle height
  const shoulderY = capsuleCentreY + length * 0.15;

  // Direction from player toward aim target (XZ plane for side offset)
  playerGroup.getWorldPosition(_rifleWorldPos);
  _rifleAimDir.copy(aimResult.point).sub(_rifleWorldPos);
  _rifleAimDir.y = 0;
  if (_rifleAimDir.lengthSq() < 0.0001) {
    // Aim exactly at player — use last known forward
    _rifleAimDir.set(Math.sin(playerGroup.rotation.y), 0, Math.cos(playerGroup.rotation.y));
  }
  _rifleAimDir.normalize();

  // Right-hand perpendicular to aim direction (for side placement)
  _rifleRight.set(_rifleAimDir.z, 0, -_rifleAimDir.x); // rotate aim 90° CW around Y

  // Place rifle flush against the capsule surface on the right side
  const sideOffset = radius + 0.055; // just outside capsule surface
  _rifleGroup.position.set(
    _rifleRight.x * sideOffset,
    shoulderY,
    _rifleRight.z * sideOffset,
  );

  // Point rifle barrel (local +Z) toward the world aim point
  // Compute aim direction in player-group local space
  _rifleGroup.getWorldPosition(_rifleWorldPos); // now rifle's world position
  _rifleAimDir.copy(aimResult.point).sub(_rifleWorldPos).normalize();
  if (_rifleAimDir.lengthSq() < 0.0001) _rifleAimDir.set(0, 0, 1);

  _rifleQuat.setFromUnitVectors(_rifleForward, _rifleAimDir);

  // Convert world-space quaternion to parent (playerGroup) local space
  const parentQuat = playerGroup.quaternion;
  _rifleGroup.quaternion.copy(parentQuat).invert().multiply(_rifleQuat);

  // Accent emissive follows player colour
  if (p.playerColor) _rifleAccentMat.emissive.set(p.playerColor);
  _rifleAccentMat.emissiveIntensity = 0.18;

  // Hide rifle while using object placer
  _rifleGroup.visible = p.laserEnabled !== false && (state.activeSlot ?? 0) === 0;
}



// ── Laser pool ────────────────────────────────────────────────────────────────
const _laserGeo = new THREE.CapsuleGeometry(0.055, 0.7, 6, 12);
const _laserCoreMat = new THREE.MeshStandardMaterial({
  color: 0xffffff,
  emissive: 0xffffff,
  emissiveIntensity: 0.45,
  metalness: 0.0,
  roughness: 0.25,
});
const _laserGlowMat = new THREE.MeshBasicMaterial({
  color: 0xff1100,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const _activeLasers = [];
const _laserPool = [];
let _laserCooldown = 0;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function getOverallBloomFactor() {
  const raw = Number(state.params.overallBloomIntensity);
  return clamp(Number.isFinite(raw) ? raw : 1, 0, 4);
}

function applyLaserMaterials() {
  const p = state.params;
  const bloomIntensity = Number(p.laserBloomIntensity);
  _laserGlowMat.color.set(p.laserBloomColor || '#ff1100');
  _laserGlowMat.opacity = p.laserBloom ? clamp((Number.isFinite(bloomIntensity) ? bloomIntensity : 0.55) * getOverallBloomFactor(), 0, 3) : 0;
  _laserGlowMat.needsUpdate = true;
}

function createLaserVisual() {
  const group = new THREE.Group();
  group.name = 'PlayerLaserProjectile';

  const core = new THREE.Mesh(_laserGeo, _laserCoreMat);
  core.name = 'LaserCore';
  core.castShadow = false;
  core.receiveShadow = false;
  group.add(core);

  const glow = new THREE.Mesh(_laserGeo, _laserGlowMat);
  glow.name = 'LaserGlow';
  glow.scale.set(1.85, 1.18, 1.85);
  glow.castShadow = false;
  glow.receiveShadow = false;
  group.add(glow);

  group.visible = false;
  scene.add(group);
  return { group, core, glow, dir: new THREE.Vector3(), distance: 0, maxRange: 0, speed: 0 };
}

function acquireLaser() {
  return _laserPool.pop() || createLaserVisual();
}

function releaseLaser(laser) {
  laser.group.visible = false;
  _laserPool.push(laser);
}

// ── Two-stage aim resolver (AIMING.md) ───────────────────────────────────────

/**
 * Test a ray against a sphere centred at the enemy's visual mid-point.
 * Returns { point, distance } or null.
 */
function intersectEnemyAimVolume(rayOrigin, rayDir, enemy) {
  if (!enemy || !enemy.group) return null;

  const center = enemy.group.position.clone();
  // Aim at visual centre, not the floor origin.
  const bodyHeight = (enemy.radius * 2 + (enemy.sizeMult || 1) * 1.2);
  center.y += bodyHeight * 0.5;

  const radius = (enemy.radius || 0.4) + AIM_ENEMY_RADIUS_PADDING;

  const toCenter = center.clone().sub(rayOrigin);
  const proj = toCenter.dot(rayDir);
  if (proj < 0) return null;

  const closest = rayOrigin.clone().addScaledVector(rayDir, proj);
  const miss = closest.distanceTo(center);
  if (miss > radius) return null;

  const offset = Math.sqrt(Math.max(0, radius * radius - miss * miss));
  const hitDist = Math.max(0, proj - offset);

  return {
    point: rayOrigin.clone().addScaledVector(rayDir, hitDist),
    distance: hitDist,
  };
}

/**
 * Stage 1: cast camera ray through reticle centre, test enemy volumes,
 * fall back to far point. Updates the shared `aimResult` object.
 * Called once per frame from loop.js so both hover colour and firing use it.
 */
export function resolveAimTarget() {
  camera.updateMatrixWorld(true);
  _aimNdc.set(0, 0);
  _aimRaycaster.setFromCamera(_aimNdc, camera);

  const rayOrigin = _aimRaycaster.ray.origin;
  const rayDir    = _aimRaycaster.ray.direction;

  let bestHit = null;

  for (const enemy of getEnemies()) {
    if (!enemy || !enemy.group) continue;
    const hit = intersectEnemyAimVolume(rayOrigin, rayDir, enemy);
    if (!hit) continue;
    if (!bestHit || hit.distance < bestHit.distance) {
      bestHit = { type: 'enemy', enemy, point: hit.point, distance: hit.distance };
    }
  }

  if (bestHit) {
    aimResult.type  = 'enemy';
    aimResult.enemy = bestHit.enemy;
    aimResult.point.copy(bestHit.point);
  } else {
    aimResult.type  = 'fallback';
    aimResult.enemy = null;
    aimResult.point.copy(rayOrigin).addScaledVector(rayDir, AIM_FALLBACK_DISTANCE);
  }
}

/**
 * Stage 2: given the resolved aim target and the projectile spawn position,
 * return the normalised direction the projectile should travel.
 */
function getProjectileDirection(spawnPos, targetPoint, out) {
  out.copy(targetPoint).sub(spawnPos);
  if (out.lengthSq() < 0.0001) {
    // Target is essentially at the muzzle — fall back to camera forward.
    camera.getWorldDirection(out);
  }
  return out.normalize();
}

// ── Shoot sound ───────────────────────────────────────────────────────────────
let _blasterEl = null;
function playShootSound() {
  const vol = Math.max(0, Math.min(1,
    Number(state.params.soundSfxVolume ?? 1) * Number(state.params.soundSfx_shoot ?? 1)
  ));
  if (!vol || state.params.soundMuted) return;
  if (!_blasterEl) {
    _blasterEl = new Audio('./assets/blaster1.wav');
  }
  // Clone for overlapping shots; reuse element if already ended.
  const audio = _blasterEl.paused ? _blasterEl : _blasterEl.cloneNode();
  audio.volume = vol;
  audio.playbackRate = 0.92 + Math.random() * 0.16;
  audio.play().catch(() => {});
}

// ── Firing ────────────────────────────────────────────────────────────────────
const _fireDir = new THREE.Vector3();

function fireLaser() {
  const p = state.params;
  const speed = Math.max(1, Number(p.laserProjectileSpeed) || 22);
  const laser = acquireLaser();

  // Muzzle position: player centre + upward offset + slight forward push
  _spawnPos.copy(playerGroup.position);
  _spawnPos.y += Math.max(0.55, (Number(p.playerRadius) || 0.4) + (Number(p.playerLength) || 1.2) * 0.55);

  // Stage 2: aim from muzzle toward the pre-resolved aim target point
  const targetPoint = aimResult.point;
  getProjectileDirection(_spawnPos, targetPoint, _fireDir);

  // Push muzzle slightly forward along fire direction so the laser doesn't spawn inside the player
  _spawnPos.addScaledVector(_fireDir, Math.max(0.75, (Number(p.playerRadius) || 0.4) + 0.65));

  // Re-resolve direction from pushed muzzle → same target (avoids capsule-edge drift)
  getProjectileDirection(_spawnPos, targetPoint, _fireDir);

  _tmpQuat.setFromUnitVectors(_up, _fireDir);
  laser.group.position.copy(_spawnPos);
  laser.group.quaternion.copy(_tmpQuat);
  laser.group.visible = true;
  laser.glow.visible = !!p.laserBloom;
  laser.dir.copy(_fireDir);
  laser.distance = 0;
  laser.maxRange = Math.max(1, _spawnPos.distanceTo(targetPoint));
  laser.speed = speed;

  _activeLasers.push(laser);
  playShootSound();
}

export function updateLaserProjectiles(delta, projectileDelta = delta) {
  const p = state.params;
  applyLaserMaterials();

  const fireRate = Math.max(0.1, Number(p.laserFireRate) || 5);
  const interval = 1 / fireRate;

  if (!p.laserEnabled || !state.primaryFire) {
    _laserCooldown = 0;
  } else {
    _laserCooldown -= delta;
    if (_laserCooldown <= 0) {
      fireLaser();
      _laserCooldown = interval;
    }
  }

  for (let i = _activeLasers.length - 1; i >= 0; i--) {
    const laser = _activeLasers[i];
    const step = laser.speed * projectileDelta;
    laser.group.position.addScaledVector(laser.dir, step);
    laser.distance += step;
    laser.glow.visible = !!p.laserBloom;

    if (isPlacedObjectHit(laser.group.position, 0.12)) {
      _activeLasers.splice(i, 1);
      releaseLaser(laser);
      continue;
    }

    if (damageEnemiesAt(laser.group.position, 0.36, 34)) {
      _activeLasers.splice(i, 1);
      releaseLaser(laser);
      continue;
    }

    if (laser.distance >= laser.maxRange) {
      _activeLasers.splice(i, 1);
      releaseLaser(laser);
    }
  }
}
