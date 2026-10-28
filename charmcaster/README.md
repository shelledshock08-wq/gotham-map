# Charmcaster Lens

A live camera filter, like a Snapchat lens, that turns you into **Charmcaster** from *Ben 10: Omniverse*. It runs in your phone's browser, so there is no app to install and no extra hardware or software.

Your face drives hers: blinks, winks, smiles, talking, frowns and brow raises all come through. The head is redrawn as Charmcaster: white hair with purple tips, the curled marks under her eyes, purple eyes with winged liner, black lips, and pointed ears with gold rings.

Step back and your whole body becomes her outfit too, tracked from 33 body points:

- Your top becomes her magenta jacket with the black front panel. With your shirt off, the bare torso is drawn as a cartoon chest with ab lines instead.
- Bare arms or not, you get her long sleeves with heart emblems, and your hands get black fingerless gloves.
- Your legs get black leggings, with boots from the knee down. There are no skirt flaps, so the lower body reads clean head-to-toe.
- Turn around and you see her long white hair down your back and her collar from behind.

Shading follows your real body and lighting, so it moves naturally.

## Windows app (.exe)

Download `CharmcasterLens-Setup.exe` from the `charmcaster-latest` release and double-click it. It installs in a few seconds into your user folder (no admin rights needed), adds a desktop shortcut and opens the lens. Everything it needs is inside, so it works offline. Windows may show "Windows protected your PC" the first time because the app isn't code-signed; click **More info → Run anyway**.

If the window stays dark, that's almost always the graphics driver:

- After 20 seconds a prompt offers **safe graphics mode**: it draws in software, which is slower but works on any PC. You can also press **F9** at any time to switch modes.
- The title bar shows what the app is doing while it starts.
- A log is written to `%APPDATA%\Charmcaster Lens\CharmcasterLens-log.txt`; the prompt has an **Open log** button.

| Key | What happens |
|---|---|
| Space / Enter | Photo |
| R | Start / stop recording |
| ← / → | Background: Comic, Lair, Stained glass, Lens off |
| H | Hide the UI (clean view for screen recording or OBS) |
| M | Mirror on / off |
| C | Next webcam |
| F11 or F | Fullscreen |
| F9 | Safe graphics mode on / off |
| F12 | Developer tools |

For full-body shots, stand back until your knees or feet are in view. Your face keeps driving hers even when it's small in the frame.

Build it yourself on Windows (Node 20+):

```bash
cd charmcaster/desktop
npm ci
npm run dist:win    # downloads the models into ../vendor, writes dist/CharmcasterLens-Setup.exe
```

The installer needs Windows (or Wine) to build. On Linux, `npx electron-builder --linux dir` makes a test build of the same app. The `Charmcaster Lens (Windows exe)` GitHub workflow builds the installer on a Windows runner and attaches it to the `charmcaster-latest` release.

## Use it on a phone

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

- **Tracking:** [MediaPipe Tasks Vision](https://www.npmjs.com/package/@mediapipe/tasks-vision) 1.0.1. The Face Landmarker gives 478 face points and 52 expression blendshapes, for up to 2 faces. The Pose Landmarker gives 33 body points: full model on computers, lite on phones. The selfie multiclass segmenter splits the frame into hair, skin, clothes and background. All of them run on the GPU when possible and fall back to the CPU. Pose landmarks and the segmentation mask are temporally smoothed, with hysteresis on whether a limb is in view, so the cartoon body stays steady instead of shimmering.
- **Full-body shots:** when the face is too small for the face detector, a second face tracker runs on a zoomed crop around the head found by the pose model. If that fails too, a neutral face is posed from the body points (nose, eyes, ears, mouth). Segmentation runs on a crop around the people in frame, so the mask stays sharp when you're far away.
- **Outfit:** limb capsules from the pose drive shader regions for sleeves, gloves (on hand skin only), leggings and boots. Heart emblems and the view from behind are drawn on top. When the torso reads as bare skin (shirt off) the mask drives cartoon chest and ab lines drawn over it, bounded between the collar and the navel.
- **Head pose:** a weighted similarity fit (Horn's method) between the rigid points of MediaPipe's canonical face model and the tracked points. Hair and ears are modelled in 3D head space in centimetres and projected with this pose, so they turn with you. Loose hair has spring physics.
- **Face:** a vector puppet drawn with Canvas 2D straight from the landmarks, so expressions are your own. Blink blendshapes force a full close.
- **Body and background:** a WebGL2 shader (bilateral smoothing, cel tones relative to local brightness, ink lines from mask contours and image edges) recolors each body part into her palette, with flat cel tones and bold outlines so the whole body reads as drawn as the head, whatever you're wearing. The long hair is tucked behind your shoulders using the body mask.
- **Capture:** photos come from `canvas.toBlob`. Videos use `MediaRecorder` on the canvas stream plus the mic, recording MP4 where supported and WebM otherwise. Saving uses the Web Share API when the phone supports it, and a download otherwise.

| File | Role |
|---|---|
| `js/app.js` | Camera, frame loop, compositing, UI |
| `js/tracker.js` | MediaPipe loading (jsDelivr, falling back to unpkg), smoothing, face slots, masks |
| `js/geom.js` | One Euro filter, pose fit, head-space projection |
| `js/canonical.js` | Rigid points of MediaPipe's canonical face model |
| `js/toon.js` | WebGL cartoon pass and backgrounds |
| `js/charm.js` | The drawn Charmcaster head, collar and hair physics (palette sampled from the show) |
| `js/body.js` | Full-body outfit: shader regions, emblems, bare-torso abs, view from behind |
| `js/capture.js` | Photo/video capture, preview, save/share |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installable and offline support |
| `desktop/` | Windows app: Electron wrapper (`main.js`), offline asset fetcher, build config |

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
- `?back` previews the view from behind on a front-facing test image.
- `?src=<image or video URL>` runs the lens on a file instead of the camera.
- `?mirror=0|1` overrides mirroring.
- `?local` loads MediaPipe from `charmcaster/vendor/` instead of the CDNs. This folder is gitignored; `node desktop/fetch-assets.mjs` fills it.

## Credits

MediaPipe and its canonical face model are Apache-2.0, © Google. Charmcaster and *Ben 10* belong to Cartoon Network. This is an unofficial, non-commercial fan project.
