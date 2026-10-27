# Charmcaster Avatar v2

Download and fully extract `dist/Charmcaster-Avatar-v2-Web.zip`, then open `index.html` in a current Chrome or Edge browser. The entry page embeds all artwork, tracking runtimes and models. The same ZIP can be served over HTTPS. No external model download or extra software is needed at runtime.

Full Charmcaster avatar is enabled by default. Image-generated full-body artwork replaces the camera subject, with face movement and MediaPipe Pose controlling its 2D deformation mesh. Move back far enough for the camera to see the joints you want to control. Hidden joints fall back to the head-relative pose; this is not a full 3D avatar and extreme turns, crossed limbs and occlusions can distort the picture.

Expression pose offers 80 procedural variants: ten each for neutral, joy, sadness, anger, surprise, concern, disgust and confidence. These are selectable acting poses, not psychological emotion detection. Live speech and blinks remain active. Default Live face only uses your measured expression.

Disable Full Charmcaster avatar for camera-body mode. That mode uses the earlier vector head and a coordinated pink/purple cel-shading shader on the real body. Its optional collar can be disabled. It does not turn clothing into the character's costume. The image-generated costume is provided by full-avatar mode.

Photos and video record the rendered view. Camera data and recordings stay on the device unless the user saves or shares them. Photo, video, mirror, portrait/landscape framing and optional microphone controls remain available. The rig and shader improvements do not establish performance on every device; physical Windows camera behavior still needs user testing.

## Development

Run `python3 tools/filter/serve.py --port 8010` to serve source. Rebuild distributions with `python3 tools/filter/build.py`. Run `tests/filter/smoke.cjs` using Playwright and the prepared camera fixture as described in `tools/filter/prepare_test.py`. The browser test exercises actual face, segmentation and body-pose inference, capture, expression controls, settings and permission handling. Model licenses and provenance are documented in `filter/ASSETS.md`.

The older Windows EXE has not been rebuilt with this version. Use the v2 browser download for the changes above.
