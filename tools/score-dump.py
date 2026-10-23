# Decode a D7+ VWSC chunk's frame deltas and print sprite channels per frame.
import struct, sys
d = open(sys.argv[1], 'rb').read()
chans = [int(c) for c in sys.argv[2].split(',')]
tot, mh, hl, cnt, cnt1, itemlen = struct.unpack('>iiiiii', d[:24])
offs = struct.unpack('>%di' % cnt1, d[24:24 + 4 * cnt1]); base = 24 + 4 * cnt1
e0 = d[base + offs[0]: base + offs[1]]
alen, unk1, fcount, fver, rsize, nch, ndisp = struct.unpack('>iiiHHHH', e0[:20])
print('frames', fcount, 'ver', fver, 'recsize', rsize, 'channels', nch)
state = bytearray(rsize * nch)
pos = 20
for f in range(1, fcount + 1):
    flen = struct.unpack('>H', e0[pos:pos + 2])[0]; end = pos + flen; p = pos + 2
    while p < end:
        size, off = struct.unpack('>HH', e0[p:p + 4]); p += 4
        state[off:off + size] = e0[p:p + size]; p += size
    pos = end
    row = []
    for c in chans:
        r = state[(c + 5) * rsize:(c + 6) * rsize]  # 6 reserved channels before sprite 1
        lib, mem = struct.unpack('>HH', r[4:8]); idx = struct.unpack('>I', r[8:12])[0]
        locv, loch, h, w = struct.unpack('>hhhh', r[12:20])
        row.append(f'{c}:{lib}/{mem} beh={idx} @{loch},{locv} {w}x{h} t={r[0]}')
    print(f'frame {f:2d}', ' | '.join(row))
