// Asset loading. All art in assets/ is CC0 by Kenney (www.kenney.nl).
'use strict';

const TILE = 64;
const VIEW_W = 1280;
const VIEW_H = 720;

const THEMES = ['grass', 'sand', 'stone', 'purple'];
const TERRAIN_PARTS = [
  'block', 'block_top', 'block_top_left', 'block_top_right', 'block_center',
  'block_left', 'block_right', 'block_bottom', 'block_bottom_left', 'block_bottom_right',
  'cloud', 'cloud_left', 'cloud_middle', 'cloud_right',
  'ramp_long_a', 'ramp_long_b', 'ramp_short_b',
];

const IMAGE_LIST = (() => {
  const list = {};
  for (const th of THEMES) {
    for (const part of TERRAIN_PARTS) list[`${th}_${part}`] = `assets/tiles/terrain_${th}_${part}.png`;
  }
  const tiles = ['spring', 'spring_out', 'spikes', 'bush', 'grass', 'rock', 'mushroom_red', 'mushroom_brown',
    'cactus', 'fence', 'sign', 'sign_right', 'flag_off', 'flag_blue_a', 'flag_blue_b', 'bomb', 'bomb_active',
    'fireball', 'hill', 'hill_top', 'torch_on_a', 'torch_on_b', 'star', 'heart', 'saw', 'chain', 'window'];
  for (const t of tiles) list[t] = `assets/tiles/${t}.png`;
  const enemies = ['slime_normal_rest', 'slime_normal_walk_a', 'slime_normal_walk_b', 'slime_normal_flat',
    'ladybug_walk_a', 'ladybug_walk_b', 'ladybug_fly', 'ladybug_rest', 'bee_a', 'bee_b', 'bee_rest',
    'fly_a', 'fly_b', 'fly_rest', 'frog_idle', 'frog_jump', 'frog_rest', 'saw_a', 'saw_b',
    'mouse_walk_a', 'mouse_walk_b', 'mouse_rest'];
  for (const e of enemies) list[e] = `assets/enemies/${e}.png`;
  const bgs = ['background_color_hills', 'background_color_desert', 'background_color_trees',
    'background_color_mushrooms', 'background_clouds', 'background_solid_sky',
    'background_fade_hills', 'background_fade_desert'];
  for (const b of bgs) list[b] = `assets/bg/${b}.png`;
  list.sonic = 'assets/sonic/sonic.png';
  list.super = 'assets/sonic/super.png';
  list.eggman = 'assets/sonic/eggman.png';
  list.metal = 'assets/sonic/metal.png';
  for (let i = 1; i <= 4; i++) list['eggman_d' + i] = `assets/sonic/eggman_d${i}.png`;   // beaten-up sheets
  return list;
})();

const Assets = {
  img: {},
  loaded: 0,
  total: Object.keys(IMAGE_LIST).length,

  load(onProgress) {
    const jobs = Object.entries(IMAGE_LIST).map(([key, src]) => new Promise((resolve) => {
      const im = new Image();
      im.onload = () => { this.img[key] = im; this.loaded++; onProgress && onProgress(this.loaded / this.total); resolve(); };
      im.onerror = () => { console.warn('Missing image', src); this.loaded++; resolve(); };
      im.src = (window.EMBEDDED_ASSETS && window.EMBEDDED_ASSETS[src]) || src;
    }));
    return Promise.all(jobs).then(() => this.buildDerived());
  },

  // Mirrored ramps (ascending to the right) and tinted variants, built with
  // canvas compositing only, so it also works when opened from file://.
  buildDerived() {
    for (const th of THEMES) {
      for (const part of ['ramp_long_a', 'ramp_long_b', 'ramp_short_b']) {
        const src = this.img[`${th}_${part}`];
        if (src) this.img[`${th}_${part}_flip`] = this.flip(src);
      }
    }
    if (this.img.spring) {
      this.img.spring_red = this.tint(this.img.spring, '#ff2d3a', 0.55);
      this.img.spring_out_red = this.tint(this.img.spring_out, '#ff2d3a', 0.55);
    }
    if (this.img.eggman) this.img.eggman_white = this.tint(this.img.eggman, '#ffffff', 1);
    for (const k of ['slime_normal_walk_a', 'slime_normal_walk_b', 'slime_normal_rest']) {
      if (this.img[k]) this.img[k + '_blue'] = this.tint(this.img[k], '#2f7dff', 0.5);
    }
  },

  flip(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.translate(img.width, 0); g.scale(-1, 1);
    g.drawImage(img, 0, 0);
    return c;
  },

  tint(img, color, amount) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = amount;
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  },
};
