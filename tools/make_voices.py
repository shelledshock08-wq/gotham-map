#!/usr/bin/env python3
"""Generate voiced dialogue with Piper TTS (offline neural TTS) + ffmpeg.

Sonic and Eggman get original AI voices styled for the characters
(no cloning of real voice actors). Output:
  assets/voice/*.mp3      one clip per line
  js/voicelines.js        { normalized bubble text: [path, seconds] }

Needs: pip install piper-tts, ffmpeg, and Piper voice models
(rhasspy/piper GitHub release v0.0.2) in VOICE_DIR.
"""
import json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.environ.get('VOICE_DIR', '/tmp/voices')

VOICES = {
    # model, piper length_scale, pitch factor, extra ffmpeg filters
    'sonic':  ('en-us-ryan-high/en-us-ryan-high.onnx', 0.86, 1.17,
               'highpass=f=110,equalizer=f=3200:t=q:w=1:g=3,volume=1.1,alimiter=limit=0.8'),
    'eggman': ('en-gb-alan-low/en-gb-alan-low.onnx', 1.08, 0.80,
               'lowshelf=f=180:g=5,aecho=0.8:0.5:45:0.22,volume=1.9,alimiter=limit=0.8'),
}

# (speaker, bubble text exactly as in the code, what is actually spoken)
LINES = [
    ('sonic', "Let's go! {jump} jump, hold {down} + tap {jump} to spin dash!", "Let's go! Hold down and tap jump to spin dash!"),
    ('sonic', 'Badnik! Jump, then press {jump} again in the air to HOMING ATTACK!', 'Badnik! Jump, then press jump again in the air to homing attack!'),
    ('sonic', 'Chain it! Tap {jump} again after every hit!', 'Chain it! Tap jump again after every hit!'),
    ('sonic', 'Tip: homing attacks chain through enemies in mid-air!', 'Homing attacks chain through enemies in mid-air!'),
    ('sonic', 'Too easy!', 'Too easy!'),
    ('sonic', 'Way past cool!', 'Way past cool!'),
    ('sonic', 'Next!', 'Next!'),
    ('sonic', "Keep 'em coming!", "Keep 'em coming!"),
    ('sonic', 'Too slow!', 'Too slow!'),
    ('sonic', 'Is that all?', 'Is that all?'),
    ('sonic', 'Smooth!', 'Smooth!'),
    ('eggman', 'Ho ho ho! Nice of you to drop by, hedgehog!', 'Ho ho ho! Nice of you to drop by, hedgehog!'),
    ('sonic', 'Jump and smack his ship! {jump} (or {jump} again mid-air to home in)', 'Jump and smack his ship!'),
    ('eggman', 'Ho ho ho! You think THAT was my best?!', 'Ho ho ho! You think that was my best?!'),
    ('eggman', 'Behold... the EGG COLOSSUS!!', 'Behold... the Egg Colossus!'),
    ('sonic', 'FUCK.', 'Fuuuuck!', {'length': 1.5, 'post': 'atempo=0.6,aecho=0.8:0.6:120:0.3,volume=2.2,alimiter=limit=0.8'}),
    ('eggman', 'Language, hedgehog!', 'Language, hedgehog!'),
    ('sonic', '...Okay. Time to go Super.', 'Okay. Time to go super.'),
    ('sonic', "Let's do this! Mash {punch} for light fists, hold {laser} for a laser!", "Let's do this! Mash for light fists, and hold for a laser!"),
    ('sonic', 'Beat a part till it sparks, then rip it off and throw it back!', 'Beat a part till it sparks, then rip it off and throw it back!'),
    ('sonic', "Let's double up! {clones} Light Clones!", "Let's double up! Light clones!"),
    ('sonic', 'Burning out... I need rings! Grab the gold ones!', 'Burning out. I need rings!'),
    ('sonic', "His core's exposed! Hit it with EVERYTHING!", "His core's exposed! Hit it with everything!"),
    ('eggman', 'No! NO! My masterpiece!!', 'No! No! My masterpiece!'),
    ('sonic', 'No... my power...', 'No... my power...'),
    ('eggman', "I'll get you next time, Sonic!!!", "I'll get you next time, Sonic!"),
    ('sonic', 'Too slow, Eggman!', 'Too slow, Eggman!'),
    ('sonic', 'MASH {punch}!!!', 'Mash it!'),
    ('eggman', 'IMPOSSIBLE!', 'Impossible!'),
    ('sonic', 'Ugh! Gotta mash harder!', 'Ugh! Gotta mash harder!'),
    ('sonic', 'Catch, Egghead! {grab} to throw it!', 'Catch, Egghead!'),
    ('eggman', 'MY BEAUTIFUL ROBOT!', 'My beautiful robot!'),
    ('sonic', 'Big fist incoming! Fly out of the way!', 'Big fist incoming! Fly out of the way!'),
    ('sonic', 'Fist again! Dodge it!', 'Fist again! Dodge it!'),
    ('sonic', "He's gonna slam! Stay up high!", "He's gonna slam! Stay up high!"),
    ('sonic', 'Shit, I better smash those rockets! {punch}', 'Shit, I better smash those rockets!'),
    ('sonic', "More rockets! {punch} 'em!", "More rockets! Smash 'em!"),
    ('sonic', 'Laser, huh? Two can play that game! Hold {laser}, aim at his face!', 'Laser, huh? Two can play that game!'),
    ('sonic', 'Beam him back! Hold {laser}!', 'Beam him back!'),
    ('sonic', 'Heads up! Falling debris!', 'Heads up! Falling debris!'),
    ('sonic', "That arm's loose! Time to rip it off! Fly close + hold {grab}", "That arm's loose! Time to rip it off!"),
    ('sonic', "That rocket pod's loose! Time to rip it off! Fly close + hold {grab}", "That rocket pod's loose! Time to rip it off!"),
    ('sonic', "That chest plate's loose! Time to rip it off! Fly close + hold {grab}", "That chest plate's loose! Time to rip it off!"),
]


def norm(text):
    """Must match voiceKey() in js/speech.js."""
    t = re.sub(r'\{\w+\}', ' ', text).lower()
    return re.sub(r'[^a-z]+', ' ', t).strip()


def main():
    out_dir = os.path.join(ROOT, 'assets', 'voice')
    os.makedirs(out_dir, exist_ok=True)
    manifest = {}
    for line in LINES:
        who, bubble, spoken = line[:3]
        model, length, pitch, filt = VOICES[who]
        extra = line[3] if len(line) > 3 else {}
        length = extra.get('length', length)
        slug = (who + '_' + norm(bubble).replace(' ', '_'))[:60]
        rel = f'assets/voice/{slug}.mp3'
        with tempfile.NamedTemporaryFile(suffix='.wav') as wav:
            subprocess.run([sys.executable, '-m', 'piper', '-m', os.path.join(VOICE_DIR, model),
                            '--length-scale', str(length), '-f', wav.name],
                           input=spoken.encode(), check=True, capture_output=True)
            sr = int(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries',
                                              'stream=sample_rate', '-of', 'csv=p=0', wav.name]).strip())
            af = f'asetrate={int(sr * pitch)},aresample=44100,atempo={1 / pitch:.4f},{filt},' \
                 'silenceremove=start_periods=1:start_threshold=-45dB' + (',' + extra['post'] if 'post' in extra else '')
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav.name, '-af', af,
                            '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '64k', os.path.join(ROOT, rel)], check=True)
        dur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                                            '-of', 'csv=p=0', os.path.join(ROOT, rel)]).strip())
        manifest[norm(bubble)] = [rel, round(dur, 2)]
        print(f'{dur:5.2f}s  {who:6s}  {spoken}')
    with open(os.path.join(ROOT, 'js', 'voicelines.js'), 'w') as f:
        f.write('// Generated by tools/make_voices.py. Normalized bubble text -> [clip, seconds].\n')
        f.write("'use strict';\nconst VOICE_LINES = " + json.dumps(manifest, indent=1) + ';\n')


if __name__ == '__main__':
    main()
