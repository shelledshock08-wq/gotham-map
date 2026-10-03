// Keyboard, gamepad and touch input merged into one state per frame.
'use strict';

const Input = {
  keys: new Set(),
  hits: new Set(),
  touch: { left: false, right: false, up: false, down: false, jump: false, start: false, laser: false, clones: false, grab: false },
  prev: { jump: false, start: false, up: false, down: false, left: false, right: false, punch: false, laser: false, clones: false, grab: false },
  state: null,

  init() {
    const block = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', (e) => {
      if (block.includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
      if (!e.repeat) this.hits.add(e.code);   // remember taps shorter than a frame
      Sound.init();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const pad = document.getElementById('touch');
    if (isTouch) pad.classList.add('on');
    this.isTouch = isTouch;
    const btns = [...pad.querySelectorAll('.tbtn')];
    const active = new Map();   // pointerId -> key
    const refresh = () => {
      for (const k in this.touch) this.touch[k] = false;
      for (const k of active.values()) this.touch[k] = true;
      for (const b of btns) b.classList.toggle('down', this.touch[b.dataset.k]);
    };
    const keyAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el && el.dataset && el.dataset.k ? el.dataset.k : null;
    };
    for (const b of btns) {
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault(); Sound.init();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        active.set(e.pointerId, b.dataset.k); refresh();
      });
      b.addEventListener('pointermove', (e) => {
        if (!active.has(e.pointerId)) return;
        const k = keyAt(e.clientX, e.clientY);
        // slide between d-pad buttons, but never slide onto/off the jump button
        const dpad = ['left', 'right', 'up', 'down'];
        if (k && dpad.includes(k) && dpad.includes(active.get(e.pointerId))) { active.set(e.pointerId, k); refresh(); }
      });
      const end = (e) => { active.delete(e.pointerId); refresh(); };
      b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
    }
    // tapping the canvas starts the game / advances menus
    document.getElementById('screen').addEventListener('pointerdown', () => { Sound.init(); this.tapped = true; });
  },

  poll() {
    const k = this.keys;
    let left = k.has('ArrowLeft') || k.has('KeyA');
    let right = k.has('ArrowRight') || k.has('KeyD');
    let up = k.has('ArrowUp') || k.has('KeyW');
    let down = k.has('ArrowDown') || k.has('KeyS');
    let jump = k.has('Space') || k.has('KeyZ') || k.has('KeyX') || k.has('KeyC') || k.has('KeyJ') || k.has('KeyK');
    let start = k.has('Enter') || k.has('Escape') || k.has('KeyP');
    // separate action buttons used by the Super Sonic battle
    let punch = k.has('Space') || k.has('KeyZ') || k.has('KeyJ');
    let laser = k.has('KeyX') || k.has('KeyK');
    let clones = k.has('KeyC') || k.has('KeyL');
    let grab = k.has('KeyV') || k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyI');
    const t = this.touch;
    punch = punch || t.jump; laser = laser || t.laser; clones = clones || t.clones; grab = grab || t.grab;
    jump = jump || t.laser || t.clones || t.grab;
    left = left || t.left; right = right || t.right; up = up || t.up; down = down || t.down;
    jump = jump || t.jump; start = start || t.start;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      left = left || ax < -0.4 || b(14);
      right = right || ax > 0.4 || b(15);
      up = up || ay < -0.5 || b(12);
      down = down || ay > 0.5 || b(13);
      jump = jump || b(0) || b(1) || b(2) || b(3);
      start = start || b(9);
      punch = punch || b(0); grab = grab || b(1); laser = laser || b(2); clones = clones || b(3);
    }
    const tapped = !!this.tapped; this.tapped = false;
    const hit = (...codes) => codes.some((c) => this.hits.has(c));
    const tapJump = hit('Space', 'KeyZ', 'KeyX', 'KeyC', 'KeyJ', 'KeyK');
    const tapPunch = hit('Space', 'KeyZ', 'KeyJ'), tapLaser = hit('KeyX', 'KeyK');
    const tapClones = hit('KeyC', 'KeyL'), tapGrab = hit('KeyV', 'ShiftLeft', 'ShiftRight', 'KeyI');
    const tapStart = hit('Enter', 'Escape', 'KeyP');
    this.hits.clear();
    const s = {
      left, right, up, down, jump, start,
      jumpPressed: (jump && !this.prev.jump) || tapJump,
      startPressed: (start && !this.prev.start) || tapStart,
      upPressed: up && !this.prev.up,
      downPressed: down && !this.prev.down,
      leftPressed: left && !this.prev.left,
      rightPressed: right && !this.prev.right,
      tapped,
      mutePressed: k.has('KeyM') && !this.prev.mute,
      punch, laser, clones, grab,
      punchPressed: (punch && !this.prev.punch) || tapPunch,
      laserPressed: (laser && !this.prev.laser) || tapLaser,
      clonesPressed: (clones && !this.prev.clones) || tapClones,
      grabPressed: (grab && !this.prev.grab) || tapGrab,
    };
    this.prev = { jump, start, up, down, left, right, mute: k.has('KeyM'), punch, laser, clones, grab };
    this.state = s;
    return s;
  },
};
