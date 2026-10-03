// Game state machine, camera, HUD and main loop.
'use strict';

const FONT = '"Press Start 2P", "Courier New", monospace';
const CHAIN = [100, 200, 500, 1000];

class Game {
  constructor(canvas) {
    this.screen = canvas;
    this.sctx = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.buf.width = VIEW_W; this.buf.height = VIEW_H;
    this.ctx = this.buf.getContext('2d');
    this.state = 'loading';
    this.frame = 0; this.t = 0;
    this.loadProgress = 0;
    this.input = { left: false, right: false, up: false, down: false, jump: false };
    this.cam = { x: 0, y: 0 };
    this.hiscore = 0;
    try { this.hiscore = parseInt(localStorage.getItem('sonic_hiscore') || '0', 10) || 0; } catch (e) { /* ignore */ }
    try { if (localStorage.getItem('sonic_muted') === '1') Sound.muted = true; } catch (e) { /* ignore */ }
    this.titleCam = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'play') this.state = 'paused'; });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const s = Math.min(w / VIEW_W, h / VIEW_H);
    const cssW = Math.floor(VIEW_W * s), cssH = Math.floor(VIEW_H * s);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.screen.style.width = cssW + 'px'; this.screen.style.height = cssH + 'px';
    this.screen.width = Math.min(Math.round(cssW * dpr), VIEW_W * 2);
    this.screen.height = Math.min(Math.round(cssH * dpr), VIEW_H * 2);
  }

  // ------------------------------------------------------------ game flow
  newGame() {
    this.lives = 3; this.score = 0; this.nextLifeScore = 50000; this.levelIndex = 0;
    this.loadLevel(0);
  }

  loadLevel(i) {
    this.levelIndex = i;
    this.checkpoint = null;
    this.buildLevel();
    this.state = 'play';
    this.card = 170;
    Sound.play('start', { vol: 0.8 });
  }

  buildLevel() {
    const data = LEVELS[this.levelIndex]();
    this.level = data;
    this.world = new World(data);
    this.player = new Player(this);
    this.objs = []; this.enemies = []; this.effects = []; this.decor = []; this.loops = []; this.movers = [];
    this.timers = [];
    this.rings = 0; this.chain = 0; this.shake = 0; this.camLag = 0; this.camAhead = 0; this.lookOffset = 0;
    this.time = this.checkpoint ? this.checkpoint.time : 0;
    this.timeStopped = false;
    this.camLock = null; this.goal = null; this.goalLockX = null;
    this.boss = null; this.bossStarted = false; this.arena = null;
    this.tally = null; this.deathHandled = false; this.final = null;
    let start = null;
    for (const e of data.ents) {
      switch (e.type) {
        case 'start': start = e; break;
        case 'ring': this.objs.push(new Ring(e.x, e.y)); break;
        case 'monitor': { const m = new Monitor(e.x, e.y, e.kind); m.register(this.world); this.objs.push(m); break; }
        case 'spring': this.objs.push(new Spring(e.x, e.y, e.dir, !!e.strong)); break;
        case 'spikes': this.objs.push(new Spikes(e.x, e.y)); break;
        case 'checkpoint': {
          const c = new Checkpoint(e.x, e.y);
          if (this.checkpoint && this.checkpoint.x === e.x) c.active = true;
          this.objs.push(c); break;
        }
        case 'goal': this.goal = new Goal(e.x, e.y); this.objs.push(this.goal); break;
        case 'enemy': this.enemies.push(new Enemy(e.kind, e.x, e.y, e)); break;
        case 'deco': this.decor.push(new Deco(e.x, e.y, e.img)); break;
        case 'loop': this.loops.push(new LoopObj(e.x, e.y, e.R, data.theme)); break;
        case 'mover': { const m = new Mover(e.x, e.y, e.axis, e.range, e.len, e.phase || 0, data.theme); m.register(this.world); this.movers.push(m); break; }
        case 'arena': this.arena = { x: e.x, groundY: e.y, w: e.w }; break;
      }
    }
    const sp = this.checkpoint || start;
    this.player.reset(sp.x, sp.y);
    this.player.ground = false;
    this.cam.x = Math.max(0, this.player.x - VIEW_W / 2);
    this.cam.y = Math.max(0, Math.min(this.world.height - VIEW_H, this.player.y - VIEW_H * 0.55));
  }

  respawn() { this.buildLevel(); this.card = 0; }

  // ------------------------------------------------------------ callbacks
  later(frames, fn) { this.timers.push({ t: frames, fn }); }
  addEffect(e) { this.effects.push(e); }
  addEnemy(e) { this.enemies.push(e); }
  addDust(x, y) { this.effects.push(new Effect('dust', x, y)); }

  addScore(n) {
    this.score += n;
    if (this.score >= this.nextLifeScore) { this.nextLifeScore += 50000; this.extraLife(); }
  }
  extraLife() { this.lives++; Sound.play('oneup'); }

  collectRing(x, y) {
    const before = this.rings;
    this.rings++;
    Sound.ring();
    this.addEffect(new Effect('sparkle', x, y, { color: '#fff7c2' }));
    if (Math.floor(this.rings / 100) > Math.floor(before / 100)) this.extraLife();
  }

  scatterRings() {
    const p = this.player;
    const n = Math.min(this.rings, 32);
    let angle = 101.25 * Math.PI / 180, flip = false, spd = 4 * K;
    for (let i = 0; i < n; i++) {
      if (i === 16) { spd = 2 * K; angle = 101.25 * Math.PI / 180; }
      let xs = Math.cos(angle) * spd; const ys = -Math.sin(angle) * spd;
      if (flip) { xs = -xs; angle += 22.5 * Math.PI / 180; }
      flip = !flip;
      this.objs.push(new ScatterRing(p.x, p.y, xs, ys));
    }
    this.rings = 0;
    Sound.play('ringloss');
  }

  awardChain(x, y) {
    const v = CHAIN[Math.min(this.chain, CHAIN.length - 1)];
    this.chain++;
    this.addScore(v);
    this.addEffect(new Effect('score', x, y, { text: String(v) }));
  }

  applyMonitor(kind, x, y) {
    const p = this.player;
    switch (kind) {
      case 'ring': for (let i = 0; i < 10; i++) this.rings++; Sound.ring(); if (this.rings >= 100 && this.rings - 10 < 100) this.extraLife(); break;
      case 'shield': p.shield = true; Sound.play('shield'); break;
      case 'shoes': p.shoes = 20 * 60; Sound.play('monitor'); break;
      case 'invinc': p.invinc = 20 * 60; Sound.play('monitor'); break;
      case 'life': this.extraLife(); break;
    }
  }

  onPlayerDeath() { this.timeStopped = true; }

  onGoal(goal) {
    this.timeStopped = true;
    this.goalLockX = goal.x - VIEW_W / 2;
    Sound.stopMusic();
  }
  onGoalDone() { this.later(40, () => this.startTally()); }

  startFinal(egg) {
    this.boss = null;
    this.final = new FinalBattle(this, egg, false);
  }
  finalDeath() {
    this.lives--;
    document.getElementById('touch').classList.remove('super');
    if (this.lives <= 0) {
      this.final = null;
      this.state = 'gameover'; this.goTimer = 0; Sound.stopMusic(); Sound.stopTrack(); Sound.play('gameover'); this.saveHi();
      return;
    }
    // retry the showdown straight from the transformation
    const p = this.player;
    p.reset(this.arena.x + 300, this.arena.groundY);
    p.y = this.arena.groundY - STAND_H; p.ground = true;
    this.rings = 50;
    this.final = new FinalBattle(this, null, true);
  }
  onBossDefeated() { this.addScore(1000); this.timeStopped = true; Sound.stopMusic(); }
  onBossGone() { this.later(60, () => this.startTally()); }

  startTally() {
    const s = Math.floor(this.time / 60);
    const timeBonus = s < 30 ? 50000 : s < 45 ? 10000 : s < 60 ? 5000 : s < 90 ? 4000 : s < 120 ? 3000 : s < 180 ? 2000 : s < 240 ? 1000 : s < 300 ? 500 : 0;
    this.tally = { timeBonus, ringBonus: this.rings * 100, t: 0, done: false, wait: 0 };
    this.player.frozen = true;
    Sound.play('actclear');
  }

  // --------------------------------------------------------------- update
  update(inp) {
    this.frame++; this.t++;
    if (inp.mutePressed) Sound.toggleMute();

    switch (this.state) {
      case 'loading': return;
      case 'title':
        this.titleCam += 2;
        if (inp.startPressed || inp.jumpPressed || inp.tapped) { Sound.init(); Sound.play('select'); this.newGame(); }
        Sound.playMusic('meadow');
        return;
      case 'paused':
        Sound.pauseTrack(true);
        if (inp.startPressed) { this.state = 'play'; Sound.pauseTrack(false); }
        return;
      case 'gameover':
        this.goTimer++;
        if (this.goTimer > 90 && (inp.startPressed || inp.jumpPressed || inp.tapped || this.goTimer > 600)) this.toTitle();
        return;
      case 'ending':
        this.endTimer++;
        for (const e of this.endAnimals) e.update(this);
        if (this.endTimer > 120 && (inp.startPressed || inp.jumpPressed || inp.tapped)) this.toTitle();
        return;
    }

    // ---- play ----
    if (inp.startPressed && !this.tally) { this.state = 'paused'; return; }
    this.input = inp;
    const p = this.player;
    if (this.card > 0) this.card--;
    p.frozen = this.card > 110 || !!this.tally;

    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (--this.timers[i].t <= 0) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    }

    if (this.final) {
      this.final.update(inp);
      for (const e of this.effects) e.update(this);
      this.effects = this.effects.filter((o) => !o.dead);
      if (this.tally) this.updateTally(inp);
      this.cam.x = this.arena.x; this.cam.y = this.final.camY;
      return;
    }

    for (const m of this.movers) m.update(this);
    p.update(inp);
    if (p.ground) this.chain = 0;

    for (const o of this.objs) o.update(this);
    for (const e of this.enemies) e.update(this);
    for (const e of this.effects) e.update(this);
    if (this.boss) this.boss.update(this);
    this.objs = this.objs.filter((o) => !o.dead);
    this.enemies = this.enemies.filter((o) => !o.dead);
    this.effects = this.effects.filter((o) => !o.dead);
    if (this.boss && this.boss.dead) this.boss = null;

    // boss arena trigger
    if (this.arena && !this.bossStarted && p.x > this.arena.x + 260 && p.state === 'normal') {
      this.bossStarted = true;
      this.camLock = { x0: this.arena.x, x1: this.arena.x + this.arena.w, y: this.arena.groundY - VIEW_H + 140 };
      this.boss = new Boss(this.arena.x, this.arena.groundY, this.arena.w);
    }

    // timer
    if (!this.timeStopped && this.card < 110 && p.state !== 'dead') {
      this.time++;
      if (this.time >= 60 * 600) { this.time = 60 * 600 - 1; p.die(); }
    }

    // death handling
    if (p.state === 'dead' && !this.deathHandled && p.deadTimer > 110) {
      this.deathHandled = true;
      this.lives--;
      if (this.lives <= 0) { this.state = 'gameover'; this.goTimer = 0; Sound.stopMusic(); Sound.play('gameover'); this.saveHi(); }
      else this.respawn();
      return;
    }

    // music
    let song = this.level.music;
    if (this.boss && this.boss.state !== 'explode' && this.boss.state !== 'flee') song = 'boss';
    if (p.invinc > 0) song = 'invincible';
    if (p.state === 'dead' || this.goal && this.goal.state !== 'idle' || this.tally || (this.boss && this.boss.hits >= this.boss.maxHits) || (this.bossStarted && !this.boss)) Sound.stopMusic();
    else Sound.playMusic(song);

    // tally
    if (this.tally) this.updateTally(inp);

    this.updateCamera();
    if (this.shake > 0) this.shake *= 0.85;
    if (this.shake < 0.5) this.shake = 0;
  }

  updateTally(inp) {
    const T = this.tally;
    T.t++;
    if (T.t < 90) return;
    if (!T.done) {
      const step = (inp.jump ? 2000 : 200);
      for (const k of ['timeBonus', 'ringBonus']) {
        const d = Math.min(T[k], step);
        T[k] -= d; this.addScore(d);
      }
      if (T.t % 4 === 0) Sound.play('select', { vol: 0.25, rate: 1.4 });
      if (T.timeBonus === 0 && T.ringBonus === 0) { T.done = true; Sound.play('checkpoint'); }
    } else if (++T.wait > 150) {
      this.saveHi();
      if (this.levelIndex + 1 < LEVELS.length) { this.loadLevel(this.levelIndex + 1); }
      else { this.state = 'ending'; this.endTimer = 0; this.endAnimals = []; this.final = null; document.getElementById('touch').classList.remove('super'); if (!Sound.trackEl) Sound.playMusic('meadow'); }
    }
  }

  toTitle() { this.saveHi(); this.state = 'title'; this.final = null; Sound.stopMusic(); Sound.stopTrack(); }

  saveHi() {
    if (this.score > this.hiscore) {
      this.hiscore = this.score;
      try { localStorage.setItem('sonic_hiscore', String(this.hiscore)); } catch (e) { /* ignore */ }
    }
  }

  updateCamera() {
    const p = this.player, cam = this.cam, w = this.world;
    if (p.state === 'dead') return;
    // horizontal: lead in the direction of motion
    const sp = p.ground ? p.gsp : p.xsp;
    this.camAhead += (Math.max(-200, Math.min(200, sp * 16)) - this.camAhead) * 0.05;
    let tx = p.x - VIEW_W / 2 + this.camAhead;
    if (this.camLag > 0) this.camLag--;
    else cam.x += (tx - cam.x) * 0.2;
    const minX = p.x - VIEW_W * 0.75, maxX = p.x - VIEW_W * 0.25;
    cam.x = Math.max(minX, Math.min(maxX, cam.x));

    // vertical, with look up / down
    let look = 0;
    if (p.lookUp && p.ground) look = -220;
    if (p.crouch && p.ground) look = 220;
    this.lookTimer = look ? (this.lookTimer || 0) + 1 : 0;
    const wantOff = this.lookTimer > 50 ? look : 0;
    this.lookOffset += (wantOff - this.lookOffset) * 0.06;
    const ty = p.y - VIEW_H * 0.5 + this.lookOffset;
    cam.y += (ty - cam.y) * (p.ground ? 0.18 : 0.12);
    cam.y = Math.max(p.y - VIEW_H * 0.8, Math.min(p.y - VIEW_H * 0.22, cam.y));

    // clamps
    if (this.goalLockX !== null) cam.x = Math.min(cam.x, this.goalLockX);
    if (this.camLock) {
      const L = this.camLock;
      cam.x += (L.x0 - cam.x) * 0.1;
      if (Math.abs(L.x0 - cam.x) < 1) cam.x = L.x0;
      cam.y += (L.y - cam.y) * 0.1;
    }
    cam.x = Math.max(0, Math.min(w.width - VIEW_W, cam.x));
    cam.y = Math.max(0, Math.min(w.height - VIEW_H, cam.y));
  }

  // ----------------------------------------------------------------- draw
  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = true;
    switch (this.state) {
      case 'loading': this.drawLoading(ctx); break;
      case 'title': this.drawTitle(ctx); break;
      case 'ending': this.drawEnding(ctx); break;
      default: this.drawPlay(ctx);
    }
    // present
    const s = this.sctx;
    s.imageSmoothingEnabled = true;
    if ('imageSmoothingQuality' in s) s.imageSmoothingQuality = 'high';
    s.drawImage(this.buf, 0, 0, this.screen.width, this.screen.height);
  }

  drawPlay(ctx) {
    if (this.final) {
      this.final.draw(ctx, this.cam, this.t);
      this.drawHUD(ctx);
      this.final.drawHUD(ctx);
      if (this.tally) this.drawTally(ctx);
      if (this.state === 'paused') this.drawPause(ctx);
      if (this.state === 'gameover') this.drawGameOver(ctx);
      return;
    }
    const cam = { x: this.cam.x, y: this.cam.y };
    if (this.shake) { cam.x += (Math.random() - 0.5) * this.shake * 2; cam.y += (Math.random() - 0.5) * this.shake * 2; }
    const t = this.t;
    this.world.drawBackground(ctx, cam, t);
    for (const l of this.loops) l.draw(ctx, cam, t);
    for (const d of this.decor) d.draw(ctx, cam, t);
    this.world.drawTiles(ctx, { x: Math.round(cam.x), y: Math.round(cam.y) });
    for (const m of this.movers) m.draw(ctx, cam, t);
    for (const o of this.objs) o.draw(ctx, cam, t);
    for (const e of this.enemies) e.draw(ctx, cam, t);
    if (this.boss) this.boss.draw(ctx, cam, t);
    this.player.draw(ctx, cam, t);
    for (const e of this.effects) e.draw(ctx, cam, t);
    this.drawHUD(ctx);
    if (this.card > 0) this.drawTitleCard(ctx);
    if (this.tally) this.drawTally(ctx);
    if (this.state === 'paused') this.drawPause(ctx);
    if (this.state === 'gameover') this.drawGameOver(ctx);
  }

  text(ctx, str, x, y, size, color = '#fff', align = 'left', shadow = '#0b1440') {
    ctx.font = `${size}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    if (shadow) { ctx.fillStyle = shadow; ctx.fillText(str, x + size * 0.15, y + size * 0.15); }
    ctx.fillStyle = color; ctx.fillText(str, x, y);
  }

  fmtTime(frames) {
    const s = Math.floor(frames / 60);
    return `${Math.floor(s / 60)}'${String(s % 60).padStart(2, '0')}"${String(Math.floor((frames % 60) / 60 * 100)).padStart(2, '0')}`;
  }

  drawHUD(ctx) {
    const Y = '#ffd23f';
    const flash = Math.floor(this.t / 16) % 2 === 0;
    this.text(ctx, 'SCORE', 32, 52, 22, Y);
    this.text(ctx, String(this.score), 330, 52, 22, '#fff', 'right');
    this.text(ctx, 'TIME', 32, 90, 22, this.time > 60 * 540 && flash ? '#ff3b3b' : Y);
    this.text(ctx, this.fmtTime(this.time), 330, 90, 22, '#fff', 'right');
    this.text(ctx, 'RINGS', 32, 128, 22, this.rings === 0 && flash ? '#ff3b3b' : Y);
    this.text(ctx, String(this.rings), 330, 128, 22, '#fff', 'right');
    // lives
    ctx.save(); ctx.translate(52, VIEW_H - 46); drawHeroHead(ctx, 0.9); ctx.restore();
    this.text(ctx, 'SONIC', 86, VIEW_H - 52, 14, Y);
    this.text(ctx, `x ${this.lives}`, 86, VIEW_H - 28, 16, '#fff');
    // power ups
    const p = this.player;
    let px = VIEW_W - 40;
    const icons = [];
    if (p.shield) icons.push(['shield', 0]);
    if (p.shoes > 0) icons.push(['shoes', p.shoes]);
    if (p.invinc > 0) icons.push(['invinc', p.invinc]);
    for (const [kind, f] of icons) {
      ctx.save(); ctx.translate(px, 46); ctx.globalAlpha = f && f < 180 && flash ? 0.3 : 1;
      ctx.fillStyle = 'rgba(0,0,30,.45)'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
      drawMonitorIcon(ctx, kind, this.t); ctx.restore();
      px -= 56;
    }
    if (Sound.muted) this.text(ctx, 'MUTED (M)', VIEW_W - 24, VIEW_H - 24, 12, '#fff', 'right');
    if (this.boss && this.boss.state === 'fight') {
      const w = 300, x = VIEW_W / 2 - w / 2, y = 30;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x - 4, y - 4, w + 8, 22);
      ctx.fillStyle = '#ff3b3b'; ctx.fillRect(x, y, w * (1 - this.boss.hits / this.boss.maxHits), 14);
      this.text(ctx, 'DR. EGGMAN', VIEW_W / 2, y + 44, 12, '#fff', 'center');
    }
  }

  drawTitleCard(ctx) {
    const c = this.card; // 170 -> 0
    const inT = Math.min(1, (170 - c) / 20), outT = Math.min(1, c / 20);
    const k = Math.min(inT, outT);
    const ease = 1 - Math.pow(1 - k, 3);
    // blue band from the left
    ctx.save();
    ctx.fillStyle = '#1d3fd1';
    ctx.fillRect(-300 + 560 * ease - 260, 0, 260, VIEW_H);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(0, VIEW_H - 150 * ease, VIEW_W, 70);
    ctx.fillStyle = '#e3262e';
    ctx.beginPath();
    const rx = VIEW_W - 520 * ease;
    ctx.moveTo(rx, 0); ctx.lineTo(VIEW_W + 40, 0); ctx.lineTo(VIEW_W + 40, VIEW_H); ctx.lineTo(rx + 160, VIEW_H); ctx.closePath(); ctx.fill();
    const tx = VIEW_W + 400 - (VIEW_W + 400 - 380) * ease;
    this.text(ctx, this.level.name, tx, 330, 44, '#fff', 'left', '#000');
    this.text(ctx, 'ZONE', tx + 260, 390, 30, '#fff', 'left', '#000');
    this.text(ctx, `ACT ${this.level.act}`, VIEW_W - 180 * ease, 470, 40, '#ffd23f', 'right', '#000');
    ctx.restore();
  }

  drawTally(ctx) {
    const T = this.tally;
    const k = Math.min(1, T.t / 30), e = 1 - Math.pow(1 - k, 3);
    const cx = VIEW_W / 2;
    const title = this.level.boss ? 'ZONE CLEAR!' : 'SONIC GOT THROUGH';
    this.text(ctx, title, -400 + (cx + 400) * e, 230, 36, '#fff', 'center', '#0b1440');
    this.text(ctx, `ACT ${this.level.act}`, VIEW_W + 300 - (VIEW_W + 300 - cx) * e, 290, 32, '#ffd23f', 'center', '#0b1440');
    if (T.t > 40) {
      this.text(ctx, 'TIME BONUS', cx - 300, 380, 24, '#ffd23f');
      this.text(ctx, String(T.timeBonus), cx + 300, 380, 24, '#fff', 'right');
      this.text(ctx, 'RING BONUS', cx - 300, 430, 24, '#ffd23f');
      this.text(ctx, String(T.ringBonus), cx + 300, 430, 24, '#fff', 'right');
      this.text(ctx, 'SCORE', cx - 300, 490, 24, '#ffd23f');
      this.text(ctx, String(this.score), cx + 300, 490, 24, '#fff', 'right');
    }
  }

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(5,10,40,.55)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.text(ctx, 'PAUSED', VIEW_W / 2, VIEW_H / 2, 48, '#fff', 'center');
    this.text(ctx, 'ENTER / START TO RESUME', VIEW_W / 2, VIEW_H / 2 + 60, 16, '#ffd23f', 'center');
  }

  drawGameOver(ctx) {
    const k = Math.min(1, this.goTimer / 40), e = 1 - Math.pow(1 - k, 3);
    ctx.fillStyle = `rgba(0,0,0,${0.6 * e})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.text(ctx, 'GAME', -200 + (VIEW_W / 2 - 20 + 200) * e, VIEW_H / 2, 64, '#fff', 'right', '#1d3fd1');
    this.text(ctx, 'OVER', VIEW_W + 200 - (VIEW_W + 200 - VIEW_W / 2 - 20) * e, VIEW_H / 2, 64, '#fff', 'left', '#1d3fd1');
    if (this.goTimer > 90) this.text(ctx, `SCORE ${this.score}`, VIEW_W / 2, VIEW_H / 2 + 80, 20, '#ffd23f', 'center');
  }

  drawLoading(ctx) {
    ctx.fillStyle = '#0b1440'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    this.text(ctx, 'LOADING', VIEW_W / 2, VIEW_H / 2 - 30, 24, '#fff', 'center');
    ctx.fillStyle = '#26338a'; ctx.fillRect(VIEW_W / 2 - 200, VIEW_H / 2, 400, 20);
    ctx.fillStyle = '#ffd23f'; ctx.fillRect(VIEW_W / 2 - 200, VIEW_H / 2, 400 * this.loadProgress, 20);
  }

  drawTitle(ctx) {
    if (!this.titleWorld) this.titleWorld = new World(LEVELS[0]());
    const t = this.t;
    const cam = { x: this.titleCam % (this.titleWorld.width - VIEW_W), y: this.titleWorld.height - VIEW_H };
    this.titleWorld.drawBackground(ctx, cam, t);
    ctx.fillStyle = 'rgba(10,30,90,.25)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // emblem
    const cx = VIEW_W / 2, cy = 300;
    ctx.save(); ctx.translate(cx, cy);
    const wing = ctx.createLinearGradient(0, -150, 0, 150);
    wing.addColorStop(0, '#ffe066'); wing.addColorStop(1, '#ff9d1c');
    ctx.fillStyle = wing; ctx.strokeStyle = '#0b1440'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, 170, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d3fd1'; ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI * 2); ctx.clip();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#2a55e6' : '#1d3fd1'; ctx.fillRect(-150, -150 + i * 50, 300, 50); }
    ctx.restore();
    // hero peeking
    drawSonicFrame(ctx, animFrame('tap', t * 0.04), 0, 128, { scale: 8 });
    ctx.restore();

    // logo banner
    ctx.save(); ctx.translate(cx, 470); ctx.rotate(-0.04);
    ctx.fillStyle = '#0b1440'; ctx.fillRect(-330, -58, 660, 116);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-322, -50, 644, 100);
    ctx.fillStyle = '#1d3fd1'; ctx.fillRect(-316, -44, 632, 88);
    ctx.font = `italic 72px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0b1440'; ctx.fillText('SONIC', 6, 8);
    ctx.fillStyle = '#ffffff'; ctx.fillText('SONIC', 0, 2);
    ctx.restore();
    ctx.save(); ctx.translate(cx, 548);
    ctx.fillStyle = '#e3262e'; ctx.beginPath(); ctx.moveTo(-250, -22); ctx.lineTo(250, -22); ctx.lineTo(230, 22); ctx.lineTo(-230, 22); ctx.closePath(); ctx.fill();
    ctx.restore();
    this.text(ctx, 'EMERALD MEADOW', cx, 558, 22, '#fff', 'center', '#5a0b14');

    if (Math.floor(t / 30) % 2 === 0) this.text(ctx, 'PRESS ENTER / TAP TO START', cx, 630, 20, '#ffd23f', 'center');
    this.text(ctx, `HI-SCORE ${this.hiscore}`, cx, 40, 14, '#fff', 'center');
    this.text(ctx, 'ARROWS/WASD MOVE  Z/X/SPACE JUMP  DOWN+JUMP SPIN DASH  P PAUSE  M MUTE', cx, 676, 11, '#fff', 'center');
    this.text(ctx, 'UNOFFICIAL NON-COMMERCIAL FAN GAME. SONIC (C) SEGA. ART & SFX: KENNEY.NL (CC0)', cx, 702, 9, '#c9d4ff', 'center');
  }

  drawEnding(ctx) {
    if (!this.endWorld) this.endWorld = new World(LEVELS[0]());
    const t = this.t;
    const cam = { x: t * 6 % (this.endWorld.width - VIEW_W), y: this.endWorld.height - VIEW_H };
    this.endWorld.drawBackground(ctx, cam, t);
    ctx.fillStyle = '#3ecf72'; ctx.fillRect(0, 560, VIEW_W, 160);
    ctx.fillStyle = '#e8935a'; ctx.fillRect(0, 590, VIEW_W, 130);
    const hy = 470 + Math.sin(t * 0.06) * 10;
    drawSuperAura(ctx, VIEW_W / 2, hy - 40, t, 1.4);
    drawSonicFrame(ctx, animFrame('fly', t * 0.1), VIEW_W / 2, hy, { sheet: 'super', scale: 4 });
    for (let i = 0; i < 6; i++) {
      const x = (VIEW_W / 2 - 200 - i * 90 + Math.sin(t * 0.05 + i) * 20);
      const y = 545 - Math.abs(Math.sin(t * 0.12 + i)) * 50;
      drawAnimal(ctx, x, y, i % 2, t, 1);
    }
    const k = Math.min(1, this.endTimer / 40);
    ctx.globalAlpha = k;
    this.text(ctx, 'CONGRATULATIONS!', VIEW_W / 2, 170, 44, '#ffd23f', 'center');
    this.text(ctx, 'THE EGG COLOSSUS IS SCRAP AND EGGMAN HAS FLED.', VIEW_W / 2, 240, 16, '#fff', 'center');
    this.text(ctx, `FINAL SCORE ${this.score}`, VIEW_W / 2, 310, 26, '#fff', 'center');
    this.text(ctx, `HI-SCORE ${this.hiscore}`, VIEW_W / 2, 350, 16, '#c9d4ff', 'center');
    if (this.endTimer > 120 && Math.floor(t / 30) % 2 === 0) this.text(ctx, 'PRESS START', VIEW_W / 2, 420, 20, '#fff', 'center');
    ctx.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ boot
(function boot() {
  const canvas = document.getElementById('screen');
  const game = new Game(canvas);
  window.game = game;
  Input.init();
  Assets.load((p) => { game.loadProgress = p; }).then(() => {
    // wait briefly for the pixel font so the first frames render correctly
    const ready = document.fonts && document.fonts.load ? document.fonts.load(`20px ${FONT}`).catch(() => {}) : Promise.resolve();
    Promise.race([ready, new Promise((r) => setTimeout(r, 1500))]).then(() => {
      game.state = 'title';
      const m = document.getElementById('boot-msg');
      if (m && !document.getElementById('boot-err').textContent) m.remove();
    });
  });

  const STEP = 1000 / 60;
  let last = performance.now(), acc = 0;
  function frame(now) {
    acc += Math.min(250, now - last); last = now;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      game.update(Input.poll());
      acc -= STEP; steps++;
    }
    if (steps === 5) acc = 0;
    game.draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
