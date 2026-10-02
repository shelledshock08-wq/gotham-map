// Level construction. Terrain is built column-by-column with a "pen" that
// walks right, so slopes always line up. Entities use pixel coordinates.
'use strict';

// Terrain chars:  '#' solid   'A','B' long ramp down-right (64->32->0)
//                 'd','e' long ramp up-right   '\' / '/' 45-degree ramps
//                 '=' one-way cloud platform
class LevelBuilder {
  constructor(rows, baseHeight) {
    this.rows = rows;
    this.grid = [];       // grid[col] = array of chars by row
    this.hts = [];        // solid height in tiles for each column (excluding slope tile)
    this.x = 0;
    this.g = baseHeight;
    this.ents = [];
  }

  column(x) {
    while (this.grid.length <= x) { this.grid.push(new Array(this.rows).fill('.')); this.hts.push(0); }
    return this.grid[x];
  }
  set(x, row, ch) { if (row >= 0 && row < this.rows) this.column(x)[row] = ch; }
  fillCol(x, h) {
    const col = this.column(x);
    for (let r = this.rows - h; r < this.rows; r++) col[r] = '#';
    this.hts[x] = h;
  }
  surfRow(x) { return this.rows - this.hts[x]; }          // row index of top solid tile
  groundY(x) { return this.surfRow(x) * TILE; }            // pixel y of flat ground surface

  flat(n) { for (let i = 0; i < n; i++) this.fillCol(this.x++, this.g); return this; }
  gap(n) { for (let i = 0; i < n; i++) { this.column(this.x); this.hts[this.x] = 0; this.x++; } return this; }
  up(n) {
    for (let i = 0; i < n; i++) { this.fillCol(this.x, this.g); this.set(this.x, this.rows - this.g - 1, '/'); this.x++; this.g++; }
    return this;
  }
  down(n) {
    for (let i = 0; i < n; i++) { this.g--; this.fillCol(this.x, this.g); this.set(this.x, this.rows - this.g - 1, '\\'); this.x++; }
    return this;
  }
  upLong(n) {
    for (let i = 0; i < n; i++) {
      const r = this.rows - this.g - 1;
      this.fillCol(this.x, this.g); this.set(this.x, r, 'd'); this.x++;
      this.fillCol(this.x, this.g); this.set(this.x, r, 'e'); this.x++;
      this.g++;
    }
    return this;
  }
  downLong(n) {
    for (let i = 0; i < n; i++) {
      this.g--;
      const r = this.rows - this.g - 1;
      this.fillCol(this.x, this.g); this.set(this.x, r, 'A'); this.x++;
      this.fillCol(this.x, this.g); this.set(this.x, r, 'B'); this.x++;
    }
    return this;
  }
  wall(n, h = this.rows) { for (let i = 0; i < n; i++) this.fillCol(this.x++, h); return this; }

  // ---- placement helpers (x in tiles, relative to current pen unless abs) ----
  ent(type, px, py, props = {}) { this.ents.push({ type, x: px, y: py, ...props }); return this; }
  on(tx, type, props = {}, upPx = 0) {   // stand an entity on the ground of column tx
    return this.ent(type, tx * TILE + TILE / 2, this.groundY(tx) - upPx, props);
  }
  rings(tx, count, upPx = 40, spacing = 44) {
    for (let i = 0; i < count; i++) {
      const px = tx * TILE + TILE / 2 + i * spacing;
      const col = Math.floor(px / TILE);
      this.ent('ring', px, this.groundY(col) - upPx);
    }
    return this;
  }
  ringArc(tx, count, height = 150, spacing = 44, baseUp = 40) {
    const base = this.groundY(tx);
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0.5 : i / (count - 1);
      this.ent('ring', tx * TILE + TILE / 2 + i * spacing, base - baseUp - Math.sin(f * Math.PI) * height);
    }
    return this;
  }
  ringColumn(tx, count, upPx = 60, spacing = 44) {
    for (let i = 0; i < count; i++) this.ent('ring', tx * TILE + TILE / 2, this.groundY(tx) - upPx - i * spacing);
    return this;
  }
  platform(tx, rowsAboveGround, len, groundCol = tx) {
    const row = this.surfRow(groundCol) - rowsAboveGround;
    for (let i = 0; i < len; i++) this.set(tx + i, row, '=');
    return row;
  }
  platRings(tx, rowsAboveGround, len, groundCol = tx) {
    const y = (this.surfRow(groundCol) - rowsAboveGround) * TILE - 36;
    for (let i = 0; i < len * 2 - 1; i++) this.ent('ring', tx * TILE + 32 + i * 32, y);
    return this;
  }
  loop(tx) {
    const R = 170;
    const cx = tx * TILE + TILE / 2, groundY = this.groundY(tx);
    this.ent('loop', cx, groundY, { R });
    const cy = groundY - R;
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.75 - (i / 9) * Math.PI * 1.5 + Math.PI;
      this.ent('ring', cx + Math.sin(a) * (R - 45), cy + Math.cos(a) * (R - 45));
    }
    return this;
  }
  deco(tx, img, upPx = 0) { return this.ent('deco', tx * TILE + TILE / 2, this.groundY(tx) - upPx, { img }); }

  build(meta) {
    // Clamp: guarantee the final columns are a wall.
    const cols = this.grid.length;
    const rows = [];
    for (let r = 0; r < this.rows; r++) {
      let s = '';
      for (let c = 0; c < cols; c++) s += this.grid[c][r];
      rows.push(s);
    }
    return { ...meta, rows, ents: this.ents, cols, rowsCount: this.rows };
  }
}

// ---------------------------------------------------------------------------
function buildAct1() {
  const b = new LevelBuilder(20, 4);
  const X = () => b.x;
  // Opening stretch
  b.wall(1);
  let s = X(); b.flat(16);
  b.ent('start', (s + 3) * TILE + 32, b.groundY(s + 3));
  b.deco(s + 1, 'bush'); b.deco(s + 6, 'sign_right'); b.deco(s + 12, 'grass');
  b.rings(s + 7, 6);
  b.on(s + 14, 'monitor', { kind: 'ring' });
  s = X(); b.upLong(1); b.flat(8);
  b.on(s + 5, 'enemy', { kind: 'slime' }); b.rings(s + 3, 4); b.deco(s + 8, 'rock');
  s = X(); b.up(2); b.flat(10);
  b.ringArc(s + 3, 6, 110); b.on(s + 9, 'enemy', { kind: 'ladybug' }); b.deco(s + 4, 'bush');
  s = X(); b.downLong(2); b.flat(12);
  b.on(s + 6, 'spring', { dir: 'up' });
  b.platform(s + 6, 5, 6); b.platRings(s + 7, 5, 4, s + 6);
  b.on(s + 10, 'monitor', { kind: 'shoes' }, 5 * TILE);
  b.ent('enemy', (s + 9) * TILE, b.groundY(s + 9) - 150, { kind: 'fly' });
  b.deco(s + 5, 'mushroom_red');
  b.gap(3); b.ringArc(X() - 4, 6, 140, 44, 40);
  s = X(); b.flat(14);
  b.on(s + 2, 'checkpoint'); b.on(s + 6, 'spikes'); b.on(s + 7, 'spikes');
  b.on(s + 11, 'monitor', { kind: 'shield' }); b.on(s + 9, 'enemy', { kind: 'slime' });
  b.deco(s + 13, 'bush');
  // Downhill into the loop
  s = X(); b.downLong(3); b.flat(22);
  b.rings(s + 7, 5, 40);
  b.loop(s + 14); b.deco(s + 8, 'grass'); b.deco(s + 21, 'sign_right');
  s = X(); b.up(3); b.flat(8);
  b.on(s + 5, 'enemy', { kind: 'slime' }); b.rings(s + 4, 4);
  s = X(); b.gap(5);
  b.ent('mover', s * TILE + 32, b.groundY(s - 1) - 24, { axis: 'x', range: 3 * TILE, len: 3 });
  s = X(); b.flat(12);
  b.ent('enemy', (s + 6) * TILE, b.groundY(s + 6) - 260, { kind: 'bee' });
  b.on(s + 3, 'spring', { dir: 'up', strong: true });
  b.platform(s + 4, 7, 5); b.platRings(s + 4, 7, 5, s + 3);
  b.on(s + 7, 'monitor', { kind: 'life' }, 7 * TILE);
  b.deco(s + 10, 'mushroom_brown');
  s = X(); b.upLong(2); b.flat(14);
  b.on(s + 5, 'checkpoint'); b.on(s + 8, 'enemy', { kind: 'frog' }); b.ringArc(s + 6, 6, 120);
  b.on(s + 12, 'spring', { dir: 'right' });
  s = X(); b.downLong(3); b.flat(24);
  b.rings(s + 7, 8); b.on(s + 12, 'enemy', { kind: 'slime' }); b.on(s + 16, 'enemy', { kind: 'ladybug' });
  b.on(s + 19, 'monitor', { kind: 'ring' }); b.deco(s + 13, 'bush');
  s = X(); b.up(1); b.flat(20);
  b.on(s + 9, 'goal'); b.deco(s + 3, 'grass'); b.deco(s + 14, 'bush');
  b.wall(2);
  return b.build({ name: 'EMERALD MEADOW', act: 1, theme: 'grass', bg: 'hills', music: 'meadow' });
}

function buildAct2() {
  const b = new LevelBuilder(22, 5);
  const X = () => b.x;
  b.wall(1);
  let s = X(); b.flat(14);
  b.ent('start', (s + 3) * TILE + 32, b.groundY(s + 3));
  b.deco(s + 2, 'cactus'); b.rings(s + 6, 5); b.on(s + 12, 'monitor', { kind: 'ring' });
  s = X(); b.downLong(2); b.flat(18);
  b.on(s + 5, 'enemy', { kind: 'mouse' }); b.loop(s + 12); b.deco(s + 19, 'cactus');
  s = X(); b.up(2); b.flat(6);
  b.on(s + 4, 'enemy', { kind: 'frog' });
  s = X(); b.gap(4);
  b.ent('mover', s * TILE + 32, b.groundY(s - 1) - 24, { axis: 'x', range: 2 * TILE, len: 2 });
  b.ringArc(s - 1, 6, 130, 44, 40);
  s = X(); b.flat(10);
  b.on(s + 2, 'checkpoint'); b.on(s + 5, 'spikes'); b.on(s + 6, 'spikes');
  b.ent('enemy', (s + 6) * TILE, b.groundY(s + 6) - 280, { kind: 'bee' });
  b.on(s + 9, 'spring', { dir: 'up' });
  b.platform(s + 10, 5, 4, s + 9);
  s = X(); b.up(3); b.flat(8);
  b.on(s + 5, 'enemy', { kind: 'saw', range: 3 * TILE }); b.on(s + 10, 'monitor', { kind: 'shield' });
  s = X(); b.gap(6);
  b.ent('mover', (s + 1) * TILE + 32, b.groundY(s - 1) + 2 * TILE, { axis: 'y', range: 3 * TILE, len: 2 });
  b.ent('mover', (s + 4) * TILE, b.groundY(s - 1) - 40, { axis: 'y', range: 2 * TILE, len: 2, phase: Math.PI });
  s = X(); b.flat(12);
  b.on(s + 3, 'enemy', { kind: 'ladybug' }); b.on(s + 7, 'enemy', { kind: 'slime' }); b.rings(s + 2, 8);
  b.deco(s + 10, 'cactus');
  s = X(); b.downLong(4); b.flat(22);
  b.on(s + 9, 'spring', { dir: 'right' }); b.rings(s + 10, 4);
  b.loop(s + 14); b.on(s + 20, 'monitor', { kind: 'invinc' });
  s = X(); b.flat(10);
  b.on(s + 1, 'checkpoint'); b.on(s + 4, 'spikes'); b.on(s + 7, 'enemy', { kind: 'mouse' });
  b.on(s + 9, 'spring', { dir: 'up', strong: true });
  b.platform(s + 10, 8, 8, s + 9); b.platRings(s + 10, 8, 6, s + 9);
  b.ent('monitor', (s + 16) * TILE + 32, (b.surfRow(s + 9) - 8) * TILE, { kind: 'life' });
  s = X(); b.up(2); b.flat(8); b.gap(3); b.flat(8);
  b.ent('enemy', (s + 9) * TILE, b.groundY(s + 1) - 200, { kind: 'fly' });
  b.on(s + 13, 'enemy', { kind: 'frog' }); b.on(s + 4, 'enemy', { kind: 'saw', range: 2 * TILE });
  s = X(); b.downLong(2); b.flat(14);
  b.ent('enemy', (s + 6) * TILE, b.groundY(s + 6) - 260, { kind: 'bee' });
  b.rings(s + 5, 6); b.on(s + 10, 'monitor', { kind: 'ring' });
  s = X(); b.down(1); b.flat(20);
  b.on(s + 10, 'goal'); b.deco(s + 4, 'cactus'); b.deco(s + 16, 'cactus');
  b.wall(2);
  return b.build({ name: 'SUNSET DUNES', act: 2, theme: 'sand', bg: 'desert', music: 'dunes' });
}

function buildAct3() {
  const b = new LevelBuilder(20, 4);
  const X = () => b.x;
  b.wall(1);
  let s = X(); b.flat(12);
  b.ent('start', (s + 3) * TILE + 32, b.groundY(s + 3));
  b.rings(s + 5, 5); b.on(s + 10, 'monitor', { kind: 'ring' });
  s = X(); b.up(2); b.flat(6); b.gap(3); b.flat(6);
  b.on(s + 5, 'enemy', { kind: 'saw', range: 2 * TILE }); b.ringArc(s + 7, 5, 120);
  b.ent('enemy', (s + 12) * TILE, b.groundY(s + 12) - 220, { kind: 'bee' });
  s = X(); b.downLong(2); b.flat(14);
  b.on(s + 6, 'spikes'); b.on(s + 7, 'spikes'); b.on(s + 8, 'spikes');
  b.on(s + 4, 'spring', { dir: 'up' }); b.platform(s + 5, 4, 5, s + 4); b.platRings(s + 5, 4, 5, s + 4);
  b.on(s + 12, 'checkpoint'); b.on(s + 15, 'enemy', { kind: 'mouse' });
  s = X(); b.gap(5);
  b.ent('mover', s * TILE + 32, b.groundY(s - 1) - 24, { axis: 'x', range: 3 * TILE, len: 3 });
  s = X(); b.flat(10);
  b.on(s + 3, 'monitor', { kind: 'shield' }); b.on(s + 6, 'monitor', { kind: 'ring' });
  b.on(s + 8, 'checkpoint');
  // Boss arena: exactly one screen wide (20 tiles) between two walls.
  s = X(); b.flat(20);
  b.ent('arena', s * TILE, b.groundY(s), { w: 20 * TILE });
  b.wall(3);
  return b.build({ name: 'STARLIGHT FORTRESS', act: 3, theme: 'stone', bg: 'trees', music: 'fortress', boss: true });
}

const LEVELS = [buildAct1, buildAct2, buildAct3];
