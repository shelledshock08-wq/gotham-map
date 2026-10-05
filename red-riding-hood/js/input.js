// Keyboard + mouse (pointer lock, or drag when not locked) + gamepad.
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, leftPressed: false };
    this.pad = null;
    this.el = el;
    this.sensitivity = 0.0022;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== el && e.button === 0 && !this.dragOnly) el.requestPointerLock?.();
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) this.mouse.right = true;
      this.drag = true;
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      this.drag = false;
    });
    addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === el || this.drag) {
        this.mouse.dx += e.movementX; this.mouse.dy += e.movementY;
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
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      now.attack = b(2); now.jump = b(0); now.roll = b(1); now.kick = b(3); now.reload = b(5);
      now.crouch = b(11); now.sprint = b(10); now.aim = (p.buttons[6]?.value || 0) > 0.4; now.fire = (p.buttons[7]?.value || 0) > 0.4;
      now.turnL = b(14); now.turnR = b(15);
      for (const k of ['attack', 'jump', 'roll', 'kick', 'reload', 'crouch', 'fire', 'turnL', 'turnR']) {
        if (now[k] && !prev[k]) this.pressed.add('pad:' + k);
      }
    }
    this._padPrev = now;
    this.padNow = now;
  }

  // movement vector in camera space: x = right, y = forward
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
    if (this.pad) {
      const rx = this.pad.axes[2] || 0, ry = this.pad.axes[3] || 0;
      if (Math.abs(rx) > 0.15) dx += rx * 0.05;
      if (Math.abs(ry) > 0.15) dy += ry * 0.035;
    }
    this.mouse.dx = this.mouse.dy = 0;
    return { dx, dy };
  }

  hit(...codes) { return codes.some((c) => this.pressed.has(c)); }
  held(...codes) { return codes.some((c) => this.keys.has(c)); }
  get sprint() { return this.held('ShiftLeft', 'ShiftRight') || !!this.padNow?.sprint; }
  get aim() { return this.mouse.right || this.held('KeyQ') || !!this.padNow?.aim; }

  endFrame() { this.pressed.clear(); this.mouse.leftPressed = false; }
}
