/* On-device landmark and foreground inference. No frame uploads or remote inference. */
"use strict";
window.CharmTracking = (() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)),
    dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function cover(sw, sh, dw, dh) {
    const scale = Math.max(dw / sw, dh / sh);
    return {
      scale,
      x: (dw - sw * scale) / 2,
      y: (dh - sh * scale) / 2,
      w: sw * scale,
      h: sh * scale,
    };
  }
  function measure(points, width, height) {
    const p = points.map((v) => ({
      x: v.x * width,
      y: v.y * height,
      z: v.z * width,
    }));
    const a = p[234],
      b = p[454],
      top = p[10],
      chin = p[152],
      faceW = dist(a, b),
      faceH = dist(top, chin);
    const roll = Math.atan2(b.y - a.y, b.x - a.x);
    const center = { x: (top.x + chin.x) / 2, y: (top.y + chin.y) / 2 };
    const local = (v) => ({
      x: (v.x - center.x) * Math.cos(roll) + (v.y - center.y) * Math.sin(roll),
      y: -(v.x - center.x) * Math.sin(roll) + (v.y - center.y) * Math.cos(roll),
    });
    const q = p.map(local),
      eyeRatio = (outer, inner, upper, lower) =>
        dist(p[upper], p[lower]) / Math.max(1, dist(p[outer], p[inner]));
    const mouthWidth = dist(p[61], p[291]),
      mouthGap = dist(p[13], p[14]);
    const eyeY1 = (q[33].y + q[133].y) / 2,
      eyeY2 = (q[362].y + q[263].y) / 2;
    const gaze = (iris, l, r) =>
      p[iris]
        ? (q[iris].x - (q[l].x + q[r].x) / 2) / Math.max(1, dist(p[l], p[r]))
        : 0;
    return {
      x: center.x,
      y: center.y,
      sx: Math.max(20, faceW * 0.6),
      sy: Math.max(24, faceH / 2.04),
      roll,
      yaw: clamp(
        ((q[1].x - (q[234].x + q[454].x) / 2) / Math.max(faceW, 1)) * 2.4,
        -0.75,
        0.75,
      ),
      expression: {
        blinkL: 1 - clamp((eyeRatio(33, 133, 159, 145) - 0.055) / 0.2),
        blinkR: 1 - clamp((eyeRatio(362, 263, 386, 374) - 0.055) / 0.2),
        jaw: clamp((mouthGap / Math.max(1, mouthWidth) - 0.025) * 2.05),
        smile: clamp(
          (mouthWidth / Math.max(1, faceW) - 0.35) * 4 +
            (((q[13].y + q[14].y) / 2 - (q[61].y + q[291].y) / 2) /
              Math.max(1, mouthWidth)) *
              3,
        ),
        browL: clamp(((eyeY1 - q[105].y) / faceH - 0.09) * 7, -0.45, 1),
        browR: clamp(((eyeY2 - q[334].y) / faceH - 0.09) * 7, -0.45, 1),
        gazeX: clamp((gaze(468, 33, 133) + gaze(473, 362, 263)) * 2.5, -1, 1),
        gazeY: p[468]
          ? clamp(
              ((q[468].y - eyeY1) / Math.max(1, dist(p[33], p[133]))) * 4,
              -1,
              1,
            )
          : 0,
      },
    };
  }
  class Tracker {
    constructor(asset, onStatus) {
      this.asset = asset;
      this.onStatus = onStatus;
      this.face = null;
      this.segment = null;
      this.latest = null;
      this.lastSeen = 0;
      this.mask = document.createElement("canvas");
      this.mask.width = 640;
      this.mask.height = 480;
      this.maskContext = this.mask.getContext("2d");
      this.input = document.createElement("canvas");
      this.inputContext = this.input.getContext("2d", { alpha: false });
      this.running = false;
      this.busy = false;
      this.count = 0;
      this.fps = 0;
      this.lastResult = 0;
      this.hasMask = false;
      this.failed = false;
      this.pose = null;
      this.bodyLandmarks = null;
    }
    async init() {
      this.onStatus("Loading face tracking…");
      this.face = new FaceMesh({
        locateFile: (f) => this.asset("face_mesh/" + f),
      });
      this.face.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.55,
        minTrackingConfidence: 0.55,
        selfieMode: false,
      });
      this.face.onResults((r) => {
        const now = performance.now();
        this.fps = this.lastResult
          ? this.fps * 0.8 + (1000 / (now - this.lastResult)) * 0.2
          : 0;
        this.lastResult = now;
        if (r.multiFaceLandmarks?.length) {
          this.landmarks = r.multiFaceLandmarks[0];
          this.latest = measure(
            r.multiFaceLandmarks[0],
            this.input.width,
            this.input.height,
          );
          this.lastSeen = now;
        } else {
          this.latest = null;
        }
      });
      await this.face.initialize();
      this.onStatus("Loading body filter…");
      this.segment = new SelfieSegmentation({
        locateFile: (f) => this.asset("selfie_segmentation/" + f),
      });
      this.segment.setOptions({ modelSelection: 1, selfieMode: false });
      this.segment.onResults((r) => {
        this.mask.width = this.input.width;
        this.mask.height = this.input.height;
        this.maskContext.drawImage(
          r.segmentationMask,
          0,
          0,
          this.mask.width,
          this.mask.height,
        );
        this.hasMask = true;
      });
      await this.segment.initialize();
      this.onStatus("Loading body movement…");
      this.pose = new Pose({ locateFile: (f) => this.asset("pose/" + f) });
      this.pose.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      this.pose.onResults((r) => {
        if (!r.poseLandmarks) {
          this.bodyLandmarks = null;
          return;
        }
        const previous = this.bodyLandmarks;
        this.bodyLandmarks = r.poseLandmarks.map((p, i) =>
          previous
            ? {
                ...p,
                x: previous[i].x + (p.x - previous[i].x) * 0.48,
                y: previous[i].y + (p.y - previous[i].y) * 0.48,
              }
            : p,
        );
      });
      await this.pose.initialize();
    }
    start(video) {
      this.video = video;
      this.running = true;
      this.failed = false;
      this.lastSeen = 0;
      this.latest = null;
      this.hasMask = false;
      this.count = 0;
      this.tick();
    }
    async tick() {
      if (!this.running) return;
      const started = performance.now();
      try {
        if (this.video.readyState >= 2 && this.video.videoWidth) {
          const w = Math.min(640, this.video.videoWidth),
            h = Math.round(
              (w * this.video.videoHeight) / this.video.videoWidth,
            );
          if (this.input.width !== w || this.input.height !== h) {
            this.input.width = w;
            this.input.height = h;
          }
          this.inputContext.drawImage(this.video, 0, 0, w, h);
          this.busy = true;
          await this.face.send({ image: this.input });
          if (this.running && this.count % 2 === 0)
            await this.pose.send({ image: this.input });
          if (this.running && this.count++ % 3 === 0)
            await this.segment.send({ image: this.input });
        }
      } catch (e) {
        this.failed = true;
        this.running = false;
        this.onStatus("Tracking stopped. Restart the camera to retry.", e);
      } finally {
        this.busy = false;
      }
      if (this.running)
        this.timer = setTimeout(
          () => this.tick(),
          Math.max(0, 50 - (performance.now() - started)),
        );
    }
    async stop() {
      this.running = false;
      clearTimeout(this.timer);
      while (this.busy) await new Promise((r) => setTimeout(r, 20));
      this.latest = null;
      this.hasMask = false;
    }
    async close() {
      await this.stop();
      await this.face?.close();
      await this.segment?.close();
      await this.pose?.close();
    }
  }
  return { Tracker, measure, cover, clamp };
})();
