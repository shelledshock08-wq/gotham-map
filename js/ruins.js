// Emerald Ruins: Diamond Rush (Gameloft, 2006) with Sonic. A side-view grid
// adventure: Sonic walks in four directions through jungle-temple tunnels,
// cuts through vines, and gravity works on the boulders. They fall, roll off
// round things and crush whatever is underneath. Push boulders sideways,
// collect purple diamonds to open the padlocked gate, find keys for locked
// doors, dodge snakes and spike traps, and touch checkpoints (a death resets
// everything to how it was at the last one). Three Chaos Emeralds are hidden here.
'use strict';

const RU_T = 64;              // tile size in pixels
const RU_NEED = 16;           // purple diamonds needed to open the gate
const RU_STEP = 7;            // frames for Sonic to cross one tile
const RU_FALL = 6;            // frames for a boulder to fall one tile
const RU_ROLL = 8;            // frames for a boulder to roll / be pushed one tile

// # wall   . floor   : vines (cut by walking through)   O boulder   * diamond
// k key    D locked door   X diamond gate   C checkpoint   ^ spike trap
// E Chaos Emerald   s snake   P portal   @ start
const RUINS_MAP = [
  '##########################',
  '#@...::::*:::::::::::*:..#',
  '#....::::O::::::::::O::..#',
  '#.*..::::::::*::::::::::.#',
  '#....::*::::::::::::::*:.#',
  '#C.......:::::::::::::...#',
  '##################.#######',
  '##################.#######',
  '####.###k###.###.#.#######',
  '#.....*...s.*.....*......#',
  '####D#####################',
  '#...:..^^^^^^^^^^..*.....#',
  '#.#####################..#',
  '#E....^.^.^.^.^.^.*....*.#',
  '######################.###',
  '#...................*C:..#',
  '#.####################:..#',
  '#.#*.*.*.*O.........:#:..#',
  '#.#:::::::::::::::::.#:..#',
  '#.#:::::::::::::::::.#...#',
  '#.#:::::::::::::::::.##.##',
  '#...................E#...#',
  '######################.###',
  '#....O......:...s...:....#',
  '#....:......:.......:....#',
  '#.OOO:.....OOO......:OO..#',
  '#.:::......:::......:::..#',
  '#*:::*....*:::*....*:::*.#',
  '##.####################.##',
  '#C.......................#',
  '#.###.###############.####',
  '#.#k#.#....*...*....#.#E.#',
  '#.#.#.#..O.....O....#.##.#',
  '#.#.#...:::::::::...#...D#',
  '#...########.########....#',
  '############X#############',
  '#......*....P....*.......#',
  '##########################',
];

// --------------------------------------------------------------- drawing
function ruTile(ctx, ch, x, y, t, ru) {
  const T = RU_T;
  switch (ch) {
    case '#': {
      ctx.fillStyle = '#4e4636'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#5f5642'; ctx.fillRect(x + 3, y + 3, T / 2 - 4, T / 2 - 4); ctx.fillRect(x + T / 2 + 1, y + T / 2 + 1, T / 2 - 4, T / 2 - 4);
      ctx.fillStyle = '#6e6550'; ctx.fillRect(x + T / 2 + 1, y + 3, T / 2 - 4, T / 2 - 4); ctx.fillRect(x + 3, y + T / 2 + 1, T / 2 - 4, T / 2 - 4);
      ctx.fillStyle = 'rgba(70,110,40,.55)'; if (((x * 7 + y * 13) / T) % 5 < 1) ctx.fillRect(x, y, T, 8);
      break;
    }
    case ':': {
      ctx.fillStyle = '#244a17'; ctx.fillRect(x, y, T, T);
      for (let i = 0; i < 7; i++) {
        const lx = x + ((i * 23 + x / 3) % (T - 12)) + 6, ly = y + ((i * 17 + y / 5) % (T - 12)) + 6;
        ctx.fillStyle = i % 2 ? '#3f7d24' : '#2f6420';
        ctx.beginPath(); ctx.ellipse(lx, ly, 10, 6, (i * 0.9) % 3, 0, Math.PI * 2); ctx.fill();
      }
      break;
    }
    case 'D': {
      ctx.fillStyle = '#6b4320'; ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
      ctx.fillStyle = '#4e2f14'; for (let i = 1; i < 4; i++) ctx.fillRect(x + 4 + i * 14, y + 2, 2, T - 4);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + T / 2 - 8, y + T / 2 - 6, 16, 14);
      ctx.fillStyle = '#3a2a08'; ctx.fillRect(x + T / 2 - 2, y + T / 2 - 1, 4, 7);
      break;
    }
    case 'X': {
      ctx.fillStyle = '#5c5246'; ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#8a7f6a'; ctx.fillRect(x + 6, y + 6, T - 12, T - 12);
      ctx.fillStyle = '#b07cff'; ctx.beginPath(); ctx.moveTo(x + T / 2, y + 12); ctx.lineTo(x + T / 2 + 12, y + 24); ctx.lineTo(x + T / 2, y + 40); ctx.lineTo(x + T / 2 - 12, y + 24); ctx.fill();
      ctx.font = `12px ${FONT}`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
      ctx.fillText(String(Math.max(0, RU_NEED - ru.diamonds)), x + T / 2, y + T - 10);
      break;
    }
    case 'C': {
      ctx.fillStyle = '#5a5244'; ctx.fillRect(x + 14, y + 34, T - 28, T - 34);
      const on = ru.checkpoint && ru.checkpoint.x === x / T && ru.checkpoint.y === y / T;
      const g = ctx.createRadialGradient(x + T / 2, y + 24, 2, x + T / 2, y + 24, 22);
      g.addColorStop(0, on ? '#e8fbff' : '#9aa4b0'); g.addColorStop(1, on ? 'rgba(60,180,255,0)' : 'rgba(80,90,110,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x + T / 2, y + 24, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = on ? '#4fd0ff' : '#6b7480'; ctx.beginPath(); ctx.arc(x + T / 2, y + 24, 9, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case '^': {
      ctx.fillStyle = '#3a342a'; ctx.fillRect(x + 2, y + T - 12, T - 4, 10);
      const k = ru.spikeLevel(x / T, y / T);
      if (k > 0) {
        ctx.fillStyle = '#c9d0da';
        for (let i = 0; i < 4; i++) {
          const sx = x + 6 + i * 14;
          ctx.beginPath(); ctx.moveTo(sx, y + T - 10); ctx.lineTo(sx + 7, y + T - 10 - 44 * k); ctx.lineTo(sx + 14, y + T - 10); ctx.fill();
        }
      } else {
        ctx.fillStyle = '#1a1712'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 9 + i * 14, y + T - 9, 6, 3);
        if (ru.spikeWarn(x / T, y / T)) { ctx.fillStyle = '#c9d0da'; for (let i = 0; i < 4; i++) ctx.fillRect(x + 10 + i * 14, y + T - 14, 4, 5); }
      }
      break;
    }
    case 'P': {
      const cx = x + T / 2, cy = y + T / 2;
      for (let i = 4; i >= 0; i--) {
        ctx.strokeStyle = `hsla(${(t * 3 + i * 40) % 360},90%,${55 + i * 6}%,.9)`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.ellipse(cx, cy, 8 + i * 6, 12 + i * 8, t * 0.05 + i, 0, Math.PI * 2); ctx.stroke();
      }
      break;
    }
  }
}

function ruBoulder(ctx, x, y, rot) {
  const r = RU_T / 2 - 4;
  ctx.save(); ctx.translate(x + RU_T / 2, y + RU_T / 2); ctx.rotate(rot);
  const g = ctx.createRadialGradient(-8, -10, 4, 0, 0, r);
  g.addColorStop(0, '#f1dfb4'); g.addColorStop(0.6, '#c9ad78'); g.addColorStop(1, '#7d6740');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(80,60,30,.6)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(0, 2); ctx.lineTo(8, -8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-4, 12); ctx.lineTo(6, 8); ctx.stroke();
  ctx.restore();
}

function ruDiamond(ctx, x, y, t) {
  const cx = x + RU_T / 2, cy = y + RU_T / 2 + Math.sin(t * 0.08 + x) * 2;
  ctx.fillStyle = '#7a2bd6';
  ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 15, cy - 4); ctx.lineTo(cx, cy + 18); ctx.lineTo(cx - 15, cy - 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c38bff'; ctx.beginPath(); ctx.moveTo(cx, cy - 18); ctx.lineTo(cx + 15, cy - 4); ctx.lineTo(cx, cy - 1); ctx.lineTo(cx - 15, cy - 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff'; if ((t + x) % 70 < 10) ctx.fillRect(cx - 7, cy - 10, 3, 3);
}

function ruKey(ctx, x, y, t) {
  const cx = x + RU_T / 2, cy = y + RU_T / 2 + Math.sin(t * 0.07) * 3;
  ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx - 10, cy, 9, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(cx - 2, cy - 3, 22, 6); ctx.fillRect(cx + 12, cy + 2, 4, 8); ctx.fillRect(cx + 4, cy + 2, 4, 6);
}

function ruSnake(ctx, x, y, dir, t) {
  ctx.save(); ctx.translate(x + RU_T / 2, y + RU_T - 14); ctx.scale(dir, 1);
  ctx.fillStyle = '#3f9a2e';
  for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(-20 + i * 8, Math.sin(t * 0.3 + i) * 4, 7, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#4fbf3a'; ctx.beginPath(); ctx.ellipse(18, -4, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffeb3b'; ctx.fillRect(20, -8, 4, 4);
  if (t % 30 < 12) { ctx.strokeStyle = '#e03030'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(28, -2); ctx.lineTo(36, -2); ctx.lineTo(40, -6); ctx.moveTo(36, -2); ctx.lineTo(40, 2); ctx.stroke(); }
  ctx.restore();
}

// --------------------------------------------------------------- the act
class Ruins {
  constructor(game) {
    this.g = game;
    this.t = 0; this.phase = 'intro';
    this.load();
    this.save();                       // the start counts as the first checkpoint
    this.cam = { x: 0, y: 0 };
    this.retryT = 0; this.msg = null;
    this.centerCam(true);
  }

  load() {
    this.grid = RUINS_MAP.map((r) => r.split(''));
    this.H = this.grid.length; this.W = this.grid[0].length;
    this.boulders = []; this.items = new Map(); this.snakes = [];
    this.diamonds = 0; this.keys = 0; this.emeralds = 0;
    for (let y = 0; y < this.H; y++) for (let x = 0; x < this.W; x++) {
      const c = this.grid[y][x];
      if (c === '@') { this.sx = x; this.sy = y; this.grid[y][x] = '.'; }
      else if (c === 'O') { this.boulders.push({ x, y, ox: 0, oy: 0, mv: null, falling: false, rot: 0 }); this.grid[y][x] = '.'; }
      else if (c === '*' || c === 'k' || c === 'E') { this.items.set(x + ',' + y, c); this.grid[y][x] = '.'; }
      else if (c === 's') { this.snakes.push({ x, y, dir: -1, step: 0, ox: 0, alive: true }); this.grid[y][x] = '.'; }
    }
    this.sonic = { x: this.sx, y: this.sy, mv: null, facing: 1, pushT: 0, anim: 0, dead: 0 };
    this.checkpoint = { x: this.sx, y: this.sy };
  }

  // checkpoints snapshot the whole room state
  save() {
    this.snap = JSON.stringify({
      grid: this.grid, boulders: this.boulders.map((b) => ({ x: b.x, y: b.y })), items: [...this.items],
      snakes: this.snakes.filter((s) => s.alive).map((s) => ({ x: s.x, y: s.y, dir: s.dir })),
      diamonds: this.diamonds, keys: this.keys, emeralds: this.emeralds, cp: this.checkpoint,
    });
  }
  restore() {
    const S = JSON.parse(this.snap);
    this.grid = S.grid; this.items = new Map(S.items);
    this.boulders = S.boulders.map((b) => ({ ...b, ox: 0, oy: 0, mv: null, falling: false, rot: 0 }));
    this.snakes = S.snakes.map((s) => ({ ...s, step: 0, ox: 0, alive: true }));
    this.diamonds = S.diamonds; this.keys = S.keys; this.emeralds = S.emeralds; this.checkpoint = S.cp;
    this.sonic = { x: S.cp.x, y: S.cp.y, mv: null, facing: 1, pushT: 0, anim: 0, dead: 0 };
    this.g.emeraldCount = 4 + this.emeralds;
  }

  // ------------------------------------------------------------ queries
  cell(x, y) { return y < 0 || y >= this.H || x < 0 || x >= this.W ? '#' : this.grid[y][x]; }
  boulderAt(x, y) { return this.boulders.find((b) => b.x === x && b.y === y); }
  snakeAt(x, y) { return this.snakes.find((s) => s.alive && s.x === x && s.y === y); }
  sonicIn(x, y) {
    const S = this.sonic;
    if (S.dead) return false;
    return (S.x === x && S.y === y) || (S.mv && S.mv.tx === x && S.mv.ty === y);
  }
  // can a boulder move into this cell?
  freeForBoulder(x, y) {
    const c = this.cell(x, y);
    return (c === '.' || c === '^') && !this.boulderAt(x, y) && !this.items.has(x + ',' + y);
  }
  isRound(x, y) { return !!this.boulderAt(x, y) || this.items.get(x + ',' + y) === '*'; }
  spikePhase(x, y) { return (this.t + y * 53) % 150; }
  spikeLevel(x, y) { const p = this.spikePhase(x, y); return p < 60 ? Math.min(1, p / 4, (60 - p) / 4) : 0; }
  spikeUp(x, y) { return this.cell(x, y) === '^' && this.spikePhase(x, y) < 60; }
  spikeWarn(x, y) { return this.spikePhase(x, y) > 130; }

  say(text, cool = 200) { this.g.speech.say('sonic', text, { dur: 170, prio: 3, cool, coolKey: text }); }

  // ------------------------------------------------------------ update
  update(inp) {
    const g = this.g;
    this.t++;
    if (this.flash > 0) this.flash -= 0.04;
    if (this.phase === 'intro') {
      if (this.t === 1) { Sound.playMusic('ruins'); Sound.play('boom', { rate: 1.6, vol: 0.5 }); this.flash = 1; }
      if (this.t === 70) g.speech.say('sonic', 'Whoa! The emeralds pulled me... where IS this place?', { dur: 200, prio: 4 });
      if (this.t === 200) g.speech.say('sonic', `Three more emeralds, and I need ${RU_NEED} of those purple diamonds for the gate.`, { dur: 220, prio: 4 });
      if (this.t > 150 || inp.startPressed) { this.phase = 'play'; }
      this.updateWorld();
      this.centerCam(); return;
    }
    if (this.phase === 'warp') {
      if (this.t === 1) { Sound.play('release', { rate: 0.5 }); g.speech.say('sonic', 'Seven! Time to go home!', { dur: 120, prio: 5 }); }
      if (this.t > 120) g.startSpecial();
      return;
    }
    if (!g.timeStopped) g.time++;
    this.updateWorld();
    const S = this.sonic;
    if (S.dead) {
      S.dead++;
      if (S.dead === 90) {
        g.lives--;
        if (g.lives <= 0) { g.gameOver('ruins'); return; }
        this.restore(); Sound.play('select');
      }
      this.centerCam(); return;
    }
    // hold jump to give up and go back to the checkpoint (like Diamond Rush's * key)
    if (inp.punch || inp.jump) { if (++this.retryT === 70) { this.kill('retry'); } } else this.retryT = 0;
    this.moveSonic(inp);
    this.centerCam();
  }

  kill(why) {
    const S = this.sonic;
    if (S.dead) return;
    S.dead = 1; S.why = why;
    Sound.play(why === 'crush' ? 'boom' : 'death', { rate: why === 'crush' ? 0.7 : 1 });
    this.shake = why === 'crush' ? 14 : 6;
    this.msg = { text: why === 'crush' ? 'CRUSHED!' : why === 'snake' ? 'SNAKEBITE!' : why === 'spike' ? 'SPIKED!' : 'RETRY', t: 0 };
  }

  moveSonic(inp) {
    const S = this.sonic;
    if (S.mv) {
      S.mv.t++;
      if (S.mv.t >= S.mv.dur) { S.x = S.mv.tx; S.y = S.mv.ty; S.mv = null; this.arrive(); }
      else return;
    }
    // standing on raised spikes
    if (this.spikeUp(S.x, S.y)) { this.kill('spike'); return; }
    let dx = 0, dy = 0;
    if (inp.left) dx = -1; else if (inp.right) dx = 1; else if (inp.up) dy = -1; else if (inp.down) dy = 1;
    if (!dx && !dy) { S.pushT = 0; return; }
    if (dx) S.facing = dx;
    const tx = S.x + dx, ty = S.y + dy, c = this.cell(tx, ty);
    if (c === '#') { S.pushT = 0; return; }
    if (c === 'D') {
      if (this.keys > 0) { this.keys--; this.grid[ty][tx] = '.'; Sound.play('monitor'); }
      else { this.say("It's locked. There's a key somewhere..."); return; }
    }
    if (c === 'X') {
      if (this.diamonds >= RU_NEED) { this.grid[ty][tx] = '.'; Sound.play('checkpoint'); this.flash = 0.5; }
      else { this.say(`The gate needs ${RU_NEED} diamonds. I've got ${this.diamonds}.`); return; }
    }
    const b = this.boulderAt(tx, ty);
    if (b) {
      // push sideways if the far side is free and nothing is moving it
      if (!dy && !b.mv && !b.falling && this.freeForBoulder(tx + dx, ty) && !this.snakeAt(tx + dx, ty)) {
        if (++S.pushT >= 8) {
          S.pushT = 0;
          b.mv = { dx, dy: 0, t: 0, dur: RU_ROLL }; b.x += dx; b.ox = -dx;
          Sound.play('roll', { vol: 0.5, rate: 0.7 });
          S.mv = { tx, ty, t: 0, dur: RU_ROLL };
        }
      }
      return;
    }
    S.pushT = 0;
    if (this.snakeAt(tx, ty)) { this.kill('snake'); return; }
    S.mv = { tx, ty, t: 0, dur: c === ':' ? RU_STEP + 3 : RU_STEP };
    if (c === ':') { Sound.play('skid', { vol: 0.25, rate: 1.6 }); }
  }

  arrive() {
    const S = this.sonic, x = S.x, y = S.y, c = this.cell(x, y), key = x + ',' + y, g = this.g;
    if (c === ':') this.grid[y][x] = '.';
    const it = this.items.get(key);
    if (it) {
      this.items.delete(key);
      if (it === '*') {
        this.diamonds++; g.addScore(100); Sound.ring();
        if (this.diamonds === RU_NEED) this.say('That\'s enough diamonds for the gate!', 9999);
      } else if (it === 'k') { this.keys++; Sound.play('monitor'); this.say('A key!'); }
      else if (it === 'E') {
        this.emeralds++; g.emeraldCount = 4 + this.emeralds; g.addScore(5000); Sound.play('oneup'); this.flash = 0.6;
        g.speech.say('sonic', this.emeralds < 3 ? `A Chaos Emerald! ${3 - this.emeralds} to go.` : 'That makes seven!', { dur: 160, prio: 4 });
      }
    }
    if (c === 'C' && !(this.checkpoint.x === x && this.checkpoint.y === y)) {
      this.checkpoint = { x, y }; this.save(); Sound.play('checkpoint');
      this.msg = { text: 'CHECKPOINT', t: 0 };
    }
    if (c === 'P') {
      if (this.emeralds >= 3) { this.phase = 'warp'; this.t = 0; }
      else this.say('The portal won\'t open... I\'m missing an emerald.');
    }
    if (this.spikeUp(x, y)) this.kill('spike');
  }

  // boulders and snakes
  updateWorld() {
    if (this.shake > 0) this.shake *= 0.85;
    const S = this.sonic;
    // boulders: sort bottom-up so stacks settle cleanly
    this.boulders.sort((a, b) => b.y - a.y);
    for (const b of this.boulders) {
      if (b.mv) {
        b.mv.t++;
        const k = b.mv.t / b.mv.dur;
        b.ox = -b.mv.dx * (1 - k); b.oy = -b.mv.dy * (1 - k);
        if (b.mv.dx) b.rot += b.mv.dx * 0.2;
        if (b.mv.t >= b.mv.dur) { b.mv = null; b.ox = 0; b.oy = 0; }
        continue;
      }
      const bx = b.x, by = b.y;
      // fall
      const belowFree = this.freeForBoulder(bx, by + 1);
      const snake = this.snakeAt(bx, by + 1);
      if (belowFree && (!this.sonicIn(bx, by + 1) || b.falling)) {
        if (this.sonicIn(bx, by + 1) && b.falling) this.kill('crush');
        if (snake && b.falling) { snake.alive = false; Sound.play('pop'); this.g.addScore(200); }
        if (snake && !b.falling) continue;
        b.y++; b.falling = true; b.mv = { dx: 0, dy: 1, t: 0, dur: RU_FALL }; b.oy = -1;
        continue;
      }
      if (b.falling && (this.cell(bx, by + 1) !== '.' || !belowFree)) { Sound.play('boom', { vol: 0.25, rate: 1.4 }); this.shake = Math.max(this.shake || 0, 3); }
      // roll off round things (boulders, diamonds)
      if (this.isRound(bx, by + 1)) {
        for (const d of [-1, 1]) {
          if (this.freeForBoulder(bx + d, by) && this.freeForBoulder(bx + d, by + 1) && !this.sonicIn(bx + d, by) && !this.sonicIn(bx + d, by + 1)
            && !this.snakeAt(bx + d, by)) {
            b.x += d; b.mv = { dx: d, dy: 0, t: 0, dur: RU_ROLL }; b.ox = -d; b.falling = true;
            break;
          }
        }
        if (b.mv) continue;
      }
      b.falling = false;
    }
    // snakes slither back and forth
    for (const s of this.snakes) {
      if (!s.alive) continue;
      if (++s.step >= 18) {
        s.step = 0;
        const nx = s.x + s.dir;
        const c = this.cell(nx, s.y);
        if ((c === '.' || c === '^' || c === 'C') && !this.boulderAt(nx, s.y) && !this.items.has(nx + ',' + s.y) && !this.snakeAt(nx, s.y)) s.x = nx;
        else s.dir = -s.dir;
      }
      s.ox = s.step / 18;
      if (!S.dead && (this.sonicIn(s.x, s.y))) this.kill('snake');
    }
    this.snakes = this.snakes.filter((s) => s.alive);
  }

  // ------------------------------------------------------------ camera / draw
  sonicPx() {
    const S = this.sonic;
    let x = S.x, y = S.y;
    if (S.mv) { const k = S.mv.t / S.mv.dur; x += (S.mv.tx - S.x) * k; y += (S.mv.ty - S.y) * k; }
    return { x: x * RU_T, y: y * RU_T };
  }
  centerCam(snap) {
    const p = this.sonicPx();
    const tx = Math.max(0, Math.min(this.W * RU_T - VIEW_W, p.x + RU_T / 2 - VIEW_W / 2));
    const ty = Math.max(0, Math.min(this.H * RU_T - VIEW_H, p.y + RU_T / 2 - VIEW_H / 2));
    if (snap) { this.cam.x = tx; this.cam.y = ty; return; }
    this.cam.x += (tx - this.cam.x) * 0.15; this.cam.y += (ty - this.cam.y) * 0.15;
  }
  speakerPos() { const p = this.sonicPx(); return { x: p.x - this.cam.x + RU_T / 2, y: p.y - this.cam.y }; }

  draw(ctx) {
    const t = this.g.t, T = RU_T;
    let cx = Math.round(this.cam.x), cy = Math.round(this.cam.y);
    if (this.shake > 0.5) { cx += Math.round((Math.random() - 0.5) * this.shake * 2); cy += Math.round((Math.random() - 0.5) * this.shake * 2); }
    // temple interior backdrop
    ctx.fillStyle = '#1d1810'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    ctx.fillStyle = '#251f15';
    for (let y = -((cy * 0.5) % 48); y < VIEW_H; y += 48) for (let x = -((cx * 0.5) % 96) - (Math.floor((y + cy * 0.5) / 48) % 2) * 48; x < VIEW_W; x += 96) ctx.fillRect(x + 2, y + 2, 92, 44);
    const x0 = Math.floor(cx / T), y0 = Math.floor(cy / T), x1 = Math.ceil((cx + VIEW_W) / T), y1 = Math.ceil((cy + VIEW_H) / T);
    for (let y = Math.max(0, y0); y < Math.min(this.H, y1 + 1); y++) {
      for (let x = Math.max(0, x0); x < Math.min(this.W, x1 + 1); x++) {
        const px = x * T - cx, py = y * T - cy, c = this.grid[y][x];
        if (c !== '.') ruTile(ctx, c, px, py, t, this);
        const it = this.items.get(x + ',' + y);
        if (it === '*') ruDiamond(ctx, px, py, t);
        else if (it === 'k') ruKey(ctx, px, py, t);
        else if (it === 'E') {
          const gl = ctx.createRadialGradient(px + T / 2, py + T / 2, 2, px + T / 2, py + T / 2, 40);
          gl.addColorStop(0, 'rgba(255,255,255,.6)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gl; ctx.fillRect(px - 8, py - 8, T + 16, T + 16);
          drawEmerald(ctx, px + T / 2, py + T / 2 + Math.sin(t * 0.06) * 4, EMERALD_COLORS[4 + Math.min(2, this.emeraldIndex(x, y))], 1.5);
        }
      }
    }
    for (const b of this.boulders) ruBoulder(ctx, (b.x + b.ox) * T - cx, (b.y + b.oy) * T - cy, b.rot);
    for (const s of this.snakes) ruSnake(ctx, (s.x + (s.step / 18) * 0) * T - cx, s.y * T - cy, s.dir, t);
    // Sonic
    const S = this.sonic, p = this.sonicPx();
    let pose = 'idle';
    if (S.dead) pose = S.why === 'crush' ? 'dead' : 'hurt';
    else if (S.pushT > 0) pose = 'push';
    else if (S.mv) pose = S.mv.ty < S.y ? 'spring' : 'walk';
    S.anim += S.mv ? 0.25 : 0.05;
    if (!(S.dead > 0 && S.dead % 6 < 3 && S.dead > 40)) {
      const sq = S.dead && S.why === 'crush' ? 0.35 : 1;
      ctx.save(); ctx.translate(p.x - cx + T / 2, p.y - cy + T); ctx.scale(1, sq);
      drawSonicFrame(ctx, animFrame(pose, S.anim), 0, 0, { scale: 2, flip: S.facing < 0 });
      ctx.restore();
    }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.phase === 'warp') {
      const k = Math.min(1, this.t / 110);
      ctx.save(); ctx.translate(p.x - cx + T / 2, p.y - cy + T / 2);
      for (let i = 0; i < 7; i++) {
        const a = this.t * 0.15 + i / 7 * Math.PI * 2, r = 120 * (1 - k) + 20;
        drawEmerald(ctx, Math.cos(a) * r, Math.sin(a) * r, EMERALD_COLORS[i], 1.2);
      }
      ctx.restore();
      ctx.fillStyle = `rgba(255,255,255,${Math.max(0, (this.t - 70) / 50)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  emeraldIndex(x, y) {
    // which of the three ruin emeralds this is (by order in the map)
    const list = [];
    RUINS_MAP.forEach((r, yy) => r.split('').forEach((c, xx) => { if (c === 'E') list.push(xx + ',' + yy); }));
    return list.indexOf(x + ',' + y);
  }

  drawHUD(ctx) {
    const g = this.g;
    g.text(ctx, 'SCORE', 32, 52, 22, '#ffd23f'); g.text(ctx, String(g.score), 330, 52, 22, '#fff', 'right');
    g.text(ctx, 'TIME', 32, 90, 22, '#ffd23f'); g.text(ctx, g.fmtTime(g.time), 330, 90, 22, '#fff', 'right');
    // diamonds
    ruDiamond(ctx, 16, 104, 0);
    g.text(ctx, `${this.diamonds}/${RU_NEED}`, 92, 146, 20, this.diamonds >= RU_NEED ? '#7dff9a' : '#fff');
    if (this.keys) { ruKey(ctx, 190, 104, 0); g.text(ctx, `x${this.keys}`, 262, 146, 16, '#fff'); }
    g.drawEmeraldSlots(ctx, 32, 172);
    ctx.save(); ctx.translate(52, VIEW_H - 46); drawHeroHead(ctx, 0.9); ctx.restore();
    g.text(ctx, 'SONIC', 86, VIEW_H - 52, 14, '#ffd23f'); g.text(ctx, `x ${g.lives}`, 86, VIEW_H - 28, 16, '#fff');
    if (this.retryT > 10) {
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(VIEW_W / 2 - 160, VIEW_H - 70, 320, 34);
      ctx.fillStyle = '#ff5a3a'; ctx.fillRect(VIEW_W / 2 - 156, VIEW_H - 66, 312 * this.retryT / 70, 26);
      g.text(ctx, 'RETRY FROM CHECKPOINT', VIEW_W / 2, VIEW_H - 46, 12, '#fff', 'center');
    } else g.text(ctx, `HOLD ${keyLabel('jump')}: RETRY FROM CHECKPOINT`, VIEW_W - 24, VIEW_H - 24, 10, '#c9d4ff', 'right');
    if (this.msg) {
      const m = this.msg; m.t++;
      if (m.t > 90) this.msg = null;
      else g.text(ctx, m.text, VIEW_W / 2, 140, 36, m.text === 'CHECKPOINT' ? '#4fd0ff' : '#ff4a3a', 'center', '#000');
    }
    if (this.phase === 'intro' && this.t < 150) {
      const k = Math.min(1, this.t / 20, (150 - this.t) / 20);
      ctx.globalAlpha = k;
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, VIEW_H / 2 - 70, VIEW_W, 140);
      g.text(ctx, 'EMERALD RUINS', VIEW_W / 2, VIEW_H / 2, 44, '#7dff9a', 'center', '#103010');
      g.text(ctx, 'FIND THREE EMERALDS AND OPEN THE GATE', VIEW_W / 2, VIEW_H / 2 + 44, 16, '#fff', 'center', '#000');
      ctx.globalAlpha = 1;
    }
  }
}
