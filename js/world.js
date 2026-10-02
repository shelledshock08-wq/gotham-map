// Tile map, heightmap collision and terrain rendering.
'use strict';

const SOLID_CHARS = '#ABde\\/';

function tileHeight(ch, lx) {
  switch (ch) {
    case '#': return 64;
    case 'A': return 64 - (lx >> 1);
    case 'B': return 32 - (lx >> 1);
    case 'd': return (lx >> 1) + 1;
    case 'e': return 33 + (lx >> 1);
    case '\\': return 64 - lx;
    case '/': return lx + 1;
    default: return 0;
  }
}

const BG_FILL = { hills: '#2ecc71', trees: '#2ecc71', desert: '#f3c7a5', mushrooms: '#de7e4f' };

class World {
  constructor(level) {
    this.level = level;
    this.rows = level.rows;
    this.nRows = level.rowsCount;
    this.nCols = level.cols;
    this.width = this.nCols * TILE;
    this.height = this.nRows * TILE;
    this.theme = level.theme;
    this.platforms = [];   // dynamic one-way/solid tops: {x, y, w, h, solidSides, breakable, obj}
    this.buildTileImages();
  }

  ch(tx, ty) {
    if (ty < 0 || ty >= this.nRows) return '.';
    if (tx < 0 || tx >= this.nCols) return '#';
    return this.rows[ty][tx];
  }
  isSolidCh(c) { return SOLID_CHARS.indexOf(c) >= 0; }

  H(tx, ty, lx) {
    if (ty < 0) return 0;
    if (ty >= this.nRows) return 0;
    if (tx < 0 || tx >= this.nCols) return 64;
    return tileHeight(this.rows[ty][tx], lx);
  }

  // Find the floor surface below/around (x, y). Returns {y, obj} or null.
  // maxDown: how far below y a surface may be. minTop: one-way surfaces
  // above this y are ignored (prevents snapping up through platforms).
  floorAt(x, y, maxDown, minTop = -1e9, ball = false) {
    x = Math.floor(x);
    const tx = Math.floor(x / TILE), lx = x - tx * TILE;
    const ty = Math.floor(y / TILE);
    let surf = null;
    const h = this.H(tx, ty, lx);
    if (h >= 64) {
      const ha = this.H(tx, ty - 1, lx);
      surf = ha > 0 ? ty * TILE - ha : ty * TILE;
    } else if (h > 0) {
      surf = (ty + 1) * TILE - h;
    } else {
      const hb = this.H(tx, ty + 1, lx);
      if (hb > 0) surf = (ty + 2) * TILE - hb;
      else if (maxDown > 40) {
        const hc = this.H(tx, ty + 2, lx);
        if (hc > 0) surf = (ty + 3) * TILE - hc;
      }
    }
    let obj = null;
    // one-way cloud tiles
    for (let r = ty - 1; r <= ty + 1; r++) {
      if (this.ch(tx, r) === '=') {
        const top = r * TILE;
        if (top >= minTop && top >= y - TILE && top <= y + maxDown && (surf === null || top < surf)) surf = top;
      }
    }
    // dynamic platforms
    for (const p of this.platforms) {
      if (ball && p.breakable) continue;
      if (x < p.x || x > p.x + p.w) continue;
      const top = p.y;
      if (top >= minTop && top >= y - TILE && top <= y + maxDown && (surf === null || top <= surf)) { surf = top; obj = p; }
    }
    if (surf === null || surf > y + maxDown) return null;
    return { y: surf, obj };
  }

  solidAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    const c = this.ch(tx, ty);
    if (!this.isSolidCh(c)) return false;
    const lx = Math.floor(x) - tx * TILE;
    return y >= (ty + 1) * TILE - tileHeight(c, lx);
  }
  wallAt(x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    return this.ch(tx, ty) === '#';
  }

  // ---------------- rendering ----------------
  buildTileImages() {
    const th = this.theme, I = Assets.img;
    this.tileImg = [];
    for (let ty = 0; ty < this.nRows; ty++) {
      const row = [];
      for (let tx = 0; tx < this.nCols; tx++) {
        const c = this.rows[ty][tx];
        let img = null;
        if (c === '#') {
          const upE = !this.isSolidCh(this.ch(tx, ty - 1));
          const lE = !this.isSolidCh(this.ch(tx - 1, ty)) && tx > 0;
          const rE = !this.isSolidCh(this.ch(tx + 1, ty)) && tx < this.nCols - 1;
          const dE = ty < this.nRows - 1 && !this.isSolidCh(this.ch(tx, ty + 1));
          let part;
          if (upE) part = lE && !rE ? 'block_top_left' : rE && !lE ? 'block_top_right' : 'block_top';
          else if (lE) part = dE ? 'block_bottom_left' : 'block_left';
          else if (rE) part = dE ? 'block_bottom_right' : 'block_right';
          else part = dE ? 'block_bottom' : 'block_center';
          img = I[`${th}_${part}`];
        } else if (c === 'A') img = I[`${th}_ramp_long_a`];
        else if (c === 'B') img = I[`${th}_ramp_long_b`];
        else if (c === 'd') img = I[`${th}_ramp_long_b_flip`];
        else if (c === 'e') img = I[`${th}_ramp_long_a_flip`];
        else if (c === '\\') img = I[`${th}_ramp_short_b`];
        else if (c === '/') img = I[`${th}_ramp_short_b_flip`];
        else if (c === '=') {
          const l = this.ch(tx - 1, ty) === '=', r = this.ch(tx + 1, ty) === '=';
          img = I[`${th}_cloud${l && r ? '_middle' : l ? '_right' : r ? '_left' : ''}`];
        }
        row.push(img || null);
      }
      this.tileImg.push(row);
    }
  }

  drawTiles(ctx, cam) {
    const x0 = Math.max(0, Math.floor(cam.x / TILE)), x1 = Math.min(this.nCols - 1, Math.floor((cam.x + VIEW_W) / TILE));
    const y0 = Math.max(0, Math.floor(cam.y / TILE)), y1 = Math.min(this.nRows - 1, Math.floor((cam.y + VIEW_H) / TILE));
    const ox = Math.round(cam.x), oy = Math.round(cam.y);
    for (let ty = y0; ty <= y1; ty++) {
      const row = this.tileImg[ty];
      for (let tx = x0; tx <= x1; tx++) {
        const img = row[tx];
        if (img) ctx.drawImage(img, tx * TILE - ox, ty * TILE - oy, TILE, TILE);
      }
    }
  }

  drawBackground(ctx, cam, t) {
    const pal = THEME_COLORS[this.theme];
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, pal.sky1); g.addColorStop(1, pal.sky2);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    const I = Assets.img;
    const bgKey = this.level.bg;
    const camBase = this.height - VIEW_H;
    const layers = [
      { img: I.background_clouds, f: 0.08, s: 2.2, drift: 0.15, yOff: -260 },
      { img: I[bgKey === 'desert' ? 'background_fade_desert' : 'background_fade_hills'], f: 0.2, s: 2.4, yOff: -150 },
      { img: I[`background_color_${bgKey}`], f: 0.4, s: 2.6, yOff: -40, fill: BG_FILL[bgKey] },
    ];
    if (this.theme === 'stone') {
      // starry night for the fortress
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 80; i++) {
        const sx = ((i * 197.3 - cam.x * 0.03) % VIEW_W + VIEW_W) % VIEW_W, sy = (i * 83.7) % (VIEW_H * 0.6);
        ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.02 + i));
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.globalAlpha = 1;
    }
    for (const L of layers) {
      if (!L.img) continue;
      const w = Math.round(L.img.width * L.s), h = Math.round(L.img.height * L.s);
      let y = VIEW_H - h + L.yOff + (camBase - cam.y) * L.f * 0.5;
      if (L.yOff > 0) y = Math.max(VIEW_H - h, y);
      let x = -((cam.x * L.f + (L.drift ? t * L.drift : 0)) % w);
      if (x > 0) x -= w;
      if (this.theme === 'stone' && L !== layers[0]) ctx.globalAlpha = 0.75;
      x = Math.floor(x);
      for (; x < VIEW_W; x += w) ctx.drawImage(L.img, x, Math.floor(y), w, h);
      if (L.fill && y + h < VIEW_H) { ctx.fillStyle = L.fill; ctx.fillRect(0, Math.floor(y + h) - 1, VIEW_W, VIEW_H - Math.floor(y + h) + 1); }
      ctx.globalAlpha = 1;
    }
    if (this.theme === 'stone') { ctx.fillStyle = 'rgba(30,16,80,.38)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }
}
