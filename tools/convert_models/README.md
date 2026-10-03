# Converting the 3D models

`js/models3d.js` holds the Sonic and Egg Pawn models used in the 3D escape. It was generated like this:

1. Get the source files from [JonathanOdgis/Sonic-The-Hedgehog-Controller-Unity](https://github.com/JonathanOdgis/Sonic-The-Hedgehog-Controller-Unity) (sparse checkout is enough):
   - `Assets/Models/Sonic (Modern)/Sonic.DAE` plus `images/chr_sonic_{body01,cloth,eye,shoes}_dif_HD.png`. This is the Sonic Generations model ripped by Apoc Hedgie for The Models Resource.
   - `Assets/Models/Egg Pawn/Egg Pawn.DAE` plus `images/enm_eggpawn_{body_dif,eye_ems}_HD.png`
   - `Assets/Animations/sonic_*.anim` (Unity animation clips)
2. Put them in a work folder (default `/tmp/conv`): `sonic.dae`, `pawn.dae`, `images/`, and the three.js r149 npm package unpacked as `package/`. Write `sidmap.json` and `sidmap_pawn.json`, which map the DAE joint `sid`s to node names.
3. `python3 anims.py` samples the Unity Euler curves (Hermite tangents) at 30 fps and writes `anims.json`.
4. Serve the work folder (`python3 -m http.server 8790 --directory /tmp/conv`), then run `node export.js` (Playwright). This loads the DAEs with three's ColladaLoader, renames the bones, merges vertices, converts the clips from Unity space to three.js (Euler order `YXZ`, quaternion `(x, -y, -z, w)`, position `(-x, y, z)`) and writes `models.json`.
5. `python3 pack.py` embeds the geometry and textures and writes `js/models3d.js`.
