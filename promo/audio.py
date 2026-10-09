"""Procedural score + sound design for the StudySolo film, locked to events.json (120 BPM)."""
import json
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve
from scipy.io import wavfile

SR = 48000
DUR = 60.4
LS = 3.0  # stats + finale run 3s later than the first cut
N = int(SR * DUR)
rs = np.random.RandomState(1234)
BEAT = 0.5

music = np.zeros((N, 2))   # musical bus (sidechained)
drums = np.zeros((N, 2))
sfx = np.zeros((N, 2))
verb_send = np.zeros((N, 2))


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def m(name):  # "A3" -> midi
    n, o = name[:-1], int(name[-1])
    return 12 * (o + 1) + NOTE[n]


def tt(n):
    return np.arange(n) / SR


def lp(x, fc, order=2):
    fc = min(fc, SR * 0.45)
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x)


def put(bus, sig, t, gain=1.0, pan=0.0, send=0.0):
    i = int(t * SR)
    if i >= N or i + len(sig) <= 0:
        return
    if i < 0:
        sig = sig[-i:]
        i = 0
    sig = sig[: N - i]
    l = np.cos((pan + 1) * np.pi / 4) * gain
    r = np.sin((pan + 1) * np.pi / 4) * gain
    if sig.ndim == 1:
        bus[i:i + len(sig), 0] += sig * l
        bus[i:i + len(sig), 1] += sig * r
        if send:
            verb_send[i:i + len(sig), 0] += sig * l * send
            verb_send[i:i + len(sig), 1] += sig * r * send
    else:
        bus[i:i + len(sig)] += sig * gain
        if send:
            verb_send[i:i + len(sig)] += sig * gain * send


def env(n, a=0.005, r=0.1, curve=1.0):
    e = np.ones(n)
    na, nr = max(1, int(a * SR)), max(1, int(r * SR))
    e[:na] = np.linspace(0, 1, na)
    if nr < n:
        e[-nr:] *= np.linspace(1, 0, nr) ** curve
    return e


def saw(f, n, phase=0.0):
    x = (f * tt(n) + phase) % 1.0
    return 2 * x - 1


# ---------------- instruments ----------------
def piano(f, dur=2.0, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    s = np.zeros(n)
    for k in range(1, 8):
        s += (1 / k ** 1.4) * np.sin(2 * np.pi * f * k * (1 + 0.0005 * k * k) * t) * np.exp(-t * (0.9 + 0.9 * k) * (f / 300) ** 0.3)
    s += 0.02 * rs.randn(n) * np.exp(-t * 60)
    s *= env(n, 0.003, 0.25) * vel
    return lp(s, 5000)


def pluck(f, dur=0.35, bright=3000, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    s = 0.6 * saw(f, n) + 0.4 * saw(f * 1.004, n, 0.3)
    s = lp(s * np.exp(-t * 9), bright, 2)
    s += 0.25 * np.sin(2 * np.pi * f * t) * np.exp(-t * 6)
    return s * env(n, 0.002, 0.05) * vel


def pad(fs, dur, cutoff=1400, a=0.6, r=0.8, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    L = np.zeros(n)
    R = np.zeros(n)
    for f in fs:
        for d, p in [(-0.012, -0.8), (-0.005, -0.3), (0, 0), (0.006, 0.4), (0.013, 0.9)]:
            v = saw(f * (1 + d), n, rs.rand())
            L += v * (1 - p) * 0.5
            R += v * (1 + p) * 0.5
    trem = 1 + 0.05 * np.sin(2 * np.pi * 0.3 * t)
    e = env(n, a, r) * trem * vel / (len(fs) * 5)
    return np.stack([lp(L, cutoff, 2) * e, lp(R, cutoff, 2) * e], 1)


def bell(f, dur=2.5, vel=1.0, ratio=3.5, idx=2.2):
    n = int(dur * SR)
    t = tt(n)
    mod = np.sin(2 * np.pi * f * ratio * t) * idx * np.exp(-t * 3)
    s = np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 1.6)
    s += 0.3 * np.sin(2 * np.pi * f * 2.01 * t) * np.exp(-t * 3)
    return s * env(n, 0.002, 0.3) * vel


def kick(vel=1.0):
    n = int(0.5 * SR)
    t = tt(n)
    f = 45 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 7) + 0.4 * lp(rs.randn(n), 3000) * np.exp(-t * 180)
    return np.tanh(s * 1.6) * vel


def clap(vel=1.0):
    n = int(0.35 * SR)
    t = tt(n)
    nz = bp(rs.randn(n), 900, 3200)
    e = np.zeros(n)
    for o in (0, 0.011, 0.022):
        e += np.exp(-np.clip(t - o, 0, None) * 90) * (t >= o)
    e += 0.35 * np.exp(-t * 14)
    return nz * e * 0.6 * vel


def hat(vel=1.0, open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = tt(n)
    return hp(rs.randn(n), 7500) * np.exp(-t * (14 if open_ else 70)) * 0.35 * vel


def crash(dur=2.2, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    return hp(rs.randn(n), 3500) * np.exp(-t * 2.2) * 0.5 * vel * env(n, 0.001, 0.3)


def sub_boom(dur=2.0, f0=55, f1=30, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t * 3)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.8)
    return np.tanh(s * 2) * vel * env(n, 0.002, 0.4)


def noise_sweep(dur, f0, f1, vel=1.0, shape="swell"):
    n = int(dur * SR)
    out = np.zeros(n)
    x = rs.randn(n)
    CH = 1024
    for i in range(0, n, CH):
        p = i / n
        fc = f0 * (f1 / f0) ** p
        seg = x[max(0, i - 256): i + CH]
        y = bp(seg, fc * 0.6, fc * 1.6)
        out[i:i + CH] = y[-len(out[i:i + CH]):]
    t = np.linspace(0, 1, n)
    e = np.sin(np.pi * t) ** 1.5 if shape == "swell" else t ** 2.5
    return out * e * vel


def whoosh(dur=0.5, vel=1.0, up=True):
    return noise_sweep(dur, 300 if up else 5000, 5000 if up else 300, vel)


def riser(dur, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    p = t / dur
    f = 180 * (6 ** p)
    s = 0.25 * np.sin(2 * np.pi * np.cumsum(f) / SR) + noise_sweep(dur, 400, 9000, 1.0, "ramp")
    return s * p ** 2 * vel


def reverse_crash(dur=1.2, vel=1.0):
    return crash(dur, vel)[::-1]


def click(f=3000, dur=0.02, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    return (hp(rs.randn(n), 1500) * 0.6 + np.sin(2 * np.pi * f * t)) * np.exp(-t * 300) * vel


def paper_flip(vel=1.0):
    d = 0.14 + rs.rand() * 0.08
    n = int(d * SR)
    t = tt(n)
    x = bp(rs.randn(n), 1400, 7000)
    e = np.exp(-((t - d * 0.35) ** 2) / (2 * (d * 0.18) ** 2)) + 0.4 * np.exp(-((t - d * 0.75) ** 2) / (2 * (d * 0.1) ** 2))
    return x * e * vel * 0.5


def scribble(dur=0.6, vel=1.0):
    n = int(dur * SR)
    t = tt(n)
    x = bp(rs.randn(n), 2200, 6500)
    am = np.abs(np.sin(2 * np.pi * (9 + 3 * rs.rand()) * t + 3 * np.sin(2 * np.pi * 1.7 * t))) ** 2
    return x * am * env(n, 0.02, 0.08) * vel * 0.35


def thud(vel=1.0):
    n = int(0.45 * SR)
    t = tt(n)
    s = np.sin(2 * np.pi * (70 + 40 * np.exp(-t * 30)) * t) * np.exp(-t * 11) + 0.5 * lp(rs.randn(n), 400) * np.exp(-t * 25)
    return s * vel


def woodtick(vel=1.0, f=1900):
    n = int(0.06 * SR)
    t = tt(n)
    return (np.sin(2 * np.pi * f * t) + 0.6 * np.sin(2 * np.pi * f * 0.52 * t)) * np.exp(-t * 110) * vel


def heartbeat(vel=1.0):
    n = int(0.6 * SR)
    t = tt(n)
    lub = np.sin(2 * np.pi * 52 * t) * np.exp(-t * 16)
    t2 = np.clip(t - 0.19, 0, None)
    dub = 0.7 * np.sin(2 * np.pi * 64 * t2) * np.exp(-t2 * 20) * (t >= 0.19)
    return np.tanh((lub + dub) * 2.2) * vel


# ---------------- events ----------------
ev = json.load(open("events.json"))
flip_i = 0
for e in ev:
    t, k = e["t"], e["type"]
    if k == "beep":
        n = int(0.13 * SR)
        s = np.sin(2 * np.pi * 988 * tt(n)) * env(n, 0.004, 0.03)
        put(sfx, s, t, 0.22, 0, send=0.35)
    elif k == "flip":
        left = e.get("pane") == "left"
        put(sfx, paper_flip(), t + 0.05, 0.28 * (0.55 if left else 1.0) * (0.7 + 0.5 * rs.rand()), -0.5 if left else (rs.rand() - 0.5) * 0.6, send=0.15)
    elif k == "thud":
        put(sfx, thud(), t, 0.55, -0.2, send=0.2)
    elif k == "stick":
        put(sfx, lp(rs.randn(int(0.05 * SR)), 2500) * np.exp(-tt(int(0.05 * SR)) * 60), t, 0.25, 0.2)
    elif k == "scribble":
        put(sfx, scribble(e.get("dur", 0.6)), t, 0.5, 0.15, send=0.1)
    elif k == "tick":
        put(sfx, woodtick(), t, 0.25, 0.3, send=0.2)
    elif k == "lampclick":
        put(sfx, click(2200, 0.03), t, 0.5, 0.4, send=0.2)
        put(sfx, click(1200, 0.03), t + 0.07, 0.3, 0.4, send=0.2)
    elif k == "riser":
        put(sfx, riser(e.get("dur", 0.7)), t, 0.35, 0, send=0.3)
        put(sfx, reverse_crash(0.7), t, 0.4, 0)
    elif k == "impact":
        put(sfx, sub_boom(2.4, 60, 28), t, 0.9, 0)
        put(sfx, crash(2.5), t, 0.55, 0, send=0.4)
        put(sfx, kick(), t, 0.8)
    elif k in ("swoosh", "sweep"):
        put(sfx, whoosh(0.45 if k == "swoosh" else 0.8, up=k == "swoosh"), t - 0.15, 0.35 if not e.get("soft") else 0.18, 0.4 if k == "swoosh" else -0.4, send=0.2)
    elif k == "key":
        put(sfx, click(2600 + 600 * rs.rand(), 0.018), t, 0.22 + 0.08 * rs.rand(), 0.35 + 0.1 * rs.rand())
    elif k == "enter":
        put(sfx, click(1400, 0.03), t, 0.4, 0.35)
        put(sfx, whoosh(0.35), t, 0.2, 0.3, send=0.2)
    elif k == "chime":
        for i, nn in enumerate(["C6", "E6", "G6", "C7"]):
            put(sfx, bell(hz(m(nn)), 2.0), t + i * 0.045, 0.12, -0.3 + 0.2 * i, send=0.5)
    elif k == "ding":
        put(sfx, bell(hz(m("G6")), 2.2), t, 0.16, 0.3, send=0.5)
    elif k == "data":
        n = int(0.025 * SR)
        put(sfx, np.sin(2 * np.pi * (2400 + 1600 * rs.rand()) * tt(n)) * np.exp(-tt(n) * 150), t, 0.05, (rs.rand() - 0.5), send=0.2)
    elif k == "node":
        scale = ["C5", "D5", "E5", "G5", "A5", "C6"]
        f = hz(m(scale[min(e["i"], 5)]))
        put(sfx, bell(f, 2.0), t, 0.2, (-0.4 + 0.2 * e["i"]), send=0.5)
        put(sfx, pluck(f / 2, 0.5, 4000), t, 0.2, 0, send=0.3)
    elif k == "node-final":
        for i, nn in enumerate(["C5", "G5", "C6", "E6"]):
            put(sfx, bell(hz(m(nn)), 3.0), t + i * 0.03, 0.16, -0.3 + 0.2 * i, send=0.6)
        put(sfx, sub_boom(1.8, 70, 35), t, 0.6)
        put(sfx, crash(2.0), t, 0.3, 0, send=0.4)
    elif k == "whoosh":
        put(sfx, whoosh(0.34), t - 0.1, 0.42, (rs.rand() - 0.5) * 1.2, send=0.15)
    elif k == "cut":
        put(sfx, click(1800, 0.02), t, 0.25)
    elif k == "slam":
        put(sfx, kick(1.0), t, 0.8)
        put(sfx, sub_boom(0.9, 70, 38), t, 0.55)
        put(sfx, crash(1.0), t, 0.22, 0, send=0.3)
        roots = ["C3", "E3", "F3", "G3", "A3"]
        r0 = m(roots[e["i"]])
        chord = [r0, r0 + 7, r0 + 12, r0 + (3 if e["i"] in (1, 4) else 4) + 12]
        put(sfx, pad([hz(x) for x in chord], 0.45, 3200, 0.005, 0.3, 1.4), t, 0.5, 0, send=0.4)
    elif k == "heartbeat":
        put(sfx, heartbeat(), t, 0.9, 0, send=0.15)
    elif k == "tick-soft":
        put(sfx, bell(hz(m(["C6", "D6", "E6", "G6", "A6", "C7"][int(round(t * 10)) % 6])), 1.2), t, 0.1, (rs.rand() - 0.5), send=0.6)
    elif k == "cardflip":
        put(sfx, whoosh(0.28), t - 0.05, 0.3, 0.2, send=0.2)
        put(sfx, paper_flip(1.2), t + 0.12, 0.35, 0.2, send=0.2)
    elif k == "logo":
        put(sfx, reverse_crash(0.7), t - 0.7, 0.3)
    elif k == "logo-land":
        put(sfx, sub_boom(3.5, 55, 32), t, 0.7)
        put(sfx, crash(3.5), t, 0.3, 0, send=0.5)
        for i, nn in enumerate(["C5", "G5", "E6"]):
            put(sfx, bell(hz(m(nn)), 4.0), t + i * 0.05, 0.12, -0.3 + 0.3 * i, send=0.6)

# ---------------- score ----------------
def chord_notes(names):
    return [hz(m(x)) for x in names]

# Act I — drone + reverse swell
put(music, pad(chord_notes(["A1", "E2", "A2"]), 4.3, 500, 1.5, 0.6), 0.0, 0.8, send=0.3)
put(music, reverse_crash(1.4), 2.65, 0.35)
rev = np.zeros(int(1.6 * SR))
for nn in ["A3", "C4", "E4", "A4"]:
    p = piano(hz(m(nn)), 1.6, 0.7)
    rev[: len(p)] += p
put(music, rev[::-1] * np.linspace(0, 1, len(rev)) ** 2, 2.4, 0.35, send=0.4)

# Act II — the past: melancholic piano arpeggios (A minor), accelerating clock
PAST = [(4.0, ["A2", "E3", "A3", "C4", "E4", "A4", "C5", "E4"]), (6.0, ["F2", "C3", "F3", "A3", "C4", "F4", "A4", "C4"]),
        (8.0, ["D2", "A2", "D3", "F3", "A3", "D4", "F4", "A3"]), (10.0, ["E2", "B2", "E3", "G#3", "B3", "E4", "G#4", "B3"]),
        (12.0, ["A2", "E3", "A3", "C4", "E4", "A4", "C5", "E4"]), (13.0, ["F2", "C3", "F3", "A3", "C4", "F4", "A4", "C4"]),
        (14.0, ["E2", "B2", "E3", "G#3", "B3", "E4", "G#4", "B3"])]
for i, (t0, notes) in enumerate(PAST):
    t1 = PAST[i + 1][0] if i + 1 < len(PAST) else 15.0
    step = 0.25 if t0 < 12 else 0.125
    k = 0
    t = t0
    while t < t1 - 1e-6:
        nn = notes[k % len(notes)]
        vel = 0.55 + 0.2 * (k % 4 == 0)
        put(music, piano(hz(m(nn)), 1.6, vel), t, 0.32, (-0.3 + 0.6 * ((k % 8) / 7)), send=0.35)
        k += 1
        t += step
    put(music, piano(hz(m(notes[0])) / 2, 2.5, 0.7), t0, 0.35, send=0.2)
    put(music, pad(chord_notes(notes[:4]), t1 - t0 + 0.6, 700, 0.4, 0.5, 0.8), t0, 0.35, send=0.3)
# clock ticks
t = 4.0
while t < 14.5:
    step = 0.5 if t < 11 else (0.25 if t < 13 else 0.125)
    put(sfx, woodtick(0.8, 1700 if int(t / step) % 2 else 2100), t, 0.13, 0.5, send=0.1)
    t += step

# Act III+ — modern: C major world, sidechained groove
kicks = []
def drum_bar(t0, t1, kick_on=True, hats=0, clap_on=False, openhat=False):
    t = t0
    while t < t1 - 1e-6:
        b = round((t - t0) / BEAT)
        if kick_on:
            put(drums, kick(), t, 0.72)
            kicks.append(t)
        if clap_on and b % 2 == 1:
            put(drums, clap(), t, 0.42, 0.05, send=0.25)
        if hats == 8:
            put(drums, hat(0.8, openhat), t + BEAT / 2, 0.5, 0.3)
        elif hats == 16:
            for j in range(4):
                put(drums, hat(0.9 if j == 2 else 0.5), t + j * BEAT / 4, 0.5, 0.3 - 0.15 * j)
        t += BEAT

NOW = [(15.0, ["F3", "A3", "C4", "E4"], "F2"), (17.0, ["G3", "B3", "D4", "E4"], "G2"), (19.0, ["E3", "G3", "B3", "D4"], "E2"),
       (21.0, ["A3", "C4", "E4", "G4"], "A2"), (23.0, ["F3", "A3", "C4", "E4"], "F2"), (25.0, ["C4", "E4", "G4", "B4"], "C3"),
       (27.0, ["G3", "B3", "D4", "G4"], "G2"), (29.0, ["A3", "C4", "E4", "G4"], "A2"), (31.0, ["F3", "A3", "C4", "E4"], "F2"),
       (33.0, ["F3", "A3", "C4", "E4"], "F2"), (35.0, ["G3", "B3", "D4", "G4"], "G2"), (37.0, ["A3", "C4", "E4", "G4"], "A2"),
       (39.0, ["E3", "G3", "B3", "D4"], "E2"), (41.0, ["F3", "A3", "C4", "E4"], "F2"), (43.0, ["G3", "B3", "D4", "F4"], "G2"), (45.0, ["A3", "C4", "E4", "G4"], "A2")]
for i, (t0, ch, root) in enumerate(NOW):
    t1 = NOW[i + 1][0] if i + 1 < len(NOW) else 47.0
    cut = 900 + 2600 * np.clip((t0 - 15) / 18, 0, 1)
    put(music, pad(chord_notes(ch), t1 - t0 + 0.8, cut, 0.25 if t0 != 15 else 0.05, 0.7, 1.1), t0, 0.5, send=0.35)
    # bass
    if t0 >= 17:
        bt = t0
        while bt < t1 - 1e-6:
            put(music, lp(saw(hz(m(root)), int(0.45 * SR)), 500) * env(int(0.45 * SR), 0.005, 0.1) * 0.9, bt + BEAT / 2 if t0 < 33 else bt, 0.5)
            if t0 >= 33:
                put(music, lp(saw(hz(m(root)), int(0.22 * SR)), 700) * env(int(0.22 * SR), 0.005, 0.08) * 0.7, bt + BEAT / 2, 0.45)
            bt += BEAT
    # arp (16ths) from Enter onward
    if t0 >= 17:
        arp = ch + [n[:-1] + str(int(n[-1]) + 1) for n in ch]
        pat = [0, 2, 1, 3, 4, 2, 5, 3]
        at = t0
        k = 0
        while at < t1 - 1e-6:
            if not (22.4 < at < 24.0):
                br = 1500 + 4500 * np.clip((at - 17) / 16, 0, 1) if at < 33 else 5200
                put(music, pluck(hz(m(arp[pat[k % 8] % len(arp)])), 0.3, br, 0.9), at, 0.2, (-0.5 + (k % 4) / 3), send=0.3)
            k += 1
            at += BEAT / 4

# drums
drum_bar(17.0, 22.4, kick_on=True, hats=0)
drum_bar(18.35, 22.4, kick_on=False, hats=8)
drum_bar(19.0, 22.4, kick_on=False, clap_on=True)
drum_bar(25.0, 31.0, kick_on=True, hats=8, clap_on=True)
drum_bar(27.0, 31.0, kick_on=False, hats=16)
drum_bar(31.0, 32.0, kick_on=True, hats=16, clap_on=True)
# snare roll build 32 → 33
t = 32.0
while t < 33.0:
    k = (t - 32.0)
    put(drums, clap(0.4 + 0.6 * k), t, 0.35 * (0.5 + k), 0, send=0.2)
    t += BEAT / 4 if t < 32.5 else BEAT / 8
put(sfx, riser(1.5), 31.5, 0.4, send=0.3)
put(sfx, reverse_crash(1.0), 32.0, 0.35)
# drop
put(sfx, sub_boom(2.0, 60, 30), 33.0, 0.8)
put(sfx, crash(2.5), 33.0, 0.5, send=0.4)
drum_bar(33.0, 47.0, kick_on=True, hats=16, clap_on=True)
# stats: half-time hits handled by slam events; hold pad
put(music, pad(chord_notes(["C4", "E4", "G4", "B4"]), 3.2, 2500, 0.3, 1.0, 0.9), 44.0 + LS, 0.35, send=0.4)
put(sfx, riser(0.8), 46.2 + LS, 0.3)
put(sfx, reverse_crash(0.6), 46.4 + LS, 0.35)
# finale: solo piano (C major) + warm pad
for i, nn in enumerate(["C3", "G3", "C4", "E4", "G4", "E4", "C4", "G3", "F3", "C4", "F4", "A4", "C5", "A4", "F4", "C4"]):
    put(music, piano(hz(m(nn)), 2.2, 0.6), 47.05 + LS + i * 0.25, 0.34, (-0.3 + 0.6 * (i % 8) / 7), send=0.5)
put(music, pad(chord_notes(["C3", "G3", "E4"]), 2.2, 900, 0.5, 0.8, 0.7), 47.0 + LS, 0.3, send=0.5)
put(music, pad(chord_notes(["F3", "C4", "A4"]), 2.4, 900, 0.5, 0.8, 0.7), 49.0 + LS, 0.3, send=0.5)
put(sfx, riser(1.2), 49.6 + LS, 0.3, send=0.4)
put(sfx, reverse_crash(0.9), 49.9 + LS, 0.35)
# end: sustained chord after logo lands + echo of the motif
put(music, pad(chord_notes(["C2", "G2", "C3", "E3", "G3", "D4"]), 4.4, 1600, 0.05, 2.5, 1.2), 53.05 + LS, 0.55, send=0.6)
for i, nn in enumerate(["E5", "G5", "C6", "D6", "E6"]):
    put(music, piano(hz(m(nn)), 2.5, 0.5), 54.0 + LS + i * 0.5, 0.25, (-0.4 + 0.2 * i), send=0.7)

# ---------------- mix ----------------
# sidechain music to kicks
sc = np.ones(N)
for kt in kicks:
    i = int(kt * SR)
    L = int(0.32 * SR)
    seg = sc[i:i + L]
    seg *= 1 - 0.55 * np.exp(-tt(len(seg)) * 11)
music *= sc[:, None]

# reverb (stereo convolution with decaying noise)
irn = int(2.4 * SR)
tir = tt(irn)
ir = np.stack([rs.randn(irn), rs.randn(irn)], 1) * np.exp(-tir * 2.6)[:, None]
ir[: int(0.02 * SR)] = 0
ir = np.stack([lp(ir[:, 0], 6000), lp(ir[:, 1], 5000)], 1)
ir /= np.sqrt((ir ** 2).sum(0))
wet = np.stack([fftconvolve(verb_send[:, c], ir[:, c])[:N] for c in range(2)], 1)

mix = music * 0.9 + drums * 0.85 + sfx * 1.0 + wet * 0.55
mix = hp(mix.T, 25).T
# gentle master: soft clip + fade out
mix = np.tanh(mix * 1.15) / np.tanh(1.15)
fade = np.ones(N)
fs = int((56.2 + LS) * SR)
fade[fs:] = np.linspace(1, 0, N - fs) ** 1.5
fade[: int(0.02 * SR)] = np.linspace(0, 1, int(0.02 * SR))
mix *= fade[:, None]
peak = np.max(np.abs(mix))
mix = mix / peak * 0.93
rms = np.sqrt(np.mean(mix ** 2))
print("peak", peak, "rms dBFS", 20 * np.log10(rms))
wavfile.write("score.wav", SR, (mix * 32767).astype(np.int16))
