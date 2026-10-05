// Red Riding Hood — combat test (Metal Gear Rising style).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { buildArena, groundAt } from './arena.js';
import { Player } from './player.js';
import { Enemies } from './enemies.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { FX } from './fx.js';
import { Pieces } from './slicer.js';
import { initAudio } from './sfx.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const quality = q.get('q') || 'high';
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'low' ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.22;
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.05, 300);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.88));
composer.addPass(new OutputPass());
if (quality !== 'low') composer.addPass(new SMAAPass());

const input = new Input(renderer.domElement);
input.dragOnly = q.has('drag');
const arena = buildArena(scene, renderer);
const fx = new FX(scene);
const pieces = new Pieces(scene, fx);
const cam = new CameraRig(camera);

// time: Jason and the world run on separate clocks so Blade Mode and parry
// slow-motion slow the world, and hit-stop freezes both for a few frames
const time = {
  slowT: 0, slowScale: 1, stop: 0, blade: false,
  slow(scale, dur) { this.slowScale = Math.min(this.slowT > 0 ? this.slowScale : 1, scale); this.slowT = Math.max(this.slowT, dur); },
  hitstop(d) { this.stop = Math.max(this.stop, d); },
  step(dt) {
    if (this.stop > 0) { this.stop -= dt; return { p: dt * 0.04, w: dt * 0.04 }; }
    let w = 1;
    if (this.slowT > 0) { this.slowT -= dt; w = this.slowScale; if (this.slowT <= 0) this.slowScale = 1; }
    if (this.blade) return { p: dt, w: dt * 0.06 };
    return { p: dt * Math.max(w, 0.45), w: dt * w };
  },
};

// ---------------------------------------------------------------- HUD
const hudApi = {
  msg(text, cls = 'white') {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    $('pops').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  },
  banner(text) { $('banner').textContent = text; $('banner').classList.remove('show'); void $('banner').offsetWidth; $('banner').classList.add('show'); },
  damage() { $('dmg').classList.remove('show'); void $('dmg').offsetWidth; $('dmg').classList.add('show'); },
  dead(on) { $('deadscreen').classList.toggle('hidden', !on); },
  blade(on) { $('bladeui').classList.toggle('hidden', !on); },
  cutAngle(a) {
    // the line goes through the cut plane's anchor in front of Jason
    proj.copy(player.bladeAnchor()).project(camera);
    const x = (proj.x * 0.5 + 0.5) * innerWidth, y = (-proj.y * 0.5 + 0.5) * innerHeight;
    $('cutline').style.left = `${x}px`; $('cutline').style.top = `${y}px`;
    $('cutline').style.transform = `translate(-50%,-50%) rotate(${-a}rad)`;
    this.anchor = [x, y];
  },
  slash(a) {
    const el = document.createElement('div');
    el.className = 'slashfx';
    if (this.anchor) { el.style.left = `${this.anchor[0]}px`; el.style.top = `${this.anchor[1]}px`; }
    el.style.transform = `translate(-50%,-50%) rotate(${-a}rad)`;
    $('bladeui').appendChild(el);
    setTimeout(() => el.remove(), 260);
  },
};

const ctx = { input, cam, arena, fx, pieces, scene, time, hud: hudApi };
const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => {
  // the single-file build (red-riding-hood.html) carries the models inline
  const b64 = window.EMBEDDED_ASSETS?.[url];
  if (b64) {
    const bin = atob(b64), buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    loader.parse(buf.buffer, '', res, rej);
    return;
  }
  loader.load(url, res, (e) => { if (e.total) $('progress').style.width = `${Math.round((e.loaded / e.total) * 100)}%`; }, rej);
});

let player, enemies, running = false;
Promise.all([load('assets/models/jason.glb'), load('assets/models/dummy.glb')]).then(([jg, eg]) => {
  ctx.enemies = enemies = new Enemies(eg, ctx);
  ctx.player = player = new Player(jg, scene, ctx);
  cam.yaw = player.yaw;
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  window.__game = { player, enemies, cam, input, scene, renderer, pieces, time };
  window.__ready = true;
  if (q.has('autostart')) start();
}).catch((e) => { $('loading').textContent = 'Could not load the models: ' + e.message; console.error(e); });

function start() {
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('help').classList.remove('hidden');
  initAudio();
  running = true;
}
$('play').onclick = () => { start(); if (!input.dragOnly) renderer.domElement.requestPointerLock?.(); };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyH' || e.code === 'Tab') $('help').classList.toggle('hidden');
  if (player?.dead && (e.code === 'Enter' || e.code === 'Space')) player.respawn();
});
$('deadscreen').onclick = () => player?.respawn();

const gnd = (x, z, y) => groundAt(arena.colliders, x, z, y);

function simulate(dt) {
  if (!running) {
    cam.yaw += dt * 0.15;
    cam.update(dt, { dx: 0, dy: 0 }, player, arena.colliders);
    player.mixer.update(dt);
    arena.update(dt);
    return;
  }
  input.poll();
  const t = time.step(dt);
  player.update(t.p);
  enemies.update(t.w);
  pieces.update(t.w, gnd);
  cam.update(t.p, input.look(), player, arena.colliders);
  arena.update(t.w);
  fx.update(t.w);
  hud();
  input.endFrame();
}

const timer = new THREE.Timer();
timer.connect?.(document);
let manual = false;
function frame(ts) {
  requestAnimationFrame(frame);
  timer.update(ts);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  if (!player || manual) return;
  simulate(dt);
  composer.render();
}
requestAnimationFrame(frame);

// deterministic stepping for automated play-tests: __step(seconds)
window.__step = (sec) => {
  manual = true;
  const n = Math.max(1, Math.round(sec * 60));
  for (let i = 0; i < n; i++) simulate(1 / 60);
  composer.render();
};

const proj = new THREE.Vector3();
function hud() {
  const p = player;
  $('hpfill').style.width = `${Math.max(0, p.hp)}%`;
  $('focusfill').style.width = `${Math.max(0, p.focus)}%`;
  $('crosshair').classList.toggle('hidden', !p.aiming);
  $('ammo').classList.toggle('hidden', !p.aiming);
  $('ammo').textContent = `${p.ammo} / 12`;
  $('combo').classList.toggle('hidden', p.combo < 2);
  $('combonum').textContent = p.combo;
  $('bp').textContent = `${p.bp} BP`;
  $('wave').textContent = enemies.wave ? `WAVE ${enemies.wave}` : '';
  const st = p.state === 'attack' ? p.move?.id : p.state;
  $('state').textContent = `${st}${p.crouch ? ' · crouched' : ''}`;
  // lock-on reticle + enemy health
  const t = p.lockT && p.lockT.alive ? p.lockT : null;
  $('lock').classList.toggle('hidden', !t);
  if (t) {
    proj.copy(t.chest()).project(camera);
    $('lock').style.left = `${(proj.x * 0.5 + 0.5) * innerWidth}px`;
    $('lock').style.top = `${(-proj.y * 0.5 + 0.5) * innerHeight}px`;
    $('lockhp').style.width = `${(t.hp / t.maxHp) * 100}%`;
  }
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
