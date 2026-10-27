#!/usr/bin/env python3
"""Development-only camera fixture: NASA's public-domain astronaut photograph."""
import argparse, hashlib, subprocess, urllib.request
from pathlib import Path
URL='https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/astronaut.png'
SHA256='88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5'
parser=argparse.ArgumentParser();parser.add_argument('--directory',default='/tmp/charmcaster-test');args=parser.parse_args()
folder=Path(args.directory);folder.mkdir(parents=True,exist_ok=True);image=folder/'astronaut.png';video=folder/'camera.y4m'
if not image.exists():image.write_bytes(urllib.request.urlopen(URL,timeout=30).read())
if hashlib.sha256(image.read_bytes()).hexdigest()!=SHA256:raise SystemExit('Camera fixture checksum mismatch; refusing to use this file.')
subprocess.run(['ffmpeg','-y','-loglevel','error','-loop','1','-i',str(image),'-vf','crop=300:400:100:0,scale=480:640,format=yuv420p','-t','2','-r','15',str(video)],check=True)
print(video)
