import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { describeBuild, makeHardware } from './builder-models.mjs?v=startup-1';
import { createPowerSequence, applyHardwarePower } from './builder-power.mjs?v=startup-1';

const viewport = document.getElementById('device-viewport');
const fallback = document.getElementById('device-fallback');
const controls = document.getElementById('stage-controls');
const caption = document.getElementById('device-caption');
const badge = document.getElementById('device-type');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

try {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x0a111b, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');
  fallback.hidden = true;
  controls.hidden = false;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1723);
  scene.fog = new THREE.Fog(0x0d1723, 13, 24);
  const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(environment, .05).texture;
  scene.environmentIntensity = .65; environment.dispose(); pmrem.dispose();
  const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
  const light = new THREE.HemisphereLight(0xf2f7ff, 0x1d2937, .9); scene.add(light);
  [[0xf2f6ff, 3.4, -3, 6, 5], [0x8bbedf, 1.6, 4, 1, 2], [0xe0ecff, 2, -2, 3, -4]].forEach(([color, intensity, x, y, z], i) => {
    const l = new THREE.DirectionalLight(color, intensity); l.position.set(x, y, z); scene.add(l);
    if (i === 0) {
      l.castShadow = true; l.shadow.mapSize.set(1024, 1024);
      Object.assign(l.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
      l.shadow.normalBias = .025; l.shadow.bias = -.0002;
    }
  });
  const machine = new THREE.Group(); scene.add(machine);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x111e2a, roughness: .5, metalness: .28 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -1.99; floor.receiveShadow = true; scene.add(floor);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.08, .12, 80), new THREE.MeshStandardMaterial({ color: 0x111e2d, metalness: .5, roughness: .42 }));
  pedestal.position.y = -1.9; pedestal.receiveShadow = true; pedestal.castShadow = true; scene.add(pedestal);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(2.01, .012, 8, 100), new THREE.MeshBasicMaterial({ color: 0x39bacc }));
  halo.rotation.x = Math.PI / 2; halo.position.y = -1.8; scene.add(halo);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(640, 460), .24, .5, 1.2));
  composer.addPass(new OutputPass());
  let yaw = .42, pitch = .2, targetYaw = yaw, targetPitch = pitch, distance = 8.6;
  let exploded = false, frame = 0, active = true, lost = false, motion = !reduceMotion.matches, previousTime = 0;
  const motionButton = document.getElementById('device-motion');
  const animate = () => motion && !reduceMotion.matches;
  const smooth = t => t < .5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2;
  let lastSpec = null;
  const powerSequence = createPowerSequence();
  let powerClock = 0, idleCaption = '';
  const pieces = new Map();
  const retiring = [];
  const directions = { case: [-1.35, .4, -.5], board: [0, .15, -.8], cpu: [-1, 1, 1.2], gpu: [-.65, -.1, 1.9], ram: [1.4, 1, .8], storage: [1.1, -.7, 1], cooling: [0, 1.5, 1.7], appliance: [0, .3, 0] };
  function dispose(group) {
    const materials = new Set();
    group.traverse(child => { child.geometry?.dispose(); if (child.material) materials.add(child.material); });
    materials.forEach(m => { m.map?.dispose(); m.dispose(); }); machine.remove(group);
  }
  function schedule() { if (!frame && active && !lost && !document.hidden) frame = requestAnimationFrame(draw); }
  function draw(now) {
    frame = 0;
    if (!active || lost || document.hidden) return;
    const delta = Math.min(.05, (now - (previousTime || now)) / 1000); previousTime = now;
    // Advance startup only while the preview is visible, including on phones.
    powerClock += delta * 1000;
    const power = powerSequence.sample(powerClock, animate());
    viewport.dataset.power = power.phase;
    const powerCaption = power.phase === 'starting' ? 'Starting up your build…'
      : power.phase === 'running' ? 'Your build, powered on. How does the estimate feel?' : idleCaption;
    if (caption.textContent !== powerCaption) caption.textContent = powerCaption;
    let moving = false, spinning = false;
    pieces.forEach((p, slot) => {
      const elapsed = Math.max(0, (now - p.start) / 1150);
      const t = animate() ? Math.min(1, elapsed) : 1;
      const ease = smooth(t);
      const d = directions[slot];
      const target = exploded ? d : [0, 0, 0];
      p.group.position.set(...target.map((n, i) => p.from[i] + (n - p.from[i]) * ease));
      if (p.install) p.group.position.y += Math.sin(t * Math.PI) * .17;
      p.group.rotation.y = (1 - ease) * p.spin;
      p.group.scale.lerpVectors(p.scaleFrom, p.scaleTo, ease);
      for (const unit of p.group.userData.units) {
        const unitT = animate() && p.install ? Math.max(0, Math.min(1, (now - p.start - unit.index * 65) / 1150)) : 1;
        unit.group.position.copy(unit.home); unit.group.position.z += (1 - smooth(unitT)) * .24;
        if (unitT < 1) moving = true;
      }
      if (applyHardwarePower(p.group, lastSpec, power, { delta, now: powerClock, motion: animate() })) spinning = true;
      if (t < 1) moving = true;
    });
    for (let i = retiring.length - 1; i >= 0; i--) {
      const p = retiring[i], t = animate() ? Math.min(1, (now - p.start) / 780) : 1, ease = smooth(t);
      p.group.position.set(...p.to.map((n, j) => p.from[j] + (n - p.from[j]) * ease));
      p.group.position.y += Math.sin(t * Math.PI) * .2;
      p.group.rotation.y = p.angle - ease * .16;
      p.materials.forEach(m => { m.transparent = true; m.opacity = m.userData.departureOpacity * (1 - Math.max(0, (t - .45) / .55)); });
      if (t >= 1) { dispose(p.group); retiring.splice(i, 1); } else moving = true;
    }
    const blend = animate() ? 1 - Math.exp(-delta * (power.phase === 'starting' ? 2.4 : 10)) : 1;
    yaw += (targetYaw - yaw) * blend; pitch += (targetPitch - pitch) * blend;
    const wantedDistance = exploded ? 12 : camera.aspect < .95 ? 10.1 : 8.6;
    distance += (wantedDistance - distance) * blend;
    if (Math.abs(targetYaw - yaw) + Math.abs(targetPitch - pitch) + Math.abs(wantedDistance - distance) > .002) moving = true;
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * distance, Math.sin(pitch) * distance + .2, Math.cos(yaw) * Math.cos(pitch) * distance);
    camera.lookAt(0, -.08, 0);
    composer.render();
    if (moving || power.phase === 'starting') schedule();
    else if (spinning) setTimeout(schedule, 24);
  }
  function update({ build = {}, estimate, phase } = {}) {
    const spec = describeBuild(build, window.AHERN_PRICING);
    const now = performance.now();
    // Stable identities: lighting changes never tear the whole machine apart.
    for (const [slot, old] of pieces) {
      if (!spec.slots[slot] || old.key !== spec.slots[slot]) {
        const materials = new Set(); old.group.traverse(c => { if (c.material) { c.material.userData.departureOpacity = c.material.opacity; materials.add(c.material); } });
        const out = directions[slot].map(n => n * 2.8); out[2] += .8;
        retiring.push({ group: old.group, from: old.group.position.toArray(), to: out, angle: old.group.rotation.y, start: now, materials }); pieces.delete(slot);
      } else {
        const scale = new THREE.Vector3(...(spec.kind === 'compact' ? [.8, .8, .85] : spec.kind === 'rack' ? [1.28, .64, 1.12] : [1, 1, 1]));
        if (!scale.equals(old.scaleTo)) {
          old.from = old.group.position.toArray(); old.scaleFrom = old.group.scale.clone(); old.scaleTo = scale; old.start = now; old.spin = old.group.rotation.y; old.install = false;
        }
      }
    }
    for (const [slot, key] of Object.entries(spec.slots)) {
      if (!key || pieces.has(slot) || (slot === 'gpu' && !spec.gpuCount)) continue;
      // Appliance storage is included inside the sealed system, not a loose PC SSD.
      if (spec.kind === 'appliance' && slot === 'storage') continue;
      const group = makeHardware(THREE, slot, spec);
      const from = directions[slot].map(v => v * 2.1); from[2] += .6;
      group.position.set(...from); machine.add(group);
      pieces.set(slot, { group, key, from, start: now + (lastSpec ? 130 : pieces.size * 85), spin: slot === 'case' ? -.12 : .16, install: true, scaleFrom: group.scale.clone(), scaleTo: group.scale.clone() });
    }
    badge.textContent = build.trackLabel || 'Your blank canvas';
    const changed = lastSpec ? Object.keys(spec.slots).filter(k => spec.slots[k] && spec.slots[k] !== lastSpec.slots[k]) : [];
    idleCaption = !build.track ? 'Choose a purpose to start your build.'
      : spec.kind === 'appliance' ? 'A complete system. Memory and compute live inside the enclosure.'
      : changed.length ? changed.map(k => ({ case: 'Chassis', board: 'Platform', cpu: 'CPU', gpu: 'Graphics', ram: 'Memory', cooling: 'Cooling', storage: 'Storage' }[k])).join(' + ') + ' updated.'
      : estimate?.complete ? 'Your hardware is ready. Fine-tune any answer to make it yours.' : 'Your machine is taking shape.';
    const ready = !!estimate?.complete && (phase === 'expectation' || phase === 'summary');
    if (ready && exploded) setExploded(false);
    const installDelay = Math.max(0, ...Array.from(pieces.values(), p =>
      p.start + 1150 + (p.install ? Math.max(0, p.group.userData.units.length - 1) * 65 : 0) - now));
    const started = powerSequence.update({ ready, hardwareKey: JSON.stringify(spec), now: powerClock, installDelay, motion: animate() });
    if (started) { targetYaw = .55; targetPitch = .23; }
    lastSpec = spec; schedule();
  }
  document.addEventListener('ahern:build-change', event => update(event.detail));
  const resize = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    if (!width || !height) return;
    renderer.setSize(width, height, false); composer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix(); schedule();
  }); resize.observe(viewport);
  const visible = new IntersectionObserver(entries => { active = entries[0].isIntersecting; previousTime = 0; if (active) schedule(); }); visible.observe(viewport);
  document.addEventListener('visibilitychange', () => { previousTime = 0; schedule(); });
  function updateMotion() { motionButton.setAttribute('aria-pressed', String(animate())); motionButton.textContent = animate() ? 'Motion on' : 'Motion off'; schedule(); }
  motionButton.onclick = () => { motion = !animate(); updateMotion(); };
  reduceMotion.addEventListener('change', updateMotion); updateMotion();
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    renderer.domElement.setPointerCapture(e.pointerId);
  });
  renderer.domElement.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    targetYaw -= (e.clientX - drag.x) * .006; targetPitch = Math.max(-.08, Math.min(.72, targetPitch + (e.clientY - drag.y) * .004));
    drag.x = e.clientX; drag.y = e.clientY; schedule();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => renderer.domElement.addEventListener(type, () => { drag = null; }));
  document.getElementById('device-left').onclick = () => { targetYaw -= .4; schedule(); };
  document.getElementById('device-right').onclick = () => { targetYaw += .4; schedule(); };
  const explodeButton = document.getElementById('device-explode');
  function setExploded(value) {
    exploded = value; explodeButton.setAttribute('aria-pressed', String(value)); explodeButton.textContent = value ? 'Assemble view' : 'Explode view';
    pieces.forEach(p => { p.from = p.group.position.toArray(); p.start = performance.now(); p.spin = p.group.rotation.y; p.install = false; p.scaleFrom = p.group.scale.clone(); }); schedule();
  }
  explodeButton.onclick = () => setExploded(!exploded);
  document.getElementById('device-reset').onclick = () => { targetYaw = .42; targetPitch = .2; setExploded(false); };
  // Controls must exist before restoring a saved, already-complete build.
  if (window.AHERN_BUILD) update(window.AHERN_BUILD);
  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault(); lost = true; controls.hidden = true; fallback.hidden = false;
    fallback.textContent = 'The 3D preview is paused. Your choices and estimate still work; reload to restore the preview.';
  });
} catch (error) {
  fallback.hidden = false; controls.hidden = true;
  fallback.textContent = '3D preview is unavailable on this device. You can still configure every part and get your estimate.';
  console.warn('Build preview unavailable:', error.message);
}
