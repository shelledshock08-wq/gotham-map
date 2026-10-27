/* Charmcaster, Ben 10: Omniverse. Original vector rig based on the user's references.
   Artwork is drawn in head coordinates; expressions are continuous, not sprite swaps. */
"use strict";
window.CharmCharacter = (() => {
  const ink = "#100e18",
    skin = "#d7999f",
    shade = "#ab6c87",
    white = "#f6f9f7",
    ice = "#c9dce4",
    purple = "#a06bc7",
    deep = "#68368c";
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  function path(g, d, fill, stroke = ink, width = 0.035) {
    const p = new Path2D(d);
    if (fill) {
      g.fillStyle = fill;
      g.fill(p);
    }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = width;
      g.lineJoin = "round";
      g.lineCap = "round";
      g.stroke(p);
    }
  }
  function transform(g, h) {
    g.translate(h.x, h.y);
    g.rotate(h.roll || 0);
    g.scale(h.sx, h.sy);
  }
  function back(g, h, t = 0) {
    g.save();
    transform(g, h);
    const sway = Math.sin(t * 1.8) * 0.045 + (h.yaw || 0) * 0.12;
    g.translate(sway, 0);
    // Her long white mane, with a pointed lilac underside, sits behind the shoulders.
    path(
      g,
      "M -.83 -.55 Q -.95 -1.5 .12 -1.67 Q 1.1 -1.6 1.03 -.45 C .91 .65 1.42 1.55 1.77 2.26 Q 2.2 3.13 1.77 4.06 L 1.65 3.65 L 1.26 4.47 Q 1.3 3.72 .72 3.17 Q .26 2.82 -.25 2.61 Q -.95 2.1 -.75 1.16 Z",
      ice,
      ink,
      0.045,
    );
    path(
      g,
      "M 1.36 2.54 L 1.63 2.94 L 1.69 2.51 Q 2.12 3.22 1.77 4.06 L 1.65 3.65 L 1.26 4.47 Q 1.3 3.72 .72 3.17 Q .48 3.01 .27 2.89 L .38 2.32 L .69 2.8 L .76 2.49 L 1.04 3.03 L 1.08 2.73 Z",
      purple,
      null,
    );
    g.restore();
  }
  function collar(g, h) {
    g.save();
    transform(g, h);
    // Neck, black undersuit, flared magenta collar, and the gold-framed mana gem.
    path(g, "M -.28 .77 L -.26 1.55 L .35 1.56 L .39 .72 Z", skin);
    path(g, "M -.25 1.19 L .36 1.05 L .36 1.57 L -.26 1.57 Z", shade, null);
    path(
      g,
      "M -.3 1.32 L .39 1.3 L .47 1.94 L .06 2.33 L -.44 1.91 Z",
      "#140f1d",
    );
    path(
      g,
      "M -.29 1.62 L -.66 1.14 L -1.13 1.31 L -.71 1.63 L -.52 2.06 L .01 2.32 L -.09 1.86 Z",
      "#77105c",
      ink,
      0.045,
    );
    path(
      g,
      "M .34 1.53 L .91 .94 L 1.28 .86 L 1.05 1.6 L .48 2.15 L .08 2.34 L .31 1.8 Z",
      "#850c64",
      ink,
      0.045,
    );
    path(g, "M 1.16 1.01 L .93 1.5 L .36 2.06 L .63 1.63 Z", "#430b44", null);
    path(
      g,
      "M -.99 1.33 L -.61 1.38 L -.38 1.91 L -.67 1.59 Z",
      "#b83b98",
      null,
    );
    path(
      g,
      "M .06 1.97 Q .31 2.08 .34 2.24 Q .22 2.48 .04 2.53 Q -.15 2.37 -.16 2.21 Q -.08 2.05 .06 1.97 Z",
      "#d8b444",
      ink,
      0.035,
    );
    path(
      g,
      "M .06 2.07 Q .23 2.16 .23 2.26 Q .15 2.39 .04 2.42 Q -.06 2.31 -.06 2.22 Z",
      "#b620ae",
      null,
    );
    g.fillStyle = "#ee91ef";
    g.beginPath();
    g.ellipse(0.065, 2.17, 0.042, 0.062, -0.3, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  function eye(g, side, e, yaw) {
    const blink = side < 0 ? e.blinkL : e.blinkR,
      open = clamp(1 - blink),
      brow = side < 0 ? e.browL : e.browR;
    const x = side * 0.39 + yaw * 0.045,
      y = -0.19,
      scale = side * yaw > 0 ? 1 - Math.abs(yaw) * 0.22 : 1;
    g.save();
    g.translate(x, y);
    g.scale(scale, 1);
    const top = -0.15 * open,
      bottom = 0.135 * open;
    if (open < 0.09) {
      path(g, "M -.29 .015 Q -.02 .11 .3 -.035", null, ink, 0.045);
    } else {
      path(
        g,
        `M -.30 .025 Q -.13 ${top - 0.035} .04 ${top} Q .2 ${top + 0.01} .30 -.02 Q .18 ${bottom + 0.045} -.02 ${bottom} Q -.18 ${bottom} -.30 .025 Z`,
        "#e5efda",
        ink,
        0.04,
      );
      g.save();
      const clip = new Path2D(
        `M -.30 .025 Q -.13 ${top - 0.035} .04 ${top} Q .2 ${top + 0.01} .30 -.02 Q .18 ${bottom + 0.045} -.02 ${bottom} Q -.18 ${bottom} -.30 .025 Z`,
      );
      g.clip(clip);
      g.fillStyle = "#6934ad";
      g.beginPath();
      g.ellipse(
        (e.gazeX || 0) * 0.08,
        (e.gazeY || 0) * 0.045 - 0.016,
        0.122,
        0.15,
        0,
        0,
        Math.PI * 2,
      );
      g.fill();
      g.strokeStyle = ink;
      g.lineWidth = 0.025;
      g.stroke();
      g.restore();
      // Omniverse's sharp winged eyeliner; a clear white eye remains when glancing.
      path(
        g,
        side < 0
          ? `M -.3 .025 L -.39 -.065 L -.28 -.04 Q -.08 ${top - 0.08} .17 ${top + 0.015} L .28 -.025 Q -.1 ${top - 0.06} -.3 .025 Z`
          : `M -.3 .025 Q -.07 ${top - 0.08} .17 ${top - 0.02} L .39 -.1 L .3 -.02 Q .08 ${top + 0.015} -.3 .025 Z`,
        ink,
        null,
      );
    }
    g.translate(0, -0.27 - brow * 0.15);
    path(
      g,
      side < 0
        ? "M -.31 .09 Q -.1 -.12 .25 .04 L .24 .09 Q -.05 -.02 -.31 .09 Z"
        : "M -.25 .05 Q .07 -.16 .32 .04 Q .08 -.055 -.25 .11 Z",
      ink,
      null,
    );
    g.restore();
  }
  function head(g, h, expression = {}, t = 0) {
    const e = {
      blinkL: 0,
      blinkR: 0,
      browL: 0,
      browR: 0,
      jaw: 0,
      smile: 0.2,
      gazeX: 0,
      gazeY: 0,
      ...expression,
    };
    const yaw = clamp(h.yaw || 0, -0.8, 0.8),
      jaw = clamp(e.jaw),
      smile = clamp(e.smile),
      chin = 1.02 + jaw * 0.1;
    g.save();
    transform(g, h);
    // Ear and two gold cuffs on her anatomical left, as in the supplied stills.
    path(
      g,
      "M .79 -.39 Q 1.18 -.55 1.16 -.13 Q 1.08 .22 .88 .32 L .79 .02 Z",
      skin,
    );
    path(
      g,
      "M 1.03 -.35 L 1.18 -.39 L 1.20 -.30 L 1.06 -.25 Z",
      "#c8a34b",
      ink,
      0.024,
    );
    path(
      g,
      "M 1.04 -.10 L 1.17 -.10 L 1.17 -.01 L 1.05 -.02 Z",
      "#c8a34b",
      ink,
      0.024,
    );
    // Angular face and asymmetric cel shadow. Contour widens naturally with an open jaw.
    path(
      g,
      `M -.84 -.79 Q -.41 -1.19 .23 -1.08 Q .8 -.97 .91 -.47 L .84 .33 Q .7 .75 .12 ${chin} Q -.05 ${chin + 0.08} -.24 .93 L -.63 .6 Q -.92 .25 -.9 -.18 Z`,
      skin,
      ink,
      0.04,
    );
    path(
      g,
      `M .65 -.84 Q 1.0 -.41 .84 .33 Q .7 .75 .12 ${chin} L .30 .75 Q .67 .37 .65 -.12 Z`,
      shade,
      null,
    );
    eye(g, -1, e, yaw);
    eye(g, 1, e, yaw);
    // Her paired black curled cheek marks are part of the tracked face.
    path(
      g,
      "M -.65 -.01 L -.56 .12 Q -.72 .26 -.59 .36 Q -.51 .41 -.48 .28 L -.54 .21 Q -.55 .32 -.59 .28 Q -.62 .23 -.55 .15 L -.57 -.015 Z",
      ink,
      null,
    );
    path(
      g,
      "M .63 -.015 L .59 .11 Q .75 .26 .64 .35 Q .55 .42 .51 .28 L .56 .2 Q .59 .31 .63 .27 Q .66 .23 .57 .14 L .57 -.02 Z",
      ink,
      null,
    );
    const nose = yaw * 0.3;
    path(
      g,
      `M ${nose - 0.025} .1 Q ${nose + 0.005} .22 ${nose - 0.085} .3 Q ${nose - 0.045} .39 ${nose + 0.065} .40`,
      null,
      ink,
      0.017,
    );
    path(
      g,
      `M ${nose + 0.1} .35 Q ${nose + 0.15} .31 ${nose + 0.19} .33`,
      null,
      ink,
      0.015,
    );
    const mouthX = yaw * 0.11,
      w = 0.24 + smile * 0.055,
      top = 0.57 - smile * 0.055,
      bottom = top + 0.055 + jaw * 0.33 + smile * 0.045;
    g.save();
    g.translate(mouthX, 0);
    path(
      g,
      `M ${-w} ${top + 0.025} Q -.08 ${top - 0.09} .015 ${top - 0.015} Q .12 ${top - 0.055} ${w + 0.035} ${top - 0.065 * smile} Q ${w - 0.025} ${bottom + 0.035} .015 ${bottom + 0.06} Q -.15 ${bottom + 0.08} ${-w} ${top + 0.025} Z`,
      "#09090e",
      null,
    );
    if (jaw > 0.13 || smile > 0.48) {
      path(
        g,
        `M ${-w + 0.065} ${top + 0.035} Q .035 ${top + 0.07} ${w - 0.03} ${top + 0.01} L ${w - 0.07} ${top + 0.075 + Math.min(0.06, jaw * 0.1)} Q .015 ${top + 0.13} ${-w + 0.08} ${top + 0.09} Z`,
        "#eff5e9",
        null,
      );
    }
    if (jaw > 0.45)
      path(
        g,
        `M -.1 ${bottom - 0.015} Q .06 ${bottom - 0.085} .15 ${bottom - 0.025} Q .035 ${bottom + 0.015} -.1 ${bottom - 0.015} Z`,
        "#b24c88",
        null,
      );
    g.restore();
    // White cap and the exact jagged, purple-tipped swept fringe silhouette.
    path(
      g,
      "M -.87 -.29 L -1.22 -.08 Q -.89 -.52 -.93 -.92 Q -.88 -1.38 -.41 -1.58 Q .15 -1.88 .7 -1.5 Q 1.08 -1.27 1.10 -.91 L .99 -.31 L .88 -.29 L .77 -.89 L .42 -1.08 L .08 -.84 L -.2 -.64 L -.57 -.78 Z",
      white,
      ink,
      0.045,
    );
    path(
      g,
      "M .65 -1.55 Q .98 -1.35 1.10 -.91 L .99 -.31 L .88 -.29 L .77 -.89 L .42 -1.08 L .09 -.84 L .2 -1.1 Q .61 -1.29 .65 -1.55 Z",
      ice,
      null,
    );
    path(
      g,
      "M -.81 -.97 L -.66 -1.19 L -.64 -.94 L -.16 -1.31 L -.18 -1.02 L .35 -1.31 L .34 -1.07 L .66 -1.2 Q .37 -.96 .21 -.71 Q .04 -.47 -.16 -.03 L -.23 -.66 Q -.53 -.31 -1.22 -.08 Q -.83 -.48 -.81 -.97 Z",
      purple,
      ink,
      0.026,
    );
    path(
      g,
      "M -.16 -1.31 L -.18 -1.02 Q -.52 -.51 -1.22 -.08 Q -.91 -.17 -.57 -.43 Z",
      deep,
      null,
    );
    path(
      g,
      "M .34 -1.07 L .66 -1.2 Q .27 -.85 -.16 -.03 Q -.06 -.57 .34 -1.07 Z",
      "#8651b1",
      null,
    );
    // White face-framing locks, with distinct saw-tooth purple ends.
    path(
      g,
      "M -.89 -.31 L -.84 .36 Q -.8 .81 -.56 1.34 L -.84 1.15 Q -1.05 .58 -.96 .04 Z",
      white,
      ink,
      0.03,
    );
    path(
      g,
      "M -.96 .3 L -.83 .57 L -.81 .36 L -.7 .7 L -.56 1.34 L -.84 1.15 Q -.99 .8 -.96 .3 Z",
      purple,
      null,
    );
    path(
      g,
      "M .8 -.97 L 1.02 -.85 Q .85 -.28 .98 .31 L 1.06 .89 L .78 1.42 L .66 1.09 L .78 .28 Q .75 -.23 .8 -.97 Z",
      white,
      ink,
      0.03,
    );
    path(
      g,
      "M .98 .31 L 1.06 .89 L .78 1.42 L .66 1.09 L .78 .65 L .83 .88 L .9 .59 L .96 .75 Z",
      purple,
      null,
    );
    g.restore();
  }
  function preview(w, h, t = 0) {
    return {
      x: w * 0.49,
      y: h * 0.34,
      sx: Math.min(w * 0.29, h * 0.18),
      sy: Math.min(w * 0.29, h * 0.18),
      roll: Math.sin(t * 0.55) * 0.045,
      yaw: Math.sin(t * 0.4) * 0.12,
    };
  }
  return {
    back,
    collar,
    head,
    preview,
    palette: { ink, skin, shade, white, ice, purple, deep },
  };
})();
