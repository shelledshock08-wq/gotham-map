// Keyboard + mouse (pointer lock, or drag when not locked) + gamepad.
// Mouse buttons arrive as edge events 'Mouse0' (left), 'Mouse1' (middle),
// 'Mouse2' (right); gamepad buttons as 'pad:<action>'.
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouse = { dx: 0, dy: 0, left: false, right: false };
    this.swipe = { x: 0, y: 0 }; // recent mouse motion, for Blade Mode cuts
    this.pad = null;
    this.el = el;
    this.sensitivity = 0.0022;
    addEventListener('keydown', (e) => {
      if (['Space', 'Tab', 'AltLeft', 'AltRight'].includes(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== el && !this.dragOnly) el.requestPointerLock?.();
      this.pressed.add('Mouse' + e.button);
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (e.button === 1) e.preventDefault();
      this.drag = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      this.drag = false;
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el || this.drag || this.dragOnly) {
        this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
        this.swipe.x = this.swipe.x * 0.5 + e.movementX;
        this.swipe.y = this.swipe.y * 0.5 + e.movementY;
      }
    });
  }

  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.pad = [...pads].find((p) => p && p.connected) || null;
    const p = this.pad;
    const prev = this._padPrev || {};
    const now = {};
    if (p) {
      // Metal Gear Rising layout: X light, Y heavy, A jump, B dodge,
      // RB Ninja Run, LB Blade Mode, LT aim, RT fire, L3 crouch, R3 lock-on
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      now.attack = b(2); now.heavy = b(3); now.jump = b(0); now.roll = b(1);
      now.blade = b(4); now.sprint = b(5); now.crouch = b(10); now.lock = b(11); now.reload = b(12);
      now.aim = (p.buttons[6]?.value || 0) > 0.4; now.fire = (p.buttons[7]?.value || 0) > 0.4;
      for (const k of ['attack', 'heavy', 'jump', 'roll', 'crouch', 'lock', 'reload', 'fire']) {
        if (now[k] && !prev[k]) this.pressed.add('pad:' + k);
      }
      const rx = p.axes[2] || 0, ry = p.axes[3] || 0;
      if (now.blade && Math.hypot(rx, ry) > 0.4) { this.swipe.x = rx * 20; this.swipe.y = ry * 20; }
    }
    this._padPrev = now;
    this.padNow = now;
  }

  move() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.pad) {
      const ax = this.pad.axes[0] || 0, ay = this.pad.axes[1] || 0;
      if (Math.hypot(ax, ay) > 0.18) { x += ax; y -= ay; }
    }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  look() {
    let dx = this.mouse.dx * this.sensitivity, dy = this.mouse.dy * this.sensitivity;
    if (this.pad && !this.padNow?.blade) {
      const rx = this.pad.axes[2] || 0, ry = this.pad.axes[3] || 0;
      if (Math.abs(rx) > 0.15) dx += rx * 0.05;
      if (Math.abs(ry) > 0.15) dy += ry * 0.035;
    }
    this.mouse.dx = this.mouse.dy = 0;
    return { dx, dy };
  }

  get bladeSwipe() { return this.swipe; }
  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  held(...codes) { return codes.some((c) => this.keys.has(c)); }
  get sprint() { return this.held('ShiftLeft', 'ShiftRight') || !!this.padNow?.sprint; }
  get aim() { return this.held('KeyQ') || !!this.padNow?.aim; }

  endFrame() {
    this.pressed.clear();
    this.swipe.x *= 0.6; this.swipe.y *= 0.6;
  }
}
