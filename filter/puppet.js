/* Image-generated artwork, deformed locally by face and body landmarks. */
window.CharmPuppet = (() => {
  const art = new Image();
  art.src = window.CHARM_ART_URL;
  const groups = {
    neutral: { smile: 0.1, jaw: 0, browL: 0, browR: 0 },
    joy: { smile: 1, jaw: 0.3, browL: 0.2, browR: 0.2 },
    sadness: { smile: 0, jaw: 0.08, browL: 0.7, browR: 0.7 },
    anger: { smile: 0, jaw: 0.22, browL: -0.8, browR: -0.8 },
    surprise: { smile: 0.05, jaw: 0.9, browL: 1, browR: 1 },
    concern: { smile: 0, jaw: 0.3, browL: 0.8, browR: 0.4 },
    disgust: { smile: 0, jaw: 0.15, browL: -0.4, browR: 0.5 },
    confidence: { smile: 0.7, jaw: 0.08, browL: 0.6, browR: -0.2 },
  };
  const presets = Object.entries(groups).flatMap(([group, values]) =>
    Array.from({ length: 10 }, (_, i) => ({
      id: group + "-" + (i + 1),
      group,
      variation: i + 1,
      values: {
        ...values,
        smile: Math.max(0, values.smile * (0.55 + i * 0.05)),
        jaw: values.jaw * (0.35 + i * 0.075),
        browL: values.browL * (0.5 + i * 0.055),
        browR: values.browR * (0.5 + i * 0.055),
        gazeX: ((i % 5) - 2) * 0.2,
        blinkL: i === 8 ? 0.85 : 0,
        blinkR: i === 9 ? 0.85 : 0,
      },
    })),
  );
  const bones = [
    [11, 625, 350],
    [12, 400, 350],
    [13, 715, 535],
    [14, 305, 535],
    [15, 802, 741],
    [16, 222, 741],
    [23, 585, 775],
    [24, 440, 775],
    [25, 592, 1090],
    [26, 432, 1090],
    [27, 625, 1415],
    [28, 385, 1415],
  ];
  function triangle(g, a, b, c, A, B, C) {
    const den = a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y);
    if (Math.abs(den) < 0.001) return;
    const xx =
      (A.x * (b.y - c.y) + B.x * (c.y - a.y) + C.x * (a.y - b.y)) / den;
    const xy =
      (A.x * (c.x - b.x) + B.x * (a.x - c.x) + C.x * (b.x - a.x)) / den;
    const x0 = A.x - xx * a.x - xy * a.y;
    const yx =
      (A.y * (b.y - c.y) + B.y * (c.y - a.y) + C.y * (a.y - b.y)) / den;
    const yy =
      (A.y * (c.x - b.x) + B.y * (a.x - c.x) + C.y * (b.x - a.x)) / den;
    const y0 = A.y - yx * a.x - yy * a.y;
    const center = { x: (A.x + B.x + C.x) / 3, y: (A.y + B.y + C.y) / 3 };
    const expand = (p) => {
      const dx = p.x - center.x,
        dy = p.y - center.y,
        length = Math.max(0.001, Math.hypot(dx, dy));
      return { x: p.x + (dx / length) * 0.8, y: p.y + (dy / length) * 0.8 };
    };
    const aa = expand(A),
      bb = expand(B),
      cc = expand(C);
    g.save();
    g.beginPath();
    g.moveTo(aa.x, aa.y);
    g.lineTo(bb.x, bb.y);
    g.lineTo(cc.x, cc.y);
    g.closePath();
    g.clip();
    g.transform(xx, yx, xy, yy, x0, y0);
    g.drawImage(art, 0, 0);
    g.restore();
  }
  function expression(live, selected, strength = 1) {
    const p = presets.find((p) => p.id === selected);
    if (!p) return live;
    const e = { ...live };
    for (const [k, v] of Object.entries(p.values))
      e[k] = (e[k] || 0) * (1 - strength) + v * strength;
    // Speech and real blinks remain responsive while a pose is selected.
    e.jaw = Math.max(e.jaw, live.jaw || 0);
    e.blinkL = Math.max(e.blinkL, live.blinkL || 0);
    e.blinkR = Math.max(e.blinkR, live.blinkR || 0);
    return e;
  }
  function draw(g, h, tracker, w, height, selected = "live") {
    if (!art.complete || !art.naturalWidth) return;
    const e = expression(h.expression || {}, selected);
    const sx = h.sx / 98,
      sy = h.sy / 98,
      co = Math.cos(h.roll),
      si = Math.sin(h.roll);
    function rigid(x, y) {
      let dx =
          ((x - 512) * (1 - Math.abs(h.yaw || 0) * 0.15) +
            (y - 170) * (h.yaw || 0) * 0.12) *
          sx,
        dy = (y - 170) * sy;
      return { x: h.x + dx * co - dy * si, y: h.y + dx * si + dy * co };
    }
    const anchors = [];
    const landmarks = tracker?.bodyLandmarks;
    if (landmarks) {
      const map = CharmTracking.cover(
        tracker.input.width,
        tracker.input.height,
        w,
        height,
      );
      for (const [i, x, y] of bones) {
        const p = landmarks[i];
        if (p && p.visibility > 0.55)
          anchors.push({
            x,
            y,
            target: {
              x: p.x * tracker.input.width * map.scale + map.x,
              y: p.y * tracker.input.height * map.scale + map.y,
            },
          });
      }
    }
    const meshY = [
      0, 45, 85, 110, 125, 140, 150, 160, 170, 185, 200, 210, 220, 235, 255,
      285, 330, 400, 480, 560, 650, 740, 830, 930, 1030, 1130, 1240, 1360, 1450,
      1536,
    ];
    const meshX = Array.from({ length: 25 }, (_, i) => (1024 * i) / 24);
    function mapped(x, y) {
      let deformY = y,
        deformX = x;
      if (y > 110 && y < 195 && x > 420 && x < 610) {
        const side = x < 512 ? "L" : "R",
          ey = 157;
        const weight = Math.exp(
          -Math.pow((x - (side === "L" ? 468 : 560)) / 38, 2),
        );
        if (y > 140 && y < 178) deformX += (e.gazeX || 0) * 4 * weight;
        if (y > 140 && y < 178)
          deformY += (ey - y) * (e["blink" + side] || 0) * weight;
        if (y <= 140) deformY -= (e["brow" + side] || 0) * 9 * weight;
      }
      if (y > 200 && y < 235 && x > 475 && x < 550)
        deformY -= (e.smile || 0) * Math.abs(x - 512) * 0.14;
      let base = rigid(deformX, deformY);
      if (y < 285 || !anchors.length) return base;
      let sum = 0,
        dx = 0,
        dy = 0;
      for (const a of anchors) {
        const weight =
          1 / Math.pow(Math.max(45, Math.hypot(x - a.x, y - a.y)), 3);
        const origin = rigid(a.x, a.y);
        sum += weight;
        dx += (a.target.x - origin.x) * weight;
        dy += (a.target.y - origin.y) * weight;
      }
      const blend = Math.min(1, (y - 285) / 115);
      base.x += (dx / sum) * blend;
      base.y += (dy / sum) * blend;
      return base;
    }
    const points = meshY.map((y) =>
      meshX.map((x) => ({ source: { x, y }, target: mapped(x, y) })),
    );
    for (let row = 0; row < meshY.length - 1; row++)
      for (let col = 0; col < meshX.length - 1; col++) {
        const a = points[row][col],
          b = points[row][col + 1],
          c = points[row + 1][col],
          d = points[row + 1][col + 1];
        triangle(g, a.source, b.source, c.source, a.target, b.target, c.target);
        triangle(g, b.source, d.source, c.source, b.target, d.target, c.target);
      }
    // Animated speech interior stays inside the generated black lip silhouette.
    if ((e.jaw || 0) > 0.12) {
      g.save();
      g.translate(h.x, h.y);
      g.rotate(h.roll);
      g.scale(sx, sy);
      const jaw = e.jaw,
        smile = e.smile || 0;
      g.fillStyle = "#120d19";
      g.beginPath();
      g.ellipse(2, 48, 17 + smile * 4, 3 + jaw * 13, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#f9f2ee";
      g.fillRect(-10, 45, 25, 3 + smile * 2);
      g.restore();
    }
  }
  return { draw, art, presets, expression };
})();
