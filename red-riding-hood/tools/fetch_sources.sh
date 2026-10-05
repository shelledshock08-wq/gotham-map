#!/bin/sh
# Downloads the free (CC0) source assets the build scripts use into .sources/
# (not committed). Needs git. Then: pip install bpy==4.5.4
set -e
cd "$(dirname "$0")/.."
mkdir -p .sources && cd .sources
if [ ! -d mpfb2 ]; then
  git clone --depth 1 --filter=blob:none --no-checkout https://github.com/makehumancommunity/mpfb2.git
  (cd mpfb2 && git sparse-checkout set --no-cone '/LICENSE*' 'src/mpfb/data/3dobjs/' 'src/mpfb/data/mesh_metadata/' \
     'src/mpfb/data/rigs/' 'src/mpfb/data/targets/macrodetails/' 'src/mpfb/data/targets/torso/' 'src/mpfb/data/targets/head/' \
     'src/mpfb/data/targets/neck/' 'src/mpfb/data/targets/arms/' 'src/mpfb/data/targets/legs/' && git checkout)
fi
if [ ! -d mesh2motion-app ]; then
  git clone --depth 1 --filter=blob:none --no-checkout https://github.com/scottpetrovic/mesh2motion-app.git
  (cd mesh2motion-app && git sparse-checkout set --no-cone '/LICENSE*' '/README*' 'static/animations/human-*.glb' && git checkout)
fi
echo "sources ready in $(pwd)"
