"""IP SHIFT launch film - original synthesized sound design (numpy only).
Writes film/audio/ip_shift_launch_mix.wav (48 kHz, 16-bit stereo) and cue_sheet.csv.
Usage: python3 make_audio.py   (loudness is measured with ffmpeg ebur128 and trimmed to ~-16 LUFS)
"""
import numpy as np, wave, os, subprocess, re, sys
SR = 48000
DUR = 42.0
N = int(SR * DUR)
rng = np.random.default_rng(7)
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'audio')
os.makedirs(OUT, exist_ok=True)
mix = np.zeros((N, 2))
CUES = []

def t_(d): return np.arange(int(SR * d)) / SR

def place(sig, at, gain=1.0, pan=0.0, name=None):
    if name: CUES.append((at, name))
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
        sig = np.stack([sig * l * 1.414, sig * r * 1.414], 1)
    i = int(at * SR); j = min(N, i + len(sig))
    if j > i: mix[i:j] += sig[:j - i] * gain

def lp(x, a):  # one-pole lowpass, a in (0,1)
    from itertools import accumulate
    y = np.empty_like(x); s = 0.0
    for k in range(len(x)):
        s += a * (x[k] - s); y[k] = s
    return y

def lp_fast(x, cutoff):
    # FFT brickwall-ish smooth lowpass
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= 1 / (1 + (f / cutoff) ** 4)
    return np.fft.irfft(X, len(x))

def bp_fast(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X *= (1 / (1 + (f / hi) ** 4)) * (1 / (1 + (lo / np.maximum(f, 1)) ** 4))
    return np.fft.irfft(X, len(x))

def env_exp(n, tau): return np.exp(-np.arange(n) / (SR * tau))

def sub_impact(d=3.0, f0=62, f1=32):
    t = t_(d); f = f1 + (f0 - f1) * np.exp(-t * 6)
    ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * env_exp(len(t), 0.9)
    click = lp_fast(rng.standard_normal(len(t)), 2500) * env_exp(len(t), 0.012) * 0.6
    body = lp_fast(rng.standard_normal(len(t)), 180) * env_exp(len(t), 0.35) * 2.0
    s = s + click + body
    att = np.minimum(1, t / 0.004)
    return np.tanh(s * att * 1.4)

def whoosh(d=1.6, f_lo=300, f_hi=5000, rise=True):
    n = int(SR * d); t = np.arange(n) / SR
    noise = rng.standard_normal(n)
    out = np.zeros(n); seg = 2048
    for k in range(0, n, seg):
        p = k / n; p = p if rise else 1 - p
        c = f_lo * (f_hi / f_lo) ** p
        blk = noise[k:k + seg]
        out[k:k + seg] = bp_fast(blk, c * 0.5, c * 1.6) if len(blk) > 64 else 0
    out = lp_fast(out, 9000)
    shape = np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5
    if rise: shape *= np.clip(t / d, 0, 1) ** 0.5
    return out * shape / (np.abs(out).max() + 1e-9)

def riser(d=2.5):
    t = t_(d); f = 120 * (8 ** (t / d))
    tone = sum(np.sin(2 * np.pi * np.cumsum(f * m) / SR) / m for m in (1, 1.5, 2.01))
    nz = whoosh(d, 200, 8000, True)
    e = (t / d) ** 2.2
    return (tone * 0.35 + nz * 0.8) * e

def crackle(d=0.8, density=300):
    n = int(SR * d); s = np.zeros(n)
    k = rng.integers(0, n, int(density * d))
    s[k] = rng.uniform(-1, 1, len(k))
    s = bp_fast(s, 1500, 9000) * 6
    buzz = np.sign(np.sin(2 * np.pi * 120 * t_(d))) * 0.08 * (rng.random(n) > 0.6)
    e = np.sin(np.pi * np.arange(n) / n) ** 0.5
    return np.clip((s + bp_fast(buzz, 200, 4000)) * e, -1, 1)

def click(f=3200):
    t = t_(0.06)
    return (np.sin(2 * np.pi * f * t) * 0.5 + lp_fast(rng.standard_normal(len(t)), 7000)) * env_exp(len(t), 0.006)

def servo(d=0.45):
    t = t_(d); f = 180 + 90 * np.sin(np.pi * t / d)
    s = np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.3
    s = bp_fast(s, 300, 3000) * np.sin(np.pi * t / d) ** 0.6
    s[-len(click()):] += click(2600) * 0.8
    return s

def blip(f=1800, d=0.25):
    t = t_(d)
    return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2.003 * t)) * env_exp(len(t), 0.06) * np.minimum(1, t / 0.002)

def pulse_travel(d=0.9, f0=600, f1=2400):
    t = t_(d); f = f0 * (f1 / f0) ** (t / d)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.sin(np.pi * t / d) ** 2
    return s

def pad(d):
    t = t_(d); s = np.zeros((len(t), 2))
    for i, fr in enumerate((55, 82.4, 110, 164.8, 220.3, 329.6)):
        lfo = 0.6 + 0.4 * np.sin(2 * np.pi * (0.05 + 0.03 * i) * t + i)
        for ch, det in enumerate((-0.15, 0.15)):
            s[:, ch] += np.sin(2 * np.pi * (fr + det * (i + 1)) * t + i) * lfo / (1 + i * 0.6)
    air = np.stack([lp_fast(rng.standard_normal(len(t)), 1200), lp_fast(rng.standard_normal(len(t)), 1200)], 1) * 0.25
    return s + air

# ---- bed
bed = pad(DUR)
fade = np.ones(N); fi = int(SR * 3); fade[:fi] = np.linspace(0, 1, fi) ** 2
fo0 = int(SR * 40.0); fade[fo0:] = np.linspace(1, 0, N - fo0) ** 1.5
dyn = np.interp(np.arange(N) / SR, [0, 6, 15, 25, 36, 40, 42], [0.6, 0.8, 0.5, 0.7, 0.85, 0.5, 0])
place(bed * (fade * dyn)[:, None] * 0.09, 0, name='Atmospheric drone/pad bed fades in')

# ---- Scene 1 Reveal 0-6
place(blip(2400, 1.2) * 0.5, 0.6, 0.35, 0, 'Blue point light appears (shimmer ping)')
place(whoosh(4.0, 150, 1500, True), 1.4, 0.25, -0.4, 'Rim light sweep (slow filtered air)')
place(sub_impact(3.0, 50, 30), 4.4, 0.45, 0, 'Logo resolves (soft sub)')
place(riser(1.6), 4.4, 0.35, 0, 'Riser into Network')
# ---- Scene 2 Network 6-15
place(sub_impact(), 6.0, 0.85, 0, 'SCENE 2 cut: sub impact')
place(whoosh(1.4, 400, 4000, False), 6.0, 0.4, 0.5, 'Camera arc whoosh')
for i, at in enumerate((7.0, 7.35, 7.7, 8.05)):
    place(servo(), at, 0.35, -0.6 + 0.4 * i, 'Antenna servo + latch click %d' % (i + 1))
place(crackle(0.9, 400), 8.6, 0.35, -0.3, 'Network rings activate (electrical crackle)')
place(sub_impact(1.5, 80, 45), 10.0, 0.4, 0.3, 'Laptop appears on pedestal (thud)')
place(crackle(1.6, 900) * 0.8 + 0, 11.0, 0.4, 0.2, 'Energy connection laptop->router (zap)')
place(pulse_travel(1.4, 300, 1800), 11.0, 0.25, 0, None)
for i, at in enumerate((12.8, 13.1, 13.4)):
    place(blip(1400 + 300 * i, 0.3), at, 0.3, -0.5 + 0.5 * i, 'Holo info panel blip %d' % (i + 1))
place(riser(1.5), 13.5, 0.45, 0, 'Riser into Technology')
place(whoosh(1.3, 300, 9000, True), 13.8, 0.6, 0, 'Fly-through into Wi-Fi symbol whoosh')
# ---- Scene 3 Technology 15-25
place(sub_impact(3.5, 70, 28), 15.0, 0.9, 0, 'SCENE 3 cut: deep impact (network space)')
place(whoosh(2.5, 3000, 200, True), 15.0, 0.35, -0.3, 'Network space tail')
for i, at in enumerate((17.0, 18.0, 19.0)):
    place(pulse_travel(0.9, 500, 2600), at, 0.3, -0.6 + 0.3 * i, 'DHCP request pulse %d (outbound)' % (i + 1))
    place(click(2000), at, 0.3, 0, None)
place(pulse_travel(1.2, 3000, 700), 21.3, 0.35, 0.4, 'DHCP ACK pulse returns (inbound)')
place(blip(988, 0.8) * 0.8 + 0, 22.5, 0.35, 0, 'Lease confirmed chime')
place(blip(1480, 0.8), 22.62, 0.25, 0, None)
place(crackle(0.6, 500), 22.5, 0.2, 0, None)
place(riser(1.6), 23.4, 0.45, 0, 'Riser into Product')
place(whoosh(1.0, 6000, 400, True), 24.4, 0.4, 0, 'Exit whoosh')
# ---- Scene 4 Product 25-36
place(sub_impact(2.0, 60, 40), 25.0, 0.6, 0, 'SCENE 4 cut: app reveal')
place(whoosh(2.2, 200, 2000, True), 26.0, 0.25, 0.4, 'Slow camera push')
place(click(1800) * 1.5, 29.0, 0.6, 0, 'SWITCH IP press (UI click)')
place(sub_impact(1.8, 90, 40), 29.05, 0.55, 0, 'SWITCH IP press thump')
place(whoosh(0.8, 800, 6000, True), 28.4, 0.3, 0, None)
place(crackle(0.8, 300), 29.1, 0.15, 0.4, 'DHCP renew in progress (data crackle)')
place(blip(1175, 0.9), 32.5, 0.35, -0.2, 'Results: IP changed chime')
place(blip(1760, 0.9), 32.6, 0.28, 0.2, None)
place(riser(1.8), 34.2, 0.45, 0, 'Riser into Brand')
# ---- Scene 5 Brand 36-42
place(whoosh(2.0, 5000, 150, True), 36.0, 0.45, 0, 'SCENE 5 pull-back whoosh')
place(sub_impact(2.5, 55, 35), 36.0, 0.55, 0, 'SCENE 5 cut: sub')
place(crackle(1.2, 500), 36.8, 0.3, 0, 'Blue energy ring ignites')
place(sub_impact(2.0, 70, 45), 38.0, 0.35, 0, 'YOUR NETWORK. YOUR CONTROL. (soft hit)')
hit = sub_impact(4.5, 75, 26)
tail = pad(4.5)[:, 0] * env_exp(int(SR * 4.5), 1.3) * 0.4
shim = sum(np.sin(2 * np.pi * f * t_(4.5)) for f in (659, 988, 1319)) * env_exp(int(SR * 4.5), 0.9) * 0.15
place(hit + tail + shim, 39.6, 1.0, 0, 'FINAL LOGO HIT "IP SHIFT" with tail')
CUES.append((40.5, 'Fade to black, audio tail to silence'))

# ---- master: gentle bus compression via tanh, normalize loudness
mix *= np.linspace(1, 1, N)[:, None]
mix[-int(SR * 0.3):] *= np.linspace(1, 0, int(SR * 0.3))[:, None]

def write(path, x):
    y = np.clip(x, -1, 1)
    d = (y * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(d.tobytes())

def lufs(path):
    r = subprocess.run(['/opt/homebrew/bin/ffmpeg', '-nostats', '-i', path, '-af', 'ebur128', '-f', 'null', '-'], capture_output=True, text=True).stderr
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1])

target_peak = 10 ** (-1.2 / 20)
out = os.path.join(OUT, 'ip_shift_launch_mix.wav')
g = 1.0
for it in range(4):
    m = mix * g
    m = np.tanh(m / target_peak * 0.9) * target_peak  # soft limiter keeps peak < -1 dBFS
    write(out, m)
    L = lufs(out)
    print('pass', it, 'LUFS', L, 'peak dBFS', 20 * np.log10(np.abs(m).max()))
    if abs(L + 16) < 0.5: break
    g *= 10 ** ((-16 - L) / 20)
with open(os.path.join(OUT, 'cue_sheet.csv'), 'w') as f:
    f.write('time_s,cue\n')
    for at, nm in sorted(CUES): f.write('%.2f,"%s"\n' % (at, nm))
print('wrote', out)
