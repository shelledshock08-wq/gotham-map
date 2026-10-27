# Charmcaster Lens

A live camera filter, like a Snapchat lens, that turns you into **Charmcaster** from *Ben 10: Omniverse*. It runs in your phone's browser, so there is no app to install and no extra hardware or software.

Your face drives hers: blinks, winks, smiles, talking, frowns and brow raises all come through. The head is redrawn as Charmcaster: white hair with purple tips, the curled marks under her eyes, purple eyes with winged liner, black lips, and pointed ears with gold rings. The rest of you gets a cartoon pass that matches: your hair turns white, your clothes become her magenta outfit with the black panel, and you get her collar and gem.

## Use it

1. Open the hosted page on your phone, for example `https://shelledshock08-wq.github.io/gotham-map/charmcaster/` (see [Hosting](#hosting)).
2. Tap **Cast the spell** and allow the camera. Allowing the mic adds sound to your videos.
3. Optional: use **Add to Home Screen** to get a full-screen app icon. After the first load the lens also works offline.

| Do this | What happens |
|---|---|
| Tap the shutter | Takes a photo, then lets you save or share it |
| Hold the shutter | Records video, up to 60 s |
| Swipe left / right | Changes the background: Comic (your room, cartoonized), Lair, Stained glass, Lens off |
| Double-tap the screen | Switches between front and back camera |
| Hold ◐ | Shows you without the lens, to compare |
| Raise both eyebrows | Casts a spell: glowing eyes, a rune circle and sparkles |

On a computer, Space takes a photo and the arrow keys change the background.

It works in current Chrome, Edge, Firefox or Samsung Internet on Android, Safari 15+ on iPhone, and desktop browsers with a webcam. It needs WebGL2. The first launch downloads up to about 30 MB (MediaPipe runtime, 3.7 MB face model, 16 MB body model), and everything is cached after that. The face lens starts first while the body model finishes loading in the background.

## How it works

Everything runs on the device and nothing is uploaded.

- **Tracking:** [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.0.1. The Face Landmarker gives 478 face points and 52 expression blendshapes, for up to 2 faces. The selfie multiclass segmenter splits the frame into hair, skin, clothes and background. Both run on the GPU when possible and fall back to the CPU.
- **Head pose:** a weighted similarity fit (Horn's method) between the rigid points of MediaPipe's canonical face model and the tracked points. Hair and ears are modelled in 3D head space in centimetres and projected with this pose, so they turn with you. Loose hair has spring physics.
- **Face:** a vector puppet drawn with Canvas 2D straight from the landmarks, so expressions are your own. Blink blendshapes force a full close.
- **Body and background:** a WebGL2 shader (bilateral smoothing, cel tones relative to local brightness, ink lines from mask contours and image edges) recolors each body part into her palette. The long hair is tucked behind your shoulders using the body mask.
- **Capture:** photos come from `canvas.toBlob`. Videos use `MediaRecorder` on the canvas stream plus the mic, recording MP4 where supported and WebM otherwise. Saving uses the Web Share API when the phone supports it, and a download otherwise.

| File | Role |
|---|---|
| `js/app.js` | Camera, frame loop, compositing, UI |
| `js/tracker.js` | MediaPipe loading (jsDelivr, falling back to unpkg), smoothing, face slots, masks |
| `js/geom.js` | One Euro filter, pose fit, head-space projection |
| `js/canonical.js` | Rigid points of MediaPipe's canonical face model |
| `js/toon.js` | WebGL cartoon pass and backgrounds |
| `js/charm.js` | The drawn Charmcaster (palette sampled from the show) |
| `js/capture.js` | Photo/video capture, preview, save/share |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable and offline support |

## Hosting

The camera only works over `https://` (or on `localhost`), so a static host is all it needs. With GitHub Pages:

1. Open the repo's **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**, pick the branch that contains `charmcaster/`, keep the folder at `/ (root)`, and save.
3. After a minute the lens is live at `https://<user>.github.io/<repo>/charmcaster/`.

## Develop

```bash
python3 -m http.server 8000
# open http://localhost:8000/charmcaster/
```

URL flags:

- `?debug` shows fps and timings.
- `?cpu` forces CPU inference.
- `?mode=comic|lair|glass|off` picks the starting background.
- `?spell` previews the spell effect.
- `?src=<image or video URL>` runs the lens on a file instead of the camera.
- `?mirror=0|1` overrides mirroring.
- `?local` loads MediaPipe from `charmcaster/vendor/` instead of the CDNs. This folder is gitignored. It needs `tasks-vision/vision_bundle.mjs`, `tasks-vision/wasm/*` from the npm package, `models/face_landmarker.task` and `models/selfie_multiclass_256x256.tflite`.

## Credits

MediaPipe and its canonical face model are Apache-2.0, © Google. Charmcaster and *Ben 10* belong to Cartoon Network. This is an unofficial, non-commercial fan project.
