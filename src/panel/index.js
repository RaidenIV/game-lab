// src/panel/index.js
// The panel is built entirely from JavaScript — no HTML template.
// Pattern: write to state.params first, then call onChange to push into Three.js.
// This ensures JSON export always reflects reality.
import * as THREE from 'three';
import { state, defaultParams } from '../state.js';
import { scene, renderer, applyIsoCamD, setActiveCamera, onResize } from '../renderer.js';
import { ambientLight, sunLight, fillLight, rimLight } from '../lighting.js';
import {
  playerMat, playerBaseColor, rebuildPlayerGeo, applyPlayerMaterial,
} from '../player.js';
import { setFloorVisible, setGridVisible, setFloorColor } from '../terrain.js';

const sidebar = document.getElementById('sidebar');

// ── DOM helpers ────────────────────────────────────────────────────────────────

function row(label, control) {
  const d = document.createElement('div');
  d.className = 'sb-row';
  if (label) {
    const l = document.createElement('label');
    l.className = 'sb-label';
    l.textContent = label;
    d.appendChild(l);
  }
  if (control) d.appendChild(control);
  return d;
}

function subhdr(text) {
  const d = document.createElement('div');
  d.className = 'sb-subhdr';
  d.textContent = text;
  return d;
}

// Each section is a header + hidden body. Clicking the header toggles a CSS class.
function section(icon, title, buildFn) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-section';

  const hdr = document.createElement('div');
  hdr.className = 'sb-section-hdr';
  hdr.innerHTML = `<span>${icon}</span><span>${title}</span><span class="arrow">▾</span>`;

  const body = document.createElement('div');
  body.className = 'sb-section-body'; // display: none by default

  hdr.addEventListener('click', () => {
    const open = body.classList.toggle('open'); // display: block when open
    hdr.querySelector('.arrow').textContent = open ? '▴' : '▾';
  });

  wrap.appendChild(hdr);
  wrap.appendChild(body);
  buildFn(body);
  return { el: wrap, body, hdr };
}

// Slider: write to state.params, then call onChange
function slider({ key, label, min, max, step = 0.01, dec = 2, onChange }) {
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.className = 'sb-slider';
  inp.min = min; inp.max = max; inp.step = step;
  inp.value = state.params[key];

  const val = document.createElement('span');
  val.className = 'sb-val';
  val.textContent = Number(state.params[key]).toFixed(dec);

  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    state.params[key] = v;
    val.textContent   = v.toFixed(dec);
    onChange?.(v); // optional immediate side-effect (e.g. light.intensity = v)
  });

  const wrap = document.createElement('div');
  wrap.className = 'sb-slider-wrap';
  wrap.appendChild(inp);
  wrap.appendChild(val);
  return row(label, wrap);
}

function colorPicker(label, key, onChange) {
  const inp = document.createElement('input');
  inp.type = 'color';
  inp.className = 'sb-color';
  inp.value = state.params[key];
  inp.addEventListener('input', () => {
    state.params[key] = inp.value;
    onChange?.(inp.value);
  });
  return row(label, inp);
}

function toggle(label, key, onChange) {
  const wrap = document.createElement('label');
  wrap.className = 'sb-toggle';
  const inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = !!state.params[key];
  inp.addEventListener('change', () => {
    state.params[key] = inp.checked;
    onChange?.(inp.checked);
  });
  wrap.appendChild(inp);
  const knob = document.createElement('span');
  knob.className = 'sb-toggle-knob';
  wrap.appendChild(knob);
  const lbl = document.createElement('span');
  lbl.className = 'sb-toggle-label';
  lbl.textContent = label;
  wrap.appendChild(lbl);
  return wrap;
}

function select(label, key, options, onChange) {
  const sel = document.createElement('select');
  sel.className = 'sb-select';
  for (const [v, l] of options) {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = l;
    if (state.params[key] === v) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => {
    state.params[key] = sel.value;
    onChange?.(sel.value);
  });
  return row(label, sel);
}

function btn(label, cls, onClick) {
  const b = document.createElement('button');
  b.className = 'sb-btn ' + (cls || '');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// ── Section builders ───────────────────────────────────────────────────────────

function buildCamera(body) {
  // Camera type — shows/hides the relevant sub-group
  body.appendChild(select('Type', 'cameraMode', [
    ['iso',   'Isometric'],
    ['third', '3rd Person'],
  ], v => {
    setActiveCamera(v);
    onResize();
    isoGroup.style.display   = v === 'iso'   ? '' : 'none';
    thirdGroup.style.display = v === 'third' ? '' : 'none';
  }));

  const isoGroup = document.createElement('div');
  isoGroup.style.display = state.params.cameraMode === 'iso' ? '' : 'none';
  isoGroup.appendChild(slider({
    key: 'isoCamD', label: 'Zoom', min: 4, max: 40, step: 0.5, dec: 1,
    onChange: v => applyIsoCamD(v),
  }));
  body.appendChild(isoGroup);

  const thirdGroup = document.createElement('div');
  thirdGroup.style.display = state.params.cameraMode === 'third' ? '' : 'none';
  [
    { key: 'thirdDist',      label: 'Distance',   min: 4,  max: 40,          step: 0.5, dec: 1 },
    { key: 'thirdHeight',    label: 'Height',     min: 2,  max: 20,          step: 0.5, dec: 1 },
    { key: 'thirdFov',       label: 'FOV',        min: 30, max: 120,         step: 1,   dec: 0 },
    { key: 'thirdAzimuth',   label: 'Azimuth',    min: 0,  max: Math.PI * 2, step: 0.05, dec: 2 },
    { key: 'thirdLookAhead', label: 'Look Ahead', min: 0,  max: 8,           step: 0.1, dec: 1 },
    { key: 'thirdSmoothPos', label: 'Smoothing',  min: 1,  max: 30,          step: 0.5, dec: 1 },
  ].forEach(o => thirdGroup.appendChild(slider(o)));
  body.appendChild(thirdGroup);
}

function buildPlayer(body) {
  body.appendChild(slider({
    key: 'playerSpeed', label: 'Speed', min: 1, max: 25, step: 0.5, dec: 1,
  }));
  body.appendChild(colorPicker('Color', 'playerColor', v => {
    playerMat.color.set(v);
    playerBaseColor.copy(playerMat.color);
    playerMat.needsUpdate = true;
  }));
  body.appendChild(slider({
    key: 'playerMetalness', label: 'Metalness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.metalness = v; playerMat.needsUpdate = true; },
  }));
  body.appendChild(slider({
    key: 'playerRoughness', label: 'Roughness', min: 0, max: 1, step: 0.01, dec: 2,
    onChange: v => { playerMat.roughness = v; playerMat.needsUpdate = true; },
  }));

  body.appendChild(subhdr('Geometry'));
  body.appendChild(slider({
    key: 'playerRadius', label: 'Radius', min: 0.1, max: 2, step: 0.05, dec: 2,
    onChange: () => rebuildPlayerGeo(),
  }));
  body.appendChild(slider({
    key: 'playerLength', label: 'Length', min: 0.1, max: 4, step: 0.1, dec: 1,
    onChange: () => rebuildPlayerGeo(),
  }));

  body.appendChild(subhdr('Dash'));
  body.appendChild(toggle('Dash Enabled', 'dashEnabled'));
  body.appendChild(slider({ key: 'dashSpeed',    label: 'Speed',    min: 5,    max: 60,  step: 1,    dec: 0 }));
  body.appendChild(slider({ key: 'dashDuration', label: 'Duration', min: 0.05, max: 0.5, step: 0.01, dec: 2 }));
  body.appendChild(slider({ key: 'dashCooldown', label: 'Cooldown', min: 0.1,  max: 5,   step: 0.1,  dec: 1 }));
}

function buildLighting(body) {
  body.appendChild(slider({
    key: 'ambientIntensity', label: 'Ambient', min: 0, max: 3, step: 0.01, dec: 2,
    onChange: v => { ambientLight.intensity = v; },
  }));
  body.appendChild(slider({
    key: 'sunIntensity', label: 'Sun', min: 0, max: 20, step: 0.1, dec: 1,
    onChange: v => { sunLight.intensity = v; },
  }));
  body.appendChild(slider({
    key: 'fillIntensity', label: 'Fill', min: 0, max: 10, step: 0.05, dec: 2,
    onChange: v => { fillLight.intensity = v; },
  }));
  body.appendChild(slider({
    key: 'rimIntensity', label: 'Rim', min: 0, max: 10, step: 0.05, dec: 2,
    onChange: v => { rimLight.intensity = v; },
  }));

  body.appendChild(subhdr('Sun Position'));
  body.appendChild(slider({ key: 'sunAngleX', label: 'X offset', min: -40, max: 40, step: 1, dec: 0 }));
  body.appendChild(slider({ key: 'sunAngleZ', label: 'Z offset', min: -40, max: 40, step: 1, dec: 0 }));

  body.appendChild(subhdr('Shadows'));
  body.appendChild(toggle('Cast Shadows', 'shadows', v => {
    sunLight.castShadow = v;
    renderer.shadowMap.needsUpdate = true;
  }));
}

function buildScene(body) {
  body.appendChild(colorPicker('Background', 'bgColor', v => {
    scene.background = new THREE.Color(v);
    if (scene.fog) scene.fog.color.set(v);
  }));
  body.appendChild(slider({
    key: 'fogNear', label: 'Fog Near', min: 0, max: 100, step: 1, dec: 0,
    onChange: v => { if (scene.fog) scene.fog.near = v; },
  }));
  body.appendChild(slider({
    key: 'fogFar', label: 'Fog Far', min: 10, max: 500, step: 5, dec: 0,
    onChange: v => { if (scene.fog) scene.fog.far = v; },
  }));
  body.appendChild(colorPicker('Floor Color', 'floorColor', v => setFloorColor(v)));
  body.appendChild(toggle('Show Floor', 'showFloor', v => setFloorVisible(v)));
  body.appendChild(toggle('Show Grid',  'showGrid',  v => setGridVisible(v)));
}

// ── JSON export / import / reset ───────────────────────────────────────────────

// Export serialises state.params and triggers a file download.
// Import reads the file, merges into state.params, pushes into Three.js, rebuilds panel DOM.
// Reset restores defaultParams (snapshot taken at startup).
function buildExportImport(container) {
  const wrap = document.createElement('div');
  wrap.className = 'sb-export-row';

  wrap.appendChild(btn('⬇ Export JSON', 'sb-btn-accent', () => {
    const blob = new Blob([JSON.stringify(state.params, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: 'testbed.json' }).click();
    URL.revokeObjectURL(url);
  }));

  wrap.appendChild(btn('⬆ Import JSON', '', () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    inp.addEventListener('change', () => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          Object.assign(state.params, JSON.parse(e.target.result));
          applyAllParams();
          rebuildPanel();
          notify('Imported ✓');
        } catch { notify('⚠ Invalid JSON'); }
      };
      reader.readAsText(inp.files[0]);
    });
    inp.click();
  }));

  wrap.appendChild(btn('↩ Reset Defaults', 'sb-btn-muted', () => {
    Object.assign(state.params, JSON.parse(JSON.stringify(defaultParams)));
    applyAllParams();
    rebuildPanel();
    notify('Reset ✓');
  }));

  container.appendChild(wrap);
}

function notify(msg) {
  let n = document.getElementById('sb-notif');
  if (!n) {
    n = Object.assign(document.createElement('div'), { id: 'sb-notif' });
    document.body.appendChild(n);
  }
  n.textContent = msg;
  n.style.opacity = '1';
  clearTimeout(n._t);
  n._t = setTimeout(() => { n.style.opacity = '0'; }, 2000);
}

// Push every param back into Three.js objects — used after import and reset.
function applyAllParams() {
  const p = state.params;
  applyIsoCamD(p.isoCamD);
  setActiveCamera(p.cameraMode);
  applyPlayerMaterial();
  rebuildPlayerGeo();
  ambientLight.intensity = p.ambientIntensity;
  sunLight.intensity     = p.sunIntensity;
  fillLight.intensity    = p.fillIntensity;
  rimLight.intensity     = p.rimIntensity;
  sunLight.castShadow    = p.shadows;
  renderer.shadowMap.needsUpdate = true;
  scene.background = new THREE.Color(p.bgColor);
  if (scene.fog) { scene.fog.near = p.fogNear; scene.fog.far = p.fogFar; scene.fog.color.set(p.bgColor); }
  setFloorColor(p.floorColor);
  setFloorVisible(p.showFloor);
  setGridVisible(p.showGrid);
}

// ── Build / rebuild panel DOM ──────────────────────────────────────────────────

function rebuildPanel() {
  const body = document.getElementById('sb-body');
  if (!body) return;
  body.innerHTML = '';

  const sections = [
    section('📷', 'Camera',   buildCamera),
    section('🎮', 'Player',   buildPlayer),
    section('💡', 'Lighting', buildLighting),
    section('🌍', 'Scene',    buildScene),
  ];

  sections.forEach(({ el, body: b, hdr }, i) => {
    body.appendChild(el);
    // Open Camera and Player by default
    if (i < 2) {
      b.classList.add('open');
      hdr.querySelector('.arrow').textContent = '▴';
    }
  });

  buildExportImport(body);
}

// ── Init & toggle ──────────────────────────────────────────────────────────────

export function initPanel() {
  if (!sidebar) return;
  sidebar.innerHTML = `
    <div class="sb-header">
      <span class="sb-title">🧪 TESTBED</span>
      <button class="sb-close" id="sb-close-btn" title="Tab">✕</button>
    </div>
    <div id="sb-body" class="sb-body"></div>
  `;
  document.getElementById('sb-close-btn')?.addEventListener('click', togglePanel);
  rebuildPanel();
}

export function togglePanel() {
  state.panelOpen = !state.panelOpen;
  if (sidebar) sidebar.style.display = state.panelOpen ? '' : 'none';
}

initPanel();
