// Red Riding Hood — Milestone 1: playable movement & combat test.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { buildArena, collide } from './arena.js';
import { Player } from './player.js';
import { Dummies } from './dummies.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { Effects } from './weapons.js';
import { initAudio } from './sfx.js';

const q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
const quality = q.get('q') || localStorage.getItem('rrh.quality') || 'high';
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
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 300);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());
if (quality !== 'low') composer.addPass(new SMAAPass());

const input = new Input(renderer.domElement);
input.dragOnly = q.has('drag');
const arena = buildArena(scene, renderer);
const effects = new Effects(scene);
const cam = new CameraRig(camera);

const loader = new GLTFLoader();
const load = (url) => new Promise((res, rej) => loader.load(url, res, (e) => {
  if (e.total) $('progress').style.width = `${Math.round((e.loaded / e.total) * 100)}%`;
}, rej));

let player, dummies, hitstop = 0;
const ctx = { input, cam, arena, effects, hitstop: (t) => { hitstop = Math.max(hitstop, t); } };

Promise.all([load('assets/models/jason.glb'), load('assets/models/dummy.glb')]).then(([jg, dg]) => {
  dummies = new Dummies(dg, scene, arena.dummySpawns);
  ctx.dummies = dummies;
  player = new Player(jg, scene, ctx);
  cam.yaw = player.yaw;
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  window.__game = { player, dummies, cam, input, scene, renderer };
  window.__ready = true;
  if (q.has('autostart')) start();
}).catch((e) => {
  $('loading').textContent = 'Could not load the models: ' + e.message;
  console.error(e);
});

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
  if (e.code === 'Escape' && document.pointerLockElement) document.exitPointerLock();
});

let running = false;
const timer = new THREE.Timer();
timer.connect?.(document);

function simulate(dt) {
  if (running) {
    input.poll();
    if (hitstop > 0) { hitstop -= dt; dt *= 0.08; }
    player.update(dt);
    dummies.update(dt, player, arena.colliders, collide);
    cam.update(dt, input.look(), player, arena.colliders, player.aiming);
    hud();
    input.endFrame();
  } else {
    // title screen: slow orbit around Jason
    cam.yaw += dt * 0.15;
    cam.update(dt, { dx: 0, dy: 0 }, player, arena.colliders, false);
    player.mixer.update(dt);
    dummies.update(dt, player, arena.colliders, collide);
  }
  arena.update(dt);
  effects.update(dt);
}

let manual = false; // tests step the simulation themselves
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

function hud() {
  const p = player;
  $('crosshair').classList.toggle('hidden', !p.aiming);
  $('ammo').classList.toggle('hidden', !p.aiming);
  $('ammo').textContent = `${p.ammo} / 12`;
  const st = p.state === 'action' ? (p.act?.name || '') : (p.aiming ? 'aiming' : (p.baseName || ''));
  $('state').textContent = `${st}${p.crouch ? ' · crouched' : ''}${p.walkMode ? ' · walk mode' : ''}`;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
