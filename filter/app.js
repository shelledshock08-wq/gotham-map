"use strict";
(() => {
  const $ = (id) => document.getElementById(id),
    video = $("camera"),
    canvas = $("output");
  const renderer = new CharmRender.Renderer(canvas);
  const state = {
    phase: "preview",
    mode: "photo",
    facing: "user",
    stream: null,
    tracker: null,
    recorder: null,
    recording: false,
    capture: null,
    starting: false,
    stopping: false,
    mic: null,
  };
  const blobs = new Map();
  function asset(path) {
    if (window.CHARM_PACKED_ASSETS) {
      if (!blobs.has(path)) {
        const item = CHARM_PACKED_ASSETS[path];
        if (!item) throw Error("Missing bundled model: " + path);
        const bytes = Uint8Array.from(atob(item.data), (c) => c.charCodeAt(0));
        blobs.set(
          path,
          URL.createObjectURL(new Blob([bytes], { type: item.type })),
        );
      }
      return blobs.get(path);
    }
    return new URL("filter/vendor/" + path, document.baseURI).href;
  }
  let toastTimer;
  function toast(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 4500);
  }
  function status(text, type = "") {
    $("state-text").textContent = text;
    $("state-pill").className = "pill " + type;
  }
  function setError(error) {
    const names = {
      NotAllowedError:
        "Camera access was blocked. Allow camera access in your browser’s site settings, then try again.",
      PermissionDeniedError:
        "Allow camera access in your browser, then try again.",
      NotFoundError:
        "No camera was found. Connect or enable your device’s camera and try again.",
      NotReadableError:
        "Your camera is busy. Close other apps using it, then try again.",
      OverconstrainedError:
        "This camera cannot use the requested settings. Try a different camera.",
    };
    const text =
      names[error?.name] ||
      error?.message ||
      "The camera could not start. Please try again.";
    status("CAMERA OFF");
    $("start-label").textContent = "Try camera again";
    $("tracking-hint").hidden = false;
    $("tracking-hint").textContent = text;
    toast(text);
  }
  async function cameraStream() {
    if (!window.isSecureContext)
      throw Error(
        "Camera access requires HTTPS. Open the secure hosted app, or use localhost for development.",
      );
    if (!navigator.mediaDevices?.getUserMedia)
      throw Error(
        "This browser cannot access a camera here. Try a current browser on HTTPS.",
      );
    return navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: state.facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30, max: 30 },
      },
      audio: false,
    });
  }
  async function attach(stream) {
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    if (!video.videoWidth)
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () =>
            reject(Error("The camera did not deliver an image. Try again.")),
          10000,
        );
        video.addEventListener(
          "loadeddata",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
  }
  async function start() {
    if (state.starting || state.stopping || state.phase === "live") return;
    state.starting = true;
    state.cancelStart = false;
    state.phase = "loading";
    document.body.classList.add("loading");
    $("start").disabled = true;
    $("start-label").textContent = "Opening camera…";
    $("tracking-hint").hidden = true;
    status("STARTING CAMERA", "loading");
    try {
      if (location.protocol === "file:" && !window.CHARM_PACKED_ASSETS)
        throw Error(
          "This source page needs a web server. Open Toon-Camera.html or index.html from the updated download, which includes the tracking models.",
        );
      await attach(await cameraStream());
      if (state.cancelStart || document.hidden)
        throw Error(
          "Camera start was cancelled. Return to the app and try again.",
        );
      if (!state.tracker) {
        state.tracker = new CharmTracking.Tracker(asset, (message, error) => {
          if (error) {
            toast(message);
            $("tracking-hint").textContent = message;
            $("tracking-hint").hidden = false;
            status("TRACKING PAUSED");
          } else {
            $("start-label").textContent = message;
            status("LOADING LENS", "loading");
          }
        });
        await state.tracker.init();
      }
      if (state.cancelStart || document.hidden)
        throw Error(
          "Camera start was cancelled. Return to the app and try again.",
        );
      await CharmPuppet.art.decode();
      state.tracker.start(video);
      state.phase = "live";
      renderer.head = null;
      $("start-card").hidden = true;
      $("capture-controls").hidden = false;
      $("flip").disabled = false;
      $("tracking-hint").textContent = "Look toward the camera";
      $("tracking-hint").hidden = false;
      document.body.classList.add("live");
      status("FINDING YOUR FACE");
    } catch (error) {
      state.stream?.getTracks().forEach((t) => t.stop());
      state.stream = null;
      video.srcObject = null;
      if (state.tracker) {
        try {
          await state.tracker.close();
        } catch {}
        state.tracker = null;
      }
      state.phase = "preview";
      setError(error);
    } finally {
      state.starting = false;
      $("start").disabled = false;
      document.body.classList.remove("loading");
    }
  }
  async function stop() {
    if (state.stopping) return;
    state.stopping = true;
    if (state.recording) await stopRecording();
    await state.tracker?.stop();
    state.stream?.getTracks().forEach((t) => t.stop());
    state.stream = null;
    video.srcObject = null;
    state.phase = "preview";
    renderer.head = null;
    $("start-card").hidden = false;
    $("capture-controls").hidden = true;
    $("flip").disabled = true;
    $("tracking-hint").hidden = true;
    $("start-label").textContent = "Enable camera";
    document.body.classList.remove("live");
    status("ANIMATED PREVIEW");
    state.stopping = false;
  }
  async function flip() {
    if (state.phase !== "live" || state.recording) return;
    const previous = state.facing;
    state.facing = previous === "user" ? "environment" : "user";
    $("flip").disabled = true;
    await state.tracker.stop();
    state.stream?.getTracks().forEach((t) => t.stop());
    try {
      await attach(await cameraStream());
      await CharmPuppet.art.decode();
      state.tracker.start(video);
      renderer.head = null;
      toast(state.facing === "user" ? "Front camera" : "Back camera");
    } catch (error) {
      state.facing = previous;
      try {
        await attach(await cameraStream());
        await CharmPuppet.art.decode();
        state.tracker.start(video);
        toast("That camera is unavailable. Using the previous camera.");
      } catch {
        await stop();
        setError(error);
      }
    } finally {
      $("flip").disabled = state.phase !== "live";
    }
  }
  function setMode(mode) {
    if (state.recording) return;
    state.mode = mode;
    for (const m of ["photo", "video"]) {
      $(m + "-mode").classList.toggle("selected", m === mode);
      $(m + "-mode").setAttribute("aria-pressed", m === mode);
    }
    $("shutter").classList.toggle("video", mode === "video");
    $("shutter").setAttribute(
      "aria-label",
      mode === "video" ? "Start recording" : "Take photo",
    );
    $("capture-tip").textContent =
      mode === "video" ? "TAP TO RECORD · UP TO 60s" : "TAP TO CAPTURE";
  }
  async function photo() {
    if (state.phase !== "live") return;
    const blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (!blob) {
      toast("Photo capture failed. Please try again.");
      return;
    }
    $("capture-flash").classList.remove("flash");
    void $("capture-flash").offsetWidth;
    $("capture-flash").classList.add("flash");
    setCapture(blob, "png");
  }
  function setCapture(blob, ext) {
    if (state.capture) URL.revokeObjectURL(state.capture.url);
    state.capture = {
      blob,
      ext,
      url: URL.createObjectURL(blob),
      name:
        "toon-camera-" +
        new Date().toISOString().replace(/[:.]/g, "-") +
        "." +
        ext,
    };
    $("gallery").disabled = false;
    showCapture();
  }
  function showCapture() {
    const c = state.capture;
    if (!c) return;
    const preview = $("capture-preview");
    preview.replaceChildren();
    const media = document.createElement(c.ext === "png" ? "img" : "video");
    media.src = c.url;
    if (c.ext === "png") media.alt = "Your Charmcaster Camera photo";
    else {
      media.controls = true;
      media.playsInline = true;
      media.loop = true;
    }
    preview.append(media);
    $("capture-title").textContent =
      c.ext === "png" ? "Looking enchanting." : "Magic in motion.";
    $("share").hidden = !navigator.share;
    if (!$("capture-dialog").open) $("capture-dialog").showModal();
  }
  function closeCapture() {
    $("capture-preview").querySelector("video")?.pause();
    $("capture-dialog").close();
  }
  async function startRecording() {
    if (state.phase !== "live" || state.recording || state.preparingRecord)
      return;
    if (!window.MediaRecorder || !canvas.captureStream) {
      toast(
        "This browser supports photos but not video recording. Try current Chrome, Edge or Safari.",
      );
      return;
    }
    try {
      state.preparingRecord = true;
      $("shutter").disabled = true;
      if ($("microphone").checked) {
        try {
          state.mic = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false,
          });
        } catch {
          toast("Microphone unavailable. Recording without sound.");
        }
      }
      if (state.phase !== "live") {
        state.mic?.getTracks().forEach((t) => t.stop());
        state.mic = null;
        return;
      }
      const stream = canvas.captureStream(30);
      if (state.mic)
        for (const track of state.mic.getAudioTracks()) stream.addTrack(track);
      const mime = [
        "video/mp4;codecs=avc1.42E01E",
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
      ].find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(
          stream,
          mime
            ? { mimeType: mime, videoBitsPerSecond: 5000000 }
            : { videoBitsPerSecond: 5000000 },
        ),
        chunks = [];
      state.recorder = recorder;
      state.recording = true;
      state.recordStart = performance.now();
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      state.recordFinished = new Promise((resolve) => {
        recorder.onstop = () => {
          clearTimeout(state.recordLimit);
          stream.getTracks().forEach((t) => t.stop());
          state.mic?.getTracks().forEach((t) => t.stop());
          state.mic = null;
          state.recording = false;
          state.recorder = null;
          recordUI(false);
          const type = recorder.mimeType || mime || "video/webm";
          if (chunks.length)
            setCapture(
              new Blob(chunks, { type }),
              type.includes("mp4") ? "mp4" : "webm",
            );
          else toast("No video was recorded. Please try again.");
          resolve();
        };
      });
      recorder.onerror = () => {
        toast("Recording failed. Your camera preview is still available.");
        if (recorder.state !== "inactive") recorder.stop();
      };
      recorder.start(200);
      recordUI(true);
      state.recordLimit = setTimeout(() => stopRecording(), 60000);
    } catch (error) {
      state.recording = false;
      state.mic?.getTracks().forEach((t) => t.stop());
      state.mic = null;
      recordUI(false);
      toast("Video recording could not start: " + error.message);
    } finally {
      state.preparingRecord = false;
      $("shutter").disabled = false;
    }
  }
  function recordUI(recording) {
    $("shutter").classList.toggle("recording", recording);
    $("shutter").setAttribute(
      "aria-label",
      recording
        ? "Stop recording"
        : state.mode === "video"
          ? "Start recording"
          : "Take photo",
    );
    $("record-timer").hidden = !recording;
    $("flip").disabled = recording || state.phase !== "live";
    $("photo-mode").disabled = $("video-mode").disabled = recording;
    document
      .querySelectorAll("[data-framing]")
      .forEach((b) => (b.disabled = recording));
    $("capture-tip").textContent = recording
      ? "TAP TO STOP"
      : state.mode === "video"
        ? "TAP TO RECORD · UP TO 60s"
        : "TAP TO CAPTURE";
  }
  async function stopRecording() {
    if (!state.recorder) return;
    const finished = state.recordFinished;
    if (state.recorder.state !== "inactive") state.recorder.stop();
    await finished;
  }
  $("start").onclick = start;
  $("stop-camera").onclick = stop;
  $("flip").onclick = flip;
  $("photo-mode").onclick = () => setMode("photo");
  $("video-mode").onclick = () => setMode("video");
  $("shutter").onclick = () =>
    state.recording
      ? stopRecording()
      : state.mode === "video"
        ? startRecording()
        : photo();
  $("mirror").onclick = () => {
    renderer.settings.mirror = !renderer.settings.mirror;
    $("mirror").classList.toggle("active", renderer.settings.mirror);
    $("mirror").setAttribute("aria-pressed", renderer.settings.mirror);
  };
  $("toon-amount").oninput = (e) => {
    renderer.settings.amount = Number(e.target.value) / 100;
    $("toon-value").textContent = e.target.value + "%";
  };
  $("full-body").onchange = (e) => {
    renderer.settings.fullBody = e.target.checked;
    $("toon-amount").disabled = e.target.checked;
    $("collar").disabled = e.target.checked;
  };
  $("toon-amount").disabled = true;
  $("collar").disabled = true;
  for (const group of [...new Set(CharmPuppet.presets.map((p) => p.group))]) {
    const element = document.createElement("optgroup");
    element.label = group;
    for (const preset of CharmPuppet.presets.filter((p) => p.group === group)) {
      const option = document.createElement("option");
      option.value = preset.id;
      option.textContent = group + " · " + preset.variation;
      element.append(option);
    }
    $("expression-pose").append(element);
  }
  $("expression-pose").onchange = (e) =>
    (renderer.settings.expression = e.target.value);
  for (const key of ["collar", "sparks"])
    $(key).onchange = (e) => (renderer.settings[key] = e.target.checked);
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    $("sparks").checked = false;
    renderer.settings.sparks = false;
  }
  document.querySelectorAll("[data-backdrop]").forEach(
    (button) =>
      (button.onclick = () => {
        renderer.settings.background = button.dataset.backdrop;
        document.querySelectorAll("[data-backdrop]").forEach((b) => {
          const selected = b === button;
          b.classList.toggle("chosen", selected);
          b.setAttribute("aria-pressed", selected);
        });
      }),
  );
  document.querySelectorAll("[data-framing]").forEach(
    (button) =>
      (button.onclick = () => {
        if (state.recording) return;
        renderer.settings.framing = button.dataset.framing;
        renderer.head = null;
        renderer.resize();
        document
          .querySelector(".viewfinder")
          .classList.toggle("wide", button.dataset.framing === "wide");
        document.querySelectorAll("[data-framing]").forEach((b) => {
          const selected = b === button;
          b.classList.toggle("chosen", selected);
          b.setAttribute("aria-pressed", selected);
        });
      }),
  );
  $("settings-open").onclick = () =>
    $("settings-panel").classList.toggle("open");
  $("settings-close").onclick = () =>
    $("settings-panel").classList.remove("open");
  $("help").onclick = () => $("help-dialog").showModal();
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
  $("gallery").onclick = showCapture;
  $("retake").onclick = $("capture-close").onclick = closeCapture;
  $("save").onclick = () => {
    if (!state.capture) return;
    const a = document.createElement("a");
    a.href = state.capture.url;
    a.download = state.capture.name;
    a.click();
    toast("Capture ready to save.");
  };
  $("share").onclick = async () => {
    if (!state.capture) return;
    const c = state.capture,
      file = new File([c.blob], c.name, { type: c.blob.type });
    try {
      if (navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: "Charmcaster Camera" });
      else toast("File sharing is unavailable here. Use Save instead.");
    } catch (e) {
      if (e.name !== "AbortError") toast("Sharing failed. Use Save instead.");
    }
  };
  document.addEventListener("keydown", (e) => {
    if (
      e.code === "Space" &&
      state.phase === "live" &&
      !document.querySelector("dialog[open]") &&
      !["INPUT", "BUTTON", "VIDEO"].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      $("shutter").click();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.starting) {
      state.cancelStart = true;
      state.stream?.getTracks().forEach((t) => t.stop());
    }
    if (document.hidden && state.phase === "live") {
      stop();
      toast("Camera paused while the app was hidden.");
    }
  });
  window.addEventListener("pagehide", () => {
    state.stream?.getTracks().forEach((t) => t.stop());
    state.mic?.getTracks().forEach((t) => t.stop());
    state.tracker?.stop();
  });
  let last = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 30) return;
    last = now;
    const live = state.phase === "live";
    const tracked = renderer.draw(video, state.tracker, now, !live);
    if (live && !state.tracker.failed) {
      const seen = state.tracker.latest && now - state.tracker.lastSeen < 350;
      status(
        seen ? "FACE TRACKED" : "FINDING YOUR FACE",
        seen ? "tracked" : "",
      );
      $("tracking-hint").hidden = !!seen;
      $("tracking-hint").textContent = "Face the camera · move into the light";
    }
    if (state.recording) {
      const secs = Math.floor((now - state.recordStart) / 1000);
      $("record-timer").textContent =
        "● " +
        String(Math.floor(secs / 60)).padStart(2, "0") +
        ":" +
        String(secs % 60).padStart(2, "0");
    }
  }
  requestAnimationFrame(frame);
  if (new URLSearchParams(location.search).has("test"))
    window.CharmTest = {
      state,
      renderer,
      start,
      stop,
      setMode,
      photo,
      startRecording,
      stopRecording,
      asset,
      closeCapture,
    };
})();
