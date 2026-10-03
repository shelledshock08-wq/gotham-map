// Special Stage, Sonic 2 style: run down a twisting half-pipe in 3D (the
// Generations Sonic model), slide left/right up its walls, jump, grab rings,
// dodge bombs (-10 rings). Each checkpoint gate has a ring quota. The seven
// emeralds Sonic lost in the warp fly ahead of him; every gate he clears wins
// some back. At the end waits an eighth emerald nobody knew existed.
'use strict';

const SS_R = 7;              // half-pipe radius
const SS_GATES = [{ s: 330, need: 28, give: 2 }, { s: 680, need: 85, give: 2 }, { s: 1040, need: 150, give: 3 }];
const SS_END = 1330;

class SpecialStage {
  constructor(game) {
    this.g = game;
    this.t = 0; this.phase = 'intro';
    this.s = 0; this.a = 0; this.va = 0; this.h = 0; this.vh = 0; this.air = false;
    this.speed = 0; this.rings = 0; this.gate = 0; this.recovered = 0; this.invuln = 0; this.hitT = 0;
    this.flash = 0; this.redFlash = 0; this.msg = null;
    game.emeraldCount = 0;          // they're gone... (won back gate by gate)
    try { this.build(); } catch (e) { console.warn('special stage unavailable', e); this.failed = true; }
  }

  // ------------------------------------------------------------ course
  path() {
    const segs = [[120, 0, 0], [140, 0.5, 0.12], [140, -0.6, -0.15], [160, 0.7, 0.08], [160, -0.5, -0.1], [150, 0.6, 0.14], [180, -0.8, -0.12], [160, 0.5, 0.05], [200, 0, 0]];
    const pts = [], up = new THREE.Vector3(0, 1, 0);
    let pos = new THREE.Vector3(), yaw = 0, pitch = 0;
    for (const [len, turn, pt] of segs) {
      for (let i = 0; i < len; i++) {
        yaw += turn / len; pitch += (pt - pitch) * 0.03;
        const f = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        const r = new THREE.Vector3().crossVectors(f, up).normalize();
        const n = new THREE.Vector3().crossVectors(r, f).normalize();
        pts.push({ p: pos.clone(), f, r, n });
        pos.addScaledVector(f, 1);
      }
    }
    this.pts = pts;
  }
  frame(s) { return this.pts[Math.max(0, Math.min(this.pts.length - 1, Math.floor(s)))]; }
  // world position on the pipe: s along it, angle a (0 = bottom), height h off the surface toward the middle
  at(s, a, h = 0, out = new THREE.Vector3()) {
    const n = this.pts.length, i = Math.max(0, Math.min(n - 2, Math.floor(s))), k = Math.max(0, Math.min(1, s - i));
    const A = this.pts[i], B = this.pts[i + 1];
    out.copy(A.p).lerp(B.p, k);
    const rr = A.r.clone().lerp(B.r, k), nn = A.n.clone().lerp(B.n, k);
    const rad = SS_R - h;
    return out.addScaledVector(nn, SS_R - Math.cos(a) * rad).addScaledVector(rr, Math.sin(a) * rad);
  }
  upAt(s, a) { const F = this.frame(s); return F.n.clone().multiplyScalar(Math.cos(a)).addScaledVector(F.r, -Math.sin(a)).normalize(); }
  basis(s, a, m4 = new THREE.Matrix4()) {
    const F = this.frame(s), u = this.upAt(s, a), r = new THREE.Vector3().crossVectors(F.f, u).normalize();
    return m4.makeBasis(r.negate(), u, F.f);
  }

  layout() {
    // deterministic patterns of rings and bombs
    let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const objs = [];
    const ring = (s, a) => objs.push({ type: 'ring', s, a });
    const bomb = (s, a) => objs.push({ type: 'bomb', s, a });
    let prev = 0;
    for (let s = 36; s < SS_END - 30; s += 26) {
      const kind = Math.floor(rnd() * 5);
      const a0 = Math.max(-1.1, Math.min(1.1, prev + (rnd() - 0.5) * 1.2)); prev = a0;   // patterns drift, no wild jumps
      if (SS_GATES.some((g) => Math.abs(g.s - s) < 14)) continue;
      if (kind === 0) for (let i = 0; i < 8; i++) ring(s + i * 2.6, a0);                                  // a line
      else if (kind === 1) for (let i = 0; i < 8; i++) ring(s + i * 2.8, a0 + Math.sin(i * 0.45) * 0.6);   // a lazy weave
      else if (kind === 2) { for (let i = 0; i < 7; i++) ring(s + i * 2.6, a0); bomb(s + 9, a0 + 0.6); bomb(s + 9, a0 - 0.6); }
      else if (kind === 3) { for (const d of [-0.45, 0, 0.45]) ring(s + 3, a0 + d); bomb(s + 10, a0); for (let i = 0; i < 5; i++) ring(s + 14 + i * 2.4, a0 + 0.5); }
      else { for (const d of [-0.9, -0.45, 0.45, 0.9]) bomb(s + 5, a0 + d); for (let i = 0; i < 7; i++) ring(s + 9 + i * 2.4, a0); }
      if (s > 420 && rnd() < 0.55) bomb(s + 23, a0 + (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.5));
    }
    return objs;
  }

  build() {
    this.renderer = EscapeStage.renderer();
    this.path();
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060a2a);
    scene.fog = new THREE.Fog(0x060a2a, 60, 260);
    this.camera = new THREE.PerspectiveCamera(70, VIEW_W / VIEW_H, 0.1, 2000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x203060, 1.0));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(0.3, 1, -0.4); scene.add(sun);
    // the half-pipe: checkered blue and white with orange rims, like Sonic 2
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const g = c.getContext('2d');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#2f63e8' : '#d8e4ff'; g.fillRect(i * 32, j * 32, 32, 32); }
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4; this.pipeTex = tex;
    const N = this.pts.length, segA = 24, A0 = -1.75, A1 = 1.75;
    const P = [], U = [], idx = [];
    for (let s = 0; s < N; s += 2) for (let j = 0; j <= segA; j++) {
      const a = A0 + (A1 - A0) * j / segA, v = this.at(s, a, 0);
      P.push(v.x, v.y, v.z); U.push(j / segA * 4, s / 8);
    }
    const rows = Math.floor((N - 1) / 2) + 1;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < segA; j++) {
      const a = i * (segA + 1) + j, b = a + segA + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    geo.setIndex(idx); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide })));
    // orange rims
    for (const a of [A0, A1]) {
      const pts = []; for (let s = 0; s < N; s += 4) pts.push(this.at(s, a, -0.2));
      const curve = new THREE.CatmullRomCurve3(pts);
      scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.floor(N / 4), 0.35, 6, false), new THREE.MeshBasicMaterial({ color: 0xff8a1c })));
    }
    // stars
    const sv = [];
    for (let i = 0; i < 1500; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(700 + Math.random() * 600); const c0 = this.pts[Math.floor(Math.random() * N)].p; sv.push(c0.x + v.x, c0.y + v.y, c0.z + v.z); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sv, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, fog: false })));
    // checkpoint gates
    this.gateMeshes = SS_GATES.map((gt, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(SS_R + 0.4, 0.35, 8, 40), new THREE.MeshBasicMaterial({ color: [0xffd23f, 0xff5ae0, 0x43f1ff][i] }));
      m.position.copy(this.frame(gt.s).p).addScaledVector(this.frame(gt.s).n, SS_R);
      m.lookAt(m.position.clone().add(this.frame(gt.s).f)); scene.add(m); return m;
    });
    // rings and bombs
    this.objs = this.layout();
    const ringGeo = new THREE.TorusGeometry(0.5, 0.11, 8, 20), ringMat = new THREE.MeshPhongMaterial({ color: 0xffc41f, emissive: 0x6a4400, shininess: 90, specular: 0xffffff });
    const bombGeo = new THREE.SphereGeometry(0.65, 14, 10), bombMat = new THREE.MeshPhongMaterial({ color: 0x15151c, shininess: 80, specular: 0x666666 });
    const spikeGeo = new THREE.ConeGeometry(0.14, 0.4, 6), fuseMat = new THREE.MeshBasicMaterial({ color: 0xff5020 });
    for (const o of this.objs) {
      let m;
      if (o.type === 'ring') { m = new THREE.Mesh(ringGeo, ringMat); m.position.copy(this.at(o.s, o.a, 1.1)); }
      else {
        m = new THREE.Group(); m.add(new THREE.Mesh(bombGeo, bombMat));
        for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(spikeGeo, bombMat); const d = new THREE.Vector3().randomDirection(); sp.position.copy(d).multiplyScalar(0.7); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); m.add(sp); }
        const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), fuseMat); fuse.position.y = 0.8; m.add(fuse);
        m.position.copy(this.at(o.s, o.a, 0.75)); this.basis(o.s, o.a, new THREE.Matrix4()); m.quaternion.setFromRotationMatrix(this.basis(o.s, o.a));
      }
      scene.add(m); o.mesh = m;
    }
    // the seven runaway emeralds, and the eighth
    const emGeo = new THREE.OctahedronGeometry(0.8, 0);
    this.ems = EMERALD_COLORS.slice(0, 7).map((col, i) => {
      const m = new THREE.Mesh(emGeo, new THREE.MeshPhongMaterial({ color: col, emissive: new THREE.Color(col).multiplyScalar(0.4), shininess: 100, specular: 0xffffff }));
      m.scale.set(1, 1.3, 1); scene.add(m); return { m, i, got: false, fly: 0 };
    });
    const e8 = new THREE.Group();
    e8.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshPhongMaterial({ color: 0x2a1f3d, emissive: 0x3a1060, shininess: 120, specular: 0xffffff })));
    e8.add(new THREE.Mesh(new THREE.SphereGeometry(2.4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xb080ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })));
    e8.position.copy(this.at(SS_END, 0, 2.5)); scene.add(e8); this.e8 = e8;
    // Sonic
    this.sonic = escSonicModel(); scene.add(this.sonic.root);
    this.m4 = new THREE.Matrix4();
  }

  // ------------------------------------------------------------ update
  update(inp) {
    const g = this.g;
    this.t++;
    if (this.flash > 0) this.flash -= 0.03;
    if (this.redFlash > 0) this.redFlash -= 0.05;
    if (this.failed) { if (this.t > 60) g.finishSpecial(); return; }
    if (this.phase === 'intro') {
      if (this.t === 1) { Sound.playMusic('special'); this.flash = 1; }
      if (this.t === 40) { Sound.play('ringloss'); g.speech.say('sonic', 'Wait-- the emeralds! They\'re getting away!', { dur: 160, prio: 5 }); }
      if (this.t === 150) g.speech.say('sonic', `${SS_GATES[0].need} rings by the first gate. Let\'s go!`, { dur: 140, prio: 4 });
      if (this.t > 120) { this.phase = 'run'; this.t = 0; }
      this.pose(); return;
    }
    if (this.phase === 'fail') {
      if (this.t > 170) { g.special = new SpecialStage(g); }   // try again
      return;
    }
    if (this.phase === 'eighth') {
      if (this.t === 1) { Sound.play('oneup', { rate: 0.7 }); this.flash = 1.2; g.emeraldCount = 8; }
      if (this.t === 40) g.speech.say('sonic', 'An EIGHTH emerald?! There\'s only supposed to be seven...', { dur: 200, prio: 5 });
      if (this.t === 260) g.speech.say('sonic', 'Whatever it is, it\'s sending me back. Eggman, here I come!', { dur: 180, prio: 5 });
      if (this.t > 440) g.finishSpecial();
      this.pose(); return;
    }
    // ---- run
    if (!g.timeStopped) g.time++;
    if (this.invuln > 0) this.invuln--;
    if (this.hitT > 0) this.hitT--;
    this.speed += ((36 + this.s / 80) - this.speed) * 0.02;
    this.s += this.speed / 60;
    const steer = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    this.va += (steer * 2.9 - this.va) * 0.2;
    this.a = Math.max(-1.55, Math.min(1.55, this.a + this.va / 60));
    if (!this.air && (inp.punchPressed || inp.jumpPressed)) { this.air = true; this.vh = 11; Sound.play('jump'); }
    if (this.air) { this.vh -= 32 / 60; this.h += this.vh / 60; if (this.h <= 0) { this.h = 0; this.air = false; } }
    // rings and bombs
    for (const o of this.objs) {
      if (o.dead || Math.abs(o.s - this.s) > 1.4) continue;
      const da = Math.abs(o.a - this.a) * SS_R;
      if (o.type === 'ring' && da < 1.8 && Math.abs(1.1 - (this.h + 1)) < 1.8) { o.dead = true; o.mesh.visible = false; this.rings++; Sound.ring(); g.addScore(10); }
      if (o.type === 'bomb' && da < 1.2 && this.h < 1.3 && this.invuln <= 0) {
        o.dead = true; o.mesh.visible = false;
        this.rings = Math.max(0, this.rings - 10); this.invuln = 60; this.hitT = 30; this.redFlash = 1;
        Sound.play('boom'); Sound.play('ringloss');
      }
    }
    // checkpoint gates
    const G = SS_GATES[this.gate];
    if (G && this.s >= G.s) {
      if (this.rings >= G.need) {
        this.gate++; Sound.play('checkpoint'); this.msg = { text: 'COOL!', t: 0 };
        let n = G.give;
        for (const e of this.ems) if (!e.got && n > 0) { e.got = true; e.fly = 1; n--; }
        const nx = SS_GATES[this.gate];
        g.speech.say('sonic', nx ? `Got ${G.give} back! Next gate: ${nx.need} rings.` : 'All seven! But what\'s that up ahead...?', { dur: 160, prio: 4 });
      } else {
        this.phase = 'fail'; this.t = 0; Sound.play('death');
        this.msg = { text: 'NOT ENOUGH RINGS...', t: 0 };
        g.speech.say('sonic', 'No! They got away... One more try!', { dur: 160, prio: 5 });
        return;
      }
    }
    if (this.s >= SS_END - 2) { this.phase = 'eighth'; this.t = 0; this.e8.visible = false; return; }
    this.pose();
  }

  // ------------------------------------------------------------ visuals
  pose() {
    const M = this.sonic;
    M.root.position.copy(this.at(this.s, this.a, this.h));
    M.root.quaternion.setFromRotationMatrix(this.basis(this.s, this.a, this.m4));
    const ball = this.air;
    M.body.visible = !ball; M.ball.visible = ball;
    if (ball) M.ball.rotation.x += 0.5;
    if (M.mixer) {
      const name = this.phase === 'intro' || this.phase === 'eighth' ? 'idle' : this.hitT > 0 ? 'hit' : this.speed > 50 ? 'sprint' : 'run';
      const a = M.actions[name];
      if (a && M.cur !== name) { const prev = M.cur && M.actions[M.cur]; a.reset(); a.play(); if (prev) prev.crossFadeTo(a, 0.15, false); M.cur = name; }
      if (a) a.timeScale = name === 'run' ? 0.6 + this.speed / 50 : 1;
      M.mixer.update(1 / 60);
    }
    M.root.visible = !(this.invuln > 0 && this.t % 6 < 3);
    // runaway emeralds weave ahead; won-back ones fly into Sonic
    const t = this.g.t;
    for (const e of this.ems) {
      if (e.got && e.fly > 0) {
        e.fly -= 0.03;
        const from = this.at(this.s + 10 + e.i * 2, Math.sin(e.i) * 0.8, 3), to = this.at(this.s, this.a, 1);
        e.m.position.copy(from.lerp(to, 1 - e.fly));
        if (e.fly <= 0) { e.m.visible = false; this.g.emeraldCount = Math.min(7, (this.g.emeraldCount || 0) + 1); Sound.play('oneup', { rate: 1.4, vol: 0.6 }); this.flash = 0.4; }
      } else if (!e.got) {
        const ahead = this.phase === 'intro' ? 4 + this.t * 0.25 + e.i * 1.5 : 26 + e.i * 5 + Math.sin(t * 0.03 + e.i) * 3;
        e.m.position.copy(this.at(this.s + ahead, Math.sin(t * 0.02 + e.i * 1.3) * 1.1, 2.5 + Math.sin(t * 0.05 + e.i) * 0.6));
      }
      e.m.rotation.y = t * 0.05 + e.i;
    }
    this.e8.rotation.y = t * 0.02; this.e8.children[1].scale.setScalar(1 + Math.sin(t * 0.1) * 0.08);
    for (const o of this.objs) if (o.type === 'ring' && !o.dead && Math.abs(o.s - this.s) < 120) o.mesh.rotation.y = t * 0.08;
  }

  draw(ctx) {
    if (this.failed) { ctx.fillStyle = '#060a2a'; ctx.fillRect(0, 0, VIEW_W, VIEW_H); return; }
    const cam = this.camera;
    const camS = this.phase === 'intro' ? this.s - 5 - 6 * Math.min(1, this.t / 100) : this.s - 9;
    const pos = this.at(camS, this.a * 0.5, SS_R * 0.5);
    const look = this.at(this.s + 5, this.a * 0.85, 1.3);
    if (!this.cp) { this.cp = pos.clone(); this.cl = look.clone(); }
    this.cp.lerp(pos, 0.3); this.cl.lerp(look, 0.3);
    cam.position.copy(this.cp); cam.up.copy(this.frame(this.s).n); cam.lookAt(this.cl);
    this.renderer.render(this.scene, cam);
    ctx.drawImage(this.renderer.domElement, 0, 0, VIEW_W, VIEW_H);
    if (this.redFlash > 0) { ctx.fillStyle = `rgba(255,30,30,${0.35 * this.redFlash})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, this.flash)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
    if (this.phase === 'eighth' && this.t > 300) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, (this.t - 300) / 120)})`; ctx.fillRect(0, 0, VIEW_W, VIEW_H); }
  }

  speakerPos() {
    if (this.failed) return { x: VIEW_W / 2, y: VIEW_H / 2 };
    const v = this.at(this.s, this.a, this.h + 2.2).project(this.camera);
    return { x: (v.x + 1) / 2 * VIEW_W, y: (1 - v.y) / 2 * VIEW_H };
  }

  drawHUD(ctx) {
    const g = this.g;
    g.text(ctx, 'SCORE', 32, 52, 22, '#ffd23f'); g.text(ctx, String(g.score), 330, 52, 22, '#fff', 'right');
    g.drawEmeraldSlots(ctx, 32, 70);
    // ring count vs the next gate's quota
    const G = SS_GATES[this.gate];
    ctx.fillStyle = 'rgba(0,0,40,.6)'; ctx.fillRect(VIEW_W / 2 - 170, 18, 340, 74);
    drawRing(ctx, VIEW_W / 2 - 130, 52, g.t * 0.09);
    g.text(ctx, String(this.rings), VIEW_W / 2 - 90, 66, 34, '#fff');
    if (G) {
      const ok = this.rings >= G.need;
      g.text(ctx, `/ ${G.need}`, VIEW_W / 2 + 10, 66, 26, ok ? '#7dff9a' : '#ffd23f');
      g.text(ctx, ok ? 'COOL!' : `GATE ${this.gate + 1} IN ${Math.max(0, Math.round(G.s - this.s))}`, VIEW_W / 2, 86, 11, '#c9d4ff', 'center');
    } else g.text(ctx, 'CATCH IT!', VIEW_W / 2 + 10, 66, 22, '#b080ff');
    if (this.msg) {
      const m = this.msg; m.t++;
      if (m.t > 120) this.msg = null;
      else g.text(ctx, m.text, VIEW_W / 2, VIEW_H / 2 - 60, 40, m.text === 'COOL!' ? '#7dff9a' : '#ff5a3a', 'center', '#000');
    }
    if (this.phase === 'intro' && this.t < 120) g.text(ctx, 'SPECIAL STAGE', VIEW_W / 2, VIEW_H / 2 + 120, 40, '#fff', 'center', '#1d3fd1');
  }

  dispose() {
    if (!this.scene) return;
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    if (this.pipeTex) this.pipeTex.dispose();
  }
}
