"""Give Sonic's eyeballs front-facing UVs so the iris sits in the eye.
(In Generations the eye UVs are animated at runtime; the static rip points them nowhere useful.)"""
import json, base64, struct, sys
src = sys.argv[1] if len(sys.argv) > 1 else 'models.json'
m = json.load(open(src))
me = m['sonic']['meshes'][0]
def dec(a, fmt):
    b = base64.b64decode(a['d']); n = len(b) // struct.calcsize(fmt)
    return list(struct.unpack('<%d%s' % (n, fmt), b))
P = dec(me['attrs']['position'], 'f'); UV = dec(me['attrs']['uv'], 'f'); idx = dec(me['index'], 'H')
st, ct, mi = me['groups'][0]
assert me['mats'][mi]['map'].startswith('chr_sonic_eye')
eye = sorted(set(idx[st:st + ct]))
N = me['attrs']['uv']['n']   # Collada UVs come with 3 components (s, t, p)
for side in (1, -1):
    vs = [v for v in eye if P[3 * v] * side > 0]
    cx = sum(P[3 * v] for v in vs) / len(vs); cz = sum(P[3 * v + 2] for v in vs) / len(vs)
    ix, iz = cx - side * 0.35, cz + 0.2          # irises sit a touch inward, looking ahead
    for v in vs:
        UV[N * v] = 0.5 + (P[3 * v] - ix) / 10.5 * side
        UV[N * v + 1] = 0.5 + (P[3 * v + 2] - iz) / 12.0
me['attrs']['uv']['d'] = base64.b64encode(struct.pack('<%df' % len(UV), *UV)).decode()
json.dump(m, open(src, 'w'))
print('eye uvs remapped for', len(eye), 'vertices')
