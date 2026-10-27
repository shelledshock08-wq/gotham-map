# Assets and provenance

## Character

`art/charmcaster.png` was created with OpenAI imagegen for this app on 2026-10-27, depicting Charmcaster from Ben 10: Omniverse. `generated-art.js` embeds the same PNG for local-file support. This is an unofficial fan avatar; character rights belong to their owners. The image is animated by a procedural 2D deformation mesh, not a 3D model. The 80 expression variants are procedural controls applied to this artwork, not 80 separately generated illustrations. `character.js` retains the earlier vector rig for optional camera-body mode. No user webcam photographs are included in the artwork.

## Tracking and segmentation

Locally vendored npm distributions:

- `@mediapipe/pose` **0.5.1675469404** — Google MediaPipe, Apache-2.0. Uses the lite body-pose model for shoulder, arm, hip, knee and ankle controls.

- `@mediapipe/face_mesh` **0.4.1633559619** — Google MediaPipe, Apache-2.0. Includes face detection/landmark models in the packed asset bundle and SIMD/non-SIMD WASM runtimes.
- `@mediapipe/selfie_segmentation` **0.1.1675465747** — Google MediaPipe, Apache-2.0. Includes selfie segmentation TFLite models and WASM runtimes.

Source project: https://github.com/google-ai-edge/mediapipe
Package registries: https://www.npmjs.com/package/@mediapipe/face_mesh and https://www.npmjs.com/package/@mediapipe/selfie_segmentation

The Apache-2.0 license is preserved at `vendor/LICENSE-APACHE-2.0.txt`; original package metadata is retained. `vendor/SHA256SUMS.json` records hashes. Runtime requests resolve only to included files or embedded Blob URLs. Google-hosted Face Landmarker downloads were unavailable in this environment, so this implementation uses the complete, locally available Face Mesh distribution instead; there is no dependency on the newer Face Landmarker service or a remote fallback.

## Other

UI icons, backgrounds, circular studio graphics and the body-shading GLSL shader are original code. System fonts are used; no font downloads occur.

Browser tests use a local Y4M camera fixture generated from scikit-image's NASA astronaut sample (Eileen Collins, public-domain NASA photograph), fetched from the scikit-image v0.19.3 test-data tree. The portrait/fixture is a development tool and is not included in the app or its distributions. No camera images are shipped as user examples or sent to external services.
