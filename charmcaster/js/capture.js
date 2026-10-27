// Snaps and clips of the filtered canvas, with a preview sheet to save or share.

function pickMime() {
  if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
  const options = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export class Capture {
  constructor(canvas, getStream) {
    this.canvas = canvas;
    this.getStream = getStream;
    this.sheet = document.getElementById('preview');
    this.media = document.getElementById('pv-media');
    this.btnSave = document.getElementById('pv-save');
    this.btnShare = document.getElementById('pv-share');
    document.getElementById('pv-close').addEventListener('click', () => this.close());
    this.btnSave.addEventListener('click', () => this.save());
    this.btnShare.addEventListener('click', () => this.share());
    this.rec = null;
    this.current = null;
  }

  photo() {
    this.canvas.toBlob((blob) => blob && this.show(blob, 'jpg'), 'image/jpeg', 0.92);
  }

  async startVideo(onProgress, maxMs, onAutoStop) {
    if (!window.MediaRecorder || !this.canvas.captureStream) {
      this.note('Video recording is not supported in this browser — tap for photos.');
      return false;
    }
    const canvasStream = this.canvas.captureStream(30);
    const stream = new MediaStream(canvasStream.getVideoTracks());
    const cam = this.getStream();
    const mic = cam && cam.getAudioTracks()[0];
    if (mic && mic.readyState === 'live') stream.addTrack(mic);
    const mime = pickMime();
    let rec;
    try {
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    } catch (e) {
      canvasStream.getTracks().forEach((t) => t.stop());
      this.note('Could not start recording on this device.');
      return false;
    }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      canvasStream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunks, { type });
      if (blob.size) this.show(blob, type.includes('mp4') ? 'mp4' : 'webm');
    };
    rec.start(250);
    this.rec = rec;
    const t0 = performance.now();
    const tick = () => {
      if (rec.state !== 'recording') return;
      const p = (performance.now() - t0) / maxMs;
      onProgress(Math.min(1, p));
      if (p >= 1) { this.stopVideo(); onAutoStop(); return; }
      requestAnimationFrame(tick);
    };
    tick();
    return true;
  }

  stopVideo() {
    if (this.rec && this.rec.state === 'recording') this.rec.stop();
    this.rec = null;
  }

  show(blob, ext) {
    this.close();
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    this.current = { blob, url, name: `charmcaster-${stamp}.${ext}` };
    let el;
    if (ext === 'jpg') {
      el = new Image();
      el.alt = 'Your Charmcaster snap';
    } else {
      el = document.createElement('video');
      el.loop = true;
      el.playsInline = true;
      el.controls = false;
      el.autoplay = true;
    }
    el.src = url;
    this.media.appendChild(el);
    if (el.play) el.play().catch(() => {});
    const file = new File([blob], this.current.name, { type: blob.type });
    this.btnShare.hidden = !(navigator.canShare && navigator.canShare({ files: [file] }));
    this.sheet.hidden = false;
  }

  close() {
    this.sheet.hidden = true;
    this.media.replaceChildren();
    if (this.current) URL.revokeObjectURL(this.current.url);
    this.current = null;
  }

  save() {
    if (!this.current) return;
    const a = document.createElement('a');
    a.href = this.current.url;
    a.download = this.current.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async share() {
    if (!this.current) return;
    const file = new File([this.current.blob], this.current.name, { type: this.current.blob.type });
    try {
      await navigator.share({ files: [file], title: 'Charmcaster' });
    } catch (e) {
      if (e.name !== 'AbortError') this.save();
    }
  }

  note(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 2600);
  }
}
