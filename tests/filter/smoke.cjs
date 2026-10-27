const assert = require("node:assert/strict");
const { chromium } = require("playwright-core");
(async () => {
  const args = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--enable-unsafe-swiftshader",
    "--use-fake-device-for-media-stream",
  ];
  if (process.env.CAMERA_FIXTURE)
    args.push(
      "--use-file-for-fake-video-capture=" + process.env.CAMERA_FIXTURE,
    );
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args,
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ["camera"],
      acceptDownloads: true,
    });
    const p = await context.newPage(),
      errors = [],
      remote = [];
    p.on("pageerror", (e) => errors.push(e.message));
    const base = process.env.APP_URL || "http://127.0.0.1:8010/";
    await p.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith("http") && (!u.startsWith("http://127.0.0.1:8010/") || (process.env.STANDALONE === "1" && !u.startsWith(base)))) {
        remote.push(u);
        return route.abort();
      }
      return route.continue();
    });
    await p.goto(base + "?test");
    await p.waitForFunction(() => window.CharmTest);
    assert.equal(
      await p.locator("#state-text").textContent(),
      "ANIMATED PREVIEW",
    );
    assert.equal(await p.evaluate(() => CharmTest.state.stream), null);
    console.log(
      "PASS: clearly labeled preview, no camera activated before user input",
    );
    await p.click("#start");
    await p.waitForFunction(() => CharmTest.state.phase === "live", null, {
      timeout: 120000,
    });
    await p.waitForFunction(
      () => CharmTest.state.tracker.latest && CharmTest.state.tracker.hasMask,
      null,
      { timeout: 60000 },
    );
    assert.equal(
      await p.evaluate(
        () => CharmTest.state.stream.getVideoTracks()[0].readyState,
      ),
      "live",
    );
    assert.ok(await p.evaluate(() => !!CharmTest.renderer.toon.gl));
    await p.waitForFunction(() => CharmTest.state.tracker.bodyLandmarks?.length === 33, null, {timeout:60000});
    const puppet = await p.evaluate(async () => {
      await CharmPuppet.art.decode();
      const counts={};for(const pose of CharmPuppet.presets) counts[pose.group]=(counts[pose.group]||0)+1;
      const c=document.createElement('canvas');c.width=360;c.height=640;const g=c.getContext('2d');
      const h={x:180,y:95,sx:35,sy:35,roll:0,yaw:0,expression:{jaw:0,smile:0,blinkL:0,blinkR:0}};
      const frames=['neutral-1','joy-10','anger-10'].map(id=>{g.clearRect(0,0,360,640);CharmPuppet.draw(g,h,null,360,640,id);return c.toDataURL();});
      return {counts,distinct:new Set(frames).size,loaded:CharmPuppet.art.naturalWidth};
    });
    assert.equal(puppet.loaded,1024);
    assert.equal(Object.keys(puppet.counts).length,8);
    assert.ok(Object.values(puppet.counts).every(n=>n===10));
    assert.equal(puppet.distinct,3);
    console.log('PASS: real body-pose inference, generated artwork loaded, 80 expression poses, and distinct rendered expressions');
    console.log(
      "PASS: real MediaPipe face landmarks and body segmentation on the camera fixture; GPU body shader active",
    );
    const expressions = await p.evaluate(() => {
      const t = CharmTest.state.tracker,
        original = t.landmarks.map((v) => ({ ...v })),
        before = CharmTracking.measure(original, t.input.width, t.input.height),
        changed = original.map((v) => ({ ...v }));
      changed[159] = { ...changed[145] };
      changed[13].y -= 0.035;
      changed[14].y += 0.035;
      const after = CharmTracking.measure(
        changed,
        t.input.width,
        t.input.height,
      );
      const moved = CharmTracking.measure(
        original.map((v) => ({ ...v, x: v.x + 0.04, y: v.y + 0.03 })),
        t.input.width,
        t.input.height,
      );
      return {
        before: before.expression,
        after: after.expression,
        dx: moved.x - before.x,
        dy: moved.y - before.y,
        width: t.input.width,
        height: t.input.height,
      };
    });
    assert.ok(expressions.after.blinkL > 0.95);
    assert.ok(expressions.after.jaw > expressions.before.jaw + 0.2);
    assert.ok(
      Math.abs(expressions.dx - expressions.width * 0.04) < 0.001 &&
        Math.abs(expressions.dy - expressions.height * 0.03) < 0.001,
    );
    console.log(
      "PASS: blink, mouth opening and movement change the measured rig controls",
    );
    // The violet irises must actually be painted inside the eye clipping paths.
    const iris = await p.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = c.height = 500;
      const g = c.getContext("2d");
      CharmCharacter.head(
        g,
        { x: 250, y: 240, sx: 130, sy: 130, roll: 0, yaw: 0 },
        {},
        0,
      );
      const d = g.getImageData(280, 198, 45, 35).data;
      let count = 0;
      for (let i = 0; i < d.length; i += 4)
        if (d[i] > 70 && d[i] < 130 && d[i + 1] < 80 && d[i + 2] > 130) count++;
      return count;
    });
    assert.ok(iris > 100);
    console.log(
      "PASS: warm violet irises render inside the eye masks",
    );
    await p.click("#shutter");
    await p.waitForSelector("#capture-dialog[open]");
    const image = p.locator("#capture-preview img");
    await image.evaluate((img) => img.decode());
    assert.deepEqual(
      await image.evaluate((img) => [img.naturalWidth, img.naturalHeight]),
      [720, 1280],
    );
    const downloadPromise = p.waitForEvent("download");
    await p.click("#save");
    const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /^toon-camera-.*\.png$/);
    await p.click("#retake");
    console.log(
      "PASS: photo contains the actual composited 720×1280 output and downloads as PNG",
    );
    await p.click('[data-framing="wide"]');
    assert.deepEqual(
      await p.evaluate(() => [
        CharmTest.renderer.canvas.width,
        CharmTest.renderer.canvas.height,
      ]),
      [1280, 720],
    );
    await p.click('[data-framing="portrait"]');
    await p.click("#video-mode");
    await p.click("#shutter");
    await p.waitForFunction(() => CharmTest.state.recording);
    assert.ok(await p.locator('[data-framing="wide"]').isDisabled());
    await p.waitForFunction(
      () => performance.now() - CharmTest.state.recordStart > 1300,
    );
    await p.click("#shutter");
    await p.waitForSelector("#capture-dialog[open]");
    const capture = await p.evaluate(() => ({
      bytes: CharmTest.state.capture.blob.size,
      type: CharmTest.state.capture.blob.type,
      ext: CharmTest.state.capture.ext,
    }));
    assert.ok(capture.bytes > 1000);
    assert.ok(capture.type.startsWith("video/"));
    await p.locator("#capture-preview video").evaluate(
      (video) =>
        new Promise((resolve, reject) => {
          if (video.readyState >= 1) return resolve();
          video.onloadedmetadata = resolve;
          video.onerror = reject;
        }),
    );
    assert.ok(
      await p
        .locator("#capture-preview video")
        .evaluate((v) => v.videoWidth > 0),
    );
    await p.click("#retake");
    console.log(
      "PASS: video records the filter, produces a playable clip, and locks framing while recording",
    );
    await p.click("#mirror");
    assert.equal(
      await p.evaluate(() => CharmTest.renderer.settings.mirror),
      false,
    );
    await p.locator("#toon-amount").evaluate((el) => {
      el.value = "40";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    assert.equal(
      await p.evaluate(() => CharmTest.renderer.settings.amount),
      0.4,
    );
    await p.click("#full-body");
    await p.click("#collar");
    assert.equal(
      await p.evaluate(() => CharmTest.renderer.settings.collar),
      false,
    );
    await p.evaluate(
      () => (window.oldTrack = CharmTest.state.stream.getVideoTracks()[0]),
    );
    await p.click("#stop-camera");
    await p.waitForFunction(() => CharmTest.state.phase === "preview");
    assert.equal(await p.evaluate(() => oldTrack.readyState), "ended");
    assert.equal(
      await p.evaluate(() => CharmTest.state.tracker.running),
      false,
    );
    console.log(
      "PASS: settings affect rendering and camera-off releases the actual camera track",
    );
    await p.setViewportSize({ width: 390, height: 844 });
    assert.ok(
      await p.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await p.click("#settings-open");
    assert.ok(await p.locator("#settings-panel").isVisible());
    await p.click("#settings-close");
    assert.ok(!(await p.locator("#settings-panel").isVisible()));
    console.log(
      "PASS: mobile viewport fits without overflow; settings sheet opens and closes",
    );
    assert.deepEqual(remote, []);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: all tracking assets local; no external requests and no browser runtime errors",
    );
    if (!base.startsWith("file:")) {
      const denied = await context.newPage();
      await denied.addInitScript(() => {
        navigator.mediaDevices.getUserMedia = async () => {
          throw new DOMException("Denied", "NotAllowedError");
        };
      });
      await denied.goto("http://127.0.0.1:8010/?test");
      await denied.click("#start");
      await denied.waitForFunction(
        () =>
          document.querySelector("#start-label").textContent ===
          "Try camera again",
      );
      assert.match(
        await denied.locator("#tracking-hint").textContent(),
        /blocked/,
      );
      assert.equal(await denied.evaluate(() => CharmTest.state.stream), null);
      assert.ok(!(await denied.locator("#start").isDisabled()));
      console.log(
        "PASS: denied camera permission leaves a clear, retryable state",
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
